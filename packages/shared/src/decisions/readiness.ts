/**
 * Evaluation readiness — the gate's third reading.
 *
 * Phase 5.3's gate (`quality/readiness.ts`) decides whether an analysis may run from what the
 * user has **declared about themselves**. Phase 5.5 added a second reading for what a *document*
 * supports (`portfolio/readiness.ts`). This module is the third, and it is the one an
 * evaluation needs, because an evaluation has two inputs that live in two different places:
 * the context, which says what a figure would *mean* for this person, and the decision record,
 * which says what the figure would be *computed from*.
 *
 * The composition rule is the same one, and it is the whole design: **the record's reading may
 * only narrow the context's verdict, never widen it.** A base gate that returned `BLOCKED`
 * stays blocked whatever the prices look like, because the base gate is an input here and is
 * not re-run. Every rule in the table below is a narrowing.
 *
 * Three things this module adds that the earlier two did not need:
 *
 *   1. **A fifth verdict.** `INCOMPLETE_OUTCOME_DATA` says something the other four cannot:
 *      the record supports an evaluation of its *input* side and of nothing else. An executed
 *      decision with an entry price and no exit is not "ready with limitations" — there is no
 *      outcome to read — and it is not "blocked" either, because the entry side is real and the
 *      engine produces it. Naming the state is the honest alternative to calling it either of
 *      the two neighbours it sits between.
 *   2. **A `not-applicable` action.** The base gate's three actions all describe ways an input
 *      costs something. Some decision findings cost the evaluation *nothing* — a missing
 *      rationale is a gap in the record, not in the arithmetic — so the table needs a value that
 *      means "reported, and not a limitation of this answer". Without it the only options would
 *      be to invent a limitation or to drop the finding, and both would be wrong.
 *   3. **Questions the user can actually answer.** A missing entry price is a record defect, and
 *      the person who wrote the record is the one who can fix it — so it becomes a question
 *      rather than a refusal. A malformed one is a contradiction, and a question cannot fix it.
 *
 * Why this lives in `packages/shared` rather than in the engine: it decides *permission to
 * answer*, not arithmetic. The engine computes; this refuses, and the surface renders the same
 * verdict the server acted on.
 */

import { FIELD_LABELS, type FieldKey } from '../profile/model.js';
import {
  requirementFor,
  type AnalysisReadinessDecision,
  type ClarificationQuestion,
  type Readiness,
  type WhenUnmet,
} from '../quality/readiness.js';
import {
  DECISION_ISSUE_CODES,
  assessDecision,
  type DecisionAssessment,
  type DecisionIssueCode,
  type DecisionRecord,
  type Finding,
} from './model.js';

/* ------------------------------------------------------------------ */
/* The scope                                                           */
/* ------------------------------------------------------------------ */

/**
 * The one declared capability this module assesses.
 *
 * It is the base gate's own analysis type, re-stated so a caller cannot ask for a readiness
 * about something this module does not assess. There is exactly one, deliberately: an
 * evaluation is an evaluation, and a second scope would have to differ in how it weighs a
 * missing price, which no arithmetic here does.
 */
export const DECISION_SCOPE = 'decision.evaluation' as const;
export type DecisionScopeId = typeof DECISION_SCOPE;

export const DECISION_SCOPE_LABEL = 'Evaluate a recorded decision';
export const DECISION_SCOPE_MEANING =
  'Measure what happened to a decision you recorded, from the prices on the record, and say plainly which parts of it cannot be measured at all.';

/* ------------------------------------------------------------------ */
/* What each finding costs                                             */
/* ------------------------------------------------------------------ */

