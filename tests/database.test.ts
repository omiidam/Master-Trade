import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  DIALECTS,
  INITIAL_SCHEMA_TABLES,
  MIGRATIONS,
  OWNERSHIP,
  SCHEMA,
  SCHEMA_BY_TABLE,
  applyMigrations,
  assertMigrationCoverage,
  assertValidSchema,
  checksumOf,
  columnNames,
  createSchemaSql,
  decodeRow,
  describeOwnership,
  dialectFor,
  dropSchemaSql,
  entityFor,
  migrate,
  migrationPlan,
  openSqlite,
  orderedEntities,
  repositoryCoverage,
  rewritePlaceholders,
  schemaSubset,
  sqliteDriverInfo,
  tablesInCreationOrder,
  validateMigrationRegistry,
  validateOwnership,
  validateSchema,
  type EntityDefinition,
  type Migration,
  type SqlExecutor,
  type TableName,
} from '../src/db/index.js';
import { encodeValue, decodeValue } from '../src/db/dialect.js';
import { openInMemorySqlite } from '../src/db/sqlite.js';
import { openPostgres, type PgQueryable } from '../src/db/postgres.js';
import { PolicyViolationError } from '../packages/shared/src/core/errors.js';

const driver = sqliteDriverInfo();
const withDatabase = driver.available ? it : it.skip;

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'master-trade-db-'));
  tempDirs.push(dir);
  return join(dir, 'master-trade.db');
}

/** A migrated in-memory database, or a clear failure if the driver is missing. */
async function migratedDatabase(): Promise<SqlExecutor> {
  const db = openInMemorySqlite();
  await migrate(db);
  return db;
}

