/**
 * Input-quality handlers.
 *
 * Thin by design, like the profile handlers: the pipeline already authenticated,
 * authorized and validated, so this reads the caller's own declarations, runs the
 * deterministic gate, and shapes the answer. It never accepts a subject — the
 * principal is the only subject there is.
 *
 * Three deliberate behaviours:
 *
 *   1. **No store, no answer.** With no repository configured the handler refuses with
 *      `PROVIDER_UNAVAILABLE` naming the missing capability, rather than assessing an
 *      empty context and reporting a user's own inputs as missing.
 *   2. **Absent is a state, not an error.** A user who has declared nothing gets a real
 *      assessment of an empty context — every field missing, every analysis blocked or
 *      limited — because that is the truthful answer and it is exactly what the surface
 *      exists to show.
 *   3. **The log carries no inputs.** Every field of a declaration can be personal, so
 *      the summary logs counts, codes and the version, and nothing else. The assessment
 *      itself is shaped so that this is possible: it carries representations rather than
 *      values.
 */

import { AppError } from '../../../packages/shared/src/core/errors.js';
import type { QualityAssessData } from '../../../packages/shared/src/api/contracts.js';
import type { QualityAssessBody } from '../../../packages/shared/src/api/schemas.js';
import {
  NO_MARKET_DATA,
  analyseQualityInputs,
  type MarketDataInput,
  type QualityReport,
} from '../../../packages/shared/src/quality/model.js';
import {
  ANALYSIS_TYPES,
  assessAnalysisReadiness,
  type AnalysisReadinessDecision,
} from '../../../packages/shared/src/quality/readiness.js';
import {
  emptyContext,
  type FieldKey,
  type TradingContext,
} from '../../../packages/shared/src/profile/model.js';
import type { Repositories } from '../../db/repositories/index.js';
import type { RouteHandler } from '../context.js';

export interface QualityHandlerDeps {
  /** Absent when the server runs without a database handle. */
  repositories?: Repositories | undefined;
  /**
   * What the server can actually offer in the way of bars.
   *
   * Supplied by the server, never by a client: "the data is fine" is precisely the
   * claim the gate exists to check rather than believe.
   */
  marketData?: MarketDataInput | undefined;
  now?: (() => number) | undefined;
}

const NOTE =
  'Quality is computed from what you have declared and from what the capability declares it needs. It is deterministic, it is reproducible from the context version named above, and no language model can override it.';

function store(deps: QualityHandlerDeps): Repositories {
  if (deps.repositories === undefined) {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      'The profile store is not configured: the server was started without a database handle, so there are no declared inputs to assess.',
      { details: { capability: 'profile.store' } },
    );
  }
  return deps.repositories;
}

/**
 * The gate, as a function of the stored context.
 *
 * Exported because the agent consults the same function before a model is asked to
 * reason. One implementation means the answer the agent acts on and the answer the
 * API returns cannot disagree — which would be the worst possible bug in this layer,
 * since the client would then be told "not ready" about a turn that ran anyway.
 */
export interface ReadinessInputs {
  context: TradingContext;
  marketData: MarketDataInput;
  now: number;
}

export function decideReadiness(
  inputs: ReadinessInputs,
  options: { analysisType?: string; premises?: readonly FieldKey[] } = {},
): AnalysisReadinessDecision[] {
  const types: readonly string[] =
    options.analysisType === undefined ? ANALYSIS_TYPES : [options.analysisType];
  const premises = options.premises ?? [];
  return types.map((analysisType) =>
    assessAnalysisReadiness({
      analysisType,
      context: inputs.context,
      marketData: inputs.marketData,
      premises,
      now: inputs.now,
    }),
  );
}

/** Read the caller's current context, or an empty one when nothing is stored. */
export async function loadContext(
  repositories: Repositories,
  userId: string,
  now: number,
): Promise<{ context: TradingContext; version: number; contextSet: boolean }> {
  const current = await repositories.profile.current(userId);
  return {
    context: current?.context ?? emptyContext(new Date(now).toISOString()),
    version: current?.version ?? 0,
    contextSet: current !== null,
  };
}

export function qualityAssessHandler(
  deps: QualityHandlerDeps,
): RouteHandler<QualityAssessBody, QualityAssessData> {
  return async ({ context, body }) => {
    const repositories = store(deps);
    const principal = context.principal;
    if (principal === null) {
      throw new AppError('UNAUTHENTICATED', 'Input quality is assessed for an authenticated user.');
    }

    const user = await repositories.identity.findUser(principal.id);
    if (user === null) {
      throw new AppError('NOT_FOUND', 'No account exists for the authenticated principal.', {
        details: { userId: principal.id },
      });
    }

    const now = (deps.now ?? (() => Date.now()))();
    const marketData = deps.marketData ?? NO_MARKET_DATA;
    const loaded = await loadContext(repositories, user.id, now);

    const report: QualityReport = analyseQualityInputs({
      context: loaded.context,
      marketData,
      now,
    });
    const decisions = decideReadiness(
      { context: loaded.context, marketData, now },
      {
        ...(body.analysisType === undefined ? {} : { analysisType: body.analysisType }),
        ...(body.premises === undefined ? {} : { premises: body.premises }),
      },
    );

    // Counts, codes and the version. No field value, and no user text, can reach this
    // record — the assessment does not contain any.
    context.logger.info(
      'input quality assessed',
      {
        userId: user.id,
        contextVersion: loaded.version,
        contextSet: loaded.contextSet,
        marketDataAvailable: marketData.available,
        decisions: decisions.length,
        readiness: decisions.map((decision) => decision.readiness),
        classification: decisions.map((decision) => decision.classification),
        decidedBy: decisions.map((decision) => decision.decidedBy),
        fields: report.counts.fields,
        usable: report.counts.usable,
      },
      'quality.assess',
    );

    return {
      data: {
        contextSet: loaded.contextSet,
        contextVersion: loaded.version,
        marketData: {
          available: marketData.available,
          provenance: marketData.provenance,
          source: marketData.source,
          barCount: marketData.barCount,
          lastBarAt: marketData.lastBarAt,
          detail: marketData.detail,
        },
        report,
        decisions,
        asOf: new Date(now).toISOString(),
        note: NOTE,
      },
    };
  };
}
