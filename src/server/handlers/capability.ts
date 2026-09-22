/**
 * Capability handlers — the catalogue, with the caller's own readiness.
 *
 * This is the read that makes the Phase 5.7 registry visible without moving any decision into the
 * client. Three properties are deliberate:
 *
 *   1. **The client resolves nothing.** Every `state` here was computed on the server from the
 *      caller's stored declarations and the declared availability of the capability, and the
 *      wording beside it is contract text shipped from the registry. A frontend that rendered its
 *      own verdict would be a second opinion nobody authorized.
 *   2. **It is not a permission read.** `state` describes inputs and delivery — whether the
 *      capability exists and whether the caller's declarations satisfy it. Whether a role may run
 *      it, and whether a plan includes it, are decided per request by the pipeline and reported on
 *      the usage surface. Collapsing the three into one badge would produce an explanation that is
 *      right for the wrong reason.
 *   3. **Absent declarations are a state, not an error.** An account that has declared nothing gets
 *      a real reading of an empty context, which is exactly what this surface exists to show.
 *
 * No user id appears in the path or the query, so no account can read another's readiness.
 */

import { AppError } from '../../../packages/shared/src/core/errors.js';
import type {
  CapabilitiesViewData,
  CapabilityModuleView,
  CapabilityView,
} from '../../../packages/shared/src/api/contracts.js';
import {
  CAPABILITY_CATALOGUE,
  capabilityState,
  modulesInUse,
  stateReason,
} from '../../../packages/shared/src/capabilities/registry.js';
import {
  CATEGORY_LABEL,
  MODULE_LABEL,
  MODULE_ROLE,
  RISK_LEVEL_MEANING,
  type CapabilityCategory,
} from '../../../packages/shared/src/capabilities/model.js';
import { PIPELINE_STAGES } from '../../../packages/shared/src/capabilities/orchestration.js';
import { ANALYSIS_TYPES } from '../../../packages/shared/src/quality/readiness.js';
import type { AnalysisReadinessDecision } from '../../../packages/shared/src/quality/readiness.js';
import type { MarketDataInput } from '../../../packages/shared/src/quality/model.js';
import { NO_MARKET_DATA } from '../../../packages/shared/src/quality/model.js';
import type { Repositories } from '../../db/repositories/index.js';
import type { RouteHandler } from '../context.js';
import { decideReadiness, loadContext } from './quality.js';

export interface CapabilityHandlerDeps {
  /** Absent when the server runs without a database handle. */
  repositories?: Repositories | undefined;
  /** What the server can actually offer in the way of bars. Never supplied by a client. */
  marketData?: MarketDataInput | undefined;
  now?: (() => number) | undefined;
}

const NOTE = [
  'Every state on this page was computed on the server from your own declarations and from what each capability declares it needs. No language model is consulted, and no client decides any of it.',
  'Availability and readiness are separate claims: a capability that is declared and not built is reported as unavailable whatever your inputs say, because "your inputs are ready" would otherwise describe a feature that is not there.',
  'The order of the pipeline below is the order the server actually applies. It is declared here so the description and the behaviour cannot drift apart.',
].join(' ');

function store(deps: CapabilityHandlerDeps): Repositories {
  if (deps.repositories === undefined) {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      'The profile store is not configured: the server was started without a database handle, so there are no declared inputs to assess.',
      { details: { capability: 'profile.store' } },
    );
  }
  return deps.repositories;
}

export function capabilityReadHandler(
  deps: CapabilityHandlerDeps,
): RouteHandler<Record<string, unknown>, CapabilitiesViewData> {
  return async ({ context }) => {
    const repositories = store(deps);
    const principal = context.principal;
    if (principal === null) {
      throw new AppError(
        'UNAUTHENTICATED',
        'Capability readiness is assessed for an authenticated account.',
      );
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

    // One verdict per declared analysis type, from the same function the agent and the other
    // routes consult. A second implementation would be a second answer to one question.
    const readiness: AnalysisReadinessDecision[] = decideReadiness({
      context: loaded.context,
      marketData,
      now,
    });
    // Keyed by the declared type name. A verdict is only ever produced for a declared type, so the
    // null case cannot arise; the map is typed to say so rather than to carry it around.
    const byType = new Map<string, AnalysisReadinessDecision>(
      readiness.map((decision) => [decision.analysisType as string, decision]),
    );

    const capabilities: CapabilityView[] = CAPABILITY_CATALOGUE.map((definition) => {
      const gate =
        definition.analysisType === null ? null : (byType.get(definition.analysisType) ?? null);
      const state = capabilityState(definition, gate);
      return {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        category: definition.category,
        categoryLabel:
          CATEGORY_LABEL[definition.category as CapabilityCategory] ?? definition.category,
        modules: [...definition.modules],
        analysisType: definition.analysisType,
        feature: definition.feature,
        operation: definition.operation,
        engineCapability: definition.engineCapability,
        modelMayRequest: definition.modelMayRequest,
        humanOnly: definition.humanOnly,
        availability: definition.availability,
        riskLevel: definition.riskLevel,
        riskMeaning: RISK_LEVEL_MEANING[definition.riskLevel],
        outputs: [...definition.outputs],
        producesFigures: definition.producesFigures,
        memoryPolicy: definition.memoryPolicy,
        claims: [...definition.claims],
        provenance: {
          requiresProvenance: definition.provenance.requiresProvenance,
          permitted: [...definition.provenance.permitted],
          statement: definition.provenance.statement,
        },
        state,
        stateReason: stateReason(definition, state, gate),
      };
    });

    const modules: CapabilityModuleView[] = modulesInUse().map((module) => ({
      id: module,
      label: MODULE_LABEL[module],
      role: MODULE_ROLE[module],
      composedBy: CAPABILITY_CATALOGUE.filter((capability) =>
        capability.modules.includes(module),
      ).map((capability) => capability.id),
    }));

    // Counts and codes only. Which inputs a caller is missing is their own business, and it can be
    // personal, so no field name from their context reaches this record.
    context.logger.info(
      'capabilities read',
      {
        userId: user.id,
        contextVersion: loaded.version,
        contextSet: loaded.contextSet,
        capabilities: capabilities.length,
        available: capabilities.filter((entry) => entry.availability === 'available').length,
        states: capabilities.map((entry) => entry.state),
        analysisTypes: ANALYSIS_TYPES.length,
        marketDataAvailable: marketData.available,
      },
      'capability.read',
    );

    return {
      data: {
        capabilities,
        modules,
        stages: PIPELINE_STAGES.map((stage) => ({
          id: stage.id,
          label: stage.label,
          meaning: stage.meaning,
          blocks: stage.blocks,
        })),
        readiness,
        asOf: new Date(now).toISOString(),
        note: NOTE,
      },
    };
  };
}
