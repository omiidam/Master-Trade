/**
 * The Persian language QA pipeline — Phase 7.5.2.3.
 *
 * Text → normalize → check terminology → check language rules → suggest → validate → versioned
 * knowledge. This file is the first four steps; the last two run through the Phase 7.5.1 store, which is
 * why they are three small functions at the bottom rather than a system of their own.
 *
 * Two properties make the pipeline worth having instead of four calls a caller has to remember to make
 * in the right order:
 *
 *   - **it reuses the layers rather than re-deriving them.** Step one is `normalizePersianContent`; the
 *     language rules are `runRules` over the grammar and spelling catalogues; terminology is
 *     `terminologyFindings`. There is no second implementation of "is this text Persian", "what does
 *     this product call this" or "what may a rule touch" — the grammar half uses the same runner, the
 *     same memory gate and the same protected spans the character folds do.
 *   - **it says which stage a suggestion came from, and what that stage received.** A correction's
 *     offset is an offset into *the text that rule was given*, so each stage carries its own input and
 *     output. Re-basing offsets across four transformations would be arithmetic that looks tidy and is
 *     eventually wrong; naming the frame is honest, and a caller can slice with it.
 *
 * Nothing here is probabilistic, and the report says so per suggestion: `deterministic: true` means a
 * mechanical rule already applied the fix (the exact characters it replaced are in the report), and
 * `deterministic: false` means a pattern a person decides about. No model, no score, no probability.
 */

import { AppError } from '@shared/core/errors';
import type { LanguageKnowledgeEntry, LanguageOrigin } from './model.js';
import { LanguageMemory } from './memory.js';
import { seededLanguageMemory } from './seed.js';
import {
  authorisedOfRules,
  normalizePersianContent,
  runRules,
  type NormalizationChange,
  type NormalizationOptions,
  type NormalizationReport,
} from './normalize.js';
import { NORMALIZATION_RULES, type LanguageRule, type NormalizationFinding } from './rules.js';
import { GRAMMAR_RULES } from './grammar.js';
import { SPELLING_RULES } from './spelling.js';
import {
  terminologyFindings,
  type TerminologyFinding,
  type TerminologyOptions,
} from './terminology.js';

/** The four stages, in the order they run. */
export const LANGUAGE_QA_FAMILIES = [
  'normalization',
  'grammar',
  'spelling',
  'terminology',
] as const;
export type LanguageQaFamily = (typeof LANGUAGE_QA_FAMILIES)[number];

/** Every rule this phase added, in the order they run after normalization. */
export const LANGUAGE_RULES: readonly LanguageRule[] = [...GRAMMAR_RULES, ...SPELLING_RULES];

/** The rule id terminology findings report under, so a caller can exclude them like any other rule. */
export const TERMINOLOGY_QA_RULE = 'terminology.preferred-form';

/** One thing the pipeline found: what it saw, what this product writes instead, and why. */
export interface LanguageSuggestion {
  readonly family: LanguageQaFamily;
  readonly rule: string;
  readonly ruleVersion: number;
  /** The language-memory key that authorised this rule, or the term's key for terminology. */
  readonly key: string;
  /** True when a mechanical rule applied it; false when a person decides. */
  readonly deterministic: boolean;
  /** An offset into the *stage's* input text — see `LanguageQaStage`. */
  readonly index: number;
  readonly length: number;
  readonly found: string;
  readonly suggestion: string;
  readonly reason: string;
}

/** One pass of the pipeline, with the text it received and the text it produced. */
export interface LanguageQaStage {
  readonly family: LanguageQaFamily;
  /** The text this stage was handed — the next stage's input. */
  readonly input: string;
  /** The text after every deterministic correction this stage made. */
  readonly output: string;
  /** Rules that ran, in order. */
  readonly applied: readonly string[];
  /** Rules the store did not authorise, or the caller excluded — named, never silently absent. */
  readonly skipped: readonly string[];
  readonly suggestions: readonly LanguageSuggestion[];
}

