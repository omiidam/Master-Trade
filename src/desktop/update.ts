/**
 * The update lifecycle, and the rules that make it safe to offer.
 *
 * Four things can go wrong with an auto-updater, and each one has a rule here rather than a
 * convention somewhere else:
 *
 *   1. **It installs something it should not have.** Every install requires metadata carrying a
 *      signature. Metadata without one is refused before a byte is downloaded, and the native
 *      port verifies the signature against the public key compiled into the binary (Phase 6.5 §5)
 *      — this module decides *whether asking is allowed at all*.
 *   2. **It goes backwards.** A target older than what is installed is refused: a downgrade is how
 *      a stale endpoint silently reverts a fixed build. A major-version change is refused too,
 *      unless a caller opts in with an explicit policy, because a training record written by one
 *      major version is not something the previous one can read.
 *   3. **It claims success it cannot evidence.** `updated` is only reached after re-reading the
 *      installed version and finding it equals the target. "The installer returned without an
 *      error" is not evidence, and it is the state a user sees, so it is the one that must not be
 *      guessed.
 *   4. **It fails destructively.** A failure at any step leaves the current version in place and
 *      reports `failed` with a reason a screen can render. There is no rollback to implement
 *      because nothing is changed until the port's install succeeds.
 *
 * Where a real download comes from is not this module's business: `UpdatePort.fetchMetadata`
 * asks the endpoint configured in the bundle. No function here accepts a URL, a path or a
 * filename, so a compromised page has nothing to point somewhere else.
 */

import { AppError } from '../../packages/shared/src/core/errors.js';
import { isProduction, type DesktopEnvironment } from './environment.js';

/**
 * Every state the updater can be in.
 *
 * `unavailable` is separate from `failed` on purpose: "this build has no updater" (a browser, or a
 * shell without the plugin) is a capability statement, while `failed` is something that went
 * wrong and is worth retrying. Collapsing them makes the browser's honest answer look like a bug.
 */
export const UPDATE_STATES = [
  'unavailable',
  'checking',
  'up_to_date',
  'update_available',
  'downloading',
  'installing',
  'updated',
  'failed',
] as const;

export type UpdateState = (typeof UPDATE_STATES)[number];

/** States from which a new check is allowed. Anything else means one is already running. */
export const CHECKABLE_STATES: readonly UpdateState[] = [
  'unavailable',
  'up_to_date',
  'update_available',
  'updated',
  'failed',
];

/** States from which an install is allowed: a target has to be known and verified-shaped. */
export const INSTALLABLE_STATES: readonly UpdateState[] = ['update_available'];

export interface UpdatePolicy {
  /**
   * Whether a target in a different major version may be installed.
   *
   * Off by default. A major boundary is where persisted training data changes shape, so it is a
   * decision a release makes explicitly rather than one a version number makes by accident.
   */
  allowMajorUpgrade: boolean;
  /** Notes are rendered; an unbounded string from a remote endpoint is not rendered. */
  maxNotesLength: number;
}

export const DEFAULT_UPDATE_POLICY: UpdatePolicy = {
  allowMajorUpgrade: false,
  maxNotesLength: 20_000,
};

export interface Semver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

/**
 * Normalize a version string: `v1.2.3`, ` 1.2.3 ` and `1.2` are all valid, and become `1.2.3`.
 *
 * `1.2` is padded rather than refused because semantic versioning allows it and Tauri's own
 * metadata generation has varied on the point. Anything else — a date, a range, a commit hash,
 * an empty string — returns `null`, and the caller turns that into a refusal.
 */
export function normalizeVersion(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/^v/i, '');
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    trimmed,
  );
  if (!match) return null;
  const [, major, minor, patch, prerelease] = match;
  return `${major}.${minor}.${patch ?? '0'}${prerelease ? `-${prerelease}` : ''}`;
}

