/**
 * The Persian language assessment harness.
 *
 * This is a **diagnostic measurement**, deliberately separate from the Full Validation suite and from
 * the security gate. It runs one fixed, deterministic battery over the exported Agent language
 * interface (`web/src/language`) and reports a per-dimension and overall score out of 100.
 *
 * Three properties make it a benchmark rather than a test:
 *
 *   1. **It measures, it does not assert behaviour heavenwards.** A case returns points, and a low
 *      score is data, not a failure. `assessment.test.ts` asserts only that the battery is
 *      deterministic and that the recorded baseline still matches — never that the score is high.
 *   2. **It is deterministic.** Every case reads the exported layer directly; there is no model, no
 *      clock, no network and no I/O. Two runs of the same commit produce byte-identical results.
 *   3. **It is versioned.** The battery has a version, the layer has a version, and the run records
 *      the commit it was taken at, so a later run can be diffed rather than re-read.
 *
 * Scoring model. Every case carries a maximum of one point. Objective cases are pass/fail (1 or 0);
 * rubric cases are graded 0 / 0.5 / 1 against criteria printed with the case. A dimension's score is
 * `round(100 * points / max)`; the overall score is `round(100 * totalPoints / totalMax)`. Passed,
 * partial and failed counts are the cases at full marks, strictly between, and at zero.
 */

/** The twelve dimensions the brief names, in order. */
export const ASSESSMENT_DIMENSIONS = [
  'normalization-orthography',
  'spelling-punctuation',
  'grammar-structure',
  'natural-persian',
  'reading-comprehension',
  'instruction-following',
  'context-style',
  'idioms-taarof',
  'numbers-dates-currency',
  'rtl-layout',
  'technical-terminology',
  'context-adaptation-consistency',
] as const;
export type AssessmentDimension = (typeof ASSESSMENT_DIMENSIONS)[number];

export interface DimensionMeta {
  readonly id: AssessmentDimension;
  /** The number the brief gives this dimension, 1–12. */
  readonly index: number;
  readonly title: string;
  /** The methodology the cases follow, and the authority the expected values come from. */
  readonly basis: string;
}

export const DIMENSION_META: readonly DimensionMeta[] = [
  {
    id: 'normalization-orthography',
    index: 1,
    title: 'Persian normalization & orthography',
    basis:
      'Unicode Arabic block (U+0600 chart) and Extended Arabic-Indic digits; ParsBench-style normalization track as methodological reference.',
  },
  {
    id: 'spelling-punctuation',
    index: 2,
    title: 'Spelling and punctuation',
    basis:
      'The product spelling catalogue (`spelling.ts`), whose compound pairs are reviewed knowledge; persian-llm-eval-style spelling track as methodological reference.',
  },
  {
    id: 'grammar-structure',
    index: 3,
    title: 'Grammar and sentence structure',
    basis:
      'The product grammar catalogue (`grammar.ts`): agreement, ezafe, the object marker, mixed-script sentence structure.',
  },
  {
    id: 'natural-persian',
    index: 4,
    title: 'Natural Iranian Persian',
    basis:
      'The product naturalness reader (`naturalness.ts`) over the quality reader (`evaluation.ts`), judged at a resolved tone/terminology/mixing context.',
  },
  {
    id: 'reading-comprehension',
    index: 5,
    title: 'Reading comprehension',
    basis:
      'The product census + lexicon reading (`detect.ts`, `context.ts`); comprehension is a proxy, since the layer reads scripts and closed vocabulary rather than meaning.',
  },
  {
    id: 'instruction-following',
    index: 6,
    title: 'Instruction following in Persian',
    basis:
      'The explicit-request vocabulary (`detect.ts`) and the precedence rule (`profile.ts`): a request in the message, an explicit choice, learned habit, the reading.',
  },
  {
    id: 'context-style',
    index: 7,
    title: 'Context and communication style',
    basis:
      'The communication-context reader (`context.ts`): setting, formality, expertise, depth, intent and terminology mixing.',
  },
  {
    id: 'idioms-taarof',
    index: 8,
    title: 'Idioms, expressions, and taarof',
    basis:
      'The product greetings and register lists (`context.ts`, `detect.ts`). Idiom coverage is a closed-list measure, not a semantic one.',
  },
  {
    id: 'numbers-dates-currency',
    index: 9,
    title: 'Numbers, dates, currency, ZWNJ and mixed text',
    basis:
      'CLDR via `Intl` (`fa.ts`) for digits, separators, the Persian calendar and currency, plus Unicode format controls for the half-space.',
  },
  {
    id: 'rtl-layout',
    index: 10,
    title: 'RTL / text-layout-sensitive responses',
    basis:
      'Unicode UAX #9 isolates (`fa.ts`): LRI/RLI/FSI/PDI for mixed Persian + Latin runs; measured structurally, not in a rendered DOM.',
  },
  {
    id: 'technical-terminology',
    index: 11,
    title: 'Technical Persian with English terminology',
    basis:
      'The product terminology lexicon (`terminology.ts`, 57 terms) and the mixed-script grammar rule; the canonical-form invariant is Unicode.',
  },
  {
    id: 'context-adaptation-consistency',
    index: 12,
    title: 'Context-aware adaptation and language consistency',
    basis:
      'The response control join (`response.ts`) over the resolver (`profile.ts`): one resolved language per turn, consistent across stages.',
  },
];

