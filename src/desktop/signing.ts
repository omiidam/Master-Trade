/**
 * The update-signing boundary: what a release is allowed to be built from.
 *
 * Tauri's updater verifies a downloaded artifact against a public key compiled into the binary.
 * That means the key is a *release* input, and the failure it prevents is specific and quiet: a
 * build carrying a placeholder key still starts, still checks, still downloads — and refuses
 * every genuine update with a signature error, forever, on every machine. The user sees an app
 * that says "up to date" while being permanently un-updatable.
 *
 * So the rule this module exists to enforce:
 *
 *   **In production, absent, placeholder or malformed signing material is an error, not a
 *   warning.** There is no third state in which a build is "probably fine to ship".
 *
 * What it deliberately does not do
 * -------------------------------
 * It cannot verify a signature, and it does not pretend to: verifying requires the private key to
 * have signed something, and checking a real signature against a real key is the one thing this
 * environment has no material for (and must not have — a private key in the repository is the
 * defect this whole area is about). What it *can* do is refuse to call a release signed when the
 * material needed to sign one is not there, which is exactly what stops a release from being
 * *described* as signed. `docs/desktop-release.md` §5 records the boundary.
 *
 * The verification that does happen is at runtime and is Tauri's: `tauri-plugin-updater` refuses
 * an artifact whose signature does not match the bundled key. This module decides what may be
 * bundled, and the plugin decides what may be installed.
 */

import { AppError } from '../../packages/shared/src/core/errors.js';
import { isProduction, type DesktopEnvironment } from './environment.js';

/** How usable one piece of signing material is. */
export type SigningMaterialState = 'absent' | 'placeholder' | 'malformed' | 'insecure' | 'valid';

export interface SigningAspect {
  id: string;
  state: SigningMaterialState;
  /** What was found, in a sentence that never quotes a key. */
  detail: string;
  /** True when this aspect alone stops a production release. */
  blocksRelease: boolean;
}

export interface SigningReport {
  environment: DesktopEnvironment;
  aspects: SigningAspect[];
  /** True when the material is sufficient to build a release that can actually receive updates. */
  releasable: boolean;
  /** Reasons a production release is refused. Empty in a development run, by design. */
  blockers: string[];
  /** True when the mode is not production, so missing material is reported and not fatal. */
  relaxed: boolean;
}

/**
 * Substrings that mean "somebody meant to replace this".
 *
 * Uppercase comparison, and a marker anywhere in the value: a placeholder is written by a human
 * under time pressure, so it is better to refuse one that is *nearly* right than to accept it and
 * ship an app that cannot update.
 */
export const PLACEHOLDER_MARKERS = [
  'REPLACE_WITH',
  'REPLACE-ME',
  'REPLACEME',
  'PLACEHOLDER',
  'CHANGEME',
  'CHANGE_ME',
  'YOUR_KEY',
  'TODO',
  'FIXME',
  'XXX',
] as const;

/**
 * The shape of a minisign public key, which is what Tauri's updater stores in `plugins.updater.pubkey`.
 *
 * The file Tauri generates has exactly two non-empty lines: an `untrusted comment:` line, and a
 * base64 blob whose first two decoded bytes are the minisign public-key algorithm marker (`RW`).
 * Requiring both is what separates "a key is configured" from "some string is configured" — and a
 * string is the failure mode, because a truncated paste still looks like configuration.
 */
export const MINISIGN_PUBLIC_KEY_PATTERN = /^untrusted comment:[^\n]*\n[A-Za-z0-9+/=]{40,}\n?$/;

/** Hosts that are reserved and therefore cannot serve an update (RFC 2606). */
export const RESERVED_UPDATE_HOSTS = ['.invalid', '.example', '.test', '.localhost'] as const;

export interface UpdateSigningMaterial {
  /** The raw `plugins.updater` block, or `null` when it is missing. */
  pubkey: string | null;
  endpoints: string[];
}

/** Read `plugins.updater` out of a parsed `tauri.conf.json`. */
export function readUpdateSigningMaterial(conf: unknown): UpdateSigningMaterial {
  const plugins =
    conf && typeof conf === 'object' && !Array.isArray(conf)
      ? (((conf as Record<string, unknown>).plugins ?? {}) as Record<string, unknown>)
      : {};
  const updater = (plugins.updater ?? {}) as Record<string, unknown>;
  return {
    pubkey: typeof updater.pubkey === 'string' ? updater.pubkey : null,
    endpoints: Array.isArray(updater.endpoints)
      ? updater.endpoints.filter((entry): entry is string => typeof entry === 'string')
      : [],
  };
}

