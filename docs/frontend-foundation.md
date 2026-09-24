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
| glow      | `accent`, `control`, `danger` — three roles, each reserving an emphasis       |

`ELEVATION` in `tokens.ts` names each level's shadow and surface once, so "which
shadow for this?" has one answer instead of a per-component judgement. Level 0 is the
page itself, which has no shadow at all — a level, not an omission. The gradients are
exposed as utilities so no component writes a `linear-gradient`, and the accent glow
is reserved for the primary action rather than spent on decoration: glow is the
strongest emphasis the interface has.

Phase 7.1 pinned that reservation as a count — "there are exactly two" — and Phase 7.2
had to change it, which was the point: it needed a third glow for the destructive
action, because a filled red control carrying the _green_ control's shadow reads as the
same weight as the green one. Rather than relax the assertion, it became a list of
**roles** (`GLOW_TOKENS`/`GLOW_ROLES`), so a fourth glow now has to name the decision it
highlights before it can exist. That is a stronger check than the old one, and it is
recorded here because the old one was honest about two and this one is honest about
three.

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

## 11. Phase 7.2 — core components

Phase 7.1 named the values; this phase spends them. Every control, content surface and
feedback surface was rebuilt out of the token vocabulary so that the product has a
visual identity of its own rather than the shape a Tailwind starter produces. **No page
was redesigned and no product feature was added** — an exhibit on Settings is how the
new surfaces are rendered and reviewed, in the same spirit as the interface-states panel
already there.

`tests/frontend-components.test.ts` holds the claims below, and the two 7.1 assertions
that legitimately changed are described in the sections they belong to.

### The idea the whole phase rests on

Three tokens carry it:

- **A control is lit from above.** `--gradient-control`, `--gradient-accent` and
  `--gradient-danger-fill` are top-lit fills, reached through the utilities
  `control-sheen`, `control-accent` and `control-danger`. A flat fill is the single
  thing that makes an interface read as a generic dashboard.
- **A raised surface carries a lit edge.** `.edge-highlight` draws one hairline of
  light along the top of a panel, fading out before the corners so it never fights the
  radius. Cards, alerts, tooltips and the dialog all share it, so it is one rule rather
  than four lookalikes.
- **A control is not a surface.** `CONTROL_DEPTH` (`resting`, `litEdge`, `raised`) is
  separate from `ELEVATION`, because a button on a card is not a third surface.

### Task 1 — controls

`Button` has eight variants and one rule that organises them: **filled means commit**.
`primary` and `danger` are the only two filled faces, and therefore the only two that
glow; `subtle`, `success`, `warning` and `info` are tinted wells, so a status control
sitting beside a primary action never competes with it. The four new variants exist
because a design system whose alerts have six tones and whose buttons have five is
inconsistent, and the Settings exhibit is what renders them.

Every shadow is **one stack**. `box-shadow` is a single property, so a control cannot
carry two shadow utilities at once — the second simply replaces the first. Each depth
token therefore contains its own lit inset top edge, which is also the honest model: a
machined face has one lighting condition, not two. The same reasoning produced
`TONE_SHADOW` in `Alert`: one map, one branch, no conflict to resolve by CSS order.

`Select` is new and `SELECT_CLASS` is gone. The same twelve-class string had been
copy-pasted into three screens and had already drifted apart (one copy had hover
feedback, two did not; one was a caption size the others were not). The shared control
takes `className` on its **wrapper** and keeps the inner `<select>` at `w-full`, so a
caller sizes the control once and the chevron keeps its place; every form attribute
still lands on the real `<select>`. `density`, not `size`, because `size` is already an
HTML select attribute.

One accessibility change was deliberate: the field face **no longer sets
`focus:outline-none`**. A text input is entered by keyboard, so it keeps the page-wide
`:focus-visible` ring every other control gets, and gains the accent border alongside
it rather than instead of it.

### Task 2 — content components