/**
 * What a finding calls for.
 *
 * `not-applicable` and `incomplete-outcome` are this module's own additions to the base gate's
 * `clarify | limit | block`, and each exists because one of the three would be a lie:
 *
 *   - `not-applicable` — the record genuinely has this gap, and it is not a reason why this
 *     answer is narrower. A missing rationale is the case that matters most: quantifying a
 *     decision never reads it.
 *   - `incomplete-outcome` — the evaluation runs, and its outcome half does not exist. Calling
 *     that a limitation would understate it (there is no figure), and calling it a refusal
 *     would overstate it (the input side is computed and shown).
 */
export type DecisionAction = WhenUnmet | 'not-applicable' | 'incomplete-outcome';

export interface DecisionIssueRule {
  code: DecisionIssueCode;
  action: DecisionAction;
  /** One line a reviewer can check. */
  why: string;
}

/**
 * The table.
 *
 * Read it as a statement of what an evaluation survives. A malformed record blocks, because the
 * arithmetic would have to guess which of two contradictory claims was meant. A *missing*
 * measurement asks, because the person who wrote the record is the one who has it, and asking is
 * cheaper than an answer built on a substitute. An aged measurement narrows, because a stale
 * price is still a price — it is just a weaker one, and the figure says so.
 *
 * Two entries are worth reading twice:
 *
 *   - `entry-price-missing` is a **question**, not a refusal. Nothing can be computed without it,
 *     and it is the one input no substitute may stand in for (ADR-0041 §5) — but it is also
 *     something the user can simply supply, so refusing outright would be unhelpful rather than
 *     safe.
 *   - `kind-hypothetical-with-execution` and `mixed-currency` are **refusals**, and neither is
 *     answerable. A record that claims two incompatible things cannot be evaluated as either,
 *     and a figure spanning two currencies with no rate source is not a weaker figure — it is a
 *     meaningless one.
 */
