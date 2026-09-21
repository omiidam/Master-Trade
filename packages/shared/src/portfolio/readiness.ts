/**
 * Portfolio readiness — the gate's second half.
 *
 * The Phase 5.3 gate (`quality/readiness.ts`) decides whether an analysis may run from
 * what the user has **declared about themselves**: their risk tolerance, their horizon,
 * their stated allocation. It cannot see a portfolio document, because a document is a
 * different input surface with its own evidence — prices, observation times,
 * provenance, currencies.
 *
 * This module is where those two readings meet, and the composition rule is the whole
 * design: **the portfolio reading may only narrow the verdict, never widen it.** A
 * document that is complete cannot make a missing risk tolerance permissible, because
 * the base gate is not re-run and not reinterpreted here — it is taken as an input. A
 * `BLOCKED` base stays `BLOCKED` whatever the document says, and the reverse is only
 * half true: a clean document can leave the base verdict where it was, never improve it.
 *
 * Why it lives in `packages/shared` rather than in the engine: it is a *decision about
 * permission to answer*, not arithmetic. The engine computes; this refuses. Keeping the
 * refusal out of the pure-math package keeps the package's determinism story clean, and
 * keeping it out of the API layer means the surface can render the same verdict the
 * server acted on — the failure mode ADR-0041 warned about, where a client is told
 * "not ready" about an analysis that ran anyway.
 *
 * Two properties worth stating because they are easy to lose:
 *
 *   1. **Every action is declared, per scope.** What a missing price *costs* depends on
 *      what was asked: a composition description survives it, a risk characterisation
 *      barely does. So the action for each code is declared in `PORTFOLIO_ISSUE_RULES`,
 *      once, in a table a reviewer can read — the same idiom the base gate uses for its
 *      requirements.
 *   2. **A question is a first-class outcome.** A document with an ambiguity the user can
 *      fix produces `REQUIRES_CLARIFICATION` with the question attached, never a
 *      decision made on the user's behalf (ADR-0041 §4, ADR-0042 §2).
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
  PORTFOLIO_ISSUE_CODES,
  PORTFOLIO_ISSUE_MEANING,
  assessPortfolioDocument,
  type Portfolio,
  type PortfolioDocumentAssessment,
  type PortfolioFinding,
  type PortfolioIssueCode,
} from './model.js';

/* ------------------------------------------------------------------ */
/* The scopes                                                          */
/* ------------------------------------------------------------------ */

/**
 * The two portfolio analyses the product declares.
 *
 * They are the base gate's own analysis types, re-stated as a narrower union so a
 * caller cannot ask for a readiness about something this module does not assess.
 */
export const PORTFOLIO_SCOPES = ['portfolio.composition', 'portfolio.risk'] as const;
export type PortfolioScopeId = (typeof PORTFOLIO_SCOPES)[number];

export function isPortfolioScope(value: string): value is PortfolioScopeId {
  return (PORTFOLIO_SCOPES as readonly string[]).includes(value);
}

export const PORTFOLIO_SCOPE_LABEL: Readonly<Record<PortfolioScopeId, string>> = {
  'portfolio.composition': 'How the portfolio is put together',
  'portfolio.risk': 'What the portfolio is exposed to',
};

export const PORTFOLIO_SCOPE_MEANING: Readonly<Record<PortfolioScopeId, string>> = {
  'portfolio.composition':
    'A description of what is held and in what proportion, computed from the composition you declared. Nothing is projected forward and no target is proposed.',
  'portfolio.risk':
    'A characterisation of the exposure the composition carries, read against the risk tolerance and horizon you declared. There is no profitability claim in it and no position sizing.',
};

/** The base gate's analysis type for a scope. They are the same by construction. */
function baseTypeOf(scope: PortfolioScopeId): string {
  return scope;
}

/* ------------------------------------------------------------------ */
/* What each finding costs, per scope                                  */
/* ------------------------------------------------------------------ */

