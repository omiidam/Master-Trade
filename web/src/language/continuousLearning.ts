/**
 * Persian continuous learning, and the corpus that keeps a fixed error fixed — Phase 7.5.3.5.4.
 *
 * The phase connects an evaluation to a *loop*: a defect is seen, a correction is proposed, validation
 * and a confidence decide whether it is knowledge, a person accepts or rejects it, trusted knowledge is
 * updated, and a regression test holds the result. Written out, that flow is:
 *
 *   detected issue → candidate → validation → confidence → accept/reject → knowledge update → test
 *
 * The two things that make this a *controlled* loop rather than a suggestion box, and where each lives:
 *
 *   - **A single example is not a rule.** A detector's reading starts at `LEARNING_CONFIDENCE.detector`
 *     and needs `LEARNING_THRESHOLDS.evidence.detector` *distinct* sightings — distinct evidence labels,
 *     not repeated sightings of one answer — before it is `ready` to become knowledge at all. Repetition
 *     inside one text therefore promotes nothing, and the corroboration is counted per observation,
 *     across calls, in a ledger that outlives the answer that produced it.
 *   - **A person outranks the detector.** A correction a person states starts at `0.9`, is ready on its
 *     own, *supersedes* the detector's reading of the same form rather than sitting beside it, is applied
 *     through a trusted origin (so it lands as knowledge immediately, while a detector can only ever leave
 *     a `pending` proposal behind), and is the only sighting that reopens a candidate somebody rejected
 *     earlier. That is "explicit user corrections have highest priority" as four rules instead of a
 *     promise.
 *
 * What it deliberately reuses, rather than re-deriving
 * ---------------------------------------------------
 *
 * This module holds no checker, no lexicon, no rule catalogue, no confidence model of its own and no
 * second store:
 *
 *   - the reading is `evaluatePersianNaturalness`, which is `evaluatePersianQuality` re-read against a
 *     context — so grammar, spelling, punctuation, ZWNJ and spacing, script, register and repetition all
 *     arrive as *verdicts*, and the family a candidate belongs to is `learningFamilyOf`, a total table
 *     over the two catalogues' own `axis`, `aspect` and `reading` fields. A new axis in `evaluation.ts`
 *     or a check in `naturalness.ts` fails the type here until somebody says what it means.
 *   - the knowledge update is the language store's own path: `propose` (which decides status from the
 *     origin, versions every key and logs every change) and, for an approved form, `approveForm` — Phase
 *     7.5.2.3's own decision, so an accepted form enters the *same* exception entries the pipeline's
 *     protected-literal set already reads.
 *   - the ledger and the corpus are value shapes read and written through the language layer's storage
 *     seam (`preference.ts`), which is where `learning.ts` keeps its own statements. Nothing here touches
 *     the Agent Memory and nothing here can reach a credential: the key is in the language namespace, the
 *     schema is closed, and the only fields a stored value may hold are a rule id, a form, a correction,
 *     an opaque evidence label and a timestamp.
 *
 * What an accepted correction actually changes, and what it does not
 * ----------------------------------------------------------------
 *
 * There are exactly two decisions a person can make about a candidate, and each has one effect:
 *
 *   - **`form-is-right`** — the rule is wrong about this form. The form enters the store as an
 *     `exception` entry through `approveForm`, which is what stops the checks reporting it and what
 *     `protectedLiterals` hands the pipeline. The case records that the rule must stay silent.
 *   - **`form-is-wrong`** — the rule is right about this form. The decision is recorded as a worked
 *     `example` entry (what the product writes, the form it replaces, and the text that shows it), and the
 *     case records that the rule must keep reporting it.
 *
 * Neither of them edits a rule. A rule changes in code, with a version and a diff, which is why the
 * phase's "prevent previously fixed Persian errors from returning" is a *corpus* here rather than a store
 * write: `regressionCheck` re-reads every confirmed case on every run and reports the ones whose rule has
 * stopped behaving. The suite passes that output straight to an assertion, so a fix that is undone fails
 * the build instead of quietly returning.
 *
 * A candidate whose shape no rule reads yet is *referred*, never stored: the correction stays in the
 * ledger as a `ready` observation, and the reason says that a rule is a code change. The loop never claims
 * a case it cannot run, and it never writes knowledge it cannot check.
 *
 * Nothing here rewrites an answer, changes what a rule does, or decides meaning. `LEARNING_LIMITS` is the
 * list of things this loop does not judge, and the two reading layers publish their own; a report that
 * listed only what it checks would invite a reader to treat its silence as approval.
 */

import { z } from 'zod';
import {
  GUIDANCE_TERMINOLOGY,
  GUIDANCE_TONES,
  type GuidanceTerminology,
  type GuidanceTone,
} from '@shared/language/guidance';
import type { LanguageKnowledgeEntry, LanguageOrigin } from './model.js';
// A type, not a value: this module writes through the store a caller hands it, and never constructs one,
// fetches one or keeps one — which is what lets the reading half run where no store exists.
import type { LanguageMemory } from './memory.js';
import { CONTEXT_MIXINGS } from './context.js';
import {
  LANGUAGE_QUALITY_CHECKS,
  type LanguageQualityAxis,
  type LanguageQualityReading,
} from './evaluation.js';
import {
  NATURALNESS_CHECKS,
  evaluatePersianNaturalness,
  type NaturalnessAspect,
  type NaturalnessContext,
  type NaturalnessReport,
  type NaturalnessVerdict,
} from './naturalness.js';
import { approveForm } from './languageQa.js';
import { normalizePersianContent } from './normalize.js';
import { preferenceStorage, type PreferenceStorage } from './preference.js';

/* ────────────────────────────────────────────────────────────────────────────
 * The vocabularies
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The families a correction can belong to.
 *
 * These are the sources the phase names — spelling, grammar, punctuation, ZWNJ and spacing, terminology,
 * wording, naturalness, the mixing of the two scripts, and the context — and they are the *reader's*
 * grouping rather than a new taxonomy: every one of them is reached from a field the two catalogues
 * already carry (see the three tables below), so a candidate cannot be invented into a family nothing
 * checks.
 */
export const LEARNING_FAMILIES = [
  'grammar',
  'spelling',
  'punctuation',
  'zwnj-spacing',
  'wording',
  'terminology',
  'naturalness',
  'script',
  'context',
] as const;
export type LearningFamily = (typeof LEARNING_FAMILIES)[number];

/**
 * Who saw it, in the order of authority — weakest first, because the list *is* the precedence rule.
 *
 * `note` is a reading the layer itself offers only as a note — a register question, a Latin token where
 * the product's own terms were asked for: worth recording, never worth promoting on its own. `detector`
 * is a `problem` verdict, the layer's own complaint. `user-correction` is a person saying what the product
 * should write, and it outranks both: it supersedes a detector's reading of the same form, it is ready on
 * one sighting, and it is applied with a trusted origin.
 */
export const LEARNING_SOURCES = ['note', 'detector', 'user-correction'] as const;
export type LearningSource = (typeof LEARNING_SOURCES)[number];

/** Where the text that produced a candidate came from. Provenance, and nothing else. */
export const LEARNING_SURFACES = ['answer', 'copy', 'review'] as const;
export type LearningSurface = (typeof LEARNING_SURFACES)[number];

/**
 * Where an observation is in its life.
 *
 * `observed` is everything below the bar; `ready` is a candidate that may become knowledge, and the only
 * state a decision may act on; `accepted` means knowledge was written for it; `rejected` means a person
 * decided it is noise. Nothing is ever deleted: a rejected observation keeps its sightings, its reason and
 * the review that turned it down, which is what makes "we already looked at this" answerable.
 */
