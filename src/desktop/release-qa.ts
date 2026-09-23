/**
 * Release QA — one report that says what was checked, on what, and what could not be.
 *
 * The desktop shell is six subsystems that were each tested as they were built (6.1–6.5). What
 * none of those suites can say is the *joint* claim a release needs: that this tree, on this
 * machine, right now, is ready to ship — and if it is not, which part is not.
 *
 * This module is that report, and it is deliberately thin. It owns exactly three things:
 *
 *   1. **The four verdicts.** `PASS`, `WARN`, `FAIL` and `NOT_AVAILABLE`. The fourth is the
 *      reason this exists as a separate layer: every other check in the repository answers
 *      "is it right?", and none of them can answer "was it looked at?" — a report that omits a
 *      Windows step is indistinguishable from one that passed it. `NOT_AVAILABLE` is a finding,
 *      never a silence.
 *   2. **The evidence map.** The phase names nineteen scenarios the desktop must end
 *      deterministically in. Mapping each one to the suite that proves it turns "we tested this"
 *      into a dependency: if a test is renamed or removed, this report fails and names the
 *      scenario that lost its proof. Nothing else in the repository asserts that every scenario
 *      still has a witness.
 *   3. **The platform boundary.** Which parts of the release path cannot be exercised here, said
 *      out loud. On a non-Windows host the honest answer for the Windows runtime path is
 *      `NOT_AVAILABLE`, and the report must never let that read as a pass.
 *
 * Everything else it reports, it *reads*. The bundle rules come from `packaging.ts`, the signing
 * verdict from `signing.ts`, the version surfaces from `version.ts`, and all of it through
 * `verifyDesktopShell` — the same report `npm run desktop:verify` prints and `npm run validate`
 * gates on. There is one rulebook; this is a second *view* of it, not a second one.
 *
 * Nothing here prints a credential, a token or a path from a user's machine. The findings it
 * relays are already curated by their owners, and the ones it writes itself name repository-
 * relative files, the platform, and the environment — and nothing else.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DESKTOP_ENVIRONMENT_VAR,
  resolveDesktopEnvironment,
  type DesktopEnvironment,
} from './environment.js';
import { verifyDesktopShell, type VerificationCheck } from './verify.js';

/** The four verdicts. `NOT_AVAILABLE` is the one no other check in the repository can give. */
export const QA_STATUSES = ['PASS', 'WARN', 'FAIL', 'NOT_AVAILABLE'] as const;

export type QaStatus = (typeof QA_STATUSES)[number];

/** The areas a finding belongs to — the mission's own checklist, in its order. */
export const QA_AREAS = [
  'boot',
  'api',
  'storage',
  'handshake',
  'shutdown',
  'recovery',
  'package',
  'update',
  'permissions',
  'platform',
] as const;

export type QaArea = (typeof QA_AREAS)[number];

export interface QaFinding {
  id: string;
  area: QaArea;
  status: QaStatus;
  /** Safe to print verbatim: no credential, no token, no path from a user's machine. */
  detail: string;
}

/**
 * One scenario from the desktop QA matrix, and the test that proves it.
 *
 * `evidence` is a fragment of the test's own name, matched literally against the suite's text.
 * A fragment rather than the whole title, so that rewording a test is not a failure but deleting
 * it is. When a row fails, the fix is either to restore the test or to correct this map — both
 * of which are the point.
 */
export interface QaMatrixEntry {
  id: string;
  scenario: string;
  /** The suite that proves it, repository-relative. */
  suite: string;
  /** A distinctive fragment of the proving test's name. */
  evidence: string;
}

/**
 * The nineteen scenarios of `docs/desktop-release-qa.md`, each with a witness.
 *
 * Ordered as the phase lists them: startup, runtime, shutdown, concurrency, security, web, UI.
 * A scenario with no witness is a `FAIL`, not a gap — the matrix exists to make the claim
 * checkable, and an unwitnessed scenario is exactly the claim that would otherwise go untested.
 */
