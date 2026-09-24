# Frontend Foundation (Phase 3.2)

Interface foundation and product preview for the Master Trade workstation:
application shell, design token system, reusable component library and eight
prototype pages. **No backend, AI, permission or safety code was changed**, and
nothing on these screens is connected to a model, a database or a market feed.

Phase 3.2 shipped the shell and the first five pages; [Phase 3.4](#9-phase-34--product-modules)
extended it with the Exams, Memory and Research modules on the same tokens and
primitives.

Stack and rationale: [technology-decisions.md](./technology-decisions.md)
(React 19 + Vite 6, Tailwind v4 + Radix, Zustand, Framer Motion).

```
web/
├── index.html                 # RTL-ready shell document (dir="ltr", lang="en")
├── tsconfig.json              # DOM lib, react-jsx, bundler resolution, same strictness as backend
└── src/
    ├── main.tsx               # entry; renders <App /> in StrictMode
    ├── App.tsx                # page switch + dialogs + <html dir> mirroring
    ├── app/                   # shell: AppShell, Sidebar, Topbar, Workspace, dialogs
    ├── components/            # component library (10 primitives + charts)
    │   ├── exams/             # ExamCard, QuestionPanel, AnswerOption, ProgressIndicator,
    │   │                      #   ScoreCard, MistakeAnalysisCard
    │   ├── memory/            # MemoryCard, KnowledgeSearch, TrustBadge, SourceIndicator,
    │   │                      #   MemoryTimeline
    │   └── research/          # ResearchCard, ExperimentTimeline, MetricsPanel, ReportViewer
    ├── config/navigation.ts   # page ids, labels, groups (validated by tests)
    ├── design/
    │   ├── tokens.ts          # token inventory (machine-checkable)
    │   ├── motion.ts          # Framer Motion presets
    │   └── ...
    ├── lib/                   # cn, format helpers, useMediaQuery
    ├── mock/                  # data.ts + exams.ts/memory.ts/research.ts — clearly-labelled
    │                          #   preview data, typed against backend view models
    ├── pages/                 # Dashboard, AI Workspace, Memory, Research, Academy,
    │                          #   Exams, Trading Lab, Settings
    ├── store/ui.ts            # Zustand: UI state only
    └── styles/global.css      # Tailwind v4 @theme tokens + base layer
```

The frontend lives in `web/` inside the same package as the backend: one modular
monolith ([ADR-0002](./adr/ADR-0002-modular-monolith.md)), no second build system.

## 1. Design token system

Tokens are a two-part contract: declared as CSS custom properties in
`web/src/styles/global.css` (Tailwind v4 `@theme`) and inventoried in
`web/src/design/tokens.ts`. `tests/frontend-shell.test.ts` reads the stylesheet
and fails if an inventoried token is missing, so a component can never reference a
token the theme does not define.

| Group        | Contents                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------- |
| `color`      | surfaces, borders, text, states, AI accent, state borders, epistemic + provenance colors |
| `typography` | interface/numeric font stacks, weighted type scale, weight ladder                        |
| `spacing`    | the named spacing scale (2px grid up to 6rem)                                            |
| `breakpoint` | phone landscape, tablet, desktop, wide, ultrawide                                        |
| `radius`     | mark, inset, control, tile, panel, pill                                                  |
| `shadow`     | panel, popover, accent glow, control glow                                                |
| `gradient`   | panel sheen, loading sweep                                                               |
| `motion`     | fast/base/slow durations, standard/emphasis easings                                      |
| `zIndex`     | shell, overlay, modal, tooltip layers                                                    |

**Theme: "Workstation Dark"** — near-black layered surfaces with a faint
engineering grid, hairline borders, mint primary accent, blue informational,
violet AI accent, amber warning and rose danger. Negative/positive candle colors
reuse the danger/success tokens, so the palette stays semantic: no component
hard-codes a hex value.

Two dedicated token families exist for trust, not decoration:

- **epistemic colors** (`--color-fact`, `--color-analysis`, `--color-hypothesis`,
  `--color-uncertainty`) label every agent statement;
- **provenance colors** (`--color-provenance-synthetic|historical|live`) label
  market data everywhere it appears.

Phase 7.1 later extended this vocabulary into a complete design foundation — type
scale, spacing, breakpoints, depth and controlled glow — and removed the last values
written at call sites. [§ 10](#10-phase-71--design-foundations) has the detail.

## 2. Component library

Ten reusable primitives plus two chart helpers, exported from one barrel
(`web/src/components/index.ts`). Every component is presentation only: none
fetches data, computes a risk figure or holds a secret.

| Component          | Notes                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `Button`           | variants (primary/secondary/ghost/subtle/danger), sizes incl. icon-only, `asChild`, labels             |
| `Card`             | `Card`, `CardHeader/Title/Description/Content/Footer`, plus `Section` for page grouping                |
| `Badge`            | tones + `EpistemicBadge` (fact/analysis/hypothesis/uncertainty) and `ProvenanceBadge`                  |
| `Modal`            | Radix Dialog + Framer Motion; focus trap, escape/scroll lock, `aria-modal`, reduced motion             |
| `Input`            | `Input`, `Textarea`, `Field` (render-prop so label/hint/error wiring cannot mismatch), `ReadOnlyValue` |
| `Tooltip`          | Radix Tooltip with a single `TooltipProvider` at the app root                                          |
| `Tabs`             | Radix Tabs (`TabPanel`), keyboard navigable, `data-state` driven styling                               |
| `Skeleton`         | `Skeleton` + `SkeletonCard`; pulse suppressed under reduced motion                                     |
| `EmptyState`       | states _why_ a pane is empty — "not connected yet" must never look like "no data"                      |
| `ErrorState`       | severity + typed error code (`PROVIDER_UNAVAILABLE`, …) instead of a raw payload                       |
| `ProvenanceBanner` | mandatory data-provenance strip, label text imported from the backend contract                         |
| `ChartAdapter`     | the single chart boundary ([ADR-0013](./adr/ADR-0013-charting-lightweight-charts.md))                  |

`ChartAdapter` is worth calling out: it renders an SVG placeholder today, but it
already owns the two guarantees that must survive the swap to Lightweight Charts
— the provenance label is always rendered with the data, and the chart exposes no
interactive order affordance. Charts are forced LTR inside an RTL interface
because financial time series read left-to-right.

Phase 3.4 added fifteen module components in three folders (`exams/`, `memory/`,
`research/`), all exported from the same barrel and built from the primitives
above. None of them fetches data or computes a metric: they render typed mock
records and carry the trust/provenance labels their records declare
([§ 9](#9-phase-34--product-modules)).

## 3. Application shell

```
┌──────────────┬───────────────────────────────────────────────────────────────┐
│ Sidebar      │ Topbar  · page title · preview badge · offline · direction ·   │
│ brand        │           notifications · Safety                              │
│ nav (grouped)├───────────────────────────────────────────────────────────────┤
│ safety card  │ Workspace                                                      │
│              │  page header (title, description, actions)                     │
│              │  content grid / tabs / cards / chart                           │
│              ├───────────────────────────────────────────────────────────────┤
│              │ footer · safety statement                                      │
└──────────────┴───────────────────────────────────────────────────────────────┘
```

- **Sidebar**: grouped navigation (Workspace / Learning / System), active item
  marked with `aria-current="page"`, collapse toggle, and a permanent safety card
  stating that live trading and broker execution are disabled by design.
- **Topbar**: page context, `Preview · mock data` badge (always visible), an
  `Offline` indicator, writing-direction toggle, notifications affordance and a
  `Safety` button that opens the safety dialog.
- **Workspace**: page header plus a responsive grid; page transitions are
  motion-based and skipped under reduced motion.
- **Below 1100px** the sidebar automatically collapses to an icon rail and each
  icon keeps an accessible name, so the workspace keeps its width in narrow
  windows. Desktop-first does not mean desktop-only.

## 4. Prototype pages (mock data only)

| Page             | Contents                                                                                                                                    | Honesty markers                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Dashboard**    | study metrics with sparklines, training equity chart, activity log, loading/empty/error state gallery, four module overview widgets (§ 9)   | read-only badge, preview alert, provenance banner                |
| **AI Workspace** | contract-typed conversation with epistemic labels and sources, disabled composer, run-context panel, tool-request path, rule-proposal flow  | `PROVIDER_UNAVAILABLE` banner, "no model provider is configured" |
| **Memory**       | knowledge dashboard, search, category filters, memory cards with trust and source, timeline, growth series                                  | "not a connected knowledge base" notice, `SourceIndicator`       |
| **Research**     | research dashboard, active experiments, experiment detail, metrics panel, timeline, report viewer                                           | metrics labelled synthetic or absent; never "active"             |
| **Academy**      | six-month curriculum with unlock states, lesson list with prerequisites, examination cards                                                  | "exam runner is not part of this phase" empty state              |
| **Exams**        | assessment overview, current assessment card, available exams, categories, progress, history, score evolution, mistake analysis             | answer key withheld, "no runner is connected" notice             |
| **Trading Lab**  | practice chart, setup review checklists, risk-calculator shell, rule-proposal approval flow                                                 | read-only + "execution impossible" badges, inert tool result     |
| **Settings**     | direction and density controls, theme tokens, provider rows with keychain references, safety posture, budget, jobs, configuration read-outs | secrets shown as references only, safety flags as assertions     |

Every page states what it is not. Mock data lives in `web/src/mock/data.ts` and is
**typed against the backend view models** (`packages/shared/src/frontend/viewModels.ts`), so the
preview cannot drift into an invented contract the real API will not satisfy.

## 5. RTL and accessibility

**RTL-ready** means the direction is a document-level property, not a stylesheet
fork:

- every spacing rule uses logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`,
  `border-e`, `text-start`), so flipping `dir` mirrors the layout;
- the store holds the direction and `App` mirrors it onto `<html dir>`;
- charts and numeric readouts stay LTR on purpose;
- no second stylesheet, no `:dir()` duplication, no per-component mirroring code.

**Accessibility** currently includes: a skip link, landmark regions
(`complementary`, `banner`, `main`, `contentinfo`), `aria-current` on navigation,
accessible names on every icon-only control, Radix-managed focus trapping and
keyboard semantics for modal/tabs/tooltip, visible focus rings from the
`--color-focus` token, `role="progressbar"` with values on progress bars,
`aria-pressed` on toggles, `role="alert"` on error surfaces, labelled form fields
with `aria-describedby` wiring, and reduced-motion support in both JS and CSS.

Gaps to close in the next phase (recorded so they are not forgotten): a full
keyboard-only pass, automated axe checks in CI, and a screen-reader pass over the
conversation stream.

## 6. Guardrails that are tested

`tests/frontend-shell.test.ts` enforces:

1. the five required pages exist, with labels, descriptions and valid groups;
2. no navigation label/description and no control accessible name matches the
   backend's `FORBIDDEN_UI_CONTROL` vocabulary (order placement, execution, broker);
3. every token inventoried in `design/tokens.ts` is declared in the theme, and the
   theme is dark;
4. the ten reusable primitives are exported from the component barrel and exist on
   disk;
5. the preview identifies itself as a preview with mock data.

`tests/frontend-modules.test.ts` extends that over the Phase 3.4 modules: the
fifteen module components ship through the barrel; the three pages and the three
navigation entries exist and pass the execution-control check; every module page
uses a shared preview notice; each declared state (six exam states, four memory
states, five experiment states) is exercised by the sample data; the answer key is
withheld on every question; `unverified` never renders as a fact; a
`model`-authored record can never be `authoritative`.

`tests/frontend-design-foundations.test.ts` (Phase 7.1) holds the other half of the
token contract and the parts that only matter once the tokens are a system: the
inventory is complete in **both** directions; every ladder (type, spacing,
breakpoints, radii) is strictly ordered and agrees value-for-value with the
stylesheet; every weighted type step pairs a line height and a weight and no
running-text step pairs either; each elevation level names a shadow and a surface
that exist, with level 0 carrying none; both gradients are exposed as utilities; and
no component may write a hex colour, a colour function, an arbitrary font size or an
arbitrary colour/shadow utility. [§ 10](#10-phase-71--design-foundations) explains
what each rule protects.

## 7. Deliberately not built in this phase

- No data fetching (TanStack Query waits for real endpoints).
- No persistence, no sessions, no auth wiring.
- No realtime connection; the `Offline` badge is accurate.
- No real charts (adapter placeholder only).
- No exam runner (the Exams page renders assessments, not a live attempt loop).
- No lesson content authoring.
- Memory search filters the in-memory sample; there is no index, no embedding call
  and no persistence.
- No backtest engine behind the Research metrics — every metric is labelled either
  `synthetic` or `none`.
- No Tauri packaging, no desktop shell — that is the next desktop milestone.

## 8. Commands

```bash
npm run dev            # Vite dev server, http://127.0.0.1:5173 (strictPort)
npm run typecheck      # backend + shared contracts
npm run typecheck:web  # the React app
npm run test           # 189 tests incl. the frontend shell + module invariants
npm run build:web      # production frontend bundle → web/dist
npm run validate       # format + both typechecks + tests + both builds
```

## 9. Phase 3.4 — product modules

Three product surfaces the Phase 3.2 shell left out, built on the same tokens,
primitives and honesty rules. **Frontend only**: no backend, AI, permission or
safety module was touched, and no execution affordance was introduced.

### Exams

- **Page** `ExamsPage.tsx`: progress summary (attempted / passed / locked /
  in-progress / attempts), current-assessment card, available exams, categories,
  exam history, score evolution and mistake analysis.
- **Components** `ExamCard`, `QuestionPanel`, `AnswerOption`,
  `ProgressIndicator`, `ScoreCard`, `MistakeAnalysisCard`.
- **States** available, in-progress, completed, failed, locked (plus empty and
  loading), each exercised by the sample data and asserted by tests.
- **Honesty** every question carries `answerKeyWithheld: true` and a `rubricRef`
  into Academy; scoring is described as rubric-based and not connected. A `void`
  attempt never contributes a point to the score-evolution series.

### Memory

- **Page** `MemoryPage.tsx`: knowledge dashboard, search, categories, memory
  cards, verification status, provenance and confidence.
- **Components** `MemoryCard`, `KnowledgeSearch`, `TrustBadge`, `SourceIndicator`,
  `MemoryTimeline`.
- **States / categories** verified, pending-review, archived, unverified across
  Trading Concepts, Market Rules, Personal Mistakes, Research Notes, Agent
  Learnings.
- **Honesty** the epistemic label is derived from the record's trust level via
  `contextKindForTrust()` (never set locally on a card), a `model`-authored
  record is forced `unverified`, `authoritative` requires a human source, and
  archived/pending coexist with trust rather than overriding it.

### Research

- **Page** `ResearchPage.tsx`: research dashboard, active experiments, experiment
  detail, metrics, timeline and findings.
- **Components** `ResearchCard`, `ExperimentTimeline`, `MetricsPanel`,
  `ReportViewer`.
- **Metrics** sample size, win rate, average R, max drawdown, confidence level —
  each rendered only when `metricsSource === 'synthetic'`, and shown as _absent_
  otherwise. Nothing is presented as a measured or live result.
- **Honesty** no experiment can be labelled "active" (the vocabulary check
  forbids it), a rule adoption is `awaiting-approval` with an `approvalRef`, and
  every report states its limitations.

### Dashboard integration

`DashboardPage.tsx` gained four overview widgets built from the same module data —
Knowledge Mastery, Exam Performance, Memory Growth and Research Progress — so the
landing page reflects the whole product, not only the study metrics.

### Data

`web/src/mock/exams.ts`, `memory.ts` and `research.ts` hold the typed sample
records (compiled under the backend `tsconfig` too, so contract drift fails the
build). Each derives its summary figures from its own rows — `summariseExamProgress`,
`memoryStatus`, `summariseResearch` — rather than duplicating counts, and the
tests assert the derivation agrees with the rows.

## 10. Phase 7.1 — design foundations

Phase 3.2 shipped a token _list_ — enough to stop components inventing hex values,
not enough to design from. Phase 7.1 turned it into a system: every family a screen
is allowed to reach for is named twice (declared in the theme, inventoried in
`tokens.ts`), the ladders are ordered and machine-checked, and the values that had
leaked into call sites were replaced by the tokens that should have owned them.
**No page was redesigned and no product feature was added** — the same pixels, now
named.

`tests/frontend-design-foundations.test.ts` is what makes the claims below checkable
rather than aspirational, and it holds both directions of the contract: nothing is
inventoried that the theme does not declare, and nothing is declared that the
inventory does not name (a paired `--text-*--line-height` is the one exception, and
the suite says why).

### Type scale and spacing

The scale is nine steps from `--text-micro` (10px) to `--text-display` (28px). Four
of them are _figures_ — `figure`, `subheading`, `metric`, `display` — and each pairs
its size with a line height of 1 and a weight of 600, because a number that must not
wrap and must not drift as it grows is one decision, not three. The remaining five
steps are running text and deliberately pair **no** leading: they inherit the body's
1.55, which is what keeps the local `leading-*` overrides at those call sites
working. `text-metric` alone replaced eighteen copies of
`text-[1.5rem] leading-none font-semibold`.

The weight ladder (`normal`/`medium`/`semibold`/`bold`) is declared so a figure can
never reach for an invented weight.

Spacing is one 4px base named by role (`--space-hairline` … `--space-band`) rather
than by multiple, so a gap that means "the space between two cards" has a name that
survives a redesign. Tailwind's numeric scale stays available for the arithmetic
inside a control.

### A trap worth recording: the `--spacing-*` namespace

The scale is `--space-*`, not `--spacing-*`, and that is not a naming preference.
Tailwind turns every _named_ entry in `--spacing-*` into a utility, and that
namespace is an input to **every** sizing family — so adding a name there does not
add a spacing step, it redefines a utility that already existed. Both shapes of the
mistake were made while building this phase, and neither was a type error:

| Written                 | What Tailwind emitted                             | What broke                                   |
| ----------------------- | ------------------------------------------------- | -------------------------------------------- |
| `--spacing-3xl: 4rem`   | `max-w-3xl` reads the suffix against it           | every page description became a 64px box     |
| `--spacing-block: 1rem` | `.inline-block{inline-size:var(--spacing-block)}` | the static _display_ utility was overwritten |

Both were caught by the phone-width lay-out suite (`e2e.test.ts`, "does not clip
rendered text at phone widths") and by nothing else — not the typecheck, not the
token contract, not a visual glance at desktop width. That is the argument for
keeping that browser check in `npm run validate`, and for the rule the contract suite
now enforces: the `--spacing-*` namespace holds no named entries at all. `--space-*`
is not a Tailwind namespace, so those ten declarations are emitted as plain custom
properties and reached with `gap-[var(--space-group)]`.

### Responsive ladder

Breakpoints are declared rather than inherited: the five widths are Tailwind's own
defaults, restated so the product's contract is visible in the stylesheet and cannot
move under it. `sm`, `md` and `lg` are the phone-landscape, tablet and desktop widths
the screens are designed at, and `xl`/`2xl` are where the shell stops growing.

### Visual depth

Depth is a ladder, not a habit:

| Family    | Steps                                                                         |
| --------- | ----------------------------------------------------------------------------- |
| radius    | `mark` → `inset` → `control` → `tile` → `panel`, plus `pill` as a shape       |
| elevation | `flat` → `panel` → `overlay` → `emphasis`, each naming its shadow and surface |
| gradient  | `.panel-gradient` (top-lit sheen), `.surface-sheen` (loading sweep)           |
| glow      | `--shadow-glow`, `--shadow-glow-control` — the only two, and both reserved    |

`ELEVATION` in `tokens.ts` names each level's shadow and surface once, so "which
shadow for this?" has one answer instead of a per-component judgement. Level 0 is the
page itself, which has no shadow at all — a level, not an omission. The gradients are
exposed as utilities so no component writes a `linear-gradient`, and the accent glow
is reserved for the primary action rather than spent on decoration: glow is the
strongest emphasis the interface has, and the suite pins that there are exactly two.

The state edges are a first-class family now. Every tinted surface has a matching
`--color-*-border`, which is what replaced the most-copied literals in the tree.

### What was removed from the call sites

| Was                                        | Count | Now                                   |
| ------------------------------------------ | ----- | ------------------------------------- |
| literal hex state borders                  | 46    | `--color-*-border`, `--color-overlay` |
| `text-[…rem] leading-none font-semibold`   | 22    | the four weighted type steps          |
| `shadow-[0_10px_30px_-16px_rgba(…)]`       | 1     | `--shadow-glow-control`               |
| `bg-[linear-gradient(90deg,…)]`            | 1     | `.surface-sheen`                      |
| `rounded-lg` / `rounded-xl` / `rounded-sm` | 6     | `--radius-inset` / `tile` / `mark`    |

Every replacement resolves to the value it replaced. The suite enforces the rule
going forward: no `.ts`/`.tsx` under `web/src` may carry a hex colour, a colour
function, an arbitrary font size, or an arbitrary colour/shadow utility.

### Recorded deviation (Phase 7.2)

The shell collapses its rail with `COMPACT_SHELL_QUERY = '(max-width: 1099px)'` in
`web/src/lib/useMediaQuery.ts` — a raw pixel value in TypeScript that sits between the
`md` and `xl` steps of the ladder rather than on one of them. It is left exactly as it
is here: moving it is a layout decision, not a token one.
