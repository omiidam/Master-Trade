/**
 * The capability registry — one declaration of what this platform can do.
 *
 * Everything else in the product already declares one facet of a capability: the
 * readiness gate declares what inputs an analysis needs (Phase 5.3), the feature
 * catalogue declares what it costs and whether it exists (Phase 5.4), the role table
 * declares who may ask for it (ADR-0007), and the engine registry holds the tool that
 * computes it (ADR-0037). What was missing was the thing that says those four
 * declarations are about *the same thing*.
 *
 * This is that, and the design rule is the whole reason it is trustworthy:
 *
 *   - **It references, and never restates.** A capability names an analysis type, a
 *     feature id, an operation and an engine capability. It does not copy a cost, an
 *     input list or an availability. Two copies of a cost is two costs, and the second
 *     one is wrong — so `assertCapabilityCatalogue` checks the references agree instead,
 *     and it is called at boot and in the tests.
 *   - **Deny-by-default is unrepresentable rather than enforced.** `resolveCapability`
 *     is a lookup in this table. There is no fallback entry, no "default capability" and
 *     no pattern match, so a request for something nobody declared has no
 *     implementation to reach.
 *   - **An engine binding exists only where an engine implements it.** A capability that
 *     is not built declares `engineCapability: null` — naming a tool as though it were
 *     wired would be a claim about the future written in the present tense.
 *   - **Availability and readiness are separate axes.** A capability that is not built is
 *     `UNAVAILABLE` whatever its inputs say, because "the inputs are ready" and "the
 *     capability exists" are two claims and a client that conflated them would believe in
 *     a feature that is not there (ADR-0041 §2).
 */

import type { AnalysisRequirement } from '../quality/readiness.js';
import {
  ANALYSIS_REQUIREMENTS,
  requirementFor,
  type AnalysisReadinessDecision,
  READINESS_LABEL,
  type Readiness,
} from '../quality/readiness.js';
import { featureFor, type FeatureId } from '../usage/features.js';
import {
  CAPABILITY_MODULES,
  type CapabilityDefinition,
  type CapabilityModule,
  type CapabilityState,
  stateFromReadiness,
} from './model.js';

/* ------------------------------------------------------------------ */
/* The catalogue                                                       */
/* ------------------------------------------------------------------ */

