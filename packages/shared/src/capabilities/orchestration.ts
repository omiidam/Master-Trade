/**
 * Capability orchestration — the pipeline, as a decision rather than a call chain.
 *
 * Phase 5.7 asks for one flow:
 *
 *   resolution → validation → quality → readiness → permission → entitlement →
 *   engine → evidence → explanation → structured result → audit
 *
 * The temptation is to write that as eleven `await`s. The reason not to is that the
 * interesting behaviour is not the happy path — it is *where a request stops*, and a
 * chain of `await`s has nowhere to put that answer. So the pipeline is a **plan**:
 * `planCapabilityRun` walks the declared stages and returns either a refusal that names
 * the stage it stopped at, or a plan that says which engine to run. Nothing in it does
 * I/O, reads a clock or touches a provider, so it is exhaustively testable, and the
 * backend service that executes it can only do what the plan permits.
 *
 * Four rules this file exists to make structural:
 *
 *   1. **The stages are declared data.** `PIPELINE_STAGES` is the order, and the surface
 *      renders it, so the diagram in the documentation and the behaviour in production
 *      cannot drift.
 *   2. **A refusal carries the stage and the reason.** Every refusal is a value in the
 *      same shape as a success, so a client renders it instead of inventing an error.
 *   3. **Nothing charges for work that did not happen.** Entitlement is checked before the
 *      engine, and a capability that is refused earlier holds no credits — the plan has no
 *      credit movement on a refusal at all.
 *   4. **The model cannot widen anything.** A model-requestable check happens at
 *      resolution, against a declared field, and there is no branch anywhere in this file
 *      that accepts a model's opinion about readiness, permission or cost.
 */

import type { EntitlementDecision } from '../usage/entitlements.js';
import type { AnalysisReadinessDecision } from '../quality/readiness.js';
import {
  CAPABILITY_STATE_LABEL,
  RESULT_NOTE,
  summariseState,
  type CapabilityDefinition,
  type CapabilityResult,
  type CapabilityState,
  type CalculationItem,
  type EvidenceItem,
  type InsightItem,
  type NextAction,
  type ResultDataQuality,
  type ResultUsage,
  type RiskItem,
} from './model.js';
import { capabilityState, resolveCapability, stateReason } from './registry.js';

/* ------------------------------------------------------------------ */
/* The declared pipeline                                               */
/* ------------------------------------------------------------------ */

/**
 * One stage of the flow. Ordered; the order is the contract.
 *
 * `blocks` says what happens when the stage does not pass, and it is stated per stage
 * rather than inferred, because "which refusal wins" is a product decision: an
 * unimplemented capability outranks a missing input, because telling someone their input
 * is missing when providing it would change nothing is a way of wasting their time.
 */
