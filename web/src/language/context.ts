/**
 * The communication context — Phase 7.5.3.2, Task 1.
 *
 * What 7.5.3.1 already answers, and what this module adds
 * ------------------------------------------------------
 * `detectLanguage` reads one message and says what it *is*: which script, which register, whether the
 * wording is technical, which of three shapes it has, how long it is, and whether it asked for a
 * language. That is a description of a message, and this module does not repeat any of it.
 *
 * This module answers what the *interaction* looks like, which is what a response stage needs and what a
 * single-message reading cannot say: is this small talk or work, is the wording the product's own
 * vocabulary or plain language, did the person ask for less or more than a paragraph, is this a question
 * being asked, a task being handed over, or a point being argued, and — the dimension this product
 * genuinely needs and no general-purpose tool would have — *how* are Persian and English mixed, because
 * that decides whether a technical term is preserved, translated, or glossed.
 *
 * Four rules hold the module together, and each one is asserted rather than intended:
 *
 *   1. **Nothing here is sensitive.** Every dimension is a reading of *how somebody writes*, taken from
 *      the words in front of it. There is no field for a name, an age, a gender, a location, a
 *      nationality, a religion or a native language, the suite walks the produced object's field names
 *      against a closed list, and no dimension is *about* a person: `plain` wording says the message used
 *      no product vocabulary, it does not say the writer is a beginner.
 *   2. **Nothing here is a second register system.** Formality *is* 7.5.3.1's register reading, carried
 *      with the markers that produced it, because a second opinion about politeness would be a second
 *      thing for the interface to disagree with. The setting dimension is a different question — the
 *      situation rather than the phrasing — and the two are allowed to disagree, which is exactly what
 *      `سلام، حد ضرر را چک کن` is: an informal greeting around a work request.
 *   3. **Every reading carries its evidence.** A value with no reason is a value nobody can review, so
 *      each dimension returns the words or counts it decided from, and the strings are either verbatim
 *      from the message or a store id for a concept the message named.
 *   4. **Deterministic and cheap.** Counts and closed lists, no model, no dependency, no I/O. Two calls
 *      with the same text return the same object, which is what lets the response layer cache a context
 *      and the suite assert one.
 */

import { GUIDANCE_DETAILS } from '@shared/language/guidance';
import type { LanguageDetection, LanguageRegister } from './detect.js';
import type { DetectionOptions } from './detect.js';
import { detectLanguage } from './detect.js';
import { findSpans, standaloneMatches } from './rules.js';
import { allAlternatives, lexiconTerms, type TerminologyDomain } from './terminology.js';
import type { LanguageMemory } from './memory.js';

/* ────────────────────────────────────────────────────────────────────────────
 * The vocabulary
 * ──────────────────────────────────────────────────────────────────────────── */

/** Bumped when a verdict means something different than it did. */
export const CONTEXT_VERSION = 1;

/** The dimensions, in the order a reader meets them. Also the field list of a context. */
export const CONTEXT_DIMENSIONS = [
  'formality',
  'setting',
  'expertise',
  'depth',
  'intent',
  'terminology',
] as const;
export type ContextDimension = (typeof CONTEXT_DIMENSIONS)[number];

/** Whether the message reads as small talk or as work. A situation, not a level of politeness. */
export const CONTEXT_SETTINGS = ['conversational', 'professional', 'unclear'] as const;
export type ContextSetting = (typeof CONTEXT_SETTINGS)[number];

/** How much of the message is this product's own vocabulary, versus plain language. */
export const CONTEXT_EXPERTISES = ['plain', 'informed', 'technical'] as const;
export type ContextExpertise = (typeof CONTEXT_EXPERTISES)[number];

/**
 * How much detail is wanted. Read from the message, or asked for in it.
 *
 * The vocabulary is the response-style contract's (`@shared/language/guidance`, Phase 7.5.3.4.2):
 * `ContextDepth` is `GuidanceDetail` under this layer's older name, because reading how much detail a turn
 * wants and instructing how much to give are the same dimension — and a second list for it would be a
 * second answer to the same question, one that could disagree with the value the response stage is handed.
 */
