/**
 * The Persian language pipeline — Phase 7.5.3.5.5, and the last module in this directory.
 *
 * Everything from 7.5.1 to 7.5.3.5.4 answers one question about one thing: the locale layer formats a
 * value, the store holds a decision with a provenance, the rules read a text, 7.5.3.1 reads a message,
 * 7.5.3.2 reads a turn, 7.5.3.4 resolves what the answer owes, 7.5.3.5 evaluates the Persian that came
 * back, and 7.5.3.5.4 decides what to keep. This module is the *join*: one call runs the whole flow over
 * one turn and returns one value, so a caller never assembles the chain by hand and two callers cannot
 * assemble it two different ways.
 *
 * What it is not, and the reason it is short
 * ------------------------------------------
 * It holds **no** rule, no lexicon, no vocabulary, no threshold, no store and no cache. Every stage below
 * is one call into the module that owns the question, and the value each returns is carried whole. A
 * second copy of a decision is how two readers of the same turn start disagreeing — that is the lesson
 * this document records seven times — so the only things written here are the *order* the stages run in,
 * the sentences that say what each one read, and the two derived values (`concepts`, `learningContext`)
 * that are projections of a stage's own output rather than new knowledge.
 *
 * The stages, in the order the phase names them
 * ---------------------------------------------
 *
 *   1. `detection`  — `detectLanguage`: what the person wrote, in which script, and whether they asked
 *      for a language. The reading, once, and every stage below is handed it rather than re-reading.
 *   2. `context`    — `analyzeCommunication`: whether the turn is work or small talk, its register, how
 *      much of it is this product's vocabulary, and how the two scripts are mixed.
 *   3. `memory`     — the three persisted signals, read through `storedResponseOptions` (the one place
 *      that knows all three keys exist) and resolved by `resolveLanguage`. A setting, a statement and a
 *      habit are different kinds of thing; the resolver is where their order is written down, and this
 *      stage reports which of them answered.
 *   4. `knowledge`  — the product's own Persian: the concepts the turn named, with the form the lexicon
 *      currently authorises for each, the rules the store trusts, and the forms it protects. All four
 *      are *readings of the store*, and nothing here decides anything.
 *   5. `qa`         — `languageQa` over the answer the product wrote, which is the text this catalogue of
 *      corrections is about: a message is somebody's own writing and this layer does not correct it. The
 *      stage names its subject, and reports nothing when no answer was brought.
 *   6. `response`   — `responseControl`: the language the answer is owed in, the guidance that words it,
 *      and the style that crosses the process divide. One value rather than three to assemble.
 *   7. `learning`   — `observePersianText` over the same answer, at the context the response stage
 *      resolved, so what a person is asked to decide about is the answer as it was actually owed; plus
 *      the verdict they gave about it, recorded through `recordFeedback` when they gave one.
 *   8. `regression` — `regressionCheck` over the corpus, because "prevent a fixed error from returning"
 *      is a question asked on every run and not only in a suite.
 *
 * One subject per stage, named
 * ----------------------------
 * The first four stages and the sixth read the **message**: they are about what the person wrote and
 * what the answer owes it. The fifth and the seventh read the **answer**: a quality report and a learning
 * ledger about text this product wrote, where reading the person's own words as the product's output
 * would be a category error. The eighth reads neither — it reads the corpus. `qa` and the learning
 * candidates are therefore `null` and empty when a caller brings no answer, which is the honest value for
 * a turn whose answer has not been written yet, and the report says so rather than inventing one.
 *
 * What it may not do
 * ------------------
 * Two properties the suite asserts rather than describes:
 *
 *   - **Nothing here writes.** The pipeline is a reading: no stage proposes a rule, approves a form,
 *     promotes a rule, records an observation or mutates the store it was handed. The one thing that
 *     looks like a write — `recordFeedback` — returns a *new* store in its decision and leaves the one it
 *     was given untouched, so a caller may persist it or throw it away.
 *   - **Nothing here can change what an answer says.** The value carries a language, ids from closed
 *     catalogues, a style, findings about wording, and the invariant list — no field a figure, a tool
 *     result, a permission, a safety rule or an uncertainty note could travel in. `PIPELINE_FIELDS` is
 *     closed, and the suite compares the produced object against it.
 *
 * It reads no clock: a caller that cares when a turn happened says so, and one that does not gets the
 * epoch rather than the current instant, because a value that changes between two identical calls is a
 * value no suite can assert.
 */