export type CaseKind = 'objective' | 'rubric';

export interface CaseOutcome {
  /** Points earned, 0 ≤ points ≤ max. */
  readonly points: number;
  /** Maximum points, always 1 in this battery. */
  readonly max: number;
  /** What the interface actually produced, so a reader sees the evidence, not only the verdict. */
  readonly observed: string;
}

export interface AssessmentCase {
  /** A permanent handle, `FA-###`, cited by the baseline and the report. */
  readonly id: string;
  readonly dimension: AssessmentDimension;
  readonly kind: CaseKind;
  /** What this case measures. */
  readonly title: string;
  /** Where the expected value comes from. */
  readonly source: string;
  /** Run the case. Deterministic and side-effect free. */
  readonly check: () => CaseOutcome;
}

/** An objective case: full marks or none. */
export function objective(passed: boolean, observed: string): CaseOutcome {
  return { points: passed ? 1 : 0, max: 1, observed };
}

/** A graded case: 0, 0.5 or 1 against the criteria the case prints. */
export function rubric(points: 0 | 0.5 | 1, observed: string): CaseOutcome {
  return { points, max: 1, observed };
}

export interface CaseResult extends CaseOutcome {
  readonly id: string;
  readonly dimension: AssessmentDimension;
  readonly kind: CaseKind;
  readonly title: string;
  readonly source: string;
  readonly verdict: 'pass' | 'partial' | 'fail';
}

export interface DimensionScore {
  readonly id: AssessmentDimension;
  readonly index: number;
  readonly title: string;
  readonly basis: string;
  readonly samples: number;
  readonly passed: number;
  readonly partial: number;
  readonly failed: number;
  readonly points: number;
  readonly max: number;
  /** `round(100 * points / max)`. */
  readonly score: number;
  readonly cases: readonly CaseResult[];
}

export interface AssessmentResult {
  readonly version: number;
  readonly cases: readonly CaseResult[];
  readonly dimensions: readonly DimensionScore[];
  readonly totalSamples: number;
  readonly totalPassed: number;
  readonly totalPartial: number;
  readonly totalFailed: number;
  readonly totalPoints: number;
  readonly totalMax: number;
  /** `round(100 * totalPoints / totalMax)`. */
  readonly overall: number;
}

/** Bumped when a case's meaning, a dimension's weighting or the scoring changes. */
export const ASSESSMENT_VERSION = 1;

/** The yes/no of a result, from its points. */
function verdictOf(points: number, max: number): CaseResult['verdict'] {
  if (points >= max) return 'pass';
  if (points <= 0) return 'fail';
  return 'partial';
}

/**
 * Run the battery and score it.
 *
 * Order is preserved: cases run in declaration order, and the dimensions are reported in the brief's
 * order regardless of how many of each there are.
 */
export function runAssessment(cases: readonly AssessmentCase[]): AssessmentResult {
  const results: CaseResult[] = cases.map((test) => {
    const outcome = test.check();
    if (outcome.points < 0 || outcome.points > outcome.max || outcome.max <= 0) {
      throw new Error(
        `case ${test.id} returned an out-of-range outcome: ${outcome.points}/${outcome.max}`,
      );
    }
    return {
      id: test.id,
      dimension: test.dimension,
      kind: test.kind,
      title: test.title,
      source: test.source,
      points: outcome.points,
      max: outcome.max,
      observed: outcome.observed,
      verdict: verdictOf(outcome.points, outcome.max),
    };
  });

  const dimensions: DimensionScore[] = DIMENSION_META.map((meta) => {
    const own = results.filter((result) => result.dimension === meta.id);
    const points = own.reduce((sum, result) => sum + result.points, 0);
    const max = own.reduce((sum, result) => sum + result.max, 0);
    return {
      id: meta.id,
      index: meta.index,
      title: meta.title,
      basis: meta.basis,
      samples: own.length,
      passed: own.filter((result) => result.verdict === 'pass').length,
      partial: own.filter((result) => result.verdict === 'partial').length,
      failed: own.filter((result) => result.verdict === 'fail').length,
      points,
      max,
      score: max === 0 ? 0 : Math.round((100 * points) / max),
      cases: own,
    };
  });

  const totalPoints = results.reduce((sum, result) => sum + result.points, 0);
  const totalMax = results.reduce((sum, result) => sum + result.max, 0);
  return {
    version: ASSESSMENT_VERSION,
    cases: results,
    dimensions,
    totalSamples: results.length,
    totalPassed: results.filter((result) => result.verdict === 'pass').length,
    totalPartial: results.filter((result) => result.verdict === 'partial').length,
    totalFailed: results.filter((result) => result.verdict === 'fail').length,
    totalPoints,
    totalMax,
    overall: totalMax === 0 ? 0 : Math.round((100 * totalPoints) / totalMax),
  };
}

/** A stable, comparable fingerprint of a run — the per-case points in order. */
export function fingerprint(result: AssessmentResult): string {
  return result.cases.map((test) => `${test.id}=${test.points}`).join('|');
}

/** The per-dimension tuple a baseline records: samples, passed, partial, failed, points, max, score. */
export function dimensionTuple(score: DimensionScore): readonly number[] {
  return [
    score.samples,
    score.passed,
    score.partial,
    score.failed,
    score.points,
    score.max,
    score.score,
  ];
}
