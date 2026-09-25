/**
 * The Master Trade terminology lexicon — Phase 7.5.2.2.
 *
 * What this is, and what it deliberately is not
 * --------------------------------------------
 * A lexicon answers one question asked in many places: *what does this product call this thing, in
 * Persian, when it is written down?* An answer that lives inside a component is not an answer; it is a
 * coincidence that holds until the next component. So the answer lives here, once, as data — and the
 * *trust* in it lives in the language store from Phase 7.5.1, exactly as the normalization rules of
 * 7.5.2.1 do.
 *
 * That is the whole architecture of this file, and it is worth stating because the alternative is
 * tempting: a second glossary with its own storage, its own versioning and its own idea of "current"
 * would be a *duplicate terminology system*, which is precisely what this phase is told not to build.
 * Instead:
 *
 *   - **the catalogue** (below) holds what the entry schema has no field for — the English equivalent,
 *     the domain, the non-preferred alternatives, the usage sentence, the confidence — because a
 *     knowledge entry is `{ key, kind, value, status, confidence, version, provenance, examples,
 *     mapping, notes }` and there is nowhere honest in it to put a list of rejected forms;
 *   - **the store** holds the trusted, versioned, provenance-carrying half: one `terminology` entry per
 *     term, whose `value` *is* the preferred Persian form and whose every version is kept;
 *   - **the lexicon view** joins them, and the store wins. A term whose entry is `proposed`,
 *     `validated` or `deprecated` is not returned by a lookup, and a term whose entry has been
 *     corrected returns the corrected form — with the form it replaced still reported as an
 *     alternative, because the store's history is where superseded wording is remembered.
 *
 * No glossary was invented here. Every row is a concept the current product already renders or is
 * built around — the fourteen navigation labels and the three groups of the shell, the journal's
 * record of a trade, the portfolio's valuation vocabulary, the risk math behind it, the agent's
 * evidence and uncertainty labels, the memory surfaces' provenance and trust, and the academy's
 * curriculum and assessments. The list is short on purpose: a term nobody writes yet is a decision
 * nobody has needed to make, and the mechanism in `terminologyUpdates.ts` is how the next one arrives.
 *
 * A note on the Persian, since this file is the one place in the layer that is full of it. The terms
 * are written as characters rather than as escapes — a lexicon whose every word is a hex sequence is
 * not reviewable by the person who has to review it — and the suite proves mechanically that each one
 * is already in canonical form (no Arabic yeh, no Arabic kaf, no stray ZWNJ) by running Phase 7.5.2.1's
 * normalizer over all of them. What a reviewer reads is therefore what a screen will render.
 */

import type { LanguageKnowledgeEntry, LanguageProposal } from './model.js';
import { LanguageMemory } from './memory.js';
import { findSpans, overlapsSpan } from './rules.js';
import {
  normalizePersianContent,
  protectedLiterals,
  type NormalizationOptions,
} from './normalize.js';

/**
 * When the lexicon's knowledge was recorded, and where the record lives.
 *
 * Fixed rather than read from the clock, for the same reason every other entry's provenance is: a store
 * that writes its own timestamp cannot be replayed in a test, and knowledge nobody can reproduce is
 * knowledge nobody can audit. Both constants are exported because `seed.ts` composes the full store
 * from this catalogue and must cite the same source this file does — and the dependency runs one way
 * only (`seed.ts` imports this module, never the reverse), so a lookup that needs a default store can
 * build it without a cycle.
 */
export const TERMINOLOGY_RECORDED_AT = '2026-09-25T00:00:00.000Z';
export const TERMINOLOGY_REFERENCE = 'docs/persian-terminology.md';

/* ────────────────────────────────────────────────────────────────────────────
 * Domains
 * ──────────────────────────────────────────────────────────────────────────── */

/** The six areas the product's vocabulary falls into — the phase's own list, not a taxonomy. */
export const TERMINOLOGY_DOMAINS = [
  'trading',
  'risk',
  'agent',
  'memory',
  'education',
  'ui',
] as const;
export type TerminologyDomain = (typeof TERMINOLOGY_DOMAINS)[number];

/** The English name of each domain, for a report a reader of either language can check. */
export const TERMINOLOGY_DOMAIN_MEANING: Record<TerminologyDomain, string> = {
  trading: 'the trade itself: what was entered, exited, held and what it cost',
  risk: 'the numbers that bound the trade before it is taken',
  agent: 'the model surface: what it claims, on what evidence, with what uncertainty',
  memory: 'the knowledge surfaces: what is stored, where it came from, how far it is trusted',
  education: 'the learning half: curriculum, assessments and evaluation',
  ui: 'the shell itself: navigation, settings and the language controls',
};

