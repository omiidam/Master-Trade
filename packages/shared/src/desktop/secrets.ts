/**
 * Secret storage contract — what may be stored, under what names, and what a runtime
 * without a keychain must do.
 *
 * The OS keychain has existed since Phase 2 in the Rust shell (`secrets.rs`) and the WebView has
 * always reached it through three explicit commands. What did not exist is a **contract**: the
 * keys were validated for shape only, so any shape-correct name was a legal keychain entry, and
 * nothing declared which credentials the product actually has or which code may read them.
 *
 * Three ideas make this a boundary rather than a helper.
 *
 * **1. Names are namespaced and finite.** Every key must live under `master-trade/`
 *    (`SECRET_NAMESPACE_PREFIX`), and the set of credentials the product has is declared here —
 *    not discoverable, not enumerable, not extendable by a caller. A key that is well-shaped but
 *    not declared is refused, so a command cannot be used to probe or list keychain entries, and
 *    an unrelated application that happened to choose the same *word* cannot collide with us: the
 *    OS entry is `(service = app.mastertrade.desktop, account = master-trade/…)`.
 *
 * **2. Existence is metadata; the value is not.** `has` exists so a screen can say "configured"
 *    without the secret crossing the IPC boundary at all — the same rule the Brain principle
 *    states: metadata may identify that a credential exists, the value never travels for display.
 *    A credential is not a Memory record, and this module is deliberately outside `memory/`.
 *
 * **3. Absence is not an error, and a browser has nothing to hide.** Reading a credential that is
 *    not configured returns `null` (a normal answer), while *writing* one where no keychain exists
 *    fails loudly. A preview must never report that it stored something it did not.
 *
 * What this module is not: it is not an implementation that touches the OS. It holds the names,
 * the validation and the fallback; `src/desktop/secure-store.ts` is the adapter over a port, and
 * `src-tauri/src/secrets.rs` is the only code that reaches the keychain.
 */

import { AppError, PolicyViolationError } from '../core/errors.js';

/** The service half of the OS keychain entry. Mirrored in `secrets.rs` and by `desktop:verify`. */
export const SECRET_NAMESPACE = 'master-trade';

/** Every key starts with this. The namespace is part of the key, not only of the service. */
export const SECRET_NAMESPACE_PREFIX = `${SECRET_NAMESPACE}/`;

/**
 * The shape a key must have. Deliberately narrower than "any string": letters, digits, `.`, `_`,
 * `-` and `/` only, so a key can never carry whitespace, a control character, a drive letter or a
 * path segment that a lower layer might interpret.
 */
export const SECRET_KEY_PATTERN = /^[a-z0-9][a-z0-9._/-]{0,119}$/i;

/** Longer than any credential this product stores; short enough not to be a file store. */
export const MAX_SECRET_BYTES = 8 * 1024;

/**
 * The credentials Master Trade actually has.
 *
 * Adding one is a deliberate edit here, in the Rust keychain module's namespace check, and in the
 * shared-surface consumers — which is the point: an undeclared credential cannot be read, written
 * or even asked about.
 */
export interface CredentialDescriptor {
  /** The keychain key, namespace included. */
  id: string;
  /** What it is for, in one line, safe to show a user. */
  purpose: string;
  /** True when the product cannot do its job without it; false when it degrades instead. */
  required: boolean;
  /** The only component permitted to read the value. Never a wildcard. */
  usedBy: string;
  /** False when the value must never leave the machine. */
  leavesTheDevice: boolean;
}

export const SESSION_TOKEN_CREDENTIAL = `${SECRET_NAMESPACE_PREFIX}session/token`;
export const AI_PROVIDER_KEY_CREDENTIAL = `${SECRET_NAMESPACE_PREFIX}ai/provider-key`;
/** Not a credential: a fixed key the shell writes to prove the keychain is reachable. */
export const KEYCHAIN_PROBE_CREDENTIAL = `${SECRET_NAMESPACE_PREFIX}probe`;

export const KNOWN_CREDENTIALS: readonly CredentialDescriptor[] = [
  {
    id: SESSION_TOKEN_CREDENTIAL,
    purpose: 'Bearer credential for the local authenticated realtime stream.',
    required: true,
    usedBy: 'web/realtime/session',
    leavesTheDevice: false,
  },
  {
    id: AI_PROVIDER_KEY_CREDENTIAL,
    purpose: 'Hosted model provider key. Absent means the offline scripted adapter answers.',
    required: false,
    usedBy: 'server/agent-gateway',
    leavesTheDevice: true,
  },
  {
    id: KEYCHAIN_PROBE_CREDENTIAL,
    purpose: 'Reachability probe written by the shell so the status card can report a keychain.',
    required: false,
    usedBy: 'desktop/shell-status',
    leavesTheDevice: false,
  },
];

export function knownCredentialIds(): string[] {
  return KNOWN_CREDENTIALS.map((credential) => credential.id);
}

