/**
 * Analysis readiness — the gate.
 *
 * This module decides one thing: **may an analysis be attempted, and in what
 * form?** ADR-0041 said a capability declares its inputs and insufficient input
 * descends a ladder. This is that ladder, as a function.
 *
 * The shape of the decision is the design, and it is worth stating plainly:
 *
 *   - **Requirements are declared, not discovered.** A capability lists the inputs
 *     it needs and, for each, what to do when that input is absent, out of date or
 *     in conflict. Nothing is decided ad hoc at run time, so "why was I asked for
 *     this?" always has an answer that was written down before the request arrived.
 *   - **The gate is deterministic and it wins.** It is a pure function of the
 *     context, the capability's requirements, the market-data situation and the
 *     clock. `src/agent/service.ts` consults it *before* a model is asked to
 *     reason, so a blocked input set cannot be argued away by a well-written
 *     prompt. The model has no vote.
 *   - **A refusal is an outcome, not an error.** `BLOCKED` is a value the API
 *     returns with its reasons attached, in the same shape as any other decision.
 *   - **Nothing is invented to make an analysis possible.** The only substitution
 *     the gate accepts is one the **user** declared, and using it switches the
 *     output to a labelled hypothetical. A substitution the *system* would like to
 *     make is listed as `permitted: false`, so the reader can see exactly what was
 *     refused to be assumed.
 *
 * It is also deliberately *not* a scoring system. There is no 0–100 anywhere: a
 * number invites a threshold, and a threshold expresses a product decision in a
 * constant nobody reads. The classification is a label with a stated meaning, and
 * the counts are named.
 */

import {
  FIELD_LABELS,
  FIELD_QUESTIONS,
  type FieldKey,
  type TradingContext,
} from '../profile/model.js';
import type { DataProvenance } from '../marketdata/provider.js';
import {
  DIMENSION_QUESTION,
  QUALITY_DIMENSIONS,
  analysableTopics,
  evaluateInputs,
  type DimensionAssessment,
  type DimensionVerdict,
  type EvaluatedInput,
  type InputRef,
  type MarketDataInput,
  type QualityDimension,
  type QualityIssue,
  type QualityIssueCode,
  type QualitySeverity,
} from './model.js';

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

/**
 * The label for a set of inputs, from most to least severe.
 *
 * The precedence is a product decision and is written down here rather than left
 * to the order of an `if` chain: each label demands a *different response*, and a
 * set can only be answered one way at a time.
 *
 *   1. `INVALID`      — a value is not a value. Fix it; nothing may be computed.
 *   2. `CONFLICTING`  — two true statements cannot both hold. Ask which is current.
 *   3. `INSUFFICIENT` — something required is absent. Ask for it.
 *   4. `STALE`        — everything needed exists and has aged. Refresh it.
 *   5. `UNVERIFIED`   — usable, but we cannot say where it came from. Record it.
 *   6. `PARTIALLY_SUFFICIENT` — only optional inputs are missing. Proceed, labelled.
 *   7. `SUFFICIENT`   — proceed.
 */
export type QualityClassification =
  | 'SUFFICIENT'
  | 'PARTIALLY_SUFFICIENT'
  | 'INSUFFICIENT'
  | 'INVALID'
  | 'STALE'
  | 'CONFLICTING'
  | 'UNVERIFIED';

export const CLASSIFICATION_ORDER: readonly QualityClassification[] = [
  'INVALID',
  'CONFLICTING',
  'INSUFFICIENT',
  'STALE',
  'UNVERIFIED',
  'PARTIALLY_SUFFICIENT',
  'SUFFICIENT',
];

export const CLASSIFICATION_LABEL: Readonly<Record<QualityClassification, string>> = {
  SUFFICIENT: 'Sufficient',
  PARTIALLY_SUFFICIENT: 'Partially sufficient',
  INSUFFICIENT: 'Insufficient',
  INVALID: 'Invalid',
  STALE: 'Out of date',
  CONFLICTING: 'Conflicting',
  UNVERIFIED: 'Unverified',
};

export const CLASSIFICATION_MEANING: Readonly<Record<QualityClassification, string>> = {
  SUFFICIENT: 'Every input this analysis needs is present, current and consistent.',
  PARTIALLY_SUFFICIENT:
    'Everything the analysis requires is present. Inputs that would sharpen it are missing, so the answer will be narrower than it could be.',
  INSUFFICIENT: 'Something the analysis requires has not been provided.',
  INVALID:
    'An input is not a usable value of its declared kind, so it must be corrected before anything is computed from it.',
  STALE: 'The inputs exist and have aged past the freshness window for their kind.',
  CONFLICTING: 'Two declarations cannot both be current. You are the one who knows which.',
  UNVERIFIED:
    'The inputs are usable, but their provenance is not recorded well enough to weigh them.',
};

/* ------------------------------------------------------------------ */
/* Readiness                                                           */
/* ------------------------------------------------------------------ */

export type Readiness =
  'READY_FOR_ANALYSIS' | 'READY_WITH_LIMITATIONS' | 'REQUIRES_CLARIFICATION' | 'BLOCKED';

export const READINESS_LABEL: Readonly<Record<Readiness, string>> = {
  READY_FOR_ANALYSIS: 'Ready for analysis',
  READY_WITH_LIMITATIONS: 'Ready with limitations',
  REQUIRES_CLARIFICATION: 'Requires clarification',
  BLOCKED: 'Blocked',
};

export const READINESS_MEANING: Readonly<Record<Readiness, string>> = {
  READY_FOR_ANALYSIS: 'Every declared requirement is met, and nothing needs confirming first.',
  READY_WITH_LIMITATIONS:
    'The analysis may proceed, and it must carry the limitations below with it — including any premise you declared.',
  REQUIRES_CLARIFICATION:
    'The analysis will not be produced until the questions below are answered. Answering them is cheaper than an answer built on a guess.',
  BLOCKED:
    'The analysis cannot be produced from these inputs, and no assumption would make it honest. The reasons are listed.',
};