export const LEARNING_STATES = ['observed', 'ready', 'accepted', 'rejected'] as const;
export type LearningState = (typeof LEARNING_STATES)[number];

/** What a rule must do with a case's form, now that the product has decided about it. */
export const LEARNING_EXPECTATIONS = ['reported', 'accepted'] as const;
export type LearningExpectation = (typeof LEARNING_EXPECTATIONS)[number];

/** What happened to a candidate that was handed to the ledger. A value, not an exception. */
export const LEARNING_OUTCOMES = [
  'recorded',
  'confirmed',
  'superseded',
  'reopened',
  'kept-rejected',
  'refused',
] as const;
export type LearningOutcome = (typeof LEARNING_OUTCOMES)[number];

/** What a decision did to the knowledge store. A refusal is a value here for the same reason. */
export const LEARNING_ACTIONS = [
  'accepted',
  'pending',
  'referred',
  'not-ready',
  'refused',
] as const;
export type LearningAction = (typeof LEARNING_ACTIONS)[number];

/**
 * What each source is worth before it has been corroborated.
 *
 * The gaps are the design. A `note` is a reading the layer itself declined to call a problem, so it starts
 * *below* the bar and needs `LEARNING_THRESHOLDS.evidence.note` sightings before it is worth a person's
 * attention. A `detector` finding is a complaint and starts almost at the bar, needing two more
 * independent sightings to cross it — which is what turns "a rule noticed this once" into "three answers
 * written by three turns made the same mistake". A person's own correction is a statement and starts above
 * the bar, so no amount of repetition is required of somebody who has already said it.
 */
export const LEARNING_CONFIDENCE: Readonly<Record<LearningSource, number>> = {
  note: 0.3,
  detector: 0.45,
  'user-correction': 0.9,
};

/** What one further, *distinct* sighting adds to a candidate's confidence. */
export const CORROBORATION_STEP = 0.15;

/**
 * The numbers the loop decides by, in one table.
 *
 * Exported because a threshold is a judgement with a number attached. `confidence` is where a candidate
 * crosses `LEARNING_CONFIDENCE.detector` on its third sighting (0.45 → 0.60 → 0.75) and a `note` on its
 * fourth (0.30 → 0.45 → 0.60 → 0.75) — so the arithmetic in this table is also the sentence "one uncertain
 * example never becomes a rule". `evidence` is the corroboration requirement per source, and both have to
 * hold: a candidate can be confident and seen once, and it is still not ready.
 */
export const LEARNING_THRESHOLDS = {
  /** The confidence a candidate needs before a decision may act on it. */
  confidence: 0.75,
  /** Distinct evidence labels each source needs, so a repetition inside one text counts once. */
  evidence: { note: 4, detector: 3, 'user-correction': 1 },
  /** How many evidence labels one observation keeps. Older labels are dropped, and only the count is read. */
  maxEvidence: 8,
  /** How many observations the ledger keeps. A bound on what a *reader* will hold, not a policy. */
  maxObservations: 256,
  /** The longest a regression probe may be: a case is a sentence or two, not a document. */
  probe: 200,
} as const;

/**
 * What this loop cannot judge, named so that a silent report is not read as approval.
 *
 * The two reading layers' own limits are not repeated here — `NaturalnessReport.notEvaluated` carries
 * them — and these are the six that belong to *learning*.
 */
export const LEARNING_LIMITS: readonly string[] = [
  'a rule that does not exist yet — a confirmed defect whose shape no check reads is referred, not stored: a rule is a code change with a version and a diff, and this loop writes knowledge rather than code',
  'whether a correction is the better wording — the loop records which of two forms the product writes, and validates that the correction is canonical Persian; that a Persian speaker would prefer it is a reviewer’s judgement, and their provenance is what the store keeps',
  'meaning — a correction changes characters, and whether the sentence still says what its writer meant is not something either reading layer claims to know',
  'who wrote the text: an evidence label is an opaque count of sightings, and no field a stored value may hold can name a person, a message or a session',
  'a candidate seen in one text: the corroboration rule refuses it, and repeating it inside that same text does not change the count',
  'a rule that is systematically wrong about a shape: corroboration counts texts rather than truth, so a misread subject or a heading the rules cannot tell from a question is seen often enough to cross the bar — running this loop over the product’s own Persian copy raises 22 of `grammar.verb-number-agreement` and the one `grammar.pronoun-agreement` that the naturalness layer already names as its own limits, and every one of them is a rule the reading layer says is not good enough alone. The answer is a rejection, which is recorded and stands; what this loop must never do is promote a finding nobody reviewed',
  'anything about the interface: a correction is knowledge about Persian, and the interface’s own copy is a different layer (Phase 7.5.3.3)',
];

/**
 * The storage key.
 *
 * In the language layer's namespace beside the setting, the counts and the statements, and outside both
 * the knowledge store's (`lang:`) and the Agent Memory's (`mem_`) namespaces. What it holds is a ledger
 * about *text*: rule ids, forms, evidence counts and timestamps, and no field a credential could sit in.
 */
export const LANGUAGE_LEARNING_KEY = 'master-trade.language.learning';

/** The check id a person's own correction carries when they are not naming a rule. */
export const USER_CORRECTION_CHECK = 'user.correction';

/**
 * The check id a terminology question carries.
 *
 * Not a check and deliberately not one: no rule in either catalogue reads "is this token the product's
 * vocabulary", because that question is answered by the lexicon and decided by a reviewer. The id exists so
 * that the ledger can hold the question with a name, and `decideObservation` refers it to the path that can
 * answer it.
 */
export const TERMINOLOGY_CHECK = 'terminology.lexicon';

/* ────────────────────────────────────────────────────────────────────────────
 * Where a check belongs — three total tables, read from the catalogues themselves
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The family a reading's axis decides.
 *
 * `spacing` and `zwnj` are one family because they are one question to a reader — the space around a
 * half-space — and the phase names them together for the same reason.
 */
const FAMILY_OF_AXIS: Readonly<Record<LanguageQualityAxis, LearningFamily>> = {
  grammar: 'grammar',
  wording: 'wording',
  spelling: 'spelling',
  punctuation: 'punctuation',
  spacing: 'zwnj-spacing',
  zwnj: 'zwnj-spacing',
  script: 'script',
};

/**
 * The readings whose family is not their axis's, and the ones that keep their axis (`null`).
 *
 * Total by type, so a sixth reading in `evaluation.ts` fails the build here and whoever adds it says what
 * it means. `conversational` is a register question — the context decides whether a spoken form is right,
 * which makes it the `context` family rather than a wording defect. `terminology` is the vocabulary
 * question. `error` keeps its axis, because where an error sits is what it is about; `intentional-english`
 * and `user-wording` keep theirs, because neither is a defect at all.
 */
const FAMILY_OF_READING: Readonly<Record<LanguageQualityReading, LearningFamily | null>> = {
  error: null,
  conversational: 'context',
  terminology: 'terminology',
  'intentional-english': null,
  'user-wording': null,
};

/**
 * The family a naturalness aspect decides.
 *
 * The four aspects this layer's own six checks use are the ones that matter; `spelling` and `marks` cannot
 * arise from an own check — they are quality findings, and a quality finding takes the axis path above —
 * but the table is total so that adding one here would be a decision rather than a default.
 */
