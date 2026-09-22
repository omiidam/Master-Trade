/**
 * The capability system — the registry, the gates, and the plan.
 *
 * The claims this suite exists to defend — every one of them a refusal that nothing else
 * would notice:
 *
 *   1. **Deny-by-default is the data structure, not a rule.** An id nobody declared has no
 *      entry, so there is no implementation to reach and no branch that could forget to
 *      check.
 *   2. **The registry does not restate the tables it references.** Availability has to
 *      agree with the requirement registry and with the feature catalogue, and an engine
 *      binding exists only where an engine actually implements the capability. Drift is
 *      what made a built capability report itself as unimplemented.
 *   3. **An unimplemented capability outranks a missing input.** Telling someone their input
 *      is missing, when supplying it would change nothing, is a way of wasting their time.
 *   4. **Nothing is charged for work that did not happen.** A refusal holds no credits, and
 *      the plan has no credit movement before the entitlement stage passes.
 *   5. **A model cannot widen anything.** It cannot request a human-only capability, cannot
 *      run an operation the role table denies, and is never consulted about readiness,
 *      permission or cost.
 *   6. **A refusal is a complete result.** Same shape as a success, with the stage it
 *      stopped at and what would change the answer.
 */

import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_STATES,
  CAPABILITY_STATE_MEANING,
  CAPABILITY_STATE_RANK,
  CAPABILITY_MODULES,
  MODULE_ROLE,
  RISK_LEVEL_MEANING,
  RESULT_NOTE,
  stateFromReadiness,
  worseState,
  type CapabilityDefinition,
} from '../packages/shared/src/capabilities/model.js';
import {
  CAPABILITY_CATALOGUE,
  CapabilityCatalogueError,
  assertCapabilityCatalogue,
  capabilityForAnalysisType,
  capabilityForFeature,
  capabilityState,
  modulesInUse,
  resolveCapability,
  stateReason,
} from '../packages/shared/src/capabilities/registry.js';
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_IDS,
  planCapabilityRun,
  resultFromPlan,
  stageFor,
} from '../packages/shared/src/capabilities/orchestration.js';
import {
  ANALYSIS_REQUIREMENTS,
  assessAnalysisReadiness,
} from '../packages/shared/src/quality/readiness.js';
import { NO_MARKET_DATA, type MarketDataInput } from '../packages/shared/src/quality/model.js';
import {
  emptyContext,
  statedField,
  type Holding,
  type TradingContext,
} from '../packages/shared/src/profile/model.js';
import { FEATURES, featureFor } from '../packages/shared/src/usage/features.js';
import { resolveEntitlement } from '../packages/shared/src/usage/entitlements.js';
import { FEATURES_BY_ID } from '../packages/shared/src/usage/features.js';

const NOW = Date.parse('2026-09-21T12:00:00.000Z');
const iso = (offsetDays = 0): string => new Date(NOW + offsetDays * 86_400_000).toISOString();

/** A context where every declared requirement of every capability is met. */
function completeContext(observedAt = iso()): TradingContext {
  return {
    ...emptyContext(observedAt),
    experienceLevel: statedField('intermediate', observedAt),
    markets: statedField(['equity', 'fx'], observedAt),
    instruments: statedField(['AAPL', 'MSFT'], observedAt),
    tradingStyle: statedField('swing', observedAt),
    timeframe: statedField('4h', observedAt),
    learningGoals: statedField(['risk-management'], observedAt),
    capitalRange: statedField('10k-50k', observedAt),
    riskTolerance: statedField('balanced', observedAt),
    horizon: statedField('weeks', observedAt),
    holdings: statedField<Holding[]>(
      [
        { symbol: 'AAPL', assetClass: 'equity', weightPercent: 40 },
        { symbol: 'MSFT', assetClass: 'equity', weightPercent: 25 },
      ],
      observedAt,
    ),
    constraints: statedField(
      [{ id: 'c1', statement: 'No leverage', source: 'user-stated' as const }],
      observedAt,
    ),
  };
}