/** Parse a normalized version. Returns `null` for anything `normalizeVersion` refuses. */
export function parseVersion(raw: unknown): Semver | null {
  const normalized = normalizeVersion(raw);
  if (normalized === null) return null;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(normalized);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

/**
 * Compare two versions: `-1`, `0` or `1`, and `null` when either side is not a version.
 *
 * A pre-release sorts below its release (`1.0.0-rc1 < 1.0.0`), which is the rule that keeps a beta
 * channel from being treated as newer than the stable build it precedes.
 */
export function compareVersions(left: unknown, right: unknown): number | null {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  return a.prerelease < b.prerelease ? -1 : 1;
}

/** Whether two versions differ in their major number. */
export function isMajorChange(from: unknown, to: unknown): boolean {
  const a = parseVersion(from);
  const b = parseVersion(to);
  if (!a || !b) return false;
  return a.major !== b.major;
}

/**
 * A minisign signature as Tauri's updater carries it: an optional `untrusted comment:` line and a
 * base64 blob.
 *
 * Shape only. The cryptographic check happens in the native port, against the compiled-in key —
 * this rule exists so that metadata *without* a signature never reaches the code that installs.
 */
export const UPDATE_SIGNATURE_PATTERN = /^(?:untrusted comment:[^\n]*\n)?[A-Za-z0-9+/=]{40,}\n?$/;

export interface UpdateMetadata {
  version: string;
  notes: string | null;
  pubDate: string | null;
  /** Present and non-empty by construction; `parseUpdateMetadata` refuses anything else. */
  signature: string;
  /** Recorded for diagnostics. Never used to decide where anything is fetched from. */
  url: string | null;
}

export type MetadataResult =
  { ok: true; metadata: UpdateMetadata } | { ok: false; problem: string };

/**
 * Validate the metadata an update endpoint returned.
 *
 * Everything rejected here is rejected *before* an install is considered, and the problems are
 * phrased for a log rather than a screen: this is shell-side state, not user-facing copy.
 */
export function parseUpdateMetadata(
  raw: unknown,
  policy: UpdatePolicy = DEFAULT_UPDATE_POLICY,
): MetadataResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, problem: 'update metadata is not a JSON object' };
  }
  const record = raw as Record<string, unknown>;

  const version = normalizeVersion(record.version);
  if (version === null) {
    return {
      ok: false,
      problem: `update metadata declares no usable version ("${String(record.version ?? '')}")`,
    };
  }

  const signature = typeof record.signature === 'string' ? record.signature.trim() : '';
  if (signature.length === 0) {
    return { ok: false, problem: `update ${version} carries no signature` };
  }
  if (!UPDATE_SIGNATURE_PATTERN.test(`${signature}\n`)) {
    return { ok: false, problem: `update ${version} carries a malformed signature` };
  }

  let notes: string | null = null;
  if (typeof record.notes === 'string' && record.notes.length > 0) {
    if (record.notes.length > policy.maxNotesLength) {
      return {
        ok: false,
        problem: `update ${version} declares ${record.notes.length} characters of notes; the limit is ${policy.maxNotesLength}`,
      };
    }
    notes = record.notes;
  }

  let pubDate: string | null = null;
  if (typeof record.pub_date === 'string' && record.pub_date.length > 0) {
    const parsed = new Date(record.pub_date);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, problem: `update ${version} declares an unparseable pub_date` };
    }
    pubDate = parsed.toISOString();
  }

  let url: string | null = null;
  if (typeof record.url === 'string' && record.url.length > 0) {
    // Only https is recorded, and it is never followed by this module: the port fetches from the
    // configured endpoint. Refusing a plaintext URL here keeps a bad endpoint from being echoed
    // into release notes or a diagnostic that someone then opens.
    if (!record.url.startsWith('https://')) {
      return { ok: false, problem: `update ${version} declares a non-https url` };
    }
    url = record.url;
  }

  return { ok: true, metadata: { version, notes, pubDate, signature, url } };
}

export interface UpdateDecision {
  state: UpdateState;
  /** Renderable reason for a non-progress state. `null` when the state speaks for itself. */
  reason: string | null;
  target: UpdateMetadata | null;
  /** True when a target existed and policy refused it. */
  refused: boolean;
}

export interface DecideUpdateOptions {
  current: unknown;
  metadata: MetadataResult;
  policy?: UpdatePolicy;
  /** Whether a native updater exists at all. A browser answers `false`. */
  available: boolean;
}

/**
 * Turn (current version, metadata, policy) into a state — the whole decision, in one pure function.
 *
 * Pure so it can be tested against every combination without a port, an endpoint or a clock, and
 * so the policy is readable in one place rather than spread through the service's control flow.
 */
