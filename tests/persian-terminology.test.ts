/**
 * Phase 7.5.2.2 — the terminology contract.
 *
 * The claims, in the order they can fail:
 *
 *   1. **The lexicon is the store, not a second glossary.** Every catalogue term has a trusted entry
 *      whose value *is* the preferred form, and every terminology entry the store holds is a term the
 *      lexicon can show. Two copies of a glossary is how a glossary starts disagreeing with itself.
 *   2. **The vocabulary is the product's.** Every page and group the shell renders has a preferred
 *      Persian form, and no term exists that the current product has no string for.
 *   3. **Lookup answers in both languages, and never guesses.** English exactly, Persian in canonical
 *      form, and a form this product does not write is *reported* rather than returned as the answer.
 *   4. **A term only moves through the controlled path.** A candidate is validated before it is stored;
 *      model output is parked; a reviewer is what accepts it; a correction is a new version that keeps
 *      what it replaced; and all of it survives a reload.
 *
 * The Persian is written as characters here rather than as escapes — a test suite for a lexicon has to
 * be readable by the person reviewing the lexicon — and the canonical-form case below is what makes
 * that safe: every term is run through the Phase 7.5.2.1 normalizer, so an Arabic yeh or kaf typed by
 * accident fails the suite instead of shipping.
 */

import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, NAV_SECTIONS } from '../web/src/config/navigation.js';
import { translate } from '../web/src/i18n/index.js';
import {
  LanguageMemory,
  TERMINOLOGY,
  TERMINOLOGY_DOMAINS,
  TERMINOLOGY_DOMAIN_MEANING,
  TERMINOLOGY_REFERENCE,
  acceptTermCandidate,
  allAlternatives,
  lexiconTerms,
  lookupTerm,
  normalizePersianContent,
  preferredTerm,
  rejectTermCandidate,
  reviewTermCandidate,
  seededLanguageMemory,
  terminologyFindings,
  terminologyIn,
  terminologyKey,
  terminologyMemory,
  terminologyReport,
  terminologyTerm,
  type TermCandidate,
  type TerminologyDomain,
} from '../web/src/language/index.js';

/** A fixed instant, so every candidate in this suite is reproducible. */
const AT = '2026-09-25T12:00:00.000Z';

/** The concept behind each page and group of the shell — the mapping the coverage test asserts. */
const SHELL_CONCEPTS: Readonly<Record<string, string>> = {
  dashboard: 'dashboard',
  agent: 'workspace',
  memory: 'memory',
  research: 'research',
  journal: 'journal',
  portfolio: 'portfolio',
  evaluation: 'evaluation',
  academy: 'academy',
  exams: 'exams',
  lab: 'lab',
  activity: 'activity',
  usage: 'usage',
  profile: 'profile',
  settings: 'settings',
  workspace: 'group-workspace',
  learning: 'group-learning',
  system: 'group-system',
};

/** A candidate that passes every check, so each test can change exactly one thing. */
function candidate(overrides: Partial<TermCandidate> = {}): TermCandidate {
  return {
    concept: 'backtest',
    domain: 'trading',
    english: 'Backtest',
    preferredFa: 'بک‌تست',
    alternativesFa: ['آزمون تاریخی'],
    usage: 'replaying recorded prices over a rule',
    origin: 'human-review',
    reference: 'review: phase-7.5.2.2',
    recordedAt: AT,
    ...overrides,
  };
}

