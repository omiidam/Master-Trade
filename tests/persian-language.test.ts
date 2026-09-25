/**
 * Phase 7.5.1 — the Persian language foundation, as a contract.
 *
 * What this suite is for
 * ----------------------
 * Four claims, each of which is easy to *write* in a comment and hard to hold:
 *
 *   1. **The language memory is a store of its own.** Not "it lives in a different directory" — the
 *      suite asserts that nothing under `web/src/language/` can reach the Agent Memory, the
 *      credential surface or the backend, that a key reading as an Agent Memory id is refused, and
 *      that the entry schema has no field a secret could sit in.
 *   2. **Knowledge can only move through the controlled path.** A proposal is validated before it is
 *      looked at, its `baseVersion` has to match reality, and **agent output can never apply over
 *      trusted knowledge** — it is parked as pending, whatever status it claims, and only a review
 *      with a trusted origin can promote it.
 *   3. **The locale foundation agrees with CLDR rather than with somebody's memory.** Every separator,
 *      digit set and calendar claim in `fa.ts` is checked against `Intl`, so the constants cannot
 *      drift from the locale data underneath them.
 *   4. **English is untouched.** The interface's own formatters still produce exactly what they did,
 *      the Persian stack is keyed to `:lang(fa)` rather than to direction, and no remote font has
 *      appeared in a build that ships offline.
 *
 * The seeded knowledge is also checked *against the normalizer*: every orthography rule that states
 * a character mapping must be honoured by `normalizePersianText`, so the store's prose and the
 * code's behaviour are one fact stated twice instead of two facts that drift.
 *
 * Offline and deterministic: it reads the repository and the locale data, and it states the instant
 * it judges rather than depending on the clock or on the host's time zone.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ARABIC_INDIC_DIGITS,
  BIDI_CONTROLS,
  LANGUAGE_KEY_PATTERN,
  LANGUAGE_KIND_MEANING,
  LANGUAGE_KNOWLEDGE_KINDS,
  LANGUAGE_ORIGINS,
  LANGUAGE_SNAPSHOT_FORMAT,
  LANGUAGE_SNAPSHOT_FORMAT_VERSION,
  PERSIAN_DECIMAL_SEPARATOR,
  PERSIAN_DIGITS,
  PERSIAN_GROUP_SEPARATOR,
  PERSIAN_PERCENT_SIGN,
  PERSIAN_LOCALE,
  PERSIAN_PUNCTUATION,
  SEED_LANGUAGE_KNOWLEDGE,
  TRUSTED_LANGUAGE_ORIGINS,
  ZWNJ,
  LanguageMemory,
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
  isAgentMemoryId,
  isLanguageMemoryId,
  isTrustedOrigin,
  isolateBidi,
  languageMemoryId,
  latinRun,
  normalizePersianText,
  persianRun,
  seededLanguageMemory,
  stripZwnj,
  toLatinDigits,
  toPersianDigits,
  type LanguageProposal,
} from '../web/src/language/index.js';
import { formatRelative, formatTimestamp } from '../web/src/lib/format.js';

const read = (path: string): string => readFileSync(path, 'utf8');

const LANGUAGE_DIRECTORY = join('web', 'src', 'language');
const STYLESHEET = read(join('web', 'src', 'styles', 'global.css'));
/** The stylesheet without its comments: a token named in prose is not a declaration. */
const CSS = STYLESHEET.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every file in the language layer, as repository-relative POSIX paths. */
function languageSources(): string[] {
  return readdirSync(LANGUAGE_DIRECTORY)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => `${LANGUAGE_DIRECTORY}/${name}`.split('\\').join('/'));
}

/** Import specifiers in a source file. */
function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(
    (match) => match[1] ?? '',
  );
}

/** The code of the error a call throws, or `null` for "it threw nothing". */
function errorCode(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
}

/** A proposal with nothing decided by the caller that the store should be deciding. */
function proposal(overrides: Partial<LanguageProposal> = {}): LanguageProposal {
  return {
    key: 'journal.entry.price',
    kind: 'translation',
    value: '\u0642\u06CC\u0645\u062A \u0648\u0631\u0648\u062F',
    origin: 'human-review',
    reference: 'review: phase-7.5.1',
    recordedAt: '2026-09-25T09:00:00.000Z',
    baseVersion: 0,
    ...overrides,
  };
}

