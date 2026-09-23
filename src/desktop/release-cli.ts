/**
 * `npm run release:*` — the release gate, on a machine that cannot build anything.
 *
 * Four commands, one binary, because they are four questions about the same tree:
 *
 *   | command             | question                                                        |
 *   | ------------------- | --------------------------------------------------------------- |
 *   | `version-check`     | does every file agree on one version?                            |
 *   | `version-sync`      | make them agree, from `package.json`                              |
 *   | `signing`           | is the update signing material usable?                          |
 *   | `qa`                | what is release-ready, and what can this host not validate?      |
 *   | `preflight`         | may this tree be packaged at all? (all of the above, plus more)  |
 *
 * **`preflight` fails closed.** It requires the run to *declare* itself a production release
 * (`MASTER_TRADE_ENVIRONMENT=production`) and refuses otherwise, because a preflight that
 * silently checks a development tree is a green light nobody earned. `--dev` asks for the
 * development report explicitly, on purpose, in writing.
 *
 * This is not `npm run desktop:verify`. That reports the state of the tree and is part of
 * `npm run validate`; this refuses to produce a release, and is not. The two share every rule
 * (see `packaging.ts` and `signing.ts`) and differ only in what failure means.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pendingVersionWrites, readVersionSurfaces, VERSION_SOURCE_PATH } from './version.js';
import { preflightPackaging, type PackagingCheck } from './packaging.js';
import { reviewSigning, type SigningAspect } from './signing.js';
import { DESKTOP_ENVIRONMENT_VAR, isProduction, resolveDesktopEnvironment } from './environment.js';
import { formatQaReport, runReleaseQa } from './release-qa.js';

const here = dirname(fileURLToPath(import.meta.url));
// dist/src/desktop/release-cli.js -> the repository root is three levels up.
const root = resolve(here, '..', '..', '..');

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function confPath(): string {
  return join(root, 'src-tauri', 'tauri.conf.json');
}

/**
 * One printable finding, so the marks and the totals come from the same list.
 *
 * They used to be computed separately — the marks from one array of checks and the summary line
 * from another — which printed "2 error(s)" above four FAIL lines. A count that does not describe
 * the output it sits under is worse than no count.
 */
interface Finding {
  id: string;
  mark: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
}

function printFinding(finding: Finding): void {
  console.log(`${finding.mark}  ${finding.id}\n      ${finding.detail}`);
}

function summarize(findings: readonly Finding[]): { errors: number; warnings: number } {
  return {
    errors: findings.filter((finding) => finding.mark === 'FAIL').length,
    warnings: findings.filter((finding) => finding.mark === 'WARN').length,
  };
}

function packagingFinding(check: PackagingCheck): Finding {
  return {
    id: check.id,
    mark: check.ok ? 'PASS' : check.severity === 'warning' ? 'WARN' : 'FAIL',
    detail: check.detail,
  };
}

/**
 * A signing aspect as a finding, where `blocking` is whether it *blocks this run*.
 *
 * The distinction is the mode: a placeholder key is a FAIL in a release preflight and a WARN in a
 * development report. Printing FAIL in both would make the mark contradict the exit code, and
 * printing WARN in both would hide the release blocker — so the mark follows the verdict, and the
 * detail still names the state.
 */
function signingFinding(aspect: SigningAspect, blocking: boolean): Finding {
  const suffix = aspect.blocksRelease && !blocking ? ' — blocks a production release' : '';
  return {
    id: aspect.id,
    mark: aspect.state === 'valid' ? 'PASS' : blocking ? 'FAIL' : 'WARN',
    detail: `${aspect.detail} (${aspect.state})${suffix}`,
  };
}

function commandVersionCheck(): number {
  const report = readVersionSurfaces({ root });
  console.log(`Application version: ${report.source ?? '(none)'}\n`);
  for (const entry of report.readings) {
    const agreed = entry.version === report.source;
    console.log(
      `${agreed ? 'PASS' : 'FAIL'}  ${entry.id}${entry.role === 'source' ? ' (source)' : ''}\n      ${entry.version ?? entry.problem ?? '(unreadable)'}`,
    );
  }
  if (report.ok) {
    console.log(`\n${report.readings.length} surfaces agree on ${report.source}`);
    return 0;
  }
  console.log(`\n${report.problems.join('\n')}`);
  console.log(
    `\nRun \`npm run release:sync-version\` to write ${report.source ?? 'the source version'} into every mirror.`,
  );
  return 1;
}

function commandVersionSync(): number {
  const { version, writes } = pendingVersionWrites({ root });
  if (writes.length === 0) {
    console.log(`Already in agreement on ${version}; nothing written.`);
    return 0;
  }
  for (const write of writes) {
    writeFileSync(write.path, write.text, 'utf8');
    console.log(`wrote ${version} to ${write.id}`);
  }
  // Re-read from disk rather than trusting the write: a rewrite that matched the wrong thing
  // would otherwise report success here and be caught much later.
  const after = readVersionSurfaces({ root });
  if (!after.ok) {
    console.log(`\nFAIL  the version is still inconsistent after writing:`);
    for (const entry of after.drift) {
      console.log(`      ${entry.id} says ${entry.version ?? entry.problem}`);
    }
    return 1;
  }
  console.log(`\n${after.readings.length} surfaces agree on ${after.source}`);
  return 0;
}

