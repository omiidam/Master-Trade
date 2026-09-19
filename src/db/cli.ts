/**
 * Database CLI.
 *
 *   node dist/db/cli.js migrate    — apply pending migrations
 *   node dist/db/cli.js status     — show the migration plan without changing anything
 *   node dist/db/cli.js ownership  — print the data ownership rules
 *   node dist/db/cli.js schema     — print the declared tables and their owners
 *
 * It is the operator's window into the database foundation: the same code path the
 * application uses (`openDatabase`), so "it worked in the CLI" means the server
 * will migrate identically. Nothing here can write application data — the CLI
 * only touches the schema and the ledger.
 */

import { loadConfigFromEnv } from '../config/loader.js';
import { DEFAULT_CONFIG } from '../core/config.js';
import { AppError } from '../core/errors.js';
import {
  assertDatabaseFoundation,
  databaseStatus,
  openDatabase,
  describeOwnership,
  describeMigrationStatus,
  migrationPlan,
  SCHEMA,
  tablesInCreationOrder,
  OWNERSHIP_BY_TABLE,
} from './index.js';
import { openSqlite } from './sqlite.js';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type Command = 'migrate' | 'status' | 'ownership' | 'schema' | 'help';

function parseArgs(argv: readonly string[]): { command: Command; file?: string; memory: boolean } {
  const [first] = argv;
  const command = (first ?? 'help') as Command;
  const fileIndex = argv.indexOf('--file');
  const file = fileIndex >= 0 ? argv[fileIndex + 1] : undefined;
  return {
    command: ['migrate', 'status', 'ownership', 'schema', 'help'].includes(command)
      ? command
      : 'help',
    ...(file === undefined ? {} : { file }),
    memory: argv.includes('--memory'),
  };
}

function configFor(file?: string) {
  try {
    return loadConfigFromEnv();
  } catch (error) {
    // An unsafe environment must not stop a read-only inspection command, but it
    // must be visible: the message says why the defaults were used.
    process.stderr.write(
      `configuration refused (${(error as Error).message}); using code defaults for this command\n`,
    );
    return file === undefined
      ? DEFAULT_CONFIG
      : { ...DEFAULT_CONFIG, database: { ...DEFAULT_CONFIG.database, file } };
  }
}

async function main(): Promise<number> {
  const { command, file, memory } = parseArgs(process.argv.slice(2));

  if (command === 'help') {
    process.stdout.write(
      [
        'Master Trade database',
        '',
        '  migrate      apply pending migrations',
        '  status       show the migration plan (read-only)',
        '  ownership    print the data ownership and retention rules',
        '  schema       print declared tables in dependency order',
        '',
        'Options: --memory (in-memory database, nothing persisted), --file <path>',
        '',
      ].join('\n'),
    );
    return 0;
  }

  if (command === 'ownership') {
    process.stdout.write(
      [
        'table                  owner       mutability   retention         backup',
        describeOwnership(),
        '',
      ].join('\n'),
    );
    return 0;
  }

  if (command === 'schema') {
    const lines = tablesInCreationOrder().map(
      (table) => `${table}  [${OWNERSHIP_BY_TABLE[table]?.owner ?? 'unowned'}]`,
    );
    process.stdout.write([`${SCHEMA.length} tables in dependency order:`, ...lines, ''].join('\n'));
    return 0;
  }

  const config = configFor(file);
  const status = databaseStatus(config);
  process.stdout.write(`${status.engine}: ${status.detail}\n`);
  if (!status.driverAvailable) {
    if (status.hint) process.stdout.write(`${status.hint}\n`);
    return 2;
  }

  if (command === 'status') {
    const target = memory === true ? ':memory:' : resolve(file ?? config.database.file);
    const db = openSqlite({ file: target });
    try {
      const plan = await migrationPlan(db);
      process.stdout.write(`${target}: ${describeMigrationStatus(plan)}\n`);
      for (const entry of plan.applied) {
        process.stdout.write(`  applied ${entry.id} (v${entry.version}) at ${entry.appliedAt}\n`);
      }
      for (const migration of plan.pending) {
        process.stdout.write(
          `  pending ${migration.id} (v${migration.version}) — ${migration.description}\n`,
        );
      }
      return plan.unknown.length > 0 || plan.tampered.length > 0 ? 1 : 0;
    } finally {
      await db.close();
    }
  }

  assertDatabaseFoundation();
  const handle = await openDatabase({ config, ...(file === undefined ? {} : { file }), memory });
  try {
    process.stdout.write(`${handle.describe()}\n`);
    if (handle.report.appliedNow.length > 0) {
      process.stdout.write(`applied: ${handle.report.appliedNow.join(', ')}\n`);
    } else {
      process.stdout.write('nothing to apply\n');
    }
    return 0;
  } finally {
    await handle.close();
  }
}

/** Only boot when executed directly, so importing this module has no side effect. */
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      const appError = error instanceof AppError ? error : null;
      process.stderr.write(
        appError
          ? `${appError.code}: ${appError.message}\n`
          : `unexpected failure: ${(error as Error)?.message ?? String(error)}\n`,
      );
      process.exitCode = 1;
    });
}

export { main as runDatabaseCli };