describe('the lexicon is the product’s vocabulary, held as knowledge', () => {
  it('has a trusted entry for every catalogue term, and a term for every entry', () => {
    const memory = seededLanguageMemory();
    for (const row of TERMINOLOGY) {
      const key = terminologyKey(row.domain, row.id);
      const entry = memory.get(key);
      expect(entry, `${key} has no entry`).toBeDefined();
      expect(entry?.status, `${key} is not trusted`).toBe('trusted');
      expect(entry?.version).toBe(1);
      expect(entry?.kind).toBe('terminology');
      // One fact stated once: the entry's value *is* the preferred form, and its first example is the
      // English the product already shows.
      expect(entry?.value, `${key} disagrees with the catalogue`).toBe(row.preferredFa);
      expect(entry?.examples[0]).toBe(row.english);
      expect(entry?.provenance.reference).toBe(TERMINOLOGY_REFERENCE);
      expect(entry?.confidence).toBe(row.confidence);
      // A reviewer reading the store sees what this product does *not* write, not just what it does.
      for (const alternative of row.alternativesFa) {
        expect(entry?.notes, `${key} does not record \`${alternative}\``).toContain(alternative);
      }
    }
    // The other direction: the seeded store holds no terminology the lexicon cannot show.
    const shown = new Set(lexiconTerms(memory).map((term) => term.key));
    for (const entry of memory.list('terminology')) {
      expect(shown.has(entry.key), `${entry.key} is stored and not shown`).toBe(true);
    }
    expect(memory.list('terminology').length).toBe(TERMINOLOGY.length);
  });

  it('writes every term in the Persian the product would render', () => {
    // The safety net for a file full of literal Persian: a term that is not already canonical — an
    // Arabic yeh, an Arabic kaf, a stray ZWNJ — would be rewritten by the product's own normalizer, and
    // a term the product rewrites is two terms.
    const wrong: string[] = [];
    for (const term of TERMINOLOGY) {
      for (const form of [term.preferredFa, ...term.alternativesFa]) {
        const canonical = normalizePersianContent(form).text;
        if (canonical !== form) wrong.push(`${term.id}: \`${form}\` should be \`${canonical}\``);
      }
      expect(term.preferredFa.length, `${term.id} has no preferred form`).toBeGreaterThan(0);
      expect(term.usage.length, `${term.id} has no usage sentence`).toBeGreaterThan(0);
      expect(term.confidence).toBeGreaterThan(0);
      expect(term.confidence).toBeLessThanOrEqual(1);
      expect(term.alternativesFa).not.toContain(term.preferredFa);
      expect(new Set(term.alternativesFa).size).toBe(term.alternativesFa.length);
    }
    expect(wrong).toEqual([]);
  });

  it('has a preferred form for every page and group the shell shows', () => {
    for (const section of NAV_SECTIONS) {
      const id = SHELL_CONCEPTS[section.id];
      expect(id, `${section.id} has no concept`).toBeDefined();
      expect(preferredTerm(id ?? ''), `${section.id} has no preferred Persian form`).toBeDefined();
    }
    for (const group of NAV_GROUPS) {
      const id = SHELL_CONCEPTS[group.id];
      expect(preferredTerm(id ?? ''), `${group.id} has no preferred Persian form`).toBeDefined();
    }
    // And the mapping is complete in the other direction: no concept here is unused.
    const mapped = new Set(Object.values(SHELL_CONCEPTS));
    expect(mapped.size).toBe(NAV_SECTIONS.length + NAV_GROUPS.length);
    for (const id of mapped)
      expect(terminologyTerm(id), `${id} is not in the catalogue`).toBeDefined();
  });

  it('uses that preferred form as the sidebar wording, rather than a second translation', () => {
    // Phase 7.5.3.3 wrote the interface into a catalogue, which is where a glossary starts disagreeing with
    // itself: the sidebar could have called `academy` «آکادمی» while the terminology record called it
    // something else. It does not — the Persian label *is* the record's preferred form, for every entry.
    for (const section of NAV_SECTIONS) {
      const concept = SHELL_CONCEPTS[section.id];
      expect(concept, `${section.id} has no concept`).toBeDefined();
      expect(
        translate('fa', section.labelKey),
        `${section.id} is named differently in the sidebar`,
      ).toBe(preferredTerm(concept ?? ''));
    }
    for (const group of NAV_GROUPS) {
      expect(
        translate('fa', group.labelKey),
        `${group.id} is named differently in the sidebar`,
      ).toBe(preferredTerm(SHELL_CONCEPTS[group.id] ?? ''));
    }
  });

  it('names its six domains, and every domain carries terms', () => {
    for (const domain of TERMINOLOGY_DOMAINS) {
      expect(TERMINOLOGY_DOMAIN_MEANING[domain].length).toBeGreaterThan(0);
      expect(terminologyIn(domain).length, `${domain} is empty`).toBeGreaterThan(0);
    }
    expect(TERMINOLOGY_DOMAINS.length).toBe(6);
    // Concept ids are unique across domains, because a form cannot mean two things.
    expect(new Set(TERMINOLOGY.map((term) => term.id)).size).toBe(TERMINOLOGY.length);
    expect(new Set(TERMINOLOGY.map((term) => terminologyKey(term.domain, term.id))).size).toBe(
      TERMINOLOGY.length,
    );
  });

  it('holds no term two concepts share, and no preferred form used as an alternative', () => {
    const preferred = new Map(TERMINOLOGY.map((term) => [term.preferredFa, term.id]));
    expect(preferred.size).toBe(TERMINOLOGY.length);
    for (const term of TERMINOLOGY) {
      for (const alternative of term.alternativesFa) {
        expect(
          preferred.get(alternative),
          `\`${alternative}\` is both an alternative of ${term.id} and another term's preferred form`,
        ).toBeUndefined();
      }
    }
  });
});

