# Persian terminology

Phase 7.5.2.2. The lexicon the product writes terms from, the store those decisions live in, and the
controlled way a term is added or corrected. The contract suite is `tests/persian-terminology.test.ts`;
the layer's own record is §20 of `docs/frontend-foundation.md`.

## Where the knowledge lives

Three pieces, and the boundaries between them are the design:

| Piece                                                                | What it holds                                                                                                                                | Why there                                                                                                                                                                            |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `web/src/language/terminology.ts` — **the catalogue**                | the English equivalent, the domain, the alternatives this product does not write, the usage sentence, the confidence                         | a knowledge _entry_ is `{ key, kind, value, status, confidence, version, provenance, examples, mapping, notes }`; there is nowhere honest in that shape for a list of rejected forms |
| the **language store** (Phase 7.5.1)                                 | one trusted `terminology` entry per term, whose `value` **is** the preferred form, with a version, a provenance and every version it has had | trust, versioning and review already exist there, and a second glossary with its own storage would be the duplicate terminology system this phase forbids                            |
| **the lexicon view** (`lexiconTerms`, `preferredTerm`, `lookupTerm`) | the joined answer, with the store winning                                                                                                    | so a caller never reads the catalogue directly and never needs to know which of the two decided                                                                                      |

`seed.ts` composes the full store from the catalogue — the terms are _derived_, not written a second
time — so the two cannot drift, and the entry a reviewer opens carries the same preferred form the
lexicon returns.

## How a preferred form is chosen

1. **What practitioners already write.** `کارمزد`, `اهرم`, `حد ضرر`, `بهای تمام‌شده`, `تخصیص`,
   `تمرکز`, `آزمون`, `حافظه` are not this project's inventions; they are the words an Iranian trader,
   accountant or teacher uses.
2. **Elsewhere the Persian that is unambiguous rather than the loanword.** `پوزیشن`, `تایم‌فریم`,
   `پرتفوی` and `آکادمی` are the forms the community actually types, and a purist alternative nobody
   says is a translation nobody reads. Where the Persian word is what people say — `حد ضرر`,
   `دفتر معاملات` — the Persian word wins.
3. **One form, one concept.** No two concepts share a preferred form, and a form the product rejects is
   never also a preferred form elsewhere; the catalogue test that asserts this is why
   `terminologyFindings` can name a fix rather than a hypothesis.
4. **The form has to survive the product's own keyboard.** Every term is already canonical Persian (no
   Arabic yeh, no Arabic kaf, no stray ZWNJ), asserted by running Phase 7.5.2.1's normalizer over all
   57 preferred forms and all 85 alternatives. A term the product would rewrite is two terms.
5. **Record the confidence, honestly.** `کارمزد` is 0.95 and `فضای کار هوش مصنوعی` is 0.75. The number
   is not decoration: it is what a reviewer sorts by when they disagree, and it is stored in the entry.

## The contested decisions

The rest of the catalogue is listed by `TERMINOLOGY`; these are the ones where a choice had to be made
and the alternative was real.

| Concept          | Preferred             | Rejected here                    | Why                                                                                                                                                                                    |
| ---------------- | --------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Risk             | `ریسک`                | `خطر`                            | `خطر` is danger in general. This product's risk is a number a trade is allowed to lose, and a warning that "danger is 2%" is a different sentence.                                     |
| Exposure         | `مواجهه`              | `اکسپوژر`, `در معرض بودن`        | The loanword is common in brokerage chat and unreadable in a sentence about a portfolio; `در معرض بودن` is a phrase, not a term. 0.75, because the alternatives are genuinely used.    |
| R multiple       | `چندبرابر R`          | `نسبت R`, `R مولتیپل`            | `R` stays a symbol and is never translated inside a figure — `−1.00R` is a technical string, and `.num` is what keeps it left-to-right. The Persian says the relation, not the letter. |
| Agent            | `دستیار هوشمند`       | `ایجنت`, `عامل هوشمند`           | The English word is itself contested, so the Persian describes the role rather than transliterating a moving target. 0.8.                                                              |
| AI Workspace     | `فضای کار هوش مصنوعی` | `کارگاه هوش مصنوعی`, `ورک‌اسپیس` | A page, not a tool; the descriptive form is what a user looking for "where do I ask about my journal?" can scan for.                                                                   |
| Journal          | `دفتر معاملات`        | `ژورنال`, `دفترچه معاملات`       | What it is, not what it is called in English. `ژورنال` remains understandable and is the _first_ thing `terminologyFindings` reports — see below.                                      |
| Instrument       | `نماد`                | `سیمبل`, `نماد معاملاتی`         | The Iranian market's own word for a ticker.                                                                                                                                            |
| System (sidebar) | `سامانه`              | `سیستم`                          | The register of the rest of the shell; 0.8.                                                                                                                                            |