export function decideUpdate(options: DecideUpdateOptions): UpdateDecision {
  const policy = options.policy ?? DEFAULT_UPDATE_POLICY;

  if (!options.available) {
    return {
      state: 'unavailable',
      reason: 'this build has no updater: updates are not checked here',
      target: null,
      refused: false,
    };
  }

  const current = normalizeVersion(options.current);
  if (current === null) {
    return {
      state: 'failed',
      reason: 'the installed version could not be read, so no update could be compared with it',
      target: null,
      refused: true,
    };
  }

  if (!options.metadata.ok) {
    return { state: 'failed', reason: options.metadata.problem, target: null, refused: true };
  }
  const target = options.metadata.metadata;

  const order = compareVersions(target.version, current);
  if (order === null) {
    return {
      state: 'failed',
      reason: `update version "${target.version}" is not comparable with the installed "${current}"`,
      target: null,
      refused: true,
    };
  }
  if (order < 0) {
    return {
      state: 'failed',
      reason: `the endpoint offers ${target.version}, which is older than the installed ${current}; a downgrade is refused`,
      target,
      refused: true,
    };
  }
  if (order === 0) {
    return {
      state: 'up_to_date',
      reason: `the installed ${current} is the newest published version`,
      target,
      refused: false,
    };
  }
  if (isMajorChange(current, target.version) && !policy.allowMajorUpgrade) {
    return {
      state: 'failed',
      reason: `${target.version} crosses a major version from ${current}, and this build does not accept a major upgrade`,
      target,
      refused: true,
    };
  }
  return {
    state: 'update_available',
    reason: `${target.version} is available; you are on ${current}`,
    target,
    refused: false,
  };
}

/**
 * The native boundary.
 *
 * Everything OS-specific is behind this interface: the service above owns the rules, and the port
 * owns the platform. `npm run desktop:verify` records that the Rust half is described rather than
 * executed (TDR-13); `tests/desktop-update.test.ts` exercises the service against a scripted port,
 * and `unavailableUpdatePort()` is what a browser must use.
 */
export interface UpdatePort {
  /** Whether a native updater exists at all. */
  available(): boolean;
  /** The version currently installed, read from the shell rather than remembered. */
  currentVersion(): Promise<string>;
  /** Metadata from the endpoint configured in the bundle. Takes no argument, by design. */
  fetchMetadata(): Promise<unknown>;
  /** Verify the signature against the compiled-in key and prepare the artifact. */
  download(metadata: UpdateMetadata): Promise<{ artifactId: string }>;
  /** Install a prepared artifact. */
  install(artifactId: string): Promise<void>;
  /** The version installed *after* an install, read back from the shell. */
  installedVersion(): Promise<string>;
  /** Ask a download or install to stop, where the platform supports it. */
  cancel?(): Promise<void>;
}

export interface UpdateStatus {
  state: UpdateState;
  currentVersion: string | null;
  /** The target version, when one is known. */
  targetVersion: string | null;
  reason: string | null;
  /** How many checks have completed, so a screen can tell "never checked" from "checked". */
  checks: number;
}

/**
 * The browser's updater: honest about not being one.
 *
 * Reads answer `false`/refusal rather than throwing, because "this page has no updater" is not an
 * error; writes refuse, because a browser must never be able to reach a native install path.
 */
export function unavailableUpdatePort(): UpdatePort {
  const unsupported = (what: string): never => {
    throw new AppError(
      'NOT_IMPLEMENTED',
      `${what} is only available in the desktop shell; this runtime has no updater`,
      { details: { shell: 'browser' } },
    );
  };
  return {
    available: () => false,
    currentVersion: async () => '0.0.0',
    fetchMetadata: async () => unsupported('Checking for an update'),
    download: async () => unsupported('Downloading an update'),
    install: async () => unsupported('Installing an update'),
    installedVersion: async () => '0.0.0',
  };
}

export interface UpdateServiceOptions {
  port: UpdatePort;
  environment: DesktopEnvironment;
  policy?: UpdatePolicy;
}

/**
 * Drives the port through the state machine.
 *
 * The guards are not decoration: `check()` while checking would open two requests, and `install()`
 * without a target would install whatever the port last saw. Both are refused with an explicit
 * state rather than a thrown error, so a UI polling status sees the truth.
 */
export class UpdateService {
  private readonly port: UpdatePort;
  private readonly environment: DesktopEnvironment;
  private readonly policy: UpdatePolicy;
  private listeners = new Set<(status: UpdateStatus) => void>();
  private state: UpdateState = 'unavailable';
  private current: string | null = null;
  private target: UpdateMetadata | null = null;
  private reason: string | null = null;
  private checks = 0;
  private prepared: string | null = null;

  constructor(options: UpdateServiceOptions) {
    this.port = options.port;
    this.environment = options.environment;
    this.policy = options.policy ?? DEFAULT_UPDATE_POLICY;
    this.state = options.port.available() ? 'up_to_date' : 'unavailable';
    this.reason = options.port.available()
      ? null
      : 'this build has no updater: updates are not checked here';
  }

  status(): UpdateStatus {
    return {
      state: this.state,
      currentVersion: this.current,
      targetVersion: this.target?.version ?? null,
      reason: this.reason,
      checks: this.checks,
    };
  }