describe('lookup answers in both languages, and says how it found it', () => {
  const memory = terminologyMemory();

  it('finds a term by the English the product already shows', () => {
    expect(lookupTerm('Position', memory)).toMatchObject({
      matched: 'english',
      matchedText: 'Position',
    });
    expect(lookupTerm('position', memory)?.term.id).toBe('position');
    expect(lookupTerm('Max drawdown', memory)?.term.id).toBe('max-drawdown');
    // Capitalisation is not a decision, so it is not asked about.
    expect(lookupTerm('TAKE-PROFIT', memory)?.term.id).toBe('take-profit');
  });

  it('finds a term by its preferred form, whatever keyboard wrote it', () => {
    const preferred = lookupTerm('تایم‌فریم', memory);
    expect(preferred?.term.id).toBe('timeframe');
    expect(preferred?.matched).toBe('preferred');
    // The same word typed with an Arabic yeh — the ordinary accident this layer exists for — is the
    // same question, because the text is canonicalized before it is compared.
    expect(lookupTerm('تايم‌فریم', memory)?.term.id).toBe('timeframe');
    expect(lookupTerm('كارمزد', memory)?.term.id).toBe('fee');
    expect(lookupTerm('بهای تمام‌شده', memory)?.matched).toBe('preferred');
  });

  it('recognises a form this product does not write, and says so rather than adopting it', () => {
    const alternative = lookupTerm('ژورنال', memory);
    expect(alternative?.term.id).toBe('journal');
    expect(alternative?.matched).toBe('alternative');
    expect(alternative?.term.preferredFa).toBe('دفتر معاملات');
    expect(allAlternatives(alternative!.term)).toContain('ژورنال');
  });

  it('returns nothing rather than guessing', () => {
    expect(lookupTerm('pos', memory)).toBeUndefined();
    expect(lookupTerm('', memory)).toBeUndefined();
    expect(lookupTerm('book', memory)).toBeUndefined();
    // A word that only *contains* a term is not the term.
    expect(lookupTerm('position size', memory)?.term.id).toBe('position-size');
    expect(lookupTerm('positions', memory)).toBeUndefined();
  });

  it('shows a term only while the store trusts it', () => {
    const empty = LanguageMemory.of([]);
    expect(lexiconTerms(empty)).toEqual([]);
    expect(preferredTerm('position', empty)).toBeUndefined();
    expect(lookupTerm('Position', empty)).toBeUndefined();

    const retired = seededLanguageMemory();
    retired.deprecate(terminologyKey('trading', 'position'), {
      origin: 'human-review',
      reference: 'retired: test',
      at: AT,
      expectedVersion: 1,
    });
    expect(preferredTerm('position', retired)).toBeUndefined();
    expect(lookupTerm('Position', retired)).toBeUndefined();
  });
});

