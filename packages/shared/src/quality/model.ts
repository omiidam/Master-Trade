/**
 * Input quality — the domain model.
 *
 * This module answers one question: **can this input be relied on, and for
 * what?** It is the layer ADR-0041 asked for, made concrete: a declaration of
 * what a capability requires, a deterministic evaluation of what is actually
 * there, and a vocabulary for saying exactly what is wrong with it.
 *
 * It is pure. No clock of its own, no database, no network, no provider — every
 * function takes `now` and a document and returns a value. That is what makes
 * "do not use arbitrary numerical scores" and "the LLM cannot override
 * deterministic validation" enforceable rather than aspirational: there is one
 * implementation, it is a function, and a test can call it.
 *
 * Four rules, and they are the whole point of the phase:
 *
 *   1. **Nothing is invented.** A missing value stays missing. The model never
 *      fills a blank, never infers a risk tolerance, and never treats more input
 *      as better input (ADR-0041 §7).
 *   2. **Every verdict is explained.** An issue names a code, the dimension it
 *      belongs to, the field it concerns and a safe, already-worded detail. No
 *      issue carries user text: a constraint the user wrote is counted, never
 *      quoted, so an assessment can be logged as it stands.
 *   3. **Severity is declared, not scored.** There is deliberately no 0–100
 *      number. A score invites a threshold, a threshold invites tuning, and a
 *      tuned score is a product decision hidden in a constant. Every count here
 *      has a name and a stated meaning.
 *   4. **Absent is not the same as invalid, and neither is the same as stale.**
 *      They are three different findings with three different remedies, so they
 *      are three different severities.
 *
 * What this module deliberately does **not** do: decide whether an analysis may
 * run (`./readiness.ts` owns that), compute anything about a portfolio, or judge
 * whether the user's stated preferences are wise. A declaration that two values
 * cannot both be true is consistency. An opinion about whether the user chose
 * well is not a thing this system has.
 */

import {
  FIELD_KEYS,
  FIELD_LABELS,
  HARDLINE_CONSTRAINT_PATTERN,
  MAX_HOLDINGS,
  MAX_INSTRUMENTS,
  MAX_WEIGHT_PERCENT,
  REQUIRED_FIELDS,
  SYMBOL_PATTERN,
  WEIGHT_SUM_TOLERANCE,
  ageInDays,
  detectContradictions,
  fieldStatus,
  type ContextField,
  type ContextStatus,
  type FactSource,
  type FieldKey,
  type TradingContext,
} from '../profile/model.js';
import type { DataProvenance } from '../marketdata/provider.js';

/* ------------------------------------------------------------------ */
/* Dimensions                                                          */
/* ------------------------------------------------------------------ */

/**
 * The eight things "input quality" means. Each is a question, and the label is
 * the question, because a dimension whose meaning is not stated is a dimension
 * two people will read differently.
 */
export type QualityDimension =
  | 'completeness'
  | 'validity'
  | 'consistency'
  | 'reliability'
  | 'freshness'
  | 'relevance'
  | 'confidence'
  | 'provenance';

export const QUALITY_DIMENSIONS: readonly QualityDimension[] = [
  'completeness',
  'validity',
  'consistency',
  'reliability',
  'freshness',
  'relevance',
  'confidence',
  'provenance',
];

export const DIMENSION_QUESTION: Readonly<Record<QualityDimension, string>> = {
  completeness: 'Is every input this analysis requires actually present?',
  validity: 'Is each present value a well-formed value of its declared kind?',
  consistency: 'Do the values agree with each other?',
  reliability: 'How was each value obtained, and how far does that support using it?',
  freshness: 'Is each value current against the window that belongs to its kind?',
  relevance: 'Is this input the one the analysis needs, at the granularity it needs?',
  confidence: 'What is the weakest of the required inputs, taken as a minimum?',
  provenance: 'Can we point at where each input came from?',
};

/** One dimension's verdict. Four states, no number. */
export type DimensionVerdict = 'ok' | 'impaired' | 'failed' | 'not-applicable';

/** A verdict, the question it answers, and the codes behind it. */
export interface DimensionAssessment {
  dimension: QualityDimension;
  question: string;
  verdict: DimensionVerdict;
  /**
   * The issue codes behind this verdict.
   *
   * Empty for `confidence`, which is a **roll-up** of the others rather than an
   * observation of its own, and for `relevance` in a context-level report, where no
   * capability has been named and relevance is therefore not a question that can be
   * answered yet.
   */
  codes: readonly QualityIssueCode[];
}

export const DIMENSION_VERDICT_LABEL: Readonly<Record<DimensionVerdict, string>> = {
  ok: 'Sound',
  impaired: 'Impaired',
  failed: 'Failed',
  'not-applicable': 'Not applicable',
};

/* ------------------------------------------------------------------ */
/* Issues                                                              */
/* ------------------------------------------------------------------ */

/**
 * Every way an input can be unsuitable. A closed set, because an open set of
 * strings cannot be translated, counted or tested.
 */