/* ────────────────────────────────────────────────────────────────────────────
 * The catalogue
 * ──────────────────────────────────────────────────────────────────────────── */

export interface TerminologyTerm {
  /** The concept, stable and unique across domains. It is also the last segment of the store key. */
  readonly id: string;
  readonly domain: TerminologyDomain;
  /** The English the product already shows. Lookup accepts it case-insensitively. */
  readonly english: string;
  /** The form this product writes. The store's trusted entry may correct it — see the view below. */
  readonly preferredFa: string;
  /** Forms that are understood, and are not what this product writes. Reported, never rewritten. */
  readonly alternativesFa: readonly string[];
  /** One sentence on where it is used, so a reviewer sees the string behind the decision. */
  readonly usage: string;
  /** How sure this project is of the preference — not of the concept's existence. */
  readonly confidence: number;
}

/** The store address of a term: `term.<domain>.<id>`. */
export function terminologyKey(domain: TerminologyDomain, id: string): string {
  return `term.${domain}.${id}`;
}

/**
 * Every term, in the order a review should read them: the trade first, the shell last.
 *
 * `confidence` below 1 is not decoration. A form like `کارمزد` is the word every Iranian broker writes
 * and is as close to settled as a term gets; a form like `فضای کار هوش مصنوعی` is this project's
 * phrasing of a concept whose English word is itself contested, and it is recorded at a confidence
 * that says so. The number is what a reviewer sorts by when they disagree with one of them.
 */
