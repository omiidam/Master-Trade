/**
 * Synthetic fixtures for the security gate.
 *
 * Everything a case can touch is built here, and none of it is real: no network is reachable from
 * this suite, no production token exists, no broker is configured and no money can move. The
 * product's own safety flags are literal `false`, so a case that tried to enable execution would
 * be refused by the boot check before any attack could run — which is itself one of the attacks.
 *
 * Two rules keep the fixtures honest:
 *
 *   - **the synthetic secret is shaped like the real thing but is not one.** It exists so that a
 *     case can prove the value never reaches an output, a log or a record; a scanner looks for it
 *     everywhere an attacker could read. Nothing here should ever be used outside this suite.
 *   - **time is fixed.** Sessions, approvals and memory timestamps run on `FIXED_NOW`, so an
 *     expiry test is an assertion rather than a sleep.
 */

import { resolveConfig, type ConfigOverrides } from '../../src/core/config.js';
import { SessionService } from '../../src/auth/sessions.js';
import { ApprovalWorkflow } from '../../src/agent/approval.js';
import { InMemoryVectorMemory, type MemoryMetadata } from '../../src/vector/memory.js';
import { InMemoryFileStorage, sha256Hex } from '../../src/storage/files.js';
import type { BlobStore } from '../../src/storage/disk.js';
import { openDatabase } from '../../src/db/index.js';
import type { PortfolioRepository } from '../../src/db/repositories/portfolio.js';
import { ManagedFileStore } from '../../src/desktop/file-store.js';
import { CredentialVault, InjectedEnvironmentStorage } from '../../src/desktop/credential-vault.js';
import { SecureCredentialStore } from '../../src/desktop/secure-store.js';
import { createServer, type ServerDeps } from '../../src/server/index.js';
import { MemoryLogSink } from '../../packages/shared/src/core/logging.js';
import { OPERATIONS } from '../../packages/shared/src/auth/model.js';

/** A fixed clock, so expiry is asserted rather than waited for. */
export const FIXED_NOW = 1_700_000_000_000;

/**
 * A synthetic credential value. Obvious, and never valid anywhere.
 *
 * Shaped like this product's own session tokens (`mt_s_…`, `SESSION_TOKEN_PREFIX`) on purpose: a
 * case has to be able to prove that *this product's* credential shape is redacted wherever it is
 * observable, and a fixture that was not shaped like the real thing could pass a redaction test the
 * real value would fail.
 */
export const SYNTHETIC_SECRET = 'mt_s_SYNTHETIC_ONLY_9f2c41ab7d';

/** The environment variable the injected-credential channel reads. */
export const SYNTHETIC_ENV_VAR = 'MASTER_TRADE_SYNTHETIC_TOKEN';

