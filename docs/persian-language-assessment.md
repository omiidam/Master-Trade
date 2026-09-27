# Phase 7 Persian language level assessment

One independent diagnostic pass over the Agent's **current** Persian-language capability. It is a
measurement, not a fix: nothing in the language layer, the prompts, memory, scoring or product logic
was changed to move a number here, and the assessment is deliberately separate from the Full
Validation suite and from the security gate.

**It does not rank the Agent against any model.** ParsBench and persian-llm-eval are used as
_methodological_ references — how to split tracks, how to score deterministically, how to keep a
public harness reproducible — never as a leaderboard. No restricted or hidden benchmark data is copied
or vendored.

- The machine-readable checkpoint: [persian-assessment-baseline.json](./persian-assessment-baseline.json)
- The layer under measurement: [persian-language.md](./persian-language.md)

## 0. What was measured, and its honest scope

The Agent in this build has **no live model call**. Its Persian capability is the deterministic
language layer at `web/src/language`, reached through one import surface
(`web/src/language/index.ts`) and one join (`languagePipeline`). The assessment drives that interface
directly — the real exported functions, not a reimplementation and not a prompt observed by hand.

That fixes what "reading comprehension", "idioms" and "naturalness" can mean here. They are measured
as what the layer _does_: a script census, a closed lexicon, a closed idiom/register list, a fixed
rule catalogue. Where a case needs meaning the layer does not have — a synonym, an idiom — it is
expected to fail, and the failure is the reading. Each dimension names the authority for its expected
values, so a low score can be argued with rule by rule rather than dismissed.

## 1. Method

- **Battery.** `tests/persian-assessment/` — `harness.ts` (scoring), `cases-a.ts`/`cases-b.ts`/
  `cases-c.ts` (the 86 cases, dimensions 1–4 / 5–8 / 9–12), `assessment.test.ts` (the runner).
- **Determinism.** Every case reads an exported function with fixed inputs. There is no model, no
  clock, no network, no I/O and no randomness. The runner executes the battery **twice** and asserts the
  two runs are identical, then asserts the run against the recorded baseline.
- **Scoring.** Each case is worth one point. Objective cases are pass/fail; rubric cases are graded
  `0 / 0.5 / 1` against criteria printed with the case. A dimension scores
  `round(100 × points / max)`; the overall score is `round(100 × totalPoints / totalMax)`.
- **Counts.** _Passed_ = full marks, _partial_ = strictly between, _failed_ = zero.

Reproduce it with:

```bash
npx vitest run tests/persian-assessment        # the battery and its baseline check
```

## 2. Result

**Overall Persian Language Score: 95 / 100.**

| #   | Dimension                                         | Samples | Pass   | Partial | Fail  | Score  |
| --- | ------------------------------------------------- | ------- | ------ | ------- | ----- | ------ |
| 1   | Persian normalization & orthography               | 7       | 7      | 0       | 0     | 100    |
| 2   | Spelling and punctuation                          | 7       | 7      | 0       | 0     | 100    |
| 3   | Grammar and sentence structure                    | 8       | 7      | 0       | 1     | 88     |
| 4   | Natural Iranian Persian                           | 7       | 7      | 0       | 0     | 100    |
| 5   | Reading comprehension                             | 7       | 6      | 0       | 1     | 86     |
| 6   | Instruction following in Persian                  | 7       | 7      | 0       | 0     | 100    |
| 7   | Context and communication style                   | 7       | 7      | 0       | 0     | 100    |
| 8   | Idioms, expressions, and taarof                   | 7       | 5      | 0       | 2     | 71     |
| 9   | Numbers, dates, currency, ZWNJ and mixed text     | 8       | 8      | 0       | 0     | 100    |
| 10  | RTL / text-layout-sensitive responses             | 7       | 7      | 0       | 0     | 100    |
| 11  | Technical Persian with English terminology        | 7       | 7      | 0       | 0     | 100    |
| 12  | Context-aware adaptation and language consistency | 7       | 7      | 0       | 0     | 100    |
|     | **Total**                                         | **86**  | **82** | **0**   | **4** | **95** |

**Passed 82 / Partial 0 / Failed 4.**

### Objective vs qualitative

- **Objective cases (85 of 86).** A pass is a fact about characters, code points or a fixed rule: the
  fold happened, the CLDR format is exact, the isolate is the right code point, the precedence rule
  fired. There is no judgement in them.
- **Qualitative / rubric cases (1 of 86).** `FA-014` (a spoken register form is _reported_, not
  silently rewritten) is graded, but its criteria are mechanical too: full marks require the reported
  written form **and** that the text was left in place. No case in this battery is a human taste call;
  the "naturalness" cases are graded by the layer's own deterministic reader, not by an evaluator.

## 3. Sources by section

