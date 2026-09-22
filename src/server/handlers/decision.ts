/**
 * Decision handlers — record, read, and evaluate one recorded decision.
 *
 * Thin by design, like the profile, quality and portfolio handlers: the pipeline already
 * authenticated, authorized and validated, so this reads the caller's own records, runs the
 * deterministic evaluation over the prices *they* recorded, and shapes the answer. No route
 * accepts a user id, so reading or writing another account's decisions is not expressible.
 *
 * Five decisions worth stating, because each is a place where the obvious choice would have been
 * wrong:
 *
 *   1. **The two gates are composed, and the second can only narrow the first.** Readiness is the
 *      Phase 5.3 verdict on the caller's declared context, narrowed by the record's own reading.
 *      Both travel in the response, so a client can see which layer refused. Neither is recomputed
 *      by a client, and neither can be widened by a model.
 *   2. **An evaluation row stores no figures.** The verdict, the rule and the finding codes are
 *      recorded against the version they were read from; every number is recomputed from the
 *      record whenever it is shown. Storing a total would let a corrected price leave a stale one
 *      behind, so a correction explains itself by recomputation rather than by an edited row.
 *   3. **A blocked record produces no figures, including on the read.** `report` is `null` rather
 *      than a document full of zeroes: a zero is a measurement, and a refusal is not.
 *   4. **The body may not name the row.** The path carries the id, so a client cannot rename a
 *      record it does not own into existence.
 *   5. **Nothing computed is accepted from a client.** The record schema has no field for a
 *      return, a status, an outcome or a score — those are the engine's, and a client that could
 *      send one would be a client reporting its own results.
 *
 * The log line carries counts and codes. A decision can name somebody's position, price and
 * rationale, so no symbol, no price, no rationale and no computed value is ever logged.
 */

import { AppError } from '../../../packages/shared/src/core/errors.js';
import type {
  DecisionEvaluationView,
  DecisionListData,
  DecisionSummaryView,
  DecisionViewData,
} from '../../../packages/shared/src/api/contracts.js';
import type { DecisionWriteBody } from '../../../packages/shared/src/api/schemas.js';
import type { DecisionRecord } from '../../../packages/shared/src/decisions/model.js';
import {
  DECISION_SCOPE,
  assessDecisionReadiness,
  type DecisionReadinessDecision,
} from '../../../packages/shared/src/decisions/readiness.js';
import { buildDecisionReport } from '../../../packages/trading-engine/src/index.js';
import type { TradingContext } from '../../../packages/shared/src/profile/model.js';
import {
  NO_MARKET_DATA,
  type MarketDataInput,
} from '../../../packages/shared/src/quality/model.js';
import type { Repositories } from '../../db/repositories/index.js';
import type {
  DecisionRepository,
  DecisionEvaluationRow,
  DecisionRow,
} from '../../db/repositories/decision.js';
import type { UsageService } from '../../usage/service.js';
import type { RequestContext, RouteHandler } from '../context.js';
import { decideReadiness, loadContext } from './quality.js';

export interface DecisionHandlerDeps {
  /** Absent when the server runs without a database handle. */
  repositories?: Repositories | undefined;
  /** Metering for the evaluation route. Absent when no usage store is wired. */
  usage?: UsageService | undefined;
  /** The metered feature an evaluation consumes. */
  featureId?: string | undefined;
  marketData?: MarketDataInput | undefined;
  now?: (() => number) | undefined;
}

const LIST_NOTE =
  'Decisions are the caller’s own records. Nothing on this surface is a verdict: an evaluation attempts to measure what the recorded prices did, and says nothing about whether the decision was right.';

const VIEW_NOTE =
  'Readiness is the worse of two readings: what you declared about yourself, and what this record actually supports. Every figure in an evaluation was computed from the prices on the record. Nothing is predicted, and no decision is graded.';

function store(deps: DecisionHandlerDeps): Repositories {
  if (deps.repositories === undefined) {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      'The decision store is not configured: the server was started without a database handle, so there are no records to read or write.',
      { details: { capability: 'decision.store' } },
    );
  }
  return deps.repositories;
}