export const QA_MATRIX: readonly QaMatrixEntry[] = [
  {
    id: 'matrix.normal-start',
    scenario: 'normal start: the API comes up and only health makes it ready',
    suite: 'tests/desktop-runtime.test.ts',
    evidence: 'answers ready only once health answers',
  },
  {
    id: 'matrix.fresh-start',
    scenario: 'fresh start against a real API process, with no prior state',
    suite: 'tests/desktop-runtime.test.ts',
    evidence: 'reaches ready against a real health endpoint',
  },
  {
    id: 'matrix.slow-start',
    scenario: 'slow start: a late health answer is waited for, not failed early',
    suite: 'tests/desktop-runtime.test.ts',
    evidence: 'waits through a slow health answer',
  },
  {
    id: 'matrix.start-timeout',
    scenario: 'startup timeout: the readiness deadline is bounded and says so',
    suite: 'tests/desktop-runtime.test.ts',
    evidence: 'reports error with the deadline when health never answers',
  },
  {
    id: 'matrix.failed-health',
    scenario: 'failed health check demotes a process that stopped answering',
    suite: 'tests/desktop-runtime.test.ts',
    evidence: 'demotes a ready API that stops answering',
  },
  {
    id: 'matrix.api-crash',
    scenario: 'API crash: an unexpected exit is reported as crashed, then restarting',
    suite: 'tests/desktop-runtime.test.ts',
    evidence: 'reports an unexpected exit as crashed',
  },
  {
    id: 'matrix.api-restart',
    scenario: 'API restart: an explicit restart brings the API back',
    suite: 'tests/desktop-runtime.test.ts',
    evidence: 'can be restarted explicitly',
  },
  {
    id: 'matrix.restart-backoff',
    scenario: 'restart backoff grows instead of hammering a dead API',
    suite: 'tests/desktop-runtime.test.ts',
    evidence: 'grows the delay between restarts',
  },
  {
    id: 'matrix.restart-exhaustion',
    scenario: 'restart exhaustion: the budget bounds the loop and names the cause',
    suite: 'tests/desktop-runtime.test.ts',
    evidence: 'stops restarting once the budget is spent',
  },
  {
    id: 'matrix.normal-shutdown',
    scenario: 'normal shutdown: a graceful stop settles in stopped',
    suite: 'tests/desktop-runtime.test.ts',
    evidence: 'stops gracefully and settles in stopped',
  },
  {
    id: 'matrix.forced-termination',
    scenario: 'shutdown bound: termination is forced only after the deadline',
    suite: 'tests/desktop-runtime.test.ts',
    evidence: 'forces termination only after the bound',
  },
  {
    id: 'matrix.orphan-prevention',
    scenario: 'no orphan process survives a stop, against a real child',
    suite: 'tests/desktop-runtime.test.ts',
    evidence: 'leaves nothing behind',
  },
  {
    id: 'matrix.concurrent-start',
    scenario: 'concurrent start: a second caller joins the first attempt',
    suite: 'tests/desktop-runtime.test.ts',
    evidence: 'joins a start that is already in flight',
  },
  {
    id: 'matrix.concurrent-stop',
    scenario: 'concurrent stop: a stop that races a spawn leaks no child',
    suite: 'tests/desktop-hardening.test.ts',
    evidence: 'stops the child it cannot adopt',
  },
  {
    id: 'matrix.stop-during-start',
    scenario: 'stop during startup: no start is reported over a stop',
    suite: 'tests/desktop-runtime.test.ts',
    evidence: 'refuses to start while stopping',
  },
  {
    id: 'matrix.large-output',
    scenario: 'pipes never deadlock or grow the shell without bound',
    suite: 'tests/desktop-hardening.test.ts',
    evidence: 'is cut off at the capture bound',
  },
  {
    id: 'matrix.ipc-failure',
    scenario: 'IPC failure: a transport error becomes a typed, curated error',
    suite: 'tests/desktop-hardening.test.ts',
    evidence: 'replaces a raw transport error',
  },
  {
    id: 'matrix.version-mismatch',
    scenario: 'version mismatch fails closed and never reaches ready',
    suite: 'tests/desktop-hardening.test.ts',
    evidence: 'refuses to report ready for an API from another build',
  },
  {
    id: 'matrix.version-missing',
    scenario: 'missing version metadata is unavailable, not a mismatch',
    suite: 'tests/desktop-hardening.test.ts',
    evidence: 'answered without a version as unavailable',
  },
  {
    id: 'matrix.browser-isolation',
    scenario: 'a browser cannot reach a process, a keychain or an updater',
    suite: 'tests/desktop-hardening.test.ts',
    evidence: 'keeps the browser unable to reach native storage',
  },
  {
    id: 'matrix.secure-storage-unavailable',
    scenario: 'secure storage unavailable: the failure is reported, never bypassed',
    suite: 'tests/desktop-secure-storage.test.ts',
    evidence: 'denied keychain as unavailable',
  },
  {
    id: 'matrix.db-init-failure',
    scenario: 'database initialization failure is a named stage, without leaking a path',
    suite: 'tests/desktop-storage.test.ts',
    evidence: 'cannot be opened without leaking the path',
  },
  {
    id: 'matrix.db-migration-failure',
    scenario: 'migration failure refuses instead of resetting the database',
    suite: 'tests/desktop-storage.test.ts',
    evidence: 'tampered migration ledger',
  },
  {
    id: 'matrix.filesystem-failure',
    scenario: 'an unusable data directory is reported as its own stage',
    suite: 'tests/desktop-storage.test.ts',
    evidence: 'reports unresolvable paths as their own stage',
  },
  {
    id: 'matrix.path-traversal',
    scenario: 'file storage refuses traversal and escape outside its root',
    suite: 'tests/desktop-storage.test.ts',
    evidence: 'rejects traversal, absolute paths and NUL bytes',
  },
  {
    id: 'matrix.update-metadata-invalid',
    scenario: 'invalid update metadata fails closed before anything is downloaded',
    suite: 'tests/desktop-update.test.ts',
    evidence: 'refuses metadata without a signature',
  },
  {
    id: 'matrix.update-signature-invalid',
    scenario: 'a malformed update signature never reaches the installer',
    suite: 'tests/desktop-update.test.ts',
    evidence: 'refuses a malformed signature',
  },
  {
    id: 'matrix.update-failure',
    scenario: 'a failed update leaves the current version in place',
    suite: 'tests/desktop-update.test.ts',
    evidence: 'leaves the current version in place when an install fails',
  },
  {
    id: 'matrix.update-unconfirmed',
    scenario: 'update success is claimed only after the version actually changes',
    suite: 'tests/desktop-update.test.ts',
    evidence: 'never claims updated when the installed version did not change',
  },
  {
    id: 'matrix.signing-fails-closed',
    scenario: 'a production release is refused without usable signing material',
    suite: 'tests/desktop-signing.test.ts',
    evidence: 'refuses a production release built from the committed tree',
  },
  {
    id: 'matrix.packaging-rules',
    scenario: 'the packaging rules refuse a bundle that breaks identity, icon or hygiene',
    suite: 'tests/desktop-packaging.test.ts',
    evidence: 'refuses to package with every failure listed at once',
  },
  {
    id: 'matrix.version-surfaces',
    scenario: 'one version source agrees with every mirror it is written into',
    suite: 'tests/desktop-packaging.test.ts',
    evidence: 'reports a stale mirror by name',
  },
  {
    id: 'matrix.ui-states',
    scenario: 'the interface branches on the five states a person can be shown',
    suite: 'tests/desktop-runtime.test.ts',
    evidence: 'names all five states a person can be shown',
  },
];