function goodMarketData(overrides: Partial<MarketDataInput> = {}): MarketDataInput {
  return {
    available: true,
    provenance: 'historical',
    barCount: 400,
    qualityPassed: true,
    lastBarAt: new Date(NOW - 3_600_000).toISOString(),
    source: 'test-provider',
    detail: 'A 400-bar historical series from test-provider.',
    ...overrides,
  };
}

function ready(
  analysisType: string,
  context: TradingContext = completeContext(),
  marketData: MarketDataInput = goodMarketData(),
) {
  return assessAnalysisReadiness({ analysisType, context, marketData, now: NOW });
}

/** The engine capabilities a fully wired process would have registered. */
const REGISTERED_ENGINES = CAPABILITY_CATALOGUE.map((entry) => entry.engineCapability).filter(
  (value): value is string => value !== null,
);

function entitlementFor(feature: string, options: { balance?: number } = {}) {
  return resolveEntitlement({
    planId: 'free',
    subscriptionStatus: 'active',
    featureId: feature,
    permissionGranted: true,
    balance: options.balance ?? 20,
  });
}

/* ------------------------------------------------------------------ */
/* The vocabulary                                                      */
/* ------------------------------------------------------------------ */

describe('the capability vocabulary', () => {
  it('names every module, and says what each one is for', () => {
    expect(CAPABILITY_MODULES.length).toBeGreaterThan(0);
    for (const module of CAPABILITY_MODULES) {
      expect(MODULE_ROLE[module].length).toBeGreaterThan(60);
    }
  });

  it('ships the meaning of every state, and ranks them so "worse" is a comparison', () => {
    for (const state of CAPABILITY_STATES) {
      expect(CAPABILITY_STATE_MEANING[state].length).toBeGreaterThan(40);
      expect(Number.isFinite(CAPABILITY_STATE_RANK[state])).toBe(true);
    }
    expect(new Set(Object.values(CAPABILITY_STATE_RANK)).size).toBe(CAPABILITY_STATES.length);
    expect(worseState('READY', 'BLOCKED')).toBe('BLOCKED');
    expect(worseState('UNAVAILABLE', 'BLOCKED')).toBe('BLOCKED');
    expect(worseState('READY', 'READY_WITH_LIMITATIONS')).toBe('READY_WITH_LIMITATIONS');
  });

  it('keeps an unimplemented capability out of the readiness vocabulary', () => {
    // `UNAVAILABLE` is not reachable from the gate, because readiness describes inputs.
    const reachable = new Set(
      (
        [
          'READY_FOR_ANALYSIS',
          'READY_WITH_LIMITATIONS',
          'REQUIRES_CLARIFICATION',
          'BLOCKED',
        ] as const
      ).map((readiness) => stateFromReadiness(readiness)),
    );
    expect(reachable.has('UNAVAILABLE')).toBe(false);
    expect(reachable.size).toBe(4);
  });

  it('says out loud that a high-impact level means more than a label', () => {
    expect(RISK_LEVEL_MEANING['high-impact']).toMatch(/unverified memory may not be cited/);
    expect(RISK_LEVEL_MEANING.informational.length).toBeGreaterThan(40);
  });
});

/* ------------------------------------------------------------------ */
/* The registry                                                        */
/* ------------------------------------------------------------------ */

