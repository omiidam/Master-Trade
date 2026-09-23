/**
 * Credential vault — the lifecycle around a credential, and the only thing that holds a value.
 *
 * Phase 6.4 could have ended at "there is a validated store". It does not, because a store alone
 * leaves three questions unanswered, and each one is a way a secret escapes:
 *
 *   1. **Where does the API process get a keychain credential from?** It cannot read the OS
 *      keychain — only the Rust shell can. The shell hands credentials to the API process through
 *      its own environment, under names derived from the credential id
 *      (`credentialEnvName`). `InjectedEnvironmentStorage` is that channel, expressed as the same
 *      port the keychain sits behind, so there is one abstraction rather than two.
 *   2. **When is a credential read, and when is it released?** At startup, once, into memory; at
 *      shutdown, dropped. A credential resolved on every call is a credential read on every call
 *      for no gain, and one that is never released outlives the app in a process that outlives it
 *      (a supervisor's restart).
 *   3. **What may the rest of the system see?** `describe()` — and therefore `toJSON()`, and
 *      therefore anything that logs or serialises the vault — is metadata only: which credentials
 *      exist, where each came from, and why one is absent. A value has no path out of this class
 *      except `resolve()`, which is handed only to the composition root that builds a provider.
 *
 * Master Trade Brain, explicitly: this module is **not** memory. A credential is never a Memory
 * record, is never written to `memory_records`, and `describe()` is the only shape the vault offers
 * to a context builder — so a reasoning turn can know that a provider key exists without the key
 * being anywhere in its input. That is the point of keeping the vault outside `memory/`.
 */

import type { SecretRef } from '../core/config.js';
import { PolicyViolationError } from '../../packages/shared/src/core/errors.js';
import {
  KEYCHAIN_PROBE_CREDENTIAL,
  KNOWN_CREDENTIALS,
  assertKnownCredential,
  credentialById,
  credentialEnvName,
  maskSecretKey,
  type SecureStorageAvailability,
  type SecureStoragePort,
} from '../../packages/shared/src/desktop/secrets.js';
import type { SecureCredentialStore } from './secure-store.js';

/** Where a credential's value came from. Reported, never inferred. */
export type CredentialSource = 'keychain' | 'injected' | 'environment';

/** One credential as the vault may describe it. There is no value in this shape. */
export interface VaultEntry {
  /** `keychain:master-trade/session/token`, or `env:MY_VAR` for a plain environment ref. */
  ref: string;
  id: string | null;
  source: CredentialSource;
  loaded: boolean;
  /** Why it is not loaded, when it is not. Safe to log and safe to show. */
  reason: string | null;
}

export interface CredentialVaultOptions {
  store: SecureCredentialStore;
  /** The environment a keychain credential is injected through. Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
  now?: () => number;
}

/**
 * A port over *injected* credentials: the shell's own environment.
 *
 * Read-only by construction. The API process has no keychain, so `set` and `delete` refuse rather
 * than writing somewhere else — a filesystem- or database-backed "fallback" is the single worst
 * implementation of this interface, and its absence here is deliberate rather than unfinished.
 */
export class InjectedEnvironmentStorage implements SecureStoragePort {
  constructor(private readonly env: Record<string, string | undefined> = process.env) {}

  availability(): SecureStorageAvailability {
    return {
      available: true,
      reason: 'credentials are supplied by the shell through this process environment',
    };
  }

  private read(key: string): string | null {
    assertKnownCredential(key);
    const value = this.env[credentialEnvName(key)];
    return value === undefined || value.length === 0 ? null : value;
  }

  async get(key: string): Promise<string | null> {
    return this.read(key);
  }

  async has(key: string): Promise<boolean> {
    return this.read(key) !== null;
  }

  async set(): Promise<void> {
    throw new PolicyViolationError(
      'a credential cannot be written from this process; the desktop shell owns the keychain',
    );
  }

  async delete(): Promise<void> {
    throw new PolicyViolationError(
      'a credential cannot be deleted from this process; the desktop shell owns the keychain',
    );
  }
}

export class CredentialVault {
  private readonly store: SecureCredentialStore;
  private readonly env: Record<string, string | undefined>;
  private readonly now: () => number;
  /** id → value. The only place a value lives, and it is not enumerable through JSON. */
  private readonly values = new Map<string, string>();
  private entries: VaultEntry[] = [];
  private released = false;

  constructor(options: CredentialVaultOptions) {
    this.store = options.store;
    this.env = options.env ?? process.env;
    this.now = options.now ?? Date.now;
  }

