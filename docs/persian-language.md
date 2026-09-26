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
- **ZWNJ _placement_.** Writing `میرود` correctly is word-level Persian typography. Phase 7.5.1 keeps
  the ZWNJ exactly as it found it (only an edge or space-adjacent one is dropped, where it joins
  nothing) and does not invent placement rules. Phase 7.5.2.1 automates the same _hygiene_ half and
  **reports** the placement half — see below — rather than guessing.

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

## Phase 7.5.2.1 — the correction pipeline

Phase 7.5.1 answered _"are these two strings the same string?"_ — `normalizePersianText`, an identity
pass over one string. This phase answers a different question, _"is this text written the way Persian is
written?"_, and the difference is context. Two new modules hold it: `web/src/language/rules.ts` (the
catalogue) and `web/src/language/normalize.ts` (the pipeline and its report).

### Text is runs, not a document

A rule asks what it is looking at before it decides. Three contexts exist, and the third is the one that
makes the other two safe:

| Context        | What it is                                                                                         | Who may edit it                                            |
| -------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Technical span | a URL, an email, a path or slash token (`BTC/USDT`), a code span, a dotted identifier (`index.ts`) | nobody, ever                                               |
| Numeric span   | a figure with a separator: `3345.20`, `2026-09-19`, `1:3`, `۱۲٬۳۴۵٫۶۷`                             | the digit rules, and only a _bare_ figure in Persian prose |
| Prose          | everything else                                                                                    | the Persian rules, each guarded by its own neighbours      |

Prose is where the interesting decision lives, and it is deliberately not a flag. A mark is folded only
when the **nearer of its two neighbouring letters is Persian**, which is why `quote, said the shell` keeps
its comma and `نسبت ریسک 1:3` keeps its colon while `قیمت ورود 3345 است` reads as `قیمت ورود ۳۳۴۵ است`. A
tie goes to Persian (a bare figure inside a Persian sentence is the commoner case); text with no letter
on either side is left alone, because a normalizer that decides what a string _means_ is the thing this
layer exists to prevent.

The split from Phase 7.5.1 is now load-bearing, and the suite asserts it: `normalizePersianText` still
folds every digit, because a comparison key wants `3345` and `۳۳۴۵` to be one number — and
`normalizePersianContent` leaves `XAUUSD 3345.20` alone, because a screen that reformats a price corrupts
it. 7.5.1's docstring claimed the identity pass was "safe to run over mixed content"; that claim was
false for digits, and it is now replaced by the honest two-function contract.

### The rules

Nineteen rules in five kinds — six character folds (including Unicode NFKC **scoped to Arabic script**,
so the `fi` ligature and full-width digits in English text stay as they are), two digit rules, four
spacing rules, four ZWNJ rules, two punctuation rules, and two that only report. A third reporting rule and
a fifth ZWNJ rule joined the catalogue later, in the repository evaluation near the end of this file, so the
catalogue is **twenty rules** today.

- **Character**: the Arabic yeh/alef maksura, the Arabic kaf, the two kaf variants (swash kaf and kaf
  with ring, the one fold here that is a product decision rather than a Unicode mapping), the presentation
  forms, the tatweel, the vowel marks.
- **Digit**: Arabic-Indic → Persian. A figure carrying a separator is a technical figure and keeps Latin
  digits; a bare figure in Persian prose does not; and where the text is ambiguous, nothing is decided.
- **Spacing**: horizontal runs collapse, line-trailing whitespace goes, no space before a mark, exactly
  one after it. Newlines, blank lines and **indentation** are structure and are never touched — the suite
  asserts an indented block survives byte for byte.
- **ZWNJ**: runs collapse, a ZWNJ beside a space or at an edge goes (it joins nothing), and every ZWNJ
  between two letters stays exactly where it was.
- **Punctuation**: `, ; ?` → `، ؛ ؟` in Persian prose; the percent sign **follows its figure**, because
  that is what CLDR does — `fa-IR` emits U+066A beside Persian digits and `fa-IR-u-nu-latn` emits `%`
  beside Latin ones, so `۲٫۵%` becomes `۲٫۵٪` and `2.5%` does not change at all.

### What it refuses to fix, and why that is the design

Two rules only report. The load-bearing one is `zwnj.attach-candidate`: a space where Persian writes a
half-space — after `می`/`نمی`, before `ها`/`های`/`تر`/`ترین` — is found and handed to a reviewer. It is
not corrected because the same letters are also words of their own (`می` is _wine_; `تر` is _wetter_), and
telling a prefix from a noun needs a lexicon this phase does not have and would not want to guess at. The
entry that authorises it, `rule.zwnj-placement`, carries `confidence: 0.7` — that uncertainty recorded
rather than hidden.

Everything the pipeline writes is reported exactly: which rule, which version of it, which knowledge key
authorised it, the offset, and the characters it replaced. Nothing is passed through a rewritten blob,
so a correction can be reviewed without diffing two strings.

### `@persian-tools/persian-tools`, re-checked

7.5.1 recorded that the library's `fixHalfSpace` was **rejected on provenance** and named this phase as
the one where the question would come back. It came back, and the answer is unchanged — for a reason this
phase could now demonstrate rather than predict. `fixHalfSpace` decides placement with a private rule
table; a pipeline that called it would be adopting a third party's unpublished orthography as ours, and
the report would have nothing honest to cite. What this phase has instead is a rule that _finds_ the same
cases and hands them to a reviewer, which is what makes the half-space question answerable at all.

The library's character folds (`arabicToPersian`-style conversions) are the other tempting overlap, and
they are three mapping lines here, each one cited to a Unicode code point and each one already stored as
knowledge. Neither is worth a dependency, and the trigger that would change that is unchanged too:
Persian spoken-word forms — a number read aloud, a date in words — which still have no caller.

### How it is governed

The catalogue is data, and each rule names the **language-memory key** that authorises it. The gate is
the store from 7.5.1:

- a rule runs only while that key holds a **trusted** entry — `proposed` and `validated` are not enough,
  because a correction changes text a reader sees;
- an **agent proposal cancels nothing and enables nothing**: the suite proposes a rule entry from
  `agent-proposal`, proves the pipeline ignores it, then has a human reviewer accept it and proves the
  rule starts working;
- **deprecating** an entry retires its rule with no code change — the suite retires the spacing rules and
  watches the text stop being corrected, while the character rules on other keys keep working;
- a trusted **`exception`** entry contributes protected literals (its `examples`), which is the mechanism
  for the string a normalizer is right about in general and wrong about here. No exception is _seeded_,
  because none is justified yet; the mechanism and its test are the hook, and the fix for a future
  false positive is knowledge rather than a branch.

`authorisedRules`, `protectedLiterals` and `normalizationRuleKeys` are exported so a review tool, a build
step or a later phase can ask the same questions this pipeline asks.

One extension is named rather than half-built. Making the half-space rules **automatic** needs a
word-level `from → to` pair in the schema; today's `mapping` is deliberately one code point in, one code
point or nothing out, and widening it would break the invariant Phase 7.5.1 asserts (`normalizePersianText(mapping.from) === mapping.to`).
The trigger is a reviewed entry per pattern, and the schema change lands with it, not before.

## Phase 7.5.2.3 — grammar, spelling, and one engine instead of four

Task 1 is `web/src/language/grammar.ts`, Task 2 is `web/src/language/spelling.ts`, and Task 3 is
`web/src/language/languageQa.ts`. Between them, **17 rules** — 7 grammar, 10 spelling — and one pipeline
that runs the four families in order and says which family saw what.

### Grammar, scoped to what this product actually gets wrong

Seven rules, and the split between them is the file's whole argument. Two are **mechanical**
(`enforcement: 'correct'`) because the answer is a fact about characters; five are **pattern** rules
(`enforcement: 'report'`) because the shape is usually wrong and never certainly wrong.

- **mixed scripts** (`grammar.mixed-script-boundary`, correct) — a Latin technical token and a Persian
  word are separated by a space, or by a half-space when the Persian part is one of the four suffixes
  that bind to it: `ها`, `های`, `تر`, `ترین`. It runs first, so everything after it sees words rather
  than a run of characters. Digits are never touched: `3345R` is a figure, not two words.
- **the ezafe** (`grammar.ezafe-yeh`, correct) — a `ی` written as a separate word after a vowel-final
  word is attached with a half-space. Narrow on purpose: `حرف ی` is left alone, because nothing there
  says the `ی` is an ezafe, and the conjunction `و` is excluded, because gluing `و ی` into `وی` would
  rewrite a sentence rather than a spelling.
- **a numeral takes a singular** (`grammar.plural-after-numeral`, report) — `۳ معامله`, not
  `۳ معاملات`. The `ها`/`های` ending is derivable, so the suggestion is the word with the ending
  removed, half-space spelling included; a broken plural (`معاملات`, `نکات`, `سوالات`) is a table in the
  file, and a plural it has never seen would need one it does not have.
- **a plural subject takes a plural verb** (`grammar.verb-number-agreement`, report) — with the subject
  recognised by the `ها`/`های` ending and by nothing else. `ان` and `ات` are deliberately absent:
  `تهران` ends in `ان` and is singular, and reporting a correct sentence as wrong is worse than missing
  a wrong one. One word may sit between the subject and its verb, because `پوزیشن ها بسته شد` is the
  ordinary sentence and a rule that could only see subject-then-verb would miss it.
- **a pronoun conjugates its own verb** (`grammar.pronoun-agreement`, report) — closed lists on both
  sides, so it has no false positives by construction. Both spellings of `آنها` are keys, because a
  closed-up spelling is common enough that knowing only the half-space form would do nothing about half
  the text the rule was written for.
- **the object marker has a verb after it** (`grammar.object-marker-before-verb`, report) — the one
  shape that needs no parse: `را` with nothing but a mark or a line end after it. The marker is required
  to be a word, so `چرا؟` is not reported, and the check sees a line end as well as the end of the text.
- **adjectives do not pluralise** (`grammar.adjective-invariant`, report) — with confidence 0.75 and the
  reason in the rule's own example: `خوبها` is also a legitimate noun, so the ending is not by itself a
  mistake.

### Spelling, register and punctuation — a decision, not a spellchecker

Ten rules in three families, and the family decides the enforcement.

- **Eight compounds written as one word** — `بجای`, `بطور`, `درصورت`, `بمرور`, `بندرت`, `هیچکس`,
  `آنها`, `هیچ کدام`. Each pair is its own rule with its own store key, so one can be accepted or
  retired without turning the others off. That is what the phase's "learnable" requirement actually
  costs: a fixed string can be corrected, and it can be corrected one string at a time.
- **Register** (`spelling.register`, report) — nine spoken forms and the written form each stands for.
  Reported because a spoken form is a register choice rather than a spelling mistake, and because a
  register check with no corpus behind it should not claim to know every colloquialism.
- **Repeated marks** (`spelling.repeated-mark`, correct) — a doubled mark collapses to one, and the
  class mixes the two scripts on purpose, because the mistake is usually a copy-paste that leaves an
  ASCII mark beside a Persian one. An ellipsis is deliberately _not_ in it: `...` is a pause, not a slip.

### One pipeline, driving the layers instead of re-deriving them