export type QualityIssueCode =
  /* completeness */
  | 'missing-required'
  | 'missing-helpful'
  | 'unavailable-input'
  /* validity */
  | 'not-a-number'
  | 'non-finite-number'
  | 'negative-value'
  | 'out-of-range'
  | 'unknown-token'
  | 'malformed-symbol'
  | 'empty-list'
  | 'duplicate-entry'
  | 'constraint-is-instruction'
  | 'unsupported-market'
  | 'unsupported-timeframe'
  /* consistency */
  | 'conflicting-declarations'
  | 'allocation-exceeds-portfolio'
  | 'risk-horizon-tension'
  /* freshness */
  | 'stale-value'
  /* confidence */
  | 'assumed-value'
  /* provenance */
  | 'undated-claim'
  | 'missing-provenance'
  | 'untrusted-provenance';

/**
 * What the finding means for the analysis.
 *
 * Ordered by increasing tolerance, and the order is the classification
 * precedence: a set that fails validity is `INVALID` even if it is also stale.
 */
export type QualitySeverity =
  /** The value cannot be used at all: it is not a value. */
  | 'blocking'
  /** Two declarations cannot both be true; the user resolves it. */
  | 'conflicting'
  /** A required input is absent (or only assumed, which is the same thing here). */
  | 'missing'
  /** The value was usable and has aged out; it needs refreshing. */
  | 'stale'
  /** We cannot say where it came from, so we cannot weigh it. */
  | 'unverified'
  /** Worth knowing, changes nothing. */
  | 'advisory';

export const SEVERITY_ORDER: Readonly<Record<QualitySeverity, number>> = {
  blocking: 6,
  conflicting: 5,
  missing: 4,
  stale: 3,
  unverified: 2,
  advisory: 1,
};

export const SEVERITY_LABEL: Readonly<Record<QualitySeverity, string>> = {
  blocking: 'Invalid',
  conflicting: 'Conflicting',
  missing: 'Missing',
  stale: 'Outdated',
  unverified: 'Unverified',
  advisory: 'Note',
};

/** Which input an issue concerns. Constrained: a free-form field name is not a thing. */
export type InputRef = FieldKey | 'marketData';

/**
 * One finding.
 *
 * `detail` is written by the code that raises the issue, in the system's own
 * words, and never includes a value the user supplied. That is the property that
 * lets an assessment be logged verbatim: there is no field here a user statement
 * could travel in.
 */
export interface QualityIssue {
  code: QualityIssueCode;
  severity: QualitySeverity;
  dimension: QualityDimension;
  field: InputRef;
  /** Safe, already-worded, and free of user-supplied text. */
  detail: string;
}

function issue(
  code: QualityIssueCode,
  severity: QualitySeverity,
  dimension: QualityDimension,
  field: InputRef,
  detail: string,
): QualityIssue {
  return { code, severity, dimension, field, detail };
}

/* ------------------------------------------------------------------ */
/* Representations — what a value looks like outside the store          */
/* ------------------------------------------------------------------ */

/** Why a value is not reproduced. Both reasons are about prose or per-row detail. */
export type WithheldReason = 'free-text' | 'per-position-detail';

/**
 * How an input is described in an assessment.
 *
 * A declaration is often personal — a constraint is a sentence the user wrote, an
 * allocation names positions. The assessment is loggable and displayable, so it
 * carries a **shape**, not a transcript: a constrained token, a count, an
 * aggregate, or an explicit statement that the content is withheld and why.
 */
export type InputRepresentation =
  | { kind: 'token'; token: string }
  | { kind: 'tokens'; tokens: readonly string[]; count: number }
  | { kind: 'count'; count: number }
  | { kind: 'allocation'; count: number; totalWeightPercent: number }
  | { kind: 'measurement'; value: number; unit: string }
  | { kind: 'withheld'; reason: WithheldReason; count: number | null }
  | { kind: 'absent' };

export type InputDataType =
  'enum' | 'enum-list' | 'symbol-list' | 'text-list' | 'allocation-list' | 'number';

/* ------------------------------------------------------------------ */
/* Evaluated inputs                                                    */
/* ------------------------------------------------------------------ */

/** Freshness, as the input kind defines it — not as a global TTL. */
export type InputFreshness = 'current' | 'stale' | 'undated' | 'absent';

export type InputValidation = 'valid' | 'invalid' | 'unchecked';

/** The four states the Agent must be able to tell apart (Phase 5.1 §3). */
export type InputConfidence = 'confirmed' | 'derived' | 'assumed' | 'untrusted' | 'missing';

export interface EvaluatedInput {
  field: InputRef;
  label: string;
  dataType: InputDataType;
  /** Safe representation. Never the raw document value. */
  representation: InputRepresentation;
  source: FactSource | 'market-data' | 'request';
  /** `null` when no provenance can be offered, which is itself a finding. */
  provenance: ProvenanceRef | null;
  observedAt: string | null;
  ageDays: number | null;
  freshness: InputFreshness;
  validation: InputValidation;
  confidence: InputConfidence;
  /**
   * Whether an analysis could actually use this value.
   *
   * False for three different reasons, and the distinction stays visible through
   * `freshness`, `validation` and `confidence` rather than being flattened here: the
   * value is absent, it is malformed, or it is present and declared as a refusal to
   * say ("prefer not to say"). The gate reads this one flag so it never has to
   * reverse-engineer a value back out of a representation.
   */
  usable: boolean;
  issues: readonly QualityIssue[];
}