export interface QaReport {
  findings: QaFinding[];
  counts: Record<QaStatus, number>;
  /** Which environment this report describes. */
  environment: DesktopEnvironment;
  /** The platform this report ran on, which is what its `NOT_AVAILABLE` rows are about. */
  platform: string;
  /** True when nothing failed. `NOT_AVAILABLE` rows do not fail a report — they qualify it. */
  releaseReady: boolean;
  /** Everything the report cannot vouch for, gathered so it is read as one list. */
  unavailable: string[];
}

export interface ReleaseQaOptions {
  root: string;
  /** The environment to report as; defaults to the resolved one. */
  env?: Record<string, string | undefined>;
  /** Injected so the platform boundary is testable without a Windows machine. */
  platform?: string;
  /** Injected so a test can describe a broken tree without writing one. */
  readFile?: (path: string) => Promise<string>;
  /** Injected for the same reason; used only to answer whether a suite exists. */
  listDir?: (path: string) => Promise<string[]>;
}

/** Which area a verification check belongs to, from its id. */
function qaAreaFor(checkId: string): QaArea {
  if (checkId.startsWith('handshake.')) return 'handshake';
  if (checkId.startsWith('version.') || checkId.startsWith('package.')) return 'package';
  if (checkId.startsWith('bundle.')) return 'package';
  if (checkId.startsWith('signing.')) return 'update';
  if (checkId.startsWith('capability.')) return 'permissions';
  if (checkId.startsWith('csp.')) return 'permissions';
  if (checkId.startsWith('process.') || checkId.startsWith('process-state.')) return 'api';
  if (checkId.startsWith('port.')) return 'api';
  if (checkId.startsWith('protocol.')) return 'boot';
  if (checkId.startsWith('config.')) return 'boot';
  if (checkId.startsWith('secrets.')) return 'permissions';
  return 'boot';
}