`languageQa(text)` is Text → normalize → grammar → spelling → terminology, and its two properties worth
having are negative ones. There is **no second implementation** of "is this text Persian", "what may a
rule touch" or "which key authorises this": `normalize.ts` grew a `runRules` engine and an
`authorisedOfRules` gate, and `normalizePersianContent` is now one caller of them rather than the only
one. And **no offset is silently re-based** — every stage carries the text it received and the text it
produced, because re-basing offsets across four transformations is arithmetic that looks tidy and is
eventually wrong.

The pipeline departs from the flow the phase lists in exactly one place, and the reason is stated rather
than hidden: terminology is checked **last**, on the text the deterministic rules produced. Checking it
before them would report a form the pipeline was about to change, against a text no caller holds. The
stage report makes the order visible, so the deviation is inspectable rather than implied.

Two things the report is careful about:

- **`deterministic` is per suggestion, not per run.** `true` means a mechanical rule already applied the
  fix and the exact characters it replaced are in the report; `false` means a pattern a person decides
  about. There is no score, no model and no probability anywhere in the type.
- **The report is complete.** Replaying the corrections it lists — in the order the rules ran, right to
  left within each rule — reproduces `report.text` exactly, and the suite asserts it. Nothing was changed
  that the report does not name.

Phase 7.5.2.1's _findings_ are carried into the normalization stage as well as its changes. They are half
of what that layer knows — a missing half-space, a figure wearing Persian digits beside a technical
token — and a caller holding only `languageQa` would otherwise lose them, because no other stage looks
for a half-space.

### Validate, and store the decision

The phase's last two steps are three small functions, because the store from 7.5.1 already _is_ the
versioned knowledge update.

- `promoteLanguageRule(id, memory, review)` — how the rule that ships as a candidate starts working. It
  is accepted through the ordinary `review` path, so the provenance on the entry is the **reviewer's**,
  not the model's, and the entry keeps its reason, its version and its `trusted` status.
- `retireLanguageRule(id, memory, deprecation)` — the honest version of "turn this check off": a
  versioned decision with a reference, visible in the store's history, rather than a flag in a config
  file. The code stays; the rule stops running.
- `approveForm(form, memory, decision)` — the suggestion-acceptance path, and it writes an `exception`
  entry: the mechanism 7.5.2.1 built for the string a normalizer is right about in general and wrong
  about here, reused for the third time rather than reinvented. An unreviewed proposal parks and approves
  nothing.

Nothing writes to the store on its own. A suggestion is a _reading_ of the text; a decision is what makes
it knowledge, and every decision is a value — accepted, pending or rejected — for the same reason a
rejection is a value in 7.5.2.2.

### The two resource questions, re-checked rather than cited again

**DadmaTools — rejected for the frontend, deferred behind a real need.** It is a Python NLP pipeline
(lemmatiser, part-of-speech tagger, dependency parser, spell checker) with a trained model behind it, and
there is no JavaScript path to any of it. Two things follow. The mechanical one: adopting it would put a
Python runtime, a model download and a service beside a frontend that currently ships one 60 kB font. The
principled one, and the one that decides it: **its output is statistical.** A dependency parse and a
spell-check suggestion are probabilities, not rules. The phase says not to pretend probabilistic NLP is
deterministic, and a grammar layer whose report prints `deterministic: true` beside a model's guess would
be exactly that pretence. The deferral has a trigger: a real backend that needs Persian NLP for something
this layer cannot do mechanically — and that is a backend decision, not this phase's.

**`@persian-tools/persian-tools` — not adopted, for the third phase running, and now for a demonstrated
reason.** Its `fixHalfSpace` was rejected in 7.5.1 on provenance (a third party's private placement table
would become our orthography) and 7.5.2.1 re-checked the question. This phase is where the alternative
became concrete: `grammar.ezafe-yeh` and the compound rules fix the cases whose answer is a _fixed
string_, and report the ones whose answer is a _placement decision_ — so the pipeline says which is
which rather than delegating both to one table. Its other overlap is character folding: three mappings
here, each cited to a Unicode code point and each already stored as knowledge. Neither is worth a
dependency.

**A statistical spellchecker was not added, in any form.** The phase asks for common spelling mistakes
and it gets them as eight reviewed compound pairs and one closed register list — every one of which can
be named, versioned, accepted or retired. The failure mode this avoids is specific: a spellchecker that
is right about 95% of words and silent about which 5% is not something a _knowledge_ store can hold,
because a trusted entry whose provenance is "a model thought so" is the one thing this whole layer exists
to prevent.

## Phase 7.5.3.1 — reading a message, and the switch that outranks the reading

The three phases before this one built knowledge: an orthography, a correction pipeline, a lexicon, a
grammar. None of them read anything a person wrote. This sub-phase is where the layer starts _looking at
the message_, and the whole of it is three new modules — `detect.ts` (Task 1), `profile.ts` (Task 2) and
`preference.ts` (Task 3) — plus the first piece of the Persian line a user can actually touch: the
Language card in Settings → Appearance. The record below is about the decisions rather than the files.

### Detection is a census, and it says so out loud

There is no model, no classifier and no score pretending to be a probability. `detectLanguage` counts
letters per script and matches closed lists, and every verdict is re-derivable by hand from the message
and the tables in the file. That is not a compromise on quality; it is what the rest of the layer
requires. `LanguageMemory` holds _cited_ knowledge, and the moment a detection is stored or acted on,
`detected: 'fa'` has to be answerable with "32 of the letters were Persian and none were Latin" — not
with "a model said so". It is the same test DadmaTools failed above, applied to this product's own code.

Three consequences follow, and each is asserted:

- **Digits are not evidence.** `3345.20` is a price and reads the same in every language, so counting it
  would move a verdict without carrying information. A message of digits alone is `unknown` with
  confidence 0 — not Persian because it has Persian digits in it, and not English by convention. `۳۳۴۵`
  is counted and reported, and changes no verdict.
- **Confidence is a statement about evidence**, and the formula is two visible factors: the share of
  letters in the winning script, and how many letters there were. `XAUUSD` scores about 0.7 — real
  evidence, thin evidence — and a full sentence of one script scores 1. It is rounded to two places, so
  it can be asserted at all.
- **`mixed` is a first-class answer.** A Persian sentence full of `XAUUSD` is the normal shape of this
  product's text, and a detector that called it either language alone would be wrong about the exact case
  it exists for. Its confidence is the one place the formula changes meaning, and it changes it to
  something more useful: how _evenly divided_ the message is. A Persian sentence with one English token
  scores low, because a stray foreign word is not evidence that somebody is mixing languages, and it is
  already reported as the technical token it is.

Finglish is a closed list of transliterations plus three Latin shapes, with a stated ceiling of 0.85 and
no pretence of being a transliteration classifier. It also refuses to guess from one word: `salam` alone
is `en`, because one marker is not a verdict, and a message carrying English stopwords is English however
Persian one of its words looks. The stopword list is why `salam, the price` is English and `salam, mishe
gheymat ro begi` is Persian — the distinction is written down rather than tuned.

The register comes from the register table §21 already owns plus two short closed lists of colloquial
and formal markers; the style is three mechanical predicates; the verbosity is word-count bands and is
called a band. A tie is `neutral` rather than a coin toss, and a message with no marker reaches for none.

### The profile is a value, and the reply is one rule

Task 2 is one type: detection, plus the person's standing choice, plus the resolution between them, under
`LANGUAGE_PROFILE_VERSION`. The separation is the design. Detection is about the _message_ and changes
every time somebody types; the preference is about the _person_ and changes when they say so; and the
reply is the only thing that combines them. A later stage that conflated them would re-decide precedence
every time, which is how two stages end up disagreeing about one conversation.

The precedence rule is `resolveLanguage`: **an explicit choice wins, otherwise the message decides.** A
Persian speaker reading English documentation still wants the answer in Persian, and no amount of
detection can know that. Finglish resolves to Persian. A message with no letters resolves to the
product's own language with `source: 'default'`, because nothing was detected. When an explicit choice
disagrees with the reading, `overridden` is set and the reason says so — a fact a later stage may want to
act on, and one that would otherwise be invisible.

The honesty rule from Task 2 — _language analysis must never alter the meaning of the user's message_ — is
enforced structurally rather than promised. The profile holds no copy of the message: it is counts, closed
vocabulary verdicts and the exact words that were evidence. The suite asserts every reported string is a
verbatim substring of what was typed, and that the corrected paragraph the normalizer would produce
appears nowhere in the reading. And `LANGUAGE_PROFILE_FIELDS` is a closed list the suite compares the
built profile against, so a field that describes _who somebody is_ fails here rather than shipping
quietly. Detection may notice how a person writes; it may not assemble a picture of the person.

### The switch overrides detection without joining the knowledge store

`auto` is a **value**, not the absence of one. Detection is worth having on its own, so "I have not
chosen" has to be expressible — otherwise somebody who never opens Settings has silently chosen English,
and somebody who clears their choice cannot get back to automatic. The phase's "override automatic
detection when explicitly selected" needs both halves: something explicit to override _with_, and
something automatic to be overridden.

The preference is deliberately **not** in `LanguageMemory`. The store holds cited knowledge about
Persian — orthography, terminology, rules a reviewer accepted — and it is shared, versioned and reviewed
through a provenance path. A person's own setting is none of those: it is not a claim about the language,
it has no reviewer, and writing it in would put per-user state into a knowledge base whose entire value is
that every entry can be cited. It lives in `preference.ts`, which owns the key, the validation and the
storage access, and it is _exposed to_ the language system rather than stored inside it: the interface
store mirrors it so the control can render its selected state on the first paint, and `storedProfileOptions`
is the single seam a later agent stage calls to get a profile that honours the choice.

Persistence is `localStorage`, because the architecture has no settings table and no user-settings API yet,
and both read and write go through one module that swallows a hostile or missing store rather than
throwing. A write that fails is _reported_ (`languageStorable`), so the caption says the choice lasts until
the app closes instead of showing a selected state that will be gone at the next launch. When the product
grows a settings API, `preference.ts` is the only file that changes.

What the running application pays for this is measurable and small: `preference.ts` is in the bundle, and
`detect.ts` and `profile.ts` are **not** — nothing in the interface imports them, so the built JavaScript
contains no `finglish` and no `stopwords`. Detection becomes part of the product on the day a stage sends
it a message; until then it is a library with a suite.

The control itself is three buttons — Automatic, Persian (فارسی), English — placed beside Writing
direction in Settings → Appearance, which is where the application's existing language controls live. The
pattern is the one already on that page: pressed state in `aria-pressed`, selection expressed through the
primary/secondary variant. It is **not** a UI translation, and nothing here activates Persian as the
user-facing language: the browser suite asserts `document.documentElement.lang` is still `en` after
Persian has been chosen, because the switch sets the language of the _answer_.

## Phase 7.5.3.2 — the context, the preferences, and the guidance

Three modules, one extension, and one deliberate refusal. `context.ts` reads what the _interaction_ looks
like rather than what the message _is_; `communication.ts` resolves four preferences from four sources with
a stated order; `guidance.ts` turns that into wording instructions a response stage can apply. The refusal
is the fourth: no engine, no prompt text, no model call and no tone-of-voice library — the phase says the
adaptive response system is a later sub-phase, and the way to keep that true is to ship the structured
input and stop.