export const PIPELINE_STAGES = [
  {
    id: 'resolution',
    label: 'Capability resolution',
    meaning:
      'Find the capability by exact id. Capabilities are deny-by-default: an id nobody declared has no entry and is refused before anything else is considered.',
    blocks:
      'A capability that does not exist, is not implemented, or may not be requested by this requester stops here.',
  },
  {
    id: 'validation',
    label: 'Input validation',
    meaning:
      'Check the declaration itself is usable: it names a capability, and the deterministic binding the capability declares is one this process can actually honour.',
    blocks: 'A malformed request or a declared engine that no process implements stops here.',
  },
  {
    id: 'quality',
    label: 'Input quality assessment',
    meaning:
      'Read the user’s declared context and the market-data situation, field by field: present, valid, current, consistent, provenance recorded.',
    blocks: 'Nothing. This stage produces the report the next one decides on.',
  },
  {
    id: 'readiness',
    label: 'Readiness gate',
    meaning:
      'Decide from the assessment whether the capability may run, may run with limitations, needs clarification, or is blocked. Deterministic, and no model has a vote.',
    blocks: 'A refused input set stops here, before a permission or a credit is considered.',
  },
  {
    id: 'permission',
    label: 'Permission check',
    meaning:
      'The role table’s answer for the capability’s operation (ADR-0007). The frontend never supplies this and no plan can override it.',
    blocks:
      'A denied operation stops here. Being able to afford something is not permission to run it.',
  },
  {
    id: 'entitlement',
    label: 'Entitlement and credits',
    meaning:
      'Resolve what the plan includes and whether the balance covers the declared cost. A deterministic capability costs nothing and is never refused for a balance.',
    blocks:
      'An unavailable feature, an inactive subscription, an exhausted allowance or an insufficient balance stops here, before any work begins.',
  },
  {
    id: 'engine',
    label: 'Deterministic execution',
    meaning:
      'Run the registered engine tool that owns this capability’s arithmetic. Every figure the result contains is produced here.',
    blocks:
      'A failure inside the engine is a refusal of the capability, never a result with a missing figure.',
  },
  {
    id: 'evidence',
    label: 'Evidence and provenance',
    meaning:
      'Collect what the result rests on, with each item’s trust level and observation time attached.',
    blocks: 'Nothing. Evidence is assembled from the engine result and the declarations it read.',
  },
  {
    id: 'explanation',
    label: 'Explanation',
    meaning:
      'A model may explain the result, and may not alter it. Readiness, permission and cost were already decided, and there is no branch that consults a model about any of them.',
    blocks: 'Nothing. A refused capability never reaches a model at all.',
  },
  {
    id: 'result',
    label: 'Structured result',
    meaning:
      'One shape, whether the capability ran or was refused: state, calculations, insights, risks, limitations, uncertainty, provenance, usage and next actions.',
    blocks: 'Nothing. This is where every other stage’s outcome becomes renderable.',
  },
  {
    id: 'audit',
    label: 'Audit and usage record',
    meaning:
      'Append the attempt and the movement, so what happened is reproducible from the log rather than from the response.',
    blocks: 'Nothing. A refusal is recorded like any other attempt.',
  },
] as const;

export type PipelineStageId = (typeof PIPELINE_STAGES)[number]['id'];

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_IDS: readonly PipelineStageId[] = PIPELINE_STAGES.map(
  (stage) => stage.id,
);

export function stageFor(id: PipelineStageId): PipelineStage {
  const stage = PIPELINE_STAGES.find((entry) => entry.id === id);
  if (stage === undefined) throw new Error(`No pipeline stage is declared as "${id}".`);
  return stage;
}

/* ------------------------------------------------------------------ */
/* The plan                                                            */
/* ------------------------------------------------------------------ */

export type CapabilityRequester = 'model' | 'user' | 'job';

export interface CapabilityRunRequest {
  /** The requested id, exactly as it arrived. Never coerced, never fuzzy-matched. */
  capabilityId: string;
  /** Who asked. A model is held to `modelMayRequest`; a human is not. */
  requester: CapabilityRequester;
  /**
   * The gate’s verdict for this capability’s analysis type.
   *
   * `null` for a capability with no declared inputs, and for a request whose gate did not
   * run — the two are distinguished by `analysisType`, not by this field.
   */
  readiness?: AnalysisReadinessDecision | null;
  /** The role table’s answer for the capability’s operation. */
  permissionGranted: boolean;
  /** Entitlement, or `null` when the capability has no declared feature. */
  entitlement?: EntitlementDecision | null;
  /**
   * Deterministic engine capabilities this process has registered.
   *
   * Passed in rather than imported, so the plan is pure and so a capability whose engine
   * is not wired in *this* deployment is refused here instead of failing later with a
   * figure missing.
   */
  registeredEngineCapabilities?: readonly string[];
}

export interface CapabilityRefusal {
  stage: PipelineStageId;
  /** A stable code, so a client can branch without parsing prose. */
  code: string;
  /** One sentence, system-worded. Safe to render. */
  reason: string;
}

export interface CapabilityRunPlan {
  requestedId: string;
  /** `null` only when nothing was declared under the requested id. */
  capability: CapabilityDefinition | null;
  state: CapabilityState;
  /** `run` means every declared gate passed and the engine may be invoked. */
  outcome: 'run' | 'refuse';
  /** The stage the plan stopped at, or the stage it reached when it will run. */
  stoppedAt: PipelineStageId;
  refusals: readonly CapabilityRefusal[];
  readiness: AnalysisReadinessDecision | null;
  entitlement: EntitlementDecision | null;
  /** True when the capability has a deterministic half to execute. */
  requiresEngine: boolean;
  /** What the caller is asked to do about a refusal. Empty when it will run. */
  nextActions: readonly NextAction[];
  /** Contract text for the state. */
  note: string;
  decidedBy: string | null;
}

