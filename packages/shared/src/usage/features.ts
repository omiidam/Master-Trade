/**
 * What may be consumed, and what it costs.
 *
 * Every metered capability is declared here, once, with three properties that must
 * stay together:
 *
 *   - the **operation** the request pipeline checks (a role decision, ADR-0007);
 *   - the **state** — available, coming soon, or disabled pending a review;
 *   - the **credit cost**, plus `costBasis`: the sentence that says what the number
 *     means. A cost with no stated basis is a number nobody can review, and a review
 *     is the only thing standing between a credit system and a random price list.
 *
 * Three rules this catalogue exists to make checkable:
 *
 *   1. **A deterministic capability costs nothing.** `quality.assess` runs no provider
 *      and consumes no budget, so it is priced at 0 — the ADR-0041 intention that a
 *      position-size calculation must not stop working because a credit ran out.
 *   2. **State is not plan.** A `coming-soon` feature is not "not in your plan": the
 *      first is a gap in the product, the second is an upgrade. They must never wear
 *      the same words, for the same reason the readiness gate keeps a `planned`
 *      capability apart from an input gap.
 *   3. **`disabled` is a decision, not a backlog.** A feature declared `disabled`
 *      carries the review that would unblock it, so the surface can say *why*.
 *
 * Costs are **integers**. Credits are not fractional, and a fractional credit would
 * make a balance unable to be reconciled exactly.
 */

import type { OperationId } from '../auth/model.js';

/** A coarse grouping, for usage history and summaries. Never a price. */
export const USAGE_CATEGORIES = [
  'ai-analysis',
  'portfolio-evaluation',
  'research-report',
  'backtest',
  'dataset-processing',
  'deterministic-tool',
  'data-export',
] as const;

export type UsageCategory = (typeof USAGE_CATEGORIES)[number];

export const USAGE_CATEGORY_LABEL: Readonly<Record<UsageCategory, string>> = {
  'ai-analysis': 'AI analysis',
  'portfolio-evaluation': 'Portfolio evaluation',
  'research-report': 'Research reports',
  backtest: 'Backtesting',
  'dataset-processing': 'Dataset processing',
  'deterministic-tool': 'Deterministic tools',
  'data-export': 'Data export',
};

