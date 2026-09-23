/**
 * The build-version handshake: the shell and the API must be the same build.
 *
 * Phase 6.5 gave the application *one* version — `package.json`, mirrored into the Tauri
 * config, `Cargo.toml` and `src/core/config.ts`, checked by `version.agreement`. That makes a
 * single tree internally consistent. It does not make a *running* application consistent,
 * because two programs are running: the shell, whose version comes from
 * `tauri.conf.json`/`Cargo.toml`, and the bundled API, whose version comes from the compiled
 * `DEFAULT_CONFIG.version` and is reported at `GET /v1/health`.
 *
 * Those two were built together, so they were assumed to agree. The assumption is worth
 * challenging, because every way it can be false is a silent, confusing failure:
 *
 *   - a release built from a stale `dist/` ships an API reporting `0.5.0` inside an installer
 *     named `0.6.0`. The updater then compares the wrong number, and the health endpoint — the
 *     one place a user, a bug report or a support conversation can read the version from —
 *     answers with a build that is not installed;
 *   - an application opened over an API left running by an *earlier* install (a supervised
 *     child that outlived a crash) talks to code that is not the code in the window. The
 *     protocol version was not bumped, so nothing else notices, and a schema change between
 *     the two builds is read by the wrong reader;
 *   - a development tree runs `dist/` from before the current edit. Every symptom is an
 *     inexplicable 404 or a missing field, and the version is the only evidence available.
 *
 * So readiness is not just "the process answers" — it is "the process answering is *this*
 * build". `docs/desktop-runtime.md` §4 said readiness means process running + health passed +
 * the expected API contract available; this module is the third clause, made checkable.
 *
 * Fail closed, and say which way
 * ------------------------------
 * A mismatch does **not** become a warning that a screen can show while continuing: the shell
 * refuses to reach `ready` and reports `error` naming both versions. Continuing would defeat
 * the point of the check — every query would be answered by code from another build, and the
 * interface would present it as normal.
 *
 * Equality is the rule, not "compatible enough". Both artifacts come from one tree and one
 * version source, and Phase 6.5 makes that source machine-checked, so any difference means
 * the bundle mixes two builds. A tolerance (a patch-level allowance, say) would be a rule
 * that *cannot* be checked against what the bundle was meant to contain, which is exactly the
 * kind of rule this phase exists to remove.
 *
 * The Rust half spawns the child in a packaged app (`src-tauri/src/sidecar.rs`) and applies
 * the same rule against `env!("CARGO_PKG_VERSION")`; `npm run desktop:verify` compares the two
 * descriptions, and TDR-13 records that the Rust one is described rather than compiled here.
 */

import { AppError } from '../../packages/shared/src/core/errors.js';
import { normalizeVersion, compareVersions } from './update.js';
import type { SidecarPlan } from './sidecar.js';

/**
 * The four answers the handshake can give.
 *
 * `VERSION_UNAVAILABLE` is deliberately separate from `VERSION_CHECK_FAILED`. "The API
 * answered but reported no version" (a shell that predates the field, a health body that
 * changed shape) is a fact about the API; "we could not ask" (the request failed, the body was
 * not JSON, the version was not a version) is a fact about the check. Collapsing them would
 * make a broken probe indistinguishable from a missing field, and the fix differs.
 */
export const HANDSHAKE_STATES = [
  'VERSION_OK',
  'VERSION_MISMATCH',
  'VERSION_UNAVAILABLE',
  'VERSION_CHECK_FAILED',
] as const;

export type HandshakeState = (typeof HANDSHAKE_STATES)[number];

/** The only state in which the shell may reach `ready`. Listed, so "compatible" is not a guess. */
export const COMPATIBLE_HANDSHAKE_STATES: readonly HandshakeState[] = ['VERSION_OK'];

export interface HandshakeResult {
  state: HandshakeState;
  /** The shell's own version, normalized. `null` when it could not be read. */
  expected: string | null;
  /** The version the API reported, normalized. `null` when it reported none or an unusable one. */
  reported: string | null;
  /** A sentence safe to render and safe to log: versions only, never a path, URL or token. */
  reason: string | null;
  /** Derived from `state`, so no caller has to re-derive the rule and get it wrong. */
  compatible: boolean;
}

/** Whether the shell may treat this result as "the API is the build we shipped". */
export function isHandshakeCompatible(result: HandshakeResult): boolean {
  return COMPATIBLE_HANDSHAKE_STATES.includes(result.state);
}

function describeOrder(reported: string, expected: string): string {
  const order = compareVersions(reported, expected);
  if (order === null) return 'they cannot be ordered';
  if (order < 0) return 'the API is older than the shell';
  if (order > 0) return 'the API is newer than the shell';
  return 'they compare equal, which cannot happen here';
}

/**
 * Decide the handshake from the two version strings alone.
 *
 * Pure, so every combination — including the malformed ones — is testable without a process,
 * a port or a clock. The branch order is the design: an unreadable *shell* version is a check
 * failure before anything is asked, because a shell that does not know its own version can
 * never establish that the API matches it.
 */