### The six dimensions, and which of them are new

| dimension     | where it comes from                                                                   |
| ------------- | ------------------------------------------------------------------------------------- |
| `formality`   | 7.5.3.1's register, carried with its markers and its confidence — never recomputed    |
| `setting`     | new: small talk or work, from greetings, markers and the subject matter               |
| `expertise`   | new: a gradation of how much of the message is the product's vocabulary               |
| `depth`       | new: what was _asked for_ over how long the message happens to be                     |
| `intent`      | 7.5.3.1's style, plus `discussion` for a statement that is making a point             |
| `terminology` | new: how Persian and English are mixed, which is what decides whether a term survives |

Two of the six are the earlier phase's answers, and carrying them rather than re-deriving them is the point:
formality _is_ the register, and a second opinion about politeness is a second thing for the interface to
disagree with. The suite asserts they agree.

`setting` and `formality` are separate dimensions because they answer different questions, and the case that
proves it is `سلام، حد ضرر را چک کن` — a greeting (conversational) around a work request (professional), in
the informal register. The two readings are both right, and a single "tone" value would have had to pick
one. When the two countable readings tie, the tie is broken by **the subject matter** — the one signal that
is content rather than phrasing — and a tie with no subject in it stays unresolved rather than becoming a
coin toss.

`expertise` is measured as _density_, and the honest consequence is that `حد ضرر چیه؟` reads as **technical
wording**: three words, one of which is a concept. That is a fact about the sentence. It is not a claim
about the person, which is why the same message is simultaneously a _question asked in plain wording about
the product's subject_ — the two dimensions disagree on purpose, and the response stage needs both.

### Four sources, and the one ordering that matters

Explicit instruction → the message → what previous turns looked like → the default. The interesting
ordering is the middle one, and it is argued in the file rather than left implicit: **the message is
evidence about this turn, a learned preference is evidence about the person's standing style, and the
standing style is only consulted where the turn is silent.** Both directions are asserted, because only one
of them is the interesting one: a learned `informal` does not soften a message that carries formal markers,
and it does fill in for a message that claims no register at all.

What is learned is a **histogram of closed-vocabulary readings** — register and detail counts, sample count,
and, from Phase 7.5.3.4.1, the language each turn was answered in — and nothing else. There is no field for a message, a word from one, a user, a session or a time, and the
suite walks the stored value and requires every leaf to be a number. That is the property that makes a
learned store reviewable: a count of _how_ somebody writes cannot become a record of _what_ they wrote, and
it cannot hold a credential. Three further consequences are deliberate:

- **Nothing writes a preference from those counts.** There is no path from the histogram to a stored
  setting; the counts are an input to a resolution whose output is labelled `source: 'observed'` with the
  8-of-8 arithmetic in its reason. A learned reading therefore cannot silently replace a trusted one.
- **The memory is bounded.** Past `OBSERVATION_WINDOW` turns the counts are halved and the sample count with
  them, so a style from a year ago does not outlive the current one and the store cannot grow without limit.
- **A tie is a tie.** `informal 3, neutral 3` is somebody whose turns change, so it resolves to nothing
  rather than to whichever value sorts first.

The learned store lives beside the language setting (`master-trade.language.observations`) and not in
`LanguageMemory`: cited, reviewed, shared knowledge about Persian is a different kind of thing from a
per-user count of turns.

### Terminology balance is folded into terminology style, on purpose

The phase lists "preferred terminology style" and "Persian/English terminology balance" as two preferences.
They are one dimension here — `product-terms`, `english-terms`, `bilingual` — because two fields can
contradict each other: `product-terms` with "keep the English too" is not a third setting, it is a
contradiction, and a response stage handed a contradiction invents a rule nobody can explain. The single
dimension is decided from the message's own mixing (a Persian reply to a person writing whole English
clauses keeps the English beside our form) and from an explicit request for the terms themselves, which
outranks both.

### Guidance, and the list of things it may not touch

`responseGuidance` is a pure total function from a resolved profile to a specification of _wording_: a tone,
a depth, a terminology style, a structure, and a list of note ids. Every string it can produce comes from a
closed catalogue in the file — the notes, the clauses the reason is assembled from, the tone and structure
vocabularies — so a message's own words cannot reach it. The suite proves that twice: a token that appears
nowhere else cannot get into the guidance, and no string in a guidance contains a digit, so guidance cannot
carry a figure.

`GUIDANCE_INVARIANTS` is the list the phase names — facts, calculations, tool results, permissions, safety
rules, trading restrictions, uncertainty — and it travels with every guidance rather than living in a
document, because the thing that must not change is the thing a response stage is most likely to change
while "just rewording": a rounded figure, a softened uncertainty, an implied permission. The mechanical
form of that promise is that the guidance has no field, no note and no reason a value could sit in, and the
suite asserts the produced object's field names against a closed list.

### The switch's precedence rule, settled

7.5.3.1 left one question open and named it: an explicit request _inside_ the message was read and then
outranked by the stored setting. The phase's own rule — explicit instructions above learned or stored
preferences — answers it, so `resolveLanguage` now reads the request first, `requested` joins
`REPLY_SOURCES` at the head of the precedence list, and the reason says when a stored choice was passed
over. A request for a _term_ is not a request for a language, and that distinction is now a rule of its own
(see below), because the two are one word apart in Persian.

Phase 7.5.3.4.1 added one step to that list — what previous turns showed — between the explicit choice and
the reading. It is argued in this phase's own section below, and what matters here is that the extension
was a member of the same closed list `REPLY_SOURCES` rather than a second rule that could disagree with it.

## Phase 7.5.3.3 — the interface in Persian, and the line this phase had to draw

This is the first sub-phase whose Persian is _read by a person_ rather than _held as knowledge_. Everything
above is a store an agent consults; 7.5.3.3 is the words on the screen, 2,440 of them, in
`web/src/i18n/messages.fa.ts`. The layer and its one boundary are `docs/ui-language.md`; §24 of
`docs/frontend-foundation.md` is the phase summary.

The boundary is the part that belongs in this file, because it is a claim about _this_ knowledge system. The
agent's language layer and the interface share exactly one thing — the setting 7.5.3.1 persisted — and the
interface layer only ever reads it. So a message the agent reads as Persian cannot move the interface into
Persian, and a person who picks Persian in Settings has not taught the agent anything about their vocabulary.
The suite asserts both directions by import rather than by discipline: nothing under `web/src/i18n` may reach
the knowledge store, and nothing under `web/src/language` may reach the catalogue.

### The glossary decided the interface's wording, and the suite ties the two together

Phase 7.5.2.2 called this out as the risk worth designing against — _a glossary that disagrees with itself_
— and the translation is where the disagreement would actually appear, because it is written against a
different file. So the navigation is not merely _consistent_ with the terminology record: the Persian label
of every page and group **is** the record's preferred form for that concept, and a case in
`tests/persian-terminology.test.ts` reads the sidebar's wording out of the catalogue and compares it to
`preferredTerm`. If a later phase renames `academy` in the glossary and not in the interface, or the reverse,
a test fails rather than a reader noticing.

The rest of the terminology follows the same record: `پوزیشن`, `مواجهه`, `دفتر معاملات`, `تایمفریم`,
`حد سود`, `حد ضرر`, `کارمزد`, `بهای تمام‌شده`, `مضرب R`. Where a term has no Persian counterpart the product
uses — `R`, `R:R`, `XAUUSD`, a provider name, a package path — the two catalogues hold the same value, and
the suite names those nine rather than allowing a share of them quietly.

### One decision about Persian itself: which digits

The interface writes figures with the Persian digits the rest of the product uses (`formatFaNumber`, Phase
7.5.2.x), and keeps Latin digits inside a _catalogue entry_ where the number is part of a sentence a person
reads as text — a sample size, a percentage, a level (`5858`, `1.5R`, `46.5%`). The reason is not
consistency but comprehension: a Persian reader of a trading interface parses `1.5R` and `21290` at a glance
and a re-typed Persian figure is one more thing to translate back in the head. Figures the _code_ formats go
through the Persian formatters as before; this phase did not touch them.

## Phase 7.5.3.4.1 — the language of the answer, and the four signals that decide it

Everything above answers a question about a _message_. This sub-phase answers the one the response pipeline
actually needs: **which language is this answer written in** — and it is the first phase whose output is an
instruction to a model rather than a value for a reader, which is why its boundary runs along the process
divide rather than inside the interface.

The phase names one order and four signals, and the order is the deliverable:

| #   | Signal                                               | Where it comes from                                      | Source label               |
| --- | ---------------------------------------------------- | -------------------------------------------------------- | -------------------------- |
| 1   | A request inside the message (`به انگلیسی جواب بده`) | 7.5.3.1's reading                                        | `requested`                |
| 2   | The person's explicit choice — the switch            | 7.5.3.1's setting, which 7.5.3.3 also gave the interface | `explicit`                 |
| 3   | What previous turns showed                           | the learned store's language counts                      | `observed`                 |
| 4   | The reading of the message                           | 7.5.3.1                                                  | `detected`, then `default` |

`observed` is the new step, and the reasoning behind its _place_ is the whole of it. It sits **above** the
reading because it is evidence about the person rather than about the sentence in front of them: somebody
who has been reading Persian answers for a week and then types one English question has not stopped being a
Persian reader, and a rule that followed the single message would re-decide who they are on every turn. It
sits **below** the explicit choice because it is inferred and the choice is stated — a setting that could be
reversed by the behaviour it produced would be a setting nobody could rely on. Both directions are asserted,
including the one that looks wrong at first: a habit of six Persian answers makes an English message come
back Persian, **and** `overridden: true` says so, so the disagreement is visible rather than reconciled in
silence.

### The learned store gained a dimension, and kept every property it had

Language joined `formality` and `detail` in `CommunicationObservations`, under the same key, through the
same writer, with the same rules: a minimum sample count before anything is a habit, a tie is not a habit,
counts halve past the window, unknown keys are dropped when a stored value is read back, and every leaf is
still a number — the suite still walks the value and requires it. What is counted is _the language each turn
was answered in_, not the language a message was written in, because the reply's language is the one that
already folds in the setting and any request the person made.

Nothing writes the setting from those counts, for the same reason 7.5.3.2 gave: a learned reading cannot
silently replace a trusted one. A store written by a build that had no `languages` key reads back as zero
counts, which is nothing learned rather than a fourth state, and that case is a test.

### One value for the response stage, and the reason it is one

`responseControl(text, options)` reads the message once, resolves `.reply` through the four signals, and
returns 7.5.3.2's `.guidance` for the same turn — so a response stage cannot apply the language of one
reading to the wording of another. Its fields are closed (version, reply, guidance, observedSamples), and
the language, the source and the invariant list are the only things in it that describe the decision: there
is no field a figure, a tool result or a permission could travel in.

`storedResponseOptions()` is the seam, and it mirrors `storedProfileOptions()` exactly: the switch writes
the preference through `preference.ts` and the learned store through `communication.ts`, and a caller asks
_this_ module rather than reading either key. Neither side knows about the other, and the response stage
never touches storage.

### The decision crosses the process divide as data, because it has to