| Dimension                 | Cases      | Method / authority                                                                              |
| ------------------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| 1 Normalization           | FA-001–007 | Unicode Arabic block, Extended Arabic-Indic digits; ParsBench normalization track (methodology) |
| 2 Spelling & punctuation  | FA-008–014 | Product spelling catalogue (`spelling.ts`); persian-llm-eval spelling track (methodology)       |
| 3 Grammar                 | FA-015–022 | Product grammar catalogue (`grammar.ts`)                                                        |
| 4 Naturalness             | FA-023–029 | Product naturalness reader (`naturalness.ts`) over the quality reader (`evaluation.ts`)         |
| 5 Reading                 | FA-030–036 | Product census + lexicon (`detect.ts`, `context.ts`)                                            |
| 6 Instruction following   | FA-037–043 | Product request vocabulary (`detect.ts`) and precedence (`profile.ts`)                          |
| 7 Context & style         | FA-044–050 | Product context reader (`context.ts`)                                                           |
| 8 Idioms & taarof         | FA-051–057 | Product greetings and register lists (`context.ts`, `detect.ts`)                                |
| 9 Numbers/dates/currency  | FA-058–065 | CLDR via `Intl` (`fa.ts`); Unicode format controls                                              |
| 10 RTL / layout           | FA-066–072 | Unicode UAX #9 isolates (`fa.ts`)                                                               |
| 11 Technical terminology  | FA-073–079 | Product terminology lexicon (`terminology.ts`) and mixed-script grammar rule                    |
| 12 Adaptation/consistency | FA-080–086 | Product response join (`response.ts`) and resolver (`profile.ts`)                               |

## 4. The brief's required interactions, and where each is covered

| Required check                           | Case(s)                        | Result |
| ---------------------------------------- | ------------------------------ | ------ |
| Persian-only interaction                 | FA-030, FA-080                 | pass   |
| Persian + English technical terms        | FA-050, FA-073, FA-074, FA-075 | pass   |
| Persian numbers vs Arabic/English digits | FA-005, FA-058, FA-064         | pass   |
| ZWNJ variants                            | FA-007, FA-010, FA-016, FA-019 | pass   |
| Jalali / Gregorian date expressions      | FA-062                         | pass   |
| rial / toman expressions                 | FA-061 (IRR `ریال`)            | pass   |
| RTL-sensitive mixed-content responses    | FA-066–072                     | pass   |

Note on currency: the layer formats a **currency code** through CLDR (`formatFaCurrency(value,
'IRR')` → `‎ریال ۱٬۲۵۰٬۰۰۰٫۵`). It does not translate the word _toman_ or convert rial↔toman; that is a
product decision the layer deliberately does not make, and it is recorded as a limitation in §8.

## 5. Representative strengths

- **Orthography is exact and idempotent.** Arabic yeh/alef-maksura/kaf and their variants fold to the
  Persian letters (FA-001–003); vowel marks are dropped while a combining hamza survives as its
  composed letter (FA-004); Arabic-Indic digits fold to Persian (FA-005); and the pass is idempotent
  over mixed text (FA-006).
- **The deterministic corrections are correct and narrow.** `بجای`→`به جای`, `بطور`→`به طور`,
  `آنها`→`آنها`, doubled marks collapse, ASCII marks fold (FA-008–013) — and the candidate compound
  `هیچ کدام` is _recorded but not rewritten_ (FA-011), which is the learnable path working as designed.
- **Locale formatting is CLDR, not memory.** Grouping and the Persian decimal separator
  (`۱٬۲۳۴٬۵۶۷٫۸۹`), a Latin-digit technical variant (`1,234,567.89`), the Solar Hijri date
  (`۲۰۲۶-۰۹-۲۷` → `۱۴۰۵/۷/۵`), the Persian percent sign (`۲٫۵٪`) and the narrow currency symbol all
  match CLDR exactly (FA-059–063).
- **RTL handling is the Unicode mechanism.** LRI/RLI/FSI/PDI are the exact code points (FA-066–069),
  a signed figure is isolatable as an LTR run (FA-070), and normalization injects no bidi controls
  (FA-072).
- **Terminology is reviewed knowledge, not a guess.** The lexicon holds 57 canonical terms (FA-076),
  every preferred form is already normalized (FA-077), no two share a form (FA-078), and non-preferred
  forms are reported against the product's own (`ترید`→`معامله`, `استاپ لاس`→`حد ضرر`, FA-073–074).
- **Precedence is one rule, applied once.** A request in the message outranks the setting, which
  outranks habit, which outranks the reading (FA-040–042); the same resolution is carried into the
  response control and the memory stage so they cannot disagree (FA-085).

## 6. Representative failures (exact Agent output)

Four cases fail. Each is a genuine, documented limitation of the current capability, not a
measurement error.