The card is three surface layers, not three shadows: `default` and `raised` are lit
panels (surface + gradient + lit edge + `--shadow-panel`), and `sunken` is the inverse —
a well, lit along its bottom edge, with no top highlight and no panel gradient. A new
`emphasis` prop says which card a screen is organised around; **`accent` is the only
emphasis that takes a glow**, because elevation level 3 is defined as _one_ accent
surface that asks to be acted on.

Both the surface tone and the emphasis are closed families, and only `accent` glows. That the
exhibit renders an accent emphasis card rather than describing one is deliberate: an unused
emphasis is a prop nobody has looked at, and the accent glow is the claim most worth eyeballing.

`Badge` gained a second shape and one honest fix. `success` used to borrow
`--color-primary-soft`, so an "ok" pill and a brand pill were the same object with two
text colours; it now has its own fill and edge, and `primary`/`success` are neighbouring
greens that can be told apart. A `tag` shape joins the `pill`: a pill is a _label_, a tag
is an _identifier_, and the tag's squarer, tighter geometry is what a strip of codes
should look like.

`Tabs` became a rail. The track is a recessed well and the active tab is a raised face
standing on it — the inversion is what makes the selection unmistakable without a heavy
fill — and the active tab gets exactly one accent mark, a 1px rail along its bottom edge.
The two gradient layers are always present and toggled by opacity because `control-sheen`
is a plain class and a plain class cannot take a `data-[state=active]:` variant.

`Tooltip` is the smallest surface in the product and still wears all three depth tokens.

### Task 3 — feedback and overlays

There is one feedback primitive, and this is the phase's most important structural
decision. `Alert` declares the six tones; `ErrorState` and `RealtimeNotification` are now
thin, named adapters over it, and a toast is the same component with a lifetime. Four
red panels with slightly different paddings cannot drift apart if there is only one.

|          | `neutral` | `info` | `success` | `warning` | `error` | `destructive` |
| -------- | --------- | ------ | --------- | --------- | ------- | ------------- |
| role     | status    | status | status    | alert     | alert   | alert         |
| toast ms | 5000      | 5000   | 5000      | 7000      | 9000    | never         |

`error` and `destructive` are both red and deliberately two tones: one describes
something that already happened and could not be done, the other describes something
about to be done that cannot be undone. Only the destructive surface glows. The role is
derived from the tone (`ALERT_TONE_ROLE`, in `design/components.ts`) rather than decided
per call site, because "information does not interrupt" is a property of the tone — a
live region that shouts about a status update is one people learn to ignore.

`Toast` is a small queue, not a subsystem: no reducer, no persistence, no cross-tab
channel, and a `limit` so a component that raises one in a render loop cannot grow the
array without bound. Hover **or focus** pauses the countdown, and leaving restarts it
rather than resuming — there is no per-toast clock to restore, and "the whole duration
again" is both simpler and what people expect on returning to read it. The viewport is
`role="region"` with no `aria-live` of its own, because each toast already carries a
live role and a live region wrapping live regions says everything twice. It sits above
the modal layer (`--z-toast`), so a message about a dialog is readable over it.

No feedback surface can render a payload. `Toast` takes a sentence rather than an
`Error`, and the suite asserts that none of the four surfaces injects markup or reaches
for `.message`/`.stack`. That is the UI-side half of the rule the backend already
enforces: a typed code is evidence, an exception body is not.

`Modal` moved to elevation level 2 — the raised surface, as the ladder defines it — and
gained `overlay-veil`, a faint brand wash over the scrim, so a dialog opens _inside_ the
workstation instead of on a plain dimmed sheet. It carries **no glow**: glow is the
accent's emphasis and the destructive action's warning, and a glowing dialog would make
the one accent surface on a screen ambiguous. Sizing is fluid from `w-[92vw]` with a
viewport-capped scroll region, so no width is written for a device.

### What changed in the 7.1 contract

Two assertions were rewritten, and both became stronger:

1. **The glow reservation.** It asserted a count of two; it now asserts the manifest's
   role list, and checks control depth is not elevation.
2. **The failure role.** It asserted `role="alert"` inside `ErrorState.tsx`. That role
   now lives in `Alert.tsx`, so the assertion moved to the component that decides it and
   states the fuller rule — information is announced politely and only a warning or a
   failure interrupts. A component that delegates its semantics cannot be the place that
   proves them.

Nothing else in the 7.1 suite was touched, and its two load-bearing rules still hold:
no call site writes a raw value, and every declared variable is inventoried.

## 12. Phase 7.2.1 — the agent surface

Two primitives, in their own family: `MessageComposer` and the `AgentCard` group
(`AgentCard`, `AgentCardList`, `AgentCardItem`, `AgentBadge`, `AgentCheck`). They live in
`web/src/components/agent/` because both describe a surface that _talks back_ — one takes
a message, the others describe how a message would be handled — and neither is a
general-purpose control or card. Their barrel re-exports from the library barrel, the way
`brand/` already did.

### The idea: this surface is lit from below

Everything else in the product is top-lit. A panel is lifted by `--gradient-panel` and
closed by `.edge-highlight`; a control is lifted by `--gradient-control` with its lit inset
edge. The agent surface inverts that:

- `--gradient-agent-ring` runs **0deg** — brightest along the bottom (0.26 white) and
  falling to the plain border colour at the top — where `--gradient-panel` runs 180deg with
  its sheen at the _top_.
- `--gradient-agent-glow` carries two accent pools, both anchored **below** the card's own
  bottom edge (`at 8% 114%`, `at 92% 108%`), so the light reads as coming off the floor
  rather than out of the middle.
- The composer's ring is the exception that proves the rule: it is lit from its
  **upper-left** corner (`--gradient-ring` at 135deg) with a blurred specular gleam in that
  same corner, because it is the thing _you_ act on.

Same accent, read in a different direction. That is what makes the family recognisable in a
screenshot without a badge or a label.

### Both edges are padding, never `border-image`

`border-image` ignores `border-radius`: the corners square off. So a radiused surface that
needs a _gradient_ stroke draws it as a 1.5px (composer) or 1px (card) frame whose own
background shows through the band the inner panel does not cover — and the inner radius is
derived from the outer one (`calc(var(--radius-panel) - 1px)`) so the two can never drift.
The contract suite now asserts product-wide that `border-image` appears in no code file,
which is the rule that stops the next gradient edge from being written the other way.

### The travelling light, and the bug it hid

One card per screen may take `ring="active"`: a band sweeps the ring, meaning "this is the
thing waiting for you". A page of sweeping borders is a page with no focus, so the page
asserts it has exactly one, and the sweep is a slow 9s breath rather than a progress
indicator. Under `prefers-reduced-motion` the global rule parks it.

The band is a 200%-wide absolutely positioned `::before`. In an `overflow: visible` host
that is not a decorative band at all — it paints across the page and counts toward the
document's scroll width, which is a slow animation turning into a horizontally scrolling
viewport. The host is clipped, and the assertion is written next to the width so the reason
survives.

### The composer that cannot send

There is no provider in this build, so the composer is the honest case rather than the
happy one:

- `blockedReason` disables the field **and** the send control together, is rendered as
  visible prose, and is the field's `aria-describedby` — so the reason is announced with the
  field rather than only sitting beside it.
- A tool is disabled **only** when it carries `blockedReason`, and the tooltip holds that
  reason. The tooltip wraps the control rather than living on it: a disabled control is
  `pointer-events: none` and could never open its own explanation.
- The examples under the frame are `Badge shape="tag"` labels, not shortcuts. A chip that
  looks pressable and fills or sends nothing is the affordance the rest of the file refuses
  to ship, so nothing in that row acts.