const DECLARED: readonly CapabilityDefinition[] = [
  {
    id: 'education.explain',
    name: 'Explain a concept',
    description:
      'Explain how a market, a timeframe or a risk concept behaves, at the level the user declared.',
    category: 'education',
    modules: ['agent-core', 'user-profile', 'web-application'],
    analysisType: 'education.explain',
    feature: 'agent.chat',
    operation: 'agent.chat',
    // No engine implements this, and saying otherwise would be a binding to a tool that does
    // not exist: an explanation is written, not computed. `education.explain` is a capability
    // in the engine's vocabulary with no tool behind it, and the registry is the place that
    // says so.
    engineCapability: null,
    modelMayRequest: true,
    humanOnly: false,
    availability: 'available',
    riskLevel: 'informational',
    outputs: ['explanation', 'clarification', 'refusal'],
    producesFigures: false,
    memoryPolicy: 'may-cite-unverified',
    provenance: {
      requiresProvenance: false,
      permitted: [],
      statement:
        'An explanation is not a measurement, so it may be written from the model and the instructional corpus. Anything drawn from memory carries that memory’s verification state with it.',
    },
    claims: [
      'It explains a concept and cites the material it drew on.',
      'It does not describe the user’s positions, and it produces no figure about their money.',
    ],
  },
  {
    id: 'quality.assess',
    name: 'Assess input quality',
    description:
      'Report which declared inputs are present, valid, current and consistent, and whether a named analysis may run.',
    category: 'assessment',
    modules: ['agent-core', 'user-profile', 'usage-subscription', 'web-application'],
    // The gate has no declared inputs of its own: gating the gate would be circular.
    analysisType: null,
    feature: 'quality.assess',
    operation: 'quality.assess',
    engineCapability: null,
    modelMayRequest: false,
    humanOnly: false,
    availability: 'available',
    riskLevel: 'informational',
    outputs: ['assessment', 'refusal'],
    producesFigures: false,
    memoryPolicy: 'may-cite-unverified',
    provenance: {
      requiresProvenance: false,
      permitted: [],
      statement:
        'This capability *is* the provenance report. It reads the declaration and the market-data labels and reports on them; nothing is substituted for what is missing.',
    },
    claims: [
      'It states what is missing, invalid, stale or contradictory, and what a capability would need instead.',
      'It is deterministic and free, and no model can override its verdict — on a refusal no model is consulted at all.',
    ],
  },
  {
    id: 'portfolio.composition',
    name: 'Describe your composition',
    description:
      'Value a declared composition: allocation, cost basis, unrealised profit and loss, concentration and exposure, with every gap named rather than filled.',
    category: 'portfolio-analysis',
    modules: ['portfolio-engine', 'user-profile', 'usage-subscription', 'web-application'],
    analysisType: 'portfolio.composition',
    feature: 'portfolio.composition',
    operation: 'portfolio.read',
    engineCapability: 'portfolio.calculate',
    modelMayRequest: true,
    humanOnly: false,
    availability: 'available',
    riskLevel: 'advisory',
    outputs: ['measurement', 'assessment', 'observation', 'refusal'],
    producesFigures: true,
    memoryPolicy: 'cite-verified-only',
    provenance: {
      requiresProvenance: true,
      permitted: [],
      statement:
        'Every price is either declared by the user or carries the label of the source it came from. A price with no label is not used, and a holding whose price is absent is reported as unvalued rather than valued at zero.',
    },
    claims: [
      'It describes the composition the user declared, and every figure comes from the portfolio engine.',
      'It projects nothing forward and makes no recommendation about what to hold.',
    ],
  },
  {
    id: 'portfolio.risk',
    name: 'Risk of what you hold',
    description:
      'Characterise the risk of a declared allocation, given the user’s own tolerance and horizon.',
    category: 'portfolio-analysis',
    modules: ['portfolio-engine', 'market-intelligence', 'user-profile', 'web-application'],
    analysisType: 'portfolio.risk',
    feature: 'portfolio.analysis',
    operation: null,
    engineCapability: null,
    modelMayRequest: true,
    humanOnly: false,
    availability: 'coming-soon',
    riskLevel: 'high-impact',
    outputs: ['assessment', 'observation', 'refusal'],
    producesFigures: true,
    memoryPolicy: 'cite-verified-only',
    provenance: {
      requiresProvenance: true,
      permitted: [],
      statement:
        'When it is built it will need a price series per holding, each labelled with its source, and it will refuse rather than characterise risk from an unlabelled one.',
    },
    claims: [
      'It will characterise the risk of what the user already holds. It will not size a position or suggest one.',
    ],
  },
  {
    id: 'decision.evaluation',
    name: 'Evaluate a recorded decision',
    description:
      'Measure what happened to a decision the user recorded, from the prices on the record, and name plainly the parts that cannot be measured.',
    category: 'decision-evaluation',
    modules: ['evaluation-engine', 'user-profile', 'usage-subscription', 'web-application'],
    analysisType: 'decision.evaluation',
    feature: 'decision.evaluation',
    operation: 'decision.evaluate',
    engineCapability: 'decision.evaluate',
    modelMayRequest: true,
    humanOnly: false,
    availability: 'available',
    riskLevel: 'high-impact',
    outputs: ['measurement', 'assessment', 'observation', 'report', 'refusal'],
    producesFigures: true,
    memoryPolicy: 'cite-verified-only',
    provenance: {
      requiresProvenance: true,
      permitted: [],
      statement:
        'Both ends of every measurement must be on the record with the time they were observed. A price without an observation time is not used, so an outcome is either reproducible from the record or absent.',
    },
    claims: [
      'It reports what the recorded prices say happened, and labels every figure realised, unrealised, hypothetical or incomplete.',
      'It does not predict an outcome, does not grade a decision as correct, and does not place an order.',
    ],
  },
  {
    id: 'market.structure',
    name: 'Read market structure',
    description: 'Read the structure of a symbol from its own bars.',
    category: 'market-analysis',
    modules: ['market-intelligence', 'user-profile', 'web-application'],
    analysisType: 'market.structure',
    // No feature declares it, and that is honest: it cannot run, so there is nothing to
    // charge for and an entitlement nobody reaches would be a price list for a product
    // that does not exist. `coming-soon` is the gate, and it is the only one it needs.
    feature: null,
    operation: null,
    engineCapability: null,
    modelMayRequest: true,
    humanOnly: false,
    availability: 'coming-soon',
    riskLevel: 'advisory',
    outputs: ['measurement', 'observation', 'refusal'],
    producesFigures: true,
    memoryPolicy: 'cite-verified-only',
    provenance: {
      requiresProvenance: true,
      permitted: ['historical', 'synthetic'],
      statement:
        'It will read only bars that carry a provenance label and a quality report. Synthetic bars may be used, and every reading from them must be labelled a training result rather than a measurement.',
    },
    claims: [
      'It will describe the structure present in a series somebody else supplied. It will not invent a series to describe.',
    ],
  },
  {
    id: 'research.report',
    name: 'Research report',
    description: 'A written report over an experiment, its sample size and its findings.',
    category: 'research',
    modules: ['evaluation-engine', 'knowledge-memory', 'usage-subscription', 'web-application'],
    analysisType: null,
    feature: 'research.report',
    operation: null,
    engineCapability: null,
    modelMayRequest: true,
    humanOnly: false,
    availability: 'coming-soon',
    riskLevel: 'advisory',
    outputs: ['report', 'refusal'],
    producesFigures: true,
    memoryPolicy: 'cite-verified-only',
    provenance: {
      requiresProvenance: true,
      permitted: [],
      statement:
        'When it exists it will report a sample size and a measurement window, and a finding without both is not reportable.',
    },
    claims: [
      'It will report an experiment and its limits. It will not present a result as a prediction of what a market will do next.',
    ],
  },
  {
    id: 'backtest.run',
    name: 'Backtest',
    description: 'A rule tested against historical bars, with its sample size and its drawdown.',
    category: 'research',
    modules: ['market-intelligence', 'evaluation-engine', 'usage-subscription', 'web-application'],
    analysisType: null,
    feature: 'backtest.run',
    operation: 'backtest.run',
    engineCapability: null,
    modelMayRequest: false,
    humanOnly: true,
    availability: 'coming-soon',
    riskLevel: 'advisory',
    outputs: ['report', 'refusal'],
    producesFigures: true,
    memoryPolicy: 'cite-verified-only',
    provenance: {
      requiresProvenance: true,
      permitted: ['historical'],
      statement:
        'A backtest is only meaningful over labelled historical bars, and it will refuse synthetic data as its input even though a structure read may use it.',
    },
    claims: [
      'It will report how a rule behaved on a fixed past sample, including the drawdown it suffered on that sample.',
      'A past sample is not a forecast, and no plan includes this capability: its operation is approval-gated, so a human decides rather than a subscription.',
    ],
  },
  {
    id: 'memory.export',
    name: 'Memory export',
    description: 'Export the memory records and their provenance as a portable file.',
    category: 'memory',
    modules: ['knowledge-memory', 'usage-subscription', 'user-profile'],
    analysisType: null,
    feature: 'memory.export',
    operation: 'file.download',
    engineCapability: null,
    modelMayRequest: false,
    humanOnly: false,
    availability: 'disabled',
    riskLevel: 'informational',
    outputs: ['report', 'refusal'],
    producesFigures: false,
    memoryPolicy: 'may-cite-unverified',
    provenance: {
      requiresProvenance: false,
      permitted: [],
      statement:
        'Export is the user’s own data moving to the user. It is held pending the data-protection review that export and hard-delete land together for, and it is never gated on credits.',
    },
    claims: [
      'It will hand the user their own records with the provenance attached.',
      'It is held by a review, not by a plan: no tier can buy it, and the surface says which review is outstanding.',
    ],
  },
];