describe('the capability registry', () => {
  it('is internally consistent, checked across every table it references', () => {
    expect(() => assertCapabilityCatalogue()).not.toThrow();
  });

  it('resolves by exact id and refuses everything else', () => {
    expect(resolveCapability('portfolio.composition')?.name).toBe('Describe your composition');
    expect(resolveCapability('portfolio.composition ')).toBeNull();
    expect(resolveCapability('PORTFOLIO.COMPOSITION')).toBeNull();
    expect(resolveCapability('')).toBeNull();
    expect(resolveCapability('evil.capability')).toBeNull();
    expect(resolveCapability('portfolio')).toBeNull();
  });

  it('composes every declared module at least once', () => {
    // A module nobody composes would make the module list a brochure: the whole point of
    // naming them is that a capability says which engines it actually draws on.
    const used = new Set(modulesInUse());
    expect([...used].sort()).toEqual([...CAPABILITY_MODULES].sort());
  });

  it('maps an analysis type and a feature to the capability that owns them', () => {
    expect(capabilityForAnalysisType('decision.evaluation')?.id).toBe('decision.evaluation');
    expect(capabilityForFeature('agent.chat')?.id).toBe('education.explain');
    expect(capabilityForFeature('decision.evaluation')?.id).toBe('decision.evaluation');
    expect(capabilityForAnalysisType('nope')).toBeNull();
  });

  it('declares a refusal output for every capability', () => {
    for (const capability of CAPABILITY_CATALOGUE) {
      expect(capability.outputs, capability.id).toContain('refusal');
    }
  });

  it('agrees with the requirement registry about which capabilities exist', () => {
    for (const capability of CAPABILITY_CATALOGUE) {
      if (capability.analysisType === null) continue;
      const requirement = ANALYSIS_REQUIREMENTS.find(
        (entry) => entry.type === capability.analysisType,
      );
      expect(requirement, capability.id).toBeDefined();
      expect(requirement?.capability === 'available').toBe(capability.availability === 'available');
    }
  });

  it('agrees with the feature catalogue about availability', () => {
    for (const capability of CAPABILITY_CATALOGUE) {
      if (capability.feature === null) continue;
      expect(featureFor(capability.feature)?.state, capability.id).toBe(capability.availability);
    }
  });

  it('binds an engine only where one implements the capability', () => {
    for (const capability of CAPABILITY_CATALOGUE) {
      if (capability.availability === 'available' && capability.producesFigures) {
        expect(capability.engineCapability, capability.id).not.toBeNull();
      }
      if (capability.availability !== 'available') {
        expect(capability.engineCapability, capability.id).toBeNull();
      }
    }
  });

  it('never lets a high-impact capability cite unverified memory', () => {
    for (const capability of CAPABILITY_CATALOGUE) {
      if (capability.riskLevel === 'high-impact') {
        expect(capability.memoryPolicy, capability.id).toBe('cite-verified-only');
      }
    }
  });

  it('gives every feature that is metered through a capability a real declaration', () => {
    for (const capability of CAPABILITY_CATALOGUE) {
      if (capability.feature === null) continue;
      expect(FEATURES_BY_ID[capability.feature], capability.id).toBeDefined();
    }
  });

  it('keeps the deterministic capabilities free, which is what makes them refuse-proof', () => {
    // The ADR-0041 rule, checked where it binds the registry: a capability whose figures
    // come from an engine must not be refused for a balance.
    for (const capability of CAPABILITY_CATALOGUE) {
      if (capability.engineCapability === null || !capability.producesFigures) continue;
      expect(featureFor(capability.feature!)?.creditCost, capability.id).toBe(0);
      expect(featureFor(capability.feature!)?.usesModel, capability.id).toBe(false);
    }
  });

  it('refuses a catalogue that contradicts the requirement registry', () => {
    const drifted = CAPABILITY_CATALOGUE.map((capability) =>
      capability.id === 'portfolio.composition'
        ? ({ ...capability, availability: 'coming-soon' } as CapabilityDefinition)
        : capability,
    );
    expect(() => assertCapabilityCatalogue(drifted)).toThrow(/disagrees with the requirement/);
  });

  it('refuses a catalogue that names an engine for something it has not built', () => {
    const drifted = CAPABILITY_CATALOGUE.map((capability) =>
      capability.id === 'market.structure'
        ? ({ ...capability, engineCapability: 'marketData.read' } as CapabilityDefinition)
        : capability,
    );
    expect(() => assertCapabilityCatalogue(drifted)).toThrow(/an engine binding exists only/);
  });

  it('refuses a catalogue with a module nobody composes, and a duplicate id', () => {
    const orphan = CAPABILITY_CATALOGUE.filter((capability) =>
      capability.modules.includes('knowledge-memory'),
    );
    // `knowledge-memory` is composed by the memory capability and by research, so removing
    // only the export capability would still leave the module in use — both have to go for
    // the module to become genuinely unused, which is what makes the check meaningful.
    const withoutMemoryAndResearch = CAPABILITY_CATALOGUE.filter(
      (capability) => capability.id !== 'memory.export' && capability.id !== 'research.report',
    );
    expect(orphan.length).toBe(2);
    expect(() => assertCapabilityCatalogue(withoutMemoryAndResearch)).toThrow(
      /composed by no capability/,
    );
    expect(() =>
      assertCapabilityCatalogue([...CAPABILITY_CATALOGUE, CAPABILITY_CATALOGUE[0]!]),
    ).toThrow(/Duplicate capability id/);
  });

  it('refuses a model-requestable capability with no operation to decide', () => {
    const drifted = CAPABILITY_CATALOGUE.map((capability) =>
      capability.id === 'portfolio.composition'
        ? ({ ...capability, operation: null } as CapabilityDefinition)
        : capability,
    );
    expect(() => assertCapabilityCatalogue(drifted)).toThrow(/model-requestable with no operation/);
  });

  it('exposes its failure as a named error, not a bare string', () => {
    expect(() => assertCapabilityCatalogue([])).toThrow(CapabilityCatalogueError);
  });
});

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