/**
 * What a finding calls for.
 *
 * Three of the base gate's actions, plus `not-applicable` — which the base gate has no
 * need for and this table does. It is the honest answer to "what does this gap cost the
 * question that was asked" when the answer is *nothing*: a portfolio can be described
 * completely without a cost basis anywhere in it, so a cost basis that is missing is not
 * a limitation of the description. Without this value the only options would be to call
 * a complete answer "limited", or to drop the finding — and both would be wrong.
 */
export type PortfolioAction = WhenUnmet | 'not-applicable';

export interface PortfolioIssueRule {
  code: PortfolioIssueCode;
  /** For a composition description. */
  composition: PortfolioAction;
  /** For a risk characterisation — the same gap, weighed differently. */
  risk: PortfolioAction;
  /** One line a reviewer can check. */
  why: string;
}

/**
 * The table.
 *
 * Three deliberate asymmetries between the two scopes, because the same gap genuinely
 * costs different things:
 *
 *   - **A missing price does not stop a composition.** "30% in three ETFs" is a
 *     complete description of a composition with no price anywhere in it. It does stop
 *     a risk figure, which is why the same code is `limit` for one scope and `clarify`
 *     for the other.
 *   - **An incomplete valuation is a limitation, not a refusal.** Each priced position's
 *     own market value is still correct; what cannot be produced is a *share of the
 *     whole*. The honest outcome is a narrower answer with the gap named.
 *   - **An invalid value always blocks.** A malformed quantity is not a smaller quantity,
 *     and asking a question about it would be the system negotiating with a typo.
 */
export const PORTFOLIO_ISSUE_RULES: readonly PortfolioIssueRule[] = [
  {
    code: 'no-positions',
    composition: 'clarify',
    risk: 'clarify',
    why: 'A description of a composition is a description of what is in it; there is nothing to describe.',
  },
  {
    code: 'too-many-positions',
    composition: 'limit',
    risk: 'limit',
    why: 'The reading is bounded, so it covers the positions it read and says how many it did not.',
  },
  {
    code: 'duplicate-symbol',
    composition: 'clarify',
    risk: 'clarify',
    why: 'Two rows for one symbol make its size ambiguous, and the system never chooses between them.',
  },
  {
    code: 'invalid-quantity',
    composition: 'block',
    risk: 'block',
    why: 'A malformed quantity is not a smaller quantity; refreshing it would not help.',
  },
  {
    code: 'invalid-weight',
    composition: 'block',
    risk: 'block',
    why: 'A weight outside its range is not a weight.',
  },
  {
    code: 'invalid-price',
    composition: 'block',
    risk: 'block',
    why: 'A price that is not a number cannot be weighed, and re-reading it would not help.',
  },
  {
    code: 'invalid-entry-price',
    composition: 'block',
    risk: 'block',
    why: 'A malformed cost is not a cost.',
  },
  {
    code: 'unsupported-currency',
    composition: 'block',
    risk: 'block',
    why: 'The product cannot label or group a currency it does not recognise.',
  },
  {
    code: 'mixed-currency',
    composition: 'clarify',
    risk: 'clarify',
    why: 'No rate source is wired, so currencies are groups rather than a total; which one matters is a question for the user.',
  },
  {
    code: 'weight-not-whole',
    composition: 'clarify',
    risk: 'clarify',
    why: 'Weights that do not add up to a portfolio describe an ambiguity the user can resolve.',
  },
  {
    code: 'no-basis',
    composition: 'clarify',
    risk: 'clarify',
    why: 'A position with no size at all contributes to nothing, and no figure exists without one.',
  },
  {
    code: 'price-missing',
    composition: 'limit',
    risk: 'clarify',
    why: 'A composition can be described by weight alone; an exposure figure cannot.',
  },
  {
    code: 'price-stale',
    composition: 'limit',
    risk: 'clarify',
    why: 'An aged price still tells you the composition; it tells you the exposure less well.',
  },
  {
    code: 'price-undated',
    composition: 'limit',
    risk: 'limit',
    why: 'A price with no observation time is reported as undated; a question cannot supply the time.',
  },
  {
    code: 'price-unverified',
    composition: 'limit',
    risk: 'limit',
    why: 'Only a provider can attach a provenance label; a user cannot declare a series into being verified.',
  },
  {
    code: 'entry-price-missing',
    // A composition is a description of what is held, with no forward view and no
    // profit figure in it, so a missing entry price costs that description nothing.
    composition: 'not-applicable',
    risk: 'limit',
    why: 'A composition needs no cost basis; a risk characterisation is narrower for wanting one.',
  },
  {
    code: 'cost-basis-missing',
    composition: 'not-applicable',
    risk: 'limit',
    why: 'One position without a cost basis narrows the profit figure rather than invalidating it.',
  },
  {
    code: 'no-cost-basis',
    composition: 'not-applicable',
    risk: 'limit',
    why: 'With no cost basis anywhere there is no unrealised figure at all; the composition itself is unaffected.',
  },
  {
    code: 'incomplete-valuation',
    composition: 'limit',
    risk: 'limit',
    why: 'A share of the whole needs the whole, so the weights are named as the thing that is missing rather than approximated.',
  },
];

