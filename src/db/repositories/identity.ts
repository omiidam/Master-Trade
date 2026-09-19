/**
 * Identity repository — owner: `identity`.
 *
 * Owns accounts, credentials and sessions. Three rules are enforced here rather
 * than trusted to callers:
 *
 *   1. **Only a hash is stored.** `saveCredential` accepts a hash produced by the
 *      authentication service; there is no method that could write a plaintext
 *      secret, and the schema forbids a column that would hold one.
 *   2. **Session tokens are hashes, always.** `saveSession` refuses anything that
 *      is not a 64-character SHA-256 hex digest, so a raw bearer token cannot be
 *      persisted by mistake — the single most damaging mistake this table could
 *      contain, since a database copy would then be replayable.
 *   3. **Issuing a session without a role is impossible** (deny-by-default from
 *      Phase 1) and an untokened session row is not representable.
 */

import { AppError, PolicyViolationError } from '../../core/errors.js';
import { ids } from '../../core/ids.js';
import type { SqlExecutor } from '../executor.js';
import { Table } from '../table.js';
import type { Owner } from '../ownership.js';
import type { TableName } from '../schema.js';
import type { Role } from '../../auth/model.js';

export const OWNER: Owner = 'identity';
export const OWNED_TABLES: readonly TableName[] = ['users', 'credentials', 'sessions'];

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type CredentialAlgorithm = 'argon2id' | 'scrypt';

export interface UserRow {
  id: string;
  display_name: string;
  timezone: string;
  experience_level: ExperienceLevel;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CredentialRow {
  id: string;
  user_id: string;
  algorithm: CredentialAlgorithm;
  password_hash: string;
  created_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  roles: Role[];
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
}

const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;

export interface IdentityRepositoryOptions {
  now?: () => number;
  newId?: (kind: string) => string;
}

export interface CreateUserInput {
  displayName: string;
  timezone: string;
  experienceLevel?: ExperienceLevel;
}

export interface CreateSessionInput {
  userId: string;
  roles: readonly Role[];
  /** SHA-256 hex digest of the bearer token. Never the token itself. */
  tokenHash: string;
  ttlMinutes: number;
}

export class IdentityRepository {
  private readonly db: SqlExecutor;
  private readonly users: Table<UserRow>;
  private readonly credentials: Table<CredentialRow>;
  private readonly sessions: Table<SessionRow>;
  private readonly now: () => number;
  private readonly newId: (kind: string) => string;

  constructor(db: SqlExecutor, options: IdentityRepositoryOptions = {}) {
    this.db = db;
    this.users = new Table<UserRow>(db, 'users');
    this.credentials = new Table<CredentialRow>(db, 'credentials');
    this.sessions = new Table<SessionRow>(db, 'sessions');
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? ((kind) => ids.id(kind));
  }

  private iso(at: number = this.now()): string {
    return new Date(at).toISOString();
  }

  /* ---------------------------------------------------------------- users */

  async createUser(input: CreateUserInput): Promise<UserRow> {
    const at = this.iso();
    return this.users.insert({
      id: this.newId('usr'),
      display_name: input.displayName,
      timezone: input.timezone,
      experience_level: input.experienceLevel ?? 'beginner',
      last_seen_at: null,
      created_at: at,
      updated_at: at,
    });
  }

  findUser(id: string): Promise<UserRow | null> {
    return this.users.findById(id);
  }

  findUserByName(displayName: string): Promise<UserRow | null> {
    return this.users.findOne({ display_name: displayName });
  }

  listUsers(): Promise<UserRow[]> {
    return this.users.findMany({}, { orderBy: 'created_at', direction: 'asc' });
  }

  async touchUser(id: string): Promise<UserRow | null> {
    return this.users.update(id, { last_seen_at: this.iso(), updated_at: this.iso() });
  }

  async updateUser(
    id: string,
    patch: Partial<Pick<UserRow, 'display_name' | 'timezone' | 'experience_level'>>,
  ): Promise<UserRow | null> {
    return this.users.update(id, { ...patch, updated_at: this.iso() });
  }

  /* ---------------------------------------------------------- credentials */