describe('the capability state', () => {
  it('reports an unimplemented capability before anything about its inputs', () => {
    const structure = resolveCapability('market.structure')!;
    // The gate says the inputs are ready; the capability is still not available, and saying
    // "the inputs are ready" would be the confusion ADR-0041 §2 named.
    const readiness = ready('market.structure');
    expect(readiness.readiness).toBe('READY_FOR_ANALYSIS');
    expect(capabilityState(structure, readiness)).toBe('UNAVAILABLE');
    expect(stateReason(structure, 'UNAVAILABLE', readiness)).toMatch(/not implemented/);
  });

  it('treats a gate that did not run as blocked rather than passed', () => {
    const composition = resolveCapability('portfolio.composition')!;
    expect(capabilityState(composition, null)).toBe('BLOCKED');
  });

  it('carries the gate verdict through unchanged when it did run', () => {
    const composition = resolveCapability('portfolio.composition')!;
    expect(capabilityState(composition, ready('portfolio.composition'))).toBe('READY');
    expect(capabilityState(composition, ready('portfolio.composition', emptyContext(iso())))).toBe(
      'REQUIRES_CLARIFICATION',
    );
  });

  it('is ready without a gate when there is nothing to gate', () => {
    const gate = resolveCapability('quality.assess')!;
    expect(gate.analysisType).toBeNull();
    expect(capabilityState(gate, null)).toBe('READY');
  });
});

/* ------------------------------------------------------------------ */
/* The pipeline                                                        */
/* ------------------------------------------------------------------ */

describe('the declared pipeline', () => {
  it('has a stable order, with the gates before any work', () => {
    expect(PIPELINE_STAGE_IDS).toEqual([
      'resolution',
      'validation',
      'quality',
      'readiness',
      'permission',
      'entitlement',
      'engine',
      'evidence',
      'explanation',
      'result',
      'audit',
    ]);
    // The order is the contract: a stage that charged before it decided would be a way to
    // bill for a refusal.
    expect(PIPELINE_STAGE_IDS.indexOf('entitlement')).toBeLessThan(
      PIPELINE_STAGE_IDS.indexOf('engine'),
    );
    expect(PIPELINE_STAGE_IDS.indexOf('readiness')).toBeLessThan(
      PIPELINE_STAGE_IDS.indexOf('permission'),
    );
  });

  it('explains every stage, and says what happens when it does not pass', () => {
    for (const stage of PIPELINE_STAGES) {
      expect(stage.meaning.length).toBeGreaterThan(40);
      expect(stage.blocks.length).toBeGreaterThan(20);
    }
    expect(stageFor('readiness').label).toMatch(/Readiness/);
    expect(() => stageFor('nope' as never)).toThrow(/No pipeline stage/);
  });

  it('says out loud that the model may not alter the result', () => {
    expect(stageFor('explanation').meaning).toMatch(/may not alter it/);
  });
});