describe('schema declarations', () => {
  it('are internally consistent', () => {
    expect(validateSchema()).toEqual([]);
    expect(() => assertValidSchema()).not.toThrow();
  });

  it('declare every table from the Phase 2 entity overview', () => {
    expect(SCHEMA).toHaveLength(23);
    expect(SCHEMA.map((entity) => entity.table)).toContain('audit_records');
    expect(SCHEMA.map((entity) => entity.table)).toContain('memory_records');
    // Phase 5.2 added the append-only Trading Context history.
    expect(SCHEMA.map((entity) => entity.table)).toContain('trading_context_versions');
    for (const entity of SCHEMA) {
      expect(entity.description.length).toBeGreaterThan(10);
      expect(entity.columns.some((column) => column.primaryKey === true)).toBe(true);
    }
  });

  it('give every table a repository and exactly one owner', () => {
    const coverage = repositoryCoverage();
    expect(coverage.missing).toEqual([]);
    expect(coverage.duplicated).toEqual([]);
    expect(coverage.mismatched).toEqual([]);
  });

  it('reject a declaration with a dangling reference, a missing key or a secret column', () => {
    const base = entityFor('users');
    expect(
      validateSchema([
        {
          ...base,
          columns: [
            { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
            {
              name: 'owner_id',
              type: 'uuid',
              nullable: false,
              references: { table: 'nope' as TableName },
            },
            { name: 'api_key', type: 'text', nullable: true },
          ],
        },
      ]).map((issue) => issue.problem),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('unknown table'),
        expect.stringContaining('looks like a stored secret'),
      ]),
    );

    const noKey: EntityDefinition = {
      table: 'settings',
      kind: 'persistent',
      description: 'test',
      columns: [{ name: 'value', type: 'text', nullable: false }],
    };
    expect(validateSchema([noKey]).map((issue) => issue.problem)).toContain(
      'expected exactly one primary key, found 0',
    );
  });

  it('forbid a persistent table pointing at transient data', () => {
    const issues = validateSchema([
      entityFor('users'),
      {
        table: 'jobs',
        kind: 'transient',
        description: 'test transient',
        columns: [
          { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
          { name: 'updated_at', type: 'timestamp', nullable: false },
        ],
      } as EntityDefinition,
      {
        table: 'approvals',
        kind: 'persistent',
        description: 'test persistent',
        columns: [
          { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
          { name: 'requested_by', type: 'uuid', nullable: false, references: { table: 'users' } },
          {
            name: 'decided_by',
            type: 'uuid',
            nullable: true,
            references: { table: 'jobs' },
          },
          { name: 'rationale', type: 'text', nullable: false },
          { name: 'status', type: 'text', nullable: false },
          { name: 'expires_at', type: 'timestamp', nullable: false },
        ],
      } as EntityDefinition,
    ]);
    expect(issues.map((issue) => issue.problem)).toContain(
      'persistent table references transient table "jobs"',
    );
  });

  it('keep the governance rules in the schema itself', () => {
    const approximations = entityFor('approvals').checks ?? [];
    expect(approximations.join(' ')).toContain('decided_by <> requested_by');
    expect(approximations.join(' ')).toContain("status <> 'approved' OR decided_by IS NOT NULL");

    const memory = entityFor('memory_records').checks ?? [];
    expect(memory.join(' ')).toContain('verified_by IS NOT NULL');

    const rules = entityFor('trading_rules').checks ?? [];
    expect(rules.join(' ')).toContain("status <> 'active' OR activation_approval_id IS NOT NULL");

    const bars = entityFor('market_data_bars').columns.find(
      (column) => column.name === 'provenance',
    );
    expect(bars?.values).toEqual(['synthetic', 'historical']);
    expect(bars?.values).not.toContain('live');
  });
});

describe('data ownership rules', () => {
  it('cover every table exactly once and agree with the schema', () => {
    expect(validateOwnership()).toEqual([]);
  });

  it('keep the audit trail append-only, memory history append-only, and transient data out of the backup set', () => {
    const byTable = new Map(OWNERSHIP.map((rule) => [rule.table, rule]));
    expect(byTable.get('audit_records')?.mutability).toBe('append-only');
    expect(byTable.get('memory_versions')?.mutability).toBe('append-only');
    expect(byTable.get('messages')?.mutability).toBe('append-only');
    expect(byTable.get('rule_evaluations')?.mutability).toBe('append-only');
    expect(byTable.get('memory_records')?.mutability).toBe('tombstone');

    const transient = SCHEMA.filter((entity) => entity.kind === 'transient').map((e) => e.table);
    expect(transient).toEqual(['sessions', 'job_scratch']);
    for (const table of transient) {
      expect(byTable.get(table)?.backup).toBe('not-backed-up');
      expect(describeOwnership()).toContain(table);
      expect(columnNames(table).length).toBeGreaterThan(0);
    }
  });

  it('detect a table with no rule, a double rule and a mutable audit trail', () => {
    const duplicated = OWNERSHIP[0]!;
    const rules = OWNERSHIP.map((rule) =>
      rule.table === 'audit_records' ? { ...rule, mutability: 'mutable' as const } : rule,
    )
      .filter((rule) => rule.table !== 'files')
      .concat([duplicated]);

    const problems = validateOwnership(rules).map((issue) => `${issue.table}: ${issue.problem}`);
    expect(problems).toContain('audit_records: the audit trail must be append-only');
    expect(problems).toContain('users: table has more than one ownership rule');
    expect(problems).toContain('files: table has no ownership rule');
  });

  it('rejects a transient table that claims to be backed up', () => {
    const rules = OWNERSHIP.map((rule) =>
      rule.table === 'sessions' ? { ...rule, backup: 'backed-up' as const } : rule,
    );
    const problems = validateOwnership(rules).map((issue) => `${issue.table}: ${issue.problem}`);
    expect(problems).toContain('sessions: transient data must not be in the backup set');
  });
});

describe('dialects and DDL', () => {
  it('maps the same declaration to each engine’s storage types', () => {
    const sqlite = createSchemaSql(DIALECTS.sqlite).join('\n');
    const postgres = createSchemaSql(DIALECTS.postgres).join('\n');

    // A JSON column, a boolean column and a timestamp column, in each engine.
    expect(sqlite).toContain('"content" TEXT NOT NULL');
    expect(postgres).toContain('"content" JSONB NOT NULL');
    expect(sqlite).toContain('"passed" INTEGER NOT NULL');
    expect(postgres).toContain('"passed" BOOLEAN NOT NULL');
    expect(sqlite).toContain('"created_at" TEXT NOT NULL');
    expect(postgres).toContain('"created_at" TIMESTAMPTZ NOT NULL');

    // Ids are prefixed strings, not UUIDs: a native UUID column would reject them.
    expect(postgres).not.toMatch(/"id" UUID/);
    expect(sqlite).toMatch(/"id" TEXT PRIMARY KEY/);
  });

  it('keeps every constraint on both engines', () => {
    for (const dialect of Object.values(DIALECTS)) {
      const sql = createSchemaSql(dialect).join('\n');
      expect(sql).toContain('CHECK ("trust" IN');
      expect(sql).toContain('ON DELETE CASCADE');
      expect(sql).toContain('ON DELETE RESTRICT');
      expect(sql).toContain('UNIQUE');
    }
  });

  it('emits tables in dependency order so PostgreSQL can create them', () => {
    const order = tablesInCreationOrder();
    const position = (table: TableName): number => order.indexOf(table);
    // Parents before children, including the references added in this phase.
    expect(position('users')).toBeLessThan(position('sessions'));
    expect(position('approvals')).toBeLessThan(position('trading_rules'));
    expect(position('jobs')).toBeLessThan(position('rule_evaluations'));
    expect(position('memory_records')).toBeLessThan(position('memory_versions'));
    expect(order).toHaveLength(SCHEMA.length);
    // Drops run the other way round.
    const drops = dropSchemaSql(DIALECTS.sqlite);
    expect(drops[0]).toContain('DROP TABLE IF EXISTS "trading_context_versions"');
    expect(drops.at(-1)).toContain('DROP TABLE IF EXISTS "users"');
  });

  it('rewrites placeholders without touching string literals or identifiers', () => {
    expect(rewritePlaceholders('SELECT * FROM t WHERE a = ? AND b = ?')).toBe(
      'SELECT * FROM t WHERE a = $1 AND b = $2',
    );
    expect(
      rewritePlaceholders('SELECT \'?\' AS q, "a?b" FROM t WHERE x = ? -- ? in a comment'),
    ).toBe('SELECT \'?\' AS q, "a?b" FROM t WHERE x = $1 -- ? in a comment');
    expect(DIALECTS.sqlite.prepare('SELECT ?')).toBe('SELECT ?');
    expect(dialectFor('postgres').prepare('SELECT ?')).toBe('SELECT $1');
  });

  it('normalizes values so both engines hand back the same shape', () => {
    const boolColumn = entityFor('exam_attempts').columns.find(
      (column) => column.name === 'passed',
    )!;
    expect(encodeValue(boolColumn, true)).toBe(1);
    expect(decodeValue(boolColumn, 1)).toBe(true);
    expect(decodeValue(boolColumn, true)).toBe(true);

    const jsonColumn = entityFor('lessons').columns.find((column) => column.name === 'content')!;
    expect(encodeValue(jsonColumn, { a: [1, 2] })).toBe('{"a":[1,2]}');
    expect(decodeValue(jsonColumn, '{"a":[1,2]}')).toEqual({ a: [1, 2] });
    expect(decodeValue(jsonColumn, { a: 1 })).toEqual({ a: 1 });

    const timeColumn = entityFor('users').columns.find((column) => column.name === 'created_at')!;
    expect(decodeValue(timeColumn, '2026-09-19 19:00:00+00')).toBe('2026-09-19T19:00:00.000Z');
    expect(decodeValue(timeColumn, '2026-09-19T19:00:00.000Z')).toBe('2026-09-19T19:00:00.000Z');
  });
});

describe('migration registry', () => {
  it('creates every declared table exactly once across the migrations', () => {
    // The invariant the frozen 0001 list makes possible: a declaration cannot exist
    // without a migration, and two migrations cannot both claim a table.
    expect(() => assertMigrationCoverage()).not.toThrow();

    expect(() =>
      assertMigrationCoverage(
        MIGRATIONS.map((migration) => ({
          ...migration,
          tables: migration.tables?.filter((table) => table !== 'trading_context_versions'),
        })),
      ),
    ).toThrow(/trading_context_versions/);

    expect(() =>
      assertMigrationCoverage([
        { ...MIGRATIONS[0]!, tables: INITIAL_SCHEMA_TABLES },
        { ...MIGRATIONS[1]!, tables: ['users'] },
      ]),
    ).toThrow(/created by both/);
  });

  it('keeps 0001 frozen, so an added table cannot change an applied migration', () => {
    // If 0001 were generated from the whole schema, adding a table anywhere would
    // change its statements — and every existing database would then refuse to
    // migrate, reporting the change as tampering.
    for (const dialect of Object.values(DIALECTS)) {
      const statements = MIGRATIONS[0]!.up(dialect).join('\n');
      expect(statements).not.toContain('trading_context_versions');
      expect(statements).toContain('"users"');
    }
    expect(INITIAL_SCHEMA_TABLES).not.toContain('trading_context_versions');

    // The new table is created by the migration that declares it, and by no other.
    for (const dialect of Object.values(DIALECTS)) {
      const added = MIGRATIONS[1]!.up(dialect).join('\n');
      expect(added).toContain('"trading_context_versions"');
      expect(added).not.toContain('"memory_records"');
    }
    expect(schemaSubset(['trading_context_versions'])).toHaveLength(1);
  });

  it('validates ids, versions and per-dialect statements', () => {
    expect(() => validateMigrationRegistry()).not.toThrow();
    expect(MIGRATIONS.map((migration) => migration.version)).toEqual([1, 2]);
    expect(() => assertMigrationCoverage()).not.toThrow();
    expect(() =>
      validateMigrationRegistry([
        MIGRATIONS[0]!,
        { ...MIGRATIONS[0]!, id: '0002_duplicate_version', version: 1 },
      ]),
    ).toThrow(/Duplicate migration version/);
    expect(() =>
      validateMigrationRegistry([
        {
          id: '0001_empty',
          version: 1,
          description: 'no statements',
          up: () => [],
          down: () => [],
        },
      ]),
    ).toThrow(/no statements for sqlite/);
  });

  it('checksums the statements that were applied, not the file', () => {
    const migration = MIGRATIONS[0]!;
    const sqlite = checksumOf(DIALECTS.sqlite, migration);
    const postgres = checksumOf(DIALECTS.postgres, migration);
    expect(sqlite).toHaveLength(64);
    // A database is one engine, so the checksum is per engine and stable.
    expect(checksumOf(DIALECTS.sqlite, migration)).toBe(sqlite);
    expect(postgres).not.toBe(sqlite);
    expect(checksumOf(DIALECTS.sqlite, { ...migration, up: () => ['SELECT 1'] })).not.toBe(sqlite);
  });
});

describe('kept out of the database layer', () => {
  it('no driver is imported outside src/db, and no SQL is written outside it either', async () => {
    const { readFile, readdir } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const { relative } = await import('node:path');
    const root = fileURLToPath(new URL('../src', import.meta.url));
    const offenders: string[] = [];
    const sqlOffenders: string[] = [];
    const sqlPattern =
      /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE|DROP TABLE)\b[\s'"`(]/;

    const walk = async (dir: string): Promise<string[]> => {
      const entries = await readdir(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const child = join(dir, entry.name);
        if (entry.isDirectory()) files.push(...(await walk(child)));
        else if (entry.name.endsWith('.ts')) files.push(child);
      }
      return files;
    };

    for (const path of await walk(root)) {
      const relativePath = relative(root, path).replace(/\\/g, '/');
      if (relativePath.startsWith('db/')) continue;
      const source = await readFile(path, 'utf8');
      if (/from '(better-sqlite3|pg|node:sqlite|sqlite3|mysql2)'/.test(source)) {
        offenders.push(relativePath);
      }
      if (sqlPattern.test(source)) sqlOffenders.push(relativePath);
    }

    expect(offenders).toEqual([]);
    expect(sqlOffenders).toEqual([]);
  });

  it('the repositories never mention a driver, a connection string or a query builder', () => {
    const dir = join(process.cwd(), 'src', 'db', 'repositories');
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), 'utf8');
      expect(source).not.toMatch(/better-sqlite3|from 'pg'|node:sqlite|drizzle|knex|sequelize/);
    }
  });
});