describe('the language memory is a store of its own', () => {
  it('cannot reach the Agent Memory, the credential surface or the backend', () => {
    const forbidden = [
      'src/memory',
      'src/desktop',
      'src/auth',
      'src/llm',
      'components/memory',
      '@shared/desktop/secrets',
      'credential',
    ];
    const escapes: string[] = [];
    for (const file of languageSources()) {
      for (const specifier of importSpecifiers(read(file))) {
        if (forbidden.some((pattern) => specifier.includes(pattern))) {
          escapes.push(`${file} -> ${specifier}`);
        }
      }
    }
    expect(escapes, 'the language layer reached a store it must not share').toEqual([]);
  });

  it('is data only: no React, and no JSX in the layer', () => {
    // A data consumer — the memory store, a copy catalogue, a build script — must be able to import
    // this without pulling a component tree in behind it.
    for (const file of languageSources()) {
      expect(read(file), `${file} imports React`).not.toMatch(/from 'react'/);
    }
    expect(readdirSync(LANGUAGE_DIRECTORY).filter((name) => name.endsWith('.tsx'))).toEqual([]);
  });

  it('addresses its entries in its own namespace, which an Agent Memory id cannot be', () => {
    expect(languageMemoryId('journal.entry.price')).toBe('lang:journal.entry.price');
    expect(isLanguageMemoryId('lang:journal.entry.price')).toBe(true);
    expect(isLanguageMemoryId('mem_1')).toBe(false);
    expect(isAgentMemoryId('mem_1')).toBe(true);
    expect(isAgentMemoryId('lang:journal.entry.price')).toBe(false);
  });

  it('refuses a key that reads as an Agent Memory id, at the door', () => {
    const memory = LanguageMemory.of([]);
    expect(errorCode(() => memory.propose(proposal({ key: 'mem_1' })))).toBe('POLICY_VIOLATION');
    expect(memory.list()).toEqual([]);
  });

  it('has no field a credential could sit in', () => {
    // The separation from Secrets is a shape, not a policy: an entry holds *product knowledge*, and
    // there is nowhere in it for a token to be stored even by accident.
    const memory = seededLanguageMemory();
    const record = memory.list()[0];
    expect(record).toBeDefined();
    const fields = Object.keys(record ?? {}).sort();
    expect(fields).toEqual([
      'confidence',
      'examples',
      'key',
      'kind',
      'locale',
      'mapping',
      'notes',
      'provenance',
      'status',
      'value',
      'version',
    ]);
    for (const field of fields) {
      expect(field, `${field} reads like a secret`).not.toMatch(
        /secret|token|credential|password|keypair/i,
      );
    }
    // `key` is a language key, not a credential key, and it says so by shape.
    expect(record?.key).toMatch(LANGUAGE_KEY_PATTERN);
  });
});