/** A pointer to where a value came from, without repeating the value. */
export interface ProvenanceRef {
  source: 'user' | 'derived' | 'system' | 'market-data';
  ref: string;
  trust: 'unverified' | 'verified' | 'authoritative';
  recordedAt: string;
}

/** The status the profile model computed, mapped into the quality vocabulary. */
function freshnessOf(status: ContextStatus): InputFreshness {
  switch (status) {
    case 'missing':
      return 'absent';
    case 'stale':
      return 'stale';
    case 'assumed':
      return 'undated';
    case 'confirmed':
    case 'derived':
      return 'current';
  }
}

function confidenceOf(status: ContextStatus, field: ContextField<unknown>): InputConfidence {
  switch (status) {
    case 'missing':
      return 'missing';
    case 'assumed':
      return 'assumed';
    case 'stale':
      // Aged out but genuinely stated: still a user statement, just not current.
      return field.source === 'user-stated'
        ? 'confirmed'
        : field.source === 'derived'
          ? 'derived'
          : 'assumed';
    case 'derived':
      return 'derived';
    case 'confirmed':
      return 'confirmed';
  }
}

/* ------------------------------------------------------------------ */
/* Validation rules, as declarations                                    */
/* ------------------------------------------------------------------ */

/**
 * The rules, stated once as text so the documentation, the UI and the code
 * cannot describe different checks.
 */
export const INPUT_VALIDATION_RULES: readonly string[] = [
  'a field the analysis requires must carry a value the user actually gave us',
  'a number must be finite, and a percentage must sit inside its declared range',
  'a holding weight must be positive and the allocation must not exceed a whole portfolio',
  'a symbol must match the symbol pattern; a list the analysis needs must not be empty',
  'an enumerated field must hold one of its enumerated tokens',
  'a market or timeframe must be one the system can actually work in',
  'two declarations that cannot both be true are a conflict, not a choice to be made for the user',
  'a user-stated fact with no observation time is an assumption, not a fact',
  'free text the user wrote is counted, never reproduced',
];

/** Markets the system can actually work in — mirrors the market-data asset classes. */
export const SUPPORTED_MARKETS: readonly string[] = [
  'equity',
  'fx',
  'crypto',
  'commodity',
  'index',
];

/** Timeframes a bar series can be requested at. */
export const SUPPORTED_TIMEFRAMES: readonly string[] = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

/** How long a bar series stays usable for an analysis that needs recent data. */
export const MARKET_DATA_MAX_AGE_HOURS = 72;
export const MARKET_DATA_MIN_BARS = 100;

/**
 * Tokens that are a legitimate answer and **not** a usable input.
 *
 * "Prefer not to say" is a real answer — the product must not treat it as a gap to
 * be filled by inference — but it cannot stand in for the input either. Naming the
 * two tokens here keeps that distinction in one place, so the readiness gate and
 * the UI cannot disagree about whether the user answered.
 */
export const NON_USABLE_TOKENS: Readonly<Partial<Record<FieldKey, readonly string[]>>> = {
  riskTolerance: ['unspecified'],
  capitalRange: ['prefer-not-to-say'],
};

/** True when the field carries a value the analysis could actually use. */
export function isUsableValue(field: FieldKey, value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const refused = NON_USABLE_TOKENS[field];
  return refused === undefined || !refused.includes(String(value));
}

/* ------------------------------------------------------------------ */
/* Representing a value safely                                          */
/* ------------------------------------------------------------------ */

/**
 * The representation for one field.
 *
 * Note what is *not* here: `instruments` and `constraints` are counts. A list of
 * symbols is a preference list and a constraint is a sentence, and neither is
 * needed to judge quality — their length is, and their count is. `holdings`
 * carries the aggregate that the allocation rule is about and no per-position
 * row: the check needs the total, not the positions.
 */
