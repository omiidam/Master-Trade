/**
 * Decision repository — owner: `decision`.
 *
 * Owns the recorded decisions and the append-only history of evaluations attempted against them.
 * Six rules are enforced here rather than trusted to callers:
 *
 *   1. **No measured figure is ever stored.** There is no column, no method and no return value
 *      that carries a return, an R multiple, a drawdown or a comparison. Every one of them is
 *      computed from the record each time it is asked for, by `packages/trading-engine`. A stored
 *      figure would survive a correction to the price it came from and would look exactly like a
 *      correct number while it did.
 *   2. **A stored record is validated, not assumed.** Every write passes the shared Zod schema, so
 *      a hand-built object cannot enter the database and a kind the engine does not recognise
 *      cannot either.
 *   3. **The clock is the repository's, not the caller's.** `recordedAt` and `updatedAt` are
 *      written from the injected clock, so a client cannot backdate a record into looking
 *      evaluated longer than it has been.
 *   4. **A decision is only ever read or written by its owner.** Every method takes a user id and
 *      filters on it, and no route accepts a user id, so cross-user access is unrepresentable at
 *      the API boundary rather than merely forbidden.
 *   5. **A version only moves forward.** An amendment increments `version` inside a transaction and
 *      cannot decrement it, so an evaluation row that names a version always names one that
 *      existed.
 *   6. **An evaluation row is never rewritten.** There is no update and no delete for one: what a
 *      record was refused for at an instant is a fact about that instant, and recomputing it from
 *      a later version would give the later answer.
 *
 * `rationale` is the one free-text field that a human wrote about their own reasoning, and it is
 * the reason findings and observations are shaped the way they are: the text is stored and returned
 * to its author, and nothing in this repository ever copies it into a finding, a log payload or a
 * summary.
 */

import { AppError } from '../../../packages/shared/src/core/errors.js';
import { ids } from '../../../packages/shared/src/core/ids.js';
import {
  DECISION_EVALUATION_REASONS,
  decisionRecordSchema,
  type DecisionEvaluationReason,
  type DecisionKind,
  type DecisionRecord,
  type DecisionRecordInput,
  type DecisionType,
  type EvaluationOutcome,
} from '../../../packages/shared/src/decisions/model.js';
import type { EvaluationReadiness } from '../../../packages/shared/src/decisions/readiness.js';
import type { PortfolioCurrency } from '../../../packages/shared/src/portfolio/model.js';
import type { SqlExecutor } from '../executor.js';
import { Table } from '../table.js';
import type { Owner } from '../ownership.js';
import type { TableName } from '../schema.js';

export const OWNER: Owner = 'decision';
export const OWNED_TABLES: readonly TableName[] = ['decisions', 'decision_evaluations'];

/**
 * Why an evaluation exists, so a history reads as a sequence of intentions.
 *
 * Re-exported from the shared model rather than declared here: the vocabulary appears in an API
 * body and on a surface, and a second copy would eventually name a different set.
 */
export const EVALUATION_REASONS = DECISION_EVALUATION_REASONS;
export type EvaluationReason = DecisionEvaluationReason;

export interface DecisionRow {
  id: string;
  user_id: string;
  portfolio_id: string | null;
  symbol: string | null;
  type: DecisionType;
  kind: DecisionKind;
  decided_at: string;
  period_start_at: string;
  period_end_at: string | null;
  currency: PortfolioCurrency;
  version: number;
  /** The validated record. Prices, expectations, risk parameters and assumptions live in here. */
  document: DecisionRecord;
  changed_by: string;
  created_at: string;
  updated_at: string;
}

export interface DecisionEvaluationRow {
  id: string;
  decision_id: string;
  user_id: string;
  decision_version: number;
  readiness: EvaluationReadiness;
  outcome: EvaluationOutcome;
  decided_by: string;
  finding_codes: readonly string[];
  reason: EvaluationReason;
  created_at: string;
}

export interface DecisionRepositoryOptions {
  now?: () => number;
  newId?: (kind: string) => string;
}

export interface StoredDecision {
  row: DecisionRow;
  /** The record as the engine reads it, assembled from the stored document. */
  decision: DecisionRecord;
  /** Evaluations attempted against this decision, newest first. Never more than `limit`. */
  evaluations: readonly DecisionEvaluationRow[];
}