describe('knowledge only moves through the controlled path', () => {
  const reviewed = proposal();

  it('applies a reviewed proposal as version 1 and logs the decision', () => {
    const memory = LanguageMemory.of([]);
    const result = memory.propose(reviewed);
    expect(result.outcome).toBe('applied');
    expect(result.entry.status).toBe('trusted');
    expect(result.entry.version).toBe(1);
    expect(memory.trusted().map((entry) => entry.key)).toEqual([reviewed.key]);
    expect(memory.history().map((change) => change.action)).toEqual(['applied']);
    expect(memory.history()[0]?.fromVersion).toBe(0);
    expect(memory.history()[0]?.toVersion).toBe(1);
  });

  it('parks model output as pending, so it is recorded and is not yet knowledge', () => {
    const memory = LanguageMemory.of([]);
    const result = memory.propose(
      proposal({ origin: 'agent-proposal', reference: 'model: session-42' }),
    );
    expect(result.outcome).toBe('pending');
    expect(result.entry.status).toBe('proposed');
    expect(memory.get(reviewed.key)).toBeUndefined();
    expect(memory.trusted()).toEqual([]);
    expect(memory.pending(reviewed.key)?.value).toBe(reviewed.value);
    expect(memory.history().map((change) => change.action)).toEqual(['proposed']);
  });

  it('never lets model output overwrite trusted knowledge', () => {
    const memory = LanguageMemory.of([]);
    memory.propose(reviewed);
    const trusted = memory.get(reviewed.key);
    const result = memory.propose(
      proposal({
        value: '\u0642\u06CC\u0645\u062A \u067E\u0631\u062F\u0627\u062E\u062A',
        origin: 'agent-proposal',
        reference: 'model: session-42',
        baseVersion: 1,
      }),
    );

    // The shape of the guarantee: the proposal is kept, the knowledge is not touched.
    expect(result.outcome).toBe('pending');
    expect(memory.get(reviewed.key)).toEqual(trusted);
    expect(memory.get(reviewed.key)?.version).toBe(1);
    expect(memory.get(reviewed.key)?.status).toBe('trusted');
    expect(memory.get(reviewed.key)?.value).toBe(reviewed.value);
    expect(memory.pending(reviewed.key)?.status).toBe('proposed');
  });

  it('refuses a proposal written against knowledge that has moved', () => {
    const memory = LanguageMemory.of([]);
    memory.propose(reviewed);
    expect(errorCode(() => memory.propose(proposal({ baseVersion: 0 })))).toBe('CONFLICT');
    expect(errorCode(() => memory.propose(proposal({ key: 'never.seen', baseVersion: 3 })))).toBe(
      'CONFLICT',
    );
    // And nothing was written by the refusal.
    expect(memory.get(reviewed.key)?.version).toBe(1);
    expect(
      errorCode(() =>
        memory.review(reviewed.key, {
          decision: 'accept',
          origin: 'human-review',
          reference: 'review: phase-7.5.1',
          at: '2026-09-25T10:00:00.000Z',
          expectedVersion: 0,
        }),
      ),
    ).toBe('NOT_FOUND');
  });

  it('validates before it stores, and refuses an unknown field rather than dropping it', () => {
    const memory = LanguageMemory.of([]);
    expect(errorCode(() => memory.propose({ ...proposal(), sneaky: 'value' }))).toBe(
      'VALIDATION_FAILED',
    );
    expect(errorCode(() => memory.propose(proposal({ key: 'Not A Key' })))).toBe(
      'VALIDATION_FAILED',
    );
    expect(errorCode(() => memory.propose(proposal({ value: '' })))).toBe('VALIDATION_FAILED');
    expect(
      errorCode(() => memory.propose(proposal({ origin: 'the-model-said-so' as never }))),
    ).toBe('VALIDATION_FAILED');
    expect(memory.list()).toEqual([]);
  });

  it('promotes a pending proposal on review and archives what it replaced', () => {
    const memory = LanguageMemory.of([]);
    memory.propose(reviewed);
    memory.propose(
      proposal({
        value: '\u0642\u06CC\u0645\u062A \u067E\u0631\u062F\u0627\u062E\u062A',
        origin: 'agent-proposal',
        reference: 'model: session-42',
        baseVersion: 1,
      }),
    );
    const promoted = memory.review(reviewed.key, {
      decision: 'accept',
      origin: 'human-review',
      reference: 'review: phase-7.5.1',
      at: '2026-09-25T11:00:00.000Z',
      expectedVersion: 1,
    });

    expect(promoted?.version).toBe(2);
    expect(promoted?.status).toBe('trusted');
    // The reviewer is the provenance of what is now current — not the model that drafted it.
    expect(promoted?.provenance.origin).toBe('human-review');
    expect(memory.pending(reviewed.key)).toBeUndefined();
    // Nothing was edited in place: both versions are still here, in order.
    expect(memory.revisions(reviewed.key).map((entry) => entry.version)).toEqual([1, 2]);
    expect(memory.revisions(reviewed.key)[0]?.value).toBe(reviewed.value);
    expect(memory.history().map((change) => change.action)).toEqual([
      'applied',
      'proposed',
      'promoted',
    ]);
  });

  it('will not let a proposal be reviewed by the origin that proposed it', () => {
    const memory = LanguageMemory.of([]);
    memory.propose(proposal({ origin: 'agent-proposal', reference: 'model: session-42' }));
    expect(
      errorCode(() =>
        memory.review(reviewed.key, {
          decision: 'accept',
          origin: 'agent-proposal',
          reference: 'model: session-42',
          at: '2026-09-25T11:00:00.000Z',
          expectedVersion: 0,
        }),
      ),
    ).toBe('POLICY_VIOLATION');
    expect(memory.get(reviewed.key)).toBeUndefined();
  });

  it('drops a rejected proposal and leaves the knowledge alone', () => {
    const memory = LanguageMemory.of([]);
    memory.propose(reviewed);
    memory.propose(
      proposal({ value: 'x', origin: 'agent-proposal', reference: 'model: s', baseVersion: 1 }),
    );
    expect(
      memory.review(reviewed.key, {
        decision: 'reject',
        origin: 'human-review',
        reference: 'review: phase-7.5.1',
        at: '2026-09-25T11:00:00.000Z',
        expectedVersion: 1,
      }),
    ).toBeUndefined();
    expect(memory.pending(reviewed.key)).toBeUndefined();
    expect(memory.get(reviewed.key)?.value).toBe(reviewed.value);
    expect(memory.history().map((change) => change.action)).toContain('rejected');
  });

  it('retires an entry as a version, keeping it rather than deleting it', () => {
    const memory = LanguageMemory.of([]);
    memory.propose(reviewed);
    const retired = memory.deprecate(reviewed.key, {
      origin: 'human-review',
      reference: 'review: phase-7.5.1',
      at: '2026-09-25T12:00:00.000Z',
      expectedVersion: 1,
    });
    expect(retired.status).toBe('deprecated');
    expect(retired.version).toBe(2);
    expect(memory.get(reviewed.key)?.status).toBe('deprecated');
    expect(memory.trusted()).toEqual([]);
    expect(memory.revisions(reviewed.key).map((entry) => entry.status)).toEqual([
      'trusted',
      'deprecated',
    ]);
  });

  it('round-trips a snapshot, and refuses one it cannot understand', () => {
    const memory = seededLanguageMemory();
    const snapshot = memory.snapshot();
    expect(snapshot.format).toBe(LANGUAGE_SNAPSHOT_FORMAT);
    // A snapshot carries *current* knowledge, and one seeded proposal is deliberately not that: the
    // spelling rule that ships as a candidate is parked as `pending`, so the snapshot is one entry
    // short of the proposals on purpose rather than by omission.
    expect(snapshot.entries.length).toBe(SEED_LANGUAGE_KNOWLEDGE.length - 1);
    expect(memory.pending('spelling.compound.hich-kodam')).toBeDefined();
    // Deterministic order, so a stored snapshot is diffable.
    expect(snapshot.entries.map((entry) => entry.key)).toEqual(
      [...snapshot.entries.map((entry) => entry.key)].sort(),
    );

    const restored = LanguageMemory.from(JSON.parse(JSON.stringify(snapshot)));
    expect(restored.list()).toEqual(memory.list());
    expect(restored.history()).toEqual([]);

    expect(errorCode(() => LanguageMemory.from({ ...snapshot, format: 'something-else' }))).toBe(
      'VALIDATION_FAILED',
    );
    expect(errorCode(() => LanguageMemory.from({ ...snapshot, formatVersion: 99 }))).toBe(
      'VALIDATION_FAILED',
    );
    expect(
      errorCode(() => LanguageMemory.of([{ ...memory.list()[0], status: 'definitely-trusted' }])),
    ).toBe('VALIDATION_FAILED');
  });

  it('knows which origins may be trusted, and which never may', () => {
    expect(isTrustedOrigin('human-review')).toBe(true);
    expect(isTrustedOrigin('upstream-standard')).toBe(true);
    expect(isTrustedOrigin('agent-proposal')).toBe(false);
  });
});