export function representInput(field: InputRef, value: unknown): InputRepresentation {
  if (value === null || value === undefined) return { kind: 'absent' };

  switch (field) {
    case 'markets':
      return Array.isArray(value)
        ? { kind: 'tokens', tokens: value.map(String), count: value.length }
        : { kind: 'absent' };
    case 'learningGoals':
      return Array.isArray(value)
        ? { kind: 'tokens', tokens: value.map(String), count: value.length }
        : { kind: 'absent' };
    case 'instruments':
      return Array.isArray(value) ? { kind: 'count', count: value.length } : { kind: 'absent' };
    case 'constraints':
      // Free text. Counted, never quoted, and the reason is carried so the reason is
      // visible to whoever reads the assessment rather than only in a comment.
      return Array.isArray(value)
        ? { kind: 'withheld', reason: 'free-text', count: value.length }
        : { kind: 'absent' };
    case 'holdings': {
      if (!Array.isArray(value)) return { kind: 'absent' };
      const total = value.reduce<number>((sum, holding) => {
        const weight = (holding as { weightPercent?: unknown }).weightPercent;
        return sum + (typeof weight === 'number' && Number.isFinite(weight) ? weight : 0);
      }, 0);
      return {
        kind: 'allocation',
        count: value.length,
        totalWeightPercent: Math.round(total * 100) / 100,
      };
    }
    case 'experienceLevel':
    case 'tradingStyle':
    case 'timeframe':
    case 'capitalRange':
    case 'riskTolerance':
    case 'horizon':
      return typeof value === 'string' ? { kind: 'token', token: value } : { kind: 'absent' };
    default:
      return typeof value === 'number'
        ? { kind: 'measurement', value, unit: 'count' }
        : { kind: 'absent' };
  }
}

/* ------------------------------------------------------------------ */
/* Validating one field                                                 */
/* ------------------------------------------------------------------ */

export interface FieldValidation {
  issues: readonly QualityIssue[];
  validation: InputValidation;
}

function validateListShape(
  field: InputRef,
  label: string,
  value: unknown,
  max: number,
  item: (entry: unknown, index: number) => QualityIssue | null,
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (!Array.isArray(value)) {
    return [
      issue('unknown-token', 'blocking', 'validity', field, `${label} is not a list of values.`),
    ];
  }
  if (value.length > max) {
    issues.push(
      issue(
        'out-of-range',
        'blocking',
        'validity',
        field,
        `${label} holds ${value.length} entries, above the limit of ${max}.`,
      ),
    );
  }
  value.forEach((entry, index) => {
    const found = item(entry, index);
    if (found !== null) issues.push(found);
  });
  return issues;
}

/**
 * Validate one field's *value*, independently of where it came from.
 *
 * Deliberately re-checks rather than trusting the storage schema: a document read
 * from the database, or supplied by a fixture, has not necessarily passed the
 * write-time schema, and "it was validated once, somewhere, by something" is not
 * a property an assessment can rest on.
 */
export function validateField(field: FieldKey, value: unknown): FieldValidation {
  const label = FIELD_LABELS[field];
  const issues: QualityIssue[] = [];

  const missing = value === null || value === undefined;
  if (missing) return { issues, validation: 'unchecked' };

  switch (field) {
    case 'markets': {
      const markets = Array.isArray(value) ? value : [];
      if (markets.length === 0) {
        issues.push(
          issue('empty-list', 'blocking', 'validity', field, `${label} is an empty list.`),
        );
      }
      for (const market of markets) {
        if (!SUPPORTED_MARKETS.includes(String(market))) {
          issues.push(
            issue(
              'unsupported-market',
              'blocking',
              'validity',
              field,
              `The system has no market data for the asset class "${String(market).slice(0, 24)}", so a preference for it cannot be used.`,
            ),
          );
        }
      }
      break;
    }
    case 'instruments':
      issues.push(
        ...validateListShape(field, label, value, MAX_INSTRUMENTS, (entry) => {
          const symbol = String(entry);
          if (symbol.trim().length === 0) {
            return issue(
              'malformed-symbol',
              'blocking',
              'validity',
              field,
              'An instrument entry is empty.',
            );
          }
          if (!SYMBOL_PATTERN.test(symbol)) {
            return issue(
              'malformed-symbol',
              'blocking',
              'validity',
              field,
              'An instrument entry is not a well-formed symbol.',
            );
          }
          return null;
        }),
      );
      break;
    case 'timeframe':
      if (!SUPPORTED_TIMEFRAMES.includes(String(value))) {
        issues.push(
          issue(
            'unsupported-timeframe',
            'blocking',
            'validity',
            field,
            `"${String(value).slice(0, 12)}" is not a timeframe the system can build bars from.`,
          ),
        );
      }
      break;
    case 'holdings': {
      if (!Array.isArray(value)) {
        issues.push(
          issue('unknown-token', 'blocking', 'validity', field, `${label} is not a list.`),
        );
        break;
      }
      if (value.length === 0) {
        issues.push(
          issue('empty-list', 'blocking', 'validity', field, `${label} is an empty list.`),
        );
      }
      if (value.length > MAX_HOLDINGS) {
        issues.push(
          issue(
            'out-of-range',
            'blocking',
            'validity',
            field,
            `${label} holds ${value.length} rows, above the limit of ${MAX_HOLDINGS}.`,
          ),
        );
      }
      const seen = new Set<string>();
      let total = 0;
      value.forEach((raw) => {
        const holding = raw as { symbol?: unknown; weightPercent?: unknown };
        const symbol =
          typeof holding.symbol === 'string' ? holding.symbol.trim().toUpperCase() : '';
        const weight = holding.weightPercent;

        if (symbol.length === 0) {
          issues.push(
            issue('malformed-symbol', 'blocking', 'validity', field, 'A holding has no symbol.'),
          );
        } else if (!SYMBOL_PATTERN.test(symbol)) {
          issues.push(
            issue(
              'malformed-symbol',
              'blocking',
              'validity',
              field,
              'A holding symbol is not well formed.',
            ),
          );
        } else if (seen.has(symbol)) {
          issues.push(
            issue(
              'duplicate-entry',
              'blocking',
              'validity',
              field,
              `The symbol "${symbol}" appears in more than one holding row.`,
            ),
          );
        }
        seen.add(symbol);

        if (typeof weight !== 'number') {
          issues.push(
            issue(
              'not-a-number',
              'blocking',
              'validity',
              field,
              'A holding weight is not a number.',
            ),
          );
        } else if (!Number.isFinite(weight)) {
          issues.push(
            issue(
              'non-finite-number',
              'blocking',
              'validity',
              field,
              'A holding weight is not finite.',
            ),
          );
        } else if (weight < 0) {
          issues.push(
            issue(
              'negative-value',
              'blocking',
              'validity',
              field,
              'A holding weight is negative, which no allocation can be.',
            ),
          );
        } else if (weight > MAX_WEIGHT_PERCENT) {
          issues.push(
            issue(
              'out-of-range',
              'blocking',
              'validity',
              field,
              `A holding weight is above ${MAX_WEIGHT_PERCENT}%.`,
            ),
          );
        } else {
          total += weight;
        }
      });
      if (Math.round(total * 100) / 100 > MAX_WEIGHT_PERCENT + WEIGHT_SUM_TOLERANCE) {
        issues.push(
          issue(
            'allocation-exceeds-portfolio',
            'conflicting',
            'consistency',
            field,
            `The weights total ${Math.round(total * 100) / 100}%, which is more than a whole portfolio.`,
          ),
        );
      }
      break;
    }
    case 'constraints': {
      if (!Array.isArray(value)) {
        issues.push(
          issue('unknown-token', 'blocking', 'validity', field, `${label} is not a list.`),
        );
        break;
      }
      let offending = 0;
      for (const raw of value) {
        const statement =
          typeof raw === 'string' ? raw : String((raw as { statement?: unknown }).statement ?? '');
        if (HARDLINE_CONSTRAINT_PATTERN.test(statement)) offending += 1;
      }
      if (offending > 0) {
        issues.push(
          issue(
            'constraint-is-instruction',
            'blocking',
            'validity',
            field,
            // The statement itself is not quoted: the count is what the assessment needs.
            `${offending} constraint(s) read as instructions to trade. Master Trade places no orders, so a constraint cannot be one.`,
          ),
        );
      }
      break;
    }
    default:
      break;
  }

  return {
    issues,
    validation: issues.some((found) => found.severity === 'blocking') ? 'invalid' : 'valid',
  };
}

