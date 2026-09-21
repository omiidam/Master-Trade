/**
 * Profile repository — owner: `profile`.
 *
 * Owns the append-only history of the user-declared Trading Context. Four rules are
 * enforced here rather than trusted to callers:
 *
 *   1. **A version is never rewritten.** There is no update and no delete method. A
 *      change appends version *n+1*, so the context an answer was given from stays
 *      recoverable — which the decision-evaluation work depends on and could not
 *      reconstruct after the fact.
 *   2. **A stored context is validated, not assumed.** Every value passes the shared
 *      Zod schema on the way in, so a hand-built object cannot enter the history.
 *   3. **Impossible contexts are refused.** `reject`-severity contradictions (an
 *      allocation summing above 100%, an undated `user-stated` fact, an order-shaped
 *      constraint) throw here. `question`-severity ones are legitimate and are
 *      returned to the caller to surface as prompts, never silently resolved.
 *   4. **Every read and write names a user.** There is no method that returns more
 *      than one user's context, and no route accepts a user id, so cross-user access
 *      is not merely forbidden — it is unrepresentable at the API boundary.
 */

import { AppError } from '../../../packages/shared/src/core/errors.js';
import { ids } from '../../../packages/shared/src/core/ids.js';
import {
  assessContext,
  tradingContextSchema,
  type ContextIssue,
  type TradingContext,
} from '../../../packages/shared/src/profile/model.js';
import type { SqlExecutor } from '../executor.js';
import { Table } from '../table.js';
import type { Owner } from '../ownership.js';
import type { TableName } from '../schema.js';

export const OWNER: Owner = 'profile';
export const OWNED_TABLES: readonly TableName[] = ['trading_context_versions'];

export interface TradingContextRow {
  id: string;
  user_id: string;
  version: number;
  context: TradingContext;
  changed_by: string;
  created_at: string;
}

export interface ProfileRepositoryOptions {
  now?: () => number;
  newId?: (kind: string) => string;
}

export interface AppendContextInput {
  userId: string;
  context: TradingContext;
  /** User id or `system`. Attribution is required: an unattributed edit is not auditable. */
  changedBy: string;
}

export interface AppendContextResult {
  row: TradingContextRow;
  /** `question`-severity findings the caller must surface. Never empty on a conflict. */
  questions: readonly ContextIssue[];
}

export class ProfileRepository {
  private readonly db: SqlExecutor;
  private readonly table: Table<TradingContextRow>;
  private readonly now: () => number;
  private readonly newId: (kind: string) => string;

  constructor(db: SqlExecutor, options: ProfileRepositoryOptions = {}) {
    this.db = db;
    this.table = new Table<TradingContextRow>(db, 'trading_context_versions');
    this.now = options.now ?? (() => Date.now());
    this.newId = options.newId ?? ((kind) => ids.id(kind));
  }

  /** The current context: the highest version for this user, or `null` if never set. */
  async current(userId: string): Promise<TradingContextRow | null> {
    const rows = await this.versions(userId, 1);
    return rows[0] ?? null;
  }

  /**
   * Newest first. Bounded, because the history is read for display and review.
   *
   * Read through `Table`, not through a hand-written SELECT: `context` is a JSON
   * column and the driver hands it back as the text it stored, so a query that
   * builds its own rows skips the decoder and a stored document arrives as a
   * string. The toolkit decodes every column by its declared type, which is the
   * only place that knows the column is JSON.
   */
  async versions(userId: string, limit = 20): Promise<TradingContextRow[]> {
    return this.table.findMany(
      { user_id: userId },
      { orderBy: 'version', direction: 'desc', limit: Math.max(1, Math.min(200, limit)) },
    );
  }

  async versionCount(userId: string): Promise<number> {
    return this.table.count({ user_id: userId });
  }

  /**
   * Append the next version.
   *
   * The version number is derived from the current row rather than accepted from the
   * caller, so a client cannot choose it, skip it or replay it. Two concurrent
   * appends race on the unique `(user_id, version)` index and the loser gets a typed
   * conflict rather than a silent overwrite.
   */
  async append(input: AppendContextInput): Promise<AppendContextResult> {
    if (input.changedBy.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'A context change must record who made it.', {
        details: { field: 'changedBy' },
      });
    }

    const parsed = tradingContextSchema.safeParse(input.context);
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', 'The trading context is not a valid document.', {
        details: {
          fields: parsed.error.issues.slice(0, 10).map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
    }
    const context = parsed.data as TradingContext;

    const now = this.now();
    const existing = await this.current(input.userId);
    const nextVersion = (existing?.version ?? 0) + 1;

    const assessment = assessContext(context, now);
    const rejected = assessment.issues.filter((issue) => issue.severity === 'reject');
    if (rejected.length > 0) {
      throw new AppError('VALIDATION_FAILED', 'The trading context contradicts itself.', {
        details: {
          problems: rejected.map((issue) => ({ field: issue.key, problem: issue.problem })),
        },
      });
    }

    // The version is ours, not the caller's: a document that arrives claiming a
    // different number is stamped with the next one.
    const stamped: TradingContext = { ...context, version: nextVersion };
    const row: TradingContextRow = {
      id: this.newId('ctx'),
      user_id: input.userId,
      version: nextVersion,
      context: stamped,
      changed_by: input.changedBy,
      created_at: new Date(now).toISOString(),
    };

    try {
      const inserted = await this.table.insert(row);
      return {
        row: inserted,
        questions: assessment.issues.filter((issue) => issue.severity === 'question'),
      };
    } catch (error) {
      throw new AppError(
        'CONFLICT',
        'The trading context changed while this update was being written; reload and try again.',
        { details: { userId: input.userId, attemptedVersion: nextVersion }, cause: error },
      );
    }
  }
}

export function createProfileRepository(
  db: SqlExecutor,
  options: ProfileRepositoryOptions = {},
): ProfileRepository {
  return new ProfileRepository(db, options);
}