export const CAPABILITY_CATALOGUE: readonly CapabilityDefinition[] = DECLARED;

const BY_ID: ReadonlyMap<string, CapabilityDefinition> = new Map(
  CAPABILITY_CATALOGUE.map((capability) => [capability.id, capability]),
);

export const CAPABILITY_IDS: readonly string[] = CAPABILITY_CATALOGUE.map(
  (capability) => capability.id,
);

/**
 * The one lookup everything goes through.
 *
 * Exact match, no coercion, no prefix matching, no default. `null` means nobody declared
 * it, and every caller in the request path treats `null` as a refusal — which is what
 * makes deny-by-default a property of the data structure instead of a rule somebody has
 * to remember to apply.
 */
export function resolveCapability(id: string): CapabilityDefinition | null {
  return BY_ID.get(id) ?? null;
}

export function isCapabilityId(value: string): boolean {
  return BY_ID.has(value);
}

export function capabilitiesInCategory(category: string): CapabilityDefinition[] {
  return CAPABILITY_CATALOGUE.filter((capability) => capability.category === category);
}

/** The capability a declared analysis type is gated by, or `null` when none is. */
export function capabilityForAnalysisType(analysisType: string): CapabilityDefinition | null {
  return (
    CAPABILITY_CATALOGUE.find((capability) => capability.analysisType === analysisType) ?? null
  );
}