/* ------------------------------------------------------------------ */
/* Consistency                                                          */
/* ------------------------------------------------------------------ */

/**
 * Conflicts between fields, and the two that need both.
 *
 * The profile model already refuses an impossible document on the way in, so a
 * stored context carries only `question`-severity findings. Those are *not*
 * resolved here — ADR-0041 §4 says the user resolves them — but the ones that
 * consume an input the analysis needs are raised into the assessment.
 *
 * `risk-horizon-tension` is added at this layer rather than in the profile model
 * on purpose: a stated tolerance and a stated horizon are both perfectly valid
 * declarations, and only a capability that multiplies one by the other needs to
 * ask which is current. Asking at write time would interrogate every user for the
 * benefit of one analysis.
 */
export function consistencyIssues(context: TradingContext): QualityIssue[] {
  const issues: QualityIssue[] = [];

  for (const finding of detectContradictions(context)) {
    // Two severities, two different meanings for the analysis, so they must not be
    // collapsed into one. A `question` finding is a real conflict the user resolves.
    // A `reject` finding is an *impossible* document — the write path refuses one, so
    // reaching it here means the document came from somewhere else (an import, a
    // fixture, a future provider) and nothing may be computed from it.
    issues.push(
      finding.severity === 'reject'
        ? issue('conflicting-declarations', 'blocking', 'validity', finding.key, finding.problem)
        : issue(
            'conflicting-declarations',
            'conflicting',
            'consistency',
            finding.key,
            finding.problem,
          ),
    );
  }

  const tolerance = context.riskTolerance.value;
  const horizon = context.horizon.value;
  if (
    tolerance !== null &&
    horizon !== null &&
    (tolerance === 'growth-oriented' || tolerance === 'capital-preservation') &&
    (horizon === 'intraday' || horizon === 'days')
  ) {
    issues.push(
      issue(
        'risk-horizon-tension',
        'conflicting',
        'consistency',
        'riskTolerance',
        `A ${tolerance} tolerance is declared with an ${horizon} horizon; these pull in opposite directions, so which is current?`,
      ),
    );
  }

  return issues;
}

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

/**
 * Provenance for a declared field.
 *
 * A user-stated value with an observation time has provenance we can point at. A
 * value with no observation time has none we can trust — that is the `undated`
 * case, and it is reported as an assumption rather than as a fact (ADR-0043).
 *
 * The pointer records the **observation** time, not the assessment time, so this takes
 * no clock: a provenance stamp that moved with the reader would not be a record of where
 * the value came from.
 */