const RUN_NOTE =
  'No result is predicted here: this is the plan, and the shape of it is what makes the refusal paths reviewable.';

function refuse(
  plan: Omit<CapabilityRunPlan, 'outcome' | 'refusals'>,
  refusal: CapabilityRefusal,
): CapabilityRunPlan {
  return { ...plan, outcome: 'refuse', refusals: [refusal] };
}

/**
 * Walk the declared stages and decide what may happen.
 *
 * Pure: no clock, no database, no provider, no model. The same request always produces
 * the same plan, so a refusal can be reproduced from a log entry and every branch is
 * reachable from a test rather than from a deployment.
 */
export function planCapabilityRun(request: CapabilityRunRequest): CapabilityRunPlan {
  const base = {
    requestedId: request.capabilityId,
    readiness: request.readiness ?? null,
    entitlement: request.entitlement ?? null,
    nextActions: [] as NextAction[],
    requiresEngine: false,
    decidedBy: null as string | null,
  };

  /* 1. Resolution — deny-by-default, and the model’s permission to ask. */
  const capability = resolveCapability(request.capabilityId);
  if (capability === null) {
    return refuse(
      {
        ...base,
        capability: null,
        state: 'UNAVAILABLE',
        stoppedAt: 'resolution',
        note: 'Capabilities are deny-by-default: an id nobody declared has no implementation to reach.',
      },
      {
        stage: 'resolution',
        code: 'undeclared-capability',
        reason: `No capability is declared as "${request.capabilityId.slice(0, 48)}". Capabilities are deny-by-default, so an undeclared id is refused before any input is read.`,
      },
    );
  }

  if (capability.availability !== 'available') {
    return refuse(
      {
        ...base,
        capability,
        state: 'UNAVAILABLE',
        stoppedAt: 'resolution',
        note: stateReason(capability, 'UNAVAILABLE', null),
      },
      {
        stage: 'resolution',
        code: `capability-${capability.availability}`,
        reason: stateReason(capability, 'UNAVAILABLE', null),
      },
    );
  }

  if (request.requester === 'model' && !capability.modelMayRequest) {
    // Declared, not emergent: the model may not ask for this, whatever it can afford and
    // whatever the user declared.
    return refuse(
      {
        ...base,
        capability,
        state: 'BLOCKED',
        stoppedAt: 'resolution',
        note: 'This capability is not requestable by a model. A person or a job asks for it, and the model explains the result afterwards.',
      },
      {
        stage: 'resolution',
        code: 'not-model-requestable',
        reason: `${capability.name} is not requestable by a model. It is triggered by a person, so a model asking for it is refused before any input is read.`,
      },
    );
  }

  if (
    request.requester === 'model' &&
    capability.riskLevel === 'high-impact' &&
    !request.permissionGranted
  ) {
    // A high-impact capability requested by a model without the role table's answer is the
    // shape of a privilege escalation: checked here so the engine stage is unreachable.
    return refuse(
      {
        ...base,
        capability,
        state: 'BLOCKED',
        stoppedAt: 'permission',
        note: 'The operation was not granted, so the capability is blocked rather than attempted.',
      },
      {
        stage: 'permission',
        code: 'permission-denied',
        reason: `The role table does not grant ${capability.operation ?? 'this operation'}, so ${capability.name} is refused. A model may not perform an operation the role table denies.`,
      },
    );
  }

  /* 2. Validation — the declaration must be honour-able in this process. */
  const registered = request.registeredEngineCapabilities;
  const requiresEngine = capability.engineCapability !== null;
  if (
    requiresEngine &&
    registered !== undefined &&
    !registered.includes(capability.engineCapability!)
  ) {
    return refuse(
      {
        ...base,
        capability,
        state: 'BLOCKED',
        stoppedAt: 'validation',
        requiresEngine: true,
        note: 'The capability declares a deterministic engine that this deployment has not registered, so it cannot produce figures and is refused rather than run without them.',
      },
      {
        stage: 'validation',
        code: 'engine-not-registered',
        reason: `${capability.name} declares the deterministic engine "${capability.engineCapability}" and this process has not registered it, so the arithmetic it depends on is unavailable.`,
      },
    );
  }

  /* 3. Quality and 4. Readiness — the gate decides, and only for a gated capability. */
  let state: CapabilityState = capabilityState(capability, base.readiness);
  const nextActions: NextAction[] = [];
  let decidedBy: string | null = null;

  if (capability.analysisType !== null) {
    const readiness = base.readiness;
    if (readiness === null) {
      return refuse(
        {
          ...base,
          capability,
          state: 'BLOCKED',
          stoppedAt: 'readiness',
          requiresEngine,
          note: 'A gated capability is never run without its gate’s verdict: a server that cannot evaluate its own preconditions must not answer as though it had.',
        },
        {
          stage: 'readiness',
          code: 'readiness-not-supplied',
          reason: `${capability.name} is gated by declared inputs, and no readiness decision was supplied. The capability is not run without it.`,
        },
      );
    }
    decidedBy = readiness.decidedBy;
    for (const question of readiness.clarifications) {
      nextActions.push({
        kind: 'answer-question',
        label: `Answer for ${question.label.toLowerCase()}`,
        detail: question.question,
        field: question.field,
      });
    }
    if (state === 'BLOCKED' || state === 'REQUIRES_CLARIFICATION') {
      return refuse(
        {
          ...base,
          capability,
          state,
          stoppedAt: 'readiness',
          requiresEngine,
          nextActions,
          decidedBy,
          note: `${CAPABILITY_STATE_LABEL[state]}: ${readiness.limitations.join(' ') || 'the declared inputs do not support this capability.'}`,
        },
        {
          stage: 'readiness',
          code: state === 'BLOCKED' ? 'inputs-blocked' : 'clarification-required',
          reason: `${CAPABILITY_STATE_LABEL[state]}. ${readiness.limitations.join(' ') || 'The declared inputs do not support this capability.'}`,
        },
      );
    }
  } else if (capability.availability === 'available') {
    state = 'READY';
  }

  /* 5. Permission. */
  if (capability.operation !== null && !request.permissionGranted) {
    return refuse(
      {
        ...base,
        capability,
        state: 'BLOCKED',
        stoppedAt: 'permission',
        requiresEngine,
        nextActions,
        decidedBy,
        note: 'The role table denies this operation, and nothing below can overturn it.',
      },
      {
        stage: 'permission',
        code: 'permission-denied',
        reason: `The role table does not grant ${capability.operation}, so ${capability.name} is refused. Being able to afford something is not permission to run it.`,
      },
    );
  }

  /* 6. Entitlement and credits — before the engine, so nothing is charged for work that
        does not happen. */
  const entitlement = base.entitlement;
  if (capability.feature !== null) {
    if (entitlement === null) {
      return refuse(
        {
          ...base,
          capability,
          state: 'BLOCKED',
          stoppedAt: 'entitlement',
          requiresEngine,
          nextActions,
          decidedBy,
          note: 'A metered capability is never run with its entitlement unresolved.',
        },
        {
          stage: 'entitlement',
          code: 'entitlement-not-supplied',
          reason: `${capability.name} is metered through "${capability.feature}", and no entitlement decision was supplied, so the capability is not run.`,
        },
      );
    }
    if (!entitlement.allowed) {
      nextActions.push(upgradeAction(entitlement));
      return refuse(
        {
          ...base,
          capability,
          state: state === 'READY_WITH_LIMITATIONS' ? 'READY_WITH_LIMITATIONS' : 'BLOCKED',
          stoppedAt: 'entitlement',
          requiresEngine,
          nextActions,
          decidedBy,
          note: entitlement.reason,
        },
        {
          stage: 'entitlement',
          code: `entitlement-${entitlement.denial}`,
          reason: entitlement.reason,
        },
      );
    }
  }

  return {
    requestedId: request.capabilityId,
    capability,
    state,
    outcome: 'run',
    stoppedAt: 'engine',
    refusals: [],
    readiness: base.readiness,
    entitlement,
    requiresEngine,
    nextActions,
    decidedBy,
    note: RUN_NOTE,
  };
}

