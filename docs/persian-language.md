# Persian language foundation

Phase 7.5.1. The goal was **not** translation. It was to make Persian a language the product can
_own_ — knowledge with provenance, a locale layer that agrees with Unicode and CLDR, and a typeface
that is a shipped file rather than a network request — so that translating the interface (7.5.2) is a
content exercise rather than a foundation-laying one.

Three artefacts, and the boundary between them is the whole design:

| Where                        | What it is                                                                              | What it knows about        |
| ---------------------------- | --------------------------------------------------------------------------------------- | -------------------------- |
| `web/src/language/model.ts`  | the shape of language knowledge: kinds, statuses, provenance, versions, schemas         | nothing but its own schema |
| `web/src/language/memory.ts` | the store and its controlled update path                                                | the model                  |
| `web/src/language/fa.ts`     | the fa-IR locale foundation: normalization, digits, separators, bidi, `Intl` formatters | nothing — it is stateless  |
| `web/src/language/seed.ts`   | the knowledge this phase ships, and why it is only what it is                           | the model and the store    |
| `web/public/fonts/`          | Vazirmatn, vendored, with its licence and its hashes                                    | nothing                    |

## Task 1 — the language knowledge model

### What an entry holds

| Field                          | Why it exists                                                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`                          | where the knowledge applies, dotted and stable (`journal.entry.price`). A correction adds a version to the same key; it never renames anything.                   |
| `kind`                         | `rule`, `terminology`, `translation`, `wording`, `orthography`, `exception`, `example` — the seven categories the phase asks for, each with a different reviewer. |
| `locale`                       | `fa-IR` today. A union because a second locale is the obvious addition.                                                                                           |
| `value`                        | the knowledge: the rule, the term, the translation.                                                                                                               |
| `status`                       | `proposed`, `validated`, `trusted`, `deprecated`. **Only `trusted` knowledge may be rendered as interface copy.**                                                 |
| `confidence`                   | how sure the _source_ was. Kept separately from status because a reviewed rule its reviewer was unsure about should read as exactly that.                         |
| `version`                      | a monotonic counter per key. Version 1 is what a first proposal produces; there is no unversioned state.                                                          |
| `provenance`                   | `{ origin, reference, recordedAt }`. `reference` is mandatory: a rule that cannot say where it came from is a rule the next person has to re-derive.              |
| `examples`, `mapping`, `notes` | the evidence. `mapping` is the one that is _checked_: the normalizer in `fa.ts` is asserted against every orthographic mapping in the store.                      |

The schema is `strictObject`, so a field a _future_ version writes is refused rather than silently
dropped — losing knowledge on a round trip through an older build is worse than failing to load.

### The controlled update path

```
propose → validate → version → (review) → persist
```

1. **`propose`** validates the proposal against the schema _before_ anything else happens, then checks
   the `baseVersion` it claims against what the store actually holds. A proposal written against
   version 2 cannot silently replace version 4 — it fails with `CONFLICT`.
2. **The status is decided by the origin, not by the caller.** `human-review` and
   `upstream-standard` may be trusted; `agent-proposal` may not, ever. Agent output is recorded as
   `pending` — addressable, reviewable, and explicitly _not_ current knowledge.
3. **`review`** is the only path by which model output becomes interface copy, and it requires a
   trusted origin, so an agent cannot review its own proposal. Accepting promotes the pending revision,
   bumps the version and archives what it replaced; rejecting drops it. Either way the log records the
   decision, with the reviewer's own provenance as the provenance of what is now current.
4. **`deprecate`** retires an entry as a new version rather than deleting it, because a screen that
   shipped with that wording must remain explainable.
5. **`snapshot` / `from`** is the persistence seam. The store is in memory — exactly as
   `src/memory/store.ts` was in Phase 1 — and the snapshot is what a durable store will one day write
   and read. Both directions validate, and a snapshot written by a format this build does not know is
   refused rather than half-loaded.

Nothing is edited in place: `revisions(key)` returns the superseded versions, the current one and any
pending proposal, in order, and `history()` is an append-only log of
`{ at, key, action, fromVersion, toVersion, origin, reference }`.

### Separate from Agent Memory and Secrets

This is a **shape**, not a policy, and the suite asserts each half of it:

- **Not Agent Memory.** Agent Memory (`src/memory/store.ts`) mints `mem_*` ids and holds _statements
  about the world_ that are expected to change; the language memory addresses entries as `lang:<key>`
  and holds _decisions about how the product speaks_ that a person reviews. `web/src/language/` cannot
  reach `src/` at all — the frontend/backend boundary (`config/sharedSurface.ts`) makes it
  unresolvable — and a key that reads as an Agent Memory id is refused at the door.
- **Not Secrets.** A language entry has no field a credential could sit in: the suite pins the exact
  field list and fails if any of them ever matches `/secret|token|credential|password/`. A credential
  surface already exists (`@shared/desktop/secrets`, `src/desktop/secure-store.ts`) and this layer
  neither imports it nor has anywhere to put it.

### What is deliberately _not_ seeded

There is no Persian glossary and no Persian UI copy in `seed.ts`. A trading glossary is a translation
decision with a named reviewer, and inventing one would be precisely the failure the store exists to
prevent: knowledge whose provenance is a guess, wearing a `trusted` badge. What _is_ seeded is the
orthographic knowledge whose authority is external to this project, plus two decisions this phase made
and recorded (`rule.technical-figures-stay-latin`, `rule.persian-punctuation`) with `human-review`
provenance pointing at this document.

## Task 2 — the fa-IR locale foundation

### Covered, and against which authority

| Concern                  | How it is answered                                                                                     | Authority                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Arabic → Persian letters | `normalizePersianText` folds U+064A/U+0649 → U+06CC and U+0643 → U+06A9                                | Unicode, Arabic block (U+0600 chart)                                      |
| Persian digits           | `toPersianDigits` / `toLatinDigits` over U+06F0–U+06F9, U+0660–U+0669 and ASCII                        | Unicode, Extended Arabic-Indic digits                                     |
| Decimal & thousands      | `PERSIAN_DECIMAL_SEPARATOR` U+066B, `PERSIAN_GROUP_SEPARATOR` U+066C                                   | CLDR via `Intl.NumberFormat('fa-IR')`, asserted                           |
| Percent sign             | `PERSIAN_PERCENT_SIGN` U+066A                                                                          | CLDR, asserted                                                            |
| Punctuation              | `PERSIAN_PUNCTUATION`: U+060C, U+061B, U+061F                                                          | Unicode code points; _where_ to apply them is a recorded product decision |
| Dates & times            | `formatFaDate` / `formatFaDateTime` / `formatFaTime`, Persian calendar made explicit (`-u-ca-persian`) | CLDR                                                                      |
| Relative time            | `formatFaRelative` via `Intl.RelativeTimeFormat('fa-IR')`                                              | CLDR                                                                      |
| Currency                 | `formatFaCurrency`, currency required, narrow symbol                                                   | CLDR                                                                      |
| Plurals                  | `faPluralCategory` via `Intl.PluralRules('fa-IR')` (`one`, `other`)                                    | CLDR                                                                      |
| Sorting                  | `comparePersian` via `Intl.Collator('fa-IR')`                                                          | CLDR                                                                      |
| Mixed Persian + Latin    | `latinRun` / `persianRun` / `isolateBidi` using U+2066/U+2067/U+2068 and U+2069                        | Unicode UAX #9 isolates                                                   |
| ZWNJ                     | preserved by default; `stripZwnj` for search keys, named so it cannot be reached for by accident       | Unicode format controls                                                   |

Digit _shapes_ are a per-call choice rather than a global one: `{ digits: 'latin' }` renders
`fa-IR-u-nu-latn`, which keeps CLDR's grouping and separators with ASCII digits — the one combination a
technical figure needs and a string rewrite cannot produce.

### The one judgement call, stated with its edges

`normalizePersianText` removes the Arabic vowel marks **U+064B–U+0652** and the superscript alef
**U+0670**. It deliberately does **not** remove U+0653–U+0655, the _combining_ hamza and madda: a
decomposed Persian letter can legitimately be built from them, so dropping them would change a letter
rather than a vowel mark. This is the only rule in the file that is the product's rather than
Unicode's, which is why it is an entry with `human-review` provenance that names its range and its
edge, and why the suite asserts the three combining marks survive.

Two things were considered and **left out**, rather than half-done:

- **Arabic teh marbuta U+0629 → heh.** Common in practice, but it is a word-level decision in some
  words and a letter-level one in others; it belongs in the store as a reviewed rule with examples,
  not in a normalizer as a letter table.
- **ZWNJ _placement_.** Writing `میرود` correctly is word-level Persian typography. This phase keeps
  the ZWNJ exactly as it found it (only an edge or space-adjacent one is dropped, where it joins
  nothing) and does not invent placement rules.

### The technical-figure rule

Persian prose uses Persian digits and the Persian face. A technical figure — a price, a timestamp, an R
multiple, an instrument symbol — keeps Latin digits, the monospaced face, and the left-to-right run
`.num` already gives it. This is recorded as `rule.technical-figures-stay-latin`, and it is the reason
Phase 7.4's `.num` guard finally has something to do: the browser suite now measures a signed figure
inside a right-to-left paragraph and asserts the sign is painted _before_ the digits.

## Task 3 — resources

### Selected: Vazirmatn (OFL-1.1)

- **Why.** It is drawn _for_ Persian: correct Persian letterforms (the Farsi yeh and keheh, not their
  Arabic counterparts), a taller x-height, and a Persian digit set. `Inter` has no Arabic script at
  all, so a stack that fell back to it would win every Latin character in mixed text and lose every
  Persian one.
- **How.** Vendored from the declared `vazirmatn@33.0.3` devDependency by `scripts/vendor-fonts.mjs`,
  which copies the **variable** face — one 108.5 KB woff2 covering weights 100–900 instead of nine
  static files — plus `OFL.txt`, and records version, upstream, licence, byte count and SHA-256 in
  `web/public/fonts/vazirmatn.json`. `tests/persian-language.test.ts` re-hashes the shipped file
  against that record, so a font that silently changed fails the suite.
- **Loader.** One `@font-face` and one rule: `:lang(fa) { font-family: var(--font-fa) }`. Keyed to
  **language, never to `[dir='rtl']`** — direction decides flow, language decides typeface — and since
  nothing in the interface sets `lang="fa"` yet, the face costs the running product nothing. The
  browser suite measures that: zero requests for the font before a Persian element exists, and a real
  fetch the moment one does.
- **Licence.** OFL-1.1 permits redistribution and embedding; the licence text ships beside the font at
  `web/public/fonts/Vazirmatn-OFL.txt`, which is what the licence requires.
- **Maintenance.** 33.x is a current release of a font that has been maintained since 2015 by Saber
  Rastikerdar. Re-vendoring is one command (`npm run fonts:vendor`) after a dependency bump;
  `npm run fonts:check` re-derives the record without writing.
- **CSP.** Already satisfied: `src-tauri/tauri.conf.json` sets `font-src 'self' data:`, so a shipped
  file is the only kind of font this product can load. No CDN, no Google Fonts, no runtime fetch of a
  third-party origin.

### Evaluated and not adopted: `@persian-tools/persian-tools` (MIT, v4.0.4)

27+ utilities, TypeScript, ESM and browser builds, ~1 MB unpacked, one runtime dependency
(`fastest-levenshtein`, for the fuzzy word parsing). The evaluation was per-concern rather than
per-library:

| Its utility                                                                          | Overlaps what?                                       | Decision                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `digitsEnToFa`, `digitsArToFa`, `digitsFaToEn`                                       | `toPersianDigits` / `toLatinDigits` (~15 lines here) | not needed — ours is smaller and is asserted against the Unicode digit sets                                                                                                                                                                                                    |
| `removeCommas`, comma formatting, ordinals                                           | `Intl.NumberFormat('fa-IR')`                         | not needed — CLDR already answers grouping and separators                                                                                                                                                                                                                      |
| `numberToWords`, `wordsToNumber`                                                     | nothing here                                         | **real value, no current caller** — the trigger is a surface that must read a figure aloud or spell it in words                                                                                                                                                                |
| `fixHalfSpace` (ZWNJ placement)                                                      | nothing here, deliberately                           | **real value, rejected on provenance** — it would make a third party's unpublished placement rules our Persian orthography. When a phase needs word-level typography it belongs in the store as a `human-review` entry with its own reference, not as a silent normalizer step |
| `isPersian`, `hasPersian`, slugify, URL fixing                                       | nothing here                                         | no current caller                                                                                                                                                                                                                                                              |
| national ID, legal ID, phone, bank card, IBAN/Sheba, bill calculator, vehicle plates | nothing here                                         | **out of scope, and mostly backend** — validating a national ID is a server concern with its own privacy story, not a frontend formatting one                                                                                                                                  |

**Conclusion: evaluated, not adopted in this phase.** Everything the language layer needs _today_ is
either CLDR (`Intl`), Unicode code points, or a handful of mapping lines that the knowledge store can
cite. Adding a ~1 MB dependency for functions with no caller would be the opposite of the rule this
phase was given — and the two functions that would genuinely add value (word forms, half-space) are
word-level Persian typography, which is 7.5.2 work with a named reviewer. The evaluation is recorded
here so the decision is repeatable rather than remembered, and the trigger for each is written down in
the table above.

### Rejected for the frontend: DadmaTools

DadmaTools is a **Python** NLP library (`pip install dadmatools[full]`, spaCy/Transformers/PyTorch) for
Persian NER, POS tagging, dependency and constituency parsing, lemmatizing, spellchecking, informal-to-
formal rewriting and sentiment analysis. It is a good project and it is licensed for commercial use —
and it is **not a frontend dependency**, at any size, for any reason: it is a model pipeline in another
language runtime.

Its one overlapping capability is its `Normalizer`, and the overlap is smaller than it looks: it
cleans a _document_ — HTML, URLs, e-mail addresses, emoji, extra whitespace, stop words — and unifies
characters for a corpus. The interface layer needs the opposite: a tiny, cited, character-level fold
that never touches text a reader is looking at.

**Where it would be justified:** a real backend/offline NLP need — spellchecking what a user typed into
the journal, parsing an informal Persian note into a structured entry, or sentiment over Persian
notes. None of those exist, none is in scope, and none should be added because the repository was
mentioned in a phase brief. Recorded as deferred with that trigger.

## Deferred, explicitly

- **Translating the interface** — 7.5.2. No product copy exists in Persian, and no component reads the
  language store yet.
- **A deep RTL redesign** — the `.num` rule, the `dir` toggle and the `:lang(fa)` hook are in place; the
  layout work is not done and is not in this phase.
- **A durable store** for the language memory — the snapshot is the seam; no database table exists.
- **Display time zone.** `formatFaDate` and friends take a `timeZone` and leave it to the host by
  default (which on a machine configured for Iran resolves to `Asia/Tehran`). Which zone a _trading_
  date should be shown in is a product decision, not a locale one, and it is not made here.
- **Terminology and translation entries** — the store is empty of them by design; see above.
- **The Persian half of the security gate.** Phase 7's stage 11 attacks the presentation layer; a
  stage 12 for the language boundary (an agent proposal reaching interface copy, a snapshot smuggling
  an untrusted entry) is a natural next step and is _not_ part of this phase.

## What verification found

Running the locale layer on real values rather than only on asserted ones turned up a defect that the
suite had been written around rather than against. `formatFaCurrency` guarded an _unrecognised_ code by
falling back to `«figure» «code»`, but `Intl.NumberFormat` does not throw for a _missing_ one: asked for
`currency: undefined` it renders the name of the missing value, so a call without a code printed
`۱٬۲۵۰٬۰۰۰٫۵ undefined` — a figure claiming a symbol it had not been given, which is precisely the
failure the fallback exists to prevent. The formatter now checks the code's shape first (ISO 4217 is
three ASCII letters); a code that is not a currency claims no symbol, the figure stands alone, and a
malformed code is still shown as itself so the mistake stays visible. Regression test:
`claims no symbol when there is no currency to claim`.

The English path is untouched by this: `labels.ts#formatMoney` is a different function with a different
caller contract, and its behaviour is asserted unchanged by the same suite.

## Verification

The contract suite is `tests/persian-language.test.ts` — 46 tests over the store's separation and its
update path, the locale's agreement with CLDR, normalization idempotence, bidi isolation, the sealed
font, and the English formatters producing exactly what they produced.

The browser suite's `the Persian language foundation, in a browser` section adds two measurements it
could not make in source: **zero** requests for the Persian face before a Persian element exists and a
real, glyph-covering fetch the moment one does; and a signed figure painted sign-first inside a
right-to-left paragraph, which is the `.num` isolation rule doing its job with Persian actually on the
page.

```bash
npm run fonts:vendor      # re-derive web/public/fonts from the declared dependency
npm run fonts:check       # re-hash what is vendored, write nothing
npx vitest run tests/persian-language.test.ts   # this phase's contract suite
npm run test:e2e          # the browser suite, including both measurements above
npm run validate          # the full gate
```