- The send control is the shared `Button` (`variant="primary"`, `size="icon"`, new
  `shape="pill"`) with its glyph in an inset well. The reference draws that well as glass
  with a backdrop blur, which has nothing to resolve over a smooth accent fill; it is the
  inset alone, and the glyph is what lights up.

One reference detail was deliberately dropped: it rotates the send glyph 45° on focus. A
paper plane with a different heading when focused says nothing about sending, so hover and
focus lift the face, light the glyph, and lean on the page-wide focus ring every other
control already gets.

### What the card keeps, and what it refuses

The rows are an `ul` or an `ol`, chosen **once inside the component** from an `ordered`
prop. The tool-request path is a sequence, and a list of check marks would say each step had
already happened — so the semantics are decided where they cannot be got wrong at a call
site. The marks themselves are `aria-hidden`: the sentence is the content, and a screen
reader announcing "check" before every row of every card is noise.

No fixed widths anywhere. The reference pins the composer at 260px; a fixed track is what
turns a design into a horizontal scrollbar on a narrow screen, so the layout stays the
grid's business. Verified at 390 / 834 / 1440 CSS px with no document overflow at any of
them, and the card action takes `fullWidth` from the control's own flag rather than from a
wrapper.

The `pill` shape is a named `ButtonShape` rather than a `rounded-[...]` written at the
call site, so the two shapes cannot drift and the radius still comes from the ladder.

### What was not changed

No chat functionality, message handling, transport or architecture. `MessageComposer`
takes a value and reports a change — the same seam the surface already had. The suite
asserts it holds no `fetch`, no `XMLHttpRequest`, no `EventSource`, no `WebSocket` and no
state hook, so a visual primitive cannot quietly grow a client.

The 7.1 and 7.2 suites were not weakened: the only additions are the new rules above.
18 new assertions cover this phase, all read from source and offline.

## 13. Phase 7.2.2 — colour harmony and one card system

### The idea: harmony is a relationship, not a list

The palette before this phase was not ugly. It was **unrelated**: six accents chosen one at
a time, each defensible on its own, with no stated reason any two of them sat where they
did. The symptom that made it a defect rather than a taste: `--color-primary` (hue 161) and
`--color-success` (hue 154) were **seven degrees apart**. The brand accent and the
confirmation green were one colour wearing two names, and no amount of "the ladders are
ordered" would have caught it, because both ladders were ordered.

The fix is a rule with a number in it. Every accent is now placed on one wheel relative to
one brand hue, and the relationship is _measurable_ rather than editorial:

| family                                | relationship  | distance from brand |
| ------------------------------------- | ------------- | ------------------- |
| brand (`--color-primary`, hue 190)    | the origin    | —                   |
| information (`--color-info`, 215)     | analogous     | 25°                 |
| reasoning (`--color-ai`, 258)         | analogous     | 68°                 |
| confirmation (`--color-success`, 152) | analogous     | 38°                 |
| caution (`--color-warning`, 38)       | complementary | 152°                |
| loss (`--color-danger`, 2)            | complementary | 172°                |

`MIN_HUE_SEPARATION` is 20 degrees, and `BRAND_HUE` is 190. `ACCENT_FAMILIES` in
`web/src/design/tokens.ts` records each family's base, its well, its edge and the hue it
claims; the suite **re-derives** the hue from the hex in the stylesheet and checks both the
number and the angle. A declared relationship that does not match the geometry fails, which
is how `confirmation` was caught still being described as complementary at 38 degrees.

Confirmation staying _analogous_ is the point, not a compromise. The two greens were never
wrong to be neighbours — they were wrong to be indistinguishable. Thirty-eight degrees is
far enough that a green tick and a cyan accent stop reading as one colour, and close enough
that the accent family still looks like one family.

### The neutrals are an axis, not a set of greys

Every surface, edge and ink sits inside `NEUTRAL_AXIS`: hue 210–222, saturation 10–46. That
band is what makes a dark interface read as one material. The suite asserts it token by
token, so a grey that drifts warmer or more saturated fails rather than quietly tinting
everything beside it.