describe('the seeded knowledge is authority-backed and small on purpose', () => {
  it('is trusted or deliberately pending, all cited, and only what this phase can source', () => {
    const memory = seededLanguageMemory();
    expect(memory.list().length).toBe(SEED_LANGUAGE_KNOWLEDGE.length - 1);
    expect(memory.trusted().length).toBe(memory.list().length);
    // Nothing seeded is lost: every proposal is either current knowledge or waiting on a review, which
    // is the ladder doing its job rather than a proposal that fell on the floor.
    for (const proposal of SEED_LANGUAGE_KNOWLEDGE) {
      expect(memory.get(proposal.key) ?? memory.pending(proposal.key), proposal.key).toBeDefined();
    }
    for (const entry of memory.list()) {
      expect(entry.provenance.reference.length).toBeGreaterThan(0);
      expect(entry.version).toBe(1);
      expect(['human-review', 'upstream-standard']).toContain(entry.provenance.origin);
    }
    // No UI copy: a Persian translation is a reviewed decision with its own phase, and this phase is
    // the layer those entries are written into rather than the phase that invents them. The
    // *terminology* the store holds arrived in Phase 7.5.2.2, as a lexicon with a reviewer's provenance
    // for every term; these assertions are about what this phase seeded, so they stay about the rules.
    expect(memory.list('translation')).toEqual([]);
    expect(memory.list('orthography').length).toBeGreaterThanOrEqual(6);
    expect(memory.list('rule').length).toBeGreaterThanOrEqual(6);
  });

  it('states every orthographic mapping the normalizer actually applies', () => {
    const memory = seededLanguageMemory();
    const rules = memory.list('orthography').filter((entry) => entry.mapping !== null);
    expect(rules.length).toBeGreaterThanOrEqual(5);
    for (const rule of rules) {
      const mapping = rule.mapping;
      if (mapping === null) continue;
      const expected = mapping.to ?? '';
      expect(
        normalizePersianText(mapping.from),
        `${rule.key} states a mapping the normalizer does not honour`,
      ).toBe(expected);
    }
  });
});