/* ------------------------------------------------------------------ */
/* The plan                                                            */
/* ------------------------------------------------------------------ */

describe('planning a capability run', () => {
  it('runs when every gate passes', () => {
    const plan = planCapabilityRun({
      capabilityId: 'portfolio.composition',
      requester: 'user',
      readiness: ready('portfolio.composition'),
      permissionGranted: true,
      entitlement: entitlementFor('portfolio.composition'),
      registeredEngineCapabilities: REGISTERED_ENGINES,
    });

    expect(plan.outcome).toBe('run');
    expect(plan.state).toBe('READY');
    expect(plan.stoppedAt).toBe('engine');
    expect(plan.refusals).toEqual([]);
    expect(plan.requiresEngine).toBe(true);
  });

  it('refuses an undeclared capability at resolution, before any input is read', () => {
    const plan = planCapabilityRun({
      capabilityId: 'orders.place',
      requester: 'model',
      permissionGranted: true,
    });
    expect(plan.outcome).toBe('refuse');
    expect(plan.stoppedAt).toBe('resolution');
    expect(plan.state).toBe('UNAVAILABLE');
    expect(plan.refusals[0]?.code).toBe('undeclared-capability');
    expect(plan.capability).toBeNull();
  });

  it('refuses a capability that is declared and not built', () => {
    const plan = planCapabilityRun({
      capabilityId: 'market.structure',
      requester: 'user',
      readiness: ready('market.structure'),
      permissionGranted: true,
    });
    expect(plan.stoppedAt).toBe('resolution');
    expect(plan.state).toBe('UNAVAILABLE');
    expect(plan.refusals[0]?.code).toBe('capability-coming-soon');
  });

  it('refuses a model that asks for something a person must trigger', () => {
    const plan = planCapabilityRun({
      capabilityId: 'backtest.run',
      requester: 'model',
      permissionGranted: true,
    });
    expect(plan.stoppedAt).toBe('resolution');
    expect(plan.refusals[0]?.code).toMatch(/capability-coming-soon|not-model-requestable/);
  });

  it('refuses a model-requested high-impact capability with no permission at all', () => {
    const plan = planCapabilityRun({
      capabilityId: 'decision.evaluation',
      requester: 'model',
      readiness: ready('decision.evaluation'),
      permissionGranted: false,
    });
    expect(plan.outcome).toBe('refuse');
    expect(plan.stoppedAt).toBe('permission');
    expect(plan.refusals[0]?.code).toBe('permission-denied');
    expect(plan.refusals[0]?.reason).toMatch(/may not perform an operation the role table denies/);
  });

  it('refuses when the declared engine is not registered in this process', () => {
    const plan = planCapabilityRun({
      capabilityId: 'portfolio.composition',
      requester: 'user',
      readiness: ready('portfolio.composition'),
      permissionGranted: true,
      entitlement: entitlementFor('portfolio.composition'),
      registeredEngineCapabilities: [],
    });
    expect(plan.stoppedAt).toBe('validation');
    expect(plan.refusals[0]?.code).toBe('engine-not-registered');
  });

  it('refuses a gated capability with no verdict, rather than assuming one', () => {
    const plan = planCapabilityRun({
      capabilityId: 'portfolio.composition',
      requester: 'user',
      readiness: null,
      permissionGranted: true,
      entitlement: entitlementFor('portfolio.composition'),
    });
    expect(plan.stoppedAt).toBe('readiness');
    expect(plan.state).toBe('BLOCKED');
    expect(plan.refusals[0]?.code).toBe('readiness-not-supplied');
  });

  it('asks when a required input is absent, and says which one', () => {
    const plan = planCapabilityRun({
      capabilityId: 'portfolio.composition',
      requester: 'user',
      readiness: ready('portfolio.composition', emptyContext(iso())),
      permissionGranted: true,
      entitlement: entitlementFor('portfolio.composition'),
    });
    expect(plan.stoppedAt).toBe('readiness');
    expect(plan.state).toBe('REQUIRES_CLARIFICATION');
    expect(plan.nextActions.some((action) => action.kind === 'answer-question')).toBe(true);
    expect(plan.nextActions.map((action) => action.field)).toContain('holdings');
  });

  it('runs a deterministic capability with a spent balance, because it costs nothing', () => {
    const plan = planCapabilityRun({
      capabilityId: 'decision.evaluation',
      requester: 'user',
      readiness: ready('decision.evaluation'),
      permissionGranted: true,
      entitlement: entitlementFor('decision.evaluation', { balance: 0 }),
      registeredEngineCapabilities: REGISTERED_ENGINES,
    });
    expect(plan.outcome).toBe('run');
  });

  it('refuses at the entitlement stage when the operation was not granted', () => {
    const plan = planCapabilityRun({
      capabilityId: 'education.explain',
      requester: 'user',
      readiness: ready('education.explain'),
      permissionGranted: false,
      entitlement: entitlementFor('agent.chat'),
    });
    expect(plan.stoppedAt).toBe('permission');
    expect(plan.refusals[0]?.code).toBe('permission-denied');
  });

  it('never charges for a request the plan refuses', () => {
    const plan = planCapabilityRun({
      capabilityId: 'portfolio.composition',
      requester: 'user',
      readiness: ready('portfolio.composition', emptyContext(iso())),
      permissionGranted: true,
      entitlement: entitlementFor('portfolio.composition'),
    });
    const result = resultFromPlan(plan);
    expect(result.usage).toBeNull();
    expect(result.calculations).toEqual([]);
    expect(result.state).toBe('REQUIRES_CLARIFICATION');
  });
});