export interface LanguageQaReport {
  readonly input: string;
  /** The text after every deterministic correction: normalization, grammar and spelling. */
  readonly text: string;
  readonly stages: readonly LanguageQaStage[];
  /** Everything found, in pipeline order. */
  readonly suggestions: readonly LanguageSuggestion[];
  /** The deterministic subset, already applied to `text`. */
  readonly corrections: readonly LanguageSuggestion[];
  /** The subset a person decides about — terminology and the pattern rules. */
  readonly review: readonly LanguageSuggestion[];
  /** Rules across every stage the store did not authorise, or the caller excluded. */
  readonly skippedRules: readonly string[];
}

export interface LanguageQaOptions extends NormalizationOptions, TerminologyOptions {
  /** Leave these rule ids out: a surface that has decided it wants less. */
  readonly exceptRules?: readonly string[];
}

/** A change, as a suggestion. */
function fromChange(
  change: NormalizationChange,
  family: LanguageQaFamily,
  reason: string,
): LanguageSuggestion {
  return {
    family,
    rule: change.rule,
    ruleVersion: change.ruleVersion,
    key: change.key,
    deterministic: true,
    index: change.index,
    length: change.before.length,
    found: change.before,
    suggestion: change.after,
    reason,
  };
}

/** A finding, as a suggestion — never deterministic, because nothing was applied. */
function fromFinding(
  finding: NormalizationFinding,
  family: LanguageQaFamily,
  ruleVersion: number,
): LanguageSuggestion {
  return {
    family,
    rule: finding.rule,
    ruleVersion,
    key: finding.key,
    deterministic: false,
    index: finding.index,
    length: finding.match.length,
    found: finding.match,
    suggestion: finding.suggestion,
    reason: finding.reason,
  };
}

/** A terminology finding, as a suggestion. The lexicon is Phase 7.5.2.2's; nothing is repeated here. */
function fromTerminology(finding: TerminologyFinding): LanguageSuggestion {
  return {
    family: 'terminology',
    rule: TERMINOLOGY_QA_RULE,
    ruleVersion: 1,
    key: finding.key,
    deterministic: false,
    index: finding.index,
    length: finding.foundFa.length,
    found: finding.foundFa,
    suggestion: finding.preferredFa,
    reason: finding.reason,
  };
}

/** Every rule this phase added whose entry the store trusts — the pipeline's own view of the gate. */
export function authorisedLanguageRules(
  memory: LanguageMemory = seededLanguageMemory(),
  options: Pick<LanguageQaOptions, 'only' | 'except' | 'exceptRules'> = {},
): LanguageRule[] {
  const authorised = new Set(
    authorisedOfRules(LANGUAGE_RULES, memory, options).map((rule) => rule.id),
  );
  const excepted = new Set(options.exceptRules ?? []);
  return LANGUAGE_RULES.filter((rule) => authorised.has(rule.id) && !excepted.has(rule.id));
}

/**
 * Run the whole pipeline over a piece of text.
 *
 * Normalization is applied and reported; then grammar and spelling run as their own passes, each on the
 * text the previous one produced, so every report names the exact text its offsets refer to. The two
 * families that need a person are only reported. Nothing ever writes to the store: a suggestion is a
 * *reading* of the text, and the knowledge that would make it permanent goes through `approveForm`,
 * `promoteLanguageRule` or `retireLanguageRule` below, each of which is a decision with a provenance.
 */