export const PORTFOLIO_ISSUE_RULE_BY_CODE: Readonly<
  Record<PortfolioIssueCode, PortfolioIssueRule>
> = Object.fromEntries(PORTFOLIO_ISSUE_RULES.map((rule) => [rule.code, rule])) as Readonly<
  Record<PortfolioIssueCode, PortfolioIssueRule>
>;

/** The action a finding calls for in a given scope. */
export function actionFor(code: PortfolioIssueCode, scope: PortfolioScopeId): PortfolioAction {
  const rule = PORTFOLIO_ISSUE_RULE_BY_CODE[code];
  return scope === 'portfolio.risk' ? rule.risk : rule.composition;
}

/**
 * The catalogue is only useful if it is complete.
 *
 * Declared here rather than in a test so it can run at boot: a new issue code added to
 * the model without a rule would otherwise resolve to `undefined` and fall through a
 * `switch` as the permissive branch — the exact shape of failure this table exists to
 * prevent.
 */
export function assertPortfolioIssueRules(
  rules: readonly PortfolioIssueRule[] = PORTFOLIO_ISSUE_RULES,
): void {
  const seen = new Set<string>();
  for (const rule of rules) {
    if (seen.has(rule.code)) throw new Error(`Duplicate portfolio issue rule: ${rule.code}`);
    seen.add(rule.code);
    if (rule.why.trim().length < 20) {
      throw new Error(`Portfolio issue rule ${rule.code} does not explain itself.`);
    }
  }
  const missing = PORTFOLIO_ISSUE_CODES.filter((code) => !seen.has(code));
  if (missing.length > 0) {
    throw new Error(
      `Portfolio issue codes with no declared action: ${missing.join(', ')}. Every code needs one, or a finding would fall through as permissible.`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* The decision                                                        */
/* ------------------------------------------------------------------ */

/** Ordering for "worse". Higher is more restrictive. */
export const READINESS_RANK: Readonly<Record<Readiness, number>> = {
  READY_FOR_ANALYSIS: 0,
  READY_WITH_LIMITATIONS: 1,
  REQUIRES_CLARIFICATION: 2,
  BLOCKED: 3,
};

export function worseReadiness(a: Readiness, b: Readiness): Readiness {
  return READINESS_RANK[a] >= READINESS_RANK[b] ? a : b;
}

export interface PortfolioReadinessRequest {
  scope: PortfolioScopeId;
  /**
   * The Phase 5.3 verdict for the same analysis type. Passed in, never recomputed and
   * never reinterpreted: this module has no access to the context, so it cannot widen
   * what the base gate allowed even by accident.
   */
  base: AnalysisReadinessDecision;
  portfolio: Portfolio;
  now: number;
}

export interface PortfolioReadinessDecision {
  scope: PortfolioScopeId;
  /** Echoed exactly as requested, so a client can see what was answered. */
  requestedType: string;
  /** Whether the capability itself exists yet, taken from the base requirement. */
  capability: 'available' | 'planned' | null;
  readiness: Readiness;
  /** The base gate's verdict, unchanged, so both layers are visible. */
  base: AnalysisReadinessDecision;
  document: PortfolioDocumentAssessment;
  /** Which rule decided the outcome, as a stable code. */
  decidedBy: string;
  /** The findings that shaped the portfolio half, worst first. */
  findings: readonly PortfolioFinding[];
  limitations: readonly string[];
  clarifications: readonly ClarificationQuestion[];
  note: string;
}

const DECISION_NOTE =
  'Readiness is the worse of two readings: what you declared about yourself, and what this document actually supports. The second can only narrow the first. No language model can change either.';

/**
 * Decide whether a portfolio analysis may run.
 *
 * Pure: the same base decision, document and clock always produce the same verdict.
 * The tiering mirrors the base gate — `block` outranks `clarify`, which outranks
 * `limit` — so a document that is both incomplete and malformed is reported as
 * malformed, which is the more useful of the two things to fix.
 */
export function assessPortfolioReadiness(
  request: PortfolioReadinessRequest,
): PortfolioReadinessDecision {
  const document = assessPortfolioDocument(request.portfolio, request.now);
  const requirement = requirementFor(baseTypeOf(request.scope));
  const limitations = [...request.base.limitations];
  const clarifications: ClarificationQuestion[] = [...request.base.clarifications];

  // Findings are ordered worst-first and then by the model's own declaration order, so
  // the same document always produces the same list in the same order.
  const rank: Record<PortfolioAction, number> = {
    block: 3,
    clarify: 2,
    limit: 1,
    'not-applicable': 0,
  };
  const ordered = [...document.findings].sort((a, b) => {
    const byAction =
      rank[actionFor(b.code, request.scope)] - rank[actionFor(a.code, request.scope)];
    if (byAction !== 0) return byAction;
    return PORTFOLIO_ISSUE_CODES.indexOf(a.code) - PORTFOLIO_ISSUE_CODES.indexOf(b.code);
  });

  let tier = 0;
  let decidedBy = 'portfolio-document-clean';
  const decide = (nextTier: 1 | 2 | 3, code: string): void => {
    // Strictly greater, so the first code in declaration order wins a tier: the
    // `decidedBy` a user sees does not depend on the order an object happened to be
    // iterated in.
    if (nextTier > tier) {
      tier = nextTier;
      decidedBy = code;
    }
  };

  for (const found of ordered) {
    const action = actionFor(found.code, request.scope);
    const field = scopeField(found);
    // A finding that costs the question nothing is still reported among the findings,
    // because the document genuinely has that gap — it is simply not a reason why this
    // answer is narrower, and saying it was would be a limitation that is not one.
    if (action === 'not-applicable') continue;
    limitations.push(`${found.detail} (${found.code})`);
    if (action === 'block') {
      decide(3, `portfolio:${found.code}`);
      continue;
    }
    if (action === 'clarify') {
      clarifications.push({
        field,
        label: FIELD_LABELS[field],
        question: clarificationFor(found.code, request.scope),
        reason: clarificationReason(found.code),
        blocking: true,
      });
      decide(2, `portfolio:${found.code}`);
      continue;
    }
    decide(1, `portfolio:${found.code}`);
  }

  const documentReadiness: Readiness =
    tier === 3
      ? 'BLOCKED'
      : tier === 2
        ? 'REQUIRES_CLARIFICATION'
        : tier === 1
          ? 'READY_WITH_LIMITATIONS'
          : 'READY_FOR_ANALYSIS';

  const readiness = worseReadiness(request.base.readiness, documentReadiness);
  // The base gate's code is kept when the base decided, so a refusal that came from the
  // context is never re-attributed to the document.
  const decided =
    READINESS_RANK[request.base.readiness] > READINESS_RANK[documentReadiness]
      ? `base:${request.base.decidedBy}`
      : documentReadiness === 'READY_FOR_ANALYSIS' &&
          request.base.readiness === 'READY_FOR_ANALYSIS'
        ? 'both-readings-clean'
        : decidedBy;

  if (!document.described && tier < 2) {
    limitations.push(
      'The portfolio holds nothing, so there is no composition for anything below to describe.',
    );
  }
  if (document.truncated) {
    limitations.push(
      `Only the first positions were read, so the description covers part of the document you declared.`,
    );
  }

  return {
    scope: request.scope,
    requestedType: request.base.requestedType,
    capability: requirement?.capability ?? request.base.capability,
    readiness,
    base: request.base,
    document,
    decidedBy: decided,
    findings: ordered,
    limitations,
    clarifications,
    note: DECISION_NOTE,
  };
}

/**
 * The field an issue is reported against.
 *
 * The base gate's own vocabulary is reused rather than extended: every portfolio
 * finding is about the declared input `holdings`, because that is what a portfolio
 * document *is* in the product's own terms. Inventing a second field vocabulary would
 * mean the surface had to learn it, and the two would eventually name different things.
 */
/** The declared input a portfolio finding is about. A `FieldKey`, so its label is typed. */
const PORTFOLIO_FIELD: FieldKey = 'holdings';

function scopeField(found: PortfolioFinding): FieldKey {
  void found;
  return PORTFOLIO_FIELD;
}

function clarificationReason(code: PortfolioIssueCode): ClarificationQuestion['reason'] {
  switch (code) {
    case 'no-positions':
    case 'no-basis':
      return 'missing';
    case 'price-stale':
      return 'stale';
    case 'duplicate-symbol':
    case 'mixed-currency':
    case 'weight-not-whole':
      return 'conflicting';
    default:
      return 'missing';
  }
}

/**
 * The question, in the product's own words.
 *
 * Written here rather than derived from the finding's detail, for the same reason the
 * base gate keeps its questions in one table: a question is what the user is asked, and
 * it has to read as a question. It never repeats a value and never contains prose the
 * user wrote.
 */
export function clarificationFor(code: PortfolioIssueCode, _scope: PortfolioScopeId): string {
  const meaning = PORTFOLIO_ISSUE_MEANING[code];
  switch (code) {
    case 'no-positions':
      return 'Which positions does the portfolio hold? Nothing can be described until the composition is declared.';
    case 'no-basis':
      return 'At least one position declares no size at all. Should it carry a share of the portfolio, or a quantity and a price?';
    case 'duplicate-symbol':
      return 'The same symbol is declared more than once. Are those two positions, or one that was entered twice?';
    case 'mixed-currency':
      return 'The positions are declared in more than one currency and no rate source is wired. Which currency should the description be reported in?';
    case 'weight-not-whole':
      return 'The declared shares do not add up to a whole portfolio. Are the weights meant to cover every position you hold, or only the ones listed?';
    case 'price-missing':
      return 'At least one position has no current price. Without one, its market value cannot be computed — do you have a price you can supply?';
    case 'price-stale':
      return 'Some prices are older than the window this product treats as current. Should the characterisation rest on them, or wait for a fresher price?';
    case 'price-undated':
      return 'A price arrived without an observation time, so its age cannot be established. Do you know when it was observed?';
    case 'price-unverified':
      return 'A price arrived without provenance the product can weigh. Only a provider can supply that label — should this figure wait for one?';
    case 'incomplete-valuation':
      return 'Not every position can be priced, so no share of the whole portfolio can be computed. Should the description stay at declared shares, or wait for the missing prices?';
    case 'no-cost-basis':
    case 'cost-basis-missing':
      return 'Without a cost basis there is no unrealised profit figure. Do you have the average entry prices to supply?';
    case 'entry-price-missing':
      return 'At least one position has a quantity but no average entry price, so its cost basis is unknown. What was the entry price?';
    default:
      return `${meaning} What would correct it?`;
  }
}
