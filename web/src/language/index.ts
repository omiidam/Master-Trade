/**
 * The Persian language layer — one import surface.
 *
 * Three parts, and the boundary between them is the point:
 *
 *   - `model.ts`  — the shape of language knowledge: kinds, statuses, provenance, versions, and the
 *                   schemas that validate an entry or a snapshot. Knows nothing about storage.
 *   - `memory.ts` — the store and its controlled update path: propose → validate → version → review.
 *                   The only thing that may hold *trusted* knowledge, and the only thing that may
 *                   change it.
 *   - `fa.ts`     — the locale foundation: normalization, digits, separators, bidi isolation, and
 *                   the `Intl`-backed formatters. Knows nothing about trust and holds no copy.
 *   - `rules.ts`  — the correction catalogue of Phase 7.5.2.1: what each rule does, which store key
 *                   authorises it, and which parts of a string it refuses to touch.
 *   - `normalize.ts` — the pipeline those rules run in, and the report it produces.
 *   - `terminology.ts` — Phase 7.5.2.2's lexicon: the terms the product writes, their English
 *                   equivalents, the forms it does not write, and the consistency check over them.
 *   - `terminologyUpdates.ts` — the controlled path a new or corrected term arrives through.
 *   - `seed.ts`   — the knowledge this phase ships, and why it is only what it is.
 *
 * Nothing here renders, and nothing here is imported by the running interface yet: the interface is
 * not translated (Phase 7.5.2), and the font stack in `global.css` is the hook this layer will plug
 * into. It is exported as one surface so the phase that does translate has one place to look.
 */

export {
  AGENT_MEMORY_ID_PREFIX,
  LANGUAGE_KEY_PATTERN,
  LANGUAGE_KIND_MEANING,
  LANGUAGE_KNOWLEDGE_KINDS,
  LANGUAGE_KNOWLEDGE_STATUSES,
  LANGUAGE_LOCALE,
  LANGUAGE_MEMORY_PREFIX,
  LANGUAGE_ORIGINS,
  LANGUAGE_REVIEW_DECISIONS,
  LANGUAGE_SNAPSHOT_FORMAT,
  LANGUAGE_SNAPSHOT_FORMAT_VERSION,
  TRUSTED_LANGUAGE_ORIGINS,
  isAgentMemoryId,
  isLanguageMemoryId,
  isTrustedOrigin,
  languageChangeSchema,
  languageEntrySchema,
  languageMappingSchema,
  languageMemoryId,
  languageProposalSchema,
  languageProvenanceSchema,
  languageSnapshotSchema,
} from './model.js';
export type {
  LanguageChange,
  LanguageKnowledgeEntry,
  LanguageKnowledgeKind,
  LanguageKnowledgeStatus,
  LanguageLocale,
  LanguageMapping,
  LanguageOrigin,
  LanguageProposal,
  LanguageProvenance,
  LanguageReviewDecision,
  LanguageSnapshot,
} from './model.js';

export { LanguageMemory } from './memory.js';
export type { LanguageDeprecation, LanguageProposalResult, LanguageReviewInput } from './memory.js';

export { SEED_LANGUAGE_KNOWLEDGE, seededLanguageMemory } from './seed.js';

export {
  TERMINOLOGY,
  TERMINOLOGY_DOMAINS,
  TERMINOLOGY_DOMAIN_MEANING,
  TERMINOLOGY_RECORDED_AT,
  TERMINOLOGY_REFERENCE,
  allAlternatives,
  lexiconTerms,
  lookupTerm,
  preferredTerm,
  terminologyFindings,
  terminologyIn,
  terminologyKey,
  terminologyMemory,
  terminologyProposals,
  terminologyReport,
  terminologyTerm,
} from './terminology.js';
export type {
  LexiconTerm,
  TermLookup,
  TerminologyDomain,
  TerminologyFinding,
  TerminologyOptions,
  TerminologyTerm,
} from './terminology.js';

export {
  acceptTermCandidate,
  rejectTermCandidate,
  reviewTermCandidate,
} from './terminologyUpdates.js';
export type { TermCandidate, TermDecision } from './terminologyUpdates.js';

export {
  FIGURE_PATTERN,
  NORMALIZATION_RULES,
  NORMALIZATION_RULE_KINDS,
  findSpans,
  isBareNumber,
  isPersianProse,
  normalizationRule,
  normalizationRuleKeys,
  overlapsSpan,
} from './rules.js';
export type {
  NormalizationEnforcement,
  NormalizationFinding,
  NormalizationRule,
  NormalizationRuleKind,
  RuleEdit,
  RuleInput,
  Span,
  SpanKind,
} from './rules.js';

export {
  authorisedRules,
  isNormalizedPersian,
  normalizePersianContent,
  persianFindings,
  protectedLiterals,
} from './normalize.js';
export type {
  NormalizationChange,
  NormalizationOptions,
  NormalizationReport,
} from './normalize.js';

export {
  ARABIC_INDIC_DIGITS,
  BIDI_CONTROLS,
  PERSIAN_DECIMAL_SEPARATOR,
  PERSIAN_DIGITS,
  PERSIAN_GROUP_SEPARATOR,
  PERSIAN_LOCALE,
  PERSIAN_PERCENT_SIGN,
  PERSIAN_PUNCTUATION,
  ZWNJ,
  comparePersian,
  faPluralCategory,
  formatFaCurrency,
  formatFaDate,
  formatFaDateTime,
  formatFaNumber,
  formatFaPercentPoints,
  formatFaRelative,
  formatFaShare,
  formatFaTime,
  hasZwnj,
  isolateBidi,
  latinRun,
  normalizePersianText,
  persianRun,
  stripZwnj,
  toLatinDigits,
  toPersianDigits,
  trimZwnjEdges,
} from './fa.js';
export type {
  FaDateInput,
  FaDateOptions,
  FaDigits,
  FaFormatOptions,
  FaNumberOptions,
} from './fa.js';