/**
 * What the analysis may actually look like, which is what a caller acts on.
 *
 * `labelled-hypothetical` is reachable only when the **user** declared the
 * substitution; there is no path from a system-made guess to this value.
 */
export type OutputMode =
  'full-analysis' | 'limited-analysis' | 'labelled-hypothetical' | 'clarification' | 'refusal';

export const OUTPUT_MODE_LABEL: Readonly<Record<OutputMode, string>> = {
  'full-analysis': 'Full analysis',
  'limited-analysis': 'Limited analysis',
  'labelled-hypothetical': 'Labelled hypothetical',
  clarification: 'Clarification questions',
  refusal: 'Refusal, with reasons',
};

/* ------------------------------------------------------------------ */
/* Requirements                                                        */
/* ------------------------------------------------------------------ */

/** What to do when a requirement is not met. Declared per requirement. */
export type WhenUnmet = 'clarify' | 'limit' | 'block';

export interface InputRequirement {
  field: InputRef;
  /** `required` governs the analysis. `helpful` sharpens it. */
  necessity: 'required' | 'helpful';
  whenAbsent: WhenUnmet;
  whenStale: WhenUnmet;
  whenConflicting: WhenUnmet;
  /**
   * Whether a labelled assumption may stand in.
   *
   * `false` for every input the answer is a function of. ADR-0041 §5: a required
   * input must never be assumed, because an assumed risk tolerance is not a weaker
   * risk tolerance — it is a different number that reads as authority.
   */
  assumable: { permitted: false } | { permitted: true; statement: string };
  why: string;
}

export interface MarketDataRequirement {
  necessity: 'required' | 'helpful';
  whenUnavailable: WhenUnmet;
  whenStale: WhenUnmet;
  whenInvalid: WhenUnmet;
  /**
   * What to do when the series arrived without a provenance label or a quality
   * report, so it cannot be weighed.
   *
   * Separate from `whenUnavailable` because it is a different situation with the same
   * consequence: there are bars, and nothing says what they are.
   */
  whenUnverified: WhenUnmet;
  /** Provenance labels this capability may work from. */
  permittedProvenance: readonly DataProvenance[];
  /** Below this, a reading is a description of too little data to describe. */
  minBars: number;
  why: string;
}

export type AnalysisType =
  | 'education.explain'
  | 'portfolio.composition'
  | 'portfolio.risk'
  | 'decision.evaluation'
  | 'market.structure';

export const ANALYSIS_TYPES: readonly AnalysisType[] = [
  'education.explain',
  'portfolio.composition',
  'portfolio.risk',
  'decision.evaluation',
  'market.structure',
];

export function isAnalysisType(value: string): value is AnalysisType {
  return (ANALYSIS_TYPES as readonly string[]).includes(value);
}

export interface AnalysisRequirement {
  type: AnalysisType;
  label: string;
  description: string;
  /**
   * Whether the capability itself exists yet.
   *
   * Separate from readiness on purpose: "the inputs are ready" and "the analysis
   * exists" are two claims, and a client that conflated them would believe in a
   * feature that has not been built. Nothing below is marked `available` unless
   * something actually implements it.
   */
  capability: 'available' | 'planned';
  inputs: readonly InputRequirement[];
  marketData?: MarketDataRequirement;
  note: string;
}

/** Every market-data requirement that needs recent bars uses one window. */
export const MARKET_DATA_WINDOW_HOURS = 72;

const withheld = { permitted: false } as const;

/**
 * The declared requirements.
 *
 * `education.explain` is the one capability that exists: the agent answers
 * questions, which is what the product already does. The three analysis-shaped
 * entries are `planned` — they declare what they will require, so the roadmap can
 * be checked against reality and so a client that asks for one is told the truth
 * rather than given a confident answer from a capability that is not there.
 */