describe('consistency: one concept, one preferred form', () => {
  const memory = seededLanguageMemory();

  it('reports a form this product does not write, with the form it does', () => {
    const text = 'حجم معامله را با اکسپوژر کمتر و ژورنال دقیق‌تر بنویس';
    const findings = terminologyFindings(text, { memory });
    expect(findings.map((finding) => [finding.foundFa, finding.preferredFa])).toEqual([
      ['حجم معامله', 'حجم پوزیشن'],
      ['اکسپوژر', 'مواجهه'],
      ['ژورنال', 'دفتر معاملات'],
    ]);
    const journal = findings.find((finding) => finding.foundFa === 'ژورنال');
    expect(journal?.english).toBe('Journal');
    expect(journal?.domain).toBe('ui');
    // The index points at the text it was given, so a review surface can highlight it.
    expect(text.slice(journal?.index ?? 0, (journal?.index ?? 0) + 'ژورنال'.length)).toBe('ژورنال');
    expect(journal?.reason).toContain('دفتر معاملات');
  });

  it('says nothing about text that already uses the preferred forms', () => {
    const text = 'حجم پوزیشن را با مواجهه کمتر و دفتر معاملات دقیق‌تر بنویس';
    expect(terminologyFindings(text, { memory })).toEqual([]);
  });

  it('does not report a word that merely contains a form', () => {
    // `حد سود` sits inside `حد سوددهی`, and `درس` inside `درسی`. A boundary is a letter or a
    // half-space, so neither counts as a match on its own — the only finding here is the alternative
    // that was actually written, and `حد سود` is its *preferred* form rather than a second finding.
    const findings = terminologyFindings('حد سوددهی و زمانی که روی آن درسی خوانده شد', { memory });
    expect(findings.map((finding) => finding.foundFa)).toEqual(['حد سوددهی']);
    expect(findings.map((finding) => finding.preferredFa)).toEqual(['حد سود']);
    // Nothing is reported for a word the lexicon does not know at all.
    expect(terminologyFindings('درسی خوانده شد', { memory })).toEqual([]);
  });

  it('skips a technical span', () => {
    expect(terminologyFindings('به `ژورنال` نگاه کن', { memory })).toEqual([]);
    expect(terminologyFindings('به https://a.example/ژورنال نگاه کن', { memory })).toEqual([]);
  });

  it('accepts a wording a reviewer approved for a context, without touching the lexicon', () => {
    const memory = seededLanguageMemory();
    // The alternative stays an alternative — a lookup still says `دفتر معاملات` is the preferred form —
    // and the check stops reporting it, because a person decided the short word is right here.
    memory.propose({
      key: 'exception.terminology.journal-short-form',
      kind: 'exception',
      value: 'The short word is used where the heading has no room for the full one.',
      origin: 'human-review',
      reference: 'review: phase-7.5.2.2',
      recordedAt: AT,
      baseVersion: 0,
      examples: ['ژورنال'],
    });
    expect(terminologyFindings('ژورنال من', { memory })).toEqual([]);
    expect(terminologyFindings('اکسپوژر من', { memory }).map((f) => f.foundFa)).toEqual([
      'اکسپوژر',
    ]);
    expect(lookupTerm('ژورنال', memory)?.matched).toBe('alternative');
    expect(preferredTerm('journal', memory)).toBe('دفتر معاملات');
  });

  it('can be narrowed to the terms a caller cares about', () => {
    const text = 'ژورنال و اکسپوژر';
    expect(
      terminologyFindings(text, { memory, ignore: ['journal'] }).map((f) => f.foundFa),
    ).toEqual(['اکسپوژر']);
  });

  it('reports, and never rewrites what a human wrote', () => {
    const text = 'ژورنال من';
    const report = terminologyReport(text, { memory });
    expect(report.text).toBe(text);
    expect(report.findings.map((finding) => finding.foundFa)).toEqual(['ژورنال']);
  });
});