export const DECISION_ISSUE_RULES: readonly DecisionIssueRule[] = [
  /* ---- the record's own shape ---- */
  {
    code: 'no-decision-scope',
    action: 'block',
    why: 'A decision naming neither a portfolio nor a symbol has no subject, so there is nothing to measure.',
  },
  {
    code: 'unknown-symbol',
    action: 'limit',
    why: 'The figures come from the prices on the record, so an unrecognised symbol narrows what the outcome can be attributed to rather than the arithmetic itself.',
  },
  {
    code: 'no-timestamp',
    action: 'block',
    why: 'Without an instant the record has no place in time: no window, no holding period and no ordering against the outcome.',
  },
  {
    code: 'decided-in-future',
    action: 'block',
    why: 'A decision dated after the observation time cannot have an outcome, and reporting one would be a claim about the future.',
  },

  /* ---- what the record claims about itself ---- */
  {
    code: 'kind-executed-without-price',
    action: 'block',
    why: 'The record says it was carried out and gives no price. Inventing one would fabricate the result, which is the single thing this layer exists to prevent.',
  },
  {
    code: 'kind-hypothetical-with-execution',
    action: 'block',
    why: 'A scenario and an execution are two different claims; until one is withdrawn there is no way to know which reading is the honest one.',
  },
  {
    code: 'no-rationale',
    action: 'not-applicable',
    why: 'Nothing measured here reads the rationale. It is reported because the record has the gap, and it costs this evaluation nothing.',
  },
  {
    code: 'no-expectation',
    action: 'limit',
    why: 'What the user expected is the yardstick the outcome is compared against, so without it the comparison cannot be made — the outcome itself still can.',
  },

  /* ---- prices and their evidence ---- */
  {
    code: 'invalid-entry-price',
    action: 'block',
    why: 'The entry is the origin every figure is measured from. A malformed one means there is no origin and no figure.',
  },
  {
    code: 'invalid-exit-price',
    action: 'limit',
    why: 'An unusable exit leaves the input side intact and the outcome unmeasurable from it, which is exactly what the readiness verdict records.',
  },
  {
    code: 'entry-price-missing',
    action: 'clarify',
    why: 'No substitute may stand in for the entry price, and the person who recorded the decision is the person who has it — so it is asked for rather than refused.',
  },
  {
    code: 'exit-price-missing',
    action: 'incomplete-outcome',
    why: 'The position is still open as far as the record shows, so an unrealised mark or nothing at all — and either way the outcome half is the half that is missing.',
  },
  {
    code: 'price-undated',
    action: 'clarify',
    why: 'An observation time cannot be recovered by the platform, but its author knows it; the age of a figure is not something to guess at.',
  },
  {
    code: 'price-stale',
    action: 'limit',
    why: 'An aged price is still a price: it is a weaker basis for the figure, and the figure carries that weakness rather than being withheld.',
  },
  {
    code: 'price-unverified',
    action: 'limit',
    why: 'A hand-entered price is the user’s own declaration. It is usable and it is unverified, and those are two facts that travel together.',
  },

  /* ---- risk parameters ---- */
  {
    code: 'no-risk-parameter',
    action: 'limit',
    why: 'A return needs no risk parameter; an R multiple does. So the outcome is reported in percent and the R is named as the thing that is absent.',
  },
  {
    code: 'invalid-risk-parameter',
    action: 'limit',
    why: 'A planned risk outside its declared bounds is not a risk parameter, so the R multiple is withheld while the return stands.',
  },
  {
    code: 'stop-outside-entry',
    action: 'limit',
    why: 'A stop on the wrong side of the entry is not a stop, so the risk figure it would have justified does not exist; the outcome is unaffected.',
  },
  {
    code: 'target-outside-entry',
    action: 'limit',
    why: 'A target on the wrong side is a malformed plan, and it narrows the comparison with what was planned rather than the measurement of what happened.',
  },

  /* ---- the period ---- */
  {
    code: 'period-not-elapsed',
    action: 'limit',
    why: 'A window that ended before the decision is empty rather than absent, and the figures from the record still stand.',
  },
  {
    code: 'period-invalid',
    action: 'limit',
    why: 'An unreadable window costs the holding period and the horizon comparison, not the return.',
  },
  {
    code: 'period-too-short',
    action: 'limit',
    why: 'A short window is the limitation this product is most explicit about: it can say what happened and not what it means about the method.',
  },
  {
    code: 'horizon-mismatch',
    action: 'limit',
    why: 'The window measured may be shorter than the horizon declared, which narrows what the outcome can be read as evidence for.',
  },

  /* ---- outcome data ---- */
  {
    code: 'outcome-missing',
    action: 'incomplete-outcome',
    why: 'Neither an exit nor a mark was recorded, so there is no second end to measure to and no outcome to report — only the input side.',
  },
  {
    code: 'outcome-stale',
    action: 'limit',
    why: 'An aged mark is an outcome as of an older instant, which is reported with its age rather than replaced by a fresher figure nobody supplied.',
  },
  {
    code: 'outcome-unverified',
    action: 'limit',
    why: 'The mark is the user’s own declaration, so it is usable and unverified, and the figure carries both.',
  },

  /* ---- currency ---- */
  {
    code: 'mixed-currency',
    action: 'block',
    why: 'With no rate source wired, a single figure across two currencies is not a weaker number — it is a meaningless one, and a question can fix it.',
  },
  {
    code: 'unsupported-currency',
    action: 'block',
    why: 'A currency the product does not recognise cannot be reported in at all, so nothing can be produced until it is corrected.',
  },

  /* ---- context ---- */
  {
    code: 'no-market-context',
    action: 'not-applicable',
    why: 'Market conditions are what the outcome would be read *in*, never what it is computed from — so the evaluation survives their absence.',
  },
  {
    code: 'conflicting-records',
    action: 'block',
    why: 'Two records that disagree about the same decision cannot be evaluated as one, and picking either would be a choice made on the user’s behalf.',
  },
];

