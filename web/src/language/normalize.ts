/**
 * The Persian correction pipeline — Phase 7.5.2.1.
 *
 * What this is
 * ------------
 * A deterministic function from text to better text, plus an exact account of what it changed and
 * what it found. It is the *content* half of Persian normalization: `fa.ts` says whether two strings
 * are the same string, this says whether one is written the way Persian is written — over mixed
 * content, where the text is Persian prose with a symbol, a URL and a price inside it.
 *
 * Determinism, in three parts
 * ---------------------------
 *   1. **Same input, same output.** No clock, no locale default, no randomness, no iteration over an
 *      unordered set. The rule order is a declared list, and the suite runs the whole pipeline twice
 *      and asserts the second pass changes nothing.
 *   2. **Exact edits, not rewritten strings.** Each change names its rule, its position and the
 *      characters it replaced. A correction is therefore reviewable without diffing two blobs.
 *   3. **Authority before behaviour.** A rule runs only when the language store holds *trusted*
 *      knowledge at its key. The store is Phase 7.5.1's, which means a correction cannot be changed
 *      by editing code alone: a deprecated entry turns its rule off, and an exception entry protects
 *      a string that would otherwise be rewritten.
 *
 * What it deliberately will not do
 * --------------------------------
 * Nothing here decides what a string *means*. Where a decision is word-level — whether the space in
 * `می رود` belongs to a prefix or to a noun — the rule reports and the reviewer decides, and the
 * report is part of the pipeline's output rather than a comment about it. That line is what makes
 * this safe to run over text nobody has read yet.
 */

import { AppError } from '@shared/core/errors';
import { LanguageMemory } from './memory.js';
import { seededLanguageMemory } from './seed.js';
import {
  NORMALIZATION_RULES,
  findSpans,
  overlapsSpan,
  type NormalizationFinding,
  type NormalizationRule,
  type RuleEdit,
  type Span,
  type SpanKind,
} from './rules.js';

/** One change the pipeline made, with everything needed to explain it. */
export interface NormalizationChange {
  readonly rule: string;
  readonly ruleVersion: number;
  /** The language-memory key that authorised the change. */
  readonly key: string;
  /** The offset this change was made at, in the text *as the rule that made it received it*. */
  readonly index: number;
  readonly before: string;
  readonly after: string;
}

/** What the pipeline did, and what it decided not to do. */
export interface NormalizationReport {
  /** The text as it arrived. Kept so a caller can compare without holding both. */
  readonly input: string;
  readonly text: string;
  readonly changes: readonly NormalizationChange[];
  readonly findings: readonly NormalizationFinding[];
  /** Rules that ran, in the order they ran. */
  readonly appliedRules: readonly string[];
  /** Rules the memory did not authorise — named, rather than silently absent. */
  readonly skippedRules: readonly string[];
  /** Strings a reviewed exception protected for this run. */
  readonly protectedLiterals: readonly string[];
}

export interface NormalizationOptions {
  /**
   * The language store that authorises the rules. Defaults to the seeded knowledge Phase 7.5.1
   * ships, so the default pipeline is exactly what the store says, and a caller that passes a store
   * of its own gets that store's decisions rather than the code's.
   */
  readonly memory?: LanguageMemory;
  /** Restrict the run to these rule ids. Used by a surface that has decided it wants less. */
  readonly only?: readonly string[];
  /** Skip these rule ids. */
  readonly except?: readonly string[];
  /** Extra strings to leave alone, on top of any the store protects. */
  readonly protect?: readonly string[];
}