/** Shapes that must never appear in an output, a log, a record or an error. */
export const SECRET_SHAPES: readonly { what: string; pattern: RegExp }[] = [
  {
    what: 'the synthetic secret',
    pattern: new RegExp(SYNTHETIC_SECRET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  },
  { what: 'a session token', pattern: /mt_s_[A-Za-z0-9_-]{8,}/ },
  { what: 'a private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { what: 'a bearer header', pattern: /authorization:\s*bearer\s+\S+/i },
  {
    what: 'an API key assignment',
    pattern: /\b(?:api[_-]?key|secret|password)\s*[:=]\s*['"][^'"]{8,}/i,
  },
];

export interface FoundSecret {
  what: string;
  matched: string;
  context: string;
}

/** Scan a value for credential-shaped content. Returns every shape found. */
export function scanForSecrets(value: unknown): FoundSecret[] {
  const text = typeof value === 'string' ? value : safeStringify(value);
  const found: FoundSecret[] = [];
  for (const { what, pattern } of SECRET_SHAPES) {
    const match = pattern.exec(text);
    if (match) {
      const at = Math.max(0, (match.index ?? 0) - 40);
      found.push({
        what,
        matched: match[0].slice(0, 24),
        context: text.slice(at, at + 120).replace(/\s+/g, ' '),
      });
    }
  }
  return found;
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** The gated operations, read from the model rather than hard-coded. */
export const APPROVAL_GATED_OPERATIONS = Object.entries(OPERATIONS)
  .filter(([, operation]) => operation.requiresApproval)
  .map(([id]) => id);

/** An operation that is *not* approval-gated, for the "wrap an ungated op" attack. */
export const UNGATED_OPERATION = Object.entries(OPERATIONS).find(
  ([, operation]) => !operation.requiresApproval,
)?.[0];

/** Sessions for three synthetic principals, one of them privileged. */
export function sessionFixtures(): {
  sessions: SessionService;
  owner: { token: string; id: string };
  learner: { token: string; id: string };
  other: { token: string; id: string };
} {
  const sessions = new SessionService({ now: () => FIXED_NOW });
  const owner = sessions.issue({ userId: 'user-owner', roles: ['owner'] });
  const learner = sessions.issue({ userId: 'user-learner', roles: ['student'] });
  const other = sessions.issue({ userId: 'user-other', roles: ['observer'] });
  return {
    sessions,
    owner: { token: owner.token, id: owner.principal.id },
    learner: { token: learner.token, id: learner.principal.id },
    other: { token: other.token, id: other.principal.id },
  };
}

/** An approval workflow on the fixed clock. */
export function approvalFixtures(): ApprovalWorkflow {
  return new ApprovalWorkflow({ now: () => FIXED_NOW });
}

/** An empty, deterministic memory store. */
export function memoryFixture(): InMemoryVectorMemory {
  let counter = 0;
  return new InMemoryVectorMemory({
    now: () => new Date(FIXED_NOW).toISOString(),
    idFactory: () => `mem_${++counter}`,
    minScore: 0,
  });
}

/**
 * A complete memory metadata block.
 *
 * `VectorMemoryRecord.metadata` has four required fields, so a case that is not *about* metadata
 * should not have to invent them at every call site. Everything here is synthetic.
 */
export function memoryMetadata(overrides: Partial<MemoryMetadata> = {}): MemoryMetadata {
  return {
    subject: 'synthetic record',
    tags: ['synthetic'],
    createdBy: 'user-owner',
    epistemicKind: 'fact',
    ...overrides,
  };
}

/** File storage with the default policy. */
export function fileFixture(): InMemoryFileStorage {
  return new InMemoryFileStorage();
}

/**
 * A byte store that lives in a map.
 *
 * The byte layer is deliberately ownerless (`src/storage/disk.ts`), so faking it cannot weaken the
 * claim SEC-040 tests — that claim is about *metadata* ownership, and it is decided by
 * `ManagedFileStore.meta`. Faking the bytes keeps the case off the filesystem.
 */
class SyntheticBlobStore implements BlobStore {
  private readonly blobs = new Map<string, Uint8Array>();

  async write(bytes: Uint8Array): Promise<string> {
    const key = sha256Hex(bytes);
    this.blobs.set(key, bytes);
    return key;
  }

  async read(key: string): Promise<Uint8Array | null> {
    return this.blobs.get(key) ?? null;
  }

  async has(key: string): Promise<boolean> {
    return this.blobs.has(key);
  }

  async remove(key: string): Promise<boolean> {
    return this.blobs.delete(key);
  }

  async list(): Promise<string[]> {
    return [...this.blobs.keys()];
  }

  async totalBytes(): Promise<number> {
    return [...this.blobs.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0);
  }

  root(): string {
    return 'synthetic://blobs';
  }
}

/**
 * The managed file store — the module that actually enforces ownership — over an in-memory
 * database and a map-backed byte store, with two synthetic owners.
 *
 * `:memory:` rather than a temporary file: the ownership rule is a comparison against a row, so the
 * case needs a real repository but not a real disk, and an in-memory database cannot leave residue
 * behind on a machine that ran the suite.
 */
export async function managedFileFixture(): Promise<{
  files: ManagedFileStore;
  ownerA: string;
  ownerB: string;
  close: () => Promise<void>;
}> {
  const handle = await openDatabase({ config: resolveConfig(), memory: true });
  try {
    const ownerA = (
      await handle.repositories.identity.createUser({
        displayName: 'Synthetic Owner A',
        timezone: 'UTC',
      })
    ).id;
    const ownerB = (
      await handle.repositories.identity.createUser({
        displayName: 'Synthetic Owner B',
        timezone: 'UTC',
      })
    ).id;
    const files = new ManagedFileStore({
      repository: handle.repositories.platform,
      blobs: new SyntheticBlobStore(),
    });
    return { files, ownerA, ownerB, close: () => handle.close() };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

/**
 * The portfolio repository over an in-memory database, with one synthetic owner.
 *
 * Used by the case that attacks a caller-asserted provenance claim: the API schema is one door and
 * the single write path is the other, so the case needs the real writer — and a real repository,
 * over `:memory:`, with a real user row behind it (the schema has a foreign key).
 */
export async function portfolioFixture(): Promise<{
  repository: PortfolioRepository;
  userId: string;
  close: () => Promise<void>;
}> {
  const handle = await openDatabase({ config: resolveConfig(), memory: true });
  try {
    const userId = (
      await handle.repositories.identity.createUser({
        displayName: 'Synthetic Portfolio Owner',
        timezone: 'UTC',
      })
    ).id;
    return {
      repository: handle.repositories.portfolio,
      userId,
      close: () => handle.close(),
    };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

/**
 * A vault with one synthetic credential, injected through the environment.
 *
 * The store is the injected-environment implementation: the one the API process really uses, and
 * the one whose `set`/`delete` refuse by construction — there is no filesystem-backed secret store
 * to attack, which several cases assert rather than assume.
 */
export function credentialVault(): CredentialVault {
  const store = new SecureCredentialStore(
    new InjectedEnvironmentStorage({ [SYNTHETIC_ENV_VAR]: SYNTHETIC_SECRET }),
    { now: () => FIXED_NOW },
  );
  return new CredentialVault({
    store,
    env: { [SYNTHETIC_ENV_VAR]: SYNTHETIC_SECRET },
    now: () => FIXED_NOW,
  });
}

/** An HTTP server built with synthetic dependencies, plus a call helper. */
export function serverFixture(
  deps: Omit<ServerDeps, 'config'> & { config?: ConfigOverrides } = {},
): {
  call: (input: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    url: string;
    headers?: Record<string, string>;
    payload?: unknown;
  }) => Promise<{ status: number; body: unknown; text: string; headers: Record<string, unknown> }>;
  sink: MemoryLogSink;
  close: () => Promise<void>;
} {
  const sink = new MemoryLogSink();
  const { config: overrides, ...rest } = deps;
  const server = createServer({
    config: resolveConfig(overrides ?? {}),
    sink,
    now: () => FIXED_NOW,
    ...rest,
  });
  return {
    sink,
    async call(input) {
      const response = await server.app.inject({
        method: input.method,
        url: input.url,
        headers: input.headers ?? {},
        ...(input.payload === undefined ? {} : { payload: input.payload as object }),
      });
      return {
        status: response.statusCode,
        body: (() => {
          try {
            return response.json();
          } catch {
            return null;
          }
        })(),
        text: response.body,
        headers: response.headers as Record<string, unknown>,
      };
    },
    close: () => server.close(),
  };
}
