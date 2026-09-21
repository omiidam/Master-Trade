/**
 * Portfolio handlers — the read, and the declaration that replaces the composition.
 *
 * Thin by design, like the profile and quality handlers: the pipeline already
 * authenticated, authorized and validated, so this reads the caller's own declaration,
 * runs the deterministic engine over it, and shapes the answer. No route accepts a user
 * id, so reading or writing another account's portfolio is not expressible.
 *
 * Four decisions worth stating, because each one is a place where the obvious choice
 * would have been wrong:
 *
 *   1. **The gate runs before anything is computed.** Readiness is composed from two
 *      layers: the Phase 5.3 verdict for the scope, and the portfolio layer's own reading
 *      of the document (`readiness.ts`). The second can only *narrow* the first, and it
 *      does not compute a metric to decide — so a blocked portfolio never produces a
 *      table of figures that a surface could render anyway. Both verdicts are returned, so
 *      a client can see which layer refused and why.
 *   2. **A `BLOCKED` scope produces no metrics for that scope.** The composition metrics
 *      are still computed and returned when the *document* is readable, at whatever the
 *      assessment says they are worth — the caveats travel with the numbers rather than
 *      being dropped. What is never produced is a figure for a scope the gate refused.
 *   3. **Nothing declared is a state, not an error.** An account that has not declared a
 *      portfolio gets a real reading of an empty document: `declared: false`, an
 *      assessment, and readiness verdicts that ask for the composition. That is the
 *      truthful answer, and it is exactly what the surface exists to show.
 *   4. **No value is stored, and no value comes from the client.** Every figure in the
 *      response is computed here from stored positions. A client cannot report its own
 *      total — there is no field for one.
 *
 * The log line carries counts, codes and the version. A holding can be somebody's entire
 * financial position, so no symbol, no quantity and no amount is ever logged.
 */

import { AppError } from '../../../packages/shared/src/core/errors.js';
import type {
  PortfolioSnapshotView,
  PortfolioViewData,
} from '../../../packages/shared/src/api/contracts.js';
import type { PortfolioWriteBody } from '../../../packages/shared/src/api/schemas.js';
import { ids } from '../../../packages/shared/src/core/ids.js';
import {
  PORTFOLIO_SNAPSHOT_REASON_LABEL,
  type Portfolio,
} from '../../../packages/shared/src/portfolio/model.js';
import {
  PORTFOLIO_SCOPES,
  assessPortfolioReadiness,
  type PortfolioReadinessDecision,
} from '../../../packages/shared/src/portfolio/readiness.js';
import { analysePortfolio } from '../../../packages/trading-engine/src/portfolio.js';
import {
  NO_MARKET_DATA,
  type MarketDataInput,
} from '../../../packages/shared/src/quality/model.js';
import type { TradingContext } from '../../../packages/shared/src/profile/model.js';
import type { Repositories } from '../../db/repositories/index.js';
import {
  portfolioOrDefault,
  type PortfolioRepository,
  type StoredPortfolio,
} from '../../db/repositories/portfolio.js';
import type { UsageService } from '../../usage/service.js';
import type { RequestContext, RouteHandler } from '../context.js';
import { decideReadiness, loadContext } from './quality.js';

export interface PortfolioHandlerDeps {
  /** Absent when the server runs without a database handle. */
  repositories?: Repositories | undefined;
  /**
   * What the server can offer in the way of bars.
   *
   * Reported by the server and never accepted from a client: the gate weighs the series
   * before a risk characterisation runs, so \"the data is fine\" is precisely the claim it
   * exists to check rather than believe.
   */
  marketData?: MarketDataInput | undefined;
  /**
   * The metering service, when the server has one.
   *
   * Composition costs nothing, so nothing is ever charged here. The call is made anyway,
   * and deliberately: the entitlement is still resolved (a role or a plan may refuse), and
   * the attempt is still recorded in the usage history — so \"this capability ran and cost
   * nothing\" is checkable rather than asserted.
   */
  usage?: UsageService | undefined;
  /** The feature whose entitlement this surface consumes. Defaults to composition. */
  featureId?: string | undefined;
  now?: (() => number) | undefined;
}

const READ_NOTE =
  'Every figure here is computed by deterministic code from the composition you declared. Nothing is projected, no target is proposed, and no model contributed to any number. Positions with no price are named as gaps rather than valued at an estimate.';

const WRITE_NOTE =
  'The declaration was stored as a new version. Earlier versions are kept and never rewritten, so any analysis can still be traced back to the composition it was computed from.';