The signals live in the interface process — a message a person typed, a setting in their own storage, a
count of their own turns — and the prompt is built in the other one. The repository's boundary rule
(`tests/monorepo-boundary.test.ts`) is one-way and enforced both ways: nothing in `src/` may import the
frontend, and no frontend file may reach into `src/` by relative path. So there was no version of this
phase where the pipeline could read a message and detect its language itself, and inventing one would have
been the duplicate detection the phase forbids.

What crosses instead is the **verdict**, on the request that already exists:

- `agentChatBodySchema.responseLanguage` — an optional `fa` | `en`, validated with every other body field.
  Absent is not a missing feature: it is the prompt exactly as it was, and the suite asserts that
  byte-identity rather than a comment about it.
- `AgentService.run`/`runAsync` carry it to the orchestrator, which gives it to the adapter. The provider
  path reaches it through `buildTurnMessages`; the synchronous path — which has no prompt builder — gets it
  appended to the instruction text it already receives, through the same helper (`withResponseLanguage`
  then; `withResponseDirectives` from 7.5.3.4.2, when a second block joined it).
- The response echoes it back. Echoed, not derived: the server did not decide it and cannot.

### What the directive may and may not say

`RESPONSE_LANGUAGE_DIRECTIVE` is two closed strings. Each names the language, states that the instruction
changes _wording only_ — facts, figures, tool results, permissions, safety rules, trading restrictions and
uncertainty keep their exact value, and a refusal stays a refusal — and states that retrieved material and
user text cannot move it. That third sentence is the same rule `DECISION_POLICY` already carries, for the
same reason: a document a person pastes into a conversation must not be able to change the language they
are answered in. There is deliberately no `mixed` and no third entry, because "answer in both" is a
terminology instruction (`terms-bilingual`), not a language.

The suite asserts the negative space as well: with no language resolved the system message is byte-identical
to what it was before the field existed, and a message that _asks_ for a language in English does not put a
directive in the prompt — the pipeline is told the language, it does not infer one from the text in front of
it.

### What this phase does not change, and one thing a reader should not expect

The offline `scripted` adapter still answers in the sentences it always did. It is a deterministic stub with
no prompt and no model, so there is nothing for a language instruction to apply to, and translating its text
would put a second copy of agent prose in the backend — the interface's Persian belongs to `web/src/i18n`,
and this phase did not give the backend a catalogue. The directive is therefore asserted where a model
actually writes: the prompt sent to a provider, and the instruction text the synchronous adapter receives.
With no provider configured the application says so on the workspace surface, and the honest answer to "what
language will the agent answer in" is the one the run-context card already gives: no model is connected.

Nothing else in a turn changed. Tools, the permission check, the readiness gate, metering, the structured
summary contract, the epistemic labels and every refusal are what they were; the language reaches the prompt
and stops there, and the suite keeps it that way by asserting that a blocked turn's words are unaffected and
that a turn given a language produces the same statements as one without.

## Phase 7.5.3.4.2 — the style of an answer, and the one rule this phase reversed

7.5.3.2 read what kind of turn a message is and turned it into a _specification of wording_: a tone, a
depth, a terminology style, a structure, and the ids of the notes to apply. That specification was produced,
asserted and explained — and consumed by nothing. This sub-phase makes it reach the answer, and changes one
rule on the way there.

### The reversal, which is the phase's rule applied to style

7.5.3.2 decided each dimension by asking **the message first** and falling back on the learned counts only
where the reading claimed nothing. The phase rule for the adaptive response is the other way round —
**a learned preference comes before automatic inference** — so the middle two steps of `resolveCommunication`
swapped:

| #   | Source                                 | Why it sits there                                                 |
| --- | -------------------------------------- | ----------------------------------------------------------------- |
| 1   | An explicit instruction in the message | Asked for, now, in words. Always wins.                            |
| 2   | The learned preference (the counts)    | Evidence about the person, counted rather than guessed.           |
| 3   | The reading of the message             | Evidence about this one sentence.                                 |
| 4   | The default                            | Standard detail, neutral register, the product's own terminology. |

The argument is 7.5.3.4.1's, applied to style rather than to language: an inference is drawn from _one_
sentence, and a learned preference is a count of the person's own turns. The safeguard is the same one too.
An explicit request still outranks both, so somebody who usually wants one line and who this time writes a
paragraph and asks for detail gets a detailed answer — asking is the one thing that always wins — and where
the learned value disagrees with the reading the reason names both sides instead of reconciling them in
silence:

> `7 of 7 previous turn(s) read as informal, and this message reads formal; a learned preference outranks the reading of one message, and the next request for a register outranks both.`

What did **not** change: the counts are still counts, still bounded, still decaying, and still never written
back as a setting. `PREFERENCE_SOURCES` now lists the sources in the order they are consulted, because it
claimed "strongest first" while listing the old order — a comment that was true and then was not.

### The catalogue had to live where the answer is written

A note is an instruction about wording, and it is _resolved by the response stage_ — in the other process,
where `src/llm/prompt.ts` builds the system message. The ids are produced where the turn is read
(`web/src/language/guidance.ts`). Two copies of an instruction are two instructions that can disagree, and
`tests/monorepo-boundary.test.ts` forbids carrying one across by relative path, so the contract moved to
`@shared/language/guidance`: the four vocabularies, the note catalogue, the seven invariants and the shape a
style travels in. `web/src/language/guidance.ts` imports it and re-exports it under the names this layer has
used since 7.5.3.2, and the suite asserts the two surfaces are the **same objects** (`toBe`) rather than
equal copies of them.

That is also what let two vocabularies stop being written twice: `CONTEXT_DEPTHS` is `GUIDANCE_DETAILS` and
`TERMINOLOGY_STYLES` is `GUIDANCE_TERMINOLOGY`, so the reading of how much detail a turn wants and the
instruction of how much to give cannot be two different lists.

### The five things the phase names, as they resolve

| The requirement                   | The dimension | The values                                                |
| --------------------------------- | ------------- | --------------------------------------------------------- |
| concise versus detailed           | `detail`      | `concise` · `standard` · `detailed`                       |
| formal versus conversational tone | `tone`        | `formal` · `neutral` · `conversational`, per language     |
| technical versus simpler          | `expertise`   | decides the structure, and adds the figures-verbatim note |
| preferred Persian/English terms   | `terminology` | `product-terms` · `english-terms` · `bilingual`           |
| appropriate response structure    | `structure`   | `direct-answer` · `explained` · `step-by-step`            |

`technical` gets no paragraph of its own in the prompt. It decides _how the answer is ordered_ and adds the
one note that matters most on a turn full of figures — that every figure is repeated exactly as a tool
returned it. That is the shape of the whole design: the dimensions a person would name are the ones the
values carry, and the rest are notes.

### What the style may not say, stated inside the style

The block the model reads is assembled from the catalogue and closes with the list of what it may not touch —
facts, calculations, tool results, permissions, safety rules, trading restrictions, uncertainty — plus two
sentences that exist because of what a style _is_. A refusal stays a refusal and an uncertainty stays
uncertain, whatever the style asked for; and the instructions are wording instructions within the output
contract, so they never ask for a narration of how the answer was reached. That second sentence is not
decoration: `detail-detailed` says to explain the reasoning "in the order it was reached", which is a
request for a well-ordered explanation and not for a transcript, and a model that read it the other way
would have produced exactly the chain-of-thought this product refuses to expose.

No note has a placeholder and no note contains a digit — asserted over the whole catalogue rather than over
the notes one turn happens to use — so nothing a caller sends can put a figure, a result or a permission
into the prompt as an instruction about wording.

### It crosses as a selection, never as wording

`responseStyle` on the turn request is a strict object: four values from closed vocabularies and a list of
note ids drawn from the catalogue's own keys. A client therefore **selects** wording and cannot author it —
a value outside a vocabulary, a note id with no text, a note list that is not a list, a key that is not part
of a style, and a list longer than the catalogue are each refused by the schema with a 400 rather than
ignored. `responseControl` carries the same decision a second time as `.style` (`responseStyle(guidance)` — a
projection, not a second opinion), so a caller has the value to send and the value to explain without
assembling either. The `reason` is deliberately _not_ in what crosses: it is written for a person to read
and disagree with, and a model has no business being told why it is being asked to sound a certain way.

### The one thing a reader should not expect, as in 7.5.3.4.1

The offline `scripted` adapter still answers in the sentences it always did — it is a deterministic stub with
no prompt, so there is nothing for a style to apply to — and the interface still has no send path that would
resolve a turn of its own. The style therefore reaches a model exactly where a model exists, asserted on the
prompt that is actually sent, and the honest answer to "how will the agent word this" is still the one the
run-context card gives: no model is connected. When the workspace's send path arrives it has one call to
make — `responseControl(…)`, whose `.reply` and `.style` are the two things the request carries.

## Phase 7.5.3.4.3 — what a person says, learned without turning into a profile

The layer had two ways of knowing something about somebody: `preference.ts`, the setting they choose in a
control, and `communication.ts`, the counts of how their turns read. This sub-phase adds the third — the few
things a person says outright about how they want to be answered — and the interesting part is that it is a
third _shape_ rather than a third store.

### Three kinds of thing, three lifetimes, one namespace

| What it is     | Where it lives     | How long it lasts                           | Read when                                      |
| -------------- | ------------------ | ------------------------------------------- | ---------------------------------------------- |
| The setting    | `preference.ts`    | until the person changes it                 | after a request inside the message             |
| The counts     | `communication.ts` | decays; halved past the window              | past five samples, and never above a statement |
| The statements | `learning.ts`      | until the same dimension is corrected again | as soon as one is confident enough             |

The lifetimes are the argument. A statement put in the counts' value would _decay_ — somebody's own words
halving because they had used the product for fifty turns — and a statement put in the setting would make
`auto` impossible to get back to, because `auto` means "stop deciding from what I said" and a statement that
outlived the control would be a decision nobody could revoke. So it is a third key, in the same namespace,
read through the same kind of seam, and the docs say plainly that it is **not a second memory system**: the
module owns no store of its own shape, adds nothing to the Agent Memory, and cannot write to the reviewed
knowledge store at all.

### An interaction cannot learn; a statement can

The phase's flow is _interaction → candidate → validation → confidence → memory → future response_, and the
first step is deliberately not a path in the new module. A turn already feeds the counts
(`observeCommunication`), and an interaction is ambiguous by construction — a person typing a one-line
question has not asked for one-line answers forever, which is why the counts need five samples and a clear
dominance before a resolution reads them. What an interaction _cannot_ do is produce a statement, and the
rule the phase states as "a single ambiguous interaction must not become a permanent preference" falls out
of the shape rather than being enforced: there is no source in `CORRECTION_SOURCES` that a machine can
write, and the shape has nowhere to put an inference.

```
correction     0.8   stated          → read at once
feedback       0.4   recorded        → read on the third repetition (0.4 → 0.5 → 0.6)
                        +0.1 per repeat, read at 0.6
```

Confidence is computed from the source and the repetitions and is never declared by a caller — the input
schema has no `confidence` field, and a caller that sends one is refused. That is what makes "repeated
confirmed preferences" a number rather than a promise: one verdict on an answer is recorded and _not_ read,
which is the honest treatment of "that was too long" the first time somebody says it.

### The precedence, with one more statement in it