### Legibility became a measurement

Phase 7.1 asserted the ladders were ordered — necessary, not sufficient: a ladder can be in
the right order with every step on it unreadable. `CONTRAST_RULES` is the other half: one
row per reading a person actually does, with a WCAG floor per row. The suites compute the
ratios from the stylesheet, so the numbers in this document are checked rather than
trusted.

The row that changed a value is `--color-text-faint`. It carried captions, hints and
footnotes at **3.37:1 on a card** and **3.15:1 on a raised one** — sentences nobody could
comfortably read. It now clears 4.5:1 against every surface it can land on (4.89 on a
card, 4.57 on a raised panel, 5.08 in a well). The hierarchy is unchanged; only its floor
moved.

Body text was already above AA and is held at **7:1** (AAA) on purpose — a dark terminal
is looked at for hours. Filled controls are measured on their own fill (`--color-primary-fg`
on `--color-primary-strong`, 6.37:1), the focus ring on the surface it outlines (9.89:1),
and the two edges as non-text indicators at 1.15:1 and 1.4:1 — a card's rim has to resolve
without becoming a line.

### Semantic colour, stated once

`SEMANTIC_USAGE` names the token behind each state the interface can state — positive,
negative, neutral, warning, information, error, active, inactive, selected, unselected,
unavailable — and says what each one _means_. Two rules fall out of it:

- **A fill implies an edge, never the reverse.** A tinted panel with a neutral rim reads as
  a rendering mistake, so a state that owns a wash owns its border. But `unselected` and
  `unavailable` are outlined states on purpose: a border around nothing is exactly how
  "offered and not active" is drawn.
- **A state may not wear the brand accent unless the state _is_ the accent.** `active` and
  `selected` do, because they mean "the current thing". An outcome wearing the brand colour is
  the original confusion, and the suite fails on it directly.

Colour is never the only signal: every row is named after a meaning rather than a hue, and
the suite asserts that none of the vocabulary mentions a colour word. A gain is stated by a
sign and a figure, a caution by a word; the hue agrees with the statement rather than
carrying it alone.

### Task 2: one shell, one well, four knobs

The card system is `web/src/components/Card.tsx` and it is deliberately small. A card is
four decisions, each answering a different question:

| knob       | answers                         | values                                                         |
| ---------- | ------------------------------- | -------------------------------------------------------------- |
| `tone`     | which layer is this?            | `default`, `raised`, `sunken`                                  |
| `variant`  | where does the light come from? | `plain`, `accent`                                              |
| `emphasis` | which card is the screen about? | `none`, `accent`, `success`, `warning`, `danger`, `info`, `ai` |
| `density`  | how much air does it get?       | `compact`, `cozy`, `spacious`                                  |

Plus `wash` (a state card takes its tone's fill as well as its edge), `as` (`div`, `section`,
`article`, `figure`) and `interactive`. Those are the additions this phase made, and each
one closed a real duplicate.

**`variant="accent"` is the agent's under-lit face.** Phase 7.2.1 built a card lit from
below for the agent surface; that light is now the card system's `accent` variant, so "the
light moved" is how the product says _this one is the feature_ — instead of "this one is
brighter". It replaces `panel-gradient edge-highlight` rather than stacking with it, because
both are `background-image` and `cn` is a plain join that does not resolve conflicts.

**`wash` is the fill half of a state.** `emphasis` alone states a tone in the edge, which is
right for a card in a grid of cards — the fill belongs to the panel. But a refusal, a retry,
an upgrade prompt _is_ the state, and that meant `border-danger-border bg-danger-soft`
written by hand wherever it appeared, always as a pair because two halves that move together
should be asked for once.

