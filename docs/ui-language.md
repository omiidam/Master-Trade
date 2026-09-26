# The interface language, and why it is not the agent's language

Phase 7.5.3.3 made the visible interface translatable. This file is about the one boundary that phase had to
state before it could write any Persian, and about the mechanism that came out of it. The Persian _record_
— the wording, the terminology and the defects verification found — is `docs/persian-language.md`; the
Phase 7.5.3.3 summary is §24 of `docs/frontend-foundation.md`.

## Two things called "language", and only one control between them

The product has two languages and they are not the same kind of thing.

- **The agent's language knowledge** (`web/src/language/**`, Phases 7.5.1–7.5.3.2) is a _store_: a
  vocabulary with provenance, a reading of each incoming message, a learned histogram of how somebody
  writes, and a permission to respond in one language or the other. It is knowledge, it is scoped to an
  interaction, and it is reviewed.
- **The interface language** (`web/src/i18n/**`, this phase) is _copy_: which words the buttons, headings,
  empty states and errors are printed in. There is nothing to learn and nothing to review — there is one
  choice, made by the person using the application.

What they share is exactly one thing: the setting 7.5.3.1 already persisted (`LANGUAGE_PREFERENCE_KEY`,
values `auto` / `fa` / `en`). The interface layer **reads** that value and never writes it, so there is no
second setting, no second storage key and no second store. `uiLocaleOf` is a pure function of it:

| stored preference | interface language | why                                                                                                                  |
| ----------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `en`              | English            | explicit                                                                                                             |
| `fa`              | Persian            | explicit                                                                                                             |
| `auto`            | English            | a person who has chosen nothing has not asked for a Persian interface, and automatic detection must never decide one |

The suite asserts the boundary in both directions rather than trusting the comment: no module under
`web/src/i18n` may import the language knowledge store (the only permitted import is the _type_ of the
preference), and no module under `web/src/language` may import the interface layer.

## The mechanism, in four files

| file                | what it holds                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `locales.ts`        | the languages that exist, their endonyms, their `<html lang>` tags, and `uiLocaleOf` — the one place the setting becomes a language                                       |
| `messages.en.ts`    | the English catalogue: the source of truth, and the `MessageKey` type derived from it                                                                                     |
| `messages.fa.ts`    | the Persian catalogue, typed `Record<MessageKey, string>`, so a missing translation is a compile error rather than one English sentence in the middle of a Persian screen |
| `translate.ts`      | lookup, `{name}` interpolation, and the fallback chain                                                                                                                    |
| `active.ts`         | the active locale, one store subscription, and the `msg()` every component calls                                                                                          |
| `live.ts`           | label maps whose values are read in the active language every time they are read                                                                                          |
| `useTranslation.ts` | the React-facing pair: the subscription the shell uses, and `t` for a component that needs to be explicit                                                                 |

Three decisions are worth stating because they are what the rest of the code is shaped around.

**Keys, not sentences.** A component holds `msg('usage.tryAgain')`, never `"Try again"`. That is what "no
hardcoded translated strings inside individual components" means mechanically: a component with no English
sentence in it cannot be half-translated. The suite enforces the other direction too — no `.tsx` file
outside `web/src/i18n` may contain a Persian character, so the copy can only live in a catalogue.

**One function, called from module level, with a subscription to keep it honest.** The idiomatic React
answer is a `t` from a hook at the top of each component, and this application has ~90 components that
render copy. So the locale lives in `active.ts`, the store's subscription updates it, and the shell
subscribes to the locale — which is what re-renders the whole tree when the choice changes, because `msg()`
reads a module-level value. The one thing that would break that guarantee is a memoised component, so the
suite fails if any file under `web/src` imports `memo`; a component that needs the guarantee calls
`useTranslation()`.

**A module-level value must not freeze in one language.** `const ALERTS = [{ title: 'Worth knowing' }]` is
evaluated once, at import, and a language switch happens later — so a module-scope property whose value is
copy becomes a **getter** (`get title() { return msg('…'); }`), and an array of copy becomes one getter
that rebuilds the array on each read. Function-scope values are plain `msg()` calls, evaluated per render.
This is the same reasoning `live.ts` documents for the ~20 label maps (`RESULT_LABEL`, `SESSION_LABEL`, …),
where the values are keys and the read sites did not have to change at all.

## What is deliberately _not_ translated

- **Identifier-shaped data.** Record references (`TR-041`), event names (`agent.status`), API paths, metric
  and field ids, class names, inline SVG path geometry, and values a comparison switches on. The migration
  refused these by shape rather than by a list — a string with no capital letter, or a single camelCase
  token, or an all-caps constant is not a sentence — and it _reported_ what it could not classify instead of
  guessing.
- **A parser's reason strings.** `parseServerFrame` reports _why_ a frame was dropped (`frame is not valid
JSON`); that evidence is quoted into a sentence that _is_ translated (`Dropped an unreadable frame: …`).
  Translating the evidence would make the audit trail unsearchable across languages for no reader's benefit.
- **The document's writing direction.** This phase set `<html lang>` (which is what loads the Persian face)
  and left `dir` alone, because deep RTL is a later phase's work and doing half of it here would change the
  layout the design system owns. Phase 7.5.3.4.4 did that work, and the direction is now derived from the
  language rather than set beside it — see the section below.

## The writing direction follows the language

Phase 7.5.3.4.4 made the direction a consequence of the language rather than a second choice. `directionOf`
in `web/src/i18n/direction.ts` takes the stored preference (`auto` / `ltr` / `rtl`) and the **resolved**
locale, and the Persian interface derives `rtl` from it. `auto` reads the locale rather than the preference's
name, so the mirror follows the language the interface is actually in — which is the whole reason choosing
Persian needs no second control. The two pins stay expressible so "Persian, laid out like English" does not
become impossible.

It is still copy's neighbour, not copy: `<html lang>` and `<html dir>` are written by one function,
`useDocumentLanguage`, and the interface layer is still the only place an interface language comes from. The
Persian _record_ of what the phase changed — the glyphs, the physical properties that were kept, the
free-text surfaces — is `docs/persian-language.md`; the summary is §28 of `docs/frontend-foundation.md`.

## Nine keys are the same in both catalogues, and the suite names them

A product name, the two provider names as the industry writes them, a version letter, a package path, the
`R` and `t` unit letters, a code identifier, and the endonym `English`. Everything else that was
byte-identical would be an untranslated entry wearing a translation, so `identicalToEnglish('fa')` is
asserted against that list exactly rather than against a threshold.

## Adding a language

A word in `UI_LOCALES`, a range in `LOCALE_HTML_TAGS`, an endonym, a catalogue module, and one line in
`uiLocaleOf`. Nothing else in the application has to know — the switch is built from the catalogue, the
shell reads the locale rather than the setting, and every component already addresses its copy by key.