  /**
   * Read the named credentials into memory, once.
   *
   * Every failure here is **reported, not thrown**: a missing credential and an unreachable
   * keychain both leave the product able to run (the offline adapter answers), and a startup that
   * refuses over an absent optional key would be a worse product than one that says what is
   * missing. The one thing that does throw is asking for a credential this product does not
   * declare — that is a programming error or an attack, not a configuration state.
   */
  async load(refs: readonly SecretRef[] = defaultCredentialRefs()): Promise<VaultEntry[]> {
    this.entries = [];
    this.released = false;
    for (const ref of refs) {
      if (ref.kind === 'env') {
        const value = this.env[ref.name];
        const loaded = value !== undefined && value.length > 0;
        this.entries.push({
          ref: `env:${ref.name}`,
          id: null,
          source: 'environment',
          loaded,
          reason: loaded ? null : 'the environment variable is not set',
        });
        continue;
      }

      // A keychain reference to an undeclared credential is refused before a read is attempted.
      const descriptor = credentialById(ref.name);
      if (descriptor === null) {
        throw new PolicyViolationError(
          'a credential that this product does not declare cannot be requested',
          { key: maskSecretKey(ref.name) },
        );
      }

      try {
        const value = await this.store.get(ref.name);
        if (value === null) {
          this.entries.push({
            ref: `keychain:${ref.name}`,
            id: ref.name,
            source: 'keychain',
            loaded: false,
            reason: 'the credential is not configured',
          });
          continue;
        }
        this.values.set(ref.name, value);
        this.entries.push({
          ref: `keychain:${ref.name}`,
          id: ref.name,
          source: 'keychain',
          loaded: true,
          reason: null,
        });
      } catch {
        // Unavailable, unreadable or denied: all three are "not loaded", and none of them may
        // stop the app. The reason is deliberately coarse — a platform error can name an entry.
        this.entries.push({
          ref: `keychain:${ref.name}`,
          id: ref.name,
          source: 'keychain',
          loaded: false,
          reason: 'the credential could not be read',
        });
      }
    }
    return this.describe();
  }

  /**
   * The synchronous resolver the composition root injects.
   *
   * Synchronous because the gateway's resolver is: a credential is read once at startup rather
   * than on every model call, which is also why `load()` exists.
   */
  resolve(ref: SecretRef | null | undefined): string | null {
    if (!ref) return null;
    if (ref.kind === 'env') {
      const value = this.env[ref.name];
      return value === undefined || value.length === 0 ? null : value;
    }
    const descriptor = credentialById(ref.name);
    if (descriptor === null) return null;
    if (this.released) return null;
    return this.values.get(ref.name) ?? null;
  }

  /** Replace a credential's value, in the store and in memory, together. */
  async rotate(id: string, value: string): Promise<void> {
    assertKnownCredential(id);
    await this.store.set(id, value);
    this.values.set(id, value);
    this.released = false;
    this.upsertEntry(id, true, null);
  }

  /** Remove a credential. Absent is a normal state, so this is not an error when it is gone. */
  async remove(id: string): Promise<void> {
    assertKnownCredential(id);
    await this.store.delete(id);
    this.values.delete(id);
    this.upsertEntry(id, false, 'the credential is not configured');
  }

  /**
   * Release every in-memory reference. Called on shutdown.
   *
   * After this, `resolve` answers `null` for every credential: a supervisor that restarts the API
   * without restarting the shell must not leave a value reachable in a process it thinks it
   * stopped. Metadata survives, because it holds no value — `describe()` still works.
   */
  clear(): void {
    this.values.clear();
    this.released = true;
  }

  /** True once `clear()` has run and nothing has been loaded or rotated since. */
  isReleased(): boolean {
    return this.released;
  }

  /** Record a rotation or removal in the metadata, so a status card stays truthful. */
  private upsertEntry(id: string, loaded: boolean, reason: string | null): void {
    const ref = `keychain:${id}`;
    const entry: VaultEntry = { ref, id, source: 'keychain', loaded, reason };
    const index = this.entries.findIndex((existing) => existing.ref === ref);
    if (index === -1) this.entries.push(entry);
    else this.entries[index] = entry;
  }

  /** Every credential the vault knows about, and never a value. */
  describe(): VaultEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  /** The shape a logger or a context builder receives. A value cannot appear in it. */
  toJSON(): { credentials: VaultEntry[]; released: boolean } {
    return { credentials: this.describe(), released: this.released };
  }

  /** Which configured credentials are absent, by id — for a status line, never a value. */
  missing(): string[] {
    return this.entries
      .filter((entry) => !entry.loaded && entry.id !== null)
      .map((entry) => entry.id as string);
  }

  /** The declared credentials this process may ask for, as refs. */
  static declaredRefs(): SecretRef[] {
    return defaultCredentialRefs();
  }

  /** Timestamp of the last lifecycle event, for the status card. Never a value. */
  checkedAt(): string {
    return new Date(this.now()).toISOString();
  }
}

/**
 * The credentials the desktop composition asks for.
 *
 * The probe key is not a credential and is not requested: it exists so the *shell* can prove the
 * keychain is reachable, and asking for it here would report a permanent, meaningless "missing".
 */
export function defaultCredentialRefs(): SecretRef[] {
  return KNOWN_CREDENTIALS.filter((credential) => credential.id !== KEYCHAIN_PROBE_CREDENTIAL).map(
    (credential): SecretRef => ({ kind: 'keychain', name: credential.id }),
  );
}

/** The resolver shape the gateway composition expects. */
export function createVaultResolver(vault: CredentialVault): (ref: SecretRef) => string | null {
  return (ref: SecretRef) => vault.resolve(ref);
}