**`CardTile` is the well, at four spacings and two depths.** `rounded-[var(--radius-control)]
border border-border bg-surface-sunken px-3 py-2` was the single most-copied string in the
tree. The padding is a prop (`none`, `tight`, `default`, `roomy`) rather than a `className`
because `cn` does not dedupe: a caller writing `py-3` beside the tile's own `py-2` leaves two
utilities on one property and the winner to the stylesheet's order. `none` is a real step —
a well that _frames_ a screenshot or holds a control rail has no padding of its own.

### What was removed from the call sites

- **The hand-written wells — fifty-odd of them — collapsed onto `CardTile`** (46 usages
  today, plus the ones the exceptions below keep). Seven near-identical paddings — `px-3 py-2`,
  `px-2.5 py-2`, `px-3 py-3`, `p-3`, `px-3 py-2.5`, `px-2.5 py-1.5`, `px-2` — folded to four
  steps.
- **Card shells across every implemented page and component** moved onto `Card`: 206 usages
  across 76 files. The brief was "do not update only selected pages", and the audit that
  enforced it is the scan below rather than a list of files someone remembered.
- **`--radius-card`, an undefined token**, was in use in four quality panels. Because
  `rounded-[var(--radius-card)]` resolved to nothing, those four rendered with **no corner
  radius at all**. They are `Card`s now, and the token is gone.
- `ConnectionStatus` filled its `success` panel with `bg-primary-soft` — the brand's wash.
  An "ok" surface and a brand surface were literally the same plate; it is `bg-success-soft`.
- Five hand-rolled copies of the "state card" (border + soft fill) became `emphasis` +
  `wash`; four hand-rolled raised micro-plates (`radius-inset`, `radius-tile`) became
  `CardTile tone="raised"`, collapsing two radius steps that meant the same thing.

### The rule that keeps it from drifting back

The suite fails on the _literals_: `rounded-[var(--radius-panel)] border border-border
bg-surface` and the sunken well base may only be written in `Card.tsx`. Exceptions are a
list with a stated reason each, and the suite also asserts that **every exception is still
real** — an allowlist entry for a file that no longer needs it is how an allowlist becomes a
loophole.

The eight remaining copies are all controls or marks, and each is a different kind of thing
from a surface:

- `Input`, `TradeForm`, `TradeTable`, `CancelTaskControl` — form controls that own their own
  `focus-visible` and invalid treatment;
- `Tabs` and `JournalTabs` — a segmented rail that scrolls, with a selected state of its own;
- `AcademyPage`, `ExamsPage` — fixed-size numbered marks, which are figures rather than
  surfaces.

### Deliberately not converted, with the reason

- **`Modal`** is a dialog at popover elevation. The card system's elevation is the panel, and
  an overlay is not a panel — forcing it in would mean teaching `Card` a fifth knob for one
  call site.
- **A selectable _card_ that is a `<button>`** (the decisions list) keeps its own shell: it
  needs `focus-visible` ring handling and a `aria-current`, and it is a control. Its selected
  and unselected _values_ are already the accent pair the token set defines.
- **The sticky action bar** in `TradeForm` is an action bar, not a card: it is translucent,
  blurred and pinned.
- **`AgentCard`'s inner panel** is the one place the under-lit face is composed at a nested
  radius: the frame is a 1px padding band, so the inner surface has to be `radius-panel - 1px`
  to sit concentrically. The _light_ is the shared `agent-glow` utility, so there is still one
  definition of it.
- **Progress tracks** (`h-1.5 rounded-pill bg-surface-sunken`) are tracks. They are a recess
  in a bar, not a well containing content.

### What was not changed

No new features, no page redesigned, no component API broken: the additions to `Card` and
`CardTile` are new optional props, so every existing call site compiled unchanged. The 7.1,
7.2 and 7.2.1 suites were not weakened — one assertion was made _narrower_ (the card tone
check now reads the entry's own value rather than the comments around it) and one was
extended (`agent-glow` gained the card system as a reader, because the accent variant is the
same light rather than a second copy of it).

19 new assertions cover this phase in `tests/frontend-color-harmony.test.ts`, all read from
source and offline, plus the two contract updates above.