function upgradeAction(entitlement: Extract<EntitlementDecision, { allowed: false }>): NextAction {
  if (entitlement.upgradeWouldNotHelp || entitlement.upgrade === null) {
    return {
      kind: 'none',
      label: 'No upgrade resolves this',
      detail: entitlement.reason,
      field: null,
    };
  }
  return {
    kind: 'upgrade-plan',
    label: `Consider ${entitlement.upgrade.displayName}`,
    detail: `${entitlement.upgrade.displayName} includes ${entitlement.feature?.label ?? 'this capability'}. No plan is purchasable in this build, so nothing can be bought here.`,
    field: null,
  };
}

/* ------------------------------------------------------------------ */
/* The result                                                          */
/* ------------------------------------------------------------------ */

/** The capability-specific pieces an engine run contributes. */
export interface CapabilityResultParts {
  summary?: string;
  evidence?: readonly EvidenceItem[];
  calculations?: readonly CalculationItem[];
  insights?: readonly InsightItem[];
  risks?: readonly RiskItem[];
  limitations?: readonly string[];
  uncertainty?: readonly string[];
}

/**
 * Assemble the one result shape.
 *
 * A refusal and a success differ in what they carry, not in what they are, which is why
 * a client needs no separate error path: `state` decides the presentation and the rest is
 * data. `usage` is `null` on a refusal because nothing was held — the plan has no credit
 * movement before the entitlement stage passes.
 */