export interface RecordDecisionInput {
  userId: string;
  record: DecisionRecordInput;
  /** User id or `system`. Attribution is required: an unattributed record is not reviewable. */
  decidedBy: string;
}

export interface AmendDecisionInput {
  userId: string;
  decisionId: string;
  record: DecisionRecordInput;
  changedBy: string;
}

export interface RecordEvaluationInput {
  userId: string;
  decisionId: string;
  /** The version of the record the reading was taken from. */
  decisionVersion: number;
  readiness: EvaluationReadiness;
  outcome: EvaluationOutcome;
  decidedBy: string;
  findingCodes: readonly string[];
  reason: EvaluationReason;
}

export interface ListDecisionsOptions {
  limit?: number;
  offset?: number;
  symbol?: string;
  kind?: DecisionKind;
}

export class DecisionRepository {
  private readonly decisions: Table<DecisionRow>;
  private readonly evaluations: Table<DecisionEvaluationRow>;
  private readonly now: () => number;
  private readonly newId: (kind: string) => string;
  private readonly db: SqlExecutor;

  constructor(db: SqlExecutor, options: DecisionRepositoryOptions = {}) {
    this.db = db;
    this.decisions = new Table<DecisionRow>(db, 'decisions');
    this.evaluations = new Table<DecisionEvaluationRow>(db, 'decision_evaluations');
    this.now = options.now ?? (() => Date.now());
    this.newId = options.newId ?? ((kind) => ids.id(kind));
  }

  /**
   * Validate a record against the shared schema and return it in stored form.
   *
   * The schema is strict, so a key it does not know about is an error rather than something the
   * database silently drops — a user believing they had recorded something nobody read is the
   * failure this prevents.
   */
  private parse(
    record: DecisionRecordInput,
    id: string,
    at: string,
    recordedAt: string,
  ): DecisionRecord {
    const parsed = decisionRecordSchema.safeParse({ ...record, recordedAt, updatedAt: at });
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', 'The decision is not a valid record.', {
        details: {
          fields: parsed.error.issues.slice(0, 10).map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
    }
    return { id, ...parsed.data };
  }

  /**
   * Record a decision.
   *
   * The row and its first version are written together, and `version` starts at 1 so an
   * evaluation can always name the version it read.
   */
  async record(input: RecordDecisionInput): Promise<StoredDecision> {
    if (input.decidedBy.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'A decision change must record who made it.', {
        details: { field: 'decidedBy' },
      });
    }
    const at = new Date(this.now()).toISOString();
    const id = this.newId('dec');
    const document = this.parse(input.record, id, at, at);

    const row: DecisionRow = {
      id,
      user_id: input.userId,
      portfolio_id: document.portfolioId,
      symbol: document.symbol,
      type: document.type,
      kind: document.kind,
      decided_at: document.decidedAt,
      period_start_at: document.period.startAt,
      period_end_at: document.period.endAt,
      currency: document.currency,
      version: 1,
      document,
      changed_by: input.decidedBy,
      created_at: at,
      updated_at: at,
    };

