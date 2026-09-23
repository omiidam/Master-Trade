/**
 * Credential storage, validated once.
 *
 * The port (`SecureStoragePort`) is whatever reaches a keychain — the Rust `secure_store_*`
 * commands in the shell, a test double elsewhere. This module is the layer that decides **what may
 * be asked of it**, so no caller has to remember the rules and no caller can forget them:
 *
 *   - a key must be namespaced and declared (`assertKnownCredential`), so the store cannot be used
 *     to probe, list or address an arbitrary keychain entry — not even one of our own that the
 *     product does not know about;
 *   - a value is checked for presence and size before it is written, and the refusal never
 *     contains the value;
 *   - `summary()` answers every question a screen actually asks — which credentials exist — and
 *     answers it from `has`, so **the value never crosses this boundary for display**;
 *   - `describe()` is the log-safe projection: metadata, never a value.
 *
 * Errors are curated rather than forwarded. A platform keychain error can carry an account name or
 * an OS path, and these messages end up in a status card and a log record, so the condition is
 * named and the detail is not.
 */

import { AppError } from '../../packages/shared/src/core/errors.js';
import {
  KNOWN_CREDENTIALS,
  KEYCHAIN_PROBE_CREDENTIAL,
  assertKnownCredential,
  assertSecretValue,
  credentialById,
  type SecureStorageAvailability,
  type SecureStoragePort,
} from '../../packages/shared/src/desktop/secrets.js';

/** What a screen may know about one credential. There is no value in this shape, by design. */
export interface CredentialMetadata {
  id: string;
  purpose: string;
  required: boolean;
  usedBy: string;
  leavesTheDevice: boolean;
  configured: boolean;
}

export interface CredentialSummary {
  available: boolean;
  reason: string;
  credentials: CredentialMetadata[];
}

export interface SecureCredentialStoreOptions {
  now?: () => number;
}

export class SecureCredentialStore {
  private readonly port: SecureStoragePort;
  private readonly now: () => number;

  constructor(port: SecureStoragePort, options: SecureCredentialStoreOptions = {}) {
    this.port = port;
    this.now = options.now ?? Date.now;
  }

  /**
   * Whether a real credential store is reachable.
   *
   * Answered by reading the probe key, not by trusting a flag: an implementation that reports
   * itself available and then throws on the first write is the failure this check exists to catch.
   * A thrown error is reported as unavailable rather than propagated — a status card must render
   * something, and the platform message is not something to render.
   */
  async availability(): Promise<SecureStorageAvailability> {
    // A port that knows its own state is believed before a probe is attempted: an injected
    // credential channel is readable whether or not it happens to contain anything.
    if (typeof this.port.availability === 'function') {
      try {
        return this.port.availability();
      } catch {
        return { available: false, reason: 'the credential store could not be reached' };
      }
    }
    try {
      await this.port.has(KEYCHAIN_PROBE_CREDENTIAL);
      return { available: true, reason: 'the OS credential store answered' };
    } catch {
      return { available: false, reason: 'the OS credential store could not be reached' };
    }
  }

  async get(id: string): Promise<string | null> {
    assertKnownCredential(id);
    return this.port.get(id);
  }

  async set(id: string, value: string): Promise<void> {
    assertKnownCredential(id);
    assertSecretValue(value);
    await this.port.set(id, value);
  }

  async delete(id: string): Promise<void> {
    assertKnownCredential(id);
    await this.port.delete(id);
  }

  async exists(id: string): Promise<boolean> {
    assertKnownCredential(id);
    return this.port.has(id);
  }

  /**
   * Every declared credential and whether it is configured.
   *
   * `required` is reported so a caller can distinguish "the product cannot start" from "a hosted
   * provider will be skipped", without either of them inventing a placeholder value.
   */
  async summary(): Promise<CredentialSummary> {
    const availability = await this.availability();
    const credentials: CredentialMetadata[] = [];
    for (const descriptor of KNOWN_CREDENTIALS) {
      let configured = false;
      if (availability.available) {
        try {
          configured = await this.port.has(descriptor.id);
        } catch {
          // One unreadable entry must not turn the whole report into an error.
          configured = false;
        }
      }
      credentials.push({
        id: descriptor.id,
        purpose: descriptor.purpose,
        required: descriptor.required,
        usedBy: descriptor.usedBy,
        leavesTheDevice: descriptor.leavesTheDevice,
        configured,
      });
    }
    return { available: availability.available, reason: availability.reason, credentials };
  }

  /** True when every `required` credential is configured. */
  async requiredCredentialsPresent(): Promise<boolean> {
    const summary = await this.summary();
    if (!summary.available) return false;
    return summary.credentials
      .filter((credential) => credential.required)
      .every((credential) => credential.configured);
  }

  /**
   * The log-safe projection: which credentials exist, and nothing else. Deliberately the shape a
   * logger receives, so "just log the store" cannot leak a value.
   */
  async describe(): Promise<{ available: boolean; configured: string[]; missing: string[] }> {
    const summary = await this.summary();
    return {
      available: summary.available,
      configured: summary.credentials
        .filter((credential) => credential.configured)
        .map((credential) => credential.id),
      missing: summary.credentials
        .filter((credential) => !credential.configured && credential.required)
        .map((credential) => credential.id),
    };
  }

  /** A credential's declared purpose, for an error message that must stay value-free. */
  purposeOf(id: string): string {
    return credentialById(id)?.purpose ?? 'an undeclared credential';
  }

  /** When this store was last asked to prove itself available. Metadata for a status card. */
  checkedAt(): string {
    return new Date(this.now()).toISOString();
  }
}

/**
 * A port backed by an in-memory map. Tests and the browser-side adapter use it; it is never a
 * fallback in the shell, because a credential that lives only in memory is not stored.
 */
export class InMemorySecureStorage implements SecureStoragePort {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.values.has(key);
  }
}

/** A port whose every operation fails, for testing the unavailable path. */
export class FailingSecureStorage implements SecureStoragePort {
  constructor(private readonly reason = 'no credential store is available') {}

  private fail(): never {
    throw new AppError('PROVIDER_UNAVAILABLE', this.reason);
  }

  async get(): Promise<string | null> {
    return this.fail();
  }

  async has(): Promise<boolean> {
    return this.fail();
  }

  async set(): Promise<void> {
    this.fail();
  }

  async delete(): Promise<void> {
    this.fail();
  }
}