/** A failure that is a bug in a rule rather than a problem with the caller's text. */
function inconsistent(reason: string, details?: Record<string, unknown>): never {
  throw new AppError('INTERNAL', reason, details === undefined ? {} : { details });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Authority: what the language store allows
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The keys the store currently trusts.
 *
 * Only `trusted` counts. `validated` is knowledge a reviewer has read but not committed to, and
 * `proposed` is knowledge nobody has read; letting either rewrite text the product shows would make
 * the trust ladder decorative. `deprecated` is how a rule is retired: the code path stays, the entry
 * stops being trusted, and the rule stops running.
 */
function trustedKeys(memory: LanguageMemory): Set<string> {
  return new Set(memory.trusted().map((entry) => entry.key));
}

/**
 * The strings a reviewed exception protects.
 *
 * This is the mechanism Phase 7.5.1's `exception` kind exists for: a normalizer will eventually meet
 * a string it is right about in general and wrong about here, and the fix belongs in the store with a
 * reviewer's provenance rather than in a branch in this file. An entry's `examples` are its literals,
 * matched exactly — knowledge is not a pattern.
 */
export function protectedLiterals(memory: LanguageMemory): string[] {
  return memory
    .trusted()
    .filter((entry) => entry.kind === 'exception')
    .flatMap((entry) => entry.examples);
}

/** The rules this store authorises, in pipeline order. */
export function authorisedRules(
  memory: LanguageMemory = seededLanguageMemory(),
  options: Pick<NormalizationOptions, 'only' | 'except'> = {},
): NormalizationRule[] {
  return authorisedOfRules(NORMALIZATION_RULES, memory, options);
}

/** The same question, asked of any rule list — the grammar and spelling catalogues use this one. */
export function authorisedOfRules(
  rules: readonly NormalizationRule[],
  memory: LanguageMemory = seededLanguageMemory(),
  options: Pick<NormalizationOptions, 'only' | 'except'> = {},
): NormalizationRule[] {
  const trusted = trustedKeys(memory);
  return rules.filter(
    (rule) =>
      trusted.has(rule.key) &&
      (options.only === undefined || options.only.includes(rule.id)) &&
      (options.except === undefined || !options.except.includes(rule.id)),
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Edits
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Apply a rule's edits to its input, right to left.
 *
 * Right to left, so every edit's offsets still refer to the string the rule was given. Overlapping
 * edits are refused rather than resolved: two rules that want the same characters are a rule design
 * problem, and the one thing this pipeline must never do is pick a winner by accident.
 */
function applyEdits(text: string, edits: readonly RuleEdit[]): string {
  const ordered = [...edits].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  let previousEnd = -1;
  for (const edit of ordered) {
    if (edit.start < previousEnd) {
      inconsistent('two edits in one rule overlap, so the rule is not deterministic', { edit });
    }
    previousEnd = edit.end;
  }
  let output = text;
  for (const edit of ordered.reverse()) {
    output = `${output.slice(0, edit.start)}${edit.after}${output.slice(edit.end)}`;
  }
  return output;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The pipeline
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Run a *list* of rules over a string.
 *
 * This is the engine, and `normalizePersianContent` is one caller of it: Phase 7.5.2.3's grammar and
 * spelling rules need exactly the same three things the character folds need — the memory gate, the
 * protected spans, and an exact report of every edit — and a second implementation of those would be a
 * second pipeline that eventually disagrees with this one about what "protected" means.
 */
export function runRules(
  input: string,
  rules: readonly NormalizationRule[],
  options: NormalizationOptions = {},
): NormalizationReport {
  const memory = options.memory ?? seededLanguageMemory();
  const literals = [...protectedLiterals(memory), ...(options.protect ?? [])];
  const authorised = authorisedOfRules(rules, memory, options);
  const authorisedIds = new Set(authorised.map((rule) => rule.id));

  const changes: NormalizationChange[] = [];
  const findings: NormalizationFinding[] = [];
  const appliedRules: string[] = [];
  let text = input;

  for (const rule of rules) {
    if (!authorisedIds.has(rule.id)) continue;
    // Spans are recomputed for each rule, because an earlier rule's edit moves every offset after
    // it. The rules are pure functions of (text, spans), so this is a re-read, not a rebuild.
    const spans: Span[] = findSpans(text, literals);
    const protects = (index: number): boolean =>
      overlapsSpanSpans(spans, index, rule.protectedKinds);
    if (rule.enforcement === 'report') {
      findings.push(...(rule.detect?.({ text, spans, protects }) ?? []));
      continue;
    }
    const edits = rule.correct?.({ text, spans, protects }) ?? [];
    for (const edit of edits) {
      changes.push({
        rule: rule.id,
        ruleVersion: rule.version,
        key: rule.key,
        index: edit.start,
        before: text.slice(edit.start, edit.end),
        after: edit.after,
      });
    }
    if (edits.length > 0) {
      text = applyEdits(text, edits);
      appliedRules.push(rule.id);
    }
  }

  return {
    input,
    text,
    changes,
    findings,
    appliedRules,
    skippedRules: rules.filter((rule) => !authorisedIds.has(rule.id)).map((rule) => rule.id),
    protectedLiterals: literals,
  };
}

/**
 * Correct Persian text, and say exactly what was corrected.
 *
 * The Phase 7.5.2.1 rules, in their declared order, and it stays a named function rather than an alias
 * for `runRules` because it is a *contract* — "is this text written the way Persian is written?" — and a
 * contract a caller has to assemble from parts is a contract nobody can cite.
 *
 * The text handed in is not modified and nothing is written anywhere: the whole function is a value
 * computation, which is what makes it usable in a test, a build step, a form field and a review
 * tool without any of them agreeing on a storage model first.
 */
export function normalizePersianContent(
  input: string,
  options: NormalizationOptions = {},
): NormalizationReport {
  return runRules(input, NORMALIZATION_RULES, options);
}

/** The span predicate, named so the call above reads as one idea. */
function overlapsSpanSpans(
  spans: readonly Span[],
  index: number,
  kinds: readonly SpanKind[],
): boolean {
  return overlapsSpan(spans, index, index + 1, kinds);
}

/**
 * Only the findings: what is wrong with this text, and what a reviewer would change.
 *
 * Separate from `normalizePersianContent` because the two are asked for at different moments. A form
 * field wants the corrected text and does not care about the report; a review surface wants to know
 * what is questionable *without* anything being rewritten, which is the same walk with the
 * corrections discarded.
 */
export function persianFindings(
  input: string,
  options: NormalizationOptions = {},
): NormalizationFinding[] {
  const memory = options.memory ?? seededLanguageMemory();
  const literals = [...protectedLiterals(memory), ...(options.protect ?? [])];
  const authorisedIds = new Set(authorisedRules(memory, options).map((rule) => rule.id));
  const spans = findSpans(input, literals);
  return NORMALIZATION_RULES.filter(
    (rule) => rule.enforcement === 'report' && authorisedIds.has(rule.id),
  ).flatMap(
    (rule) =>
      rule.detect?.({
        text: input,
        spans,
        protects: (index) => overlapsSpanSpans(spans, index, rule.protectedKinds),
      }) ?? [],
  );
}

/** True when the pipeline would change nothing about this text. */
export function isNormalizedPersian(input: string, options: NormalizationOptions = {}): boolean {
  return normalizePersianContent(input, options).text === input;
}