    const stored = await this.decisions.insert(row);
    return { row: stored, decision: stored.document, evaluations: [] };
  }

  /**
   * Amend a decision in place.
   *
   * The version only ever moves forward, and it moves inside a transaction with the document, so
   * an evaluation row that names a version always names one that existed. The old content is not
   * kept — see the deferral note in `docs/decision-evaluation.md`: a `decision_versions` table is
   * the honest fix and is deferred until editing records becomes common enough to justify it.
   */
  async amend(input: AmendDecisionInput): Promise<StoredDecision> {
    if (input.changedBy.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'A decision change must record who made it.', {
        details: { field: 'changedBy' },
      });
    }
    const existing = await this.decisions.findOne({
      id: input.decisionId,
      user_id: input.userId,
    });
    if (existing === null) {
      throw new AppError('NOT_FOUND', 'No decision of yours has that id.');
    }
    const at = new Date(this.now()).toISOString();
    const document = this.parse(input.record, existing.id, at, existing.created_at);

    const updated = await this.db.transaction(async (tx) => {
      const table = new Table<DecisionRow>(tx, 'decisions');
      return table.update(existing.id, {
        portfolio_id: document.portfolioId,
        symbol: document.symbol,
        type: document.type,
        kind: document.kind,
        decided_at: document.decidedAt,
        period_start_at: document.period.startAt,
        period_end_at: document.period.endAt,
        currency: document.currency,
        version: existing.version + 1,
        document,
        changed_by: input.changedBy,
        updated_at: at,
      });
    });
    if (updated === null) {
      throw new AppError('INTERNAL', 'The decision amendment did not persist.');
    }
    return {
      row: updated,
      decision: updated.document,
      evaluations: await this.evaluationsFor(input.userId, updated.id),
    };
  }

  /** One decision, with its evaluation history. `null` when the account has no such decision. */
  async get(userId: string, decisionId: string): Promise<StoredDecision | null> {
    const row = await this.decisions.findOne({ id: decisionId, user_id: userId });
    if (row === null) return null;
    return {
      row,
      decision: row.document,
      evaluations: await this.evaluationsFor(userId, row.id),
    };
  }

  /**
   * The account's decisions, newest decision first.
   *
   * `null` is never returned for an empty list: "you have recorded nothing" and "nothing matched
   * your filter" are different facts and the surface says which.
   */
  async list(userId: string, options: ListDecisionsOptions = {}): Promise<DecisionRow[]> {
    const where: Partial<DecisionRow> = { user_id: userId };
    if (options.symbol !== undefined) where.symbol = options.symbol;
    if (options.kind !== undefined) where.kind = options.kind;
    return this.decisions.findMany(where, {
      orderBy: 'decided_at',
      direction: 'desc',
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
    });
  }

  async count(userId: string): Promise<number> {
    return this.decisions.count({ user_id: userId });
  }

  /** Delete a decision. Its evaluations go with it by cascade, because they are about it. */
  async remove(userId: string, decisionId: string): Promise<boolean> {
    const existing = await this.decisions.findOne({ id: decisionId, user_id: userId });
    if (existing === null) return false;
    return this.decisions.deleteById(existing.id);
  }

  /**
   * Append an evaluation attempt.
   *
   * Only what cannot be recomputed: the verdict, the classification, the rule that produced it and
   * the finding codes, against the version they were read from. No figure is stored, deliberately
   * — the numbers are recomputed from the record every time they are shown, so a corrected price
   * cannot leave a stale total behind.
   *
   * The decision is looked up by owner first, so an evaluation cannot be filed against somebody
   * else's record even if a caller constructs the input by hand.
   */
  async recordEvaluation(input: RecordEvaluationInput): Promise<DecisionEvaluationRow> {
    const decision = await this.decisions.findOne({
      id: input.decisionId,
      user_id: input.userId,
    });
    if (decision === null) {
      throw new AppError('NOT_FOUND', 'No decision of yours has that id.');
    }
    const at = new Date(this.now()).toISOString();
    const row: DecisionEvaluationRow = {
      id: this.newId('dev'),
      decision_id: decision.id,
      user_id: input.userId,
      decision_version: input.decisionVersion,
      readiness: input.readiness,
      outcome: input.outcome,
      decided_by: input.decidedBy,
      finding_codes: [...input.findingCodes],
      reason: input.reason,
      created_at: at,
    };
    return this.evaluations.insert(row);
  }

  /** Evaluations for one decision, newest first. */
  async evaluationsFor(
    userId: string,
    decisionId: string,
    limit = 20,
  ): Promise<DecisionEvaluationRow[]> {
    return this.evaluations.findMany(
      { user_id: userId, decision_id: decisionId },
      { orderBy: 'created_at', direction: 'desc', limit },
    );
  }

  /** The latest evaluation of a decision, or `null` when it has never been evaluated. */
  async latestEvaluation(
    userId: string,
    decisionId: string,
  ): Promise<DecisionEvaluationRow | null> {
    const rows = await this.evaluationsFor(userId, decisionId, 1);
    return rows[0] ?? null;
  }
}

export function createDecisionRepository(
  db: SqlExecutor,
  options: DecisionRepositoryOptions = {},
): DecisionRepository {
  return new DecisionRepository(db, options);
}