export function credentialById(id: string): CredentialDescriptor | null {
  return KNOWN_CREDENTIALS.find((credential) => credential.id === id) ?? null;
}

/**
 * The environment variable a credential is injected under, when the shell hands it to the API
 * process. Deterministic because both sides derive it from the key alone.
 */
export function credentialEnvName(id: string): string {
  assertKnownCredential(id);
  const suffix = id
    .slice(SECRET_NAMESPACE_PREFIX.length)
    .split(/[^a-z0-9]+/i)
    .filter((part) => part.length > 0)
    .join('_')
    .toUpperCase();
  return `MASTER_TRADE_CREDENTIAL_${suffix}`;
}

/** The namespace, the shape and the absence of traversal segments. */
export function assertSecretKey(key: string): void {
  if (!key.startsWith(SECRET_NAMESPACE_PREFIX)) {
    throw new AppError(
      'VALIDATION_FAILED',
      `credential names must be namespaced under "${SECRET_NAMESPACE_PREFIX}"`,
      { details: { key: maskSecretKey(key) } },
    );
  }
  if (!SECRET_KEY_PATTERN.test(key)) {
    throw new AppError('VALIDATION_FAILED', 'a credential name has an invalid shape', {
      details: { key: maskSecretKey(key) },
    });
  }
  // Redundant with the shape rule today (a `.` is allowed, so `../` matches); kept because the
  // shape rule is the thing most likely to be relaxed later, and this is the property that matters.
  if (key.split('/').includes('..') || key.includes('\\')) {
    throw new AppError('VALIDATION_FAILED', 'a credential name may not contain a path segment', {
      details: { key: maskSecretKey(key) },
    });
  }
}

/**
 * A key must additionally be one the product declares.
 *
 * A policy refusal rather than a validation failure: the name is well-formed, and what is wrong is
 * that this product has no such credential — which is the shape an attempt to reach something
 * undeclared takes, whether it is a typo or a probe.
 */
export function assertKnownCredential(key: string): void {
  assertSecretKey(key);
  if (credentialById(key) === null) {
    throw new PolicyViolationError('that credential is not declared by this product', {
      key: maskSecretKey(key),
    });
  }
}

/**
 * A key, safe to log.
 *
 * Only the last path segment is kept, so a log line can say which credential was involved without
 * recording a name that may itself be chosen by an operator. The value is never involved at all.
 */
export function maskSecretKey(key: string): string {
  const parts = key.split('/');
  const last = parts[parts.length - 1] ?? '';
  return `${SECRET_NAMESPACE_PREFIX}…/${last.slice(0, 32)}`;
}

/** Bytes in a credential value, by UTF-8 length. */
export function secretByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/**
 * A value must be present and bounded. Refused with a message that never contains the value —
 * a validation error is exactly where a secret leaks by accident.
 */
export function assertSecretValue(value: string): void {
  if (value.length === 0) {
    throw new AppError('VALIDATION_FAILED', 'a credential value may not be empty');
  }
  const bytes = secretByteLength(value);
  if (bytes > MAX_SECRET_BYTES) {
    throw new AppError(
      'VALIDATION_FAILED',
      `a credential value may not exceed ${MAX_SECRET_BYTES} bytes`,
      { details: { bytes } },
    );
  }
}

/**
 * The port a real keychain sits behind.
 *
 * `has` is part of the port rather than derived from `get` so an implementation can answer
 * existence without materialising the value.
 */
export interface SecureStoragePort {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  /**
   * How this port reports its own state, when it knows better than a probe can.
   *
   * A keychain answers by being read, so the default check is to read the probe key. A port over
   * *injected* credentials knows its state directly (the channel exists; it may simply carry
   * nothing), and saying so is more honest than treating an unset probe as "keychain missing".
   */
  availability?(): SecureStorageAvailability;
}

export interface SecureStorageAvailability {
  available: boolean;
  reason: string;
}

/**
 * What a runtime without a keychain does.
 *
 * Reading is an empty answer (there is nothing stored, and pretending otherwise would be a lie of
 * a different kind); writing and deleting fail with a typed error, because silently accepting a
 * credential that was never stored is how a user believes a key is configured when it is not.
 */
export class UnavailableSecureStorage implements SecureStoragePort {
  constructor(private readonly why: string) {}

  availability(): SecureStorageAvailability {
    return { available: false, reason: this.why };
  }

  async get(): Promise<string | null> {
    return null;
  }

  async has(): Promise<boolean> {
    return false;
  }

  async set(): Promise<void> {
    throw new AppError('NOT_IMPLEMENTED', this.why, { details: { secureStorage: 'unavailable' } });
  }

  async delete(): Promise<void> {
    throw new AppError('NOT_IMPLEMENTED', this.why, { details: { secureStorage: 'unavailable' } });
  }
}