export const ANALYSIS_REQUIREMENTS: readonly AnalysisRequirement[] = [
  {
    type: 'education.explain',
    label: 'Explain a concept',
    description: 'Explain how a market, a timeframe or a risk concept behaves, at your level.',
    capability: 'available',
    inputs: [
      {
        field: 'markets',
        necessity: 'helpful',
        whenAbsent: 'limit',
        whenStale: 'limit',
        whenConflicting: 'clarify',
        assumable: {
          permitted: true,
          statement: 'the general case rather than one of your markets',
        },
        why: 'An explanation is sharper when it is worked in a market you actually follow.',
      },
      {
        field: 'experienceLevel',
        necessity: 'helpful',
        whenAbsent: 'limit',
        whenStale: 'limit',
        whenConflicting: 'limit',
        assumable: {
          permitted: true,
          statement: 'no stated level, so the explanation stays general',
        },
        why: 'The same idea is explained differently to someone starting out.',
      },
      {
        field: 'learningGoals',
        necessity: 'helpful',
        whenAbsent: 'limit',
        whenStale: 'limit',
        whenConflicting: 'limit',
        assumable: {
          permitted: true,
          statement: 'no stated goal, so the topic is taken at face value',
        },
        why: 'Knowing what you are working on decides which explanation is useful.',
      },
    ],
    note: 'Nothing here is a calculation, so a gap costs precision and never correctness.',
  },
  {
    type: 'portfolio.composition',
    label: 'Describe your composition',
    description: 'Describe what you hold, by allocation, with no forward view.',
    // Corrected in Phase 5.7. Phase 5.5 built this capability — the engine, the routes,
    // the store and the surface all exist — and left the flag reading `planned`, which
    // made the API refuse through the agent path a capability the product already had.
    // The registry check now *requires* this flag and the capability catalogue to agree.
    capability: 'available',
    inputs: [
      {
        field: 'holdings',
        necessity: 'required',
        whenAbsent: 'clarify',
        whenStale: 'clarify',
        whenConflicting: 'limit',
        assumable: withheld,
        why: 'A description of a composition is a description of what is in it. There is nothing to substitute.',
      },
      {
        field: 'markets',
        necessity: 'helpful',
        whenAbsent: 'limit',
        whenStale: 'limit',
        whenConflicting: 'clarify',
        assumable: {
          permitted: true,
          statement: 'markets taken from the allocation you described',
        },
        why: 'The markets you follow give the description its context.',
      },
      {
        field: 'capitalRange',
        necessity: 'helpful',
        whenAbsent: 'limit',
        whenStale: 'limit',
        whenConflicting: 'limit',
        assumable: withheld,
        why: 'A band puts the allocation in proportion, and is never treated as an amount.',
      },
      {
        field: 'constraints',
        necessity: 'helpful',
        whenAbsent: 'limit',
        whenStale: 'limit',
        whenConflicting: 'limit',
        assumable: withheld,
        why: 'A constraint you declared is part of what the composition has to respect.',
      },
    ],
    note: 'Every figure would come from the allocation you described. Nothing is projected forward.',
  },
  {
    type: 'portfolio.risk',
    label: 'Risk of what you hold',
    description:
      'Characterise the risk of the allocation you described, given your tolerance and horizon.',
    capability: 'planned',
    inputs: [
      {
        field: 'holdings',
        necessity: 'required',
        whenAbsent: 'clarify',
        // A month-old allocation makes a risk figure meaningless rather than merely
        // less precise, so an aged-out one is refused instead of caveated.
        whenStale: 'block',
        whenConflicting: 'limit',
        assumable: withheld,
        why: 'Risk is a property of the allocation. Without it there is no subject.',
      },
      {
        field: 'riskTolerance',
        necessity: 'required',
        whenAbsent: 'clarify',
        whenStale: 'clarify',
        whenConflicting: 'clarify',
        assumable: withheld,
        why: 'The system never assigns or infers a risk tolerance, and it will not invent one to finish a sentence.',
      },
      {
        field: 'horizon',
        necessity: 'required',
        whenAbsent: 'clarify',
        whenStale: 'clarify',
        whenConflicting: 'clarify',
        assumable: withheld,
        why: 'The same allocation carries different risk over a week and over a year.',
      },
      {
        field: 'capitalRange',
        necessity: 'helpful',
        whenAbsent: 'limit',
        whenStale: 'limit',
        whenConflicting: 'limit',
        assumable: withheld,
        why: 'A band puts the exposure in proportion without ever storing an amount.',
      },
      {
        field: 'constraints',
        necessity: 'helpful',
        whenAbsent: 'limit',
        whenStale: 'limit',
        whenConflicting: 'limit',
        assumable: withheld,
        why: 'A breached constraint is reported as a breach, never as something to correct for you.',
      },
    ],
    note: 'There is no profitability or predictive claim to be found here, and no position sizing.',
  },
  {
    type: 'decision.evaluation',
    label: 'Evaluate a recorded decision',
    description:
      'Measure what happened to a decision you recorded, from the prices on the record, and name plainly the parts that cannot be measured.',
    capability: 'available',
    inputs: [
      {
        field: 'horizon',
        necessity: 'helpful',
        whenAbsent: 'limit',
        whenStale: 'limit',
        whenConflicting: 'limit',
        // The assumption is a *labelled* one and it is only about what the window can be
        // compared with. It never reaches a figure: the outcome comes from the record.
        assumable: {
          permitted: true,
          statement: 'no horizon declared, so the window measured is compared with nothing',
        },
        why: 'Whether a window can say anything about method depends on how long the decision was meant to run for.',
      },
      {
        field: 'riskTolerance',
        necessity: 'helpful',
        whenAbsent: 'limit',
        whenStale: 'limit',
        whenConflicting: 'limit',
        assumable: {
          permitted: true,
          statement:
            'no risk tolerance declared, so the planned risk is reported without comment on it',
        },
        why: 'The R multiple is computed from the planned risk on the record. A declared tolerance sharpens whether that risk was in character — it never supplies the number.',
      },
      {
        field: 'markets',
        necessity: 'helpful',
        whenAbsent: 'limit',
        whenStale: 'limit',
        whenConflicting: 'limit',
        assumable: {
          permitted: true,
          statement: 'no markets declared, so the outcome is not read in a market context',
        },
        why: 'An outcome is easier to read in the market it happened in.',
      },
    ],
    note: 'Every figure comes from prices someone recorded, and every figure is labelled with what it is — realised, unrealised, hypothetical or incomplete. Nothing about the outcome is predicted, and no figure exists without both ends of the measurement.',
  },
  {
    type: 'market.structure',
    label: 'Read market structure',
    description: 'Read the structure of a symbol from its own bars.',
    capability: 'planned',
    inputs: [
      {
        field: 'markets',
        necessity: 'required',
        whenAbsent: 'clarify',
        whenStale: 'limit',
        whenConflicting: 'clarify',
        assumable: withheld,
        why: 'Structure is read per market, and the engine only has data for some.',
      },
      {
        field: 'instruments',
        necessity: 'required',
        whenAbsent: 'clarify',
        whenStale: 'limit',
        whenConflicting: 'clarify',
        assumable: withheld,
        why: 'A structure read needs a symbol, and the system will not choose one for you.',
      },
      {
        field: 'timeframe',
        necessity: 'required',
        whenAbsent: 'clarify',
        whenStale: 'limit',
        whenConflicting: 'clarify',
        assumable: withheld,
        why: 'Structure at one timeframe says little about another, so the timeframe is part of the question.',
      },
    ],
    marketData: {
      necessity: 'required',
      whenUnavailable: 'block',
      whenStale: 'clarify',
      whenInvalid: 'block',
      // A series nobody can vouch for is not a series this capability may read, and a
      // question cannot fix it: only a provider can supply the label.
      whenUnverified: 'block',
      permittedProvenance: ['historical', 'synthetic'],
      minBars: 100,
      why: 'Reading structure means reading bars. No bars means no read, and a user cannot declare a series into existence.',
    },
    note: 'Synthetic bars may be used, and every result from them is labelled a training result rather than a measurement.',
  },
];

export function requirementFor(type: string): AnalysisRequirement | null {
  return ANALYSIS_REQUIREMENTS.find((requirement) => requirement.type === type) ?? null;
}

