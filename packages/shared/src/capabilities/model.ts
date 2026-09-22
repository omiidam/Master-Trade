/**
 * The capability model — what this platform can do, described in one vocabulary.
 *
 * Phase 5.7's job is to stop the product being a set of features that happen to share a
 * sidebar. A **capability** is the unit that ties them together: the requirement it is
 * gated by (Phase 5.3), the permission and operation it needs (ADR-0007), the feature
 * and credits it consumes (Phase 5.4), the deterministic engine that produces its
 * figures (ADR-0037/0042), the modules it composes, the output types it may return, and
 * how much weight a reader may put on it.
 *
 * Three things this file is deliberate about:
 *
 *   1. **A capability declares references, never copies.** It names an analysis type and
 *      a feature id; it does not restate their inputs, costs or states. The catalogue is
 *      checked for agreement instead (see `registry.ts`), because two copies of a cost
 *      is two costs, and the second one is wrong.
 *   2. **Nothing here can be widened by the model.** `state` is computed from stored
 *      state and a deterministic gate. There is no field a language model may set, and
 *      the orchestration layer has no branch that consults one.
 *   3. **A refusal is a result.** `CapabilityState` includes `BLOCKED` and `UNAVAILABLE`,
 *      and a structured result carries the reason in the same shape as any other
 *      outcome, so a client renders a refusal instead of inventing one.
 *
 * It is also the contract the frontend renders: the UI never parses model prose to
 * decide what to show. Every string a user reads about *why* something did not run is
 * contract text shipped from here.
 */

import type { DataProvenance } from '../marketdata/provider.js';
import type { InputRef, QualityIssue } from '../quality/model.js';
import type {
  AssumptionNotice,
  OutputMode,
  QualityClassification,
  Readiness,
  ReadinessCounts,
} from '../quality/readiness.js';
import type { DimensionAssessment } from '../quality/model.js';
import type { FeatureId, FeatureState } from '../usage/features.js';
import type { OperationId } from '../auth/model.js';

/* ------------------------------------------------------------------ */
/* Vocabularies                                                        */
/* ------------------------------------------------------------------ */

/**
 * The product modules a capability composes.
 *
 * This is the Phase 5.7 answer to "Agent Core does not own every responsibility": a
 * capability states which engines and systems it actually draws on, and a check refuses
 * a capability that claims a module while declaring nothing that needs it.
 */
export const CAPABILITY_MODULES = [
  'agent-core',
  'knowledge-memory',
  'market-intelligence',
  'portfolio-engine',
  'evaluation-engine',
  'usage-subscription',
  'user-profile',
  'web-application',
] as const;

export type CapabilityModule = (typeof CAPABILITY_MODULES)[number];

export const MODULE_LABEL: Readonly<Record<CapabilityModule, string>> = {
  'agent-core': 'Agent Core',
  'knowledge-memory': 'Knowledge & Memory',
  'market-intelligence': 'Market Intelligence',
  'portfolio-engine': 'Portfolio Engine',
  'evaluation-engine': 'Evaluation Engine',
  'usage-subscription': 'Usage & Subscription',
  'user-profile': 'User Profile',
  'web-application': 'Web Application',
};

/** What each module is for, and what it may not be used for. Rendered by the surface. */
export const MODULE_ROLE: Readonly<Record<CapabilityModule, string>> = {
  'agent-core':
    'Resolves a request to a capability, explains a result, and asks for clarification. It owns no calculation and no permission decision.',
  'knowledge-memory':
    'Holds what the user has told the system. It is a source of context that must carry its verification state, never a source of figures.',
  'market-intelligence':
    'Supplies bars and their provenance. It never invents a series, and a capability that needs one is refused rather than given a substitute.',
  'portfolio-engine':
    'Owns the arithmetic over a declared composition. Every figure a user sees about their holdings comes from here, not from prose.',
  'evaluation-engine':
    'Owns the arithmetic over a recorded decision: what happened, what could not be measured, and which of the two the number is.',
  'usage-subscription':
    'Decides what a plan includes and what an invocation costs. It can refuse a request, and nothing else can overrule it.',
  'user-profile':
    'Holds the declared trading context and its versions. It supplies facts and never supplies an inference.',
  'web-application':
    'Renders a structured result. It performs no calculation, holds no permission, and its restrictions are never the authorization.',
};