function repository(deps: DecisionHandlerDeps): DecisionRepository {
  return store(deps).decision as DecisionRepository;
}

function owner(context: RequestContext): string {
  const principal = context.principal;
  if (principal === null) {
    throw new AppError('UNAUTHENTICATED', 'A decision is recorded for an authenticated account.');
  }
  return principal.id;
}

/**
 * The composed verdict for one record.
 *
 * Exported for the same reason the portfolio join is: it is the only place the two gates meet, and
 * a second implementation would be a second answer to one question. The base verdict comes from the
 * same function the API and the agent consult, so a page and a turn cannot disagree.
 */
export function decideDecisionReadiness(input: {
  decision: DecisionRecord;
  context: TradingContext;
  marketData: MarketDataInput;
  now: number;
}): DecisionReadinessDecision {
  const base = decideReadiness(
    { context: input.context, marketData: input.marketData, now: input.now },
    { analysisType: DECISION_SCOPE },
  )[0];
  if (base === undefined) {
    // The scope names a declared analysis type by construction, so a missing verdict is a catalogue
    // error rather than a user-input gap. Refused rather than synthesised: a fabricated verdict is
    // exactly what the composition rule forbids.
    throw new AppError(
      'INTERNAL',
      `The input-quality gate produced no verdict for ${DECISION_SCOPE}, so decision readiness cannot be composed.`,
      { details: { scope: DECISION_SCOPE } },
    );
  }
  return assessDecisionReadiness({ decision: input.decision, base, now: input.now });
}

function evaluationViews(rows: readonly DecisionEvaluationRow[]): DecisionEvaluationView[] {
  return rows.map((row) => ({
    id: row.id,
    reason: row.reason,
    evaluatedAt: row.created_at,
    outcome: row.outcome,
    readiness: row.readiness,
    decidedBy: row.decided_by,
    findingCodes: [...row.finding_codes],
    decisionVersion: row.decision_version,
  }));
}

function summarise(row: DecisionRow, latest: DecisionEvaluationRow | null): DecisionSummaryView {
  return {
    id: row.id,
    type: row.type,
    kind: row.kind,
    symbol: row.symbol,
    assetClass: row.document.assetClass,
    currency: row.currency,
    decidedAt: row.decided_at,
    updatedAt: row.updated_at,
    version: row.version,
    latest:
      latest === null
        ? null
        : {
            outcome: latest.outcome,
            readiness: latest.readiness,
            evaluatedAt: latest.created_at,
            reason: latest.reason,
          },
  };
}

/** Read one decision into the wire shape, computing the report fresh. */
async function view(
  deps: DecisionHandlerDeps,
  records: DecisionRepository,
  userId: string,
  stored: {
    row: DecisionRow;
    decision: DecisionRecord;
    evaluations: readonly DecisionEvaluationRow[];
  },
  now: number,
): Promise<DecisionViewData> {
  const context = await loadContext(store(deps), userId, now);
  const readiness = decideDecisionReadiness({
    decision: stored.decision,
    context: context.context,
    marketData: deps.marketData ?? NO_MARKET_DATA,
    now,
  });

  // `report` exists only where the composed gate allows an evaluation. A record whose input half is
  // complete but whose outcome half is absent still gets its assessment, inside `readiness`.
  const allowed =
    readiness.readiness === 'READY_FOR_EVALUATION' ||
    readiness.readiness === 'READY_WITH_LIMITATIONS';

  return {
    decision: stored.decision,
    readiness,
    report: allowed
      ? buildDecisionReport({ decision: stored.decision, now, context: context.context })
      : null,
    evaluations: evaluationViews(stored.evaluations),
    asOf: new Date(now).toISOString(),
    note: VIEW_NOTE,
  };
}