`requested → explicit → corrected → observed → detected → default`. The new step sits **above** the counts
and the reading and **below** the setting, and the place is the whole rule: a statement is the person's own
words, so no inference may outrank it — and the setting is the one the person can see and change right now,
so where the two disagree the control wins and the reply _says_ the other one existed.

Both halves are asserted, including the one that looks like a bug at first: with the switch on English and a
correction asking for Persian, the answer is English and the reason reads _"They had also asked to be
answered in Persian, and the choice that is on screen now is the one that stands."_ Nothing is reconciled in
silence, which is what "do not silently overwrite" has to mean once a value has already been decided.

### A term is not a preference

`terminology` is a dimension of the correction vocabulary so that proposing one is a _decision_ this layer
makes rather than a shape it fails to parse — and the decision is to **refer** it:

> a term is reviewed knowledge rather than a preference: propose it through the terminology candidate path,
> where a reviewer decides, and this store stays out of it.

That is the same judgement 7.5.3.2 made when it removed the terminology dimension from the learned counts
rather than wiring it up, and it is the stronger version of it: an accepted term is not a per-person
preference at all, it is a change to shared product knowledge, and it already has a path with provenance,
versioning and a reviewer (`terminologyUpdates.ts`). A person's own statement cannot rename a concept, and the
suite asserts that the store is untouched by the attempt.

### A statement may not carry a sentence

The seven stored fields are four closed values the caller supplies, when it was last said, and the two the
store computes. `CORRECTION_FIELDS` is that list and the suite compares the stored entry against it, so a
field added to carry a message, an id or a figure fails rather than shipping.

The "context" the phase asks to store is `surface` — _where_ the person said it, from a closed list
(`workspace`, `settings`, `review`) — and not what surrounded it. That is the same guard the counts store
keeps with "every leaf is a number": a correction is a statement about wording, and the way to keep it one is
to give it nowhere to put the wording it was about.

### The one seam, and what a reader should not expect

`statedPreference(store, dimension)` is the whole of it: a value, how sure the store is, how many times it was
said, when it was last said, and the _other_ value the same person asked for at some point — computed from the
store as it stands rather than stored on an entry, where it would go stale the moment they changed their mind
again. `storedResponseOptions()` reads the third key beside the other two, so a response stage still has one
call and still never touches storage.

As with 7.5.3.4.1 and 7.5.3.4.2, the interface has no path that _records_ a statement yet — that is a control
in the workspace and a verdict on an answer, both of which are UI this phase did not add. In particular the
Settings switch is **not** a recorder: the switch is a setting, and a setting can be put back to `auto`, which
has to mean "stop deciding from what I said". A statement that survived that would make the automatic option
untrue.

## Phase 7.5.3.4.4 — the interface turns over, and one writer turns it

7.5.3.3 gave the interface a Persian language and left its direction alone on purpose. This phase derives the
direction from that language, so choosing Persian mirrors the interface with no second control, and the work
is the sweep the phase asks for rather than a new subsystem: `directionOf` in `web/src/i18n/direction.ts`,
one writer for `<html lang>`/`<html dir>`, three named directional glyphs, `dir="auto"` on three free-text
surfaces, and every physical spacing utility that was still reachable.

### Deriving the direction from the resolved language

`directionOf(preference, locale)` takes three preferences — `auto`, `ltr`, `rtl` — and the **resolved**
locale, never the preference's name. `auto` is the default and reads the locale: `fa` is `rtl`, everything
else is `ltr`. That is what makes "choose Persian" mirror the interface without a second switch, and the two
pins are what keep "Persian, laid out like English" expressible — an RTL layout is not always what a Persian
reader wants, and a product that cannot say so has made the choice for them.

The preference itself is **not persisted**, and that is deliberate rather than an omission: it is chrome, like
the density and the collapsed sidebar it sits beside in the same store, and the value that outlives the
process is the language underneath it. A pinned direction lasts as long as the window does, and `auto` — the
default — means a reload lands on the language's own direction, which is the one state that is always right.
Persisting it would also be the first step towards two stored settings that can disagree.

Direction is now the same shape as the language: one vocabulary, one derivation, one place the decision is
made. `<html lang>` and `<html dir>` have exactly one writer, `useDocumentLanguage` in
`web/src/i18n/useTranslation.ts`, plus one call to `applyDocumentLocale` in `main.tsx` before the first
paint so the first frame is already the right direction. `App.tsx` used to write `dir` from the UI store and
no longer has that effect; the suite asserts that exactly one file under `web/src` contains
`documentElement.dir =` or `documentElement.lang =`, so a second writer cannot reappear quietly.

### What is mirrored, and the three things that are not

Logical utilities (`ms-*`, `ps-*`, `pe-*`, `inset-inline`, `border-e`) were already the house style, so the
sweep was small and specific: 13 `pl-5` → `ps-5`, three `text-right` → `text-end`, one `text-left` →
`text-start`, and two `border-r` in prose. Three categories are deliberately untouched, and each is named
rather than left to look like an oversight:

- **Meaning, not reading order.** The market arrows (`Trend.tsx`, `journal/DirectionBadge.tsx`), the sort
  arrows in `Table.tsx`, and the disclosure chevrons in `Input.tsx` and `FormSection.tsx` say something
  about the data, not about which way the text runs. Mirroring them would reverse their meaning.
- **Glyphs, read through the direction.** `web/src/components/Directional.tsx` holds `BackIcon`,
  `ForwardIcon` and `PanelStartIcon`, each reading `useTextDirection()` and choosing the chevron that means
  it. Never CSS `scaleX(-1)`: a transform is invisible to a source check and mirrors meaning along with the
  glyph. `Send` is not in the file — it points at the composer in both directions.
- **Geometry that is genuinely not mirrored.** A centred dialog (`Modal.tsx`), the light on the composer
  frame (`.composer-frame::after`), the active agent ring, and the chart frame all pin a physical side on
  purpose; each is allow-listed in `tests/rtl-layout.test.ts` with the reason, so a new physical property
  fails the suite rather than joining them silently.

### Free text is `dir="auto"`, and that is the bidi fix that matters

The three surfaces that hold text this product did not write — the agent turn body in
`pages/AgentWorkspacePage.tsx`, the `MessageComposer` textarea, and `Alert`'s title and description (which
toasts and `RealtimeNotification` reuse) — take **`dir="auto"`**, not `rtl`. The browser reads the first
strong character and lays the run out in that direction. That is what keeps a turn that is mostly Persian
but opens with `XAUUSD` reading correctly, and it is what stops a mostly-English turn in the Persian
interface from being mirrored into nonsense. The suite forbids a literal `dir="ltr"` or `dir="rtl"` in any
component, so `auto` is not a convention that can be quietly abandoned.

Numbers, prices and symbols were already protected by `.num` (`direction: ltr; unicode-bidi: isolate;
tabular-nums`) and by the charts pinning `direction: 'ltr'` in their frames; this phase leaves both intact
and asserts they are still there, because an RTL sweep is exactly the kind of change that would try to
mirror a figure.

## Five Persian NLP repositories, evaluated

The brief named five projects and asked for them to be evaluated **before** any new rule was written, on the
principle that a proven capability should be reused rather than rebuilt. The evaluation is per-concern rather
than per-project, because the five overlap each other heavily and none of them is one thing.

### Two facts decide most of it

**All five are Python packages, and this repository contains no Python at all.** There is no Python runtime,
no service beside the app, and no place in the build for one: the web bundle ships a 60 kB font and a
React tree, and the backend is TypeScript. A dependency here is a second runtime, a model download and a
process to supervise — for the frontend history, a decision about architecture rather than about Persian.

**And the pipeline's contract is deterministic and cited.** Every suggestion is either a mechanical rule
whose exact replacement is printed, or a pattern a person decides about; there is no score, no probability
and no model anywhere in the type. That is not a preference about style — it is what `LanguageMemory`
requires, because an entry that is `trusted` has to be answerable with the characters it replaced. A model's
suggestion cannot be a trusted entry, which is the test DadmaTools already failed in 7.5.1 and 7.5.2.3, and
it is the same test applied again here.

### What each one actually is

| Repository                                  | What it is                                                                                                                                                                                                                                                 | Licence    | What overlaps this layer                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| **DadmaTools**                              | Python 3.10–3.12 NLP pipeline on spaCy/Transformers/PyTorch: NER, POS, dependency and constituency parsing, chunking, lemma, tokenizer, normalizer, spellchecker, informal→formal, sentiment                                                               | Apache-2.0 | its `Normalizer` (`unify_chars`, `refine_punc_spacing`) and its `itf`/`spellchecker` stages |
| **Hazm**                                    | Python 3.12+ toolkit: normalization (diacritics, ZWNJ), tokenization, stemming, lemmatization, POS/chunk/dependency parsing, embeddings — models fetched from Hugging Face on demand                                                                       | MIT        | its `Normalizer`, and nothing else: it ships **no** spell checker and **no** formalizer     |
| **Parsivar**                                | Python preprocessing toolkit (NLTK-based; wapiti/Stanford tagger optional): normalization, half-space correction, tokenizer, stemmer, POS, chunker, dependency parser, spell checker                                                                       | MIT        | the largest overlap, and the only project with a **rule-based** half-space table            |
| **Persian-text-preprocessing**              | a Python package that _composes_ the two above (pinned `hazm==0.9.4`, `parsivar==0.2.3.1`, `nltk==3.9.1`) into normalize/spell/formal/stopword/lemma/stem pipelines, plus an optional Transformer formalizer (`PardisSzah/PersianTextFormalizer` on torch) | MIT        | nothing of its own beyond the composition                                                   |
| **Persian-Spell-Correction-using-ParsBERT** | a masked-language-model spell corrector over ParsBERT (transformers + torch)                                                                                                                                                                               | **none**   | a statistical spellchecker                                                                  |

The licence column is checked rather than assumed, and one of them changes a decision on its own:
DadmaTools is Apache-2.0, Hazm and Parsivar ship the MIT text, Persian-text-preprocessing declares MIT — and
the ParsBERT spell corrector has **no licence file at all**, so it is not adoptable whatever else were true
of it.

### By concern, which is the question the brief actually asks

| The concern                     | What already answers it here                                                                                                             | Verdict                                                                                                                                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Grammar and wording             | `grammar.ts`, seven rules each with a citation                                                                                           | **nothing to add.** Every project's grammar capability is a trained parser, and a parse is a probability                                                                                                                       |
| Spelling correction             | eight reviewed compound pairs and a closed register list                                                                                 | **rejected from all five.** Four are statistical (DadmaTools' `spellchecker`, ParsBERT, Parsivar's `SpellCheck`, the Transformer spell pipeline) and one has no licence                                                        |
| Punctuation and its spacing     | 7.5.2.1's four spacing rules and two punctuation rules: no space before a mark, exactly one after, `, ; ?`→`، ؛ ؟`, `%` after its figure | **no addition.** DadmaTools' `refine_punc_spacing` and Hazm's normalizer do the same things, not more                                                                                                                          |
| ZWNJ and the half-space         | hygiene automated, placement reported — with this product's own affix inventory                                                          | **one real gap, measured and closed.** See below                                                                                                                                                                               |
| Informal Persian, formalization | `spelling.register`, nine forms, report-only                                                                                             | **rejected.** DadmaTools' `itf` and Persian-text-preprocessing's `formal` are both Transformer models, so neither ships a rule table to adopt; a model that rewrites a person's own words is also a different product decision |
| Contextual correction           | `detect.ts` reads the message, `profile.ts` the person, `communication.ts` the interaction                                               | **out of scope for all five.** "Contextual" there means a model's context window, which is the thing this layer is built not to be                                                                                             |