describe('the fa-IR locale foundation agrees with CLDR', () => {
  it('keeps the numbering system CLDR gives fa-IR, and the digits that come with it', () => {
    const options = new Intl.NumberFormat(PERSIAN_LOCALE).resolvedOptions();
    expect(options.numberingSystem).toBe('arabext');
    expect(options.locale).toBe(PERSIAN_LOCALE);
    const formatted = new Intl.NumberFormat(PERSIAN_LOCALE).format(1234567.89);
    // No Latin digit survives the locale's own formatting, and every Persian digit the number needs
    // is one of the ten this module names.
    expect(formatted).not.toMatch(/[0-9]/);
    for (const character of formatted) {
      if (/[\u06F0-\u06F9]/.test(character)) expect(PERSIAN_DIGITS).toContain(character);
    }
    expect(formatted).toBe(
      '\u06F1\u066C\u06F2\u06F3\u06F4\u066C\u06F5\u06F6\u06F7\u066B\u06F8\u06F9',
    );
  });

  it('agrees with CLDR about the separators and the percent sign, rather than assuming', () => {
    const parts = new Intl.NumberFormat(PERSIAN_LOCALE).formatToParts(1234.5);
    expect(parts.find((part) => part.type === 'decimal')?.value).toBe(PERSIAN_DECIMAL_SEPARATOR);
    expect(parts.find((part) => part.type === 'group')?.value).toBe(PERSIAN_GROUP_SEPARATOR);
    const percent = new Intl.NumberFormat(PERSIAN_LOCALE, {
      style: 'percent',
      maximumFractionDigits: 1,
    }).format(0.0245);
    expect(percent).toContain(PERSIAN_PERCENT_SIGN);
    expect(percent).toBe('\u06F2\u066B\u06F5\u066A');
  });

  it('keeps the digits out of Persian prose and puts them in when asked', () => {
    expect(formatFaNumber(1234567.89)).toBe(
      '\u06F1\u066C\u06F2\u06F3\u06F4\u066C\u06F5\u06F6\u06F7\u066B\u06F8\u06F9',
    );
    expect(formatFaNumber(1234567.89, { digits: 'latin' })).toBe('1,234,567.89');
    // The one combination a technical figure needs: Persian formatting, ASCII digits.
    expect(formatFaNumber(1234.5, { digits: 'latin' })).toBe('1,234.5');
  });

  it('renders money in the currency it is actually in', () => {
    expect(formatFaCurrency(1234567.5, 'IRR')).toContain(
      '\u06F1\u066C\u06F2\u06F3\u06F4\u066C\u06F5\u06F6\u06F7\u066B\u06F5',
    );
    expect(formatFaCurrency(1234.5, 'USD')).toContain(
      '\u06F1\u066C\u06F2\u06F3\u06F4\u066B\u06F5\u06F0',
    );
    // An unrecognised code is shown with its code rather than invented into a symbol.
    expect(formatFaCurrency(10, 'NOT-A-CODE')).toContain('NOT-A-CODE');
  });

  it('claims no symbol when there is no currency to claim', () => {
    // The regression this test exists for: `Intl.NumberFormat` does not throw for a *missing*
    // code, it prints the name of the missing value, so a format that guarded only against an
    // unrecognised code rendered `۱٬۲۵۰٬۰۰۰٫۵ undefined` — a figure claiming a symbol it had not
    // been given. A code that is not three letters is not a currency, so the figure stands alone.
    const calledWithoutACode = (formatFaCurrency as (value: number, currency?: string) => string)(
      1250000.5,
    );
    expect(calledWithoutACode).toBe(
      '\u06F1\u066C\u06F2\u06F5\u06F0\u066C\u06F0\u06F0\u06F0\u066B\u06F5',
    );
    expect(calledWithoutACode).not.toContain('undefined');
    expect(formatFaCurrency(1250000.5, '')).toBe(calledWithoutACode);
    // A malformed code is printed as itself rather than dropped, so the mistake stays visible.
    expect(formatFaCurrency(10, 'ir')).toContain('ir');
  });

  it('reads a percentage on Intl’s convention, and on the product’s, by two names', () => {
    // `0.0245` is a share of a whole; `2.45` is percent points. The rest of the product uses the
    // second, so the two conventions get two names instead of one ambiguous one.
    expect(formatFaPercentPoints(2.45)).toBe('\u06F2\u066B\u06F5\u066A');
    expect(formatFaPercentPoints(2.45, { maximumFractionDigits: 0 })).toBe('\u06F2\u066A');
  });

  it('uses the Persian calendar, made explicit rather than inherited', () => {
    expect(new Intl.DateTimeFormat(PERSIAN_LOCALE).resolvedOptions().calendar).toBe('persian');
    const instant = '2026-09-25T10:20:00.000Z';
    const zone = { timeZone: 'Asia/Tehran' };
    expect(formatFaDate(instant, zone)).toBe('\u06F1\u06F4\u06F0\u06F5/\u06F7/\u06F3');
    expect(formatFaDateTime(instant, zone)).toBe(
      '\u06F3 \u0645\u0647\u0631 \u06F1\u06F4\u06F0\u06F5\u060C \u06F1\u06F3:\u06F5\u06F0',
    );
    // The same instant with ASCII digits, for a readout that must not be in prose digits.
    expect(formatFaDate(instant, { ...zone, digits: 'latin' })).toBe('1405/7/3');
    // An unparseable value is shown as it was given, which is what the English formatter does too.
    expect(formatFaDate('not a date')).toBe('not a date');
  });

  it('takes relative wording and plural categories from CLDR', () => {
    const now = Date.parse('2026-09-25T12:00:00.000Z');
    expect(formatFaRelative('2026-09-25T09:00:00.000Z', now)).toBe(
      '\u06F3 \u0633\u0627\u0639\u062A \u067E\u06CC\u0634',
    );
    expect(formatFaRelative('2026-09-25T12:00:00.000Z', now)).toBe(
      '\u0627\u06A9\u0646\u0648\u0646',
    );
    // Persian has two categories, and a count of 1 is the one that is not `other`.
    expect(faPluralCategory(1)).toBe('one');
    expect(faPluralCategory(3)).toBe('other');
    expect(new Intl.PluralRules(PERSIAN_LOCALE).resolvedOptions().pluralCategories).toEqual([
      'one',
      'other',
    ]);
  });

  it('sorts Persian through CLDR’s own collation rather than a code-point compare', () => {
    const words = ['\u0628', '\u0622', '\u0627'];
    expect([...words].sort(comparePersian)).toEqual(
      [...words].sort(new Intl.Collator(PERSIAN_LOCALE).compare),
    );
    // A code-point sort would disagree with the locale, which is the whole reason to use one.
    expect(comparePersian('\u0628', '\u0622')).not.toBe(0);
  });
});