export const DECISION_ISSUE_RULE_BY_CODE: Readonly<Record<DecisionIssueCode, DecisionIssueRule>> =
  Object.fromEntries(DECISION_ISSUE_RULES.map((rule) => [rule.code, rule])) as Readonly<
    Record<DecisionIssueCode, DecisionIssueRule>
  >;

/** The action a finding calls for. */
export function actionFor(code: DecisionIssueCode): DecisionAction {
  return DECISION_ISSUE_RULE_BY_CODE[code].action;
}

/**
 * The catalogue is only useful if it is complete.
 *
 * Declared here rather than in a test so it can run at boot: a code added to the model without a
 * rule would resolve to `undefined` and fall through a `switch` as the permissive branch — the
 * exact shape of failure this table exists to prevent.
 */
export function assertDecisionIssueRules(
  rules: readonly DecisionIssueRule[] = DECISION_ISSUE_RULES,
): void {
  const seen = new Set<string>();
  for (const rule of rules) {
    if (seen.has(rule.code)) throw new Error(`Duplicate decision issue rule: ${rule.code}`);
    seen.add(rule.code);
    if (rule.why.trim().length < 20) {
      throw new Error(`Decision issue rule ${rule.code} does not explain itself.`);
    }
  }
  const missing = DECISION_ISSUE_CODES.filter((code) => !seen.has(code));
  if (missing.length > 0) {
    throw new Error(
      `Decision issue codes with no declared action: ${missing.join(', ')}. Every code needs one, or a finding would fall through as permissible.`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* The verdict                                                         */
/* ------------------------------------------------------------------ */

/**
 * What an evaluation may be.
 *
 * Four of the five values are the base gate's, so a surface learns one vocabulary rather than
 * two. The fifth is this module's, and the ordering below is the statement that matters: more
 * restrictive means less of the answer exists. `INCOMPLETE_OUTCOME_DATA` sits between a
 * limitation and a question because that is literally what it is — a report whose input half is
 * complete and whose outcome half is absent.
 */
export type EvaluationReadiness =
  | 'READY_FOR_EVALUATION'
  | 'READY_WITH_LIMITATIONS'
  | 'INCOMPLETE_OUTCOME_DATA'
  | 'REQUIRES_CLARIFICATION'
  | 'BLOCKED';

export const EVALUATION_READINESS_LABEL: Readonly<Record<EvaluationReadiness, string>> = {
  READY_FOR_EVALUATION: 'Ready for evaluation',
  READY_WITH_LIMITATIONS: 'Ready with limitations',
  INCOMPLETE_OUTCOME_DATA: 'Input side only — the outcome is not recorded',
  REQUIRES_CLARIFICATION: 'Requires clarification',
  BLOCKED: 'Cannot be evaluated',
};

export const EVALUATION_READINESS_MEANING: Readonly<Record<EvaluationReadiness, string>> = {
  READY_FOR_EVALUATION: 'Both ends of the decision are recorded well enough to measure.',
  READY_WITH_LIMITATIONS:
    'The evaluation runs, and it must carry the limitations below with it. Every figure says what it rests on.',
  INCOMPLETE_OUTCOME_DATA:
    'There is no exit price and no current mark, so nothing can be said about what happened. What the decision recorded about its own input is still shown, because that part is real.',
  REQUIRES_CLARIFICATION:
    'The evaluation will not be produced until the questions below are answered. Nothing is assumed in their place.',
  BLOCKED:
    'No evaluation can be produced from this record, and no assumption would make one honest. The reasons are listed.',
};

/** Ordering for "worse". Higher is more restrictive, and more restrictive means less exists. */
export const EVALUATION_READINESS_RANK: Readonly<Record<EvaluationReadiness, number>> = {
  READY_FOR_EVALUATION: 0,
  READY_WITH_LIMITATIONS: 1,
  INCOMPLETE_OUTCOME_DATA: 2,
  REQUIRES_CLARIFICATION: 3,
  BLOCKED: 4,
};

export function worseEvaluationReadiness(
  a: EvaluationReadiness,
  b: EvaluationReadiness,
): EvaluationReadiness {
  return EVALUATION_READINESS_RANK[a] >= EVALUATION_READINESS_RANK[b] ? a : b;
}

/**
 * The base gate's verdict, re-expressed in this vocabulary.
 *
 * `Readiness` and `EvaluationReadiness` differ by exactly one value, and this is the only place
 * the two meet, so the mapping is total by construction rather than by a cast.
 */
export function fromBaseReadiness(readiness: Readiness): EvaluationReadiness {
  switch (readiness) {
    case 'READY_FOR_ANALYSIS':
      return 'READY_FOR_EVALUATION';
    case 'READY_WITH_LIMITATIONS':
      return 'READY_WITH_LIMITATIONS';
    case 'REQUIRES_CLARIFICATION':
      return 'REQUIRES_CLARIFICATION';
    case 'BLOCKED':
      return 'BLOCKED';
  }
}

/* ------------------------------------------------------------------ */
/* The gate                                                            */
/* ------------------------------------------------------------------ */

export interface DecisionReadinessRequest {
  decision: DecisionRecord;
  /**
   * The Phase 5.3 verdict for `decision.evaluation`. Passed in, never recomputed and never
   * reinterpreted: this module has no access to the context, so it cannot widen what the base
   * gate allowed even by accident.
   */
  base: AnalysisReadinessDecision;
  now: number;
}

export interface DecisionReadinessDecision {
  decisionId: string;
  /** Echoed exactly as requested, so a client can see what was answered. */
  requestedType: string;
  /** Whether the capability itself exists yet, taken from the base requirement. */
  capability: 'available' | 'planned' | null;
  readiness: EvaluationReadiness;
  /** The base gate's verdict, unchanged, so both layers are visible. */
  base: AnalysisReadinessDecision;
  /** The record's own reading, so a surface can render findings and field states from one object. */
  assessment: DecisionAssessment;
  /** Which rule decided the outcome, as a stable code. */
  decidedBy: string;
  /** The findings that shaped this half, worst first. */
  findings: readonly Finding[];
  limitations: readonly string[];
  clarifications: readonly ClarificationQuestion[];
  note: string;
}

const DECISION_NOTE =
  'Readiness is the worse of two readings: what you declared about yourself, and what this record actually supports. The second can only narrow the first. Nothing here is inferred, and no language model can change either.';

/** Whether a field the record declares is usable, read from the assessment rather than re-parsed. */
function fieldUsable(assessment: DecisionAssessment, field: string): boolean {
  const state = assessment.fields.find((entry) => entry.field === field);
  return state !== undefined && state.usable;
}

/**
 * Decide whether a decision may be evaluated.
 *
 * Pure: the same base decision, record and clock always produce the same verdict. The tiering
 * mirrors the other two gates — `block` outranks `clarify`, which outranks the two narrowing
 * outcomes — so a record that is both malformed and incomplete is reported as malformed, which
 * is the more useful of the two things to fix.
 */
export function assessDecisionReadiness(
  request: DecisionReadinessRequest,
): DecisionReadinessDecision {
  const assessment = assessDecision(request.decision, request.now);
  const requirement = requirementFor(DECISION_SCOPE);
  const limitations = [...request.base.limitations];
  const clarifications: ClarificationQuestion[] = [...request.base.clarifications];

  // Findings are ordered worst-first and then by the model's own declaration order, so the same
  // record always produces the same list in the same order.
  const rank: Record<DecisionAction, number> = {
    block: 4,
    clarify: 3,
    'incomplete-outcome': 2,
    limit: 1,
    'not-applicable': 0,
  };
  const ordered = [...assessment.findings].sort((a, b) => {
    const byAction = rank[actionFor(b.code)] - rank[actionFor(a.code)];
    if (byAction !== 0) return byAction;
    return DECISION_ISSUE_CODES.indexOf(a.code) - DECISION_ISSUE_CODES.indexOf(b.code);
  });

  let tier = 0;
  let decidedBy = 'decision-record-clean';
  const decide = (nextTier: 1 | 2 | 3 | 4, code: string): void => {
    // Strictly greater, so the first code in declaration order wins a tier: the `decidedBy` a
    // user sees does not depend on the order an object happened to be iterated in.
    if (nextTier > tier) {
      tier = nextTier;
      decidedBy = code;
    }
  };

  for (const found of ordered) {
    const action = actionFor(found.code);
    // A finding that costs this question nothing is still reported among the findings, because
    // the record genuinely has that gap — it is simply not a reason why this evaluation is
    // narrower, and saying it was would be a limitation that is not one.
    if (action === 'not-applicable') continue;
    limitations.push(`${found.detail} (${found.code})`);
    if (action === 'block') {
      decide(4, `decision:${found.code}`);
      continue;
    }
    if (action === 'clarify') {
      clarifications.push({
        field: FIELD_OF[found.code],
        label: FIELD_LABELS[FIELD_OF[found.code]],
        question: clarificationFor(found.code),
        reason: clarificationReason(found.code),
        blocking: true,
      });
      decide(3, `decision:${found.code}`);
      continue;
    }
    if (action === 'incomplete-outcome') {
      decide(2, `decision:${found.code}`);
      continue;
    }
    decide(1, `decision:${found.code}`);
  }

  // The record's own half, before the base gate is folded in.
  const recordReadiness: EvaluationReadiness =
    tier === 4
      ? 'BLOCKED'
      : tier === 3
        ? 'REQUIRES_CLARIFICATION'
        : tier === 2
          ? 'INCOMPLETE_OUTCOME_DATA'
          : tier === 1
            ? 'READY_WITH_LIMITATIONS'
            : 'READY_FOR_EVALUATION';

  const base = fromBaseReadiness(request.base.readiness);
  const readiness = worseEvaluationReadiness(base, recordReadiness);

  /**
   * A structural backstop, and the one place this module overrules its table.
   *
   * `assessDecision` already raises `exit-price-missing` or `outcome-missing` for a record with
   * no second end, so the table reaches this verdict on its own. This stands behind it because
   * the claim "there is no outcome to report" is a *fact about the fields*, and a fact that
   * determines a user-facing verdict should be checkable against the fields rather than trusted
   * to a table staying complete. It can only ever narrow: a record with no usable end is never
   * reported as ready.
   */
  const entryUsable = fieldUsable(assessment, 'entryPrice');
  const outcomeUsable =
    fieldUsable(assessment, 'exitPrice') || fieldUsable(assessment, 'markPrice');
  const structurallyIncomplete = assessment.evaluable && entryUsable && !outcomeUsable;

  const finalReadiness =
    structurallyIncomplete && EVALUATION_READINESS_RANK[readiness] < 2
      ? 'INCOMPLETE_OUTCOME_DATA'
      : readiness;

  if (structurallyIncomplete && EVALUATION_READINESS_RANK[readiness] < 2) {
    decidedBy = 'decision:no-usable-outcome-end';
    limitations.push(
      'The record has an entry and no second end — no exit price and no current mark — so the outcome cannot be measured from it. The entry side is still reported, because that part was recorded.',
    );
  }

  // The base gate's code is kept when the base decided, so a refusal that came from the context
  // is never re-attributed to the record.
  const decided =
    EVALUATION_READINESS_RANK[base] > EVALUATION_READINESS_RANK[recordReadiness]
      ? `base:${request.base.decidedBy}`
      : base === 'READY_FOR_EVALUATION' && recordReadiness === 'READY_FOR_EVALUATION'
        ? 'both-readings-clean'
        : decidedBy;

  return {
    decisionId: request.decision.id,
    requestedType: request.base.requestedType,
    capability: requirement?.capability ?? request.base.capability,
    readiness: finalReadiness,
    base: request.base,
    assessment,
    decidedBy: decided,
    findings: ordered,
    limitations,
    clarifications,
    note: DECISION_NOTE,
  };
}

/* ------------------------------------------------------------------ */
/* Fields and questions                                                */
/* ------------------------------------------------------------------ */

/**
 * The declared input a decision finding is reported against.
 *
 * The base gate's vocabulary is reused rather than extended. A decision record is not one of its
 * declared inputs, so each finding is attributed to the *profile* field that would put it in
 * proportion — a risk-parameter finding is about a risk profile, a period finding about a
 * horizon. Inventing a second field vocabulary would mean the surface had to learn it, and the
 * two would eventually name different things.
 */
const FIELD_OF: Readonly<Record<DecisionIssueCode, FieldKey>> = {
  'no-decision-scope': 'holdings',
  'unknown-symbol': 'instruments',
  'no-timestamp': 'holdings',
  'decided-in-future': 'holdings',
  'kind-executed-without-price': 'holdings',
  'kind-hypothetical-with-execution': 'holdings',
  'no-rationale': 'holdings',
  'no-expectation': 'learningGoals',
  'invalid-entry-price': 'holdings',
  'invalid-exit-price': 'holdings',
  'entry-price-missing': 'holdings',
  'exit-price-missing': 'holdings',
  'price-undated': 'holdings',
  'price-stale': 'holdings',
  'price-unverified': 'holdings',
  'no-risk-parameter': 'riskTolerance',
  'invalid-risk-parameter': 'riskTolerance',
  'stop-outside-entry': 'riskTolerance',
  'target-outside-entry': 'riskTolerance',
  'period-not-elapsed': 'horizon',
  'period-invalid': 'horizon',
  'period-too-short': 'horizon',
  'horizon-mismatch': 'horizon',
  'outcome-missing': 'holdings',
  'outcome-stale': 'holdings',
  'outcome-unverified': 'holdings',
  'mixed-currency': 'holdings',
  'unsupported-currency': 'holdings',
  'no-market-context': 'markets',
  'conflicting-records': 'holdings',
};

function clarificationReason(code: DecisionIssueCode): ClarificationQuestion['reason'] {
  switch (code) {
    case 'price-stale':
    case 'outcome-stale':
      return 'stale';
    case 'mixed-currency':
    case 'unsupported-currency':
    case 'kind-hypothetical-with-execution':
      return 'conflicting';
    default:
      return 'missing';
  }
}

/**
 * The question, in the product's own words.
 *
 * Written here rather than derived from the finding's detail, for the same reason the other two
 * gates keep their questions in one table: a question is what the user is asked, and it has to
 * read as a question. It never repeats a value and never contains prose the user wrote.
 */
export function clarificationFor(code: DecisionIssueCode): string {
  switch (code) {
    case 'entry-price-missing':
      return 'This record has no entry price, and no substitute may stand in for it. What price was the decision made at?';
    case 'price-undated':
      return 'A price on this record arrived without an observation time, so its age cannot be established. When was it observed?';
    case 'mixed-currency':
      return 'This record mentions more than one currency and no rate source is wired, so a single figure across them would be meaningless. Which currency should the evaluation be reported in?';
    case 'unsupported-currency':
      return 'A currency on this record is not one this product recognises. Which currency was the decision denominated in?';
    case 'kind-hypothetical-with-execution':
      return 'This record is marked as a scenario and carries an execution price. Those are two different claims — which one describes what actually happened?';
    case 'price-stale':
      return 'Some prices on this record are older than the window this product treats as current. Should the evaluation rest on them, or do you have a fresher price?';
    case 'outcome-stale':
      return 'The current mark is older than the window this product treats as current. Should the outcome be reported as of that instant, or do you have a fresher mark?';
    default:
      return 'This record needs an input it does not have. What would correct it?';
  }
}