export function decisionListHandler(
  deps: DecisionHandlerDeps,
): RouteHandler<Record<string, unknown>, DecisionListData> {
  return async ({ context, query }) => {
    const records = repository(deps);
    const userId = owner(context);
    const filters = query as { limit?: number; offset?: number; symbol?: string; kind?: string };
    const now = (deps.now ?? (() => Date.now()))();

    const rows = await records.list(userId, {
      ...(filters.limit === undefined ? {} : { limit: filters.limit }),
      ...(filters.offset === undefined ? {} : { offset: filters.offset }),
      ...(filters.symbol === undefined ? {} : { symbol: filters.symbol }),
      ...(filters.kind === undefined ? {} : { kind: filters.kind as DecisionRow['kind'] }),
    });
    const total = await records.count(userId);
    // One indexed point read per row, because the alternative is a stored summary that could
    // disagree with the evaluations it summarises.
    const latest = await Promise.all(rows.map((row) => records.latestEvaluation(userId, row.id)));

    context.logger.info(
      'decisions listed',
      {
        userId,
        listed: rows.length,
        total,
        evaluated: latest.filter((row) => row !== null).length,
      },
      'decision.read',
    );

    return {
      data: {
        decisions: rows.map((row, index) => summarise(row, latest[index] ?? null)),
        total,
        asOf: new Date(now).toISOString(),
        note: LIST_NOTE,
      },
    };
  };
}

export function decisionGetHandler(
  deps: DecisionHandlerDeps,
): RouteHandler<Record<string, unknown>, DecisionViewData> {
  return async ({ context, params }) => {
    const records = repository(deps);
    const userId = owner(context);
    const { decisionId } = params as { decisionId: string };
    const now = (deps.now ?? (() => Date.now()))();

    const found = await records.get(userId, decisionId);
    if (found === null) {
      throw new AppError('NOT_FOUND', 'No decision with that id is recorded for this account.', {
        details: { decisionId },
      });
    }

    return { data: await view(deps, records, userId, found, now) };
  };
}

/**
 * Record or amend one decision.
 *
 * The id comes from the path and the body's own id is ignored, which is the isolation rule in one
 * line: a client can address a record it owns and cannot name one into existence. The author is the
 * principal's own id, so an unattributed version — one nobody can review — is not expressible.
 *
 * **Not metered, deliberately.** A declaration consumes nothing: recording what you decided is a
 * statement about yourself, and metering it would blur "what the platform did" with "what the user
 * told it". The capability the catalogue prices is the evaluation, whose declared operation is
 * `decision.evaluate` — so metering belongs on the route that runs the arithmetic and on no other.
 * The request is still authorized as `decision.write`, which is a different grant.
 */
export function decisionRecordHandler(
  deps: DecisionHandlerDeps,
): RouteHandler<DecisionWriteBody, DecisionViewData> {
  return async ({ context, body }) => {
    const records = repository(deps);
    const userId = owner(context);
    const now = (deps.now ?? (() => Date.now()))();
    const at = new Date(now).toISOString();

    // No `id` in the record, and none to give: the repository's schema is strict and mints the id
    // itself, so a client cannot name a row even by addressing one. `updatedAt` is the server's
    // clock rather than the caller's — a record that could set its own timestamp could claim to be
    // older than it is.
    const stored = await records.record({
      userId,
      record: { ...body, updatedAt: at },
      decidedBy: userId,
    });

    context.logger.info(
      'decision recorded',
      { userId, decisionId: stored.row.id, type: stored.row.type, kind: stored.row.kind },
      'decision.write',
    );

    return { data: await view(deps, records, userId, stored, now) };
  };
}

/**
 * Amend a decision the caller already owns.
 *
 * An id that has never existed is a 404 rather than an insert. A create-that-upserts would be a way
 * to write a row whose provenance nobody can establish, and the read path already answers 404 for a
 * record that is not this account's — so the two agree about what "no such decision of yours"
 * means.
 */
export function decisionWriteHandler(
  deps: DecisionHandlerDeps,
): RouteHandler<DecisionWriteBody, DecisionViewData> {
  return async ({ context, params, body }) => {
    const records = repository(deps);
    const userId = owner(context);
    const { decisionId } = params as { decisionId: string };
    const now = (deps.now ?? (() => Date.now()))();
    const at = new Date(now).toISOString();

    const existing = await records.get(userId, decisionId);
    if (existing === null) {
      throw new AppError(
        'NOT_FOUND',
        'No decision with that id is recorded for this account, and amending is not a way to record one.',
        { details: { decisionId } },
      );
    }

    const stored = await records.amend({
      userId,
      decisionId,
      record: { ...body, updatedAt: at },
      changedBy: userId,
    });

    context.logger.info(
      'decision amended',
      { userId, decisionId, type: stored.row.type, kind: stored.row.kind },
      'decision.write',
    );

    return { data: await view(deps, records, userId, stored, now) };
  };
}