export function provenanceForField(field: ContextField<unknown>): ProvenanceRef | null {
  if (field.value === null) return null;
  if (field.observedAt === null) return null;
  return {
    source:
      field.source === 'user-stated' ? 'user' : field.source === 'derived' ? 'derived' : 'system',
    ref: `profile.${field.source}`,
    trust: field.source === 'user-stated' ? 'verified' : 'unverified',
    recordedAt: field.observedAt,
  };
}

/**
 * The market-data input, as the server knows it.
 *
 * The server supplies this from its own capability state; it is never accepted
 * from a client, because "the data is fine" is precisely the claim the gate exists
 * to check rather than believe.
 */
export interface MarketDataInput {
  available: boolean;
  provenance: DataProvenance | null;
  barCount: number;
  /** `null` when nothing was fetched, so nothing could be checked. */
  qualityPassed: boolean | null;
  lastBarAt: string | null;
  source: string | null;
  detail: string;
}

export const NO_MARKET_DATA: MarketDataInput = {
  available: false,
  provenance: null,
  barCount: 0,
  qualityPassed: null,
  lastBarAt: null,
  source: null,
  detail: 'No market-data provider is configured on this server, so no bars could be checked.',
};

/* ------------------------------------------------------------------ */
/* Evaluating the whole input set                                       */
/* ------------------------------------------------------------------ */

export interface EvaluateInputsOptions {
  context: TradingContext;
  marketData: MarketDataInput;
  now: number;
}

/**
 * Evaluate every declared field plus the market-data input.
 *
 * Returns the full set, unfiltered. Which of them *matter* is a property of the
 * analysis being attempted, so the filtering belongs to `readiness.ts` — an
 * assessment that dropped issues here would be unable to answer "what else is
 * wrong with this context?".
 */
export function evaluateInputs(options: EvaluateInputsOptions): EvaluatedInput[] {
  const { context, marketData, now } = options;
  const consistency = consistencyIssues(context);

  const inputs: EvaluatedInput[] = FIELD_KEYS.map((field) => {
    const raw = context[field] as ContextField<unknown>;
    const status = fieldStatus(raw, field, now);
    const freshness = freshnessOf(status);
    const { issues: validityIssues, validation } = validateField(field, raw.value);
    const usable =
      raw.value !== null && validation !== 'invalid' && isUsableValue(field, raw.value);
    const issues: QualityIssue[] = [...validityIssues];

    if (raw.value === null) {
      // Presence is decided against the requirement, not here: this records *that* it
      // is absent, and the requirement decides whether that matters.
      issues.push(
        issue(
          'missing-required',
          'missing',
          'completeness',
          field,
          `${FIELD_LABELS[field]} has not been provided. Nothing is inferred in its place.`,
        ),
      );
    } else {
      if (!isUsableValue(field, raw.value)) {
        // A legitimate answer that cannot be used as an input — "prefer not to say".
        // Reported as something the analysis cannot rely on, never as an error, and
        // never as a reason to choose on the user's behalf.
        issues.push(
          issue(
            'missing-required',
            'missing',
            'completeness',
            field,
            `${FIELD_LABELS[field]} is declared as a refusal to say. That is a valid answer and cannot stand in as an input, so anything that depends on it will ask again rather than decide for you.`,
          ),
        );
      }
      if (status === 'assumed') {
        issues.push(
          issue(
            raw.observedAt === null ? 'undated-claim' : 'assumed-value',
            'missing',
            // `reliability` rather than `confidence`: the finding is about how the value
            // was obtained. Confidence is a roll-up of the other dimensions and carries
            // no codes of its own.
            'reliability',
            field,
            raw.observedAt === null
              ? `${FIELD_LABELS[field]} is marked as stated but carries no observation time, so it is treated as an assumption rather than a fact.`
              : `${FIELD_LABELS[field]} was not stated by you and is an assumption.`,
          ),
        );
      }
      if (status === 'stale') {
        issues.push(
          issue(
            'stale-value',
            'stale',
            'freshness',
            field,
            `${FIELD_LABELS[field]} has aged past the window for this kind of input and should be confirmed.`,
          ),
        );
      }
      if (raw.observedAt === null) {
        issues.push(
          issue(
            'missing-provenance',
            'unverified',
            'provenance',
            field,
            `${FIELD_LABELS[field]} has no observation time, so its provenance cannot be shown.`,
          ),
        );
      }
    }

    for (const found of consistency) {
      if (found.field === field) issues.push(found);
    }

    return {
      field,
      label: FIELD_LABELS[field],
      dataType: DATA_TYPE_OF[field],
      representation: representInput(field, raw.value),
      source: raw.source,
      provenance: provenanceForField(raw),
      observedAt: raw.observedAt,
      ageDays: ageInDays(raw.observedAt, now),
      freshness,
      validation,
      confidence: confidenceOf(status, raw),
      usable,
      issues,
    };
  });

  inputs.push(evaluateMarketData(marketData, now));
  return inputs;
}