## A context where the other wording is right

The phase asks for controlled alternatives "where context genuinely requires a different wording", and
the mechanism is the store's `exception` kind rather than a second list. A form a reviewer has named in
a trusted exception entry is _approved_: `terminologyFindings` stops reporting it, `lookupTerm` still
returns it as an alternative, and `preferredTerm` still returns the preferred form. So `ژورنال` can be
correct in a heading with no room for `دفتر معاملات`, because a person said so, in the store, with a
provenance — and no code was changed to allow it.

## How a term arrives, changes, or is refused

**Candidate → validation → source and reason → accepted or rejected → versioned knowledge.** The
machinery is `terminologyUpdates.ts`, and every step is a check a person would make:

| Check                                                                         | Refusal                                                               |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| The candidate's shape (concept slug, domain, ISO date, a non-empty reference) | "the candidate is not usable: …"                                      |
| A preferred form carries Persian letters                                      | "`Backtest` carries no Persian letter"                                |
| It is already canonical                                                       | "`بكتست` is not in canonical form", with the canonical form named     |
| No alternative equals the preferred form, or another term's preferred form    | "`پوزیشن` is already the preferred form of `position`"                |
| The preferred form is not a form the product rejects elsewhere                | "`ترید` is a form this product explicitly does not write for `trade`" |
| **A correction names what it replaces**                                       | "add `بیشترین افت سرمایه` to the alternatives"                        |
| The version it believes it is replacing is still current                      | "`term.risk.max-drawdown` has moved"                                  |

Then the store does what it already does: `human-review` and `upstream-standard` are applied and
trusted, `agent-proposal` is parked as `pending` and can never replace trusted terminology, and a
review is what promotes it — with the reviewer's provenance, not the model's. A rejection is a _value_
(`{ outcome: 'rejected', reason }`), because "this word is not acceptable, and here is why" is an
ordinary answer rather than an exception, and a caller that has to catch an exception to learn it is a
caller that will forget to.

### What survives a restart

A snapshot carries current entries; it does not carry the change log. So after a reload the store
remembers _what a term is_, and it remembers the form a correction replaced **only because the
validation above refuses a correction that does not write that form into its alternatives**. The
distinction between "this product used to write `X`" and "it never wrote `X`" is lost across a reload,
and the fact is not. `tests/persian-terminology.test.ts` asserts both halves rather than leaving it to be
discovered; carrying the log in the snapshot is the named trigger for changing that, and the phase that
needs durable history is the phase that should do it.

## Deferred, explicitly

- **Translating the interface** — the `translation` kind is still empty and is the next phase's work.
  This one names the vocabulary a translation will be written in; it does not write the copy.
- **A Persian-speaking domain reviewer.** Every term here is `human-review` provenance pointing at this
  document, which means _this project_ made the decision. Confidence is recorded per term for exactly
  that review, and the triggers are named: a term whose confidence is below 0.8, or a term a user
  disputes.
- **A lexicon review surface.** The check, the lookup and the decision objects are all data; the UI that
  shows them belongs with the review surfaces, not here.
- **Multi-word and compound terms beyond the catalogue's** — a term whose Persian form is a phrase
  (`بهای تمام‌شده`, `دفتر معاملات`) is stored and reported today, and inflection (a term inside a
  possessive or a plural) is not handled: that needs morphology, and morphology needs the word-level
  schema extension Phase 7.5.2.1 already named.

## Verification

```bash
npx vitest run tests/persian-terminology.test.ts   # 28 tests: the lexicon, lookup, updates, reload
npm run validate                                   # the full gate
```

What the suite proves, in its own order: the store and the catalogue agree in both directions; every
term is canonical Persian; every page and group of the shell has a preferred form; no two concepts share
a form; lookup answers by English, by preferred form (whatever keyboard wrote it) and by alternative,
and never guesses; findings name the definition, the preferred form and the position; a technical span
is skipped; an approved context is honoured; a reviewed candidate is accepted and appears in both
stores; nine kinds of bad candidate are refused with the sentence that explains it; model output is
parked, rejected, and shown to leave trusted terminology untouched; a correction is version 2, keeps
version 1, and makes the old form reported; a stale correction is refused; and a snapshot round trip
preserves the term, the correction and the rejection.