### The one thing adopted: the plural's clitic inventory

`zwnj.attach-candidate` reports a space where a half-space belongs, and its inventory was this product's own:
the verbal prefixes `می`/`نمی` and the endings `ها`, `های`, `تر`, `ترین`. Measured rather than assumed, that
inventory **missed the plural's clitic forms entirely** — the alternation is followed by a “next character is
not a letter” guard, so `کتاب هایی`, `کتاب هایم` and `پرسش هایشان` were reported by nothing at all. These are
among the commonest half-space misses in Persian typing, so it was a real gap rather than a theoretical one.

Parsivar's rule-based half-space pass publishes exactly this as a closed table
(`normalizer.space_correction`, the `a0`–`a3` patterns). That is a proven capability in the sense the brief
means: a cited, deterministic affix inventory, MIT-licensed, needing no runtime — **knowledge that can be
reused without reusing the package.** Seven of its entries were adopted as a new rule,
`zwnj.clitic-candidate`, with its own seed key `rule.zwnj-clitics` and `confidence: 0.8`.

A second ZWNJ key rather than a wider first one, because what differs is _provenance_ and that is what a key
is for: `rule.zwnj-placement` is this product writing down its own inventory, and `rule.zwnj-clitics` adopts
one published elsewhere. Two decisions with two sources belong on two keys, so the adopted one can be retired
without touching the product's own. `ها` and `های` are deliberately **not** in the new list —
`zwnj.attach-candidate` already reports those two, and a second rule reporting one span would make one
mistake read as two.

### Why the rest of that table is not adopted, entry by entry

This is the half the brief's “do not add all repositories blindly” is really about, and each rejection is a
concrete case rather than a principle:

- **`بی`** (their prefix group, beside `می`/`نمی`) — `بی` is also a preposition governing a whole phrase, so
  `بی هیچ شک` would be reported as a misspelling. Verified: the rule does not carry `بی`, and that sentence
  reports nothing.
- **`شده` / `نشده`** — both are verbs as well as suffixes; `او بزرگ شده است` would be reported. Verified: not
  reported.
- **the copulas `بودم … بودند`, `ست`, and `اند`** — verbs, and a space in front of them is ordinary syntax.
- **`ای`** — a word (the vocative), so `ای دوست` would be reported.
- **`ان`, `ین`, `انی`, `بان`, `ام`, `ات`, `یم`, `ید`, `اید`** — attached pronouns and plural endings that are
  normally written closed anyway, so the recall gain is small while each collides with something real.
- **the derivational heads (`گذار`, `کننده`, `شناسی`, `ساز`, …)** — several of them are words in their own
  right (`کننده` is “the one who does”), and a rule that reported them would be noisy in exactly the copy
  this product writes.

Seven forms adopted and the rest of the table considered and accounted for one group at a time — which is what
“evaluate before adding” produced here, and it is recorded so the next reader does not have to re-derive it.

### Why the four packages are not dependencies, beyond being Python

- **Hazm's normalizer** is covered by 7.5.2.1 — the same folds, the same spacing, and a ZWNJ pass in the same
  class as `fixHalfSpace`, already rejected on provenance in 7.5.1. Its parser, embedder and lemmatizer have
  no caller: a language-_quality_ layer does not need a parse, and the pipeline has nowhere to put a score.
- **Persian-text-preprocessing** is the composition of the two above plus a Transformer. It is the worst ratio
  of dependency to capability in the list, and a backend concern rather than a frontend one.
- **ParsBERT spell correction** has no licence file, so it is not adoptable even before the question of a
  probability entering a store of citations.
- **DadmaTools** was rejected in 7.5.1 for the frontend and again in 7.5.2.3, and this evaluation changes
  neither answer. Its one adoptable artefact was an inventory, and the inventory has been adopted.

**Deferred, with its trigger, as before:** a real backend that needs Persian NLP for something this layer
cannot do mechanically. Nothing about this evaluation moves that line, and nothing was added to `src/`.

### What separation this touched, and what it did not

The adopted change lives entirely in `web/src/language/`: one rule, one seed entry in the **language**
namespace (`rule.zwnj-clitics` — not an `mem_*` Agent Memory id, not a secret, not interface copy), and one
regression case. No catalogue gained a key, no i18n module changed, and the suite that asserts the three
lifetimes are one-way streets still passes unchanged.

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

### 7.5.3.4.4: one attribute with two writers, and thirteen invisible ones

1. **`dir` had two writers**, and the stale one won. `index.html` shipped `<html dir="ltr">` while
   `App.tsx` set `document.documentElement.dir` from the UI store — whose default was `'ltr'` — on every
   render. So the attribute was written twice, from two different sources, and the store's `'ltr'` default
   meant **choosing Persian mirrored nothing at all**: the toggle flipped a value that no longer decided
   anything and the interface stayed as it was. The fix is the phase's shape: one writer, deriving the value
   from the resolved locale, with the suite pinning that no second file may contain the assignment.
2. **The Topbar's tooltip was a physical string in a component.** `'Switch to right-to-left layout'` was
   typed into the JSX rather than held in a catalogue, so it could not be translated and it named a
   direction rather than the state it would produce. It is now two keys
   (`topbar.switchToLeftToRightLayout` / `topbar.switchToRightToLeftLayout`) in both catalogues — a control
   that is only reachable in English is a control the Persian interface does not have.
3. **Thirteen physical spacing utilities were still reachable**, and nothing had ever noticed because
   nothing had ever actually mirrored. `pl-5` is correct in an LTR layout and wrong the moment the interface
   turns over; the same is true of three `text-right` and one `text-left`. They are now logical, and the
   suite scans every `.ts`/`.tsx` file under `web/src` for the physical half of each utility so the next one
   fails at the gate instead of at the mirror.

The lesson is the file's recurring one, in a new place: a rule that says "direction is one thing" and a code
path that writes it twice is a rule that is silently false. Two of the three defects were only visible by
actually mirroring the interface, which is why the phase asks for the visual inspection.

**Found by that inspection and deliberately not fixed here.** The mirror is correct, and what the mirrored
screens show is a _copy_ defect that 7.5.3.4.4 must not repair: two components still hold English sentences
in their own source while the Persian catalogue already has the translation. `JournalPage.tsx` renders a
literal `Add trade` where `journalPage.addTrade` exists (`افزودن معامله`), and `PortfolioPage.tsx` builds a
description from a template literal holding two English sentences. The second one is only visible _because_
the interface is now mirrored: an English sentence inside a Persian paragraph takes the paragraph's
direction, so its final full stop paints at the start of the line. That is a consequence of untranslated
copy rather than of the direction, and the fix is the migration the i18n layer owns \u2014 inventing Persian
wording for a sentence about somebody's holdings is a reviewed decision, not a side effect of a layout phase.
The gap is worth naming for the i18n suite rather than for this one: that suite forbids a Persian character
outside the catalogue, and an English sentence outside it passes. (`TradeRow`'s menu button belongs to the
same family: it is labelled `Actions for TR-041` in English on a Persian screen, which is why the browser
case added for the row menu finds that button by its position in the row rather than by its name.)