export function languageQa(text: string, options: LanguageQaOptions = {}): LanguageQaReport {
  const excepted = new Set(options.exceptRules ?? []);
  const stages: LanguageQaStage[] = [];
  /** The declared version of every rule in both catalogues, so a finding reports the right one. */
  const versionOf = new Map<string, number>(
    [...NORMALIZATION_RULES, ...LANGUAGE_RULES].map((rule) => [rule.id, rule.version]),
  );
  const version = (ruleId: string): number => versionOf.get(ruleId) ?? 1;

  // 1. Normalize — Phase 7.5.2.1, unchanged and not re-implemented.
  const normalized: NormalizationReport = normalizePersianContent(text, options);
  stages.push({
    family: 'normalization',
    input: text,
    output: normalized.text,
    applied: normalized.appliedRules,
    skipped: normalized.skippedRules,
    suggestions: [
      ...normalized.changes.map((change) =>
        fromChange(change, 'normalization', 'this product writes Persian this way'),
      ),
      // Phase 7.5.2.1's *reports* belong here too. They are half of what that layer knows — a missing
      // half-space, a figure wearing Persian digits beside a technical token — and a caller that only
      // held `languageQa` would otherwise lose them entirely, since no other stage looks for them.
      ...normalized.findings.map((finding) =>
        fromFinding(finding, 'normalization', version(finding.rule)),
      ),
    ].sort((left, right) => left.index - right.index),
  });

  // 2. The language rules — grammar, then spelling, each on the text the step before produced.
  const byId = new Map(LANGUAGE_RULES.map((rule) => [rule.id, rule]));
  let current = normalized.text;
  for (const family of ['grammar', 'spelling'] as const) {
    const familyRules = LANGUAGE_RULES.filter((rule) => rule.kind === family);
    const active = familyRules.filter((rule) => !excepted.has(rule.id));
    const result = runRules(current, active, options);
    stages.push({
      family,
      input: current,
      output: result.text,
      applied: result.appliedRules,
      skipped: [
        ...result.skippedRules,
        ...familyRules.filter((rule) => excepted.has(rule.id)).map((rule) => rule.id),
      ],
      suggestions: [
        ...result.changes.map((change) =>
          fromChange(change, family, byId.get(change.rule)?.describe ?? 'a rule of this product'),
        ),
        ...result.findings.map((finding) => fromFinding(finding, family, version(finding.rule))),
      ].sort((left, right) => left.index - right.index),
    });
    current = result.text;
  }

  // 3. Terminology — Phase 7.5.2.2's check, on the text the language rules produced.
  stages.push({
    family: 'terminology',
    input: current,
    output: current,
    applied: [],
    skipped: [],
    suggestions: excepted.has(TERMINOLOGY_QA_RULE)
      ? []
      : terminologyFindings(current, options).map(fromTerminology),
  });

  const suggestions = stages.flatMap((stage) => stage.suggestions);
  return {
    input: text,
    text: current,
    stages,
    suggestions,
    corrections: suggestions.filter((suggestion) => suggestion.deterministic),
    review: suggestions.filter((suggestion) => !suggestion.deterministic),
    skippedRules: stages.flatMap((stage) => stage.skipped),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Validate, and store the decision — the last two steps of the flow
 * ──────────────────────────────────────────────────────────────────────────── */

/** What a QA decision did. A rejection is a value here for the same reason it is in terminology. */
export type LanguageQaDecision =
  | { readonly outcome: 'accepted'; readonly entry: LanguageKnowledgeEntry }
  | { readonly outcome: 'pending'; readonly entry: LanguageKnowledgeEntry; readonly reason: string }
  | { readonly outcome: 'rejected'; readonly reason: string };

/** What the store currently says about a rule. */
export interface LanguageRuleState {
  readonly id: string;
  readonly key: string;
  readonly status: LanguageKnowledgeEntry['status'];
  readonly version: number;
}

/** The rule with this id, from either catalogue. */
export function languageRule(id: string): LanguageRule | undefined {
  return LANGUAGE_RULES.find((rule) => rule.id === id);
}

/** How far a rule is trusted right now, or nothing when this build does not have the rule. */
export function languageRuleState(
  id: string,
  memory: LanguageMemory = seededLanguageMemory(),
): LanguageRuleState | undefined {
  const rule = languageRule(id);
  if (rule === undefined) return undefined;
  const entry = memory.get(rule.key);
  if (entry === undefined) return undefined;
  return { id: rule.id, key: rule.key, status: entry.status, version: entry.version };
}

function refused(error: unknown, key: string): LanguageQaDecision {
  if (error instanceof AppError) {
    if (error.code === 'NOT_FOUND') {
      return { outcome: 'rejected', reason: `\`${key}\` has nothing waiting for a review.` };
    }
    if (error.code === 'CONFLICT') {
      return {
        outcome: 'rejected',
        reason: `\`${key}\` has moved since this decision was written.`,
      };
    }
    if (error.code === 'POLICY_VIOLATION') {
      return {
        outcome: 'rejected',
        reason: 'a proposal cannot be reviewed by the origin that made it.',
      };
    }
  }
  throw error;
}

/**
 * Accept a candidate rule, which is how a rule that shipped as an `agent-proposal` starts working.
 *
 * The reviewer's origin and reference become the rule's provenance, so the knowledge says a person
 * accepted it — not the model that drafted it.
 */
export function promoteLanguageRule(
  ruleId: string,
  memory: LanguageMemory,
  review: { origin: LanguageOrigin; reference: string; at: string; expectedVersion: number },
): LanguageQaDecision {
  const rule = languageRule(ruleId);
  if (rule === undefined) {
    return { outcome: 'rejected', reason: `\`${ruleId}\` is not a rule this build has.` };
  }
  try {
    const entry = memory.review(rule.key, { decision: 'accept', ...review });
    return entry === undefined
      ? { outcome: 'rejected', reason: `\`${rule.key}\` was not accepted.` }
      : { outcome: 'accepted', entry };
  } catch (error) {
    return refused(error, rule.key);
  }
}

/**
 * Retire a rule. The code stays; the knowledge stops being trusted, so the rule stops running.
 *
 * This is the honest version of "turning a check off": it is a versioned decision with a reference,
 * visible in the store's history, rather than a flag somebody flipped in a config file.
 */
export function retireLanguageRule(
  ruleId: string,
  memory: LanguageMemory,
  deprecation: { origin: LanguageOrigin; reference: string; at: string; expectedVersion: number },
): LanguageQaDecision {
  const rule = languageRule(ruleId);
  if (rule === undefined) {
    return { outcome: 'rejected', reason: `\`${ruleId}\` is not a rule this build has.` };
  }
  try {
    return { outcome: 'accepted', entry: memory.deprecate(rule.key, deprecation) };
  } catch (error) {
    return refused(error, rule.key);
  }
}

/**
 * Approve a form the checks would otherwise report.
 *
 * This is the suggestion-acceptance path, and it writes an `exception` entry — the mechanism Phase
 * 7.5.2.1 built for the string a normalizer is right about in general and wrong about here, and Phase
 * 7.5.2.2 reused for a context where a non-preferred term is intended. A language QA suggestion is the
 * third case: a reviewer reads the suggestion, decides this particular wording is right, and says so
 * once, in the store, with a source and a reason.
 *
 * The entry names the form in its `examples`, which is what `protectedLiterals` reads, so an approved
 * form stops being reported by the rule that found it as well as being spared by every other.
 */
export function approveForm(
  form: string,
  memory: LanguageMemory,
  decision: {
    /** A stable address for the decision — a key is not the form, because a form is not a key. */
    readonly slug: string;
    readonly origin: LanguageOrigin;
    readonly reference: string;
    readonly at: string;
    readonly reason: string;
  },
): LanguageQaDecision {
  if (form.trim() === '') {
    return { outcome: 'rejected', reason: 'there is no form to approve.' };
  }
  const key = `exception.language-qa.${decision.slug}`;
  try {
    const result = memory.propose({
      key,
      kind: 'exception',
      value: decision.reason,
      origin: decision.origin,
      reference: decision.reference,
      recordedAt: decision.at,
      baseVersion: memory.get(key)?.version ?? 0,
      confidence: 1,
      examples: [form],
      mapping: null,
      notes: decision.reason,
    });
    return result.outcome === 'pending'
      ? {
          outcome: 'pending',
          entry: result.entry,
          reason: 'an unreviewed proposal cannot approve a form; a review is what accepts it.',
        }
      : { outcome: 'accepted', entry: result.entry };
  } catch (error) {
    return refused(error, key);
  }
}