/* ------------------------------------------------------------------ */
/* The decision                                                        */
/* ------------------------------------------------------------------ */

export interface ClarificationQuestion {
  field: InputRef;
  label: string;
  question: string;
  reason: 'missing' | 'stale' | 'conflicting' | 'assumed' | 'refused-to-say';
  /** True when the analysis cannot proceed without an answer. */
  blocking: boolean;
}

export interface AssumptionNotice {
  field: InputRef;
  label: string;
  /** `user-premise` may stand in. `system` may not, and is listed to be explicit. */
  origin: 'user-premise' | 'system';
  permitted: boolean;
  /** System-worded. Never a sentence the user wrote. */
  statement: string;
  reason: string;
}

export interface ReadinessCounts {
  inputsConsidered: number;
  required: number;
  satisfied: number;
  missing: number;
  stale: number;
  invalid: number;
  conflicting: number;
  assumed: number;
}

export interface AnalysisReadinessDecision {
  /** The declared type, or `null` when the requested type is not declared at all. */
  analysisType: AnalysisType | null;
  /** Echoed exactly as requested, so a client can see what was refused. */
  requestedType: string;
  capability: 'available' | 'planned' | null;
  readiness: Readiness;
  outputMode: OutputMode;
  /** `null` only when there was nothing to assess — an undeclared analysis type. */
  classification: QualityClassification | null;
  /** Safe counts. No score, and no user-supplied text. */
  counts: ReadinessCounts;
  dimensions: readonly DimensionAssessment[];
  inputs: readonly EvaluatedInput[];
  issues: readonly QualityIssue[];
  clarifications: readonly ClarificationQuestion[];
  assumptions: readonly AssumptionNotice[];
  limitations: readonly string[];
  analysable: readonly string[];
  /** The rule that decided the outcome, as a stable code. */
  decidedBy: string;
  /** What the classifications mean. Contract text, so a client never invents its own. */
  note: string;
  capabilityNote: string | null;
}

const EMPTY_COUNTS: ReadinessCounts = {
  inputsConsidered: 0,
  required: 0,
  satisfied: 0,
  missing: 0,
  stale: 0,
  invalid: 0,
  conflicting: 0,
  assumed: 0,
};

/* ------------------------------------------------------------------ */
/* Reading one field against a requirement                             */
/* ------------------------------------------------------------------ */

type FieldState =
  'satisfied' | 'absent' | 'refused' | 'stale' | 'assumed' | 'invalid' | 'conflicting';

interface FieldReading {
  field: InputRef;
  state: FieldState;
  label: string;
  issues: readonly QualityIssue[];
}

/**
 * Reduce an evaluated input to one state.
 *
 * The order is the classification order, and it is deliberate: a malformed value
 * outranks a contradiction, which outranks absence, which outranks staleness. A
 * set that is both stale and malformed is malformed, because refreshing it would
 * not help.
 */
function readField(field: InputRef, label: string, input: EvaluatedInput | null): FieldReading {
  if (input === null) return { field, state: 'absent', label, issues: [] };
  const issues = input.issues;
  const has = (severity: QualitySeverity): boolean =>
    issues.some((found) => found.severity === severity);

  if (input.validation === 'invalid' || has('blocking')) {
    return { field, state: 'invalid', label: input.label, issues };
  }
  if (has('conflicting')) return { field, state: 'conflicting', label: input.label, issues };
  if (input.freshness === 'absent' || input.confidence === 'missing' || !input.usable) {
    // `usable` is false for a value that is present and refused ("prefer not to say"),
    // which is an answer, not a gap to be filled — hence its own state.
    const refused = input.freshness !== 'absent' && input.representation.kind !== 'absent';
    return {
      field,
      state: refused ? 'refused' : 'absent',
      label: input.label,
      issues,
    };
  }
  if (input.freshness === 'undated' || input.confidence === 'assumed') {
    return { field, state: 'assumed', label: input.label, issues };
  }
  if (input.freshness === 'stale') return { field, state: 'stale', label: input.label, issues };
  return { field, state: 'satisfied', label: input.label, issues };
}

/** The market-data input, read against its requirement rather than globally. */
function readMarketData(
  input: EvaluatedInput,
  requirement: MarketDataRequirement,
  marketData: MarketDataInput,
): FieldReading {
  const issues: QualityIssue[] = [...input.issues];
  let state: FieldState = 'satisfied';

  if (!marketData.available) state = 'absent';
  else if (input.validation === 'invalid') state = 'invalid';
  else if (input.freshness === 'stale') state = 'stale';
  else if (input.freshness === 'undated' || input.confidence === 'untrusted') state = 'assumed';

  if (marketData.available && state === 'satisfied' && marketData.barCount < requirement.minBars) {
    // Fitness, not recency: the series exists, is current, and is too short to
    // describe anything at the resolution the capability asks for.
    issues.push({
      code: 'out-of-range',
      severity: 'advisory',
      dimension: 'relevance',
      field: 'marketData',
      detail: `The series holds ${marketData.barCount} bars, below the ${requirement.minBars} this analysis needs, so any reading is correspondingly weak.`,
    });
  }

  return { field: 'marketData', state, label: 'Market data', issues };
}

/* ------------------------------------------------------------------ */
/* The gate                                                            */
/* ------------------------------------------------------------------ */

export interface ReadinessRequest {
  /** The requested type. Unknown values are handled, never coerced. */
  analysisType: string;
  context: TradingContext;
  marketData: MarketDataInput;
  /**
   * Fields the **user** declared a substitute for. Enumerated and bounded: this is
   * a declaration of intent, not a place to put prose, so nothing user-written can
   * enter an assessment through it.
   */
  premises?: readonly FieldKey[];
  now: number;
}

/**
 * Decide whether an analysis may run.
 *
 * Pure: the same request and the same clock always produce the same decision, so
 * the gate can be tested exhaustively and a decision can be reproduced from a log.
 */