export const CONTEXT_DEPTHS = GUIDANCE_DETAILS;
export type ContextDepth = (typeof CONTEXT_DEPTHS)[number];

/**
 * What the message is doing.
 *
 * `discussion` is the one value 7.5.3.1's `style` does not have, and it is the reason this dimension
 * exists rather than being re-exported: a statement that runs to several sentences, or that ties itself
 * to what came before with a connective, is somebody making a point rather than somebody reporting a
 * fact, and the two want different replies. `mixed` is carried through rather than collapsed: a turn that
 * asks something *and* hands over a task is a real and common shape, and filing it under one of the two
 * would throw away the half that a response stage most needs to see.
 */
export const CONTEXT_INTENTS = [
  'question',
  'instruction',
  'discussion',
  'statement',
  'mixed',
] as const;
export type ContextIntent = (typeof CONTEXT_INTENTS)[number];

/**
 * How Persian and English are mixed in one message.
 *
 * The dimension this product cannot do without. `terms-only` is the healthy case — a Persian sentence
 * whose only Latin characters are the concepts and identifiers that have no Persian form, and which must
 * be left exactly as they are. `stray` is a word or two that is *not* this product's vocabulary, and is
 * the one shape worth softening in a reply. `sentence` is a whole English clause beside Persian prose, a
 * person who reads both, and it changes the terminology a reply should use rather than the language it
 * is written in.
 */
export const CONTEXT_MIXINGS = ['none', 'terms-only', 'stray', 'sentence'] as const;
export type ContextMixing = (typeof CONTEXT_MIXINGS)[number];

/** How sure a dimension is, and what it decided from. */
export interface ContextReading<T extends string> {
  readonly dimension: ContextDimension;
  readonly value: T;
  readonly confidence: number;
  /** The words that decided it — verbatim from the message, or a store id for a concept it named. */
  readonly signals: readonly string[];
  /** One sentence a person can read and disagree with. */
  readonly reason: string;
}

export interface CommunicationContext {
  readonly version: number;
  /** 7.5.3.1's verdict, carried rather than re-derived, so a caller never has two of them. */
  readonly language: LanguageDetection['language'];
  readonly formality: ContextReading<LanguageRegister>;
  readonly setting: ContextReading<ContextSetting>;
  readonly expertise: ContextReading<ContextExpertise>;
  readonly depth: ContextReading<ContextDepth>;
  readonly intent: ContextReading<ContextIntent>;
  readonly terminology: ContextReading<ContextMixing>;
  /** The lexicon concepts the message named, by id. */
  readonly terms: readonly string[];
  readonly domains: readonly TerminologyDomain[];
  /** The depth the message asked for outright, when it asked. */
  readonly requestedDepth: ContextDepth | null;
  /** How much detail was asked for, or null. Kept because a request outranks every other signal. */
  readonly requestedFormality: LanguageRegister | null;
}