function store(deps: PortfolioHandlerDeps): Repositories {
  if (deps.repositories === undefined) {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      'The portfolio store is not configured: the server was started without a database handle, so there is no declaration to read or write.',
      { details: { capability: 'portfolio.store' } },
    );
  }
  return deps.repositories;
}

/** The composition as the engine and the gate read it, with its version and provenance. */
interface Loaded {
  portfolio: Portfolio;
  declared: boolean;
  version: number;
  context: TradingContext;
  userId: string;
}

async function load(repositories: Repositories, userId: string, now: number): Promise<Loaded> {
  const [stored, context] = await Promise.all([
    (repositories.portfolio as PortfolioRepository).current(userId),
    loadContext(repositories, userId, now),
  ]);
  const held = portfolioOrDefault(stored as StoredPortfolio | null, now);
  return {
    portfolio: held.portfolio,
    declared: held.declared,
    version: held.version,
    context: context.context,
    userId,
  };
}

/**
 * The composed verdict, one entry per scope.
 *
 * Exported because it is the *only* place the two gates are joined, and the agent path
 * will need the same join the moment a portfolio question reaches it. Two implementations
 * would be two answers to one question, which is the failure mode this whole layer is
 * built to avoid.
 */
export function decidePortfolioReadiness(
  loaded: Pick<Loaded, 'portfolio' | 'context'>,
  options: { marketData: MarketDataInput; now: number },
): PortfolioReadinessDecision[] {
  return PORTFOLIO_SCOPES.map((scope) => {
    // The base gate first, for the type this scope names. It is `portfolio.composition`
    // or `portfolio.risk` by construction — the scopes *are* the base analysis types — so
    // a missing verdict would be a catalogue error rather than a user-input gap. It is
    // refused rather than synthesised, because a fabricated verdict is exactly what the
    // composition rule forbids.
    const base = decideReadiness(
      { context: loaded.context, marketData: options.marketData, now: options.now },
      { analysisType: scope },
    )[0];
    if (base === undefined) {
      throw new AppError(
        'INTERNAL',
        `The input-quality gate produced no verdict for ${scope}, so portfolio readiness cannot be composed.`,
        { details: { scope } },
      );
    }
    return assessPortfolioReadiness({
      scope,
      base,
      portfolio: loaded.portfolio,
      now: options.now,
    });
  });
}

/** The version history, as a list view reads it. */
function snapshotViews(rows: readonly unknown[]): PortfolioSnapshotView[] {
  return rows.map((raw) => {
    const row = raw as {
      version: number;
      reason: keyof typeof PORTFOLIO_SNAPSHOT_REASON_LABEL;
      changed_by: string;
      created_at: string;
    };
    return {
      version: row.version,
      reason: row.reason,
      reasonLabel: PORTFOLIO_SNAPSHOT_REASON_LABEL[row.reason] ?? row.reason,
      changedBy: row.changed_by,
      createdAt: row.created_at,
    };
  });
}

/** Shape one reading of the stored composition into the response. */
async function view(
  repositories: Repositories,
  loaded: Loaded,
  deps: PortfolioHandlerDeps,
  now: number,
  note: string,
): Promise<PortfolioViewData> {
  const repository = repositories.portfolio as PortfolioRepository;
  const rows = loaded.declared ? await repository.snapshotsFor(loaded.userId, 20) : [];

  const analysis = analysePortfolio({
    portfolio: loaded.portfolio,
    now,
    context: loaded.context,
  });
  const readiness = decidePortfolioReadiness(loaded, {
    marketData: deps.marketData ?? NO_MARKET_DATA,
    now,
  });

  return {
    declared: loaded.declared,
    version: loaded.version,
    portfolio: loaded.portfolio,
    assessment: analysis.assessment,
    metrics: analysis.metrics,
    // Copied into a mutable array for the response: the engine's result is readonly by
    // design (nothing downstream may edit a computed figure), and the wire format is a
    // plain list.
    insights: [...analysis.insights],
    readiness,
    snapshots: snapshotViews(rows),
    asOf: new Date(now).toISOString(),
    note,
  };
}

/**
 * Meter the composition, then shape the answer.
 *
 * The feature costs zero credits, so this never refuses for affordability. That is not a
 * reason to skip it: the entitlement check still runs (a role, a plan, a period cap or a
 * deliberate hold can all refuse), and the attempt is recorded — which is what makes the
 * usage history a record of what the platform did rather than only of what it charged.
 */