describe('the layer’s own vocabulary is closed and covered', () => {
  it('can store every kind it names, and explains each one', () => {
    // A kind the store could not hold would be a category with no home; the loop is what makes each
    // of the seven a tested path rather than a member of a list.
    const memory = LanguageMemory.of([]);
    for (const kind of LANGUAGE_KNOWLEDGE_KINDS) {
      expect(LANGUAGE_KIND_MEANING[kind].length, `${kind} is unexplained`).toBeGreaterThan(0);
      const result = memory.propose(proposal({ kind, key: `kind.${kind}` }));
      expect(result.outcome, `${kind} could not be stored`).toBe('applied');
      expect(result.entry.kind).toBe(kind);
    }
    expect(memory.list().map((entry) => entry.kind)).toEqual([...LANGUAGE_KNOWLEDGE_KINDS].sort());
  });

  it('states which origins may be trusted, as a list the store actually uses', () => {
    expect([...LANGUAGE_ORIGINS].sort()).toEqual(
      [...TRUSTED_LANGUAGE_ORIGINS, 'agent-proposal'].sort(),
    );
    for (const origin of LANGUAGE_ORIGINS) {
      expect(isTrustedOrigin(origin)).toBe(
        (TRUSTED_LANGUAGE_ORIGINS as readonly string[]).includes(origin),
      );
    }
  });

  it('records the punctuation as the code points the locale actually uses', () => {
    expect(PERSIAN_PUNCTUATION.percent).toBe(PERSIAN_PERCENT_SIGN);
    expect(Object.values(PERSIAN_PUNCTUATION)).toEqual(['\u060C', '\u061B', '\u061F', '\u066A']);
    expect(new Intl.NumberFormat(PERSIAN_LOCALE, { style: 'percent' }).format(0.5)).toContain(
      PERSIAN_PUNCTUATION.percent,
    );
  });

  it('formats a time and a share, and isolates a run in either direction', () => {
    expect(formatFaTime('2026-09-25T10:20:00.000Z', { timeZone: 'Asia/Tehran' })).toBe(
      '\u06F1\u06F3:\u06F5\u06F0',
    );
    expect(formatFaShare(0.0245)).toBe(formatFaPercentPoints(2.45));
    expect(isolateBidi('XAUUSD')).toBe(latinRun('XAUUSD'));
    expect(isolateBidi('XAUUSD', 'auto')).toBe(
      `${BIDI_CONTROLS.firstStrongIsolate}XAUUSD${BIDI_CONTROLS.popDirectionalIsolate}`,
    );
    // The format is written by the writer, not the reader: the version is stated, not inferred.
    expect(LANGUAGE_SNAPSHOT_FORMAT_VERSION).toBe(1);
  });
});