describe('migrations against a real database', () => {
  withDatabase('create the schema, record the ledger and stay idempotent', async () => {
    const db = openInMemorySqlite();
    try {
      const plan = await migrationPlan(db);
      expect(plan.pending).toHaveLength(2);
      expect(plan.upToDate).toBe(false);

      const report = await migrate(db);
      expect(report.appliedNow).toEqual([1, 2]);
      expect(report.upToDate).toBe(true);
      expect(report.applied[0]?.checksum).toHaveLength(64);

      const tables = await db.queryAll(
        `SELECT "name" FROM "sqlite_master" WHERE "type" = 'table' AND "name" NOT LIKE 'sqlite_%' ORDER BY "name"`,
      );
      const names = tables.map((row) => String(row.name));
      for (const entity of SCHEMA) expect(names).toContain(entity.table);
      expect(names).toContain('schema_migrations');

      // Indexes were created too, including the unique ones that encode rules.
      const indexes = await db.queryAll(
        `SELECT "name" FROM "sqlite_master" WHERE "type" = 'index'`,
      );
      const indexNames = indexes.map((row) => String(row.name));
      expect(indexNames).toContain('approvals_subject_idx');
      expect(indexNames).toContain('memory_versions_record_index_idx');

      const second = await migrate(db);
      expect(second.appliedNow).toEqual([]);
      expect(second.applied).toHaveLength(2);
    } finally {
      await db.close();
    }
  });

  withDatabase('refuse a database that is newer than the build', async () => {
    const db = await migratedDatabase();
    try {
      await db.execute(
        `INSERT INTO "schema_migrations" ("version", "id", "checksum", "applied_at", "execution_ms") VALUES (?, ?, ?, ?, ?)`,
        [99, '0099_from_the_future', 'deadbeef', new Date().toISOString(), 1],
      );
      const plan = await migrationPlan(db);
      expect(plan.unknown.map((entry) => entry.id)).toEqual(['0099_from_the_future']);
      await expect(migrate(db)).rejects.toThrow(/does not know/);
    } finally {
      await db.close();
    }
  });

  withDatabase('refuse a migration that changed after it was applied', async () => {
    const db = await migratedDatabase();
    try {
      // The real ledger must be complete here: an artificial subset would be
      // refused as "newer than the build" before the checksum comparison this
      // test is about ever runs. The fake is held in a named constant so the two
      // arrays cannot drift to different entries.
      const invented: Migration = {
        id: '0003_add_something',
        version: 3,
        description: 'a migration that will be edited after being applied',
        up: () => ['CREATE TABLE "later_table" ("id" TEXT PRIMARY KEY)'],
        down: () => ['DROP TABLE "later_table"'],
      };
      await migrate(db, { migrations: [...MIGRATIONS, invented] });

      const edited = [
        ...MIGRATIONS,
        {
          ...invented,
          up: () => ['CREATE TABLE "later_table" ("id" TEXT PRIMARY KEY, "extra" TEXT)'],
        },
      ];
      const plan = await migrationPlan(db, { migrations: edited });
      expect(plan.tampered.map((entry) => entry.id)).toEqual(['0003_add_something']);
      await expect(migrate(db, { migrations: edited })).rejects.toThrow(
        /changed after being applied/,
      );
    } finally {
      await db.close();
    }
  });

  withDatabase('enforce foreign keys, checks and the trust rules in SQL', async () => {
    const db = await migratedDatabase();
    try {
      const now = new Date().toISOString();
      // A session for a user who does not exist: refused by the engine, not by us.
      await expect(
        db.execute(
          `INSERT INTO "sessions" ("id", "user_id", "token_hash", "roles", "issued_at", "expires_at") VALUES (?, ?, ?, ?, ?, ?)`,
          ['sess_1', 'usr_missing', 'a'.repeat(64), '[]', now, now],
        ),
      ).rejects.toThrow();

      await db.execute(
        `INSERT INTO "users" ("id", "display_name", "timezone", "experience_level", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?)`,
        ['usr_1', 'learner', 'UTC', 'beginner', now, now],
      );

      // An approval claiming to be approved with no decider is unrepresentable.
      await expect(
        db.execute(
          `INSERT INTO "approvals" ("id", "operation", "subject_ref", "requested_by", "status", "rationale", "evidence", "expires_at", "created_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ['appr_1', 'rule.activate', 'rule_1', 'usr_1', 'approved', 'why', '[]', now, now],
        ),
      ).rejects.toThrow();

      // Self-approval is rejected by the database.
      await expect(
        db.execute(
          `INSERT INTO "approvals" ("id", "operation", "subject_ref", "requested_by", "decided_by", "status", "rationale", "evidence", "decided_at", "expires_at", "created_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            'appr_2',
            'rule.activate',
            'rule_1',
            'usr_1',
            'usr_1',
            'approved',
            'why',
            '[]',
            now,
            now,
            now,
          ],
        ),
      ).rejects.toThrow();

      // A verified memory record needs a verifier.
      await expect(
        db.execute(
          `INSERT INTO "memory_records" ("id", "type", "text", "provenance_source", "provenance_ref", "trust", "epistemic_kind", "version", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ['mem_1', 'lesson-note', 'text', 'user', 'ref', 'verified', 'fact', 1, now, now],
        ),
      ).rejects.toThrow();

      // Live market data has no representation at all.
      await expect(
        db.execute(
          `INSERT INTO "market_data_bars" ("id", "symbol", "timeframe", "provenance", "source", "time", "open", "high", "low", "close", "volume") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ['bar_1', 'AAPL', '1d', 'live', 'provider', now, 1, 2, 0.5, 1.5, 10],
        ),
      ).rejects.toThrow();

      // A rule cannot be active without citing an approval.
      await expect(
        db.execute(
          `INSERT INTO "trading_rules" ("id", "proposed_by", "rule_text", "hypothesis", "status", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ['rule_1', 'usr_1', 'rule', 'hypothesis', 'active', now, now],
        ),
      ).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  withDatabase('persists across a reopen (the file is the record)', async () => {
    const file = tempFile();
    const first = openSqlite({ file });
    const report = await migrate(first);
    expect(report.appliedNow).toEqual([1, 2]);
    await first.execute(
      `INSERT INTO "users" ("id", "display_name", "timezone", "experience_level", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?)`,
      [
        'usr_persisted',
        'learner',
        'UTC',
        'beginner',
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );
    await first.close();

    const second = openSqlite({ file });
    try {
      const rows = await second.queryAll(`SELECT "display_name" FROM "users" WHERE "id" = ?`, [
        'usr_persisted',
      ]);
      expect(rows).toHaveLength(1);
      const plan = await migrationPlan(second);
      expect(plan.upToDate).toBe(true);
      // The file survives with its schema and its ledger intact.
      expect(plan.applied[0]?.id).toBe('0001_initial_schema');
    } finally {
      await second.close();
    }
  });
});

describe('PostgreSQL production mode', () => {
  it('sends $n placeholders, JSONB and TIMESTAMPTZ through an injected client', async () => {
    const seen: { text: string; params: readonly unknown[] }[] = [];
    const client: PgQueryable = {
      query: async (text, params) => {
        seen.push({ text, params: params ?? [] });
        return { rows: [], rowCount: 0 };
      },
    };
    const db = openPostgres({ client, description: 'postgres:test-db' });
    expect(db.description).toBe('postgres:test-db');

    await db.execute('UPDATE "jobs" SET "status" = ? WHERE "id" = ?', ['running', 'job_1']);
    expect(seen[0]?.text).toBe('UPDATE "jobs" SET "status" = $1 WHERE "id" = $2');
    expect(seen[0]?.params).toEqual(['running', 'job_1']);

    // Applying the migration through the injected client proves the production
    // path end to end: the same registry, the same repositories, different SQL.
    const report = await migrate(db);
    expect(report.appliedNow).toEqual([1, 2]);
    const ddl = seen.map((entry) => entry.text).join('\n');
    expect(ddl).toContain('JSONB');
    expect(ddl).toContain('TIMESTAMPTZ');
    expect(ddl).toContain('BOOLEAN');
    expect(ddl).toContain('CHECK ("trust" IN');
    // No placeholder survived the rewrite, and the ledger insert is positional.
    expect(ddl).not.toMatch(/=\s*\?/);
    expect(seen.every((entry) => !entry.text.includes('?'))).toBe(true);
    expect(seen.some((entry) => entry.text.includes('$1'))).toBe(true);
  });

  it('refuses a nested transaction rather than flattening it', async () => {
    const db = openPostgres({
      client: { query: async () => ({ rows: [], rowCount: 0 }) },
      description: 'postgres:test-db',
    });
    await expect(
      db.transaction(async (tx) => {
        await tx.transaction(async () => undefined);
      }),
    ).rejects.toThrow(/Nested transactions/);
  });

  it('refuses to open without a client', () => {
    expect(() => openPostgres({ client: undefined as never, description: 'x' })).toThrow(
      /query\(\) method is required/,
    );
  });
});

describe('entity lookups', () => {
  it('expose the declared columns for typing and diagnostics', () => {
    expect(SCHEMA_BY_TABLE.memory_records.columns.map((column) => column.name)).toContain(
      'verified_by',
    );
    expect(columnNames('audit_records')).toContain('correlation_id');
    expect(orderedEntities()).toHaveLength(SCHEMA.length);
  });

  it('decode a row through the schema types', () => {
    const entity = entityFor('jobs');
    const decoded = decodeRow<{
      attempts: number;
      available_at: string;
      payload: unknown;
      lease_until: string | null;
    }>(entity, {
      id: 'job_1',
      attempts: 3,
      available_at: '2026-09-19T00:00:00.000Z',
      payload: '{"kind":"embed"}',
      lease_until: null,
    });
    expect(decoded.attempts).toBe(3);
    expect(decoded.payload).toEqual({ kind: 'embed' });
    expect(decoded.lease_until).toBeNull();
  });

  it('refuses a policy violation as a typed error', () => {
    const error = new PolicyViolationError('nope');
    expect(error.code).toBe('POLICY_VIOLATION');
    expect(error.status).toBe(451);
  });
});

// `applyMigrations` is an alias kept for a descriptive import in the docs; using
// it here proves the export surface stays stable.
describe('public surface', () => {
  it('exports the migration entry point under a readable name', () => {
    expect(typeof applyMigrations).toBe('function');
  });
});
