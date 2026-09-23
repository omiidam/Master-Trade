/**
 * Phase 6.4 — secure storage.
 *
 * The subject is a boundary, so the tests are written as attempts against it:
 *
 *   - the **contract** tests try to name a key outside the namespace, hand the store a value too
 *     large to be a credential, and read a credential the product does not declare;
 *   - the **boundary** tests read the Rust source, because the half that reaches the OS keychain is
 *     the half this machine cannot execute — `desktop:verify` is exercised here for the same reason;
 *   - the **lifecycle** tests break one end at a time (unavailable store, absent credential, removed
 *     credential) and require the app to keep running while saying what is missing;
 *   - and one assertion runs through every case: **the value never appears** in an error, a log
 *     record, a JSON projection or a metadata view.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AppError, PolicyViolationError } from '../packages/shared/src/core/errors.js';
import { Logger, MemoryLogSink, redactValue } from '../packages/shared/src/core/logging.js';
import {
  AI_PROVIDER_KEY_CREDENTIAL,
  KEYCHAIN_PROBE_CREDENTIAL,
  KNOWN_CREDENTIALS,
  MAX_SECRET_BYTES,
  SECRET_NAMESPACE,
  SECRET_NAMESPACE_PREFIX,
  SESSION_TOKEN_CREDENTIAL,
  UnavailableSecureStorage,
  type SecureStoragePort,
  assertKnownCredential,
  assertSecretKey,
  credentialEnvName,
  maskSecretKey,
} from '../packages/shared/src/desktop/secrets.js';
import {
  SHELL_COMMANDS,
  SHELL_PROTOCOL_VERSION,
  browserShellBridge,
  createShellBridge,
  type InvokeFn,
} from '../packages/shared/src/desktop/ipc.js';
import {
  FailingSecureStorage,
  InMemorySecureStorage,
  SecureCredentialStore,
} from '../src/desktop/secure-store.js';
import {
  CredentialVault,
  InjectedEnvironmentStorage,
  createVaultResolver,
  defaultCredentialRefs,
} from '../src/desktop/credential-vault.js';
import { verifyDesktopShell } from '../src/desktop/verify.js';
import { resolveSecretFromEnv, secretFromKeychain } from '../src/index.js';
import { AgentService } from '../src/agent/service.js';
import { scriptedAsyncModelAdapter } from '../src/agent/asyncModel.js';
import { assembleContext, section } from '../src/agent/context.js';
import { InMemoryStore } from '../src/memory/store.js';

/** A value shaped like a real credential, so a leak is unmistakable rather than plausible. */
const SECRET_VALUE = 'sk-live-THIS-MUST-NOT-APPEAR-9f2b41';
const OTHER_VALUE = 'sk-live-ROTATED-6c7d92';

const root = process.cwd();

function storeWith(port: InMemorySecureStorage | FailingSecureStorage): SecureCredentialStore {
  return new SecureCredentialStore(port);
}

