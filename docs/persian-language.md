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
spacing rules, four ZWNJ rules, two punctuation rules, and two that only report.

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

Phase 7.5.2.1 adds `tests/persian-normalization.test.ts` — 26 tests whose first case refuses to pass if a
rule in the catalogue has no regression case of its own. Beyond the per-rule cases: a corpus of English,
symbols, URLs, paths, identifiers and figures comes out byte-identical with an empty change list; the
whole corpus is normalized twice and asserted idempotent and deterministic; the four governance paths
above are exercised end to end; and the RTL-safety test keeps an isolated signed figure sign-first and
asserts the pipeline never writes a bidi control of its own.

The browser suite's `the Persian language foundation, in a browser` section adds two measurements it
could not make in source: **zero** requests for the Persian face before a Persian element exists and a
real, glyph-covering fetch the moment one does; and a signed figure painted sign-first inside a
right-to-left paragraph, which is the `.num` isolation rule doing its job with Persian actually on the
page.

The four Persian suites are **132 tests** together: 46 for the store and the locale, 26 for the
correction pipeline, 28 for the lexicon, and 32 for grammar, spelling and the QA pipeline.

```bash
npm run fonts:vendor      # re-derive web/public/fonts from the declared dependency
npm run fonts:check       # re-hash what is vendored, write nothing
npx vitest run tests/persian-language.test.ts        # 7.5.1: the store, the locale, the font
npx vitest run tests/persian-normalization.test.ts   # 7.5.2.1: the correction pipeline
npx vitest run tests/persian-terminology.test.ts     # 7.5.2.2: the lexicon
npx vitest run tests/persian-qa.test.ts              # 7.5.2.3: grammar, spelling, the pipeline
npm run test:e2e          # the browser suite, including both measurements above
npm run validate          # the full gate
```