const DATA_TYPE_OF: Readonly<Record<FieldKey, InputDataType>> = {
  experienceLevel: 'enum',
  markets: 'enum-list',
  instruments: 'symbol-list',
  tradingStyle: 'enum',
  timeframe: 'enum',
  learningGoals: 'enum-list',
  capitalRange: 'enum',
  riskTolerance: 'enum',
  horizon: 'enum',
  holdings: 'allocation-list',
  constraints: 'text-list',
};

function evaluateMarketData(marketData: MarketDataInput, now: number): EvaluatedInput {
  const issues: QualityIssue[] = [];
  let freshness: InputFreshness = 'absent';
  let validation: InputValidation = 'unchecked';

  if (!marketData.available) {
    issues.push(
      issue('unavailable-input', 'missing', 'completeness', 'marketData', marketData.detail),
    );
  } else {
    if (marketData.provenance === null) {
      issues.push(
        issue(
          'missing-provenance',
          'unverified',
          'provenance',
          'marketData',
          'Bars were supplied without a provenance label, so they cannot be weighed.',
        ),
      );
    } else {
      if (marketData.provenance === 'synthetic') {
        // Only synthetic is a caveat. Historical bars with a named provider are the
        // ordinary case, and raising a finding for them would train the reader to
        // ignore findings.
        issues.push(
          issue(
            'untrusted-provenance',
            'advisory',
            'provenance',
            'marketData',
            'Bars are synthetic: they are not real market data, and every result from them is a training result rather than a measurement.',
          ),
        );
      }
    }

    if (marketData.qualityPassed === null) {
      issues.push(
        issue(
          'missing-provenance',
          'unverified',
          'provenance',
          'marketData',
          'Bars were supplied without a quality report, so their shape was never checked.',
        ),
      );
    } else if (!marketData.qualityPassed) {
      validation = 'invalid';
      issues.push(
        issue(
          'out-of-range',
          'blocking',
          'validity',
          'marketData',
          'The bar series failed its own quality report and cannot be used.',
        ),
      );
    } else {
      validation = 'valid';
    }

    const ageDays = ageInDays(marketData.lastBarAt, now);
    freshness = ageDays === null ? 'undated' : 'current';
    const ageHours = ageDays === null ? null : ageDays * 24;
    if (ageHours !== null && ageHours > MARKET_DATA_MAX_AGE_HOURS) {
      freshness = 'stale';
      issues.push(
        issue(
          'stale-value',
          'stale',
          'freshness',
          'marketData',
          `The most recent bar is ${Math.round(ageHours)} hours old, beyond the ${MARKET_DATA_MAX_AGE_HOURS}-hour window for an analysis that needs recent data.`,
        ),
      );
    }
    if (marketData.lastBarAt === null) {
      issues.push(
        issue(
          'missing-provenance',
          'unverified',
          'provenance',
          'marketData',
          'The bar series has no timestamp, so its recency cannot be established.',
        ),
      );
    }
  }

  return {
    field: 'marketData',
    label: 'Market data',
    dataType: 'number',
    representation: marketData.available
      ? { kind: 'measurement', value: marketData.barCount, unit: 'bars' }
      : { kind: 'absent' },
    source: 'market-data',
    provenance:
      marketData.available && marketData.provenance !== null
        ? {
            source: 'market-data',
            ref: marketData.source ?? marketData.provenance,
            trust: marketData.provenance === 'synthetic' ? 'verified' : 'authoritative',
            recordedAt: marketData.lastBarAt ?? new Date(now).toISOString(),
          }
        : null,
    observedAt: marketData.lastBarAt,
    ageDays: ageInDays(marketData.lastBarAt, now),
    freshness,
    validation,
    // A series is `confirmed` when it is what it says it is and was checked — including
    // a *labelled* synthetic one, which we know exactly (the provenance module gives
    // synthetic data verified trust, not unverified). It is `untrusted` when a label or a
    // quality report is missing, because then the series cannot be weighed at all.
    confidence: !marketData.available
      ? 'missing'
      : marketData.provenance === null || marketData.qualityPassed === null
        ? 'untrusted'
        : 'confirmed',
    usable: marketData.available && validation !== 'invalid',
    issues,
  };
}

/* ------------------------------------------------------------------ */
/* The context-level report                                             */
/* ------------------------------------------------------------------ */

/**
 * An evaluated input, alongside the profile's own completeness policy.
 *
 * `required` here means "the profile is incomplete without it" — the profile's rule.
 * A capability's requirement is a different question with a different answer, and it
 * lives in the requirement registry, so the two never share a flag.
 */
export interface AssessedField extends EvaluatedInput {
  required: boolean;
}

export interface QualityReport {
  fields: readonly AssessedField[];
  /** Fields the profile needs and that cannot be relied on. */
  gaps: readonly InputRef[];
  /** Findings where two declarations cannot both hold. */
  conflicts: readonly QualityIssue[];
  /** Findings where a present value is not a usable value. */
  invalid: readonly QualityIssue[];
  issues: readonly QualityIssue[];
  counts: {
    fields: number;
    usable: number;
    missing: number;
    stale: number;
    assumed: number;
    invalid: number;
    conflicting: number;
  };
  dimensions: readonly DimensionAssessment[];
  note: string;
}