const FAMILY_OF_ASPECT: Readonly<Record<NaturalnessAspect, LearningFamily>> = {
  wording: 'naturalness',
  structure: 'naturalness',
  repetition: 'naturalness',
  spelling: 'spelling',
  marks: 'punctuation',
  script: 'script',
  register: 'context',
};

/**
 * Whether this build can read a check id again.
 *
 * The two catalogues, plus the two ids that are not rules but questions this ledger records by name — a
 * person's own correction and a terminology question. A candidate whose check is none of them is refused at
 * the door: the ledger would hold a finding nothing in this build could ever re-read, and a case built on it
 * would be a promise rather than a test.
 */
function readableCheck(check: string): boolean {
  return (
    check === USER_CORRECTION_CHECK ||
    check === TERMINOLOGY_CHECK ||
    learningFamilyOf(check) !== null
  );
}

/** The quality catalogue by id, so a check id from a report resolves to its axis and reading. */
const QUALITY_CHECK_BY_ID = new Map(LANGUAGE_QUALITY_CHECKS.map((check) => [check.id, check]));

/** The naturalness catalogue by id, for the same reason. */
const NATURALNESS_CHECK_BY_ID = new Map(NATURALNESS_CHECKS.map((check) => [check.id, check]));

/** The prefix a re-read quality finding's check carries in a naturalness report. */
const QUALITY_PREFIX = 'quality.';

/**
 * Which family a check belongs to, or nothing when this build has no such check.
 *
 * The one door between the reading layers and this one, and it takes the *verdict's* check id: a quality
 * finding arrives as `quality.<id>` because that is how the naturalness layer names it, so the prefix is
 * stripped before the catalogue is asked.
 */
export function learningFamilyOf(check: string): LearningFamily | null {
  const bare = check.startsWith(QUALITY_PREFIX) ? check.slice(QUALITY_PREFIX.length) : check;
  const quality = QUALITY_CHECK_BY_ID.get(bare);
  if (quality !== undefined) {
    return FAMILY_OF_READING[quality.reading] ?? FAMILY_OF_AXIS[quality.axis];
  }
  const natural = NATURALNESS_CHECK_BY_ID.get(check);
  return natural === undefined ? null : FAMILY_OF_ASPECT[natural.aspect];
}

/* ────────────────────────────────────────────────────────────────────────────
 * What is observed, and what it adds up to
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * One correction, as it was seen. This is the candidate the phase's second step names.
 *
 * It carries the sighting with it (`evidence`, `observedAt`, `surface`, `context`) rather than taking it as
 * an argument later, because a candidate is *about* a text and a reading that has lost which text it came
 * from is a reading nobody can corroborate.
 */
export interface LearningCandidate {
  readonly family: LearningFamily;
  /** The rule that saw it, or `user.correction` when a person is the one who saw it. */
  readonly check: string;
  /** The characters in question. A form, never a sentence: the ledger stores findings, not documents. */
  readonly form: string;
  /** What the product writes instead. `''` means delete, `null` means neither layer offers one. */
  readonly correction: string | null;
  readonly reason: string;
  readonly source: LearningSource;
  /** An opaque label for where this was seen — an answer id, a page, a review. Never stored as content. */
  readonly evidence: string;
  readonly observedAt: string;
  readonly surface: LearningSurface;
  /** What the text was judged against, which a regression case has to keep to be replayable. */
  readonly context: NaturalnessContext;
}

/** What a caller hands the reading half. */
export interface LearningInput {
  /** The text that was read: an answer, or the product's own Persian copy. */
  readonly text: string;
  /** The context the text was judged in. Required, for the reason `naturalness.ts` requires one. */
  readonly context: NaturalnessContext;
  readonly evidence: string;
  readonly observedAt: string;
  readonly surface: LearningSurface;
  /** Text this reading must not comment on, as the reading layers take it. */
  readonly protectedLiterals?: readonly string[];
  /** Checks to leave out, as either catalogue names them. */
  readonly exceptChecks?: readonly string[];
}

/** What a person states outright: the form, and what the product should write instead. */
export interface UserCorrectionInput {
  readonly family: LearningFamily;
  /** A form the product writes wrongly. */
  readonly form: string;
  /** What the person says it should be. An empty string means the form should not be there at all. */
  readonly correction: string;
  /** One sentence on why, kept on the observation and read by whoever reviews it. */
  readonly reason: string;
  readonly evidence: string;
  readonly observedAt: string;
  readonly surface: LearningSurface;
  /** The rule the person is correcting. Omitted when they are reporting a shape no rule reads. */
  readonly check?: string;
  /** The context the person was reading in: the product decides a period’s register, a period does not. */
  readonly context: NaturalnessContext;
}

/**
 * One thing seen, added up.
 *
 * `readings` is how many times it was seen and `evidence` is *where*, which are two different facts and
 * only the second one is corroboration: a rule that fires twice in one answer has been seen twice and still
 * by one text. Confidence is computed from the evidence count and the source, never asserted by a caller.
 */
export interface LearningObservation {
  readonly id: string;
  readonly family: LearningFamily;
  readonly check: string;
  readonly form: string;
  readonly correction: string | null;
  readonly source: LearningSource;
  readonly reason: string;
  readonly context: NaturalnessContext;
  /** How many sightings there have been, of any source. */
  readonly readings: number;
  /** The distinct labels sightings came from, oldest first, bounded. Its *length* decides readiness. */
  readonly evidence: readonly string[];
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly state: LearningState;
  readonly confidence: number;
  /** The review that turned it down: when, and why. Kept rather than deleted. */
  readonly rejected: { readonly at: string; readonly reference: string } | null;
}

/**
 * One confirmed failure, as a permanent case.
 *
 * The case holds the smallest text that shows the finding (`probe`), the rule that must behave (`check`),
 * and what it must do (`expected`). `check` is `null` for an accepted form no rule reads: there the case
 * asserts that no check in the family reports the form, which is what keeps the product's decision when a
 * new check arrives later.
 */
export interface LanguageRegressionCase {
  readonly id: string;
  readonly family: LearningFamily;
  /** The rule the case is about, or `null` when the decision was that no rule should report the form. */
  readonly check: string | null;
  readonly probe: string;
  readonly form: string;
  /**
   * What the product writes instead. The form itself on an `accepted` case, because the decision there is
   * that this is how it is written.
   */
  readonly correction: string;
  readonly expected: LearningExpectation;
  readonly context: NaturalnessContext;
  readonly confirmedAt: string;
  /** The decision the case holds: the knowledge key, or the reference of the review that confirmed it. */
  readonly reference: string;
}

/**
 * The field names a stored observation may have, in one place, asserted by the suite.
 *
 * The same guard `learning.ts` keeps over its statements and for the same reason: every field is a rule id,
 * a form, a closed value, a count or a timestamp. There is no field a message, a word from one, an account
 * or a credential could sit in — so a field added to carry one fails the suite instead of shipping as a
 * quiet addition to a ledger that is written to storage.
 */
export const OBSERVATION_FIELDS = [
  'id',
  'family',
  'check',
  'form',
  'correction',
  'source',
  'reason',
  'context',
  'readings',
  'evidence',
  'firstSeen',
  'lastSeen',
  'state',
  'confidence',
  'rejected',
] as const;

/**
 * The field names a stored case may have: a rule id, two forms, the probe that shows the finding, and the
 * decision it holds. The probe is the one field that is prose, and it is the caller's: product copy, or a
 * sentence a reviewer wrote for the case — never the answer the finding was seen in.
 */