/**
 * Evaluate one recorded decision.
 *
 * **Metered**, because this route runs the arithmetic the catalogue prices. The feature costs zero
 * credits — it runs no provider — so it never refuses for affordability, and the entitlement check
 * still runs: a role, a plan, a period cap or a deliberate hold can all refuse, and the attempt is
 * recorded either way. That is what makes the usage history a record of what the platform did
 * rather than only of what it charged.
 *
 * A refused gate does **not** append an evaluation row, and does not charge: nothing was measured,
 * so there is nothing to record as having been measured. The refusal comes back as a readiness
 * verdict with its reasons, which is a complete answer in the same shape as any other.
 */
export function decisionEvaluateHandler(
  deps: DecisionHandlerDeps,
): RouteHandler<Record<string, unknown>, DecisionViewData> {
  return async ({ context, params, body }) => {
    const records = repository(deps);
    const userId = owner(context);
    const { decisionId } = params as { decisionId: string };
    const now = (deps.now ?? (() => Date.now()))();
    const reason =
      (body as { reason?: DecisionViewData['evaluations'][number]['reason'] }).reason ??
      'requested';

    const found = await records.get(userId, decisionId);
    if (found === null) {
      throw new AppError('NOT_FOUND', 'No decision with that id is recorded for this account.', {
        details: { decisionId },
      });
    }

    const { usage, featureId } = deps;

    const evaluate = async (): Promise<{ charge: boolean; value: DecisionViewData }> => {
      const stored = store(deps);
      const answer = await view(deps, records, userId, found, now);

      // The gate decides before anything is measured, and a refusal is an answer rather than an
      // error: no row is appended, because nothing was measured.
      if (answer.report === null) {
        context.logger.info(
          'decision evaluation refused',
          {
            userId,
            decisionId,
            readiness: answer.readiness.readiness,
            decidedBy: answer.readiness.decidedBy,
            findings: answer.readiness.findings.length,
          },
          'decision.evaluate',
        );
        return { charge: false, value: answer };
      }

      await records.recordEvaluation({
        userId,
        decisionId,
        decisionVersion: found.row.version,
        readiness: answer.readiness.readiness,
        outcome: answer.report.outcome,
        decidedBy: answer.readiness.decidedBy,
        findingCodes: answer.readiness.findings.map((finding) => finding.code),
        reason,
      });

      const recorded = await records.get(userId, decisionId);
      context.logger.info(
        'decision evaluated',
        {
          userId,
          decisionId,
          outcome: answer.report.outcome,
          figures: answer.report.figures.length,
          observations: answer.report.observations.length,
          evaluable: answer.report.assessment.evaluable,
          assumptions: answer.report.assumptions.length,
          reason,
        },
        'decision.evaluate',
      );

      // `charge: false` because the feature costs zero credits: nothing is moved, and the attempt
      // is still recorded.
      return {
        charge: false,
        value: recorded === null ? answer : await view(deps, records, userId, recorded, now),
      };
    };

    if (usage === undefined || featureId === undefined) {
      return { data: (await evaluate()).value };
    }

    const outcome = await usage.meter(
      {
        userId,
        featureId,
        // The decision id and the reason make the key stable per attempt, so a retry of the same
        // evaluation reuses the reservation rather than charging twice.
        operationKey: `decision-evaluate:${decisionId}:${reason}:${context.correlationId}`,
        // The pipeline reached this handler only because the principal holds `decision.evaluate`.
        // Passing that through rather than re-deriving it keeps this layer from being a second,
        // weaker permission system.
        permissionGranted: true,
        correlationId: context.correlationId,
        actor: userId,
      },
      evaluate,
    );
    if (!outcome.allowed) {
      throw new AppError('FORBIDDEN', outcome.decision.reason, {
        details: { feature: featureId, denial: outcome.decision.denial },
      });
    }
    return { data: outcome.value };
  };
}