function commandSigning(): number {
  const environment = resolveDesktopEnvironment();
  const report = reviewSigning(readJson(confPath()), environment.environment);
  console.log(`Signing review — environment: ${environment.environment}\n`);

  const findings = report.aspects.map((aspect) =>
    signingFinding(aspect, aspect.blocksRelease && !report.relaxed),
  );
  for (const finding of findings) printFinding(finding);

  const { errors, warnings } = summarize(findings);
  console.log(
    `\nreleasable=${report.releasable} relaxed=${report.relaxed}${
      report.relaxed
        ? ' (a non-production run reports missing material and does not fail on it)'
        : ''
    }`,
  );
  console.log(`${findings.length} aspect(s): ${errors} blocker(s), ${warnings} reported`);
  if (errors > 0) {
    console.log(`\nA production release is refused:\n  - ${report.blockers.join('\n  - ')}`);
    return 1;
  }
  return 0;
}

function commandPreflight(args: string[]): number {
  const environment = resolveDesktopEnvironment();
  const developmentReport = args.includes('--dev');

  if (!developmentReport && !isProduction(environment.environment)) {
    console.log('Master Trade — release preflight\n');
    console.log(
      `FAIL  environment.not-a-release\n      a release preflight requires ${DESKTOP_ENVIRONMENT_VAR}=production ` +
        `(this run resolved to "${environment.environment}"${environment.declared ? '' : ', undeclared'}).\n` +
        '      Pass --dev for a development report, which reports release blockers as warnings.',
    );
    return 1;
  }

  const mode = developmentReport ? 'development' : 'release';
  const conf = readJson(confPath());

  console.log('Master Trade — release preflight\n');
  console.log(
    `Mode: ${mode}${developmentReport ? ' (--dev: release blockers are reported as warnings)' : ''}\n`,
  );

  const packaging = preflightPackaging({ root, mode, conf });
  const signing = reviewSigning(conf, environment.environment);

  const findings: Finding[] = [
    ...packaging.checks.map(packagingFinding),
    ...signing.aspects.map((aspect) =>
      signingFinding(aspect, aspect.blocksRelease && !developmentReport),
    ),
  ];
  for (const finding of findings) printFinding(finding);

  // The mode decides how a signing aspect is weighted here for the same reason it decides the
  // packaging ones: this is a *release* preflight, so an unusable key blocks it, while `--dev`
  // reports the identical fact as something to fix before a release exists.
  const { errors, warnings } = summarize(findings);
  console.log(`\n${findings.length} check(s): ${errors} error(s), ${warnings} warning(s)`);
  if (errors > 0) {
    console.log('\nThis tree is not releasable. Fix the FAIL lines above and run this again.');
    return 1;
  }
  console.log(
    `\n${mode === 'release' ? 'Releasable' : 'No release blockers found in a development tree'}: identity, version surfaces, bundle hygiene and update signing material all agree.`,
  );
  return 0;
}

/**
 * The release QA report (Phase 6.6).
 *
 * Exits non-zero only on a `FAIL`. `NOT_AVAILABLE` does not fail the command — it qualifies it,
 * and it is printed as its own line so that a green exit cannot be read as "every step was
 * exercised here". This is not a release gate: `preflight` is the command that refuses to
 * package. This one answers "what is the state of the release path, and what did nobody check?"
 */
async function commandQa(): Promise<number> {
  const report = await runReleaseQa({ root });
  console.log(formatQaReport(report));
  return report.releaseReady ? 0 : 1;
}

const [command = 'preflight', ...rest] = process.argv.slice(2);

const commands: Record<string, () => number | Promise<number>> = {
  'version-check': commandVersionCheck,
  'version-sync': commandVersionSync,
  signing: commandSigning,
  qa: commandQa,
  preflight: () => commandPreflight(rest),
};

const run = commands[command];
if (!run) {
  console.log(
    `Unknown command "${command}".\n\n` +
      `Usage: node dist/src/desktop/release-cli.js <${Object.keys(commands).join('|')}>\n` +
      `  version-check   report whether ${VERSION_SOURCE_PATH} and its mirrors agree\n` +
      '  version-sync    write the source version into every mirror\n' +
      '  signing         review the update signing material for this environment\n' +
      '  qa              report what is release-ready and what this host cannot validate\n' +
      '  preflight       refuse to package a tree that is not releasable (--dev for a report)',
  );
  process.exitCode = 1;
} else {
  // `qa` is the only asynchronous command; the rest answer from the tree synchronously.
  void Promise.resolve(run()).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.log(
        `the release report failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      process.exitCode = 1;
    },
  );
}