async function metered<T>(
  deps: PortfolioHandlerDeps,
  context: RequestContext,
  work: () => Promise<{ charge: boolean; value: T }>,
): Promise<T> {
  const { usage, featureId } = deps;
  const principal = context.principal;
  if (usage === undefined || featureId === undefined || principal === null) {
    return (await work()).value;
  }
  const outcome = await usage.meter(
    {
      userId: principal.id,
      featureId,
      operationKey: `composition:${context.correlationId}`,
      // The pipeline reached this handler only because the principal holds
      // `portfolio.read`. Passing that through rather than re-deriving it keeps this layer
      // from being a second, weaker permission system.
      permissionGranted: true,
      correlationId: context.correlationId,
      actor: principal.id,
    },
    work,
  );
  if (!outcome.allowed) {
    throw new AppError('FORBIDDEN', outcome.decision.reason, {
      details: { feature: featureId, denial: outcome.decision.denial },
    });
  }
  return outcome.value;
}

export function portfolioReadHandler(
  deps: PortfolioHandlerDeps,
): RouteHandler<Record<string, unknown> | undefined, PortfolioViewData> {
  return async ({ context }) => {
    const repositories = store(deps);
    const principal = context.principal;
    if (principal === null) {
      throw new AppError('UNAUTHENTICATED', 'A portfolio is read for an authenticated account.');
    }
    const now = (deps.now ?? (() => Date.now()))();

    const answer = await metered(deps, context, async () => {
      const loaded = await load(repositories, principal.id, now);
      const data = await view(repositories, loaded, deps, now, READ_NOTE);
      return { charge: false, value: data };
    });

    // Counts, codes and the version. No symbol, no quantity and no amount can reach this
    // record, because none is read here.
    context.logger.info(
      'portfolio read',
      {
        userId: principal.id,
        declared: answer.declared,
        version: answer.version,
        positions: answer.metrics.coverage.positions,
        priced: answer.metrics.coverage.priced,
        weighted: answer.metrics.coverage.weighted,
        costed: answer.metrics.coverage.costed,
        readiness: answer.readiness.map((decision) => decision.readiness),
        scopes: answer.readiness.map((decision) => decision.scope),
        decidedBy: answer.readiness.map((decision) => decision.decidedBy),
        insights: answer.insights.length,
      },
      'portfolio.read',
    );

    return { data: answer };
  };
}

/**
 * Declare the composition, and answer with the reading it produces.
 *
 * **Not metered, deliberately.** Metering exists to account for consumption, and a
 * declaration consumes nothing: it is a statement about what the account holds, and
 * recording it as a usage attempt would blur "what the platform did" with "what the user
 * told it". The capability the catalogue prices is the composition *computation*, whose
 * declared operation is `portfolio.read` — so metering belongs on the route that runs the
 * arithmetic and on no other. The request is still authorized as `portfolio.write`, which
 * is a narrower grant than reading.
 */
export function portfolioWriteHandler(
  deps: PortfolioHandlerDeps,
): RouteHandler<PortfolioWriteBody, PortfolioViewData> {
  return async ({ context, body }) => {
    const repositories = store(deps);
    const principal = context.principal;
    if (principal === null) {
      throw new AppError(
        'UNAUTHENTICATED',
        'A portfolio is declared for an authenticated account.',
      );
    }
    const now = (deps.now ?? (() => Date.now()))();
    const repository = repositories.portfolio as PortfolioRepository;

    /*
     * The ids are minted here, never accepted from the body: a client that could name a row
     * could name a row belonging to somebody else. `changedBy` is the principal's own id,
     * so a version with no attribution — which would be an unreviewable version — is not
     * expressible.
     */
    const stored = await repository.replace({
      userId: principal.id,
      document: {
        ...body,
        positions: body.positions.map((position) => ({ ...position, id: ids.id('pfp') })),
      },
      changedBy: principal.id,
      reason: 'edited',
    });
    const loaded: Loaded = {
      portfolio: stored.portfolio,
      declared: true,
      version: stored.version,
      context: (await loadContext(repositories, principal.id, now)).context,
      userId: principal.id,
    };
    const answer = await view(repositories, loaded, deps, now, WRITE_NOTE);

    context.logger.info(
      'portfolio declared',
      {
        userId: principal.id,
        version: answer.version,
        positions: answer.portfolio.positions.length,
        baseCurrency: answer.portfolio.baseCurrency,
        readiness: answer.readiness.map((decision) => decision.readiness),
      },
      'portfolio.write',
    );

    return { data: answer };
  };
}