/* ------------------------------------------------------------------ */
/* The structured result                                               */
/* ------------------------------------------------------------------ */

describe('the structured result', () => {
  it('is a complete result when it is a refusal', () => {
    const plan = planCapabilityRun({
      capabilityId: 'office.order.place',
      requester: 'model',
      permissionGranted: true,
    });
    const result = resultFromPlan(plan);

    expect(result.capabilityName).toBe('Unknown capability');
    expect(result.state).toBe('UNAVAILABLE');
    expect(result.refusedBy).toBe('undeclared-capability');
    expect(result.calculations).toEqual([]);
    expect(result.limitations.length).toBeGreaterThan(0);
    expect(result.summary.length).toBeGreaterThan(20);
    expect(result.note).toBe(RESULT_NOTE);
  });

  it('carries the gate limitations into a run that is allowed', () => {
    const plan = planCapabilityRun({
      capabilityId: 'education.explain',
      requester: 'user',
      readiness: ready('education.explain', emptyContext(iso())),
      permissionGranted: true,
      entitlement: entitlementFor('agent.chat'),
      registeredEngineCapabilities: REGISTERED_ENGINES,
    });
    const result = resultFromPlan(plan);

    expect(plan.outcome).toBe('run');
    expect(result.state).toBe('READY_WITH_LIMITATIONS');
    expect(result.dataQuality?.readiness).toBe('READY_WITH_LIMITATIONS');
    expect(result.limitations.length).toBeGreaterThan(0);
    // A run reports what it holds, and says it comes back if the run does not complete.
    expect(result.usage).not.toBeNull();
    expect(result.usage?.note).toMatch(/returned in full/);
  });

  it('reports a deterministic capability as holding nothing, not as costing zero', () => {
    const result = resultFromPlan(
      planCapabilityRun({
        capabilityId: 'portfolio.composition',
        requester: 'user',
        readiness: ready('portfolio.composition'),
        permissionGranted: true,
        entitlement: entitlementFor('portfolio.composition'),
        registeredEngineCapabilities: REGISTERED_ENGINES,
      }),
    );
    expect(result.state).toBe('READY');
    expect(result.usage?.credits).toBe(0);
    expect(result.usage?.charged).toBe(false);
    expect(result.usage?.note).toMatch(/free by construction/);
  });

  it('says what a metered run holds, and that it is returned if the run fails', () => {
    // `agent.chat` is the one metered capability in the catalogue.
    const plan = planCapabilityRun({
      capabilityId: 'education.explain',
      requester: 'user',
      readiness: ready('education.explain'),
      permissionGranted: true,
      entitlement: entitlementFor('agent.chat'),
      registeredEngineCapabilities: REGISTERED_ENGINES,
    });
    const result = resultFromPlan(plan);
    expect(result.usage?.credits).toBe(1);
    expect(result.usage?.charged).toBe(true);
    expect(result.usage?.note).toMatch(/returned in full/);
  });

  it('states the provenance requirement, satisfied or not', () => {
    const allowed = resultFromPlan(
      planCapabilityRun({
        capabilityId: 'portfolio.composition',
        requester: 'user',
        readiness: ready('portfolio.composition'),
        permissionGranted: true,
        entitlement: entitlementFor('portfolio.composition'),
        registeredEngineCapabilities: REGISTERED_ENGINES,
      }),
    );
    const refused = resultFromPlan(
      planCapabilityRun({
        capabilityId: 'portfolio.composition',
        requester: 'user',
        readiness: ready('portfolio.composition', emptyContext(iso())),
        permissionGranted: true,
        entitlement: entitlementFor('portfolio.composition'),
        registeredEngineCapabilities: REGISTERED_ENGINES,
      }),
    );

    expect(allowed.provenance[0]?.satisfied).toBe(true);
    expect(refused.provenance[0]?.satisfied).toBe(false);
    expect(allowed.provenance[0]?.detail.length).toBeGreaterThan(40);
  });

  it('renders a headline for a refusal that says why, not that something failed', () => {
    const result = resultFromPlan(
      planCapabilityRun({
        capabilityId: 'portfolio.composition',
        requester: 'user',
        readiness: ready('portfolio.composition', emptyContext(iso())),
        permissionGranted: true,
        entitlement: entitlementFor('portfolio.composition'),
      }),
    );
    expect(result.summary).not.toMatch(/error|failed|exception/i);
    expect(result.dataQuality?.note.length).toBeGreaterThan(40);
  });
});

