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
 *   - `grammar.ts` — Phase 7.5.2.3's sentence rules: agreement, ezafe, the object marker, and the
 *                   mixed Persian + English technical sentence. Mechanical where a fact decides, a
 *                   report where a person does.
 *   - `spelling.ts` — the spelling, register and punctuation rules of the same phase.
 *   - `languageQa.ts` — the pipeline that runs all of the above in order, and the three decisions
 *                   (`promoteLanguageRule`, `retireLanguageRule`, `approveForm`) that make a
 *                   suggestion permanent.
 *   - `detect.ts` — Phase 7.5.3.1's reading of a message: which script it is in, how it is written,
 *                   and whether it asked for a language.
 *   - `profile.ts` — the same reading as one value a later stage consumes, plus the precedence rule
 *                   between a person's explicit choice and what their message looks like.
 *   - `preference.ts` — the choice itself, and where it is kept (not in the knowledge store).
 *   - `context.ts` — Phase 7.5.3.2's reading of an interaction: whether the turn is work or small talk,
 *                   how much of it is the product's vocabulary, how much detail it wants, whether it is
 *                   asking or telling, and how the two scripts are mixed.
 *   - `communication.ts` — those readings plus the person's choices, resolved into one profile by the
 *                   rule that an explicit instruction outranks a learned preference, which outranks
 *                   the reading of the message.
 *   - `guidance.ts` — the structured wording instructions a response stage applies, the list of things
 *                   they are not allowed to change, and the shape they cross the boundary in.
 *   - `response.ts` — Phase 7.5.3.4's join: the four signals that decide the language of an answer, the
 *                   one order between them, and the single value a response stage is handed.
 *   - `seed.ts`   — the knowledge this phase ships, and why it is only what it is.
 *
 * Nothing here renders. This is the layer that reads what a person wrote and decides how the answer to it
 * is worded; the interface's own Persian is a different layer (`web/src/i18n`, Phase 7.5.3.3), and the two
 * touch at exactly two points. `preference.ts` holds the setting the Settings switch writes and the
 * interface store mirrors, and `response.ts` turns the readings above into the one value a response stage
 * applies — a verdict that travels with a turn, across the process boundary, as data. Neither direction
 * learns anything it should not: a message the agent reads as Persian cannot move the interface into
 * Persian, and nothing in the interface asks this layer what a word is. Everything else is exported as one
 * surface so the stage that builds on it has one place to look.
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
  languageRuleProposals,
  normalizationRule,
  normalizationRuleKeys,
  overlapsSpan,
  standaloneMatches,
} from './rules.js';
export type {
  LanguageRule,
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
  authorisedOfRules,
  authorisedRules,
  isNormalizedPersian,
  normalizePersianContent,
  persianFindings,
  protectedLiterals,
  runRules,
} from './normalize.js';

export { GRAMMAR_RULES } from './grammar.js';

export {
  LANGUAGE_KINDS,
  LANGUAGE_REGISTERS,
  LANGUAGE_STYLES,
  LANGUAGE_VERBOSITIES,
  LANGUAGE_WORDINGS,
  detectLanguage,
} from './detect.js';
export type {
  DetectionOptions,
  LanguageContext,
  LanguageDetection,
  LanguageKind,
  LanguageRegister,
  LanguageRequest,
  LanguageStyle,
  LanguageVerbosity,
  LanguageWording,
} from './detect.js';

export {
  LANGUAGE_PROFILE_FIELDS,
  LANGUAGE_PROFILE_VERSION,
  REPLY_LANGUAGES,
  REPLY_SOURCES,
  languageProfile,
  resolveLanguage,
  storedProfileOptions,
} from './profile.js';
export type {
  LanguageProfile,
  LanguageProfileOptions,
  LanguageReply,
  LearnedLanguage,
  ReplyLanguage,
  ReplySource,
} from './profile.js';

export {
  DEFAULT_LANGUAGE_PREFERENCE,
  LANGUAGE_PREFERENCES,
  LANGUAGE_PREFERENCE_KEY,
  isLanguagePreference,
  parseLanguagePreference,
  preferenceStorage,
  readLanguagePreference,
  writeLanguagePreference,
} from './preference.js';
export type {
  LanguagePreference,
  LanguagePreferenceReading,
  PreferenceStorage,
} from './preference.js';

export {
  CONTEXT_CONCISE_REQUESTS,
  // Exported as well as `ContextDepth`, because it is the same list the response-style contract holds
  // (Phase 7.5.3.4.2) and a reader comparing the two needs the value, not only its type.
  CONTEXT_DEPTHS,
  CONTEXT_DETAILED_REQUESTS,
  CONTEXT_DIMENSIONS,
  CONTEXT_DISCOURSE_CONNECTIVES,
  CONTEXT_EXPERTISES,
  CONTEXT_FORMAL_REQUESTS,
  CONTEXT_GREETINGS,
  CONTEXT_INFORMAL_REQUESTS,
  CONTEXT_INTENTS,
  CONTEXT_MIXINGS,
  CONTEXT_SETTINGS,
  CONTEXT_VERSION,
  analyzeCommunication,
  contextReadings,
} from './context.js';
export type {
  CommunicationContext,
  CommunicationContextOptions,
  ContextDepth,
  ContextDimension,
  ContextExpertise,
  ContextIntent,
  ContextMixing,
  ContextReading,
  ContextSetting,
} from './context.js';

export {
  COMMUNICATION_OBSERVATION_KEY,
  COMMUNICATION_VERSION,
  OBSERVATION_MINIMUM,
  OBSERVATION_WINDOW,
  PREFERENCE_SOURCES,
  TERMINOLOGY_REQUESTS,
  TERMINOLOGY_STYLES,
  communicationProfile,
  dominantObservation,
  emptyObservations,
  learnedLanguage,
  mergeObservations,
  observeCommunication,
  parseObservations,
  readCommunicationObservations,
  resolveCommunication,
  writeCommunicationObservations,
} from './communication.js';
export type {
  CommunicationObservations,
  CommunicationProfile,
  CommunicationProfileOptions,
  ObservationReading,
  PreferenceReading,
  PreferenceSource,
  TerminologyStyle,
} from './communication.js';

export {
  GUIDANCE_CLAUSES,
  GUIDANCE_FIELDS,
  GUIDANCE_INVARIANTS,
  GUIDANCE_NOTES,
  GUIDANCE_STRUCTURES,
  GUIDANCE_TONES,
  GUIDANCE_VERSION,
  guidanceFor,
  responseGuidance,
  responseStyle,
} from './guidance.js';

export { RESPONSE_CONTROL_VERSION, responseControl, storedResponseOptions } from './response.js';
export type { ResponseControl, ResponseControlOptions, StoredResponseOptions } from './response.js';
export type {
  GuidanceClauseId,
  GuidanceInvariant,
  GuidanceNoteId,
  GuidanceStructure,
  GuidanceTone,
  ResponseGuidance,
} from './guidance.js';

export { COMPOUND_PAIRS, REGISTER_FORMS, SPELLING_RULES } from './spelling.js';

export {
  LANGUAGE_QA_FAMILIES,
  LANGUAGE_RULES,
  TERMINOLOGY_QA_RULE,
  approveForm,
  authorisedLanguageRules,
  languageQa,
  languageRule,
  languageRuleState,
  promoteLanguageRule,
  retireLanguageRule,
} from './languageQa.js';
export type {
  LanguageQaDecision,
  LanguageQaFamily,
  LanguageQaOptions,
  LanguageQaReport,
  LanguageQaStage,
  LanguageRuleState,
  LanguageSuggestion,
} from './languageQa.js';
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