describe('a term arrives through the controlled path', () => {
  it('accepts a reviewed candidate, in the store and in the lexicon', () => {
    const memory = seededLanguageMemory();
    const decision = reviewTermCandidate(candidate(), memory);
    expect(decision.outcome).toBe('accepted');
    if (decision.outcome !== 'accepted') return;

    expect(decision.entry.version).toBe(1);
    expect(decision.entry.status).toBe('trusted');
    expect(decision.entry.provenance.origin).toBe('human-review');
    expect(decision.entry.provenance.reference).toBe('review: phase-7.5.2.2');
    // A concept the catalogue does not know about is in the lexicon anyway, because the store is what
    // the lexicon reads.
    expect(decision.term.preferredFa).toBe('بک‌تست');
    expect(decision.term.english).toBe('Backtest');
    expect(preferredTerm('backtest', memory)).toBe('بک‌تست');
    expect(lookupTerm('Backtest', memory)?.term.id).toBe('backtest');
    expect(memory.get('term.trading.backtest')?.value).toBe('بک‌تست');
  });

  it('refuses a candidate that is not Persian, not canonical, or not usable', () => {
    const memory = seededLanguageMemory();
    const rejects = [
      [candidate({ preferredFa: 'Backtest' }), 'no Persian letter'],
      [candidate({ concept: 'Back Test' }), 'a concept is lower-case words'],
      [candidate({ reference: '' }), 'reference'],
      [candidate({ usage: '' }), 'usage'],
      [
        candidate({ preferredFa: 'بک‌تست', alternativesFa: ['بک‌تست'] }),
        'cannot also be one of its',
      ],
    ] as const;
    for (const [proposal, expected] of rejects) {
      const decision = reviewTermCandidate(proposal, memory);
      expect(decision.outcome, JSON.stringify(proposal)).toBe('rejected');
      if (decision.outcome === 'rejected') expect(decision.reason).toContain(expected);
    }
    // Nothing was written by a refusal.
    expect(memory.list('terminology').length).toBe(TERMINOLOGY.length);
    expect(memory.pending('term.trading.backtest')).toBeUndefined();
  });

  it('names the canonical form when a candidate is not written the way this product writes', () => {
    const memory = seededLanguageMemory();
    // The Arabic kaf: the single most common accident in Persian input, and the one the product's
    // normalizer already folds. A term is stored canonical or not at all.
    const decision = reviewTermCandidate(candidate({ preferredFa: 'بكتست' }), memory);
    expect(decision.outcome).toBe('rejected');
    if (decision.outcome === 'rejected') {
      expect(decision.canonicalFa).toBe('بکتست');
      expect(decision.reason).toContain('canonical');
    }
  });

  it('refuses a candidate that collides with a decision already made', () => {
    const memory = seededLanguageMemory();
    const collisions = [
      [candidate({ preferredFa: 'پوزیشن' }), 'already the preferred form of `position`'],
      [
        candidate({ preferredFa: 'سرمایه‌گذاری', alternativesFa: ['پوزیشن'] }),
        'already the preferred form of `position`',
      ],
      [candidate({ preferredFa: 'ترید' }), 'explicitly does not write for `trade`'],
    ] as const;
    for (const [proposal, expected] of collisions) {
      const decision = reviewTermCandidate(proposal, memory);
      expect(decision.outcome).toBe('rejected');
      if (decision.outcome === 'rejected') expect(decision.reason).toContain(expected);
    }
  });

  it('parks model output, and a rejection leaves trusted terminology exactly as it was', () => {
    const memory = seededLanguageMemory();
    const before = memory.get('term.trading.position');
    const decision = reviewTermCandidate(
      candidate({
        concept: 'position',
        english: 'Position',
        preferredFa: 'موقعیت معامله',
        alternativesFa: ['پوزیشن'],
        origin: 'agent-proposal',
        reference: 'model: session-42',
        baseVersion: 1,
      }),
      memory,
    );
    expect(decision.outcome).toBe('pending');
    if (decision.outcome === 'pending') expect(decision.reason).toContain('agent-proposal');
    // The lexicon still answers with the trusted term, and the store's current knowledge is untouched.
    expect(preferredTerm('position', memory)).toBe('پوزیشن');
    expect(memory.get('term.trading.position')).toEqual(before);
    expect(memory.pending('term.trading.position')?.value).toBe('موقعیت معامله');

    const rejected = rejectTermCandidate('term.trading.position', memory, {
      origin: 'human-review',
      reference: 'review: the trusted form is fine',
      at: AT,
      expectedVersion: 1,
    });
    expect(rejected.outcome).toBe('rejected');
    expect(memory.pending('term.trading.position')).toBeUndefined();
    expect(preferredTerm('position', memory)).toBe('پوزیشن');
    expect(memory.history().map((change) => change.action)).toContain('rejected');
  });

  it('accepts a parked candidate only through a review, and the reviewer owns the provenance', () => {
    const memory = seededLanguageMemory();
    reviewTermCandidate(
      candidate({ origin: 'agent-proposal', reference: 'model: session-42' }),
      memory,
    );
    expect(preferredTerm('backtest', memory)).toBeUndefined();

    const accepted = acceptTermCandidate('term.trading.backtest', memory, {
      origin: 'human-review',
      reference: 'review: phase-7.5.2.2',
      at: AT,
      expectedVersion: 0,
    });
    expect(accepted.outcome).toBe('accepted');
    if (accepted.outcome !== 'accepted') return;
    expect(accepted.entry.version).toBe(1);
    expect(accepted.entry.provenance.origin).toBe('human-review');
    expect(preferredTerm('backtest', memory)).toBe('بک‌تست');
  });

  it('versions a correction, keeps what it replaced, and starts reporting the old form', () => {
    const memory = seededLanguageMemory();
    // A correction must say what it replaces — that is the rule that makes the version history useful
    // rather than merely complete.
    const silent = reviewTermCandidate(
      candidate({
        concept: 'max-drawdown',
        domain: 'risk',
        english: 'Max drawdown',
        preferredFa: 'حداکثر افت سرمایه',
        alternativesFa: [],
        usage: 'the worst peak-to-trough fall',
        baseVersion: 1,
      }),
      memory,
    );
    expect(silent.outcome).toBe('rejected');
    if (silent.outcome === 'rejected') expect(silent.reason).toContain('must say what it replaces');

    const corrected = reviewTermCandidate(
      candidate({
        concept: 'max-drawdown',
        domain: 'risk',
        english: 'Max drawdown',
        preferredFa: 'حداکثر افت سرمایه',
        alternativesFa: ['بیشترین افت سرمایه', 'دراوداون'],
        usage: 'the worst peak-to-trough fall',
        baseVersion: 1,
      }),
      memory,
    );
    expect(corrected.outcome).toBe('accepted');
    if (corrected.outcome !== 'accepted') return;
    expect(corrected.entry.version).toBe(2);
    expect(corrected.term.preferredFa).toBe('حداکثر افت سرمایه');
    expect(corrected.term.supersededFa).toEqual(['بیشترین افت سرمایه']);

    // Nothing was edited in place: both versions are still there, and the old form is now reported.
    const versions = memory.revisions('term.risk.max-drawdown');
    expect(versions.map((entry) => entry.version)).toEqual([1, 2]);
    expect(versions[0]?.value).toBe('بیشترین افت سرمایه');

    const findings = terminologyFindings('بیشترین افت سرمایه چقدر بود؟', { memory });
    expect(findings.map((finding) => finding.foundFa)).toEqual(['بیشترین افت سرمایه']);
    expect(findings[0]?.preferredFa).toBe('حداکثر افت سرمایه');
    expect(findings[0]?.reason).toContain('used to write');
    expect(findings[0]?.reason).toContain('version 2');
  });

  it('refuses a correction written against a version that has moved', () => {
    const memory = seededLanguageMemory();
    const stale = reviewTermCandidate(
      candidate({
        concept: 'max-drawdown',
        domain: 'risk',
        english: 'Max drawdown',
        preferredFa: 'افت حداکثری',
        alternativesFa: ['بیشترین افت سرمایه'],
        baseVersion: 3,
      }),
      memory,
    );
    expect(stale.outcome).toBe('rejected');
    if (stale.outcome === 'rejected') expect(stale.reason).toContain('has moved');
    expect(preferredTerm('max-drawdown', memory)).toBe('بیشترین افت سرمایه');
  });

  it('survives a snapshot round trip, corrections and rejections included', () => {
    const memory = seededLanguageMemory();
    reviewTermCandidate(
      candidate({
        concept: 'max-drawdown',
        domain: 'risk',
        english: 'Max drawdown',
        preferredFa: 'حداکثر افت سرمایه',
        alternativesFa: ['بیشترین افت سرمایه'],
        baseVersion: 1,
      }),
      memory,
    );
    reviewTermCandidate(
      candidate({ concept: 'backtest', origin: 'agent-proposal', reference: 'model: session-42' }),
      memory,
    );

    // Persist, reload, and ask the same questions of the reloaded store.
    const reloaded = LanguageMemory.from(JSON.parse(JSON.stringify(memory.snapshot())));
    expect(reloaded.get('term.risk.max-drawdown')?.version).toBe(2);
    expect(preferredTerm('max-drawdown', reloaded)).toBe('حداکثر افت سرمایه');
    expect(preferredTerm('backtest', reloaded)).toBeUndefined();
    expect(lookupTerm('Max drawdown', reloaded)?.term.preferredFa).toBe('حداکثر افت سرمایه');
    expect(
      terminologyFindings('بیشترین افت سرمایه', { memory: reloaded }).map((f) => f.preferredFa),
    ).toEqual(['حداکثر افت سرمایه']);
    expect(reloaded.list('terminology').length).toBe(TERMINOLOGY.length);

    // What a reload keeps and what it does not, stated rather than assumed. A snapshot carries current
    // entries and not the change log, so the *distinction* between "this product used to write that"
    // and "it never wrote that" is gone — but the fact is not, because the correction had to write the
    // form it replaced into the entry. A store that forgot it entirely would be re-solving the same
    // language problem at every restart.
    expect(lexiconTerms(reloaded).find((term) => term.id === 'max-drawdown')?.supersededFa).toEqual(
      [],
    );
    expect(allAlternatives(lexiconTerms(reloaded).find((t) => t.id === 'max-drawdown')!)).toContain(
      'بیشترین افت سرمایه',
    );

    // A pending candidate is *not* in a snapshot — it is not knowledge yet — which is the whole point
    // of the trust ladder surviving a round trip.
    expect(reloaded.pending('term.trading.backtest')).toBeUndefined();
  });

  it('keeps a rejected candidate out of the store rather than half-recording it', () => {
    const memory = seededLanguageMemory();
    const decision = reviewTermCandidate(candidate({ origin: 'agent-proposal' }), memory);
    expect(decision.outcome).toBe('pending');
    rejectTermCandidate('term.trading.backtest', memory, {
      origin: 'human-review',
      reference: 'rejected: not a term this product uses',
      at: AT,
      expectedVersion: 0,
    });
    const reloaded = LanguageMemory.from(JSON.parse(JSON.stringify(memory.snapshot())));
    expect(reloaded.get('term.trading.backtest')).toBeUndefined();
    expect(reloaded.list('terminology').length).toBe(TERMINOLOGY.length);
  });
});

describe('the lexicon stays out of the other stores', () => {
  it('is knowledge in the language store, not Agent Memory and not a credential', () => {
    const memory = seededLanguageMemory();
    for (const entry of memory.list('terminology')) {
      expect(entry.key.startsWith('term.')).toBe(true);
      expect(entry.key).not.toMatch(/^mem_/);
      for (const field of Object.keys(entry)) {
        expect(field).not.toMatch(/secret|token|credential|password/i);
      }
    }
    // And the six domains are the phase's, not a second taxonomy invented here.
    expect([...TERMINOLOGY_DOMAINS]).toEqual([
      'trading',
      'risk',
      'agent',
      'memory',
      'education',
      'ui',
    ]);
    const domains: TerminologyDomain[] = TERMINOLOGY.map((term) => term.domain);
    expect(domains.every((domain) => TERMINOLOGY_DOMAINS.includes(domain))).toBe(true);
  });
});
