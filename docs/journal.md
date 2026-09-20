# Trading journal

The journal records **what the trader actually did**: the setup taken, the risk
committed, whether their own rules held, the mistake made and the lesson taken from
it. It is the raw material every later review is built on, which is why almost
every rule below is about _not overstating_ what a record shows.

Implemented as one sidebar entry with seven internal sections. No section is a
separate navigation category, and none of them is a page in the router.

| Section             | What it is for                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Overview            | Ten headline figures, the R curve, drawdown and the planned-versus-actual comparison                              |
| Trade history       | The record table: search, facets, sorting, column visibility, paging, row actions                                 |
| Add trade           | Staged data entry in seven form sections, with validation and a store-aware submission                            |
| Trade details       | One record: planned against actual, the annotated level chart, context, psychology, review, attachments, timeline |
| Analytics           | Every journal analytic, with a timeframe scope and a sample size on every rate                                    |
| Calendar            | Month and week views, with a selected-day summary                                                                 |
| Reviews and lessons | What is awaiting a review, the recorded mistake patterns, and the lessons themselves                              |

## Code layout

| Path                                           | Role                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `web/src/pages/JournalPage.tsx`                | The page: header, internal tabs, and the composition of each section                 |
| `web/src/components/journal/*`                 | The module's component library, one export per file                                  |
| `web/src/components/journal/tradeFormModel.ts` | Form shape, defaults and validation — dependency-free, so it is unit-tested directly |
| `web/src/mock/journal.ts`                      | Vocabulary, labels, illustrative aggregates, and the pure selection helpers          |
| `web/src/mock/journalTrades.ts`                | The sixteen illustrative trade records and the timeline builder                      |

`tradeFormModel.ts` holds no React on purpose. Data-entry rules are policy rather
than presentation, so they are the part that has to be arguable, and they are
tested without rendering anything.

## The rules this module is built to hold

1. **An unrecorded value is a gap, never a zero.** A trade with no exit shows
   `not scored`; a day whose records were never scored reports `not scored`, not
   `0.00R`. A measured flat result and a missing one are different facts, and the
   whole point of a journal is that the difference survives.
2. **A rate carries its sample.** Sample size is the first numeric column of every
   breakdown, and unassessed records are _excluded_ from the compliance rate rather
   than counted as compliant.
3. **The plan and the outcome stay distinguishable.** Planned levels are dashed
   reference lines; realised values are the drawn series. A divergence is marked
   even when it came out better than the plan, because a lucky fill is still an
   unplanned fill.
4. **Compliance is reported separately from the result.** A profitable trade can be
   a rule break and a clean loss can be compliant. The journal marks it either way.
5. **Recording changes nothing.** No control in this module places, changes or
   closes anything. The row action menu offers record operations only, and the
   submission path appends a record.
6. **No model writes a number here.** The figures in this module come from the
   record. The review surface explains the record; it never produces the numbers,
   never scores the trade and never changes a rule.
7. **A missing write-up is stated, not hidden.** A record with no market context,
   no psychology or no review says so, and `review-required` is a state a record
   declares rather than something the interface infers.
8. **A record that is still open is not reviewable.** An open position is exempt
   from the review flag: asking for a review of an unfinished trade is asking for a
   guess.
9. **A scope is stated, not implied.** Every analytic reports the window it covers,
   and a custom window spells out its own bounds — an empty bound is reported as
   open ended rather than quietly read as the report date. A figure whose window is
   unstated cannot be audited later, which defeats the purpose of keeping the
   record at all.

## What is mock, and what is real

- **Real:** the vocabulary, the selection (search, facets, sorting, paging), the
  calendar arithmetic, the form's validation rules, the accessibility structure,
  and every empty, loading and error surface.
- **Not connected:** the journal store. Sixteen records, every aggregate and every
  series are hand-written constants in `web/src/mock/`, labelled `synthetic` and
  rendered with the provenance strip. The export action reports that it is not
  connected instead of writing an empty file.
- **Not calculated:** position size, R multiples, drawdown, expectancy and every
  other statistic. Those belong to the deterministic engine in
  `packages/trading-engine` (ADR-0037). The form records the levels it is given and
  checks that they are internally possible; it derives nothing.

## Verification

`tests/frontend-journal.test.ts` holds the module's invariants:

- journal is exactly one navigation entry, with no section leaking into the sidebar;
- every level set is coherent with its direction, in every record;
- a win is positive R, a loss negative, break-even inside a rounding band, and an
  unscored record is `null` — never zero;
- status, timestamps and outcome agree;
- the R curve, the drawdown curve and the headline drawdown are all recomputed from
  the per-trade results, so a hand-edited series cannot disagree with the rows;
- every calendar day's trade count, net R and committed risk are recomputed from
  the records on that date;
- no control label in the module carries an execution affordance, no journal file
  imports a backend module, a browser store or a network call;
- the form refuses an incoherent level set, a missing invalidation level, a missing
  thesis and an unmarked checklist.