export const CASE_FIELDS = [
  'id',
  'family',
  'check',
  'probe',
  'form',
  'correction',
  'expected',
  'context',
  'confirmedAt',
  'reference',
] as const;

/** The ledger and the corpus, with the store's own version. Nothing is ever deleted from either. */
export interface LearningStore {
  readonly version: number;
  readonly observations: readonly LearningObservation[];
  readonly cases: readonly LanguageRegressionCase[];
}

/** What one candidate did to the ledger. */
export interface ObservationDecision {
  readonly id: string;
  readonly outcome: LearningOutcome;
  /** The observation as it stands after the write, or `null` when the candidate was refused. */
  readonly observation: LearningObservation | null;
  readonly reason: string;
}

/** What turning a candidate down did. It carries the store, because a rejection *is* a write to it. */
export interface RejectionDecision {
  readonly id: string;
  readonly outcome: LearningOutcome;
  readonly store: LearningStore;
  readonly observation: LearningObservation | null;
  readonly reason: string;
}

/** What a decision did to the knowledge store and the corpus. */
export interface LearningDecision {
  readonly id: string;
  readonly action: LearningAction;
  /** The store as it stands after the decision. Untouched for every action but `accepted`. */
  readonly store: LearningStore;
  /** The knowledge entry the decision wrote, or the one already waiting for a review. */
  readonly entry: LanguageKnowledgeEntry | null;
  /** The case the decision added, or `null`. A case is written only for accepted knowledge. */
  readonly case: LanguageRegressionCase | null;
  readonly reason: string;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The ledger: identity, confidence, and the store's own value
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The identity of a candidate: what makes two sightings the same finding.
 *
 * A family and a form, and deliberately neither the rule nor the correction. The rule is *who saw it* and
 * the correction is *what they propose*, while the claim being recorded is one thing: this product has
 * something to decide about that form, in that family. Keeping the rule out of the id is what makes
 * precedence possible — a detector's reading and a person's correction of the same form are one candidate,
 * so the person's can supersede the machine's rather than sitting beside it for a reviewer to choose
 * between. Keeping the correction out means two proposals about one form are one decision, which is the
 * honest shape: the product writes one thing.
 */
export function learningObservationId(candidate: {
  readonly family: LearningFamily;
  readonly form: string;
}): string {
  return `${candidate.family}|${candidate.form}`;
}

/** The confidence a candidate carries with this many distinct sightings. */
function confidenceOf(source: LearningSource, evidence: number): number {
  const base = LEARNING_CONFIDENCE[source];
  return Math.min(1, Number((base + (evidence - 1) * CORROBORATION_STEP).toFixed(2)));
}

/** Where a source stands in the precedence list — the number "outranks" is decided by. */
function rankOf(source: LearningSource): number {
  return LEARNING_SOURCES.indexOf(source);
}

/**
 * The state a candidate earns: both the confidence and the corroboration have to be there.
 *
 * A candidate a person has already accepted or turned down keeps the state it was given: a decision is not
 * re-opened by arithmetic.
 */
function stateOf(
  source: LearningSource,
  evidence: number,
  current: LearningState = 'observed',
): LearningState {
  if (current === 'accepted' || current === 'rejected') return current;
  const ready =
    confidenceOf(source, evidence) >= LEARNING_THRESHOLDS.confidence &&
    evidence >= LEARNING_THRESHOLDS.evidence[source];
  return ready ? 'ready' : 'observed';
}

/** The store with one decision counted: the version moves on every write, as the knowledge store's does. */
function advanced(
  store: LearningStore,
  observations: readonly LearningObservation[],
): LearningStore {
  return { ...store, version: store.version + 1, observations };
}

export function emptyLearningStore(): LearningStore {
  return { version: 0, observations: [], cases: [] };
}

/** Every observation that may become knowledge, in the ledger's own order. */
export function readyObservations(store: LearningStore): readonly LearningObservation[] {
  return store.observations.filter((observation) => observation.state === 'ready');
}

/* ────────────────────────────────────────────────────────────────────────────
 * Steps one and two: reading a text, and a person's own correction
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Whether a verdict is a candidate, and how much its source is worth.
 *
 * The two layers sort everything into five stances, and this is the whole of the phase's "distinguish a
 * genuine problem from acceptable variation", read off that sorting rather than re-judged:
 *
 *   - **`problem`** — the layer's own complaint. A `detector` sighting, and the only stance that carries
 *     weight on its own.
 *   - **`style`** — the layer's "worth showing the writer, and not a defect": a repeated word, a phrase
 *     the context did not ask for, a register the tone did not ask for. A `note` sighting: recorded,
 *     needing more corroboration than a complaint before it is worth a person's decision, and never
 *     promoted on one reading.
 *   - **`acceptable`, `technical-english`, `user-wording`** — agreement, not disagreement. Spoken Persian
 *     in an answer that was asked to be conversational, a Latin term whose English was requested, text the
 *     caller or a reviewer marked as its own, a form somebody already decided about. These are recognised
 *     and *not* raised, which is why prose that is merely informal produces no candidate at all.
 */
function sourceOf(verdict: NaturalnessVerdict): LearningSource | null {
  if (verdict.stance === 'problem') return 'detector';
  return verdict.stance === 'style' ? 'note' : null;
}

/**
 * What the product writes in place of a finding, when the layers offer something.
 *
 * The quality layer's finding carries `instead`; the naturalness layer's own checks deliberately offer no
 * replacement, and its verdict does not carry one either — so the correction is read from the quality
 * report the verdict was re-read from, matched on the rule and the characters. A finding with no
 * replacement stays `null`, which is the honest value: a wording judgement has to say why, and inventing a
 * phrase the product does not write would be this layer making a copy decision.
 */
function correctionFor(verdict: NaturalnessVerdict, report: NaturalnessReport): string | null {
  const bare = verdict.check.startsWith(QUALITY_PREFIX)
    ? verdict.check.slice(QUALITY_PREFIX.length)
    : verdict.check;
  const finding = report.quality.findings.find(
    (candidate) => candidate.check === bare && candidate.found === verdict.found,
  );
  return finding?.instead ?? null;
}

/**
 * Read a text and propose what a person might decide about.
 *
 * Three sources and no others, each a rule rather than a heuristic:
 *
 *   1. the report's `problem` verdicts, family by family through `learningFamilyOf`;
 *   2. the report's `style` notes — repetition, a phrase or a register the context did not ask for — at the
 *      note's own, lower confidence (above);
 *   3. a **terminology question** — a token the quality layer *recognised* as terminology (a symbol, a
 *      code, a technology under its own name) in a text whose context asked for the product's own Persian
 *      forms, and whose mixing was not a whole sentence of English. That is the one case in which the
 *      product knows a Persian form may be owed and the answer did not use it, and it is raised with no
 *      correction at all: the Persian form is a lexicon decision, and `decideObservation` refers it there.
 *
 * Nothing is written anywhere and the text is not stored: what comes back is findings, and the ledger keeps
 * the findings rather than the document they were found in. One finding per form: a rule that reports an
 * Arabic yeh six times in one answer has said one thing about one form, and a list that repeated it would
 * invite a caller to read those six as corroboration, which is exactly the mistake the ledger's evidence
 * count exists to prevent.
 */
export function observePersianText(input: LearningInput): readonly LearningCandidate[] {
  const report = evaluatePersianNaturalness(input.text, input.context, {
    protectedLiterals: input.protectedLiterals,
    exceptChecks: input.exceptChecks,
  });
  const byId = new Map<string, LearningCandidate>();
  const candidates: LearningCandidate[] = [];
  const remember = (candidate: LearningCandidate): void => {
    const id = learningObservationId(candidate);
    if (byId.has(id)) return;
    byId.set(id, candidate);
    candidates.push(candidate);
  };
  const sighting = {
    evidence: input.evidence,
    observedAt: input.observedAt,
    surface: input.surface,
    context: input.context,
  };

  for (const verdict of report.verdicts) {
    const source = sourceOf(verdict);
    const family = learningFamilyOf(verdict.check);
    if (source === null || family === null) continue;
    remember({
      family,
      check: verdict.check,
      form: verdict.found,
      correction: correctionFor(verdict, report),
      reason: verdict.reason,
      source,
      ...sighting,
    });
  }

  if (input.context.terminology === 'product-terms' && input.context.mixing !== 'sentence') {
    for (const recognition of report.accepted) {
      if (recognition.kind !== 'terminology') continue;
      for (const token of recognition.found) {
        remember({
          family: 'terminology',
          check: TERMINOLOGY_CHECK,
          form: token,
          correction: null,
          reason:
            'This is a token the quality layer recognised as a symbol, a code or a name, in a text whose context asked for the product’s own Persian forms. Whether this product writes a Persian form for it is a lexicon decision, and the path that makes one is a terminology candidate with a reviewer’s provenance.',
          source: 'note',
          ...sighting,
        });
      }
    }
  }

  return candidates;
}

/**
 * A correction a person stated.
 *
 * The highest-priority source, and the only candidate this module builds from a caller's words rather than
 * from a rule's reading. It is still a *candidate*: it is validated and recorded like any other, and it
 * takes a different route only at the point of decision — where a trusted origin means the store applies it
 * at once instead of parking it as a proposal.
 */
export function correctionFromUser(input: UserCorrectionInput): LearningCandidate {
  return {
    family: input.family,
    check: input.check ?? USER_CORRECTION_CHECK,
    form: input.form,
    correction: input.correction,
    reason: input.reason,
    source: 'user-correction',
    evidence: input.evidence,
    observedAt: input.observedAt,
    surface: input.surface,
    context: input.context,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Steps three and four: validation, and what the sightings add up to
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The shape of a context, checked against the vocabularies the layers that own them publish.
 *
 * `z.custom` rather than a second list of the three: the tones and the terminology styles are the
 * guidance's, the mixing is 7.5.3.2's reading, and a stored value can therefore only describe a context
 * this build could judge an answer against. The check is a membership test rather than a shape test for
 * exactly that reason — but the type it produces is the one `NaturalnessContext` is, so nothing downstream
 * has to be told what the parse decided.
 */
const contextShape = z.strictObject({
  tone: z.custom<GuidanceTone>((value) =>
    (GUIDANCE_TONES as readonly string[]).includes(value as string),
  ),
  terminology: z.custom<GuidanceTerminology>((value) =>
    (GUIDANCE_TERMINOLOGY as readonly string[]).includes(value as string),
  ),
  mixing: z.custom<NaturalnessContext['mixing']>((value) =>
    (CONTEXT_MIXINGS as readonly string[]).includes(value as string),
  ),
});

/** One candidate's shape, checked before anything is recorded — even as a note. */
const candidateSchema = z.strictObject({
  family: z.enum(LEARNING_FAMILIES),
  check: z.string().min(1).max(120),
  form: z.string().min(1).max(120),
  correction: z.string().max(120).nullable(),
  reason: z.string().min(1).max(1000),
  source: z.enum(LEARNING_SOURCES),
  evidence: z.string().min(1).max(160),
  observedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'observedAt must be an ISO-8601 instant',
  }),
  surface: z.enum(LEARNING_SURFACES),
  context: contextShape,
});

/**
 * Whether a proposed replacement is one this product could write.
 *
 * The rule that makes this a *correction* loop rather than a typo counter: a correction has to differ from
 * the form it corrects — one that proposes the same thing is a rule that has lost track of its own finding
 * — and it has to be in canonical form, so a form cannot enter the ledger wearing an Arabic kaf the
 * normalizer would rewrite, which would make the same word two words depending on who asked. An empty
 * correction is a real answer: delete the form.
 */
function correctionRefusal(form: string, correction: string): string | null {
  if (correction === form) return `\`${form}\` is already the form this candidate proposes.`;
  if (correction !== '' && normalizePersianContent(correction).text !== correction) {
    return `\`${correction}\` is not in canonical form — this product normalizes Persian before it writes it.`;
  }
  return null;
}

/**
 * Whether a candidate is usable as it stands.
 *
 * The checks are the ones a reviewer would make before writing anything down, and the third is the one that
 * makes this a *correction* loop rather than a typo counter: a correction must be Persian this product
 * would itself write, and it must differ from the form it corrects. The second check is what keeps the
 * ledger's every entry re-readable: a finding nothing in this build could look at again would become a case
 * that can only fail.
 */
function refusalFor(candidate: LearningCandidate): string | null {
  if (candidate.form.trim() === '') return 'there is no form to correct.';
  if (!readableCheck(candidate.check)) {
    return `\`${candidate.check}\` is not a check this build has, so nothing could read the finding again.`;
  }
  return candidate.correction === null
    ? null
    : correctionRefusal(candidate.form, candidate.correction);
}

/**
 * Record what was seen, corroborating what has been seen before.
 *
 * The precedence rules of the whole phase are in this one loop, and each is a branch a test can point at:
 *
 *   - **A person outranks the detector.** A `user-correction` sighting supersedes a detector's reading of
 *     the same form — its correction and reason replace the detector's, the sightings stay — and no later
 *     detector sighting can overwrite it back. The *rule* the reading came from stays named: it is what the
 *     case will hold, and a decision about a form is not a decision to stop reading it.
 *   - **A rejection stands.** A candidate a person turned down records further sightings and stays
 *     rejected: the product does not re-raise a question somebody has answered. A person's own correction is
 *     the one thing that reopens it, because that is new information from the source that outranks it.
 *   - **Corroboration is distinct evidence.** A second reading of the *same* text is not a second reading:
 *     the label is already there, so `evidence` does not grow and neither does the confidence.
 */
export function recordObservations(
  candidates: readonly LearningCandidate[],
  store: LearningStore = emptyLearningStore(),
): { readonly store: LearningStore; readonly decisions: readonly ObservationDecision[] } {
  const observations = [...store.observations];
  const decisions: ObservationDecision[] = [];
  let current = store;

  for (const candidate of candidates) {
    const parsed = candidateSchema.safeParse(candidate);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'candidate'} ${issue.message}`)
        .join('; ');
      decisions.push({
        id: learningObservationId(candidate),
        outcome: 'refused',
        observation: null,
        reason: `the candidate is not usable: ${detail}`,
      });
      continue;
    }
    const refusal = refusalFor(candidate);
    if (refusal !== null) {
      decisions.push({
        id: learningObservationId(candidate),
        outcome: 'refused',
        observation: null,
        reason: refusal,
      });
      continue;
    }

    const id = learningObservationId(candidate);
    const index = observations.findIndex((observation) => observation.id === id);
    const existing = index < 0 ? undefined : observations[index];

    if (existing === undefined) {
      const observation: LearningObservation = {
        id,
        family: candidate.family,
        check: candidate.check,
        form: candidate.form,
        correction: candidate.correction,
        source: candidate.source,
        reason: candidate.reason,
        context: candidate.context,
        readings: 1,
        evidence: [candidate.evidence].slice(-LEARNING_THRESHOLDS.maxEvidence),
        firstSeen: candidate.observedAt,
        lastSeen: candidate.observedAt,
        state: stateOf(candidate.source, 1),
        confidence: confidenceOf(candidate.source, 1),
        rejected: null,
      };
      observations.push(observation);
      current = advanced(current, observations);
      decisions.push({
        id,
        outcome: 'recorded',
        observation,
        reason:
          observation.state === 'ready'
            ? 'the candidate was recorded, and a correction a person stated is sure enough to be read on its own.'
            : `the candidate was recorded with confidence ${observation.confidence} from one sighting; it is not knowledge until the same finding has been seen in ${LEARNING_THRESHOLDS.evidence[candidate.source]} texts.`,
      });
      continue;
    }

    const seen = existing.evidence.includes(candidate.evidence)
      ? existing.evidence
      : [...existing.evidence, candidate.evidence].slice(-LEARNING_THRESHOLDS.maxEvidence);
    const grown = seen.length > existing.evidence.length;
    const userOverrides = rankOf(candidate.source) > rankOf(existing.source);
    const rejected = existing.state === 'rejected';
    const reopened = rejected && candidate.source === 'user-correction';
    const source = userOverrides ? candidate.source : existing.source;

    const updated: LearningObservation = {
      ...existing,
      source,
      correction: userOverrides ? candidate.correction : existing.correction,
      reason: userOverrides ? candidate.reason : existing.reason,
      readings: existing.readings + 1,
      evidence: seen,
      lastSeen: candidate.observedAt,
      confidence: confidenceOf(source, seen.length),
      state: stateOf(source, seen.length, reopened ? 'observed' : existing.state),
    };
    observations[index] = updated;
    current = advanced(current, observations);

    const outcome: LearningOutcome = rejected
      ? reopened
        ? 'reopened'
        : 'kept-rejected'
      : userOverrides
        ? 'superseded'
        : 'confirmed';
    decisions.push({
      id,
      outcome,
      observation: updated,
      reason: rejected
        ? reopened
          ? 'a person’s own correction reopens what was turned down: the source that outranks the rejection has said something new.'
          : `a review already turned this down, so further sightings are counted (${updated.readings}) and the decision stands.`
        : userOverrides
          ? 'a person’s correction outranks the reading it was made against, so the correction and the reason are the person’s, the sightings stay, and the rule that reads the shape stays named so the case can hold it.'
          : grown
            ? `the finding has now been seen in ${seen.length} texts and carries confidence ${updated.confidence}.`
            : `the finding was seen again in a text already counted, so the evidence is still ${seen.length} and the confidence does not move.`,
    });
  }

  return { store: current, decisions };
}

/** A decision, as a slug a knowledge key can hold: Persian cannot be a key, so the id is digested. */
function slugFor(check: string, id: string): string {
  const rule = check
    .replace(QUALITY_PREFIX, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  let digest = 0x811c9dc5;
  for (const character of id) {
    digest ^= character.codePointAt(0) ?? 0;
    digest = Math.imul(digest, 0x01000193) >>> 0;
  }
  return `${rule}-${digest.toString(36)}`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Steps five and six: accept or reject, and the knowledge update
 * ──────────────────────────────────────────────────────────────────────────── */

/** What a person decided about a candidate. */
export interface LearningDecisionInput {
  /**
   * `form-is-right` — the rule is wrong about this form, and the product accepts it.
   * `form-is-wrong` — the rule is right, and the product writes something else.
   */
  readonly verdict: 'form-is-right' | 'form-is-wrong';
  /** Who decided. A trusted origin applies the knowledge; `agent-proposal` can only leave a proposal. */
  readonly origin: LanguageOrigin;
  readonly reference: string;
  readonly at: string;
  /**
   * What the product writes instead, when the layer that found the form offered no replacement.
   *
   * A grammar slip, a punctuation mistake and a half-space are reported with the characters to write in
   * their place, so `form-is-wrong` needs nothing more. The naturalness layer's own checks report a *shape*
   * — a frame carried over from English, a register the tone did not ask for — and deliberately offer no
   * wording, because inventing one would be that layer making a copy decision. A reviewer confirming one of
   * those is making that decision, and this is where they say what it is.
   */
  readonly correction?: string;
  /**
   * The shortest text that exhibits the finding, written for the case — the product's own copy, or a
   * sentence a reviewer writes. It is required for a confirmed defect and defaults to the form itself for an
   * accepted one, and it is *never* an answer's own text: a case is product knowledge, and an answer is
   * somebody's writing that the ledger deliberately does not keep.
   */
  readonly probe?: string;
}

/** The family's complaints about one text, as the reader sees them: the door to a case's rule search. */
function complaintsIn(
  probe: string,
  context: NaturalnessContext,
  protectedLiterals: readonly string[],
): readonly { readonly check: string; readonly family: LearningFamily; readonly found: string }[] {
  const report = evaluatePersianNaturalness(probe, context, { protectedLiterals });
  const found: { check: string; family: LearningFamily; found: string }[] = [];
  for (const verdict of report.verdicts) {
    // A complaint or a note: the two stances that say something is worth a person's attention. Everything
    // else the layer recognised is agreement, and agreement is not what a case is about.
    if (verdict.stance !== 'problem' && verdict.stance !== 'style') continue;
    const family = learningFamilyOf(verdict.check);
    if (family === null) continue;
    found.push({ check: verdict.check, family, found: verdict.found });
  }
  return found;
}

/** A refusal, with the sentence that explains it. */
function refuse(id: string, store: LearningStore, reason: string): LearningDecision {
  return { id, action: 'refused', store, entry: null, case: null, reason };
}

/**
 * Decide about a candidate, and write the knowledge if there is any to write.
 *
 * The order of the checks is the phase's own flow, and every stop is a named answer rather than a silence:
 *
 *   1. **is there such a candidate** — an id the ledger does not hold is refused;
 *   2. **was it already decided** — a rejected or accepted observation is not decided twice;
 *   3. **is it ready** — one sighting is not knowledge, and the reason says how many are;
 *   4. **is the question this loop's** — a terminology candidate is *referred*, with the reason naming the
 *      reviewed path it belongs to, because a word is lexicon knowledge and this loop corrects forms;
 *   5. **does the catalogue read the shape** — a form no rule reports is referred too: a rule is a code
 *      change with a version and a diff, and a case the loop cannot run would be a promise, not a test;
 *   6. **which decision** — accept a form (an `exception` entry, through `approveForm`) or confirm a defect
 *      (an `example` entry, and the case that keeps it fixed).
 *
 * Only step six writes, and it writes through the store's own proposal path, so an `agent-proposal` can only
 * ever leave something *pending*: an unreviewed reading cannot become trusted knowledge, and it cannot
 * produce a case either, because a case is a decision the product has made.
 */
export function decideObservation(
  id: string,
  store: LearningStore,
  memory: LanguageMemory,
  decision: LearningDecisionInput,
): LearningDecision {
  const observation = store.observations.find((candidate) => candidate.id === id);
  if (observation === undefined) {
    return refuse(id, store, `\`${id}\` is not an observation this ledger holds.`);
  }
  if (observation.state === 'rejected') {
    return refuse(
      id,
      store,
      'a review already decided this candidate, and a decided candidate is not decided twice.',
    );
  }
  if (observation.state === 'accepted') {
    return refuse(id, store, 'this candidate has already produced knowledge.');
  }
  if (observation.state !== 'ready') {
    return {
      id,
      action: 'not-ready',
      store,
      entry: null,
      case: null,
      reason: `a single sighting is not knowledge: this candidate has been seen in ${observation.evidence.length} texts and carries confidence ${observation.confidence}, and it needs ${LEARNING_THRESHOLDS.evidence[observation.source]} sightings at ${LEARNING_THRESHOLDS.confidence}.`,
    };
  }
  if (observation.family === 'terminology') {
    return {
      id,
      action: 'referred',
      store,
      entry: null,
      case: null,
      reason:
        'a term is lexicon knowledge rather than a correction: propose it through the terminology candidate path (`reviewTermCandidate`), where a reviewer’s provenance becomes the term’s, and this ledger stays out of it.',
    };
  }

  const probe =
    decision.verdict === 'form-is-right' ? (decision.probe ?? observation.form) : decision.probe;
  if (probe === undefined || probe.trim() === '') {
    return refuse(
      id,
      store,
      'a confirmed defect needs the text that exhibits it, written for the case, and this call brought none.',
    );
  }
  if (probe.length > LEARNING_THRESHOLDS.probe) {
    return refuse(id, store, `a probe is at most ${LEARNING_THRESHOLDS.probe} characters.`);
  }
  if (!probe.includes(observation.form)) {
    return refuse(id, store, `the probe does not contain \`${observation.form}\`.`);
  }

  // The validation step, and the only one that reads the text a second time: the rule a case will hold has
  // to actually report these characters in *this* probe. It is what turns "we decided something" into "we
  // decided something a test can check", and it happens before anything is written anywhere.
  const rule = complaintsIn(probe, observation.context, []).find(
    (verdict) => verdict.family === observation.family && verdict.found === observation.form,
  );
  if (rule === undefined) {
    return {
      id,
      action: 'referred',
      store,
      entry: null,
      case: null,
      reason: `no rule in this build reports \`${observation.form}\` in that text, so there is nothing for a case to hold and nothing for an approval to silence: a rule is a code change with a version and a diff. The observation stays ready, and it can be confirmed when the rule exists.`,
    };
  }

  const reference = decision.reference;
  const slug = slugFor(observation.check, observation.id);

  if (decision.verdict === 'form-is-right') {
    const approved = approveForm(observation.form, memory, {
      slug,
      origin: decision.origin,
      reference,
      at: decision.at,
      reason: observation.reason,
    });
    if (approved.outcome === 'rejected') {
      return refuse(id, store, approved.reason);
    }
    if (approved.outcome === 'pending') {
      return {
        id,
        action: 'pending',
        store,
        entry: approved.entry,
        case: null,
        reason: `${approved.reason} No case is written until a review with a trusted origin accepts it, because a case is a decision the product has made.`,
      };
    }
    const regressionCase: LanguageRegressionCase = {
      id: `${observation.family}.${slug}`,
      family: observation.family,
      check: rule.check,
      probe,
      form: observation.form,
      correction: observation.form,
      expected: 'accepted',
      context: observation.context,
      confirmedAt: decision.at,
      reference: approved.entry.key,
    };
    return {
      id,
      action: 'accepted',
      store: acceptCase(store, observation, regressionCase),
      entry: approved.entry,
      case: regressionCase,
      reason: `the form is knowledge now: \`${approved.entry.key}\` says this product accepts \`${observation.form}\`, which is what spares it in the pipeline, and the case holds that \`${rule.check}\` stays silent about it.`,
    };
  }

  const correction = decision.correction ?? observation.correction;
  if (correction === null) {
    return refuse(
      id,
      store,
      'neither layer offers a replacement for that form, so the decision has to say what the product writes instead: a wording judgement has to say what to write.',
    );
  }
  if (decision.correction !== undefined) {
    const bad = correctionRefusal(observation.form, decision.correction);
    if (bad !== null) return refuse(id, store, bad);
  }

  const key = `example.learning.${slug}`;
  const proposed = memory.propose({
    key,
    kind: 'example',
    value:
      correction === '' ? `\`${observation.form}\` is deleted rather than replaced.` : correction,
    origin: decision.origin,
    reference,
    recordedAt: decision.at,
    baseVersion: memory.get(key)?.version ?? 0,
    confidence: observation.confidence,
    examples: [observation.form],
    mapping: null,
    notes: `The product writes \`${correction}\` rather than \`${observation.form}\`. Shown by: ${probe}`,
  });
  if (proposed.outcome === 'pending') {
    return {
      id,
      action: 'pending',
      store,
      entry: proposed.entry,
      case: null,
      reason:
        'the decision came from an unreviewed origin, so it is recorded as a proposal and is not knowledge; a case is written only for a decision the product has made.',
    };
  }
  const regressionCase: LanguageRegressionCase = {
    id: `${observation.family}.${slug}`,
    family: observation.family,
    check: rule.check,
    probe,
    form: observation.form,
    correction,
    expected: 'reported',
    context: observation.context,
    confirmedAt: decision.at,
    reference: proposed.entry.key,
  };
  return {
    id,
    action: 'accepted',
    store: acceptCase(store, observation, regressionCase),
    entry: proposed.entry,
    case: regressionCase,
    reason: `the defect is knowledge now: \`${proposed.entry.key}\` records what this product writes instead, and the case holds \`${rule.check}\` to reporting \`${observation.form}\` — so an error this product fixed cannot come back quietly.`,
  };
}