// `seed.js` is imported first, and the order is load-bearing rather than alphabetical. This layer has one
// module cycle — `terminology.ts` reads the character normalizer, `normalize.ts` reads the seed for its
// defaults, and `seed.ts` composes itself from the lexicon — and a cycle is resolved by whichever member
// the entry point reaches first. Starting here means the catalogue is built before any module asks it a
// question; starting with `communication.js` means `SEED_LANGUAGE_KNOWLEDGE` is assembled while
// `TERMINOLOGY` is still being initialized, and the import throws. `index.ts` has always relied on the
// same ordering, which is why nothing had ever seen it: this file is the first entry point that is not
// the index, and the suite asserts that importing it alone works.
import { seededLanguageMemory } from './seed.js';
import { learnedLanguage, type CommunicationObservations } from './communication.js';
import {
  readPersianAnswer,
  regressionCheck,
  type LanguageRegressionCase,
  type LearningCandidate,
  type LearningSurface,
  type RegressionReport,
} from './continuousLearning.js';
import { analyzeCommunication, type CommunicationContext } from './context.js';
import { detectLanguage, type DetectionOptions, type LanguageDetection } from './detect.js';
import { GUIDANCE_INVARIANTS, type GuidanceInvariant } from './guidance.js';
import { languageQa, authorisedLanguageRules, type LanguageQaReport } from './languageQa.js';
import {
  emptyCorrections,
  recordFeedback,
  statedPreference,
  type CorrectionDecision,
  type CorrectionSurface,
  type ResponseFeedback,
} from './learning.js';
import { protectedLiterals, type LanguageMemory } from './memory.js';
import type { NaturalnessContext, NaturalnessReport } from './naturalness.js';
import {
  preferenceStorage,
  type LanguagePreference,
  type PreferenceStorage,
} from './preference.js';
import {
  resolveLanguage,
  type LanguageReply,
  type LearnedLanguage,
  type ReplyLanguage,
  type StatedPreference,
} from './profile.js';
import { responseControl, storedResponseOptions, type ResponseControl } from './response.js';
import { lexiconTerms, type TerminologyDomain } from './terminology.js';

/* ────────────────────────────────────────────────────────────────────────────
 * The shape of a run
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The version of the pipeline, bumped when a returned value means something different than it did.
 *
 * A caller that logs or caches a report has to know which rules produced it, for the same reason every
 * value in this layer carries a version: the report is what a reviewer reads when the Persian was wrong,
 * and a version is what makes that review reproducible.
 */
export const LANGUAGE_PIPELINE_VERSION = 1;

/**
 * The stages, in the order the phase names them.
 *
 * Exported as a list rather than left implicit in the function body, because "the flow is verified" is a
 * claim about *these* stages: the suite walks this list and requires the report to carry each one, so a
 * stage that is quietly dropped fails rather than shrinking the pipeline.
 */
export const LANGUAGE_PIPELINE_STAGES = [
  'detection',
  'context',
  'memory',
  'knowledge',
  'qa',
  'response',
  'learning',
  'regression',
] as const;
export type LanguagePipelineStage = (typeof LANGUAGE_PIPELINE_STAGES)[number];

/**
 * The field names a report may have, in one place, asserted by the suite.
 *
 * The same guard the ledger and the statements store keep and for the same reason: every field is a
 * reading, a closed value, an id, or a value another module already published. There is no field a
 * message, a person, a credential or a rewritten text could sit in — so a field added to carry one fails
 * the suite instead of shipping as a quiet addition to a value that is logged.
 */
export const PIPELINE_FIELDS = [
  'version',
  'input',
  'text',
  'answer',
  'detection',
  'context',
  'memory',
  'knowledge',
  'qa',
  'response',
  'learning',
  'regression',
  'stages',
  'invariants',
] as const;

/** The field names a learning reading may have. Closed for the same reason the report's are. */
export const LEARNING_READING_FIELDS = [
  'context',
  'report',
  'candidates',
  'feedback',
  'reason',
] as const;

/**
 * What a caller hands the pipeline: one turn, as much of it as exists yet.
 *
 * `text` is required because nothing below can run without it. `answer` is not, and its absence is a real
 * state rather than a degraded one: the response stage resolves a turn before the answer is written, and
 * a caller in that position gets everything except the two stages whose subject is the answer.
 */