export function assessAnalysisReadiness(request: ReadinessRequest): AnalysisReadinessDecision {
  const requirement = requirementFor(request.analysisType);
  if (requirement === null) {
    // No best-effort assessment: "ready for what?" has no answer, and producing one
    // anyway is the system answering a question it was not asked.
    return {
      analysisType: null,
      requestedType: request.analysisType,
      capability: null,
      readiness: 'BLOCKED',
      outputMode: 'refusal',
      classification: null,
      counts: EMPTY_COUNTS,
      dimensions: [],
      inputs: [],
      issues: [],
      clarifications: [],
      assumptions: [],
      limitations: [
        `"${request.analysisType.slice(0, 40)}" is not a declared analysis type, so it has no requirements to meet and there is nothing to assess.`,
      ],
      analysable: [],
      decidedBy: 'unsupported-analysis-type',
      note: DECISION_NOTE,
      capabilityNote: null,
    };
  }

  const allInputs = evaluateInputs({
    context: request.context,
    marketData: request.marketData,
    now: request.now,
  });
  const find = (field: InputRef): EvaluatedInput | null =>
    allInputs.find((input) => input.field === field) ?? null;
  const premises = new Set(request.premises ?? []);

  const readings = requirement.inputs.map((declared) => {
    const input = find(declared.field);
    return readField(declared.field, FIELD_LABELS[declared.field as FieldKey], input);
  });
  const marketInput = find('marketData');
  const marketReading =
    requirement.marketData === undefined || marketInput === null
      ? null
      : readMarketData(marketInput, requirement.marketData, request.marketData);

  const named: InputRef[] = [
    ...requirement.inputs.map((declared) => declared.field),
    ...(marketReading === null ? [] : (['marketData'] as InputRef[])),
  ];

  const issues: QualityIssue[] = [
    ...readings.flatMap((reading) => reading.issues),
    ...(marketReading === null ? [] : marketReading.issues),
  ];

  const clarifications: ClarificationQuestion[] = [];
  const assumptions: AssumptionNotice[] = [];
  const limitations: string[] = [];
  let blocked = false;
  let needsClarification = false;
  let limited = false;
  let premiseMode = false;

  /**
   * `decidedBy` names the rule that governs the outcome, and the tiers guarantee it
   * names the *strongest* one: a block outranks a question, which outranks a
   * limitation. Within a tier the first unmet requirement in registry order wins, so
   * the code is stable rather than dependent on iteration order.
   */
  let decidedBy = 'all-requirements-met';
  let tier = 0;
  const decide = (nextTier: 1 | 2 | 3, code: string): void => {
    if (nextTier > tier) {
      tier = nextTier;
      decidedBy = code;
    }
  };

  const noteSubstitution = (field: InputRef): void => {
    premiseMode = true;
    limited = true;
    decide(1, `premise-substitution:${field}`);
  };

  for (let index = 0; index < requirement.inputs.length; index += 1) {
    const declared = requirement.inputs[index]!;
    const reading = readings[index]!;
    const required = declared.necessity === 'required';
    const { label } = reading;

    if (reading.state === 'satisfied') continue;

    if (reading.state === 'invalid') {
      if (required) {
        // Nothing to analyse: a malformed value is not a value.
        blocked = true;
        decide(3, `invalid-input:${declared.field}`);
        limitations.push(`${label} is not a usable value and must be corrected first.`);
      } else {
        limited = true;
        decide(1, `invalid-optional-input:${declared.field}`);
        limitations.push(
          `${label} is not a usable value, so it is left out and the answer is narrower than it could be.`,
        );
      }
      continue;
    }

    if (reading.state === 'conflicting') {
      clarifications.push({
        field: declared.field,
        label,
        question: FIELD_QUESTIONS[declared.field as FieldKey],
        reason: 'conflicting',
        blocking:
          declared.whenConflicting === 'block' ||
          (required && declared.whenConflicting === 'clarify'),
      });
      limitations.push(
        `${label} is declared in a way that does not fit together, and nothing is resolved on your behalf.`,
      );
      if (declared.whenConflicting === 'block') {
        blocked = true;
        decide(3, `conflicting-input:${declared.field}`);
      } else if (declared.whenConflicting === 'clarify' && required) {
        needsClarification = true;
        decide(2, `conflicting-input:${declared.field}`);
      } else {
        limited = true;
        decide(1, `conflicting-optional-input:${declared.field}`);
      }
      continue;
    }

    if (reading.state === 'refused') {
      // A legitimate answer that cannot be an input. Never overridden, and never
      // treated as a gap the system is entitled to fill.
      const action = declared.whenAbsent;
      clarifications.push({
        field: declared.field,
        label,
        question: `${FIELD_QUESTIONS[declared.field as FieldKey]} You have declared a preference not to say, which will be respected until you choose to change it.`,
        reason: 'refused-to-say',
        blocking: required && action === 'clarify',
      });
      limitations.push(
        `${label} is answered as a refusal to say. That is a valid answer; it simply cannot be an input.`,
      );
      if (!required) {
        limited = true;
        decide(1, `refused-optional-input:${declared.field}`);
      } else if (action === 'block') {
        blocked = true;
        decide(3, `refused-required-input:${declared.field}`);
      } else if (premises.has(declared.field as FieldKey)) {
        noteSubstitution(declared.field);
      } else {
        needsClarification = true;
        decide(2, `refused-required-input:${declared.field}`);
      }
      continue;
    }

    if (reading.state === 'assumed') {
      const hold = `${label} is an assumption rather than something you stated, so nothing is built on it.`;
      limitations.push(hold);
      if (!required) {
        limited = true;
        continue;
      }
      if (premises.has(declared.field as FieldKey)) {
        noteSubstitution(declared.field);
        continue;
      }
      // A required input that is only an assumption is a gap, and a gap is answered by
      // asking — unless the user declared the premise, which makes it a hypothetical.
      clarifications.push({
        field: declared.field,
        label,
        question: FIELD_QUESTIONS[declared.field as FieldKey],
        reason: 'assumed',
        blocking: declared.whenAbsent === 'clarify',
      });
      assumptions.push({
        field: declared.field,
        label,
        origin: 'system',
        permitted: false,
        statement: `${label} would have to be assumed for this analysis to run.`,
        reason:
          'This is an input the answer is a function of. An assumed value would not be a weaker answer; it would be a different answer that reads as authority.',
      });
      if (declared.whenAbsent === 'block') {
        blocked = true;
        decide(3, `assumed-required-input:${declared.field}`);
      } else if (declared.whenAbsent === 'clarify') {
        needsClarification = true;
        decide(2, `assumed-required-input:${declared.field}`);
      } else {
        limited = true;
        decide(1, `assumed-required-input:${declared.field}`);
      }
      continue;
    }

    if (reading.state === 'stale') {
      clarifications.push({
        field: declared.field,
        label,
        question: `${FIELD_QUESTIONS[declared.field as FieldKey]} It is recorded, and it may no longer be current.`,
        reason: 'stale',
        blocking: declared.whenStale === 'block' || (required && declared.whenStale === 'clarify'),
      });
      limitations.push(`${label} has aged past the freshness window for this kind of input.`);
      if (declared.whenStale === 'block') {
        blocked = true;
        decide(3, `stale-required-input:${declared.field}`);
      } else if (declared.whenStale === 'clarify' && required) {
        needsClarification = true;
        decide(2, `stale-required-input:${declared.field}`);
      } else {
        limited = true;
        decide(1, `stale-optional-input:${declared.field}`);
      }
      continue;
    }

    /* state === 'absent' */
    if (required) {
      if (premises.has(declared.field as FieldKey)) {
        noteSubstitution(declared.field);
        assumptions.push({
          field: declared.field,
          label,
          origin: 'user-premise',
          permitted: true,
          statement: `Analysis proceeds under the substitution you declared for ${label.toLowerCase()}, not under a stored value.`,
          reason: 'You declared the substitution, so nothing is invented by the system.',
        });
        continue;
      }
      clarifications.push({
        field: declared.field,
        label,
        question: FIELD_QUESTIONS[declared.field as FieldKey],
        reason: 'missing',
        blocking: declared.whenAbsent !== 'limit',
      });
      assumptions.push({
        field: declared.field,
        label,
        origin: 'system',
        permitted: false,
        statement: declared.assumable.permitted
          ? declared.assumable.statement
          : `${label} would have to be assumed for this analysis to run.`,
        reason: declared.assumable.permitted
          ? 'A substitution the system chooses for itself is still an invention, so it is refused; declare it yourself and it becomes a labelled hypothetical.'
          : 'This is an input the answer is a function of. An assumed value would not be a weaker answer; it would be a different answer that reads as authority.',
      });
      if (declared.whenAbsent === 'block') {
        blocked = true;
        decide(3, `missing-required-input:${declared.field}`);
      } else if (declared.whenAbsent === 'clarify') {
        needsClarification = true;
        decide(2, `missing-required-input:${declared.field}`);
      } else {
        limited = true;
        decide(1, `missing-required-input:${declared.field}`);
      }
      continue;
    }

    // Helpful and absent: a limitation, never a question the user must answer.
    limitations.push(`${label} is not provided, so the answer is narrower than it could be.`);
    decide(1, `missing-optional-input:${declared.field}`);
    if (declared.assumable.permitted) {
      const declaredPremise = premises.has(declared.field as FieldKey);
      assumptions.push({
        field: declared.field,
        label,
        origin: declaredPremise ? 'user-premise' : 'system',
        permitted: declaredPremise,
        statement: declared.assumable.statement,
        reason: declaredPremise
          ? 'You declared this substitution.'
          : 'Listed so the limitation is explicit; nothing is assumed unless you say it.',
      });
      if (declaredPremise) premiseMode = true;
    }
    limited = true;
  }

  if (marketReading !== null && requirement.marketData !== undefined) {
    const market = requirement.marketData;
    const label = 'Market data';

    if (marketReading.state === 'invalid') {
      if (market.whenInvalid === 'block') {
        blocked = true;
        decide(3, 'invalid-market-data');
      } else {
        limited = true;
        decide(1, 'invalid-market-data');
      }
      limitations.push(
        'The bar series failed its own quality report, so nothing can be read from it.',
      );
    } else if (marketReading.state === 'absent') {
      if (market.necessity === 'required' && market.whenUnavailable === 'block') {
        blocked = true;
        decide(3, 'market-data-unavailable');
      } else if (market.necessity === 'required') {
        needsClarification = true;
        decide(2, 'market-data-unavailable');
      } else {
        limited = true;
        decide(1, 'market-data-unavailable');
      }
      limitations.push(
        'No bars are available. A user cannot declare a series into existence, so this is not a gap a question closes.',
      );
      assumptions.push({
        field: 'marketData',
        label,
        origin: 'system',
        permitted: false,
        statement: 'A bar series would have to be fabricated for this analysis to run.',
        reason: 'Master Trade does not invent market data.',
      });
    } else if (marketReading.state === 'assumed') {
      // Bars exist and nothing says what they are: no label, or no quality report.
      if (market.whenUnverified === 'block') {
        blocked = true;
        decide(3, 'unverified-market-data');
      } else if (market.whenUnverified === 'clarify') {
        needsClarification = true;
        decide(2, 'unverified-market-data');
      } else {
        limited = true;
        decide(1, 'unverified-market-data');
      }
      limitations.push(
        'The series carries no provenance record or quality report, so nothing may be read from it until it does.',
      );
    } else if (marketReading.state === 'stale') {
      clarifications.push({
        field: 'marketData',
        label,
        question:
          'The most recent bar is older than this analysis expects. Should it run on the series as it stands, or wait for fresher data?',
        reason: 'stale',
        blocking: market.whenStale === 'block',
      });
      limitations.push('The most recent bar is outside the window this analysis expects.');
      if (market.whenStale === 'block') {
        blocked = true;
        decide(3, 'stale-market-data');
      } else if (market.whenStale === 'clarify') {
        needsClarification = true;
        decide(2, 'stale-market-data');
      } else {
        limited = true;
        decide(1, 'stale-market-data');
      }
    } else {
      const provenance = request.marketData.provenance;
      if (provenance !== null && !market.permittedProvenance.includes(provenance)) {
        blocked = true;
        decide(3, 'market-data-provenance-not-permitted');
        limitations.push(
          `Bars labelled "${provenance}" are not permitted for this analysis, so no reading is produced.`,
        );
      } else if (provenance === 'synthetic') {
        // Usable, and never presentable as a measurement. This is a limitation on the
        // output, not a reason to refuse the analysis.
        limited = true;
        decide(1, 'synthetic-market-data');
        limitations.push(
          'Bars are synthetic. Every result from them is a training result and must be labelled as one.',
        );
      }
      if (marketDataShort(request.marketData, market)) {
        limited = true;
        decide(1, 'market-data-below-minimum-bars');
        limitations.push(
          `The series holds ${request.marketData.barCount} bars, below the ${market.minBars} this analysis needs, so any reading is correspondingly weak.`,
        );
      }
    }
  }

  const states = [
    ...readings.map((reading) => reading.state),
    ...(marketReading === null ? [] : [marketReading.state]),
  ];
  const requiredReadings = requirement.inputs
    .map((declared, index) => ({ declared, reading: readings[index]! }))
    .filter((entry) => entry.declared.necessity === 'required');

  const classification = classify({
    invalid: states.filter((state) => state === 'invalid').length,
    conflicting: states.filter((state) => state === 'conflicting').length,
    missingRequired: requiredReadings.some((entry) =>
      ['absent', 'refused', 'assumed'].includes(entry.reading.state),
    ),
    stale: states.filter((state) => state === 'stale').length,
    unverified: issues.some((found) => found.severity === 'unverified'),
    advisory: issues.some((found) => found.severity === 'advisory'),
    helpfulMissing: readings.some(
      (reading, index) =>
        requirement.inputs[index]!.necessity === 'helpful' && reading.state !== 'satisfied',
    ),
  });

  const readiness: Readiness = blocked
    ? 'BLOCKED'
    : needsClarification
      ? 'REQUIRES_CLARIFICATION'
      : limited
        ? 'READY_WITH_LIMITATIONS'
        : 'READY_FOR_ANALYSIS';

  const outputMode: OutputMode =
    readiness === 'BLOCKED'
      ? 'refusal'
      : readiness === 'REQUIRES_CLARIFICATION'
        ? 'clarification'
        : premiseMode
          ? 'labelled-hypothetical'
          : readiness === 'READY_WITH_LIMITATIONS'
            ? 'limited-analysis'
            : 'full-analysis';

  return {
    analysisType: requirement.type,
    requestedType: request.analysisType,
    capability: requirement.capability,
    readiness,
    outputMode,
    classification,
    counts: {
      inputsConsidered: named.length,
      required: requiredReadings.length,
      satisfied: requiredReadings.filter((entry) => entry.reading.state === 'satisfied').length,
      missing: states.filter((state) => state === 'absent' || state === 'refused').length,
      stale: states.filter((state) => state === 'stale').length,
      invalid: states.filter((state) => state === 'invalid').length,
      conflicting: states.filter((state) => state === 'conflicting').length,
      assumed: states.filter((state) => state === 'assumed').length,
    },
    dimensions: assessDimensions({
      requirement,
      readings,
      marketReading,
      issues,
      states,
    }),
    // Only the inputs this analysis actually consumes. Reporting the whole context
    // would imply that an unrelated gap is a reason this analysis is limited.
    inputs: allInputs.filter((input) => named.includes(input.field)),
    issues,
    clarifications: dedupe(clarifications),
    assumptions,
    limitations: [...new Set(limitations)],
    analysable: analysableTopics(allInputs),
    decidedBy,
    note: DECISION_NOTE,
    capabilityNote:
      requirement.capability === 'planned'
        ? 'The inputs satisfy this declaration; the capability itself is not implemented in this phase, so readiness describes the inputs only and no analysis is produced.'
        : null,
  };
}