export function resultFromPlan(
  plan: CapabilityRunPlan,
  parts: CapabilityResultParts = {},
): CapabilityResult {
  const capability = plan.capability;
  const readiness = plan.readiness;
  const entitlement = plan.entitlement;

  const dataQuality: ResultDataQuality | null =
    readiness === null
      ? null
      : {
          classification: readiness.classification,
          readiness: readiness.readiness,
          outputMode: readiness.outputMode,
          counts: readiness.counts,
          dimensions: readiness.dimensions,
          issues: readiness.issues,
          note: readiness.note,
        };

  const limitations = [
    ...(readiness?.limitations ?? []),
    ...(readiness?.capabilityNote === null || readiness?.capabilityNote === undefined
      ? []
      : [readiness.capabilityNote]),
    ...(plan.refusals.map((refusal) => refusal.reason) ?? []),
    ...(parts.limitations ?? []),
  ];
  const uniqueLimitations = [...new Set(limitations)];

  // `usage` is present only on a run. A refusal holds nothing — the plan has no credit
  // movement before the entitlement stage passes — so reporting a usage block for one
  // would describe a metering relationship that never happened.
  const usage: ResultUsage | null =
    plan.outcome === 'run' && entitlement !== null && entitlement.allowed
      ? {
          featureId: capability?.feature ?? null,
          credits: entitlement.credits,
          charged: entitlement.credits > 0,
          reservationId: null,
          note:
            entitlement.credits > 0
              ? `${entitlement.credits} credit(s) are held for this run and returned in full if it does not complete.`
              : 'This capability runs no provider, so it holds no credits and is free by construction.',
        }
      : null;

  const provenance = capability?.provenance
    ? [
        {
          label: 'Provenance requirement',
          detail: capability.provenance.statement,
          satisfied: plan.outcome === 'run' && capability.provenance.requiresProvenance,
        },
      ]
    : [];

  return {
    capabilityId: capability?.id ?? plan.requestedId,
    capabilityName: capability?.name ?? 'Unknown capability',
    category: capability?.category ?? 'assessment',
    state: plan.state,
    availability: capability?.availability ?? 'coming-soon',
    riskLevel: capability?.riskLevel ?? 'informational',
    modules: capability?.modules ?? [],
    summary:
      parts.summary ??
      (capability === null
        ? 'No capability is declared for this request, so nothing was run.'
        : summariseState(capability, plan.state)),
    dataQuality,
    assumptions: readiness?.assumptions ?? [],
    evidence: parts.evidence ?? [],
    calculations: parts.calculations ?? [],
    insights: parts.insights ?? [],
    risks: parts.risks ?? [],
    limitations: uniqueLimitations,
    uncertainty: parts.uncertainty ?? [],
    provenance,
    usage,
    nextActions: plan.nextActions,
    decidedBy: plan.decidedBy,
    refusedBy: plan.outcome === 'refuse' ? (plan.refusals[0]?.code ?? 'refused') : null,
    note: RESULT_NOTE,
  };
}