  subscribe(listener: (status: UpdateStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private set(state: UpdateState, reason: string | null = null): void {
    this.state = state;
    this.reason = reason;
    const status = this.status();
    for (const listener of this.listeners) listener(status);
  }

  /**
   * Ask the endpoint whether a newer version exists.
   *
   * Returns the resulting status instead of throwing on an expected failure — an unreachable
   * endpoint is `failed` with a reason, which is a state the product is expected to be in.
   */
  async check(): Promise<UpdateStatus> {
    if (!this.port.available()) {
      this.set('unavailable', 'this build has no updater: updates are not checked here');
      return this.status();
    }
    if (!CHECKABLE_STATES.includes(this.state)) {
      return this.status();
    }

    this.prepared = null;
    this.set('checking');
    try {
      this.current = await this.port.currentVersion();
      const raw = await this.port.fetchMetadata();
      const decision = decideUpdate({
        current: this.current,
        metadata: parseUpdateMetadata(raw, this.policy),
        policy: this.policy,
        available: true,
      });
      this.target = decision.target;
      this.checks += 1;
      if (decision.state === 'failed' && decision.refused) {
        // A refusal is a decision, not a crash: the version in place is untouched and the state
        // says why, so a screen can render it and a retry is meaningful.
        this.set('failed', decision.reason);
      } else {
        this.set(decision.state, decision.reason);
      }
    } catch (error) {
      this.current ??= null;
      this.checks += 1;
      this.set('failed', this.describe(error, 'checking for an update'));
    }
    return this.status();
  }

  /**
   * Install the available target.
   *
   * The last step is the one that matters: the installed version is read back and must equal the
   * target. Anything else is `failed`, because reporting `updated` on the strength of an install
   * that returned without throwing is exactly the lie this state machine exists to prevent.
   */
  async install(): Promise<UpdateStatus> {
    if (!INSTALLABLE_STATES.includes(this.state) || this.target === null) {
      return this.status();
    }
    const target = this.target;

    try {
      this.set('downloading', `downloading ${target.version}`);
      const { artifactId } = await this.port.download(target);
      this.prepared = artifactId;

      this.set('installing', `installing ${target.version}`);
      await this.port.install(artifactId);

      const installed = normalizeVersion(await this.port.installedVersion());
      if (installed === null) {
        this.set(
          'failed',
          `the installed version could not be read after installing ${target.version}; the update is not confirmed`,
        );
        return this.status();
      }
      if (installed !== target.version) {
        this.set(
          'failed',
          `install finished but the installed version is ${installed}, not ${target.version}; nothing is claimed`,
        );
        return this.status();
      }

      this.current = installed;
      this.set('updated', `updated to ${installed}`);
    } catch (error) {
      this.set('failed', this.describe(error, `installing ${target.version}`));
    }
    return this.status();
  }

  /**
   * Ask the platform to stop, where it can.
   *
   * Returns to `update_available` rather than `failed`: a cancelled download is not a broken
   * updater, and leaving the target in place means the user can start it again.
   */
  async cancel(): Promise<UpdateStatus> {
    if (this.state !== 'downloading' && this.state !== 'installing') return this.status();
    try {
      if (this.port.cancel) await this.port.cancel();
      this.prepared = null;
      this.set(
        'update_available',
        this.target
          ? `${this.target.version} is available; you are on ${this.current ?? 'an unknown version'}`
          : null,
      );
    } catch (error) {
      this.set('failed', this.describe(error, 'cancelling the update'));
    }
    return this.status();
  }

  /** The prepared artifact id, when a download has completed. Exposed for the port that resumes. */
  preparedArtifact(): string | null {
    return this.prepared;
  }

  /** What mode this service believes it is in; used by docs and the release report, never to relax a rule. */
  environmentName(): DesktopEnvironment {
    return this.environment;
  }

  /**
   * A reason that is safe to persist and log: the message, never a stack, a path or a URL.
   *
   * `AppError` already carries a product-facing message; anything else is reduced to its class,
   * because a raw `TypeError` message is a system detail and this string ends up in a status
   * record that a screen renders.
   */
  private describe(error: unknown, doing: string): string {
    if (error instanceof AppError) return `failed ${doing}: ${error.message}`;
    if (error instanceof Error) return `failed ${doing} (${error.name})`;
    return `failed ${doing}`;
  }
}

/** True when a build in this environment may offer an update at all. Kept for the release report. */
export function updatesAllowed(environment: DesktopEnvironment): boolean {
  // Updates are never offered by a build that is not a release. A development tree has no
  // signature to verify against, and installing over it would replace the tree being worked on.
  return isProduction(environment);
}