export const CAPABILITY_CATEGORIES = [
  'education',
  'assessment',
  'market-analysis',
  'portfolio-analysis',
  'decision-evaluation',
  'research',
  'memory',
  'reporting',
] as const;

export type CapabilityCategory = (typeof CAPABILITY_CATEGORIES)[number];

export const CATEGORY_LABEL: Readonly<Record<CapabilityCategory, string>> = {
  education: 'Education',
  assessment: 'Assessment',
  'market-analysis': 'Market analysis',
  'portfolio-analysis': 'Portfolio analysis',
  'decision-evaluation': 'Decision evaluation',
  research: 'Research',
  memory: 'Memory',
  reporting: 'Reporting',
};

/**
 * How much weight a result may carry.
 *
 * The level decides two rules rather than being decoration: which memory a capability
 * may cite (`memoryPolicy` must be `cite-verified-only` at `high-impact`), and whether a
 * limitation may be dropped from the rendered result (it may not, at any level, but the
 * surface is required to lead with it above `informational`).
 */
export const RISK_LEVELS = ['informational', 'advisory', 'high-impact'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RISK_LEVEL_MEANING: Readonly<Record<RiskLevel, string>> = {
  informational:
    'Describes something or explains something. A wrong answer costs an understanding, not a position.',
  advisory:
    'Describes what the user holds or did, in their own words. A wrong answer would misrepresent a fact, so every figure must come from a deterministic engine.',
  'high-impact':
    'Speaks to what someone should weigh about their own money. A wrong answer could move capital, so unverified memory may not be cited, every figure must be reproducible from the record, and no outcome may be predicted.',
};

export const CAPABILITY_OUTPUT_TYPES = [
  'explanation',
  'measurement',
  'assessment',
  'observation',
  'clarification',
  'refusal',
  'report',
] as const;

export type CapabilityOutputType = (typeof CAPABILITY_OUTPUT_TYPES)[number];

export const OUTPUT_TYPE_LABEL: Readonly<Record<CapabilityOutputType, string>> = {
  explanation: 'Explanation',
  measurement: 'Measurement',
  assessment: 'Assessment',
  observation: 'Observation',
  clarification: 'Clarification questions',
  refusal: 'Refusal, with reasons',
  report: 'Report',
};

/** The state of the implementation, which is not the state of the inputs. */
export const CAPABILITY_AVAILABILITY: readonly FeatureState[] = [
  'available',
  'coming-soon',
  'disabled',
];
export type CapabilityAvailability = FeatureState;

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

/**
 * What a caller may actually do, which is the only thing a surface acts on.
 *
 * `UNAVAILABLE` is deliberately **not** a readiness level. "The inputs are ready for a
 * capability that does not exist" is the confusion ADR-0041 §2 named, so the two axes
 * meet in one vocabulary with one priority: a capability that is not implemented is
 * `UNAVAILABLE` whatever its inputs say, because there is nothing for readiness to be
 * ready for.
 */
export const CAPABILITY_STATES = [
  'READY',
  'READY_WITH_LIMITATIONS',
  'REQUIRES_CLARIFICATION',
  'BLOCKED',
  'UNAVAILABLE',
] as const;

export type CapabilityState = (typeof CAPABILITY_STATES)[number];

export const CAPABILITY_STATE_LABEL: Readonly<Record<CapabilityState, string>> = {
  READY: 'Ready',
  READY_WITH_LIMITATIONS: 'Ready with limitations',
  REQUIRES_CLARIFICATION: 'Requires clarification',
  BLOCKED: 'Blocked',
  UNAVAILABLE: 'Not available yet',
};

export const CAPABILITY_STATE_MEANING: Readonly<Record<CapabilityState, string>> = {
  READY: 'Every declared requirement is met and the capability is implemented. It will run.',
  READY_WITH_LIMITATIONS:
    'It will run, and the limitations below travel with the result — including any premise you declared yourself.',
  REQUIRES_CLARIFICATION:
    'It will not run until the questions below are answered. Answering them is cheaper than a result built on a guess.',
  BLOCKED: 'It cannot run from these inputs, and no assumption would make that honest.',
  UNAVAILABLE:
    'The inputs were assessed and the capability itself is not implemented in this build, so no result is produced. This is a delivery gap, not a problem with your inputs.',
};

/** Rank, so "the worst of two answers" is a comparison rather than a branch per pair. */
export const CAPABILITY_STATE_RANK: Readonly<Record<CapabilityState, number>> = {
  READY: 0,
  READY_WITH_LIMITATIONS: 1,
  REQUIRES_CLARIFICATION: 2,
  UNAVAILABLE: 3,
  BLOCKED: 4,
};

export function worseState(left: CapabilityState, right: CapabilityState): CapabilityState {
  return CAPABILITY_STATE_RANK[left] >= CAPABILITY_STATE_RANK[right] ? left : right;
}

/** Map the input gate's verdict onto the capability state. */
export function stateFromReadiness(readiness: Readiness): CapabilityState {
  switch (readiness) {
    case 'READY_FOR_ANALYSIS':
      return 'READY';
    case 'READY_WITH_LIMITATIONS':
      return 'READY_WITH_LIMITATIONS';
    case 'REQUIRES_CLARIFICATION':
      return 'REQUIRES_CLARIFICATION';
    case 'BLOCKED':
      return 'BLOCKED';
  }
}

/* ------------------------------------------------------------------ */
/* The declaration                                                     */
/* ------------------------------------------------------------------ */

/**
 * How memory may be used by a capability.
 *
 * A two-value enum rather than a flag, because the split is the whole point: an
 * unverified note may make an explanation friendlier, and may never be an input to a
 * figure about someone's money.
 */
export type MemoryPolicy = 'cite-verified-only' | 'may-cite-unverified';

export interface ProvenanceRequirement {
  /** True when the capability cannot run without a provenance label on its data. */
  requiresProvenance: boolean;
  /** Labels it may work from, when it draws on market data or memory. */
  permitted: readonly DataProvenance[];
  /** What is required, in the contract's own words. */
  statement: string;
}

export interface CapabilityDefinition {
  /** Stable id. Matches the analysis type where the two describe the same thing. */
  id: string;
  name: string;
  description: string;
  category: CapabilityCategory;
  /** The modules this capability composes. Checked, not decorative. */
  modules: readonly CapabilityModule[];
  /**
   * The analysis type whose declared inputs gate this capability, or `null`.
   *
   * `null` for the one capability that *is* the gate: assessing quality has no inputs of
   * its own to be gated on, which is why gating it would be circular.
   */
  analysisType: string | null;
  /**
   * The metered feature this capability consumes, or `null` when it is not metered.
   *
   * Never a second cost: the credit number lives on the feature, and the registry check
   * refuses a capability whose declared cost disagrees with it.
   */
  feature: FeatureId | null;
  /** The operation the role table decides (ADR-0007), or `null` when none is needed. */
  operation: OperationId | null;
  /**
   * The engine capability the deterministic half needs, as the engine names it.
   *
   * A string rather than an import of the engine's union: `packages/shared` must not
   * depend on `packages/trading-engine`, which depends on it. The agreement between this
   * string and the engine's own `ToolCapability` union, and the presence of a registered
   * tool that declares it, is asserted in the backend test — an invariant checked is
   * better than a type shared in the wrong direction.
   */
  engineCapability: string | null;
  /**
   * Whether a language model may ask for this capability.
   *
   * `false` means the request path is a human or a job, never the model. This is the
   * field that makes "no direct LLM to privileged tool execution" a declared property
   * rather than an emergent one.
   */
  modelMayRequest: boolean;
  /**
   * Whether only a human may trigger it (a backtest, say).
   *
   * Separate from `modelMayRequest` because "the model may not" and "a person must decide"
   * are different restrictions, and a capability can have either without the other.
   */
  humanOnly: boolean;
  availability: CapabilityAvailability;
  riskLevel: RiskLevel;
  outputs: readonly CapabilityOutputType[];
  /** Whether it produces figures at all. Checked against its declared engine. */
  producesFigures: boolean;
  memoryPolicy: MemoryPolicy;
  provenance: ProvenanceRequirement;
  /** What the result claims, and — explicitly — what it does not. */
  claims: readonly string[];
}

/* ------------------------------------------------------------------ */
/* The structured result                                               */
/* ------------------------------------------------------------------ */

/**
 * A figure, with the provenance of the thing it was computed from.
 *
 * Every number in a structured result travels in one of these, because a number without
 * its unit and its source is the shape in which an engine's output turns into a claim
 * about the world.
 */
export interface CalculationItem {
  key: string;
  label: string;
  /** The formatted value. A string, because a currency figure is not a number. */
  value: string;
  unit: string | null;
  /** The engine that produced it. Never 'model'. */
  producedBy: string;
  /** What cannot be concluded from it. */
  interpretation: string;
}

export interface EvidenceItem {
  kind: 'engine-result' | 'user-declaration' | 'market-data' | 'memory' | 'record';
  label: string;
  detail: string;
  /** Where it came from. A human-readable reference, never a secret. */
  reference: string | null;
  observedAt: string | null;
  /** How much weight it carries. */
  trust: 'unverified' | 'verified' | 'authoritative';
}

export interface InsightItem {
  code: string;
  label: string;
  severity: 'informational' | 'observation' | 'watch' | 'elevated';
  detail: string;
  /** The metrics it rests on, so a reader can check it. */
  metrics: readonly string[];
  limitations: readonly string[];
}

export interface RiskItem {
  code: string;
  label: string;
  detail: string;
  /** What would resolve or reduce it. Never an instruction to trade. */
  mitigation: string;
}

export interface NextAction {
  kind:
    | 'answer-question'
    | 'provide-input'
    | 'record-provenance'
    | 'refresh-data'
    | 'upgrade-plan'
    | 'await-review'
    | 'none';
  label: string;
  detail: string;
  /** The field to fill, when the action is a question about one. */
  field: InputRef | null;
}

export interface ResultUsage {
  featureId: FeatureId | null;
  credits: number;
  /** True when credits were actually held or moved by this run. */
  charged: boolean;
  reservationId: string | null;
  note: string;
}

export interface ResultDataQuality {
  classification: QualityClassification | null;
  readiness: Readiness | null;
  outputMode: OutputMode | null;
  counts: ReadinessCounts | null;
  dimensions: readonly DimensionAssessment[];
  issues: readonly QualityIssue[];
  note: string;
}

/**
 * The one shape every capability returns.
 *
 * A client renders this and never a model's prose, which is what makes "the UI does not
 * parse arbitrary LLM text" true by construction rather than by discipline.
 */
export interface CapabilityResult {
  capabilityId: string;
  capabilityName: string;
  category: CapabilityCategory;
  state: CapabilityState;
  availability: CapabilityAvailability;
  riskLevel: RiskLevel;
  modules: readonly CapabilityModule[];
  /** One system-worded sentence. Safe to render as a headline. */
  summary: string;
  /** `null` when nothing was computed, which is most refusals. */
  dataQuality: ResultDataQuality | null;
  assumptions: readonly AssumptionNotice[];
  evidence: readonly EvidenceItem[];
  calculations: readonly CalculationItem[];
  insights: readonly InsightItem[];
  risks: readonly RiskItem[];
  limitations: readonly string[];
  /** What is unknown, stated as such rather than left to be inferred. */
  uncertainty: readonly string[];
  provenance: readonly ProvenanceRequirementStatement[];
  usage: ResultUsage | null;
  nextActions: readonly NextAction[];
  /** The deterministic rule that decided the state, as a stable code. */
  decidedBy: string | null;
  /** Set when the capability was refused before any engine ran. */
  refusedBy: string | null;
  /** Contract text: what this shape means. */
  note: string;
}

export interface ProvenanceRequirementStatement {
  label: string;
  detail: string;
  satisfied: boolean;
}

export const RESULT_NOTE = [
  'This result is a structured contract, not prose. Every figure in it was produced by a deterministic engine and names the engine that produced it; no figure was written by a language model.',
  'Quality, state and credit decisions are computed from stored state and declared requirements before any model is consulted. A model may explain this result and may not alter it.',
  'A refusal is a complete result: it names the rule that refused, the inputs that were missing, and what would change the answer.',
].join(' ');

/** One sentence describing a capability state, for a headline. Never a claim about money. */
export function summariseState(
  definition: Pick<CapabilityDefinition, 'name' | 'availability'>,
  state: CapabilityState,
): string {
  if (state === 'UNAVAILABLE') {
    return `${definition.name} is declared and its inputs were assessed; the capability itself is not implemented in this build, so no result was produced.`;
  }
  return `${definition.name}: ${CAPABILITY_STATE_LABEL[state].toLowerCase()}.`;
}