**Found in the same region, and deliberately not fixed with it.** Radix's `Tabs.Root` resolves a writing
direction for itself — from `dir`, from a `DirectionProvider`, or from `'ltr'` — and stamps it on its own
element. Left unset it stamps `dir="ltr"` on _every_ tab panel of _every_ page, and because a `dir`
attribute starts a new bidi paragraph, the panel is laid out left-to-right inside a mirrored document: the
journal's trade history kept its columns unmirrored, its `text-start` cells on the left and its row actions
on the right while the page around it turned over. Passing the resolved direction to `Tabs` repairs it —
measured, the panel's `dir` goes from `ltr` to `rtl` and the table's first cell moves from the left edge to
the right — and it is held back for one reason: it is not free. Turning those panels around puts five
signed figures back under the bidi algorithm in an un-isolated form — three on the journal's overview
(`JournalStatCard`'s comparison line, `+4.2 units against …`, painted with its sign _after_ the digits) and
two on the second examinations tab — which is what §16 of `docs/frontend-foundation.md` forbids and what
the browser suite already checks for on every page. The panel's own `dir="ltr"` had been hiding them.
Isolating a figure inside a translated sentence is a copy change, in both catalogues, so it belongs with the
migration above rather than in a layout fix.

### 7.5.3.4.1: two defects, both of them a chain that had one more link than expected

1. **The guidance would have described an inferred decision as no decision at all.** `responseGuidance` turns
   the reply's `source` into one of its closed clauses, and the chain it read was exhaustive over the four
   sources that existed in 7.5.3.1 — so `observed`, once the resolver could return it, fell through to
   `default-language`, whose sentence is _"Nothing was read and nothing was chosen, so the product answers in
   its own language."_ A response stage handed a Persian decision would have been told, in the same value, that
   no decision had been made. Caught by walking the chain rather than by running it: it is a wrong string, not a
   wrong behaviour, and only a reader would have seen it. `observed-language` is now a member of
   `GUIDANCE_CLAUSES`, and the branch is written as an exhaustive chain so the next source added to
   the list fails loudly instead of quietly reusing that sentence.
2. **`learnedLanguage` read a store that a first run does not have.** The first draft took
   `CommunicationObservations` and indexed it, which is fine for a caller that has one and a crash for the
   caller that has nothing learned yet — the state every new installation is in. The parameter is `| null`, the
   function returns `null` for it, and `storedResponseOptions` distinguishes "no history" from "a history that
   is empty" so a caller can record this turn against the right one.

Both were found before the commit, by reading the new code against the callers it would have, and both are
now cases in `tests/response-language.test.ts`.

### 7.5.3.4.3: two things the shape refused, and both were right to

1. **The feedback vocabulary named a value the resolution cannot hold.** `too-formal` mapped to
   `conversational`, which is a _tone_ — a value the guidance derives from a register — rather than a
   register, and the register vocabulary is `formal`, `informal`, `neutral`. A verdict that mapped to it would
   have been recorded, never consulted, and permanently invisible: the entry looks well-formed, the resolution
   silently ignores it, and the person's feedback has no effect at all. Caught by a case that walks the whole
   verdict list and requires each mapped value to be one the dimension's own vocabulary contains, which is a
   check worth keeping for exactly this reason — it is the only one that does not need to guess what a future
   verdict would have been.
2. **The write path had an eviction branch that could not run.** `recordCorrection` dropped the oldest entry
   when the store reached `MAX_CORRECTIONS`, which is dead code by construction: appending only happens for a
   value no entry holds, a repeat confirms instead, and every vocabulary together holds eight values. It was
   removed rather than documented as defensive — the same call 7.5.3.2 made about the terminology counts — and
   the bound now lives where it is reachable, in the _reader_, which is the side that meets a value this build
   did not write.

### 7.5.3.4.2: four defects, three of them a decision written down twice

1. **7.5.3.2's own suite asserted the rule this phase reverses.** Two cases in `tests/language-context.test.ts`
   required `detected` to win over `observed` — a correct assertion about the old rule and a failing one about
   the new. They were rewritten to hold the new order and to name both sides of the disagreement, because the
   ordering of two sources is a decision that lives in the resolver _and_ in whatever asserts it, and a phase
   that changes one has to change both.
2. **`withResponseLanguage` had room for one directive and there were two.** The 7.5.3.4.1 helper took a
   language, so a style had nowhere to go. It is `withResponseDirectives(instructions, { … })` now, and the
   order it renders in — language first, style second — is a decision rather than a detail: `fa-formal` names
   a register of a language that has to be stated before it is used.
3. **`PREFERENCE_SOURCES` said "strongest first" and listed the old order.** After the reversal that comment
   was the only place left claiming the reading outranked a habit. The list is in consulted order now, so a
   reader does not have to open the resolver to learn which of two sources wins.
4. **Two vocabularies were about to be written twice.** `CONTEXT_DEPTHS` and `TERMINOLOGY_STYLES` were
   literals in the layer while the contract held the same values for the same dimensions — the reading of how
   much detail a turn wants and the instruction of how much to give. They are the contract's own lists now,
   and the suite asserts identity rather than equality so a copy cannot pass for one.

### 7.5.3.3: the migration believing it knew better, seven times

Six of the seven defects this phase found were the codemod's fault rather than the wording's, and they are
worth recording because four of them are the same mistake: a pass that rewrites source code has to be able
to say _why_ a string is copy, and where it could not, it guessed.

1. **The first pass was a regex and it corrupted seventy-one files**, reaching into template literals. It was
   caught by reading the diff, reverted, and replaced with a pass over the TypeScript AST — which cannot
   rewrite a node it has not classified. This is the same lesson 7.5.2.3 learned about a rule whose data had
   lost an invisible character: a broad pattern does not fail, it acts.
2. **A getter cannot be named by a quoted string.** `{ 'not-available': … }` became `get not-available()`,
   which is a syntax error; a record keyed by a discriminant needs `get ['not-available']()`. The key is data
   and only the value is wording.
3. **`msg` was assumed to be imported.** A file that imported `liveLabels` from the catalogue and not `msg`
   was left without it, because the guard asked whether the file imported _from the module_ rather than
   whether it imported the symbol.
4. **An SVG path reached the Persian catalogue.** `M32 0H0V32` has a capital letter and a space, which was
   all the sentence test asked for; a rule requiring a lower-case letter somewhere rules out a path, a
   constant and a record reference at once.
5. **The browser driver navigated by a landmark's English name**, so it stopped being able to open Settings
   the moment the switch worked — the phase's own success broke the test that measured it. It finds the
   navigation by shape now, and the shell's cases read the name from the catalogue.
6. **`localStorage` belongs to an origin.** The browser case wrote the stored choice into a document that had
   not loaded the application yet, which is a `SecurityError` rather than a preference.
7. **Seven test files asserted on English sentences that had moved into the catalogue.** They read through
   `tests/helpers/source-copy.ts`, which resolves the keys a file mentions into the English it renders, so
   each one still asserts what the surface _says_ rather than which id it says it with.

### 7.5.3.2: six defects, and the pattern in them

Running the new readings on a corpus of real turns turned up six things, and four of them are the same kind
of mistake: a count that was right about the tokens and wrong about the language.

1. **An English message's own vocabulary was invisible.** `termsIn` matched a term's Persian forms only, so
   `Should I move my stop-loss to break-even?` read as _general_ wording and an _unclear_ setting — the
   exact case the phase's "English + technical" example is built on. The English side of a term is this
   product's vocabulary just as much as the Persian side is (the lexicon calls that field "the English the
   product already shows"), so it is matched too, case-insensitively.
2. **The mixed-script reader counted tokens instead of phrases.** `قیمت XAUUSD ... Risk/reward is 2.6.` came
   out as `stray` — a word or two — because two of the three Latin words in the clause are our vocabulary
   and only `is` was left over. A whole English clause was being read as a stray word. The reader now takes
   _runs_ of Latin and asks how long the run containing a non-vocabulary word is; `is` is what makes
   `Risk/reward is` a clause, and the reading now says so.
3. **One instruction counted as two, and turned into none.** The closed list contains both `رسمی` and
   `رسمی بنویس`, and the rule that a message asking two contradictory things gets neither meant
   `این را رسمی بنویس` — one clear request — resolved to _no_ request. Requests are now collected as
   **values** rather than as matches, so two entries that ask for the same style are one request.
4. **A duplicated signal let a greeting outvote the subject.** `hey` is both a greeting and an informal
   English marker, so a casual work question counted two conversational signals against one work signal and
   read as small talk. Signals are de-duplicated, the tie is broken by the subject matter rather than by
   phrasing, and the two English cases now read as work.
5. **A request for a term was read as a request for a language.** `این را با معادل فارسی بگو` asks for the
   Persian _word_ for something, and 7.5.3.1's `فارسی بگو` pattern read it as "answer me in Persian" — a
   language request that was never made, against a setting the person did choose. The distinction is the
   words `معادل`, `واژه`, `کلمه` and `برابر`, so it is checked as those words, from both directions.
6. **A Persian imperative at the end of a sentence was not seen at all.** `حد ضرر را ... ببند.` was a
   _statement_, because the clause-final verb list only had four verbs. It is now a closed list of the
   imperatives this product's own vocabulary takes — `بگذار`, `ببند`, `بفرست`, `بخر`, `بفروش`, `بزن`,
   `بساز` — checked as whole final words, so `بازار` is not the imperative `باز`.

A seventh defect was found by reading the resolver rather than by running it: **the learned store had a
terminology dimension that nothing ever wrote.** The counts were consulted and never recorded, so that
branch could not fire. It was removed rather than wired up, and the reasoning is the interesting part —
register and detail are the dimensions where a standing style is worth knowing _and_ the current turn can be
silent about it, while terminology is decided by the script mixing in the message in front of you. A
counter for it would have been a third, weaker opinion with no gap to fill.

### 7.5.3.1: two defects in the reading, and one in the check on it

1. **The mixed-confidence formula was inverted relative to what it claimed.** It multiplied the
   dominant-share confidence by a balance bonus, which sounds like it rewards balance and in practice did
   not: the Persian-heavy mixed message scored **0.554** and the English-heavy one **0.566**, so the more
   evenly divided message was the less confident one. The bonus was a factor on top of a number that
   already measured the wrong thing. It is now the balance itself — `2 · min(P, L) / (P + L)` — times the
   evidence factor, which reads as one sentence and gives 0.65 and 0.55 for the same two messages. The
   regression is the comparison, not the numbers: the more balanced mix scores higher.
2. **`styleOf` read the last character and nothing else, so two common Persian shapes were misfiled.**
   `قیمت رو دیدی؟ الان چیکار کنم` asked a question and was called a statement, because the question mark
   was not final. Worse, an instruction in Persian closes with its **verb** — `این معامله را خلاصه کن`
   opens with a noun and was therefore not an instruction at all, in a product whose agent is asked for
   things in exactly that shape. A question mark is now looked for anywhere in the turn (a chat message is
   not a paragraph), and the clause-final imperatives `کن`, `کنید`, `بکن`, `بگیر` are in the request
   vocabulary with a comment saying what closes a Persian instruction.
3. **The guard on the profile's field names had a false positive.** It tested field names against a
   substring pattern containing `age`, which matches `language` — so the check as written forbade the
   profile from having a field for the language it detects. The fix matters more than the bug: field names
   are now compared **segment by segment** (`nativeLanguage` → `native`, `language`), so a genuinely
   personal field still fails while `language`, `coverage` and `usage` do not. A check with false
   positives is a check that gets weakened the first time it fires.

### 7.5.2.3: six defects that running it on real Persian found

Writing the pipeline and then running it turned up six things that reading the source would not have, and
they are recorded because three of them are the same mistake wearing different clothes.

1. **A compound rule ignored protected spans.** `replacePair` replaced every whole-word match without
   asking whether the span was one a rule must not write. The `exception` mechanism therefore _worked_ and
   then had no effect: `approveForm` recorded the decision, `protectedLiterals` returned it, and the
   spelling rule rewrote the approved form anyway. The suite's "protects a span a rule must not touch"
   case caught it; the guard now lives in the one function every compound pair goes through.
2. **Two compound pairs were silent no-ops, and the register column was a misspelling.** `هیچکس` and
   `آنها` were stored with the _same_ string on both sides — the half-space had been lost when the file
   was written, so the "correction" was identical to the form it was meant to correct. The register
   table's written column had lost the same character, so the product's own suggestion for `میشه` was
   itself misspelled. Every half-space-bearing form in the two new modules is now written as `${ZWNJ}` or
   derived from the catalogue, and the suite asserts that no rule offers a correction equal to the form it
   is correcting.
3. **The numeral rule could never fire.** It asked whether the _numeral's_ offset was inside a protected
   span, and the numeral is exactly what `findSpans` marks as `numeric` — so the rule that exists to catch
   `۳ معاملات` skipped every case of it. It now asks about the noun, which is the thing the rule is
   actually about.
4. **The object-marker rule could only see the end of the text**, not the end of a line, because a `$`
   without the `m` flag matches once. A rule about clause-final verbs that only inspected the last line of
   a paragraph was a rule that mostly did nothing.
5. **The ezafe rule glued the conjunction `و`.** `و` is one letter that happens to be a vowel, so `و ی`
   became `وی`. A preceding word of one letter is now excluded, and the case is in the suite.
6. **Phase 7.5.2.1's findings were being dropped.** The pipeline mapped the normalization stage's
   _changes_ and not its _findings_, so the missing-half-space report — the one thing that layer
   deliberately refuses to fix — was invisible to a caller holding only `languageQa`. Found by printing a
   realistic paragraph and reading it, which is why the phase asks for that step.

Three of the six are one lesson: Persian's invisible characters do not survive being retyped, and a rule
whose data lost one is a rule that silently does nothing rather than one that fails loudly.

## Verification

The contract suite is `tests/persian-language.test.ts` — 46 tests over the store's separation and its
update path, the locale's agreement with CLDR, normalization idempotence, bidi isolation, the sealed
font, and the English formatters producing exactly what they produced.

Phase 7.5.2.2 adds `tests/persian-terminology.test.ts` — 28 tests over the lexicon's agreement with the
store, lookup in both languages, the consistency check, the candidate path in nine kinds of bad shape,
and a snapshot round trip.

Phase 7.5.2.3 adds `tests/persian-qa.test.ts` — 32 tests. Its first case refuses to pass if a rule in
either new catalogue has no regression case of its own, its second refuses a case for a rule that is not
there, and its third puts every case through the 7.5.2.1 normalizer and requires it to come out
unchanged, which is what makes the readable Persian in the suite safe to write as characters. Beyond
that: one case per rule family, the mixed Persian + English paragraph, the stage chain and the
one-engine check that the grammar stage _is_ `runRules` over the grammar catalogue, the
correction-replay reconstruction, determinism and idempotence, the English corpus, the pending →
promote → runs path, the deprecate → stops path, `approveForm` and its refusal, the agent-proposal
parking path, and a snapshot round trip that keeps all three decisions.

Phase 7.5.3.3 adds `tests/ui-language.test.ts` — 22 tests over the interface layer. Which languages exist
and how a stored preference becomes one; that the Persian catalogue is complete and that English did not
change by a byte; the nine values that are the same in both catalogues, named rather than thresholded; the
fallback chain (`locale → English → the key itself`) and interpolation with an unknown placeholder left as
written; the subscription that makes a switch repaint the application, read through a label map because a
map is read while rendering; the two vocabularies kept apart, asserted by import in both directions and by
failing if any file imports `memo`; and the switch's own wording, which has to survive its own effect.

Phase 7.5.3.4.1 adds `tests/response-language.test.ts` — 22 tests over the answer's language rather than
over a reading. The decision: Persian → Persian and English → English with the source named, the larger
script of a mix in both directions plus a message with no letters in it, the request outranking the setting
_and_ the habit, the setting outranking a habit it accumulated while it was set, the habit outranking one
message and recording that it did, and the two cases where there is no habit at all (too few samples, and a
split). The precedence list asserted as a list; the control's own field names asserted against a closed set;
determinism; and the two vocabularies — the language layer's and the shared contract's — asserted equal so
neither layer can gain a language the other has not heard of. The store: the language counts counted,
persisted, merged, decayed, and read back from a value written before the dimension existed. The
application: the directive in the system message and never in the user turn, the prompt byte-identical with
no language resolved, a message asking for a language in its own text changing nothing, the directive
reaching both the synchronous adapter's instructions and the real provider request, a refusal whose words
are unaffected, and the route echoing the language back while refusing one it does not know.

Phase 7.5.3.4.2 adds `tests/adaptive-style.test.ts` — 12 tests over the style of an answer. The resolution:
an explicit instruction over a learned preference _and_ over the message, a learned preference over the
reading of the message with the disagreement named in the reason, the reading where nothing has been
learned, the default where nothing says anything, the five dimensions each drawn from a closed list with
the layer's names asserted to be the shared contract's **own** lists, and the projection that carries the
decision across the boundary. The application, and the requirement the phase is really about: the **same
factual answer presented under two styles** — the instructions, the operating rules, the output contract and
the question itself byte-identical, while the wording notes differ and the difference is exactly the style
block; the blocks reaching both the synchronous instructions and the real provider request with the
statements, epistemic labels and tool executions unchanged; a refusal that keeps its words whatever style
was sent; every note in the catalogue proved to carry no digit and no placeholder; and five ways a client
could try to author wording — a value outside a vocabulary, an unknown note id, a note list that is not a
list, a key that is not part of a style, a list longer than the catalogue — each refused with a 400.

Phase 7.5.3.4.3 adds `tests/language-learning.test.ts` — 24 tests, organised around the seven behaviours the
phase names. The explicit correction: recorded with its source, its surface and a computed confidence, read at
once, and outranking the reading of the message; and the case where the setting and a statement disagree, in
both directions. The learned preference: the counts still decide when nothing has been stated, which is what
this phase must not break, and a statement outranks a nine-turn habit. The repeated preference: one verdict is
recorded and _not_ read, the third crosses the bar, and saying the same thing twice is one statement made
twice rather than two entries. The conflicting preferences: both statements kept, the newer consulted, the
reversal named in the reason, a weaker newer verdict unable to overturn a stronger older statement, and two
verdicts that cancel out learning nothing. Persistence: a round trip that produces the same control after a
reload, five unreadable values degrading to "nothing stated", entries from a build this one cannot understand
dropped while the rest are kept, the reader's cap, and forgetting. Rejection: nine malformed statements refused
with the store untouched, a terminology statement referred to the reviewed path from every surface, and the
stored shape compared against its closed field list — no field reads like a message, a person or a credential.
Reuse: the correction reaching the answer through the same control the response stage already reads, the
language directive before the style block, the invariants travelling with them, and every verdict in the closed
feedback list mapping to a value its dimension actually holds.

Phase 7.5.3.4.4 adds `tests/rtl-layout.test.ts` — 15 tests over the layout rather than over the language. The
direction: `auto` following the locale both ways, the two pins overriding it, an unknown stored value
degrading to `auto`, and the single-writer assertion that exactly one file under `web/src` may contain
`documentElement.dir =` or `documentElement.lang =`. The split between flow and geometry: a scan of every
`.ts`/`.tsx` file for the physical half of each spacing, alignment and border utility with a named
allow-list, the three meaning-bearing glyph families asserted **absent** from the directional set, and the
chart and figure frames asserted to still pin `direction: 'ltr'`. The glyphs: the three named components
asserted from both directions at once, no raw `Chevron(Left|Right)`/`Panel(Left|Right)` left at any call
site, and a global scan proving none survives outside `Directional.tsx`. The free text: `dir="auto"` on all
three surfaces, no literal `dir="ltr"`/`dir="rtl"` anywhere in `web/src`, and `.num` plus the `:lang(fa)`
rule asserted intact. The document-direction case in `tests/frontend-integration.test.ts` was rewritten for
the same reason and now asserts the write lives in the language module, that `App.tsx` no longer contains it,
and that the Topbar reads `useTextDirection()`.

The browser suite's `the writing direction, in a browser` section is where all of this is measured with
Persian actually on the page, because a mirror is a statement about a layout engine rather than about a
stylesheet. Selecting Persian moves the rail to the other edge and puts the heading against the other one,
while the heading stays aligned `start`; the rails, the heading and the selected navigation entry are read
from their painted boxes rather than from the stylesheet. Every page and every tab panel then holds its
shape when mirrored at **1440 px, 768 px and 390 px** — no overflow, no clipping, and no panel missed
(`panelsOpened` is asserted, so a walk that found no tabs cannot pass as coverage). Turning the same words
around without changing the language is proved to resize **nothing**: every box in the tree is read in both
directions and required to match within half a pixel. Each signed figure on every page and tab still paints
its sign first. And the transcript holds both directions at once in one column: a Latin turn and a Persian
turn in the same conversation each resolve from their own first strong character, while the notice above them
resolves with the interface.

Phase 7.5.2.2's `tests/persian-terminology.test.ts` gained one case for the same reason: the sidebar's
Persian label has to _be_ the glossary's preferred form for that concept, not a second translation of it.

Phase 7.5.3.2 adds `tests/language-context.test.ts` — 22 tests over the interaction rather than over a
single message. The context: the register reading asserted to be 7.5.3.1's own, work against small talk
with the tie-break named, the wording gradation including the short question that reads as technical by
density, the explicit request for more or less detail and the message that asks both ways, `discussion`
against the three shapes it extends, and the four mixing readings with the healthy case and the stray word
told apart. The preferences: the priority order asserted in both directions, the learned store walked leaf
by leaf to prove every leaf is a number, the window and the minimum, the tie that stays a tie, a store that
round-trips and a store that throws, and the in-message request passing over a stored choice. The guidance:
the four cases the phase names, the closed field list, the seven invariants, no digit in any string, a
token that cannot leak into it, two messages whose facts differ producing identical guidance, and a
completeness case that requires every note in the catalogue to be reachable.

Phase 7.5.3.1 adds `tests/language-detection.test.ts` — 24 tests over the reading rather than over the
knowledge. Detection: Persian, English, the two mixed messages, the technical sentence, the spoken and the
written register, the three styles and the band that is neither, Finglish including the two cases where
the honest answer is `en`, the five explicit language requests and the one message _about_ a language that
must not be read as one, and the four inputs that have no language at all. The profile: its closed field
list, its version, the precedence rule asserted on its own, the larger-half rule for a mix, determinism,
a JSON round trip, and the seam that reads the stored choice. The preference: its namespaced key (asserted
not to be in the knowledge store's namespace), three values with labels, anything unreadable degrading to
`auto`, a real round trip through a store, and a store that throws on read and on write. The switch: the
interface store adopting what was stored at creation, writing every later choice, and reporting an
unwritable choice as unwritable.

Phase 7.5.2.1 adds `tests/persian-normalization.test.ts` — 26 tests whose first case refuses to pass if a
rule in the catalogue has no regression case of its own. That guard is why the repository evaluation later in
this file could not add a twentieth rule quietly: `zwnj.clitic-candidate` arrived with its case in that table
and its key in the seeded store, and the same test would have failed without either. Beyond the per-rule cases: a corpus of English,
symbols, URLs, paths, identifiers and figures comes out byte-identical with an empty change list; the
whole corpus is normalized twice and asserted idempotent and deterministic; the four governance paths
above are exercised end to end; and the RTL-safety test keeps an isolated signed figure sign-first and
asserts the pipeline never writes a bidi control of its own.

The browser suite's `the Persian language foundation, in a browser` section adds two measurements it
could not make in source: **zero** requests for the Persian face before a Persian element exists and a
real, glyph-covering fetch the moment one does; and a signed figure painted sign-first inside a
right-to-left paragraph, which is the `.num` isolation rule doing its job with Persian actually on the
page.

The browser suite's `the language switch, in a browser` section adds the two things a source assertion
cannot make: that choosing Persian **survives a reload** of the running application while the document
stays English, and that all three options fit 375 px without panning the page.

The four Persian suites are **132 tests** together: 46 for the store and the locale, 26 for the
correction pipeline, 28 for the lexicon, and 32 for grammar, spelling and the QA pipeline. The language
analysis adds 104 more across five suites: 24 in `tests/language-detection.test.ts` for the reading of a
message and the switch, 22 in `tests/language-context.test.ts` for the interaction, the preferences and
the guidance, 22 in `tests/response-language.test.ts` for the language of the answer, its four signals
and the prompt they reach, 12 in `tests/adaptive-style.test.ts` for how the answer is worded once the
language is settled, and 24 in `tests/language-learning.test.ts` for what a person says outright, the
confidence that decides whether it is read, and the two paths that refuse to learn from it. The layout adds
15 more in `tests/rtl-layout.test.ts`, for the direction derived from the language, the glyphs that read it
and the free text that does not.

```bash
npm run fonts:vendor      # re-derive web/public/fonts from the declared dependency
npm run fonts:check       # re-hash what is vendored, write nothing
npx vitest run tests/persian-language.test.ts        # 7.5.1: the store, the locale, the font
npx vitest run tests/persian-normalization.test.ts   # 7.5.2.1: the correction pipeline
npx vitest run tests/persian-terminology.test.ts     # 7.5.2.2: the lexicon
npx vitest run tests/persian-qa.test.ts              # 7.5.2.3: grammar, spelling, the pipeline
npx vitest run tests/language-detection.test.ts      # 7.5.3.1: the reading, the profile, the switch
npx vitest run tests/language-context.test.ts        # 7.5.3.2: the context, the preferences, the guidance
npx vitest run tests/response-language.test.ts       # 7.5.3.4.1: the answer's language, and the prompt
npx vitest run tests/adaptive-style.test.ts          # 7.5.3.4.2: how the answer is worded
npx vitest run tests/language-learning.test.ts       # 7.5.3.4.3: what a person says, and its confidence
npx vitest run tests/rtl-layout.test.ts              # 7.5.3.4.4: the direction, the glyphs, the free text
npm run test:e2e          # the browser suite, including the measurements above
npm run validate          # the full gate
```