export const FEATURE_IDS = [
  'agent.chat',
  'quality.assess',
  'portfolio.composition',
  'portfolio.analysis',
  'research.report',
  'backtest.run',
  'dataset.process',
  'memory.export',
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

/**
 * Whether a declared capability can be used at all.
 *
 * `coming-soon` and `disabled` are both refusals, and they are different refusals:
 * one is a delivery gap, the other is a deliberate hold with a named review behind it.
 */
export type FeatureState = 'available' | 'coming-soon' | 'disabled';

export interface FeatureDefinition {
  id: FeatureId;
  label: string;
  description: string;
  category: UsageCategory;
  /**
   * Credits one invocation costs. An integer; `0` for a capability that runs no
   * provider. Credited at reservation and returned in full if the operation fails.
   */
  creditCost: number;
  /** What the number means. Required for every feature, including the zeroes. */
  costBasis: string;
  state: FeatureState;
  /** Why the state is what it is, when it is not `available`. */
  stateReason: string | null;
  /**
   * The operation the pipeline checks, or `null` when no operation exists yet.
   *
   * `null` is only ever paired with a `coming-soon` state: a capability with an
   * operation but no entitlement would be a second permission system, and one with
   * an entitlement but no operation would be a permission bypass.
   */
  operation: OperationId | null;
  /** True when a model provider may be consulted. Drives the "cost is ours" rule. */
  usesModel: boolean;
}

/**
 * The catalogue.
 *
 * Costs are set against a **free daily allowance of 20 credits**, so one credit is
 * roughly one free agent turn: the number is chosen to be readable, not derived from
 * a margin. Token spend is accounted separately in USD by the LLM gateway from the
 * project's own price table; it is deliberately *not* what the user pays here, because
 * a per-token price would make a single answer's cost unpredictable to the person
 * paying for it — the phase brief's "predictable consumption" requirement.
 */
export const FEATURES: readonly FeatureDefinition[] = [
  {
    id: 'agent.chat',
    label: 'Agent conversation',
    description:
      'One turn with the assistant, including the deterministic tools it may run inside that turn.',
    category: 'ai-analysis',
    creditCost: 1,
    costBasis:
      'One credit per turn, whatever the turn costs us in tokens. A per-token price would make a single answer unpredictable; one turn is one credit and the ceiling is the plan allowance.',
    state: 'available',
    stateReason: null,
    operation: 'agent.chat',
    usesModel: true,
  },
  {
    id: 'quality.assess',
    label: 'Input quality assessment',
    description:
      'The deterministic analysis-readiness gate: which declared inputs are present, valid, current and consistent, and whether an analysis may run.',
    category: 'deterministic-tool',
    creditCost: 0,
    costBasis:
      'Zero. It runs no provider and reads only the declaration, so it is free by construction — a capability must not stop working because a credit ran out (ADR-0041).',
    state: 'available',
    stateReason: null,
    operation: 'quality.assess',
    usesModel: false,
  },
  {
    id: 'portfolio.composition',
    label: 'Portfolio composition',
    description:
      'Valuing a declared composition: allocation, cost basis, unrealised profit and loss, concentration and exposure, with every gap named rather than filled.',
    category: 'portfolio-evaluation',
    creditCost: 0,
    costBasis:
      'Zero. It runs no provider: the arithmetic is deterministic code over the document the user declared, so it is free by construction — the ADR-0041 rule that a calculation must not stop working because a credit ran out.',
    state: 'available',
    stateReason: null,
    operation: 'portfolio.read',
    usesModel: false,
  },
  {
    id: 'portfolio.analysis',
    label: 'Portfolio analysis',
    description:
      'Scenario and correlation commentary over a composition, written by the model from the deterministic composition result.',
    category: 'portfolio-evaluation',
    creditCost: 5,
    costBasis:
      'Five credits: a composition is enumerated, correlated and re-run under each declared scenario, so one request is several computations plus a model pass over the result. Declared, not yet charged.',
    state: 'coming-soon',
    stateReason:
      'The deterministic half is built and free (see `portfolio.composition`). What is missing is the rest: scenario evaluation needs price history, and correlation needs a series per holding, so this stays declared rather than charged.',
    operation: null,
    usesModel: true,
  },
  {
    id: 'research.report',
    label: 'Research report',
    description: 'A written report over an experiment, its sample size and its findings.',
    category: 'research-report',
    creditCost: 10,
    costBasis:
      'Ten credits: a report is the longest generated artefact in the product and the one most likely to be re-run, so it is priced above a single turn. Declared, not yet charged.',
    state: 'coming-soon',
    stateReason:
      'The research engine is a UI surface over labelled fixtures; there is no statistical engine to report on.',
    operation: null,
    usesModel: true,
  },
  {
    id: 'backtest.run',
    label: 'Backtest',
    description: 'A rule tested against historical bars, with its sample size and its drawdown.',
    category: 'backtest',
    creditCost: 25,
    costBasis:
      'Twenty-five credits: a backtest is minutes of worker time plus a bar series, which is the most expensive thing the platform can be asked to do. Declared, not yet charged.',
    state: 'coming-soon',
    stateReason:
      'The operation is declared and approval-gated, but no engine exists and no real bar provider is wired.',
    operation: 'backtest.run',
    usesModel: false,
  },
  {
    id: 'dataset.process',
    label: 'Dataset processing',
    description: 'Normalising an uploaded dataset into bars or records the platform can read.',
    category: 'dataset-processing',
    creditCost: 5,
    costBasis:
      'Five credits: a job that normalises a bounded file, priced like a portfolio analysis because it is comparable work. Declared, not yet charged.',
    state: 'coming-soon',
    stateReason: 'No ingestion pipeline exists; file storage has no durable adapter yet.',
    operation: null,
    usesModel: false,
  },
  {
    id: 'memory.export',
    label: 'Memory export',
    description: 'Exporting the memory records and their provenance as a portable file.',
    category: 'data-export',
    creditCost: 0,
    costBasis:
      'Zero, and it is not the cost that holds it back. Export is the user’s own data and must never be gated on credits.',
    state: 'disabled',
    stateReason:
      'Held pending the data-protection review that ADR-0042 already treats as a release gate: export and hard-delete surfaces land together, with the retention duties settled first.',
    operation: 'file.download',
    usesModel: false,
  },
];

export const FEATURES_BY_ID: Readonly<Record<FeatureId, FeatureDefinition>> = Object.fromEntries(
  FEATURES.map((feature) => [feature.id, feature]),
) as Readonly<Record<FeatureId, FeatureDefinition>>;

export function featureFor(id: string): FeatureDefinition | null {
  return Object.prototype.hasOwnProperty.call(FEATURES_BY_ID, id)
    ? (FEATURES_BY_ID[id as FeatureId] ?? null)
    : null;
}

export function isFeatureId(value: string): value is FeatureId {
  return (FEATURE_IDS as readonly string[]).includes(value);
}

/** Every feature that consumes credits. Used by the plan catalogue's invariant check. */
export function meteredFeatures(): FeatureDefinition[] {
  return FEATURES.filter((feature) => feature.creditCost > 0);
}

/**
 * A cost may not be negative or fractional.
 *
 * Negative would mean a capability that pays the user for calling it, which no plan
 * author intended; fractional would mean a balance that cannot be reconciled exactly.
 */
export function assertFeatureCatalogue(features: readonly FeatureDefinition[] = FEATURES): void {
  const seen = new Set<string>();
  for (const feature of features) {
    if (seen.has(feature.id)) throw new Error(`Duplicate feature id: ${feature.id}`);
    seen.add(feature.id);
    if (!Number.isInteger(feature.creditCost) || feature.creditCost < 0) {
      throw new Error(
        `Feature ${feature.id} declares a non-integer or negative cost (${feature.creditCost}).`,
      );
    }
    if (feature.costBasis.trim().length < 20) {
      throw new Error(`Feature ${feature.id} declares a cost with no stated basis.`);
    }
    if (feature.state === 'available' && feature.stateReason !== null) {
      throw new Error(`Feature ${feature.id} is available and also carries a refusal reason.`);
    }
    if (feature.state !== 'available' && feature.stateReason === null) {
      throw new Error(`Feature ${feature.id} is ${feature.state} with no reason given.`);
    }
    // A declared-but-unbuilt capability has no operation to check; an available one
    // must, or its entitlement would be the only thing standing between a request
    // and the work.
    if (feature.state === 'available' && feature.operation === null) {
      throw new Error(`Feature ${feature.id} is available but names no operation.`);
    }
  }
}

/** True when the feature is free to run: nothing is reserved and nothing is charged. */
export function isFree(feature: FeatureDefinition): boolean {
  return feature.creditCost === 0;
}