export const TERMINOLOGY: readonly TerminologyTerm[] = [
  /* Trading ----------------------------------------------------------------- */
  {
    id: 'trade',
    domain: 'trading',
    english: 'Trade',
    preferredFa: 'معامله',
    alternativesFa: ['ترید'],
    usage: 'the record itself: one position taken, from entry to exit',
    confidence: 0.95,
  },
  {
    id: 'position',
    domain: 'trading',
    english: 'Position',
    preferredFa: 'پوزیشن',
    alternativesFa: ['موقعیت', 'موقعیت معاملاتی'],
    usage: 'what is held, and what a size is sized for',
    confidence: 0.9,
  },
  {
    id: 'entry',
    domain: 'trading',
    english: 'Entry',
    preferredFa: 'ورود',
    alternativesFa: ['نقطه ورود', 'اینتری'],
    usage: 'the price and time a position was opened at',
    confidence: 0.9,
  },
  {
    id: 'exit',
    domain: 'trading',
    english: 'Exit',
    preferredFa: 'خروج',
    alternativesFa: ['نقطه خروج', 'اکزیت'],
    usage: 'the price and time a position was closed at',
    confidence: 0.9,
  },
  {
    id: 'stop-loss',
    domain: 'trading',
    english: 'Stop-loss',
    preferredFa: 'حد ضرر',
    alternativesFa: ['استاپ لاس', 'استاپ‌لاس', 'حد زیان'],
    usage: 'the price at which the trade is wrong, set before it is taken',
    confidence: 0.95,
  },
  {
    id: 'take-profit',
    domain: 'trading',
    english: 'Take-profit',
    preferredFa: 'حد سود',
    alternativesFa: ['تیک پرافیت', 'حد سوددهی'],
    usage: 'the price the plan expects to leave at',
    confidence: 0.9,
  },
  {
    id: 'instrument',
    domain: 'trading',
    english: 'Instrument',
    preferredFa: 'نماد',
    alternativesFa: ['نماد معاملاتی', 'سیمبل'],
    usage: 'the thing traded — `XAUUSD`, `BTC/USDT` — never translated inside a figure',
    confidence: 0.9,
  },
  {
    id: 'timeframe',
    domain: 'trading',
    english: 'Timeframe',
    preferredFa: 'تایم‌فریم',
    alternativesFa: ['تایم فریم', 'بازه زمانی'],
    usage: 'the interval a setup was read on',
    confidence: 0.9,
  },
  {
    id: 'r-multiple',
    domain: 'trading',
    english: 'R multiple',
    preferredFa: 'چندبرابر R',
    alternativesFa: ['نسبت R', 'R مولتیپل'],
    usage: 'the result of a trade measured in the risk it took: `+2.60R`',
    confidence: 0.75,
  },
  {
    id: 'allocation',
    domain: 'trading',
    english: 'Allocation',
    preferredFa: 'تخصیص',
    alternativesFa: ['تخصیص دارایی', 'تقسیم سرمایه'],
    usage: 'how the portfolio is divided across instruments',
    confidence: 0.9,
  },
  {
    id: 'cost-basis',
    domain: 'trading',
    english: 'Cost basis',
    preferredFa: 'بهای تمام‌شده',
    alternativesFa: ['قیمت تمام‌شده'],
    usage: 'what was actually paid, net of what the valuation counts',
    confidence: 0.9,
  },
  {
    id: 'concentration',
    domain: 'trading',
    english: 'Concentration',
    preferredFa: 'تمرکز',
    alternativesFa: ['تمرکز پرتفوی'],
    usage: 'how much of the whole sits in one place',
    confidence: 0.9,
  },
  {
    id: 'fee',
    domain: 'trading',
    english: 'Fee',
    preferredFa: 'کارمزد',
    alternativesFa: ['کمیسیون', 'کارمزد معاملات'],
    usage: 'what the broker charges, counted in the cost basis rather than ignored',
    confidence: 0.95,
  },
  {
    id: 'portfolio',
    domain: 'trading',
    english: 'Portfolio',
    preferredFa: 'پرتفوی',
    alternativesFa: ['سبد سرمایه‌گذاری', 'پورتفوی'],
    usage: 'everything held, read as one valuation',
    confidence: 0.85,
  },

  /* Risk -------------------------------------------------------------------- */
  {
    id: 'risk',
    domain: 'risk',
    english: 'Risk',
    preferredFa: 'ریسک',
    alternativesFa: ['خطر'],
    usage: 'the money a trade can lose by design — `خطر` is danger in general and is not this',
    confidence: 0.9,
  },
  {
    id: 'risk-per-trade',
    domain: 'risk',
    english: 'Risk per trade',
    preferredFa: 'ریسک هر معامله',
    alternativesFa: ['ریسک هر ترید'],
    usage: 'the fraction of equity one trade is allowed to put at risk',
    confidence: 0.9,
  },
  {
    id: 'position-size',
    domain: 'risk',
    english: 'Position size',
    preferredFa: 'حجم پوزیشن',
    alternativesFa: ['اندازه پوزیشن', 'حجم معامله'],
    usage: 'the arithmetic that turns a risk budget into a quantity',
    confidence: 0.9,
  },
  {
    id: 'leverage',
    domain: 'risk',
    english: 'Leverage',
    preferredFa: 'اهرم',
    alternativesFa: ['لوریج'],
    usage: 'the multiple a position is held at, and the reason a bound is stated first',
    confidence: 0.95,
  },
  {
    id: 'max-drawdown',
    domain: 'risk',
    english: 'Max drawdown',
    preferredFa: 'بیشترین افت سرمایه',
    alternativesFa: ['دراوداون', 'حداکثر افت'],
    usage: 'the worst peak-to-trough fall, which is what a limit is set against',
    confidence: 0.85,
  },
  {
    id: 'exposure',
    domain: 'risk',
    english: 'Exposure',
    preferredFa: 'مواجهه',
    alternativesFa: ['اکسپوژر', 'در معرض بودن'],
    usage: 'how much of the value is exposed to one move',
    confidence: 0.75,
  },

  /* Agent ------------------------------------------------------------------ */
  {
    id: 'agent',
    domain: 'agent',
    english: 'Agent',
    preferredFa: 'دستیار هوشمند',
    alternativesFa: ['ایجنت', 'عامل هوشمند'],
    usage: 'the model surface that answers, and that is never trusted on its own word',
    confidence: 0.8,
  },
  {
    id: 'evidence',
    domain: 'agent',
    english: 'Evidence',
    preferredFa: 'شواهد',
    alternativesFa: ['مدارک', 'سند'],
    usage: 'what an answer rests on, shown with the answer rather than after it',
    confidence: 0.9,
  },
  {
    id: 'uncertainty',
    domain: 'agent',
    english: 'Uncertainty',
    preferredFa: 'عدم‌قطعیت',
    alternativesFa: ['عدم قطعیت', 'ابهام'],
    usage: 'how unsure an answer is, carried as a label and not as a footnote',
    confidence: 0.9,
  },
  {
    id: 'provider',
    domain: 'agent',
    english: 'Provider',
    preferredFa: 'ارائه‌دهنده',
    alternativesFa: ['پرووایدر'],
    usage: 'the service a capability is bought from, named in Settings',
    confidence: 0.9,
  },
  {
    id: 'proposal',
    domain: 'agent',
    english: 'Proposal',
    preferredFa: 'پیشنهاد',
    alternativesFa: ['طرح پیشنهادی'],
    usage: 'a rule the agent suggests, which changes nothing until it is approved',
    confidence: 0.9,
  },
  {
    id: 'approval',
    domain: 'agent',
    english: 'Approval',
    preferredFa: 'تأیید',
    alternativesFa: ['تصویب'],
    usage: 'the decision that turns a proposal into something the product does',
    confidence: 0.9,
  },

  /* Memory ----------------------------------------------------------------- */
  {
    id: 'memory',
    domain: 'memory',
    english: 'Memory',
    preferredFa: 'حافظه',
    alternativesFa: ['مموری'],
    usage: 'what the agent may use, every claim carrying its source and trust state',
    confidence: 0.95,
  },
  {
    id: 'knowledge',
    domain: 'memory',
    english: 'Knowledge',
    preferredFa: 'دانش',
    alternativesFa: ['اطلاعات'],
    usage: 'what the product has decided, as opposed to what it has merely recorded',
    confidence: 0.9,
  },
  {
    id: 'source',
    domain: 'memory',
    english: 'Source',
    preferredFa: 'منبع',
    alternativesFa: ['مرجع'],
    usage: 'where a claim came from, named and never left empty',
    confidence: 0.95,
  },
  {
    id: 'provenance',
    domain: 'memory',
    english: 'Provenance',
    preferredFa: 'منشأ',
    alternativesFa: ['خاستگاه', 'سابقه'],
    usage: 'who recorded it, on what authority, and when',
    confidence: 0.85,
  },
  {
    id: 'trust-state',
    domain: 'memory',
    english: 'Trust state',
    preferredFa: 'وضعیت اعتماد',
    alternativesFa: ['حالت اعتماد', 'سطح اعتماد'],
    usage: 'how far a stored item may be relied on — proposed, validated, trusted or retired',
    confidence: 0.85,
  },
  {
    id: 'terminology',
    domain: 'memory',
    english: 'Terminology',
    preferredFa: 'اصطلاح‌شناسی',
    alternativesFa: ['واژگان تخصصی', 'ترمینولوژی'],
    usage: 'the agreed Persian form of a concept, and the forms it is not',
    confidence: 0.85,
  },

  /* Education -------------------------------------------------------------- */
  {
    id: 'curriculum',
    domain: 'education',
    english: 'Curriculum',
    preferredFa: 'برنامه درسی',
    alternativesFa: ['سرفصل'],
    usage: 'the six-month course the Academy is built on',
    confidence: 0.9,
  },
  {
    id: 'lesson',
    domain: 'education',
    english: 'Lesson',
    preferredFa: 'درس',
    alternativesFa: ['درسنامه'],
    usage: 'one unit of the curriculum',
    confidence: 0.9,
  },
  {
    id: 'exam',
    domain: 'education',
    english: 'Exam',
    preferredFa: 'آزمون',
    alternativesFa: ['امتحان'],
    usage: 'an assessment, scored against a rubric',
    confidence: 0.95,
  },
  {
    id: 'evaluation',
    domain: 'education',
    english: 'Evaluation',
    preferredFa: 'ارزیابی',
    alternativesFa: ['ارزشیابی'],
    usage: 'what the recorded prices say happened, with what could not be measured named',
    confidence: 0.9,
  },
  {
    id: 'capability',
    domain: 'education',
    english: 'Capability',
    preferredFa: 'قابلیت',
    alternativesFa: ['توانمندی'],
    usage: 'one thing the product can do, with its refusal path stated',
    confidence: 0.9,
  },
  {
    id: 'outcome',
    domain: 'education',
    english: 'Outcome',
    preferredFa: 'نتیجه',
    alternativesFa: ['بازده'],
    usage: 'what a recorded decision produced',
    confidence: 0.9,
  },
  {
    id: 'mistake',
    domain: 'education',
    english: 'Mistake',
    preferredFa: 'اشتباه',
    alternativesFa: ['خطا'],
    usage: 'what the journal records about the trade, named rather than softened',
    confidence: 0.85,
  },

  /* UI --------------------------------------------------------------------- */
  {
    id: 'dashboard',
    domain: 'ui',
    english: 'Dashboard',
    preferredFa: 'داشبورد',
    alternativesFa: ['میزکار', 'داشبرد'],
    usage: 'the shell page that opens first',
    confidence: 0.85,
  },
  {
    id: 'workspace',
    domain: 'ui',
    english: 'AI Workspace',
    preferredFa: 'فضای کار هوش مصنوعی',
    alternativesFa: ['کارگاه هوش مصنوعی', 'ورک‌اسپیس'],
    usage: 'the page a question is asked on',
    confidence: 0.75,
  },
  {
    id: 'research',
    domain: 'ui',
    english: 'Research',
    preferredFa: 'پژوهش',
    alternativesFa: ['تحقیق', 'ریسرچ'],
    usage: 'the page that tests a proposed rule against evidence',
    confidence: 0.85,
  },
  {
    id: 'journal',
    domain: 'ui',
    english: 'Journal',
    preferredFa: 'دفتر معاملات',
    alternativesFa: ['ژورنال', 'دفترچه معاملات'],
    usage: 'the page every trade is recorded on',
    confidence: 0.9,
  },
  {
    id: 'academy',
    domain: 'ui',
    english: 'Academy',
    preferredFa: 'آکادمی',
    alternativesFa: ['آموزشگاه', 'دانشکده'],
    usage: 'the learning half of the shell',
    confidence: 0.85,
  },
  {
    id: 'exams',
    domain: 'ui',
    english: 'Exams',
    preferredFa: 'آزمون‌ها',
    alternativesFa: ['امتحان‌ها'],
    usage: 'the page assessments are taken on',
    confidence: 0.9,
  },
  {
    id: 'lab',
    domain: 'ui',
    english: 'Trading Lab',
    preferredFa: 'آزمایشگاه معاملات',
    alternativesFa: ['لب معاملاتی'],
    usage: 'the practice surface, read-only and clearly labelled as such',
    confidence: 0.8,
  },
  {
    id: 'activity',
    domain: 'ui',
    english: 'Activity',
    preferredFa: 'فعالیت‌ها',
    alternativesFa: ['رویدادها'],
    usage: 'the live event stream and the background queue',
    confidence: 0.85,
  },
  {
    id: 'usage',
    domain: 'ui',
    english: 'Usage',
    preferredFa: 'مصرف',
    alternativesFa: ['مصرف اعتبار', 'استفاده'],
    usage: 'the page that says what each capability costs, refusals included',
    confidence: 0.8,
  },
  {
    id: 'profile',
    domain: 'ui',
    english: 'Profile',
    preferredFa: 'پروفایل',
    alternativesFa: ['نمایه'],
    usage: 'what the user has declared about their trading, with a freshness state',
    confidence: 0.85,
  },
  {
    id: 'settings',
    domain: 'ui',
    english: 'Settings',
    preferredFa: 'تنظیمات',
    alternativesFa: ['تنظیم‌ها'],
    usage: 'appearance, direction, providers and safety status',
    confidence: 0.95,
  },
  {
    id: 'language',
    domain: 'ui',
    english: 'Language',
    preferredFa: 'زبان',
    alternativesFa: ['لغت'],
    usage: 'the control that decides which of the two this interface speaks',
    confidence: 0.95,
  },
  {
    id: 'direction',
    domain: 'ui',
    english: 'Direction',
    preferredFa: 'جهت',
    alternativesFa: ['دایرکشن', 'راست‌به‌چپ'],
    usage: 'which way the shell flows, which is not the same question as which language it speaks',
    confidence: 0.9,
  },
  {
    id: 'preview',
    domain: 'ui',
    english: 'Preview',
    preferredFa: 'پیش‌نمایش',
    alternativesFa: ['پیش‌نمایشی'],
    usage: 'the notice that says the data on screen is not real data',
    confidence: 0.9,
  },
  {
    id: 'safety',
    domain: 'ui',
    english: 'Safety',
    preferredFa: 'ایمنی',
    alternativesFa: ['امنیت'],
    usage: 'the posture that says trading and broker execution are disabled',
    confidence: 0.85,
  },
  {
    id: 'group-workspace',
    domain: 'ui',
    english: 'Workspace',
    preferredFa: 'فضای کار',
    alternativesFa: ['محیط کار'],
    usage: 'the sidebar group holding the trade-facing pages',
    confidence: 0.85,
  },
  {
    id: 'group-learning',
    domain: 'ui',
    english: 'Learning',
    preferredFa: 'یادگیری',
    alternativesFa: ['آموزش'],
    usage: 'the sidebar group holding the academy and assessments',
    confidence: 0.85,
  },
  {
    id: 'group-system',
    domain: 'ui',
    english: 'System',
    preferredFa: 'سامانه',
    alternativesFa: ['سیستم'],
    usage: 'the sidebar group holding activity, usage, profile and settings',
    confidence: 0.8,
  },
];