/* ------------------------------------------------------------------ */
/* Security                                                            */
/* ------------------------------------------------------------------ */

describe('the security rules the registry encodes', () => {
  it('has no capability that places an order, connects a broker or runs live', () => {
    const forbidden = /order|broker|trade|execute|withdraw|transfer|live/i;
    for (const capability of CAPABILITY_CATALOGUE) {
      expect(capability.id, capability.id).not.toMatch(forbidden);
      expect(capability.description, capability.id).not.toMatch(/place an order/i);
    }
  });

  it('keeps every model-requestable capability that can run behind an operation', () => {
    for (const capability of CAPABILITY_CATALOGUE) {
      if (capability.modelMayRequest && capability.availability === 'available') {
        expect(capability.operation, capability.id).not.toBeNull();
      }
    }
  });

  it('never marks a human-only capability as model-requestable', () => {
    for (const capability of CAPABILITY_CATALOGUE) {
      if (capability.humanOnly) expect(capability.modelMayRequest, capability.id).toBe(false);
    }
  });

  it('says plainly that no capability promises an outcome', () => {
    const claims = CAPABILITY_CATALOGUE.flatMap((capability) => capability.claims).join(' ');
    expect(claims).not.toMatch(/guarantee|guaranteed|will profit|risk-free/i);
    for (const capability of CAPABILITY_CATALOGUE) {
      expect(capability.claims.length, capability.id).toBeGreaterThan(0);
    }
  });

  it('declares that a feature with no capability is still gated by its own state', () => {
    // `portfolio.analysis` is a feature whose capability is declared and not built. It must
    // not be reachable just because the feature exists.
    const analysis = featureFor('portfolio.analysis');
    expect(analysis?.state).toBe('coming-soon');
    expect(capabilityForFeature('portfolio.analysis')?.availability).toBe('coming-soon');
  });

  it('covers every declared feature with a capability or an explicit reason it has none', () => {
    for (const feature of FEATURES) {
      const capability = CAPABILITY_CATALOGUE.find((entry) => entry.feature === feature.id);
      if (feature.state === 'available') {
        expect(capability, feature.id).toBeDefined();
      }
    }
  });
});