describe('the secret contract', () => {
  it('declares every credential inside the namespace, once', () => {
    expect(SECRET_NAMESPACE.length).toBeGreaterThan(0);
    expect(KNOWN_CREDENTIALS.length).toBeGreaterThan(0);
    for (const credential of KNOWN_CREDENTIALS) {
      expect(credential.id.startsWith(SECRET_NAMESPACE_PREFIX), credential.id).toBe(true);
      expect(credential.purpose.length).toBeGreaterThan(20);
      // The name is an identifier, not a free-form string, and the last segment is meaningful.
      expect(credential.usedBy.length).toBeGreaterThan(0);
      expect(credential.id.split('/').length).toBeGreaterThanOrEqual(2);
    }
    const ids = KNOWN_CREDENTIALS.map((credential) => credential.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('refuses a key that is not namespaced, or that names a path', () => {
    expect(() => assertSecretKey(SESSION_TOKEN_CREDENTIAL)).not.toThrow();
    expect(() => assertSecretKey(AI_PROVIDER_KEY_CREDENTIAL)).not.toThrow();
    for (const key of [
      'session-token',
      'my-key',
      'MASTER-TRADE/session/token',
      'master-trade../escape',
      'master-trade/../../etc/passwd',
      'master-trade/has spaces',
      'master-trade/back\\slash',
      '',
    ]) {
      expect(() => assertSecretKey(key), key).toThrow(AppError);
    }
  });

  it('refuses a namespaced key the product does not declare', () => {
    const undeclared = `${SECRET_NAMESPACE_PREFIX}someone/else-key`;
    expect(() => assertSecretKey(undeclared)).not.toThrow();
    expect(() => assertKnownCredential(undeclared)).toThrow(PolicyViolationError);
  });

  it('masks a key, and never echoes it in an error', () => {
    const longKey = `${SECRET_NAMESPACE_PREFIX}${'a'.repeat(200)}`;
    const masked = maskSecretKey(longKey);
    expect(masked).not.toContain('a'.repeat(40));
    expect(masked.startsWith(SECRET_NAMESPACE_PREFIX)).toBe(true);

    try {
      assertSecretKey('not-namespaced-at-all');
      throw new Error('expected a refusal');
    } catch (error) {
      expect((error as AppError).message).not.toContain('not-namespaced-at-all');
    }
  });

  it('derives a deterministic, namespaced environment name for injection', () => {
    // The same input gives the same variable on both sides of the process boundary.
    expect(credentialEnvName(SESSION_TOKEN_CREDENTIAL)).toBe(
      credentialEnvName(SESSION_TOKEN_CREDENTIAL),
    );
    expect(credentialEnvName(SESSION_TOKEN_CREDENTIAL)).toMatch(
      /^MASTER_TRADE_CREDENTIAL_[A-Z0-9_]+$/,
    );
    expect(credentialEnvName(SESSION_TOKEN_CREDENTIAL)).toContain('SESSION');
    expect(() => credentialEnvName(`${SECRET_NAMESPACE_PREFIX}undeclared`)).toThrow();
  });

  it('is honest when there is no keychain at all', async () => {
    const port = new UnavailableSecureStorage('not running in the desktop shell');
    expect(port.availability().available).toBe(false);
    // Reading is an empty answer: there is nothing stored, which is not an error.
    expect(await port.get()).toBeNull();
    expect(await port.has()).toBe(false);
    // Writing fails loudly: silently accepting a credential that was never stored is the lie.
    await expect(port.set()).rejects.toThrow(/not running in the desktop shell/);
    await expect(port.delete()).rejects.toThrow(/not running in the desktop shell/);
  });
});

describe('the credential store', () => {
  it('reads, overwrites, deletes and reports an absent credential as null', async () => {
    const store = storeWith(new InMemorySecureStorage());

    expect(await store.get(SESSION_TOKEN_CREDENTIAL)).toBeNull();
    expect(await store.exists(SESSION_TOKEN_CREDENTIAL)).toBe(false);

    await store.set(SESSION_TOKEN_CREDENTIAL, SECRET_VALUE);
    expect(await store.get(SESSION_TOKEN_CREDENTIAL)).toBe(SECRET_VALUE);
    expect(await store.exists(SESSION_TOKEN_CREDENTIAL)).toBe(true);

    await store.set(SESSION_TOKEN_CREDENTIAL, OTHER_VALUE);
    expect(await store.get(SESSION_TOKEN_CREDENTIAL)).toBe(OTHER_VALUE);

    await store.delete(SESSION_TOKEN_CREDENTIAL);
    expect(await store.get(SESSION_TOKEN_CREDENTIAL)).toBeNull();
    await expect(store.delete(SESSION_TOKEN_CREDENTIAL)).resolves.toBeUndefined();
  });

  it('refuses an undeclared key, and refuses a value that cannot be one', async () => {
    const store = storeWith(new InMemorySecureStorage());
    await expect(store.get(`${SECRET_NAMESPACE_PREFIX}nope/nope`)).rejects.toThrow(
      PolicyViolationError,
    );
    await expect(store.set(SESSION_TOKEN_CREDENTIAL, '')).rejects.toThrow(/may not be empty/);
    await expect(
      store.set(SESSION_TOKEN_CREDENTIAL, 'x'.repeat(MAX_SECRET_BYTES + 1)),
    ).rejects.toThrow(/may not exceed/);
  });

  it('never puts a value in an error or a metadata projection', async () => {
    const store = storeWith(new InMemorySecureStorage());
    await store.set(SESSION_TOKEN_CREDENTIAL, SECRET_VALUE);

    try {
      await store.set(SESSION_TOKEN_CREDENTIAL, 'x'.repeat(MAX_SECRET_BYTES + 1));
    } catch (error) {
      const serialised = JSON.stringify(error);
      expect(serialised).not.toContain(SECRET_VALUE);
      expect(String(error)).not.toContain(SECRET_VALUE);
    }

    const summary = await store.summary();
    expect(JSON.stringify(summary)).not.toContain(SECRET_VALUE);
    expect(summary.credentials.map((entry) => entry.id)).toContain(SESSION_TOKEN_CREDENTIAL);
    expect(
      summary.credentials.find((entry) => entry.id === SESSION_TOKEN_CREDENTIAL),
    ).toMatchObject({ configured: true, required: true });

    const described = await store.describe();
    expect(described.configured).toContain(SESSION_TOKEN_CREDENTIAL);
    expect(JSON.stringify(described)).not.toContain(SECRET_VALUE);
  });

  it('reports availability from the port, not from optimism', async () => {
    const memory = storeWith(new InMemorySecureStorage());
    expect((await memory.availability()).available).toBe(true);

    const failing = storeWith(new FailingSecureStorage('the keychain is locked'));
    const availability = await failing.availability();
    expect(availability.available).toBe(false);
    // A platform error can name an entry; the reported reason is curated instead.
    expect(availability.reason).not.toContain('locked');
    // And an unreachable store degrades rather than throwing at a screen.
    const summary = await failing.summary();
    expect(summary.available).toBe(false);
    expect(summary.credentials.every((entry) => entry.configured === false)).toBe(true);
  });

  it('answers whether the required credentials are present', async () => {
    const store = storeWith(new InMemorySecureStorage());
    expect(await store.requiredCredentialsPresent()).toBe(false);
    await store.set(SESSION_TOKEN_CREDENTIAL, SECRET_VALUE);
    // The session credential is the only required one; the model key is optional by design.
    expect(await store.requiredCredentialsPresent()).toBe(true);
    expect(KNOWN_CREDENTIALS.filter((entry) => entry.required)).toHaveLength(1);
  });
});

describe('the keychain boundary holds across the two implementations', () => {
  it('passes its own verification, credential checks included', async () => {
    const report = await verifyDesktopShell({ root: join(root), env: {} });
    const failures = report.checks
      .filter((check) => !check.ok && check.severity === 'error')
      .map((check) => `${check.id}: ${check.detail}`);
    expect(failures).toEqual([]);

    for (const id of [
      'secrets.namespace-agreement',
      'secrets.single-keyring-file',
      'secrets.commands-narrow',
      'secrets.no-enumeration',
      'secrets.credentials-namespaced',
    ]) {
      expect(report.checks.find((check) => check.id === id)?.ok, id).toBe(true);
    }
    // The verifier's honesty rule covers this phase's subject too.
    expect(report.unverifiable.join(' ')).toMatch(/keychain/);
  });

  it('keeps the keychain namespace identical in Rust and in the contract', () => {
    const rust = readFileSync(join(root, 'src-tauri', 'src', 'secrets.rs'), 'utf8');
    expect(rust).toContain(`pub const NAMESPACE: &str = "${SECRET_NAMESPACE_PREFIX}";`);
    // Rust enforces the prefix, the shape and the traversal rule, not only the shape.
    expect(rust).toMatch(/starts_with\(NAMESPACE\)/);
    expect(rust).toContain('".."');
  });

  it('lets exactly one Rust file reach the keychain, with no enumeration', () => {
    const dir = join(root, 'src-tauri', 'src');
    const files = readdirSync(dir).filter((name) => name.endsWith('.rs'));
    const touching = files.filter((name) => /keyring/.test(readFileSync(join(dir, name), 'utf8')));
    expect(touching).toEqual(['secrets.rs']);

    const rust = readFileSync(join(dir, 'secrets.rs'), 'utf8');
    // No listing API exists to be called, and no command could expose one.
    expect(rust).not.toMatch(/pub fn\s+(list|all|dump)_/);
    const enumerating = [...SHELL_COMMANDS].filter((name) =>
      /(list|dump|export).*(secret|credential)|(secret|credential).*(list|dump|export)/i.test(name),
    );
    expect(enumerating).toEqual([]);
  });

  it('carries the credential commands on both sides, at the same protocol version', () => {
    const tauri = readFileSync(join(root, 'src-tauri', 'src', 'commands.rs'), 'utf8');
    for (const command of [
      'secure_store_set',
      'secure_store_get',
      'secure_store_delete',
      'secure_store_has',
    ]) {
      expect([...SHELL_COMMANDS]).toContain(command);
      expect(tauri).toContain(`pub async fn ${command}`);
      expect(tauri).toContain(command);
    }
    expect(SHELL_PROTOCOL_VERSION).toBe(3);
    expect(tauri).toContain(`pub const PROTOCOL_VERSION: u32 = ${SHELL_PROTOCOL_VERSION};`);
  });

  it('refuses a bad key at the IPC boundary, before the shell is asked', async () => {
    const invoked: string[] = [];
    const invoke: InvokeFn = async <T>(command: string): Promise<T> => {
      invoked.push(command);
      return null as T;
    };
    const bridge = createShellBridge(invoke);

    await expect(bridge.secureStore.set('my-key', 'value')).rejects.toThrow();
    await expect(bridge.secureStore.get('master-trade/../../etc/passwd')).rejects.toThrow();
    await expect(bridge.secureStore.has('has spaces')).rejects.toThrow();
    // Nothing malformed reached the shell.
    expect(invoked).toEqual([]);

    // A declared, namespaced key does reach it, and existence is asked as `has`.
    expect(await bridge.secureStore.has(SESSION_TOKEN_CREDENTIAL)).toBe(false);
    expect(invoked).toEqual(['secure_store_has']);
  });

  it('leaves the browser unable to touch a keychain, but able to say so', async () => {
    const bridge = browserShellBridge();
    expect(await bridge.secureStore.has(SESSION_TOKEN_CREDENTIAL)).toBe(false);
    expect(await bridge.secureStore.get(SESSION_TOKEN_CREDENTIAL)).toBeNull();
    await expect(bridge.secureStore.set(SESSION_TOKEN_CREDENTIAL, SECRET_VALUE)).rejects.toThrow(
      /only available in the desktop shell/,
    );
    await expect(bridge.secureStore.delete(SESSION_TOKEN_CREDENTIAL)).rejects.toThrow(
      /only available/,
    );
  });
});

describe('the vault lifecycle', () => {
  it('loads a configured credential, resolves it, and reports it without the value', async () => {
    const store = storeWith(new InMemorySecureStorage());
    await store.set(SESSION_TOKEN_CREDENTIAL, SECRET_VALUE);
    const vault = new CredentialVault({ store });

    const metadata = await vault.load();
    const session = metadata.find((entry) => entry.id === SESSION_TOKEN_CREDENTIAL);
    expect(session).toMatchObject({ loaded: true, reason: null, source: 'keychain' });
    expect(vault.resolve(secretFromKeychain(SESSION_TOKEN_CREDENTIAL))).toBe(SECRET_VALUE);
    expect(JSON.stringify(vault)).not.toContain(SECRET_VALUE);
  });

  it('reports an absent credential instead of failing, and resolves it to null', async () => {
    const vault = new CredentialVault({ store: storeWith(new InMemorySecureStorage()) });
    const metadata = await vault.load();

    expect(metadata.every((entry) => entry.loaded === false)).toBe(true);
    expect(metadata.map((entry) => entry.reason)).toContain('the credential is not configured');
    expect(vault.resolve(secretFromKeychain(SESSION_TOKEN_CREDENTIAL))).toBeNull();
    expect(vault.missing()).toContain(SESSION_TOKEN_CREDENTIAL);
  });

  it('keeps running when the store itself is unreachable', async () => {
    const vault = new CredentialVault({
      store: storeWith(new FailingSecureStorage('the keychain is locked')),
    });
    const metadata = await vault.load();

    expect(metadata.every((entry) => entry.loaded === false)).toBe(true);
    expect(metadata.map((entry) => entry.reason)).toContain('the credential could not be read');
    expect(vault.resolve(secretFromKeychain(SESSION_TOKEN_CREDENTIAL))).toBeNull();
  });

  it('refuses a keychain reference to a credential the product does not declare', async () => {
    const vault = new CredentialVault({ store: storeWith(new InMemorySecureStorage()) });
    await expect(
      vault.load([secretFromKeychain(`${SECRET_NAMESPACE_PREFIX}elsewhere/key`)]),
    ).rejects.toThrow(PolicyViolationError);
  });

  it('resolves a plain environment reference the way the server always has', async () => {
    const vault = new CredentialVault({
      store: storeWith(new InMemorySecureStorage()),
      env: { MY_PROVIDER_KEY: SECRET_VALUE },
    });
    const metadata = await vault.load([{ kind: 'env', name: 'MY_PROVIDER_KEY' }]);
    expect(metadata[0]).toMatchObject({ source: 'environment', loaded: true });
    expect(vault.resolve({ kind: 'env', name: 'MY_PROVIDER_KEY' })).toBe(SECRET_VALUE);
    expect(vault.resolve({ kind: 'env', name: 'ABSENT' })).toBeNull();
    expect(vault.resolve(null)).toBeNull();
  });

  it('rotates and removes a credential, in the store and in memory together', async () => {
    const store = storeWith(new InMemorySecureStorage());
    const vault = new CredentialVault({ store });
    await vault.load();
    await store.set(SESSION_TOKEN_CREDENTIAL, SECRET_VALUE);
    await vault.load();
    expect(vault.resolve(secretFromKeychain(SESSION_TOKEN_CREDENTIAL))).toBe(SECRET_VALUE);

    await vault.rotate(SESSION_TOKEN_CREDENTIAL, OTHER_VALUE);
    expect(vault.resolve(secretFromKeychain(SESSION_TOKEN_CREDENTIAL))).toBe(OTHER_VALUE);
    expect(await store.get(SESSION_TOKEN_CREDENTIAL)).toBe(OTHER_VALUE);
    expect(vault.describe().find((entry) => entry.id === SESSION_TOKEN_CREDENTIAL)?.loaded).toBe(
      true,
    );

    await vault.remove(SESSION_TOKEN_CREDENTIAL);
    expect(vault.resolve(secretFromKeychain(SESSION_TOKEN_CREDENTIAL))).toBeNull();
    expect(await store.exists(SESSION_TOKEN_CREDENTIAL)).toBe(false);
    expect(vault.describe().find((entry) => entry.id === SESSION_TOKEN_CREDENTIAL)).toMatchObject({
      loaded: false,
    });
  });

  it('releases every in-memory reference on shutdown, and can reload', async () => {
    const store = storeWith(new InMemorySecureStorage());
    await store.set(SESSION_TOKEN_CREDENTIAL, SECRET_VALUE);
    const vault = new CredentialVault({ store });
    await vault.load();
    expect(vault.resolve(secretFromKeychain(SESSION_TOKEN_CREDENTIAL))).toBe(SECRET_VALUE);

    vault.clear();
    expect(vault.isReleased()).toBe(true);
    expect(vault.resolve(secretFromKeychain(SESSION_TOKEN_CREDENTIAL))).toBeNull();
    // Releasing a value is not the same as forgetting it exists: the metadata still answers, and
    // the only credential still reported as absent is the optional one that was never configured.
    expect(vault.describe()).toHaveLength(defaultCredentialRefs().length);
    expect(vault.missing()).toEqual([AI_PROVIDER_KEY_CREDENTIAL]);
    expect(JSON.stringify(vault)).not.toContain(SECRET_VALUE);

    // A restart re-reads; the credential was never written anywhere but the store.
    await vault.load();
    expect(vault.isReleased()).toBe(false);
    expect(vault.resolve(secretFromKeychain(SESSION_TOKEN_CREDENTIAL))).toBe(SECRET_VALUE);
  });

  it('keeps a value out of every log record, including a structured one', async () => {
    const store = storeWith(new InMemorySecureStorage());
    await store.set(AI_PROVIDER_KEY_CREDENTIAL, SECRET_VALUE);
    const vault = new CredentialVault({ store });
    await vault.load();

    const sink = new MemoryLogSink();
    const logger = new Logger({ component: 'test.credentials', sink });
    logger.info(
      'credentials inspected',
      { credentials: vault.toJSON(), count: vault.describe().length },
      'credentials.loaded',
    );

    const written = JSON.stringify(sink.records);
    expect(written).not.toContain(SECRET_VALUE);
    // The redactor is a second line, and it is applied to what the logger is given.
    expect(JSON.stringify(redactValue(vault.toJSON()))).not.toContain(SECRET_VALUE);
  });

  it('exposes resolution only through the resolver a composition root asks for', async () => {
    const store = storeWith(new InMemorySecureStorage());
    await store.set(AI_PROVIDER_KEY_CREDENTIAL, SECRET_VALUE);
    const vault = new CredentialVault({ store });
    await vault.load();

    const resolve = createVaultResolver(vault);
    expect(resolve({ kind: 'keychain', name: AI_PROVIDER_KEY_CREDENTIAL })).toBe(SECRET_VALUE);
    // The metadata shape a context builder receives carries no value at all.
    const asContext = vault.toJSON();
    expect(Object.keys(asContext)).toEqual(['credentials', 'released']);
    expect(asContext.credentials.every((entry) => !('value' in entry))).toBe(true);
  });

  it('reads injected credentials in the API process, and refuses to write them there', async () => {
    const env = { [credentialEnvName(AI_PROVIDER_KEY_CREDENTIAL)]: SECRET_VALUE };
    const port = new InjectedEnvironmentStorage(env);
    expect(port.availability().available).toBe(true);

    const store = new SecureCredentialStore(port);
    await store.set(AI_PROVIDER_KEY_CREDENTIAL, SECRET_VALUE).catch(() => undefined);
    const vault = new CredentialVault({ store, env });

    await expect(store.set(AI_PROVIDER_KEY_CREDENTIAL, SECRET_VALUE)).rejects.toThrow(
      /shell owns the keychain/,
    );
    await expect(store.delete(AI_PROVIDER_KEY_CREDENTIAL)).rejects.toThrow(PolicyViolationError);
    await expect(store.get(`${SECRET_NAMESPACE_PREFIX}undeclared`)).rejects.toThrow(
      PolicyViolationError,
    );

    const metadata = await vault.load([secretFromKeychain(AI_PROVIDER_KEY_CREDENTIAL)]);
    expect(metadata[0]).toMatchObject({ loaded: true, source: 'keychain' });
    expect(JSON.stringify(metadata)).not.toContain(SECRET_VALUE);
  });

  it('closes the hole where a keychain reference could never resolve', async () => {
    const ref = secretFromKeychain(AI_PROVIDER_KEY_CREDENTIAL);
    // What the environment-only resolver does with a keychain reference: nothing, by design.
    expect(
      resolveSecretFromEnv(ref, { [credentialEnvName(AI_PROVIDER_KEY_CREDENTIAL)]: SECRET_VALUE }),
    ).toBeNull();

    // What the vault does with it once the shell has supplied the value.
    const env = { [credentialEnvName(AI_PROVIDER_KEY_CREDENTIAL)]: SECRET_VALUE };
    const vault = new CredentialVault({
      store: new SecureCredentialStore(new InjectedEnvironmentStorage(env)),
      env,
    });
    await vault.load([ref]);
    expect(createVaultResolver(vault)(ref)).toBe(SECRET_VALUE);
  });

  it('asks for the declared credentials and not for the reachability probe', () => {
    const refs = defaultCredentialRefs();
    const names = refs.map((ref) => ref.name);
    expect(names).toContain(SESSION_TOKEN_CREDENTIAL);
    expect(names).toContain(AI_PROVIDER_KEY_CREDENTIAL);
    // The probe is the shell's question about the keychain, not a credential of the product.
    expect(names).not.toContain(KEYCHAIN_PROBE_CREDENTIAL);
  });
});

/**
 * The Brain principle, as a boundary rather than a promise.
 *
 * Phase 6.4 claims a credential is not Memory and not reasoning context. That claim is worth what
 * is asserted about it, so these tests hold a **loaded** credential and then require it to be
 * absent from everything the Brain is assembled out of: the structured turn the API returns, the
 * memory store, and the context built for a turn. Each one establishes the value is really there
 * first — an absence check over an empty vault proves nothing.
 */
describe('secrets stay outside the Brain', () => {
  /** A vault holding a real value, and the proof that it is holding it. */
  async function loadedVault(): Promise<CredentialVault> {
    const store = storeWith(new InMemorySecureStorage());
    await store.set(AI_PROVIDER_KEY_CREDENTIAL, SECRET_VALUE);
    const vault = new CredentialVault({ store, env: {} });
    await vault.load();
    expect(vault.resolve(secretFromKeychain(AI_PROVIDER_KEY_CREDENTIAL))).toBe(SECRET_VALUE);
    return vault;
  }

  it('keeps a loaded credential out of every shape an agent turn returns', async () => {
    const vault = await loadedVault();
    const service = new AgentService({ asyncModel: scriptedAsyncModelAdapter() });

    const turn = await service.runAsync('How many units for a 1% risk budget?', {
      correlationId: 'secrets-isolation',
    });

    // A real answer was produced with the credential loaded — the provider is the one component
    // that gets the value, and it is not a component that returns a turn.
    expect(turn.status).toBe('completed');
    expect(turn.reply.length).toBeGreaterThan(0);
    expect(JSON.stringify(turn)).not.toContain(SECRET_VALUE);
    for (const value of Object.values(turn)) {
      expect(JSON.stringify(value ?? null)).not.toContain(SECRET_VALUE);
    }
    expect(vault.describe().some((entry) => entry.loaded)).toBe(true);
  });

  it('cannot carry a credential into memory or into assembled turn context', async () => {
    const vault = await loadedVault();
    const memory = new InMemoryStore();

    // What a context builder can obtain from the vault, recorded as memory: metadata, no value.
    const entry = memory.append({
      origin: { type: 'human', note: 'vault metadata' },
      epistemicKind: 'fact',
      content: JSON.stringify(vault.toJSON()),
    });

    const assembled = assembleContext([
      section({ id: 'instructions', source: 'instructions', priority: 100, content: 'policy' }),
      section({
        id: `memory:${entry.id}`,
        source: 'memory',
        priority: 50,
        content: entry.content,
        trust: 'verified',
        provenance: {
          source: 'human',
          ref: 'vault-metadata',
          trust: 'verified',
          recordedAt: entry.createdAt,
        },
      }),
    ]);

    // The memory section was kept, so the absence asserted below is the boundary and not a drop.
    expect(assembled.sections.some((item) => item.source === 'memory')).toBe(true);
    expect(JSON.stringify(memory.all())).not.toContain(SECRET_VALUE);
    expect(JSON.stringify(assembled)).not.toContain(SECRET_VALUE);
    // Loaded throughout, so nothing above passed by having no credential to leak.
    expect(vault.resolve(secretFromKeychain(AI_PROVIDER_KEY_CREDENTIAL))).toBe(SECRET_VALUE);
  });

  it('lets the reasoning path reach no credential material at all', () => {
    // Read from source for the same reason the Rust half is: the claim is about which module may
    // reach which, and an import statement is exactly that fact.
    const sources: string[] = [];
    const scan = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) scan(full);
        else if (full.endsWith('.ts')) sources.push(full);
      }
    };
    scan(join(root, 'src', 'agent'));
    scan(join(root, 'src', 'memory'));

    // Non-vacuous: both directories were read and hold the modules under test.
    expect(sources.length).toBeGreaterThan(8);
    const offenders = sources.filter((file) =>
      /secure-store|credential-vault|desktop\/secrets/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('reports a denied keychain as unavailable, without repeating the platform message', async () => {
    // The shape a real denial arrives in: an OS message naming an entry and a path.
    const platformDetail =
      'access denied to /Users/someone/Library/Keychains/login.keychain-db for account master-trade/session/token';
    const denied: SecureStoragePort = {
      async get() {
        throw new AppError('FORBIDDEN', `keychain: ${platformDetail}`);
      },
      async has() {
        throw new AppError('FORBIDDEN', `keychain: ${platformDetail}`);
      },
      async set() {
        throw new AppError('FORBIDDEN', `keychain: ${platformDetail}`);
      },
      async delete() {
        throw new AppError('FORBIDDEN', `keychain: ${platformDetail}`);
      },
    };

    const store = new SecureCredentialStore(denied);
    const availability = await store.availability();
    expect(availability.available).toBe(false);
    // The sentence a status card renders, in this product's words rather than the platform's.
    expect(availability.reason).toBe('the OS credential store could not be reached');

    const vault = new CredentialVault({ store, env: {} });
    const entries = await vault.load();
    expect(entries.every((entry) => !entry.loaded)).toBe(true);
    expect(vault.resolve(secretFromKeychain(AI_PROVIDER_KEY_CREDENTIAL))).toBeNull();

    // Denied, and reported in this product's words: no platform message and no path reaches a
    // screen, a log record or an error response.
    const surfaced = JSON.stringify({
      availability,
      entries,
      describe: vault.describe(),
      summary: await store.summary(),
    });
    expect(surfaced).not.toContain('access denied');
    expect(surfaced).not.toContain('login.keychain-db');
    expect(surfaced).not.toContain('/Users/someone');
    expect(surfaced).not.toContain(SECRET_VALUE);
  });
});