describe('normalization folds identity, and preserves meaning', () => {
  it('folds the Arabic letters and digits Persian does not write', () => {
    expect(normalizePersianText('\u064A\u0643')).toBe('\u06CC\u06A9');
    expect(normalizePersianText('\u0649')).toBe('\u06CC');
    expect(normalizePersianText(ARABIC_INDIC_DIGITS)).toBe(PERSIAN_DIGITS);
    expect(normalizePersianText('\u0645\u0640\u0627\u0646\u062F')).toBe('\u0645\u0627\u0646\u062F');
    expect(normalizePersianText('\u06A9\u0650\u062A\u0627\u0628')).toBe('\u06A9\u062A\u0627\u0628');
    expect(normalizePersianText('\u06A9\u0670\u062A')).toBe('\u06A9\u062A');
  });

  it('leaves the two combining hamzas alone, because removing them would change a letter', () => {
    // The recorded edge of `orthography.harakat-removed`: U+0653–U+0655 are letter material, not
    // vowel marks.
    for (const combining of ['\u0653', '\u0654', '\u0655']) {
      expect(normalizePersianText(`\u06CC${combining}`)).toBe(`\u06CC${combining}`);
    }
  });

  it('keeps the ZWNJ, and offers removal only where it is asked for by name', () => {
    const goes = '\u0645\u06CC\u200C\u0631\u0648\u062F';
    expect(hasZwnj(goes)).toBe(true);
    expect(normalizePersianText(goes)).toBe(goes);
    expect(stripZwnj(goes)).toBe('\u0645\u06CC\u0631\u0648\u062F');
    // The one ZWNJ edit the normalizer makes is at an edge or beside a space, where it joins
    // nothing. An interior one is left exactly where it was, and the space around it is kept.
    expect(normalizePersianText(`${ZWNJ}${goes}`)).toBe(goes);
    expect(normalizePersianText(`${goes}${ZWNJ}`)).toBe(goes);
    expect(normalizePersianText(`${goes} ${ZWNJ}`)).toBe(`${goes} `);
  });

  it('is idempotent, so normalizing a normalized string is a no-op', () => {
    const samples = [
      '\u064A\u0643\u200C\u0645\u0650',
      toPersianDigits('3345.20 XAUUSD'),
      'mixed \u0645\u06CC\u200C\u0631\u0648\u062F \u06F2\u06F0\u06F2\u06F6 with Latin',
      '',
    ];
    for (const sample of samples) {
      const once = normalizePersianText(sample);
      expect(normalizePersianText(once), `${sample} is not idempotent`).toBe(once);
    }
  });

  it('moves digits in both directions without touching anything else', () => {
    expect(toPersianDigits('3345.20')).toBe('\u06F3\u06F3\u06F4\u06F5.\u06F2\u06F0');
    expect(toLatinDigits('\u06F3\u06F3\u06F4\u06F5.20')).toBe('3345.20');
    expect(toLatinDigits(ARABIC_INDIC_DIGITS)).toBe('0123456789');
    expect(toLatinDigits('XAUUSD')).toBe('XAUUSD');
    expect(toPersianDigits('')).toBe('');
  });
});