/** The store with one observation marked accepted and one case appended. */
function acceptCase(
  store: LearningStore,
  observation: LearningObservation,
  regressionCase: LanguageRegressionCase,
): LearningStore {
  return {
    version: store.version + 1,
    observations: store.observations.map((candidate) =>
      candidate.id === observation.id ? { ...observation, state: 'accepted' } : candidate,
    ),
    cases: [...store.cases, regressionCase],
  };
}

/**
 * Turn a candidate down, with the reviewer's reason.
 *
 * Rejection writes nothing to any store — it is the decision *not* to change knowledge — but it is not a
 * silence either: the observation keeps its sightings and records who turned it down and why, so the next
 * person to see the same finding is told that it was looked at rather than re-arguing it. A person's own
 * correction reopens it later; a further sighting by a rule does not.
 */
export function rejectObservation(
  id: string,
  store: LearningStore,
  review: { readonly at: string; readonly reference: string },
): RejectionDecision {
  const observation = store.observations.find((candidate) => candidate.id === id);
  if (observation === undefined) {
    return {
      id,
      outcome: 'refused',
      store,
      observation: null,
      reason: `\`${id}\` is not an observation this ledger holds.`,
    };
  }
  if (observation.state === 'rejected') {
    return {
      id,
      outcome: 'kept-rejected',
      store,
      observation,
      reason: `this candidate was already turned down: ${observation.rejected?.reference ?? 'no reference'}.`,
    };
  }
  const rejected: LearningObservation = {
    ...observation,
    state: 'rejected',
    rejected: { at: review.at, reference: review.reference },
  };
  return {
    id,
    outcome: 'recorded',
    store: advanced(
      store,
      store.observations.map((candidate) => (candidate.id === id ? rejected : candidate)),
    ),
    observation: rejected,
    reason:
      'the candidate was turned down, and the ledger keeps that a person decided so rather than the finding having gone away.',
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Step seven: the corpus, and the regression it exists to catch
 * ──────────────────────────────────────────────────────────────────────────── */

/** One case, read. `actual` is what the rules did rather than what they were asked to do. */
export interface RegressionCaseReading {
  readonly id: string;
  readonly check: string | null;
  readonly expected: LearningExpectation;
  readonly actual: LearningExpectation;
  /** The rules in the case's family that reported the form, named so a failure is diagnosable. */
  readonly reportedBy: readonly string[];
  readonly ok: boolean;
  readonly reason: string;
}

export interface RegressionReport {
  readonly total: number;
  readonly readings: readonly RegressionCaseReading[];
  /** The cases whose rule no longer behaves. Empty is the only acceptable result, and it is asserted. */
  readonly failures: readonly RegressionCaseReading[];
}

/**
 * Re-read every confirmed case and report the ones whose rule has stopped behaving.
 *
 * A case is a *claim about behaviour*, and this is the function that puts the claim back to the code:
 *
 *   - `reported` means the rule must still report these characters, so a fix that is undone fails here;
 *   - `accepted` means the product decided the form is right, and the case is read with the corpus's own
 *     accepted forms protected — which is exactly how a real caller passes them, as `protectedLiterals`
 *     read from the store's exceptions — so the rule must stay silent. A `check` of `null` on an accepted
 *     case asserts that *no* rule in the family reports the form, which is what keeps the decision when a
 *     new check arrives later.
 *
 * It reads and writes nothing: the corpus is a value and the reading is a function of the code as it is, so
 * the suite is the caller that turns `failures` into an assertion.
 */
export function regressionCheck(cases: readonly LanguageRegressionCase[]): RegressionReport {
  const accepted = cases
    .filter((entry) => entry.expected === 'accepted')
    .map((entry) => entry.form);
  const readings: RegressionCaseReading[] = [];

  for (const entry of cases) {
    // A corpus cannot both write a form and require a rule to report it. That is not a reading of the text
    // but a reading of the corpus, so it is reported here rather than discovered as a missing finding.
    if (entry.expected === 'reported' && accepted.includes(entry.form)) {
      readings.push({
        id: entry.id,
        check: entry.check,
        expected: entry.expected,
        actual: 'accepted',
        reportedBy: [],
        ok: false,
        reason: `the corpus both accepts \`${entry.form}\` and requires \`${entry.check ?? 'a rule'}\` to report it: the product writes one thing, so one of those decisions is wrong.`,
      });
      continue;
    }
    // Named once per rule: a rule that reports the same form six times in one probe has said one thing about
    // it, and a list that repeated it would read as six rules disagreeing.
    const reportedBy = [
      ...new Set(
        complaintsIn(entry.probe, entry.context, accepted)
          .filter((verdict) => verdict.family === entry.family && verdict.found === entry.form)
          .map((verdict) => verdict.check),
      ),
    ];
    const actual: LearningExpectation = reportedBy.length > 0 ? 'reported' : 'accepted';
    const ok =
      entry.expected === 'reported'
        ? entry.check !== null && reportedBy.includes(entry.check)
        : entry.check === null
          ? reportedBy.length === 0
          : !reportedBy.includes(entry.check);
    readings.push({
      id: entry.id,
      check: entry.check,
      expected: entry.expected,
      actual,
      reportedBy,
      ok,
      reason: ok
        ? entry.expected === 'reported'
          ? `\`${entry.check}\` still reports it, as the decision says it must.`
          : 'the form stays accepted, and the rule that reported it is silent.'
        : entry.expected === 'reported'
          ? `a case confirmed at ${entry.confirmedAt} is no longer reported by \`${entry.check ?? 'no rule'}\`: the error this product fixed has come back, or the rule stopped reading it.`
          : `a form the product accepted (\`${entry.reference}\`) is being reported again — a rule is raising something a person decided about.`,
    });
  }

  return {
    total: readings.length,
    readings,
    failures: readings.filter((reading) => !reading.ok),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Persistence
 * ──────────────────────────────────────────────────────────────────────────── */

const observationSchema = z.strictObject({
  id: z.string().min(1).max(400),
  family: z.enum(LEARNING_FAMILIES),
  check: z.string().min(1).max(120),
  form: z.string().min(1).max(120),
  correction: z.string().max(120).nullable(),
  source: z.enum(LEARNING_SOURCES),
  reason: z.string().min(1).max(1000),
  context: contextShape,
  readings: z.number().int().positive(),
  evidence: z.array(z.string().min(1).max(160)).min(1).max(LEARNING_THRESHOLDS.maxEvidence),
  firstSeen: z.string(),
  lastSeen: z.string(),
  state: z.enum(LEARNING_STATES),
  confidence: z.number().finite().min(0).max(1),
  rejected: z.strictObject({ at: z.string(), reference: z.string().min(1).max(300) }).nullable(),
});

const regressionCaseSchema = z.strictObject({
  id: z.string().min(1).max(400),
  family: z.enum(LEARNING_FAMILIES),
  check: z.string().min(1).max(120).nullable(),
  probe: z.string().min(1).max(LEARNING_THRESHOLDS.probe),
  form: z.string().min(1).max(120),
  correction: z.string().max(120),
  expected: z.enum(LEARNING_EXPECTATIONS),
  context: contextShape,
  confirmedAt: z.string(),
  reference: z.string().min(1).max(300),
});

/**
 * Read a stored ledger back, keeping what this build understands.
 *
 * Structural and tolerant in the same way the statements store is: an entry that does not match the schema
 * is dropped rather than taking the whole ledger with it, and a value that reads as another build's is
 * dropped too. "I know less than I did" is recoverable; refusing to read the value at all is not — and a
 * *case* is dropped whole rather than repaired, because half a promise is worse than none.
 */
export function parseLearningStore(raw: unknown): LearningStore {
  if (raw === null || typeof raw !== 'object') return emptyLearningStore();
  const source = raw as { version?: unknown; observations?: unknown; cases?: unknown };
  const version =
    typeof source.version === 'number' && Number.isInteger(source.version) && source.version >= 0
      ? source.version
      : 0;

  const observations: LearningObservation[] = [];
  if (Array.isArray(source.observations)) {
    for (const candidate of source.observations) {
      const parsed = observationSchema.safeParse(candidate);
      if (!parsed.success) continue;
      if (!readableCheck(parsed.data.check)) continue;
      observations.push(parsed.data);
    }
  }

  const cases: LanguageRegressionCase[] = [];
  if (Array.isArray(source.cases)) {
    for (const candidate of source.cases) {
      const parsed = regressionCaseSchema.safeParse(candidate);
      if (!parsed.success) continue;
      if (!parsed.data.probe.includes(parsed.data.form)) continue;
      cases.push(parsed.data);
    }
  }

  return {
    version,
    observations: observations.slice(-LEARNING_THRESHOLDS.maxObservations),
    cases,
  };
}

export function readLearningStore(storage: PreferenceStorage | null = preferenceStorage()): {
  readonly store: LearningStore;
  readonly storable: boolean;
  readonly stored: boolean;
} {
  if (storage === null) {
    return { store: emptyLearningStore(), storable: false, stored: false };
  }
  try {
    const raw = storage.getItem(LANGUAGE_LEARNING_KEY);
    if (raw === null) return { store: emptyLearningStore(), storable: true, stored: false };
    const parsed: unknown = JSON.parse(raw);
    return { store: parseLearningStore(parsed), storable: true, stored: true };
  } catch {
    // A store that throws, or holds something that is not JSON: nothing has been learned, and the reading
    // layers carry on with the knowledge the code ships.
    return { store: emptyLearningStore(), storable: false, stored: false };
  }
}

export function writeLearningStore(
  store: LearningStore,
  storage: PreferenceStorage | null = preferenceStorage(),
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(LANGUAGE_LEARNING_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}