export function capabilityForFeature(featureId: string): CapabilityDefinition | null {
  return CAPABILITY_CATALOGUE.find((capability) => capability.feature === featureId) ?? null;
}

export function capabilityForEngine(engineCapability: string): CapabilityDefinition | null {
  return (
    CAPABILITY_CATALOGUE.find((capability) => capability.engineCapability === engineCapability) ??
    null
  );
}

/** Every module some capability actually composes. Used by the surface and the checks. */
export function modulesInUse(): CapabilityModule[] {
  const used = new Set<CapabilityModule>();
  for (const capability of CAPABILITY_CATALOGUE) {
    for (const module of capability.modules) used.add(module);
  }
  return CAPABILITY_MODULES.filter((module) => used.has(module));
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

/**
 * The state of a capability, given the input gate's verdict.
 *
 * Priority is the design, and it is the opposite of the naive one: an unimplemented
 * capability is reported as unimplemented **before** anything is said about its inputs.
 * Telling someone their risk tolerance is missing, when the capability would not run if
 * they provided it, is a way of asking for something that cannot help them.
 *
 * `null` for the decision means the gate did not run — and a gate that did not run is not
 * a pass. The capability is `BLOCKED`, because a server that cannot evaluate its own
 * preconditions must not answer as though it had.
 */
export function capabilityState(
  definition: CapabilityDefinition,
  readiness: AnalysisReadinessDecision | null,
): CapabilityState {
  if (definition.availability !== 'available') return 'UNAVAILABLE';
  if (definition.analysisType === null) return 'READY';
  if (readiness === null) return 'BLOCKED';
  return stateFromReadiness(readiness.readiness);
}

/** The state of a capability that has no declared analysis type to gate it. */
export function ungatedState(definition: CapabilityDefinition): CapabilityState {
  return definition.availability === 'available' ? 'READY' : 'UNAVAILABLE';
}

/** A one-line explanation of a state, in the contract's own words. */
export function stateReason(
  definition: CapabilityDefinition,
  state: CapabilityState,
  readiness: AnalysisReadinessDecision | null,
): string {
  if (state === 'UNAVAILABLE') {
    const feature = definition.feature === null ? null : featureFor(definition.feature);
    const why = feature?.stateReason ?? null;
    return why === null
      ? 'Declared and not implemented in this build, so no result is produced.'
      : `Declared and not implemented in this build. ${why}`;
  }
  if (definition.analysisType === null || readiness === null) {
    return 'It has no declared inputs of its own to gate, and the capability itself is implemented.';
  }
  const label: Readiness = readiness.readiness;
  return `${READINESS_LABEL[label]}. Decided by ${readiness.decidedBy}.`;
}

/* ------------------------------------------------------------------ */
/* Invariants                                                          */
/* ------------------------------------------------------------------ */

export class CapabilityCatalogueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityCatalogueError';
  }
}