/** The catalogue row for a concept, if this build knows it. */
export function terminologyTerm(id: string): TerminologyTerm | undefined {
  return TERMINOLOGY.find((term) => term.id === id);
}

/** Every row in one domain, in catalogue order. */
export function terminologyIn(domain: TerminologyDomain): TerminologyTerm[] {
  return TERMINOLOGY.filter((term) => term.domain === domain);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The seed: the same terms, as knowledge
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The catalogue as proposals for the language store.
 *
 * Derived rather than written twice, which is the point: the store holds the *trusted form* with a
 * version and a provenance, and there is exactly one place where a term is written down. A hand-kept
 * second copy is how a glossary starts disagreeing with itself.
 *
 * The entry's `value` is the preferred form and its first example is the English equivalent, because
 * those are the two facts a reader of the store needs. The alternatives go into `notes` — as prose a
 * reviewer reads, listing what this product does *not* write — since the field that would hold them
 * structurally does not exist and inventing one would mean a snapshot an older build cannot read.
 */
export function terminologyProposals(
  recordedAt: string,
  reference: string,
): readonly LanguageProposal[] {
  return TERMINOLOGY.map((term) => ({
    key: terminologyKey(term.domain, term.id),
    kind: 'terminology' as const,
    value: term.preferredFa,
    origin: 'human-review' as const,
    reference,
    recordedAt,
    baseVersion: 0,
    confidence: term.confidence,
    examples: [term.english, ...term.alternativesFa],
    mapping: null,
    notes: [
      `English: ${term.english}.`,
      `Used for: ${term.usage}.`,
      `Forms this product does not write: ${term.alternativesFa.join('، ')}.`,
    ].join(' '),
  }));
}

/* ────────────────────────────────────────────────────────────────────────────
 * The view: what the store currently allows
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A store holding exactly the lexicon's knowledge, through the ordinary proposal path.
 *
 * This is the lexicon's *own* store, and it exists so a lookup with no argument still asks the same
 * question of the same machinery: the catalogue is proposed, validated, trusted and versioned like any
 * other knowledge, and nothing here bypasses the store to read the catalogue directly. A caller that
 * wants one store holding everything — the rules, the locale's decisions and the terms — passes
 * `seededLanguageMemory()` instead; it holds these same entries, because `seed.ts` composes itself from
 * this catalogue rather than keeping a second copy of it.
 *
 * It is rebuilt per call, deliberately: `LanguageMemory` is mutable, and handing every caller the same
 * instance would let one of them decide something for all of them.
 */
export function terminologyMemory(): LanguageMemory {
  const memory = LanguageMemory.of([]);
  for (const proposal of terminologyProposals(TERMINOLOGY_RECORDED_AT, TERMINOLOGY_REFERENCE)) {
    memory.propose(proposal);
  }
  return memory;
}

/**
 * A term as the product may use it right now.
 *
 * It is the catalogue row with the store's corrections applied, which is the only way the two can be
 * kept from drifting: the row says what to write when nobody has said otherwise, the store says what
 * has been *decided*, and `supersededFa` remembers the forms the store has retired.
 */
export interface LexiconTerm extends TerminologyTerm {
  /** The store key this term is authorised by. */
  readonly key: string;
  /** What the store currently holds, when it is trusted. */
  readonly status: LanguageKnowledgeEntry['status'];
  /** The version the store holds — 1 for a term nobody has corrected yet. */
  readonly version: number;
  /** Forms a *previous version* of this term was written in. Reported, never rendered. */
  readonly supersededFa: readonly string[];
}

/** A term nobody has decided about is not usable copy, so the view drops it rather than guessing. */
function isUsable(entry: LanguageKnowledgeEntry | undefined): entry is LanguageKnowledgeEntry {
  return entry !== undefined && entry.status === 'trusted';
}

/** The lexicon as the store currently authorises it. */
export function lexiconTerms(memory: LanguageMemory = terminologyMemory()): LexiconTerm[] {
  const terms: LexiconTerm[] = [];
  const seen = new Set<string>();

  for (const row of TERMINOLOGY) {
    const key = terminologyKey(row.domain, row.id);
    const entry = memory.get(key);
    if (!isUsable(entry)) continue;
    seen.add(row.id);
    terms.push(viewOf(row, key, entry, memory));
  }

  // A term the store holds and the catalogue does not know about: added by a reviewed candidate, and
  // it belongs in the lexicon for the same reason the catalogue does. Its English equivalent comes
  // from the entry's first example, which is the convention `terminologyProposals` writes.
  for (const entry of memory.list('terminology')) {
    if (!isUsable(entry)) continue;
    const id = entry.key.split('.').slice(2).join('.');
    if (id === '' || seen.has(id)) continue;
    const domain = entry.key.split('.')[1] as TerminologyDomain;
    if (!TERMINOLOGY_DOMAINS.includes(domain)) continue;
    const english = entry.examples[0] ?? id;
    terms.push({
      ...viewOf(
        {
          id,
          domain,
          english,
          preferredFa: entry.value,
          alternativesFa: entry.examples.slice(1),
          usage: entry.notes ?? '',
          confidence: entry.confidence,
        },
        entry.key,
        entry,
        memory,
      ),
    });
  }

  return terms;
}

/**
 * One term, joined with the store's current decision about it.
 *
 * The alternatives come from three places, and the third is what makes the memory survive a restart:
 *
 *   1. the catalogue's list — the forms this product decided against when the term was written down;
 *   2. the entry's own examples, which is where a *reviewed candidate* puts the form it replaces — the
 *      validation in `terminologyUpdates.ts` refuses a correction that does not;
 *   3. the store's history, which still knows every form this key was ever written in.
 *
 * (3) is richer than (2) — it distinguishes "used to write" from "never wrote" — and (2) is the one
 * that survives: a snapshot carries current entries, not the log, so a reloaded store remembers what it
 * replaced only because the correction wrote it into the entry. That is deliberate rather than
 * incidental, and `tests/persian-terminology.test.ts` asserts both halves.
 */
function viewOf(
  row: TerminologyTerm,
  key: string,
  entry: LanguageKnowledgeEntry,
  memory: LanguageMemory,
): LexiconTerm {
  const supersededFa = [
    ...new Set(
      memory
        .revisions(key)
        .filter((revision) => revision.version < entry.version && revision.value !== entry.value)
        .map((revision) => revision.value),
    ),
  ];
  const alternativesFa = [
    ...new Set([...row.alternativesFa, ...entry.examples.slice(1), ...supersededFa]),
  ].filter((form) => form !== entry.value);
  return {
    ...row,
    preferredFa: entry.value,
    alternativesFa,
    key,
    status: entry.status,
    version: entry.version,
    supersededFa,
  };
}

/** The form to write for a concept, or nothing when the store does not currently trust one. */
export function preferredTerm(
  id: string,
  memory: LanguageMemory = terminologyMemory(),
): string | undefined {
  return lexiconTerms(memory).find((term) => term.id === id)?.preferredFa;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Lookup
 * ──────────────────────────────────────────────────────────────────────────── */

/** What a lookup found, and which of the three ways it found it. */
export interface TermLookup {
  readonly term: LexiconTerm;
  /** `english` and `preferred` are the answers; `alternative` means "understood, not written". */
  readonly matched: 'english' | 'preferred' | 'alternative';
  /** The exact text that matched, so a caller can show what it looked at. */
  readonly matchedText: string;
}

/**
 * Find the term a piece of text names, in either language.
 *
 * The Persian side is compared in *canonical form*: a caller holding `سمبل` typed with an Arabic yeh
 * asks the same question as one holding the Persian spelling, because the text is put through the same
 * normalizer the product uses before it is compared. That is not a nicety — the whole reason 7.5.2.1
 * exists is that two spellings of one word are routine in Persian input, and a lookup that misses one
 * of them is a lookup that reports a term as unknown when it is merely typed differently.
 *
 * English is matched case-insensitively and exactly; `position` does not find `position size`, because
 * a lookup that guesses is a lookup that eventually returns the wrong term confidently.
 */
export function lookupTerm(
  text: string,
  memory: LanguageMemory = terminologyMemory(),
): TermLookup | undefined {
  const needle = text.trim();
  if (needle === '') return undefined;
  const canonical = canonicalText(needle);
  const terms = lexiconTerms(memory);

  for (const term of terms) {
    if (term.english.toLowerCase() === needle.toLowerCase()) {
      return { term, matched: 'english', matchedText: term.english };
    }
  }
  for (const term of terms) {
    if (canonicalText(term.preferredFa) === canonical) {
      return { term, matched: 'preferred', matchedText: term.preferredFa };
    }
  }
  for (const term of terms) {
    const alternative = allAlternatives(term).find(
      (candidate) => canonicalText(candidate) === canonical,
    );
    if (alternative !== undefined) {
      return { term, matched: 'alternative', matchedText: alternative };
    }
  }
  return undefined;
}

/** Every form of a term that is not the preferred one: the catalogue's, plus the store's history. */
export function allAlternatives(term: LexiconTerm): string[] {
  return [...new Set([...term.alternativesFa, ...term.supersededFa])].filter(
    (form) => form !== term.preferredFa,
  );
}

/** The canonical comparison form of a piece of Persian text. */
function canonicalText(text: string): string {
  return normalizePersianContent(text).text;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Consistency
 * ──────────────────────────────────────────────────────────────────────────── */

/** One place where the text names a concept in a form this product does not write. */
export interface TerminologyFinding {
  readonly id: string;
  readonly key: string;
  readonly domain: TerminologyDomain;
  readonly english: string;
  /** The form that should have been written. */
  readonly preferredFa: string;
  /** The form that was written. */
  readonly foundFa: string;
  readonly index: number;
  readonly reason: string;
}

export interface TerminologyOptions {
  readonly memory?: LanguageMemory;
  /** Concepts to leave out of this check, by id. */
  readonly ignore?: readonly string[];
}

/**
 * Find inconsistent terminology in a piece of text.
 *
 * Terminology is reported rather than rewritten, and that is a stronger claim than it looks. Renaming
 * `حد سوددهی` to `حد سود` inside a figure or a code span would be a corruption, not a correction; and
 * renaming it inside a sentence changes a sentence a human may have written deliberately — a lesson
 * note, a trade rationale, an imported record. What this product owns is the copy *it* writes, so the
 * check says what it found and the copy that gets corrected is the copy somebody is about to ship.
 *
 * Text inside a technical span (a URL, a path, an identifier) is skipped for the same reason.
 *
 * One form is *not* reported even when it is an alternative, and that is the answer to the phase's
 * "controlled alternatives where context genuinely requires a different wording": a form a reviewer has
 * named in a trusted `exception` entry is approved, so `ژورنال` can be right in a context where
 * `دفتر معاملات` is too long. The decision lives in the store with a person's provenance — the same
 * mechanism Phase 7.5.2.1 uses to protect a string from the normalizer, reused rather than reinvented.
 */
export function terminologyFindings(
  text: string,
  options: TerminologyOptions = {},
): TerminologyFinding[] {
  const memory = options.memory ?? terminologyMemory();
  const ignored = new Set(options.ignore ?? []);
  const approved = new Set(protectedLiterals(memory));
  const spans = findSpans(text);
  const findings: TerminologyFinding[] = [];

  for (const term of lexiconTerms(memory)) {
    if (ignored.has(term.id)) continue;
    for (const alternative of allAlternatives(term)) {
      if (approved.has(alternative)) continue;
      const start = indexOfStandalone(text, alternative);
      let from = start;
      while (from !== -1) {
        if (!overlapsSpan(spans, from, from + alternative.length, ['technical', 'numeric'])) {
          findings.push({
            id: term.id,
            key: term.key,
            domain: term.domain,
            english: term.english,
            preferredFa: term.preferredFa,
            foundFa: alternative,
            index: from,
            // Two reasons, because they are two different facts: a form the store retired has a
            // version that retired it, and a form it never wrote has no such story. The distinction
            // comes from the store's history and is the reason a correction is worth recording at all.
            reason: term.supersededFa.includes(alternative)
              ? `This product used to write \`${alternative}\` for ${term.english}, and version ${term.version} replaced it with \`${term.preferredFa}\`.`
              : `This product writes \`${term.preferredFa}\` for ${term.english}; \`${alternative}\` is understood and is not the preferred form.`,
          });
        }
        from = indexOfStandalone(text, alternative, from + 1);
      }
    }
  }

  return findings.sort((left, right) => left.index - right.index);
}

/**
 * Where a form appears as a *word* rather than as part of a longer one.
 *
 * The boundary is the Persian alphabet and the ZWNJ, and the reason is that both matter: `تایم فریم`
 * is two words and must still be found, while `حد سود` inside `حد سوددهی` and `درس` inside `درسی` must
 * not be. A space is a boundary; a letter is not; the half-space is not either, because it exists to
 * join letters into one word.
 */
function indexOfStandalone(text: string, form: string, from = 0): number {
  const letters = /[\u0621-\u063A\u0641-\u064A\u066E-\u06D3\u06D5\u06FA-\u06FF\u200C]/u;
  let index = text.indexOf(form, from);
  while (index !== -1) {
    const before = index === 0 ? '' : (text[index - 1] as string);
    const after = text[index + form.length];
    const startsClean = before === '' || !letters.test(before);
    const endsClean = after === undefined || !letters.test(after);
    if (startsClean && endsClean) return index;
    index = text.indexOf(form, index + 1);
  }
  return -1;
}

/**
 * The same walk, over text that is about to be *written*: corrected terminology comes back as a form
 * to compare against, not as a rewrite.
 *
 * Kept as its own name because the two calls read differently at a call site — a review tool asks what
 * is wrong with a paragraph, a copy tool asks whether the sentence it is about to ship is consistent —
 * and one name for both would hide which question is being asked.
 */
export function terminologyReport(
  text: string,
  options: TerminologyOptions & NormalizationOptions = {},
): { text: string; findings: TerminologyFinding[] } {
  // The text is normalized first, so a form written with an Arabic yeh is still recognised: the check
  // is about vocabulary, and it should not be defeated by a keyboard.
  const normalized = normalizePersianContent(text, options).text;
  return { text: normalized, findings: terminologyFindings(normalized, options) };
}