function marketDataShort(marketData: MarketDataInput, requirement: MarketDataRequirement): boolean {
  return marketData.available && marketData.barCount < requirement.minBars;
}

function dedupe(questions: readonly ClarificationQuestion[]): ClarificationQuestion[] {
  const seen = new Set<string>();
  const unique: ClarificationQuestion[] = [];
  for (const question of questions) {
    const key = `${question.field}:${question.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(question);
  }
  return unique;
}

/* ------------------------------------------------------------------ */
/* Dimensions                                                          */
/* ------------------------------------------------------------------ */

/**
 * The eight verdicts.
 *
 * `confidence` is a **roll-up** and carries no codes of its own: it is the weakest
 * *required* input, taken as a minimum and never as a mean, so a strong input
 * cannot average away a weak one (ADR-0041 §3). Every other dimension reports the
 * codes behind its verdict.
 */
function assessDimensions(input: {
  requirement: AnalysisRequirement;
  readings: readonly FieldReading[];
  marketReading: FieldReading | null;
  issues: readonly QualityIssue[];
  states: readonly FieldState[];
}): DimensionAssessment[] {
  const { requirement, readings, marketReading, issues, states } = input;

  const withDimension = (dimension: QualityDimension): QualityIssueCode[] => [
    ...new Set(issues.filter((found) => found.dimension === dimension).map((found) => found.code)),
  ];
  const blocking = issues.filter((found) => found.severity === 'blocking');

  const requiredReadings = requirement.inputs
    .map((declared, index) => ({ declared, reading: readings[index]! }))
    .filter((entry) => entry.declared.necessity === 'required');
  const requiredUnavailable = requiredReadings.some((entry) =>
    ['absent', 'refused', 'assumed'].includes(entry.reading.state),
  );
  const helpfulMissing = requirement.inputs.some(
    (declared, index) => declared.necessity === 'helpful' && readings[index]!.state !== 'satisfied',
  );

  const verdicts: Record<QualityDimension, DimensionVerdict> = {
    // Is everything required present?
    completeness: requiredUnavailable ? 'failed' : helpfulMissing ? 'impaired' : 'ok',
    // Is every present value a value of its declared kind?
    validity: blocking.length > 0 ? 'failed' : 'ok',
    // Do the values agree?
    consistency: states.includes('conflicting') ? 'impaired' : 'ok',
    // How was each obtained? An assumption is not an observation.
    reliability: states.includes('assumed') ? 'impaired' : 'ok',
    freshness: states.includes('stale') ? 'impaired' : 'ok',
    // Fitness for this capability: a series too short to describe anything.
    relevance:
      marketReading !== null && marketReading.state === 'invalid'
        ? 'failed'
        : issues.some((found) => found.dimension === 'relevance')
          ? 'impaired'
          : 'ok',
    // The weakest required input, as a minimum.
    confidence: requiredReadings.some((entry) =>
      ['absent', 'refused'].includes(entry.reading.state),
    )
      ? 'failed'
      : requiredReadings.some((entry) => entry.reading.state === 'assumed')
        ? 'impaired'
        : 'ok',
    // Can we point at where each came from?
    provenance: inputsLackProvenance(requirement, readings, marketReading) ? 'impaired' : 'ok',
  };

  return QUALITY_DIMENSIONS.map((dimension) => ({
    dimension,
    question: DIMENSION_QUESTION[dimension],
    verdict: verdicts[dimension],
    codes: dimension === 'confidence' ? [] : withDimension(dimension),
  }));
}

function inputsLackProvenance(
  requirement: AnalysisRequirement,
  readings: readonly FieldReading[],
  marketReading: FieldReading | null,
): boolean {
  const fromFields = requirement.inputs.some((_declared, index) => {
    const reading = readings[index]!;
    if (reading.state === 'satisfied') return false;
    return reading.issues.some(
      (found) => found.dimension === 'provenance' || found.code === 'undated-claim',
    );
  });
  const fromMarket =
    marketReading !== null &&
    marketReading.issues.some((found) => found.dimension === 'provenance');
  return fromFields || fromMarket;
}

export function classify(input: {
  invalid: number;
  conflicting: number;
  missingRequired: boolean;
  stale: number;
  unverified: boolean;
  advisory: boolean;
  helpfulMissing: boolean;
}): QualityClassification {
  if (input.invalid > 0) return 'INVALID';
  if (input.conflicting > 0) return 'CONFLICTING';
  if (input.missingRequired) return 'INSUFFICIENT';
  if (input.stale > 0) return 'STALE';
  if (input.unverified) return 'UNVERIFIED';
  if (input.advisory || input.helpfulMissing) return 'PARTIALLY_SUFFICIENT';
  return 'SUFFICIENT';
}

/* ------------------------------------------------------------------ */
/* Contract text                                                       */
/* ------------------------------------------------------------------ */

/**
 * What the classification and the counts mean, shipped with the decision.
 *
 * A client that has to invent its own wording will eventually invent its own
 * meaning, so the contract carries the explanation and the UI renders it.
 */
export const DECISION_NOTE = [
  'Classification names the most severe condition present, because each one demands a different response: correct an invalid value, resolve a conflict, answer for something absent, refresh something out of date, record provenance, or proceed.',
  'No numeric score is produced. A score invites a threshold, and a threshold is a product decision hidden in a constant; the counts beside this note are the quantified part, and each one is named.',
  'Readiness is computed from your declarations and the capability declared requirements. It is deterministic, and no language model can override it: when the gate refuses, no model is consulted.',
].join(' ');

/**
 * The rule that decided a gate outcome, as human-readable text.
 *
 * Exported here rather than written in the UI so the code and the explanation
 * cannot drift apart.
 */
export function describeDecisionCode(decidedBy: string): string {
  const [rule, field] = decidedBy.split(':');
  const label =
    field === 'marketData'
      ? 'Market data'
      : field === undefined
        ? ''
        : FIELD_LABELS[field as FieldKey];
  switch (rule) {
    case 'unsupported-analysis-type':
      return 'The requested analysis type is not declared, so no requirements exist to meet.';
    case 'all-requirements-met':
      return 'Every declared requirement is satisfied.';
    case 'invalid-input':
      return `${label} is not a usable value, so nothing may be computed from this input set.`;
    case 'invalid-market-data':
      return 'The bar series failed its own quality report, so nothing may be read from it.';
    case 'unverified-market-data':
      return 'The bar series carries no provenance record or quality report, so it cannot be weighed.';
    case 'market-data-unavailable':
      return 'No market-data series is available, and a series cannot be assumed into existence.';
    case 'market-data-provenance-not-permitted':
      return 'The available bars carry a provenance label this analysis is not permitted to work from.';
    case 'conflicting-input':
      return `${label} is declared in a way that cannot hold, so the conflict is put to you rather than resolved.`;
    case 'missing-required-input':
      return `${label} is required by this analysis and has not been provided.`;
    case 'assumed-required-input':
      return `${label} is required by this analysis and is not stated, only assumed.`;
    case 'refused-required-input':
      return `${label} is required by this analysis and is answered as a refusal to say.`;
    case 'stale-required-input':
      return `${label} is required by this analysis and has aged past its freshness window.`;
    case 'stale-market-data':
      return 'The most recent bar is outside the window this analysis expects.';
    case 'premise-substitution':
      return `${label} is standing in as the substitution you declared, so the output is a labelled hypothetical.`;
    default:
      return decidedBy;
  }
}

/** Highest severity among a set of issues, or `null` when there are none. */
export function worstSeverity(issues: readonly QualityIssue[]): QualitySeverity | null {
  let worst: QualitySeverity | null = null;
  for (const found of issues) {
    if (worst === null) {
      worst = found.severity;
      continue;
    }
    const rank: Record<QualitySeverity, number> = {
      blocking: 6,
      conflicting: 5,
      missing: 4,
      stale: 3,
      unverified: 2,
      advisory: 1,
    };
    if (rank[found.severity] > rank[worst]) worst = found.severity;
  }
  return worst;
}