/** Classify the public key without ever echoing it. */
export function classifyUpdatePublicKey(pubkey: string | null): SigningAspect {
  const value = (pubkey ?? '').trim();
  if (value.length === 0) {
    return {
      id: 'signing.update-key',
      state: 'absent',
      detail:
        'no updater public key is configured, so no downloaded artifact could be verified against it',
      blocksRelease: true,
    };
  }
  const upper = value.toUpperCase();
  const marker = PLACEHOLDER_MARKERS.find((candidate) => upper.includes(candidate));
  if (marker) {
    return {
      id: 'signing.update-key',
      state: 'placeholder',
      detail: `the updater public key is still a placeholder (contains "${marker}")`,
      blocksRelease: true,
    };
  }
  if (!MINISIGN_PUBLIC_KEY_PATTERN.test(`${value}\n`)) {
    return {
      id: 'signing.update-key',
      state: 'malformed',
      detail:
        'the updater public key is not a minisign public key (expected an `untrusted comment:` line followed by a base64 blob)',
      blocksRelease: true,
    };
  }
  return {
    id: 'signing.update-key',
    state: 'valid',
    detail: 'a minisign public key is configured (value never read or echoed)',
    blocksRelease: false,
  };
}

/** Classify the endpoint list: https, at least one, and not on a reserved host. */
export function classifyUpdateEndpoints(endpoints: readonly string[]): SigningAspect[] {
  if (endpoints.length === 0) {
    return [
      {
        id: 'signing.update-endpoints',
        state: 'absent',
        detail: 'no update endpoint is configured, so a shipped build could never check for one',
        blocksRelease: true,
      },
    ];
  }

  const aspects: SigningAspect[] = [];
  const insecure = endpoints.filter((endpoint) => !endpoint.startsWith('https://'));
  aspects.push({
    id: 'signing.update-endpoints-https',
    state: insecure.length === 0 ? 'valid' : 'insecure',
    detail:
      insecure.length === 0
        ? `every update endpoint is https (${endpoints.length})`
        : `an update endpoint is not https: ${insecure.join(', ')}`,
    // Always blocking, in every mode. An update fetched over plaintext can be replaced in
    // transit, and the signature check is what makes that survivable — but asking for a
    // plaintext channel in the first place is a defect worth fixing rather than relying on the
    // signature to cover.
    blocksRelease: insecure.length > 0,
  });

  const reserved = endpoints.filter((endpoint) =>
    RESERVED_UPDATE_HOSTS.some((host) => endpoint.includes(host)),
  );
  aspects.push({
    id: 'signing.update-endpoints-reachable',
    state: reserved.length === 0 ? 'valid' : 'placeholder',
    detail:
      reserved.length === 0
        ? 'no update endpoint uses a reserved host'
        : `reserved host in use: ${reserved.join(', ')} (a debug endpoint that can never resolve)`,
    blocksRelease: reserved.length > 0,
  });

  return aspects;
}

/**
 * Review everything a release needs before it may be called signed.
 *
 * The reduction is the load-bearing part: `releasable` is true only when *every* aspect is valid.
 * A caller cannot pick the aspects it likes, and `blockers` is populated only in production —
 * which is the single place the mode changes an outcome.
 */
export function reviewSigning(conf: unknown, environment: DesktopEnvironment): SigningReport {
  const material = readUpdateSigningMaterial(conf);
  const aspects = [
    classifyUpdatePublicKey(material.pubkey),
    ...classifyUpdateEndpoints(material.endpoints),
  ];
  const production = isProduction(environment);
  const incomplete = aspects.filter((aspect) => aspect.blocksRelease);
  const releasable = incomplete.length === 0;
  return {
    environment,
    aspects,
    releasable,
    blockers: production && !releasable ? incomplete.map((aspect) => aspect.detail) : [],
    relaxed: !production,
  };
}

/**
 * Refuse a release that cannot be updated.
 *
 * Returns the report on success so the caller can record what was reviewed rather than re-reading
 * the config, and throws with every blocker named so one run fixes all of them.
 */
export function assertReleaseSignable(
  conf: unknown,
  environment: DesktopEnvironment,
): SigningReport {
  const report = reviewSigning(conf, environment);
  if (!isProduction(environment) || report.releasable) return report;
  throw new AppError(
    'POLICY_VIOLATION',
    `refusing to produce a release: the update signing material is not usable — ${report.blockers.join(' | ')}`,
    {
      details: { environment, blockers: report.blockers, aspects: report.aspects.map((a) => a.id) },
    },
  );
}

/**
 * Whether a build may describe itself as a signed production release.
 *
 * One function, because the answer appears in release metadata and must never be derived twice: a
 * `true` here requires both that the material is complete *and* that the build is a production
 * one. A development build is never "a signed release", however good its key looks.
 */
export function describesSignedProductionRelease(
  conf: unknown,
  environment: DesktopEnvironment,
): boolean {
  return isProduction(environment) && reviewSigning(conf, environment).releasable;
}