export interface LanguageTurn {
  /** What the person wrote. The subject of every reading stage. */
  readonly text: string;
  /** What the product wrote back, when it has been written. The subject of `qa` and `learning`. */
  readonly answer?: string | null;
  /** What the person said about the answer, when they said something. */
  readonly feedback?: ResponseFeedback | null;
  /** When this turn happened. Defaults to the epoch — this module reads no clock. */
  readonly at?: string;
  /** An opaque label for where the answer was seen. Never stored as content. */
  readonly evidence?: string;
  /** Where the answer came from, as the ledger names it. `answer` is the default. */
  readonly surface?: LearningSurface;
  /** Where the person was when they gave the feedback, as `learning.ts` names it. */
  readonly correctionSurface?: CorrectionSurface;
}

/** The instant a caller that does not care about time gets: fixed, so two runs are comparable. */
export const PIPELINE_EPOCH = '1970-01-01T00:00:00.000Z';

export interface LanguagePipelineOptions extends DetectionOptions {
  /**
   * The store the three persisted signals are read from — the setting, the counts, the statements.
   *
   * `null` is a first run, and `undefined` means "read the platform's storage", which is the same
   * convention `storedResponseOptions` keeps. A caller that has already read them should not pass a
   * second copy: the keys live in the modules that own them, and this is the one place that knows all
   * three exist.
   */
  readonly storage?: PreferenceStorage | null;
  /** The corpus the regression stage re-reads. Empty is the honest default for a fresh install. */
  readonly cases?: readonly LanguageRegressionCase[];
  /** Leave these QA rules out, as `languageQa` names them. Named in the report's `skippedRules`. */
  readonly exceptRules?: readonly string[];
  /** Leave these checks out of the learning reading, as either catalogue names them. */
  readonly exceptChecks?: readonly string[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * What each stage hands back
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The third stage: what is known about this person, and which of it answered.
 *
 * The three fields are the three kinds of thing this layer remembers — a setting is one slot, counts
 * decay, a statement is permanent — and they are reported rather than summarised because a person who
 * disagrees with an answer's language is entitled to see which of the three decided it.
 */
export interface PipelineMemoryReading {
  readonly preference: LanguagePreference;
  /** How many previous turns are counted. Zero means nothing has been learned yet. */
  readonly samples: number;
  /** What their own previous turns showed, when there are enough of them to count. */
  readonly learned: LearnedLanguage | null;
  /** What they stated outright, when it is sure enough to be read. */
  readonly stated: StatedPreference<ReplyLanguage> | null;
  /** The resolution those three feed, from `resolveLanguage` — the same value stage six returns. */
  readonly reply: LanguageReply;
  readonly reason: string;
}

/**
 * One concept the turn named, with the form the product writes for it *now*.
 *
 * A projection, and a projection only: the fields are copied out of `lexiconTerms`, which is the view
 * that already applies the store's corrections to the catalogue row. Retired forms come along because a
 * reviewer reading a report should see that a term was changed rather than be told a term.
 */
export interface PipelineConcept {
  readonly id: string;
  readonly domain: TerminologyDomain;
  readonly fa: string;
  readonly en: string;
  /** Forms a previous version of this term was written in. Reported, never rendered. */
  readonly retired: readonly string[];
}

/** The fourth stage: the product's own Persian, as the store currently authorises it. */
export interface PipelineKnowledgeReading {
  readonly concepts: readonly PipelineConcept[];
  /** The rule ids the store trusts, in pipeline order. */
  readonly rules: readonly string[];
  /** The forms a reviewer decided this product writes, which no rule may report. */
  readonly protectedForms: readonly string[];
  readonly reason: string;
}

/** The seventh stage: what the answer taught, and what the person said about it. */
export interface PipelineLearningReading {
  /** The context the answer was judged against, derived from the response stage's own decision. */
  readonly context: NaturalnessContext;
  /**
   * The reading the candidates were drawn from — 7.5.3.5.3's naturalness report, which carries
   * 7.5.3.5.1's quality report inside it.
   *
   * It is here rather than re-run by a caller because there is one reading of one answer: a surface that
   * wants to show *why* a form was flagged reads this, and the candidates are the same report's
   * actionable subset rather than a second opinion about it. `null` with no answer to read.
   */
  readonly report: NaturalnessReport | null;
  /** What a reviewer would be asked to decide about. One per form, never one per occurrence. */
  readonly candidates: readonly LearningCandidate[];
  /** What the person's verdict mapped to, or `null` when they gave none. A value, never a write. */
  readonly feedback: CorrectionDecision | null;
  readonly reason: string;
}

/** One turn, the whole way through. */
export interface LanguagePipelineReport {
  readonly version: number;
  /** What was handed in, unchanged. This layer reads; it does not rewrite. */
  readonly input: string;
  /** Always `input`: the suite holds every reporting layer in this directory to that. */
  readonly text: string;
  /** The answer the last two stages read, or `null` when the caller brought none. */
  readonly answer: string | null;
  readonly detection: LanguageDetection;
  readonly context: CommunicationContext;
  readonly memory: PipelineMemoryReading;
  readonly knowledge: PipelineKnowledgeReading;
  /** The answer read by this product's own corrections and lexicon; `null` with no answer. */
  readonly qa: LanguageQaReport | null;
  readonly response: ResponseControl;
  readonly learning: PipelineLearningReading;
  readonly regression: RegressionReport;
  /** The stages that ran, in order. Exactly `LANGUAGE_PIPELINE_STAGES`. */
  readonly stages: readonly LanguagePipelineStage[];
  /** What no stage may change: the seven invariants the response stage carries, said once more here. */
  readonly invariants: readonly GuidanceInvariant[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * The run
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Run one turn through the whole layer.
 *
 * Pure and total: every turn produces a report, including one with no letters in it, and the same turn
 * with the same inputs produces the same report twice. The only inputs beyond the turn are the store the
 * knowledge is read from, the storage the three signals are read from and the corpus; there is no global
 * state, no clock and no I/O beyond the two injected readers.
 */
export function languagePipeline(
  turn: LanguageTurn,
  options: LanguagePipelineOptions = {},
): LanguagePipelineReport {
  const memory: LanguageMemory = options.memory ?? seededLanguageMemory();
  const at = turn.at ?? PIPELINE_EPOCH;
  const answer = turn.answer ?? null;

  // 1 — the reading. Once: every stage below is handed this value rather than re-detecting the text,
  // which is the property that keeps a report from containing two opinions about one message.
  const detection = detectLanguage(turn.text, { memory });

  // 2 — the interaction.
  const context = analyzeCommunication(turn.text, { memory, detection });

  // 3 — what is known about this person. `storedResponseOptions` is the one reader that knows the
  // setting, the counts and the statements are three keys, and it already distinguishes "no history"
  // from "a history that happens to be empty".
  const stored = storedResponseOptions(
    options.storage === undefined ? preferenceStorage() : options.storage,
  );
  const learned = learnedLanguage(stored.observations);
  const stated = statedPreference<ReplyLanguage>(stored.corrections, 'language');
  const reply = resolveLanguage(stored.preference, detection, learned, stated);

  // 4 — the product's own Persian, as the store authorises it.
  const concepts = conceptsIn(context, memory);
  const rules = authorisedLanguageRules(memory).map((rule) => rule.id);
  const protectedForms = protectedLiterals(memory);

  // 5 — the answer, read by the correction catalogue. A message is somebody's own writing: the reading
  // stages above report what it *is*, and this catalogue is about what this product *writes*.
  const qa =
    answer === null ? null : languageQa(answer, { memory, exceptRules: options.exceptRules });

  // 6 — what the answer owes this turn. The same detection and the same three signals as stage three,
  // so the two cannot disagree: the suite asserts the two resolutions are one value.
  const response = responseControl(turn.text, {
    memory,
    detection,
    preference: stored.preference,
    observations: stored.observations,
    corrections: stored.corrections,
  });

  // 7 — the answer as it was owed: the tone and the terminology are the response stage's own resolved
  // decision and the mixing is the context stage's reading, which is exactly the context 7.5.3.5.3
  // requires and the reason it requires one. The store's protected forms go with it, so a form a person
  // approved is not raised as a candidate the day after they approved it.
  const learningContext: NaturalnessContext = {
    tone: response.guidance.tone,
    terminology: response.guidance.terminology,
    mixing: context.terminology.value,
  };
  const reading =
    answer === null
      ? null
      : readPersianAnswer({
          text: answer,
          context: learningContext,
          evidence: turn.evidence ?? 'pipeline',
          observedAt: at,
          surface: turn.surface ?? 'answer',
          protectedLiterals: protectedForms,
          ...(options.exceptChecks === undefined ? {} : { exceptChecks: options.exceptChecks }),
        });
  const candidates = reading?.candidates ?? [];
  const feedback =
    turn.feedback === undefined || turn.feedback === null
      ? null
      : recordFeedback(
          turn.feedback,
          { surface: turn.correctionSurface ?? 'workspace', recordedAt: at },
          stored.corrections ?? emptyCorrections(),
        );

  // 8 — the corpus, re-read on every run.
  const regression = regressionCheck(options.cases ?? []);

  return {
    version: LANGUAGE_PIPELINE_VERSION,
    input: turn.text,
    text: turn.text,
    answer,
    detection,
    context,
    memory: {
      preference: stored.preference,
      samples: stored.observations?.samples ?? 0,
      learned,
      stated,
      reply,
      reason: memoryReason(stored.preference, stored.observations ?? null, stated, reply),
    },
    knowledge: {
      concepts,
      rules,
      protectedForms,
      reason: knowledgeReason(concepts, rules, protectedForms, context),
    },
    qa,
    response,
    learning: {
      context: learningContext,
      report: reading?.report ?? null,
      candidates,
      feedback,
      reason: learningReason(answer, candidates, turn.feedback ?? null, learningContext),
    },
    regression,
    stages: LANGUAGE_PIPELINE_STAGES,
    invariants: GUIDANCE_INVARIANTS,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The two projections, and the four sentences
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The turn's concepts, as the lexicon holds them.
 *
 * A concept the catalogue does not know is dropped rather than guessed: the ids come from
 * `detectLanguage`'s own census, which reads them through the same lexicon, so a miss here is a term a
 * reviewed candidate added between the two reads rather than a term this file failed to find. `flatMap`
 * keeps the census's order, which is the order the person wrote the concepts in.
 */
function conceptsIn(context: CommunicationContext, memory: LanguageMemory): PipelineConcept[] {
  const byId = new Map(lexiconTerms(memory).map((term) => [term.id, term]));
  return context.terms.flatMap((id) => {
    const term = byId.get(id);
    if (term === undefined) return [];
    return [
      {
        id: term.id,
        domain: term.domain,
        fa: term.preferredFa,
        en: term.english,
        retired: term.supersededFa,
      },
    ];
  });
}

/** How a setting is written in a sentence. Three values, and `auto` is not one of the two languages. */
function describePreference(preference: LanguagePreference): string {
  return preference === 'auto'
    ? 'automatic'
    : `set to ${preference === 'fa' ? 'Persian' : 'English'}`;
}

/**
 * What stage three read, in one sentence.
 *
 * It names the three sources and the one that answered, in that order, because the value of this stage is
 * the *ordering*: a person who sees an English answer to a Persian message should be able to read which
 * of their own choices or habits produced it.
 */
function memoryReason(
  preference: LanguagePreference,
  observations: CommunicationObservations | null,
  stated: StatedPreference<ReplyLanguage> | null,
  reply: LanguageReply,
): string {
  const samples = observations?.samples ?? 0;
  return `${samples === 0 ? 'nothing has been learned from previous turns yet' : `${samples} previous turn(s) are counted`}, ${
    stated === null
      ? 'nothing has been stated outright'
      : `a statement about the language has been made ${stated.confirmations} time(s)`
  }, and the setting is ${describePreference(preference)}; the resolver answered from ${reply.source}. ${reply.reason}`;
}

/** What stage four found: the concepts, the rules and the protected forms, counted rather than listed. */
function knowledgeReason(
  concepts: readonly PipelineConcept[],
  rules: readonly string[],
  protectedForms: readonly string[],
  context: CommunicationContext,
): string {
  const domains =
    context.domains.length === 0
      ? ''
      : `, in the ${context.domains.join(' and ')} domain(s) it reads as being about`;
  return `the turn names ${concepts.length} concept(s) of the product's vocabulary${domains}, the store trusts ${rules.length} rule(s) and ${protectedForms.length} protected form(s), and nothing in this stage decides anything: it reports what the knowledge store authorises.`;
}

/**
 * What stage seven found.
 *
 * The sentence says which text was read, because that is the stage's whole subject: a report that could
 * not tell "no candidates" from "no answer to read" would be a report nobody could act on.
 */
function learningReason(
  answer: string | null,
  candidates: readonly LearningCandidate[],
  feedback: ResponseFeedback | null,
  context: NaturalnessContext,
): string {
  if (answer === null) {
    return 'no answer was brought, so nothing was read for learning: this stage reads text the product wrote, and a message is somebody’s own writing.';
  }
  const detectors = candidates.filter((candidate) => candidate.source === 'detector').length;
  const notes = candidates.length - detectors;
  return `the answer was read in the ${context.tone} tone with ${context.terminology} terminology against a ${context.mixing} mix, producing ${detectors} detector finding(s) and ${notes} note(s)${
    feedback === null
      ? ', and the person said nothing about it'
      : `, and the person's verdict was recorded as a statement with source feedback`
  }. A candidate is not knowledge: the ledger decides whether it has been seen enough times to be one.`;
}