export function decideHandshake(expectedRaw: unknown, reportedRaw: unknown): HandshakeResult {
  const expected = normalizeVersion(expectedRaw);
  if (expected === null) {
    return {
      state: 'VERSION_CHECK_FAILED',
      expected: null,
      reported: normalizeVersion(reportedRaw),
      reason: 'the shell could not read its own version, so no build-version handshake can be made',
      compatible: false,
    };
  }

  const absent =
    reportedRaw === null ||
    reportedRaw === undefined ||
    (typeof reportedRaw === 'string' && reportedRaw.trim().length === 0);
  if (absent) {
    return {
      state: 'VERSION_UNAVAILABLE',
      expected,
      reported: null,
      reason: `the API answered but reported no version; the shell is ${expected}`,
      compatible: false,
    };
  }

  const reported = normalizeVersion(reportedRaw);
  if (reported === null) {
    return {
      state: 'VERSION_CHECK_FAILED',
      expected,
      reported: null,
      reason: `the API reported a version this build cannot read (${JSON.stringify(reportedRaw).slice(0, 64)}); the shell is ${expected}`,
      compatible: false,
    };
  }

  if (reported !== expected) {
    return {
      state: 'VERSION_MISMATCH',
      expected,
      reported,
      reason: `the API is version ${reported} and the shell is ${expected} — ${describeOrder(reported, expected)}`,
      compatible: false,
    };
  }

  return { state: 'VERSION_OK', expected, reported, reason: null, compatible: true };
}

/** What a probe learned: the version, or why it could not be read. */
export type VersionProbeResult = { ok: true; version: unknown } | { ok: false; problem: string };

/**
 * The native boundary for the handshake.
 *
 * Takes the launch plan — which carries the loopback base URL and the per-launch token — and
 * reads the version the API reports. Injected like every other port here, so the decision is
 * testable without an HTTP server and the shell's own fetch is what runs in production.
 */
export type VersionProbe = (plan: SidecarPlan) => Promise<VersionProbeResult>;

/**
 * The real probe: the authenticated liveness route the supervisor already polls.
 *
 * The same route and the same credential as readiness, on purpose — one request that answers
 * both questions, so "the API is up" and "the API is this build" cannot disagree.
 *
 * Nothing from the transport reaches the result. A fetch failure, a non-200, a body that is
 * not JSON: all become a `problem` string written here, because a raw transport error can
 * carry a URL with the port and a stack that mentions the data directory.
 */
export function versionProbeFromHealth(
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>,
): VersionProbe {
  return async (plan) => {
    let response: Response;
    try {
      response = await fetchImpl(`${plan.baseUrl}/v1/health`, {
        headers: { authorization: `Bearer ${plan.token}` },
      });
    } catch {
      return { ok: false, problem: 'the API did not answer the version request' };
    }
    if (!response.ok) {
      return {
        ok: false,
        problem: `the API answered the version request with status ${response.status}`,
      };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return {
        ok: false,
        problem: 'the API answered the version request with a body that is not JSON',
      };
    }
    if (!body || typeof body !== 'object') {
      return { ok: false, problem: 'the API answered the version request with no health record' };
    }
    // A missing field is `ok: true` with an undefined version: the *API* answered, and
    // `decideHandshake` is what turns that into `VERSION_UNAVAILABLE`.
    return { ok: true, version: (body as { version?: unknown }).version };
  };
}

/**
 * Ask the API what version it is, and decide whether the shell may proceed.
 *
 * Returns a result rather than throwing for an expected failure, so the caller records a state
 * instead of handling an exception on the startup path — an API that will not answer is a
 * situation the product expects, not a bug in the caller.
 */
export async function checkVersionHandshake(input: {
  /** The shell's own version, read from the bundle rather than remembered. */
  expected: unknown;
  plan: SidecarPlan;
  probe: VersionProbe;
}): Promise<HandshakeResult> {
  const early = decideHandshake(input.expected, undefined);
  // A shell that cannot read its own version is a failure before the request is worth making.
  if (early.state === 'VERSION_CHECK_FAILED' && normalizeVersion(input.expected) === null) {
    return early;
  }

  let probed: VersionProbeResult;
  try {
    probed = await input.probe(input.plan);
  } catch (error) {
    // A probe that throws is still a check failure, not an unhandled rejection: the startup
    // path must reach a state either way.
    return {
      state: 'VERSION_CHECK_FAILED',
      expected: normalizeVersion(input.expected),
      reported: null,
      reason: `the build-version handshake could not be completed: ${
        error instanceof AppError ? error.message : 'the version probe failed'
      }`,
      compatible: false,
    };
  }

  if (!probed.ok) {
    return {
      state: 'VERSION_CHECK_FAILED',
      expected: normalizeVersion(input.expected),
      reported: null,
      reason: `the build-version handshake could not be completed: ${probed.problem}`,
      compatible: false,
    };
  }

  return decideHandshake(input.expected, probed.version);
}

/**
 * The refusal, as an error the shell's startup path can throw.
 *
 * Exists so that "the API is not the build we shipped" is one call site's decision rather than
 * a comparison repeated wherever a version is read.
 */
export function assertHandshakeCompatible(result: HandshakeResult): HandshakeResult {
  if (isHandshakeCompatible(result)) return result;
  throw new AppError(
    'POLICY_VIOLATION',
    result.reason ?? 'the API and the shell are not the same build',
    {
      details: {
        handshake: result.state,
        expected: result.expected,
        reported: result.reported,
      },
    },
  );
}