describe('mixed Persian and English technical text', () => {
  it('isolates a technical run with Unicode’s controls, not with a mark', () => {
    expect(latinRun('XAUUSD')).toBe(
      `${BIDI_CONTROLS.leftToRightIsolate}XAUUSD${BIDI_CONTROLS.popDirectionalIsolate}`,
    );
    expect(persianRun('\u0645\u06CC\u200C\u0631\u0648\u062F')).toBe(
      `${BIDI_CONTROLS.rightToLeftIsolate}\u0645\u06CC\u200C\u0631\u0648\u062F${BIDI_CONTROLS.popDirectionalIsolate}`,
    );
    // The characters inside an isolate are untouched, which is the point: a signed figure keeps its
    // sign in the string it was handed.
    expect(latinRun('-1.00R').slice(1, -1)).toBe('-1.00R');
  });

  it('applies the Persian typeface by language, never by direction', () => {
    expect(CSS).toMatch(/:lang\(fa\)\s*\{[^}]*font-family: var\(--font-fa\)/);
    expect(CSS, 'the Persian face is keyed to direction').not.toMatch(
      /\[dir=['"]rtl['"]\][^{]*\{[^}]*font-family/,
    );
    expect(CSS).toMatch(/--font-fa:/);
    expect(CSS).toMatch(/@font-face\s*\{[^}]*font-family: 'Vazirmatn'/);
    expect(CSS).toMatch(/url\('\/fonts\/Vazirmatn-Variable\.woff2'\)/);
  });

  it('keeps the `.num` guard the RTL work installed', () => {
    // The figure rule from Phase 7.4 is unchanged: the sign stays where a reader of a trading
    // terminal expects it, whatever the paragraph around it is doing.
    expect(CSS).toMatch(/\.num\s*\{[^}]*direction: ltr/);
    expect(CSS).toMatch(/\.num\s*\{[^}]*unicode-bidi: isolate/);
  });
});

describe('English behaviour is untouched', () => {
  it('leaves the English formatters producing exactly what they produced', () => {
    // Locale-independent ones, so this is a fact about the code rather than about the host.
    expect(formatTimestamp('2026-09-19T10:20:30.000Z')).toBe('2026-09-19 10:20');
    expect(formatRelative('2026-09-25T09:00:00.000Z', Date.parse('2026-09-25T12:00:00.000Z'))).toBe(
      '3h ago',
    );
    // Under a minute reads as "just now", which is the branch a Persian sibling would have to
    // replace rather than reuse — the point being that nothing here changed it.
    expect(formatRelative('2026-09-25T09:00:00.000Z', Date.parse('2026-09-25T09:00:20.000Z'))).toBe(
      'just now',
    );
  });

  it('leaves the product’s own number formatters alone', () => {
    // Read rather than imported: `labels.ts` is a component module, and the root typecheck does not
    // take `web/src/components` into its program. The claim is about what these functions still are.
    const labels = read([join('web', 'src', 'components', 'portfolio', 'labels.ts')].join('/'));
    expect(labels).toMatch(
      /export function formatMoney\(value: number \| null, currency: string\)/,
    );
    expect(labels).toMatch(/export function formatPercent\(value: number \| null, digits = 1\)/);
    expect(labels).toMatch(/export function formatNumber\(value: number \| null, digits = 2\)/);
    // `Intl.NumberFormat(undefined, …)` is the *reader's* locale, which is what every existing screen
    // renders. The Persian layer does not reach in here, and these functions know nothing of fa-IR.
    expect(labels).toMatch(/new Intl\.NumberFormat\(undefined, \{/);
    expect(labels).not.toMatch(/fa-IR|PERSIAN_PERCENT_SIGN|\u066A/);
  });

  it('leaves the interface font stack and the document language as they were', () => {
    expect(CSS).toMatch(
      /--font-sans:\s*'Inter', 'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, 'Noto Sans', sans-serif/,
    );
    expect(CSS).toMatch(/--font-mono:/);
    expect(read(join('web', 'index.html'))).toMatch(/<html lang="en" dir="ltr"/);
  });

  it('translates nothing yet: the Persian face reaches no English element', () => {
    // The rule is `:lang(fa)`, and nothing in the interface sets it, so the face is declared and
    // unspent — which is why it costs the existing product nothing.
    const sources = readdirSync(join('web', 'src'), { recursive: true }).map((entry) =>
      String(entry).split('\\').join('/'),
    );
    const persianLiterals = sources.filter(
      (name) =>
        (name.endsWith('.ts') || name.endsWith('.tsx')) &&
        /[\u0600-\u06FF]/.test(read(join('web', 'src', name))),
    );
    // The language layer itself carries Persian sample data and rules; nothing else does.
    expect(persianLiterals.filter((name) => !name.startsWith('language/'))).toEqual([]);
  });
});

describe('the Persian font is a shipped, auditable file', () => {
  const record = JSON.parse(read(join('web', 'public', 'fonts', 'vazirmatn.json'))) as {
    family: string;
    version: string;
    license: string;
    licenseFile: string;
    upstream: string;
    files: { name: string; bytes: number; sha256: string }[];
  };

  it('is exactly the file the recorded provenance describes', () => {
    expect(record.family).toBe('Vazirmatn');
    expect(record.license).toBe('OFL-1.1');
    expect(record.files.length).toBeGreaterThan(0);
    for (const file of record.files) {
      const path = join('web', 'public', 'fonts', file.name);
      expect(statSync(path).size).toBe(file.bytes);
      expect(
        createHash('sha256').update(readFileSync(path)).digest('hex'),
        `${file.name} is not the file the provenance records`,
      ).toBe(file.sha256);
    }
  });

  it('records the version that is actually declared and installed', () => {
    const manifest = JSON.parse(read('package.json')) as {
      devDependencies?: Record<string, string>;
    };
    const lock = JSON.parse(read('package-lock.json')) as {
      packages?: Record<string, { version?: string } | undefined>;
    };
    expect(manifest.devDependencies?.vazirmatn).toContain(record.version);
    expect(lock.packages?.['node_modules/vazirmatn']?.version).toBe(record.version);
  });

  it('carries its licence, and never a remote origin', () => {
    expect(read(join('web', 'public', 'fonts', record.licenseFile))).toContain(
      'SIL OPEN FONT LICENSE',
    );
    expect(record.upstream).toContain('github.com/rastikerdar/vazirmatn');
    const tauri = read(join('src-tauri', 'tauri.conf.json'));
    expect(tauri).toContain("font-src 'self'");
    expect(tauri).not.toContain('fonts.gstatic.com');
    expect(tauri).not.toContain('fonts.googleapis.com');
    // A vendored file cannot be fetched from anywhere: the CSP is the whole allow-list.
    for (const file of record.files) {
      expect(read(join('web', 'src', 'styles', 'global.css'))).not.toMatch(
        new RegExp(`url\\('https?://[^']*${file.name}`),
      );
    }
  });
});