  /** Store (or replace) the credential for a user. Hashes only, by contract. */
  async saveCredential(
    userId: string,
    input: { algorithm: CredentialAlgorithm; passwordHash: string },
  ): Promise<CredentialRow> {
    if (input.passwordHash.trim().length < 16) {
      throw new AppError(
        'VALIDATION_FAILED',
        'A credential must be a hash, not a short or empty value',
      );
    }
    const existing = await this.credentials.findOne({ user_id: userId });
    if (existing) {
      const updated = await this.credentials.update(existing.id, {
        algorithm: input.algorithm,
        password_hash: input.passwordHash,
      });
      if (!updated) throw new AppError('INTERNAL', 'Credential update did not persist');
      return updated;
    }
    return this.credentials.insert({
      id: this.newId('cred'),
      user_id: userId,
      algorithm: input.algorithm,
      password_hash: input.passwordHash,
      created_at: this.iso(),
    });
  }

  /** The hash and parameters only; there is nothing else to return. */
  credentialForUser(userId: string): Promise<CredentialRow | null> {
    return this.credentials.findOne({ user_id: userId });
  }

  /* ------------------------------------------------------------- sessions */

  async saveSession(input: CreateSessionInput): Promise<SessionRow> {
    if (!TOKEN_HASH_PATTERN.test(input.tokenHash)) {
      throw new PolicyViolationError(
        'Refusing to store a session token hash that is not a 64-character SHA-256 digest. ' +
          'Hash the token before calling this method; never persist the token itself.',
        { userId: input.userId },
      );
    }
    if (input.roles.length === 0) {
      throw new PolicyViolationError(
        'Refusing to issue a session with no roles (deny-by-default)',
        {
          userId: input.userId,
        },
      );
    }
    const issuedAt = this.now();
    return this.sessions.insert({
      id: this.newId('sess'),
      user_id: input.userId,
      token_hash: input.tokenHash,
      roles: [...input.roles],
      issued_at: this.iso(issuedAt),
      expires_at: this.iso(issuedAt + input.ttlMinutes * 60_000),
      revoked_at: null,
    });
  }

  sessionByTokenHash(tokenHash: string): Promise<SessionRow | null> {
    return this.sessions.findOne({ token_hash: tokenHash });
  }

  /** Live sessions: not revoked, not expired, at the given instant. */
  listActiveSessions(at: number = this.now()): Promise<SessionRow[]> {
    return this.sessions
      .findMany({ revoked_at: null }, { orderBy: 'issued_at', direction: 'desc' })
      .then((rows) => rows.filter((row) => Date.parse(row.expires_at) > at));
  }

  async revokeSession(id: string): Promise<boolean> {
    const session = await this.sessions.findById(id);
    if (!session || session.revoked_at !== null) return false;
    await this.sessions.update(id, { revoked_at: this.iso() });
    return true;
  }

  async revokeSessionByTokenHash(tokenHash: string): Promise<boolean> {
    const session = await this.sessions.findOne({ token_hash: tokenHash });
    return session ? this.revokeSession(session.id) : false;
  }

  revokeAllForUser(userId: string): Promise<number> {
    return this.sessions.updateMany(
      { user_id: userId, revoked_at: null },
      { revoked_at: this.iso() },
    );
  }

  /**
   * Delete revoked or expired rows in one statement. Returns rows removed.
   * Timestamps are ISO-8601 UTC in both engines, so the string comparison is the
   * same predicate on SQLite (TEXT) and PostgreSQL (TIMESTAMPTZ, inferred cast).
   */
  async purgeExpiredSessions(at: number = this.now()): Promise<number> {
    const before = await this.sessions.count();
    await this.db.execute(
      `DELETE FROM ${this.db.dialect.quote('sessions')} WHERE ${this.db.dialect.quote(
        'revoked_at',
      )} IS NOT NULL OR ${this.db.dialect.quote('expires_at')} <= ?`,
      [this.iso(at)],
    );
    return before - (await this.sessions.count());
  }

  /** Diagnostics: counts only, never a token or a hash. */
  async sessionSummary(at: number = this.now()): Promise<{ active: number; total: number }> {
    const [active, total] = await Promise.all([
      this.listActiveSessions(at).then((rows) => rows.length),
      this.sessions.count(),
    ]);
    return { active, total };
  }
}

export function createIdentityRepository(
  db: SqlExecutor,
  options: IdentityRepositoryOptions = {},
): IdentityRepository {
  return new IdentityRepository(db, options);
}