/**
 * Assess the declared context as a whole, with no capability in mind.
 *
 * This is the answer to "how good is what I have told you?", which the Profile
 * surface needs and which is **not** the same question as the gate's "may this
 * analysis run?". Keeping them apart is why the gate filters to the inputs a
 * capability consumes: an unrelated gap must not be reported as a reason an
 * analysis is limited.
 */
export function analyseQualityInputs(options: EvaluateInputsOptions): QualityReport {
  const evaluated = evaluateInputs(options);
  const fields: AssessedField[] = evaluated.map((input) => ({
    ...input,
    required:
      input.field === 'marketData' ? false : REQUIRED_FIELDS.includes(input.field as FieldKey),
  }));
  const issues = fields.flatMap((field) => field.issues);
  const conflicts = issues.filter((found) => found.severity === 'conflicting');
  const invalid = issues.filter((found) => found.severity === 'blocking');

  const byDimension = (dimension: QualityDimension): QualityIssueCode[] => [
    ...new Set(issues.filter((found) => found.dimension === dimension).map((found) => found.code)),
  ];

  const requiredUsable = fields.filter((field) => field.required);
  const usableCount = requiredUsable.filter((field) => field.usable).length;

  const verdicts: Record<QualityDimension, DimensionVerdict> = {
    completeness: requiredUsable.every((field) => field.usable)
      ? 'ok'
      : requiredUsable.some((field) => field.usable)
        ? 'impaired'
        : 'failed',
    validity: invalid.length > 0 ? 'failed' : 'ok',
    consistency: conflicts.length > 0 ? 'impaired' : 'ok',
    reliability: fields.some((field) => field.confidence === 'assumed') ? 'impaired' : 'ok',
    freshness: fields.some((field) => field.freshness === 'stale') ? 'impaired' : 'ok',
    relevance: 'not-applicable',
    confidence: requiredUsable.every(
      (field) => field.confidence === 'confirmed' || field.confidence === 'derived',
    )
      ? 'ok'
      : requiredUsable.some((field) => field.confidence === 'missing')
        ? 'failed'
        : 'impaired',
    provenance: requiredUsable.every((field) => field.provenance !== null) ? 'ok' : 'impaired',
  };

  return {
    fields,
    gaps: fields
      .filter((field) => !field.usable && field.field !== 'marketData')
      .map((field) => field.field),
    conflicts,
    invalid,
    issues,
    counts: {
      fields: fields.length,
      usable: usableCount,
      missing: fields.filter((field) => field.confidence === 'missing').length,
      stale: fields.filter((field) => field.freshness === 'stale').length,
      assumed: fields.filter((field) => field.confidence === 'assumed').length,
      invalid: fields.filter((field) => field.validation === 'invalid').length,
      conflicting: new Set(conflicts.map((found) => found.field)).size,
    },
    dimensions: QUALITY_DIMENSIONS.map((dimension) => ({
      dimension,
      question: DIMENSION_QUESTION[dimension],
      verdict: verdicts[dimension],
      codes: dimension === 'confidence' || dimension === 'relevance' ? [] : byDimension(dimension),
    })),
    note: REPORT_NOTE,
  };
}

/**
 * What the report is and is not.
 *
 * Shipped with the report for the same reason the decision note is shipped with the
 * decision: a client that has to guess the meaning will eventually guess wrong.
 */
export const REPORT_NOTE =
  'This describes what you have declared: presence, shape, agreement, recency and provenance, field by field. It is not a judgement about your choices, and it is not a score. Relevance is not assessed here, because relevance is a property of a particular analysis rather than of the context.';

/* ------------------------------------------------------------------ */
/* What can still be analysed                                           */
/* ------------------------------------------------------------------ */

/**
 * The capabilities an answer could still support, given what is present.
 *
 * Deliberately phrased as *topics*, not as promises: "what can still be analysed"
 * is answerable from the input set, and "what the answer will say" is not.
 */
export function analysableTopics(inputs: readonly EvaluatedInput[]): string[] {
  const usable = (field: InputRef): boolean => {
    const input = inputs.find((candidate) => candidate.field === field);
    if (input === undefined) return false;
    return input.confidence !== 'missing' && input.validation !== 'invalid';
  };

  const topics: string[] = [];
  if (usable('markets') && usable('timeframe')) {
    topics.push('how markets and timeframes behave in general');
  }
  if (usable('experienceLevel')) {
    topics.push('the background level you described');
  }
  if (usable('riskTolerance') && usable('horizon')) {
    topics.push('risk and holding-period concepts as you have described them');
  }
  if (usable('holdings')) {
    topics.push('the composition you described, with no forward view');
  }
  if (usable('learningGoals')) {
    topics.push('the learning goals you listed');
  }
  return topics;
}