| Case   | Dimension | What was asked                                                      | Exact observed output                                                                    |
| ------ | --------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| FA-022 | Grammar   | A correct sentence must not be falsely flagged                      | `{"rules":["grammar.verb-number-agreement"]}` on `نمودار خالی واقعیتی درباره دادهها است` |
| FA-036 | Reading   | `قیمت طلا چنده؟` should read the concept _instrument_ (gold/XAUUSD) | `{"terms":[],"domains":[]}`                                                              |
| FA-054 | Idioms    | `قربونت برم` should read as informal                                | `"neutral"`                                                                              |
| FA-055 | Idioms    | `دستت درد نکنه` should read as informal                             | `"neutral"`                                                                              |

**FA-022 — a stated false positive.** The pronoun/agreement reader recognises a plural subject by a
`ها`/`های` ending, so a plural noun _inside the predicate_ (`دادهها` in `… درباره دادهها است`) is read
as the subject and the correct sentence is reported as a problem. The layer's own `notEvaluated` list
names this ("`grammar.verb-number-agreement` recognises its subject by a `ها` ending"), and reports
having found 21 instances of it over the product's own Persian copy. Telling a subject from a noun in
a predicate needs a clause boundary the grammar catalogue deliberately does not have.

**FA-036 — comprehension is a lexicon lookup, not understanding.** `طلا` (gold) is not a lexicon form,
so no concept is read even though the sentence is plainly about an instrument. This is the boundary of
a closed vocabulary, and it is the single most consequential gap for a _trading_ assistant: a user who
names a commodity in ordinary Persian rather than as `XAUUSD` is not understood.

**FA-054/055 — taarof is out of lexical reach.** The register reader is a closed list of markers;
common taarof expressions are not in it, so they read as `neutral`. (A two-word message still reads as
_conversational_ because a short turn is treated as small talk, but that is a length default, not a
reading of the idiom — which is why the case asks for the register, not the setting.)

## 7. Recurring error patterns

1. **Closed-list ceiling.** Idioms, atypical synonyms and register forms outside the fixed tables are
   invisible (FA-036, FA-054, FA-055). This is by design — the layer refuses to guess — but it is where
   every comprehension/idiom miss comes from.
2. **No semantics.** The layer reads scripts, spans and lexicon ids; it does not read meaning, so any
   case phrased as "does it understand X" fails unless X is in the lexicon (FA-036).
3. **Ending-based grammar heuristics mis-fire on correct sentences.** The agreement rule's `ها`-ending
   subject test (FA-022) is the concrete instance of a pattern that will recur wherever a rule reads a
   word's shape instead of its role.

## 8. Current baseline limitations

- **No model in the loop.** This measures the deterministic layer; it does not measure how a hosted
  model would render Persian prose. A provider-backed pass is a separate exercise.
- **Idiom and meaning coverage is closed-list only** (§6–7); collocation and metaphor are explicitly
  `notEvaluated` by the layer itself.
- **Currency words are not translated** — a code is formatted, but rial↔toman phrasing and the words
  for them are not part of this layer.
- **RTL is measured structurally** (isolate controls and exact code points), not in a rendered DOM; the
  browser rendering of mixed bidi content is covered by the browser suite, not here.
- **The score is a snapshot of one commit** and one battery version. It is a checkpoint to diff
  against, marked `isMaximum: false`, and it is not a claim that the Agent's Persian is correct.

## 9. Reproducibility and non-interference

- **Deterministic and reproducible.** The runner executes the battery twice in one process and asserts
  identical results, then asserts the run against
  [persian-assessment-baseline.json](./persian-assessment-baseline.json) — overall, totals, the
  per-case fingerprint, every dimension tuple and every case's verdict _and_ observed evidence. Two
  runs at the same commit produce byte-identical output.
- **No production behaviour changed.** The assessment adds only `tests/persian-assessment/` and this
  document plus its baseline. Nothing under `web/src`, `packages/`, `src/` or any prompt, memory or
  scoring path was touched to improve a score; `git diff` for this pass contains no production change.

## 10. Provenance

| Field                     | Value                                                                  |
| ------------------------- | ---------------------------------------------------------------------- |
| Assessment version        | 1 (`ASSESSMENT_VERSION`)                                               |
| Battery                   | `tests/persian-assessment/` (86 cases, 12 dimensions)                  |
| Layer                     | `web/src/language` (the exported Agent language interface)             |
| Assessed commit           | `edf79d48d2a9b1371e1285b182b5f27c29b57573`                             |
| Timestamp                 | `2026-09-27T10:00:00.000Z` (fixed in the baseline for reproducibility) |
| Overall score             | 95 / 100                                                               |
| Passed / partial / failed | 82 / 0 / 4                                                             |
| Baseline                  | `docs/persian-assessment-baseline.json` (`isMaximum: false`)           |

**This report does not claim the Agent's Persian is correct.** It records a set of deterministic
measurements taken at one commit, names the four cases that fail with their exact output, and keeps
the whole battery — baseline and all — under a runner that fails if the measurement drifts.