export interface CommunicationContextOptions extends DetectionOptions {
  /** An already-computed reading, so a caller in a pipeline does not detect the same text twice. */
  readonly detection?: LanguageDetection;
  /** The store the lexicon is read through. Defaults to the seeded terminology. */
  readonly memory?: LanguageMemory;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The closed lists
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Openings that make a message conversational.
 *
 * A greeting is the one signal that says "this turn is social" without saying anything about how the
 * rest of it is phrased, which is why it counts here and not for formality. The list is short on
 * purpose: every entry is an *opening*, and a longer list would start scoring the vocabulary of the
 * sentence that follows it.
 */
export const CONTEXT_GREETINGS: readonly string[] = [
  'سلام',
  'درود',
  'سلام علیکم',
  'خوبی',
  'چطوری',
  'ممنون',
  'مرسی',
  'سپاس',
  'hi',
  'hello',
  'hey',
  'thanks',
  'thank you',
  'good morning',
  'good evening',
] as const;

/**
 * Words that ask for less than a paragraph, and words that ask for more.
 *
 * Exported because the suite derives its cases from this list rather than retyping it, and because a
 * reviewer changing one of them should see which test moves. The Persian entries are multi-word phrases
 * wherever the single word would be ambiguous: `کامل` means "complete" as often as it means "in full",
 * while `به طور کامل` only ever means the latter.
 */
export const CONTEXT_CONCISE_REQUESTS: readonly string[] = [
  'خلاصه',
  'مختصر',
  'به طور خلاصه',
  'کوتاه بگو',
  'یک خطی',
  'briefly',
  'in short',
  'short answer',
  'to the point',
  'tl;dr',
] as const;

export const CONTEXT_DETAILED_REQUESTS: readonly string[] = [
  'به طور کامل',
  'با جزئیات',
  'با جزییات',
  'مفصل',
  'تفصیلی',
  'شرح کامل',
  'in detail',
  'detailed',
  'thoroughly',
  'step by step',
  'step-by-step',
  'walk me through',
  'elaborate',
] as const;

/**
 * Words that ask for a *written* style: the formal end and the familiar end.
 *
 * A message that says `رسمی بنویس` has told this product something the phrasing of the request itself
 * cannot, and it outranks every marker in it — which is the phase's priority rule applied to formality.
 * `محترمانه` is included because it is what an Iranian writer actually says when they want the polite
 * register, and `خودمانی` because it is what they say when they want the other one.
 */
export const CONTEXT_FORMAL_REQUESTS: readonly string[] = [
  'رسمی',
  'محترمانه',
  'رسمی بنویس',
  'formal',
  'formally',
  'respectfully',
] as const;

export const CONTEXT_INFORMAL_REQUESTS: readonly string[] = [
  'خودمانی',
  'دوستانه',
  'راحت باش',
  'غیررسمی',
  'casual',
  'informally',
  'like a friend',
] as const;

/**
 * Words that put a statement in a conversation rather than in a vacuum.
 *
 * A statement with two sentences, or a statement that ties itself to what came before, is somebody
 * making a point. The connectives are the second half of that test, and they are closed because the
 * alternative — any long sentence is a discussion — would be a word count wearing a different name.
 */
export const CONTEXT_DISCOURSE_CONNECTIVES: readonly string[] = [
  'همانطور که',
  'همانطوریکه',
  'همچنین',
  'بنابراین',
  'در نتیجه',
  'از طرفی',
  'از این رو',
  'به علاوه',
  'در ادامه',
  'as we discussed',
  'as i said',
  'as mentioned',
  'in addition',
  'furthermore',
  'moreover',
  'therefore',
  'however',
  'regarding',
] as const;

/* ────────────────────────────────────────────────────────────────────────────
 * Reading helpers
 * ──────────────────────────────────────────────────────────────────────────── */

/** A closed list matched as *words*, case-insensitively, so `Hi` and `سلام` both count. */
function matchesOf(text: string, forms: readonly string[]): string[] {
  const lower = text.toLowerCase();
  return forms.filter((form) => standaloneMatches(lower, form.toLowerCase()).length > 0);
}

/** Every whole word in the message, for the two dimensions that count them. */
function sentencesIn(text: string): number {
  return text
    .split(/[.!?\u061F\u061B\n]+/u)
    .map((part) => part.trim())
    .filter((part) => /[A-Za-z\u0600-\u06FF]/u.test(part)).length;
}

/** A confidence from how far apart two counts are, so a one-signal lead is not a verdict. */
function marginConfidence(margin: number): number {
  return Math.round(Math.min(0.9, 0.55 + 0.1 * margin) * 100) / 100;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 1. Formality — 7.5.3.1's reading, carried with its markers
 * ──────────────────────────────────────────────────────────────────────────── */

function formalityOf(detection: LanguageDetection): ContextReading<LanguageRegister> {
  const { informalMarkers, formalMarkers } = detection.context;
  const signals = [...informalMarkers, ...formalMarkers].slice(0, 6);
  const reason =
    detection.register === 'neutral'
      ? `No formal or informal marker was found in ${detection.context.words} word(s), so the register is not being claimed.`
      : `${informalMarkers.length} informal and ${formalMarkers.length} formal marker(s) were found, so the message reads as ${detection.register}.`;
  return {
    dimension: 'formality',
    value: detection.register,
    confidence: detection.registerConfidence,
    signals,
    reason,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2. Setting — small talk or work
 * ──────────────────────────────────────────────────────────────────────────── */

function settingOf(text: string, detection: LanguageDetection): ContextReading<ContextSetting> {
  const professional: string[] = [];
  const conversational: string[] = [];

  // Work signals: the subject matter. One per concept the message named, so a sentence that leans on the
  // product's vocabulary counts more than one that mentions it once.
  professional.push(...detection.context.terms.slice(0, 6));
  if (detection.context.technicalFigures > 0) {
    professional.push(`${detection.context.technicalFigures} figure(s)`);
  }
  if (detection.context.technicalSpans > 0) {
    professional.push(`${detection.context.technicalSpans} identifier(s)`);
  }
  // ...and the politeness of a work request, which is a formal marker by another name.
  professional.push(...detection.context.formalMarkers.slice(0, 3));

  conversational.push(...matchesOf(text, CONTEXT_GREETINGS).slice(0, 3));
  if (detection.context.informalMarkers.length > 0) {
    conversational.push(...detection.context.informalMarkers.slice(0, 3));
  }
  // A four-word turn that names nothing is a remark rather than a brief, whichever register it is in.
  if (
    detection.context.words > 0 &&
    detection.context.words < 8 &&
    detection.context.terms.length === 0
  ) {
    conversational.push('a turn of fewer than eight words');
  }

  // Deduplicated, because one word can be evidence twice over: `hey` is both an opening and an
  // informal marker, and counting it as two conversational signals would let a greeting outvote a
  // message's actual subject matter.
  const work = [...new Set(professional)];
  const chat = [...new Set(conversational)];
  const margin = work.length - chat.length;
  if (work.length === 0 && chat.length === 0) {
    return {
      dimension: 'setting',
      value: 'unclear',
      confidence: Math.round(Math.min(0.5, detection.context.words / 40) * 100) / 100,
      signals: [],
      reason:
        'Nothing in the message says whether it is small talk or work: no greeting, no marker and none of the product vocabulary.',
    };
  }
  if (margin === 0) {
    // A tie is broken by *what the turn is about*, which is the one signal that is content rather than
    // phrasing: `سلام، حد ضرر را چک کن` is a greeting and a stop-loss, and the subject is what it is
    // about. A tie with no subject in it stays unresolved, because a greeting and a marker really do not
    // say which of the two the turn is.
    const subject =
      detection.context.terms.length +
      detection.context.technicalFigures +
      detection.context.technicalSpans;
    if (subject > 0) {
      return {
        dimension: 'setting',
        value: 'professional',
        confidence: 0.5,
        signals: work.slice(0, 6),
        reason: `The turn is as conversational as it is work (${work.length} against ${chat.length}), and it names the product's subject (${subject} item(s)), which is what it is about.`,
      };
    }
    return {
      dimension: 'setting',
      value: 'unclear',
      confidence: 0.4,
      signals: [...work, ...chat].slice(0, 6),
      reason: `The message has as much of the work about it as the conversation (${work.length} against ${chat.length}), with no subject to break the tie, so neither reading is claimed.`,
    };
  }
  const value: ContextSetting = margin > 0 ? 'professional' : 'conversational';
  return {
    dimension: 'setting',
    value,
    confidence: marginConfidence(Math.abs(margin)),
    signals: (value === 'professional' ? work : chat).slice(0, 6),
    reason:
      value === 'professional'
        ? `The message carries work (${work.join(', ')}) and ${chat.length} conversational signal(s), so it reads as work.`
        : `The message carries conversation (${chat.join(', ')}) and ${work.length} work signal(s), so it reads as small talk.`,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3. Expertise — how much of the message is the product's own vocabulary
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A gradation of *wording*, not a judgement of a person.
 *
 * `technical` means the message leans on the product's vocabulary — several concepts, or figures and
 * identifiers with them, or a quarter of its words doing that work. `plain` means it uses none of it,
 * which is a fact about the sentence and not about the writer: `حد ضرر چیه؟` is plain *and* informed, and
 * the dimensions are separate for exactly that reason.
 */
function expertiseOf(detection: LanguageDetection): ContextReading<ContextExpertise> {
  const { terms, technicalFigures, technicalSpans, words } = detection.context;
  const score = terms.length + technicalFigures + technicalSpans;
  const density = words === 0 ? 0 : (score * 10) / words;
  const signals = [...terms.slice(0, 6)];
  if (technicalFigures > 0) signals.push(`${technicalFigures} figure(s)`);
  if (technicalSpans > 0) signals.push(`${technicalSpans} identifier(s)`);
  // A single concept in a long sentence is not technical wording, however many words it took to say: the
  // density test is what stops "a paragraph that mentions a stop-loss" reading as a technical brief.

  if (score === 0) {
    return {
      dimension: 'expertise',
      value: 'plain',
      confidence: Math.round(Math.min(0.9, 0.5 + words / 40) * 100) / 100,
      signals: [],
      reason: `The message uses none of the product's vocabulary in ${words} word(s), so its wording is plain.`,
    };
  }
  const technical = score >= 3 || density >= 2.5;
  return {
    dimension: 'expertise',
    value: technical ? 'technical' : 'informed',
    confidence: Math.round(Math.min(0.95, 0.6 + 0.08 * score) * 100) / 100,
    signals: signals.slice(0, 6),
    reason: technical
      ? `The message names ${terms.length} concept(s), ${technicalFigures} figure(s) and ${technicalSpans} identifier(s) in ${words} word(s), so its wording is technical.`
      : `The message names ${score} item(s) of the product's vocabulary in ${words} word(s), so its wording is informed rather than technical.`,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 4. Depth — how much detail is wanted
 * ──────────────────────────────────────────────────────────────────────────── */

function depthOf(
  text: string,
  detection: LanguageDetection,
): { depth: ContextReading<ContextDepth>; requested: ContextDepth | null } {
  const concise = matchesOf(text, CONTEXT_CONCISE_REQUESTS);
  const detailed = matchesOf(text, CONTEXT_DETAILED_REQUESTS);

  // Asked both ways: the message contradicts itself, so neither request is honoured and the length of
  // the message decides. Recording both as signals keeps the contradiction visible.
  if (concise.length > 0 && detailed.length === 0) {
    return {
      depth: {
        dimension: 'depth',
        value: 'concise',
        confidence: 0.9,
        signals: concise.slice(0, 3),
        reason: `The message asks for less: "${concise[0] ?? ''}".`,
      },
      requested: 'concise',
    };
  }
  if (detailed.length > 0 && concise.length === 0) {
    return {
      depth: {
        dimension: 'depth',
        value: 'detailed',
        confidence: 0.9,
        signals: detailed.slice(0, 3),
        reason: `The message asks for more: "${detailed[0] ?? ''}".`,
      },
      requested: 'detailed',
    };
  }

  const band = detection.verbosity;
  const value: ContextDepth =
    band === 'terse' ? 'concise' : band === 'detailed' ? 'detailed' : 'standard';
  return {
    depth: {
      dimension: 'depth',
      value,
      confidence: band === 'standard' ? 0.4 : 0.7,
      signals:
        concise.length > 0
          ? [...concise, ...detailed].slice(0, 3)
          : [`${detection.context.words} word(s)`],
      reason:
        concise.length > 0
          ? 'The message asks for less and for more in the same breath, so its length decides instead.'
          : `The message asks for nothing and runs to ${detection.context.words} word(s), which is ${value}.`,
    },
    requested: null,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 5. Intent — question, instruction, discussion, statement
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 7.5.3.1's style, plus the one shape it cannot see: a statement that is making a point.
 *
 * `style` is carried rather than recomputed, so a question is a question for the same reason as before.
 * `discussion` is added on top of it, and only over a statement: a question is already an invitation to
 * answer, and an instruction is already a task, so neither becomes a discussion by being long.
 */
function intentOf(text: string, detection: LanguageDetection): ContextReading<ContextIntent> {
  const style = detection.style;
  if (style === 'statement') {
    const sentences = sentencesIn(text);
    const connectives = matchesOf(text, CONTEXT_DISCOURSE_CONNECTIVES);
    const discussion = sentences >= 2 || connectives.length > 0;
    if (discussion) {
      return {
        dimension: 'intent',
        value: 'discussion',
        confidence: Math.round(Math.min(0.9, 0.6 + 0.1 * sentences) * 100) / 100,
        signals: [
          ...(sentences >= 2 ? [`${sentences} sentences`] : []),
          ...connectives.slice(0, 2),
        ],
        reason: `${sentences} sentence(s)${connectives.length > 0 ? ` and "${connectives[0] ?? ''}"` : ''} attach the statement to more than itself, so it reads as a point being made.`,
      };
    }
  }
  return {
    dimension: 'intent',
    value: style,
    // A question mark or a clause-final imperative is a mechanical signal; a statement is what is left,
    // and a message that both asks and instructs says so rather than being filed under one of them.
    confidence: style === 'statement' || style === 'mixed' ? 0.7 : 0.9,
    signals: [],
    reason:
      style === 'statement'
        ? 'One sentence and nothing that ties it to the conversation, so the message states something.'
        : `The message is a ${style}, which an earlier reading decided from its marks and its verb.`,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 6. Terminology — how the two scripts are mixed
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A phrase of Latin, and how much of it is *not* this product's vocabulary.
 *
 * Read as phrases rather than as loose words, because that is the difference the dimension is asking
 * about: `Risk/reward is` is an English clause with a term in it, and three unrelated tokens would miss
 * that one of them — the verb — makes it a clause. `tokens` is what the phrase contains and `prose` is
 * what the lexicon does not account for; `prose` empty is the healthy case.
 */
interface LatinRun {
  readonly tokens: readonly string[];
  readonly prose: readonly string[];
}

/**
 * The Latin phrases in a message, split into vocabulary and prose.
 *
 * Three kinds of Latin are not somebody writing English. The product's own vocabulary — the English side
 * of a lexicon term, or a Latin form the lexicon records — is the healthy case. A run of capitals is a
 * ticker rather than a word: in this product's text `XAUUSD` and `BTCUSDT` are instrument names, and
 * reading them as prose would make every Persian sentence about a symbol look like a mixed-language one.
 * And a token inside a structural span — a URL, a path, a dotted identifier — was protected by 7.5.2.1
 * long before this module existed. Everything else is prose, and *that* is the signal.
 */
function latinRunsIn(
  text: string,
  memory: LanguageMemory | undefined,
  terms: readonly string[],
): readonly LatinRun[] {
  const vocabulary = new Set<string>();
  for (const term of lexiconTerms(memory)) {
    for (const word of term.english.toLowerCase().split(/[^a-z0-9]+/u)) {
      if (word.length >= 2) vocabulary.add(word);
    }
    for (const form of allAlternatives(term)) {
      if (/^[A-Za-z][A-Za-z0-9 -]*$/u.test(form)) vocabulary.add(form.toLowerCase());
    }
  }
  // A term the message named is a term the writer used, wherever the lexicon keeps its English.
  for (const id of terms) vocabulary.add(id.toLowerCase());

  const spans = findSpans(text);
  const inSpan = (start: number): boolean =>
    spans.some((span) => start >= span.start && start < span.end);

  const runs: LatinRun[] = [];
  for (const run of text.matchAll(/[A-Za-z][A-Za-z0-9-]*(?:[ /][A-Za-z][A-Za-z0-9-]*)*/gu)) {
    const start = run.index ?? 0;
    const tokens: string[] = [];
    const prose: string[] = [];
    for (const token of run[0].matchAll(/[A-Za-z][A-Za-z0-9-]*/gu)) {
      const value = token[0];
      tokens.push(value);
      if (inSpan(start + (token.index ?? 0))) continue;
      if (/^[A-Z0-9]{2,12}$/u.test(value)) continue;
      if (vocabulary.has(value.toLowerCase())) continue;
      prose.push(value);
    }
    if (tokens.length > 0) runs.push({ tokens, prose });
  }
  return runs;
}

function terminologyOf(
  text: string,
  detection: LanguageDetection,
  memory: LanguageMemory | undefined,
): ContextReading<ContextMixing> {
  const { persianLetters, latinLetters } = detection.context;
  if (persianLetters === 0 || latinLetters === 0) {
    return {
      dimension: 'terminology',
      value: 'none',
      confidence: 0.95,
      signals: [],
      reason:
        persianLetters === 0
          ? 'The message carries no Persian letters, so nothing is being mixed.'
          : 'The message carries no Latin letters, so nothing is being mixed.',
    };
  }

  const runs = latinRunsIn(text, memory, detection.context.terms);
  const foreign = runs.flatMap((run) => run.prose);
  const longestForeignRun = runs
    .filter((run) => run.prose.length > 0)
    .reduce((longest, run) => Math.max(longest, run.tokens.length), 0);
  const signals = (foreign.length > 0 ? foreign : runs.flatMap((run) => run.tokens)).slice(0, 8);

  if (foreign.length === 0) {
    return {
      dimension: 'terminology',
      value: 'terms-only',
      // A ticker and an identifier are read by rule rather than by meaning, which is why this is not
      // higher: the reading is right about the shape of the Latin, not about every word in it.
      confidence: 0.85,
      signals,
      reason: `Every Latin word in the message is the product's vocabulary, a ticker or an identifier (${runs.reduce((total, run) => total + run.tokens.length, 0)} of them in ${runs.length} phrase(s)), so the mixing is terms only.`,
    };
  }
  if (foreign.length >= 3 || longestForeignRun >= 3) {
    return {
      dimension: 'terminology',
      value: 'sentence',
      confidence: 0.9,
      signals,
      reason: `${foreign.length} English word(s) that are not this product's vocabulary sit beside Persian prose${longestForeignRun >= 3 ? `, in a phrase of ${longestForeignRun} words` : ''}, so a whole clause is in the other language.`,
    };
  }
  return {
    dimension: 'terminology',
    value: 'stray',
    confidence: 0.6,
    signals,
    reason: `${foreign.length} English word(s) that are not this product's vocabulary appear in Persian prose, so the mixing is a word or two rather than a sentence.`,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The reading
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Read one turn: what it is about, how it is worded, and how the two languages are mixed in it.
 *
 * The detection is passed in when a caller already has it — the whole point of this module running after
 * 7.5.3.1 is that it does not have to repeat it — and computed here otherwise.
 */
export function analyzeCommunication(
  text: string,
  options: CommunicationContextOptions = {},
): CommunicationContext {
  const detection = options.detection ?? detectLanguage(text, options);
  const memory = options.memory;
  const { depth, requested } = depthOf(text, detection);
  // Collected as *values* rather than as matches: `این را رسمی بنویس` matches two entries of the closed
  // list and asks for one style, and counting the matches would turn one request into none.
  const requestedStyles = new Set<LanguageRegister>();
  if (matchesOf(text, CONTEXT_FORMAL_REQUESTS).length > 0) requestedStyles.add('formal');
  if (matchesOf(text, CONTEXT_INFORMAL_REQUESTS).length > 0) requestedStyles.add('informal');
  const only = [...requestedStyles];
  // Asked both ways is a contradiction rather than a request, so neither style is honoured.
  const requestedFormality = only.length === 1 ? (only[0] ?? null) : null;

  return {
    version: CONTEXT_VERSION,
    language: detection.language,
    formality: formalityOf(detection),
    setting: settingOf(text, detection),
    expertise: expertiseOf(detection),
    depth,
    intent: intentOf(text, detection),
    terminology: terminologyOf(text, detection, memory),
    terms: detection.context.terms,
    domains: detection.context.domains,
    requestedDepth: requested,
    requestedFormality,
  };
}

/** The dimensions in a context, by name, so a consumer can iterate rather than list them again. */
export function contextReadings(context: CommunicationContext): readonly ContextReading<string>[] {
  return [
    context.formality,
    context.setting,
    context.expertise,
    context.depth,
    context.intent,
    context.terminology,
  ];
}