/**
 * Check the declaration against the four tables it references.
 *
 * Called at boot (so a drifted catalogue fails a health check rather than a user's
 * request) and in the tests. Every rule below exists because its violation would be
 * invisible in a diff and wrong in production:
 *
 *   - a duplicated or malformed id, so nothing resolves ambiguously;
 *   - a category or module outside the vocabulary;
 *   - an analysis type that is not declared, or whose `capability` flag disagrees with
 *     this entry's availability — the exact drift that made a built capability report
 *     itself as unimplemented;
 *   - a feature that is not declared, or whose `state` disagrees with this entry's
 *     availability — the same drift on the money side;
 *   - an engine binding on a capability that is not built, or no engine binding on a
 *     capability that produces figures and *is* built;
 *   - `high-impact` while citing unverified memory, which is the combination the phase
 *     brief forbids;
 *   - a model-requestable capability with no operation, which would let the model ask for
 *     something the role table never decided;
 *   - outputs without a refusal, because every capability can refuse;
 *   - a module in the vocabulary that no capability composes, which would make the
 *     module list a brochure rather than an architecture.
 */
export function assertCapabilityCatalogue(
  catalogue: readonly CapabilityDefinition[] = CAPABILITY_CATALOGUE,
  requirements: readonly AnalysisRequirement[] = ANALYSIS_REQUIREMENTS,
): void {
  const seen = new Set<string>();
  for (const capability of catalogue) {
    if (seen.has(capability.id)) {
      throw new CapabilityCatalogueError(`Duplicate capability id: ${capability.id}`);
    }
    seen.add(capability.id);
    if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]+)+$/.test(capability.id)) {
      throw new CapabilityCatalogueError(`Malformed capability id: ${capability.id}`);
    }
    if (capability.modules.length === 0) {
      throw new CapabilityCatalogueError(`Capability ${capability.id} composes no module.`);
    }
    for (const module of capability.modules) {
      if (!(CAPABILITY_MODULES as readonly string[]).includes(module)) {
        throw new CapabilityCatalogueError(
          `Capability ${capability.id} names an undeclared module: ${module}`,
        );
      }
    }
    if (capability.claims.length === 0 || capability.claims.some((claim) => claim.length < 20)) {
      throw new CapabilityCatalogueError(
        `Capability ${capability.id} must state what it claims, in sentences a reviewer can check.`,
      );
    }
    if (capability.outputs.length === 0 || !capability.outputs.includes('refusal')) {
      throw new CapabilityCatalogueError(
        `Capability ${capability.id} does not declare a refusal output, and every capability may refuse.`,
      );
    }

    if (capability.analysisType !== null) {
      const requirement = requirements.find((entry) => entry.type === capability.analysisType);
      if (requirement === undefined) {
        throw new CapabilityCatalogueError(
          `Capability ${capability.id} names an analysis type nobody declares: ${capability.analysisType}`,
        );
      }
      const declaredAvailable = requirement.capability === 'available';
      const builtHere = capability.availability === 'available';
      if (declaredAvailable !== builtHere) {
        throw new CapabilityCatalogueError(
          `Capability ${capability.id} disagrees with the requirement registry about whether it exists (${capability.availability} vs ${requirement.capability}).`,
        );
      }
    }

    if (capability.feature !== null) {
      const feature = featureFor(capability.feature);
      if (feature === null) {
        throw new CapabilityCatalogueError(
          `Capability ${capability.id} names an undeclared feature: ${capability.feature}`,
        );
      }
      if (feature.state !== capability.availability) {
        throw new CapabilityCatalogueError(
          `Capability ${capability.id} disagrees with the feature catalogue about availability (${capability.availability} vs ${feature.state}).`,
        );
      }
    }

    const built = capability.availability === 'available';
    if (built && capability.producesFigures && capability.engineCapability === null) {
      throw new CapabilityCatalogueError(
        `Capability ${capability.id} produces figures and is available without naming an engine.`,
      );
    }
    if (!built && capability.engineCapability !== null) {
      throw new CapabilityCatalogueError(
        `Capability ${capability.id} is ${capability.availability} and names engine capability ${capability.engineCapability}: an engine binding exists only where an engine implements it.`,
      );
    }
    if (capability.engineCapability !== null && !capability.producesFigures) {
      throw new CapabilityCatalogueError(
        `Capability ${capability.id} names an engine and declares that it produces no figures. An engine is bound because it computes something.`,
      );
    }
    if (
      capability.riskLevel === 'high-impact' &&
      capability.memoryPolicy !== 'cite-verified-only'
    ) {
      throw new CapabilityCatalogueError(
        `Capability ${capability.id} is high-impact and may cite unverified memory.`,
      );
    }
    // Only for a capability that can actually run. A declared-and-unbuilt capability has no
    // operation because none exists yet; its gate is its state, and an operation nobody could
    // reach would be a permission entry for a product that is not there.
    if (capability.availability === 'available' && capability.modelMayRequest) {
      if (capability.operation === null) {
        throw new CapabilityCatalogueError(
          `Capability ${capability.id} is available and model-requestable with no operation for the role table to decide.`,
        );
      }
    }
    if (capability.humanOnly && capability.modelMayRequest) {
      throw new CapabilityCatalogueError(
        `Capability ${capability.id} is human-only and model-requestable at the same time.`,
      );
    }
  }

  for (const module of CAPABILITY_MODULES) {
    if (!catalogue.some((capability) => capability.modules.includes(module))) {
      throw new CapabilityCatalogueError(
        `Module ${module} is declared and composed by no capability, so the module list describes nothing.`,
      );
    }
  }
}

/** Every analysis type a capability is declared for. Used to check coverage both ways. */
export function declaredAnalysisTypes(): (string | null)[] {
  return CAPABILITY_CATALOGUE.map((capability) => capability.analysisType);
}

/** Every feature some capability consumes. */
export function declaredFeatureIds(): FeatureId[] {
  return CAPABILITY_CATALOGUE.map((capability) => capability.feature).filter(
    (feature): feature is FeatureId => feature !== null,
  );
}

/** Guard for a caller that has already decided it wants a capability to exist. */
export function requireCapability(id: string): CapabilityDefinition {
  const capability = resolveCapability(id);
  if (capability === null) {
    throw new CapabilityCatalogueError(
      `No capability is declared as "${id.slice(0, 48)}" and capabilities are deny-by-default.`,
    );
  }
  return capability;
}

/**
 * `availability` for an analysis type, read from the requirements table.
 *
 * Exported so a surface can show what a type would need without importing the gate: the
 * answer is the registry's, and there is only one of it.
 */
export function availabilityOfAnalysisType(analysisType: string): 'available' | 'planned' | null {
  return requirementFor(analysisType)?.capability ?? null;
}