/**
 * A verification check as a QA finding.
 *
 * The severity mapping is the whole translation: an unmet requirement is `FAIL`, an unmet
 * expectation is `WARN`, and a met one is `PASS`. Note that a *warning-level* check that passes
 * is still a `PASS` — the QA report describes the tree, and the mode that decides severity has
 * already been applied by the verifier that produced this check.
 */
function findingFor(check: VerificationCheck): QaFinding {
  return {
    id: check.id,
    area: qaAreaFor(check.id),
    status: check.ok ? 'PASS' : check.severity === 'error' ? 'FAIL' : 'WARN',
    detail: check.detail,
  };
}

async function defaultReadFile(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

/** Whether a bundle artifact exists, asked of the directories the bundler writes to. */
async function findInstallerArtifact(
  root: string,
  listDir: (path: string) => Promise<string[]>,
): Promise<string | null> {
  const bundleDir = join(root, 'src-tauri', 'target', 'release', 'bundle');
  let entries: string[];
  try {
    entries = await listDir(bundleDir);
  } catch {
    // No target directory at all: nothing has been bundled in this checkout.
    return null;
  }
  for (const platformDir of entries) {
    let files: string[];
    try {
      files = await listDir(join(bundleDir, platformDir));
    } catch {
      continue;
    }
    const artifact = files.find((file) => /\.(msi|exe|appimage|deb|dmg|nsis\.zip)$/i.test(file));
    if (artifact) return `${platformDir}/${artifact}`;
  }
  return null;
}

/**
 * Run the release QA report.
 *
 * Composed, not authored: the verification report is the substance, this adds the platform
 * boundary and the evidence map. A finding here that the verifier does not produce is one of
 * exactly three kinds — the evidence matrix, the platform rows, or the documentation row — and
 * each of those is something the verifier deliberately cannot know.
 */
export async function runReleaseQa(options: ReleaseQaOptions): Promise<QaReport> {
  const platform = options.platform ?? process.platform;
  const readText = options.readFile ?? defaultReadFile;
  const listDir =
    options.listDir ??
    (async (path: string) =>
      (await readdir(path, { withFileTypes: true })).map((entry) => entry.name));

  const environment = options.env
    ? resolveDesktopEnvironment(options.env)
    : resolveDesktopEnvironment();

  const verification = await verifyDesktopShell({ root: options.root, env: options.env });

  const findings: QaFinding[] = verification.checks.map(findingFor);

  // ── the evidence map ─────────────────────────────────────────────────────
  //
  // One row per matrix scenario. A missing suite or a missing test is a FAIL: the matrix is the
  // claim that every scenario is still witnessed, and a witness that has quietly gone away is
  // worse than one that was never claimed, because the report would keep saying "covered".
  for (const entry of QA_MATRIX) {
    let source: string | null = null;
    try {
      source = await readText(join(options.root, entry.suite));
    } catch {
      source = null;
    }
    if (source === null) {
      findings.push({
        id: entry.id,
        area: 'recovery',
        status: 'FAIL',
        detail: `${entry.scenario} has no witness: ${entry.suite} does not exist`,
      });
      continue;
    }
    const witnessed = source.includes(entry.evidence);
    findings.push({
      id: entry.id,
      area: 'recovery',
      status: witnessed ? 'PASS' : 'FAIL',
      detail: witnessed
        ? `${entry.scenario} — witnessed by ${entry.suite}`
        : `${entry.scenario} lost its witness: ${entry.suite} no longer contains a test matching "${entry.evidence}"`,
    });
  }

  // ── the platform boundary ────────────────────────────────────────────────
  //
  // Three statements, and each one is the honest answer rather than a guess. The runtime path
  // that only exists on Windows is not validated by reading a configuration file, and saying
  // otherwise is precisely what the phase forbids.
  const windows = platform === 'win32';
  findings.push({
    id: 'platform.host',
    area: 'platform',
    status: windows ? 'PASS' : 'NOT_AVAILABLE',
    detail: windows
      ? 'running on Windows: the Windows-specific runtime path can be exercised here'
      : `running on ${platform}: the Windows-specific runtime path (single-instance focus, uninstall entry, OS certificate store) is not exercised by this report`,
  });

  const artifact = await findInstallerArtifact(options.root, listDir);
  findings.push({
    id: 'platform.installer-artifact',
    area: 'platform',
    status: artifact ? 'PASS' : 'NOT_AVAILABLE',
    detail: artifact
      ? `a bundle artifact was found and is described in the packaging checks: ${artifact}`
      : 'no installer artifact exists in this checkout: `tauri build` has not run here, so the bundle itself was not produced or inspected',
  });

  findings.push({
    id: 'platform.environment',
    area: 'platform',
    status: environment.declared ? 'PASS' : 'WARN',
    detail: environment.declared
      ? `the environment was declared as ${environment.environment} through ${DESKTOP_ENVIRONMENT_VAR}`
      : `no ${DESKTOP_ENVIRONMENT_VAR} was declared, so this report describes "${environment.environment}" — a release names its environment in writing`,
  });

  // ── the documentation the release depends on ─────────────────────────────
  const qaDoc = await readText(join(options.root, 'docs', 'desktop-release-qa.md')).catch(
    () => null,
  );
  const hasChecklist = qaDoc !== null && /^##\s.*release checklist/im.test(qaDoc);
  findings.push({
    id: 'docs.release-checklist',
    area: 'boot',
    status: hasChecklist ? 'PASS' : 'WARN',
    detail: hasChecklist
      ? 'docs/desktop-release-qa.md carries the release checklist'
      : 'docs/desktop-release-qa.md is missing or has no release checklist section',
  });

  const counts = QA_STATUSES.reduce(
    (totals, status) => ({
      ...totals,
      [status]: findings.filter((f) => f.status === status).length,
    }),
    {} as Record<QaStatus, number>,
  );

  return {
    findings,
    counts,
    environment: environment.environment,
    platform,
    releaseReady: counts.FAIL === 0,
    // The verifier's own list of what it cannot see, plus this layer's, so a reader has one
    // place to look for "what did nobody check?".
    unavailable: [
      ...verification.unverifiable,
      ...findings
        .filter((finding) => finding.status === 'NOT_AVAILABLE')
        .map((finding) => `${finding.id}: ${finding.detail}`),
    ],
  };
}

/** The report as text, grouped by area. Used by the CLI and readable in a CI log. */
export function formatQaReport(report: QaReport): string {
  const lines: string[] = [];
  lines.push('Master Trade — desktop release QA');
  lines.push(`Environment: ${report.environment}   Platform: ${report.platform}`);
  lines.push('');
  for (const area of QA_AREAS) {
    const inArea = report.findings.filter((finding) => finding.area === area);
    if (inArea.length === 0) continue;
    lines.push(`${area}`);
    for (const finding of inArea) {
      lines.push(`  ${finding.status.padEnd(13)} ${finding.id}`);
      lines.push(`  ${' '.repeat(13)} ${finding.detail}`);
    }
    lines.push('');
  }
  lines.push(
    `${report.findings.length} finding(s): ${report.counts.PASS} pass, ${report.counts.WARN} warn, ` +
      `${report.counts.FAIL} fail, ${report.counts.NOT_AVAILABLE} not available`,
  );
  if (report.counts.NOT_AVAILABLE > 0) {
    lines.push(
      'NOT_AVAILABLE is not a pass: it means this environment could not exercise the check, and it is listed below.',
    );
  }
  lines.push('');
  lines.push('What this report cannot vouch for:');
  for (const statement of report.unavailable) lines.push(`  - ${statement}`);
  return lines.join('\n');
}
