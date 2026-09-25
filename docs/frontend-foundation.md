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

## 14. Phase 7.2.3 — the card form, in every drawer category

Phase 7.2.2 built the system and converted the call sites it could reach, but the reference's
_composition_ — a title block, a hairline rule, a list of rows, a closing action — had only
reached Dashboard, AI Workspace and a handful of named panels. This phase is the scope
correction: the same form, on every card, in every section the drawer lists, from Dashboard
through Settings.

### The audit, and the bug in it

Before touching anything, the tree was walked and measured: for every file that renders a
`Card`, how many headers, titles, descriptions, rules and bodies it has. The first version of
that audit matched `<Card` with a character class — `<Card[ >]` — which silently missed the
twelve files whose `<Card` is followed by a newline and a multi-line prop list
(`AnalysisReadinessPanel`, `PortfolioPanels`, `AssumptionNotice`, `RetryState` and friends).
It reported 54 card-bearing files; the real number is **66**. The corrected audit matches
`<Card\b`, which also stops `<CardHeader`/`<CardTile` from counting as a card.

What it found:

|                                                               | before | after   |
| ------------------------------------------------------------- | ------ | ------- |
| files rendering a card                                        | 66     | 66      |
| `<Card>` usages                                               | 206    | 219     |
| `<CardHeader>`                                                | 168    | 196     |
| of those, carrying the rule (`divider`)                       | **3**  | **190** |
| `<CardTitle>`                                                 | 168    | 197     |
| `<CardDescription>`                                           | 119    | 133     |
| `<CardContent>`                                               | 106    | 209     |
| hand-rolled titles lifted out of a body (`pt-4` + raw `<h3>`) | 24     | 0       |

The rule is the part that mattered. `CardDivider` existed and was used **nowhere**: a card's
head and its body were separated by nothing, which is why every panel read as one undivided
slab. Three headers carried `divider` and all three were the hand-written Portfolio ones from
the previous turn.

### The rule needed a rhythm, and the rhythm found a collision

A rule is not enough on its own. `CardHeader` is `px-4 pt-4` with **no bottom padding** — the
body's own `pt-4` was the only thing keeping a title off its contents — so dropping an `hr`
under the head would have drawn the line into the descender of the title.

The obvious fix is a margin on the rule, and that is the one thing this codebase cannot do:
`cn` is a plain join with no conflict resolution, so `<CardDivider className="mt-4" />` beside
the component's own `m-0` leaves the winner to stylesheet order. "The rule is 16px under the
title" must not depend on which utility Tailwind emitted last — that is the same class of bug
that produced the 7.2.1 overflow. So the spacing is a **padding on a wrapper**, and the scale
learned a third entry:

```
DENSITY.cozy = { header: 'px-4 pt-4', rule: 'px-4 pt-4', content: 'px-4 py-4', footer: 'px-4 py-3' }
```

The head's `pt-4`, the rule's band `pt-4`, then the body's `py-4`: title, a breath, the
hairline, a breath, the contents. The reference's own rhythm (a flat `gap: 1rem`) expressed in
the scale that already existed, so `density="compact"` tightens all three together.

`CardHeader` also gained `flex-wrap`. The heads it replaced nearly all wrote it by hand — a
long title beside a control has to be able to push the control onto its own line at 390px, and
the `actions` group is `shrink-0` by design (a control must never be squeezed). It just was
not part of the system, so half the hand-rolled headers forgot it.

### The two codemods, and the one that shipped a bug

Two throwaway scripts did the mechanical work, and both are deleted before the commit:

- **`divider` on every header that has a body.** 164 headers across 36 files. The script
  parses each file with the TypeScript compiler, finds the `CardHeader` elements whose parent
  has _rendered content_ after them, and inserts one attribute. A header that is the last child
  of its card is skipped, because a rule across the bottom of a header-only panel is a line
  pointing at nothing; a header followed only by a comment is skipped too.
- **Lifting titles out of bodies.** 11 cards, in `PortfolioPanels`, `PortfolioInsightCard` and
  `AssetAllocationChart`, where the shape was `<CardContent className="… pt-4">` with the
  title row as its first child — the pre-7.2.2 pattern where the card's name lives _inside_
  its contents. It is rewritten to `CardHeader divider` + `CardTitle` + a `CardContent` that no
  longer needs a `pt-4` to clear a title that is no longer there.

The lift script's first run was **wrong**, and the way it failed is worth keeping: it rebased
the title's offsets against the title element instead of against the element being lifted, so
anything inside a wrapper row (`<div><Icon/><h3>Name</h3><Badge/></div>`) got the closing tag
spliced into the middle of the markup. `tsc` caught it immediately — `JSX element 'h3' has no
corresponding closing tag` — and the three files were restored from `git` rather than patched,
because a bad codemod leaves no useful partial state.

### A dead class, found while measuring

`text-body-sm` appears 93 times and **emits no CSS at all**. Tailwind v4 only generates a
`text-*` utility for a key in the `--text-*` namespace, and there is no `--text-body-sm` — so
every "slightly smaller body" was rendering at the inherited body size, which is exactly what
`text-body` sets. The replacement is therefore pixel-identical: the tree stops carrying a
class that looks like a size and is not one. Every card _description_ among them became the
`CardDescription` the system owns, which is the same 11px the other 119 descriptions already
used.

### Variety was the point, so the tick list did not go everywhere

The reference's signature row — a filled accent disc with a dark glyph, and a sentence beside
it — already existed as `AgentCardList` / `AgentCardItem` / `AgentCheck`, built in Phase 7.2.1
and used only by the agent surface. It is now used in **8 files**:

| where                                  | group     | what it marks                               |
| -------------------------------------- | --------- | ------------------------------------------- |
| Dashboard — _Strengths_ / _Watch list_ | workspace | statements that hold / findings that do not |
| AI Workspace transcript                | workspace | the rows it was always for                  |
| Journal — _Reading these numbers_      | workspace | three caveats, each in its own tone         |
| Trading Lab — the approval pipeline    | workspace | an **ordered** list: the rows are steps     |
| Exams — locked examinations            | learning  | the gate each locked exam waits on          |
| Usage — plan entitlements              | system    | what a plan includes, ticked                |
| Settings — data provenance policy      | system    | three guarantees                            |

Everything else stays what it is: a metric card is a compact card with a figure in it, a
badge cloud is a badge cloud (the Academy curriculum), a table is a table, a control bar is a
control bar. That is the variety the brief asks for — **one** header anatomy and **one** rule,
with the composition left to the content. Converting every card to a tick list would have been
the repetitive, fatiguing outcome the brief warns against.

### Cards that are deliberately still not headed

Measured, listed, and left alone with a reason — the audit's 18 remaining "header gaps" are
almost entirely these:

- **State surfaces whose content _is_ the state**: `EmptyState`, `RetryState`, `ConnectionStatus`,
  `Skeleton`, `LoadingState`, `AssumptionNotice`, `ClarificationQuestionCard`. A title over
  "nothing here yet" restates the sentence.
- **Container cards**: `ChartAdapter` (the `figure` head is the caller's), `TradeFilters` (a
  control bar), `TradeTable` (a toolbar and a `<caption>`), `PerformanceChart`'s `ChartSurface`
  (the chart's own well, framed by the card above it).
- **`FormSection`'s `<h3>`**: it wraps the disclosure button. It is an accordion trigger, and
  its `border-b` _is_ the rule when open.
- **The transcript message card** on AI Workspace: a byline — avatar, speaker, epistemic badge,
  timestamp — not a name. It already uses `tone`, `emphasis` and `wash`.
- **Skeleton cards** on `EvaluationPage`, `PortfolioPage`, `UsagePage`, `ProfilePage`: the
  head's placeholder is itself a `Skeleton`, so there is no title to put in a `CardHeader`.
- **`MissingInformationPanel`'s and `ProfilePage`'s remaining `<h3>`**: section headings for a
  _page_ region, not names of cards.
- **Capability pipeline stages**: a numbered row. Its name is a `CardTitle`, but the number is
  the marker, so it keeps the row composition rather than growing a head and a rule.

### Also in this phase

- Four cards that used a second `CardContent` with a `border-t` as a footer band now use
  `CardDivider` + `CardContent`, so the rule between a card's body and its closing note comes
  from the system rather than from a border utility written at the call site.
- `SubscriptionPlanCard`'s included entitlements use `AgentCheck` — the reference's disc — in
  place of a bare lucide tick.
- `PlanComparison`'s hand-rolled `<section><header><h2>` became the `Section` component, which
  is the same head the page-level sections use.
- Six internal sub-headings inside cards (`What each cost means`, `Findings`, `Attempts`, …)
  were `<h3>` — the _same_ level as the `CardTitle` above them — or a `text-body-sm` label that
  rendered at body size and therefore did not read as a heading at all. They are now `<h4>`
  micro-labels, one style: `text-caption font-semibold text-text-muted uppercase`.

### What was not changed

No functionality, no copy, no data shape, no route. Every change is a `className`, an element
name, or the wrapper a body sits in — with the deliberate exception of the two collateral fixes
the audit turned up (the dead `text-body-sm` class, and the four hand-rolled footer rules).

Verified after the change, on the built bundle:

- `npm run typecheck:web` clean; `npm run typecheck` clean.
- **1298** unit tests across **66** files, unchanged from the 7.2.2 baseline — including the
  19-test colour-harmony contract and `test-hygiene`.
- `npm run build` and `npm run build:web` clean; `npm run desktop:verify` still **0 errors,
  4 warnings** across 51 checks.
- **27** browser end-to-end assertions.
- Horizontal overflow measured at **1440 / 834 / 390** on **all 14** drawer pages:
  `documentElement.scrollWidth - clientWidth === 0` everywhere. The structural probe on the
  built bundle confirms 12 cards and 11 rules on Dashboard, 2 tick lists, and **no card whose
  rule is its last child** — the rule always has contents under it.

Four of the fourteen pages (Portfolio, Evaluation, Usage, Profile) render their unavailable
state in the preview, because they read from a backend that is not connected: their cards are
covered by typecheck, by the unit suites and by the codemods, but not by the browser sweep.
That is a limit of the preview, not of the change.

## 15. Phase 7.2.4 — one system, six surfaces

§13 gave the product one card and four knobs. §14 put every card in the drawer on the reference's
form. Both were right, and together they produced the failure this phase exists to answer: every
call site took the defaults, so a page of twelve cards was twelve copies of one plate. A metric
card, a chart, a dataset, a notice and a calculator rendered as the same object — the _only_
variety in the tree was whatever a page had added by hand, which is how the product arrived at
thirty cards each restating the border, the fill and the shadow.

The correction is one word, `surface`, and six faces.

### The six, and why each one earns its own face

`surface` is not a fifth knob. It is a **name for a combination** of the existing four — which is
what makes the kinds of card in the product an enumerable list rather than a habit, and what stops
"this is a metric card" from quietly meaning something different on the next screen.

| `surface`  | what it is for                              | tone    | variant | emphasis | density  |
| ---------- | ------------------------------------------- | ------- | ------- | -------- | -------- |
| `featured` | the one card the screen is organised around | default | accent  | accent   | spacious |
| `metric`   | one figure, read at a glance                | raised  | plain   | none     | compact  |
| `data`     | a chart, a table, a stream                  | default | plain   | none     | compact  |
| `info`     | prose, principles, policy — **the default** | default | plain   | none     | cozy     |
| `action`   | a card whose job ends in one control        | default | plain   | none     | spacious |
| `utility`  | a readout or a control cluster              | sunken  | plain   | none     | compact  |

Two rules hold the set together, and both are asserted rather than assumed:

- **no two resolve to the same four values.** Two names with one combination would be one card
  wearing two names, and a call site asking for the second would be asking for nothing.
- **every one has a face of its own.** A surface with no face would silently take the generic one,
  which is the whole failure this phase set out to fix.

### The faces

Where the four knobs answer "which layer", "where does the light come from", "which card is this
screen about" and "how much air", the face answers the third question the knobs cannot: **what kind
of object is this, before you read a word of it.**

| `surface`  | face                                                    | edge                    | what changed on the surface                                                                      |
| ---------- | ------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------ |
| `featured` | `bg-surface shadow-panel agent-glow edge-under`         | `border-primary-border` | unchanged — under-lit, and the only glow                                                         |
| `metric`   | `bg-surface-raised shadow-plate face-corner`            | `border-border-strong`  | raised fill, corner light, broad inset shine, harder cast                                        |
| `data`     | `bg-surface shadow-frame`                               | `border-border`         | **no face at all**: no gradient, no top hairline, closed by an inner hairline and a halved shine |
| `info`     | `bg-surface shadow-panel panel-gradient edge-highlight` | `border-border`         | unchanged — the product's panel                                                                  |
| `action`   | `bg-surface shadow-panel face-lintel`                   | `border-border-strong`  | an accent tint along the top edge                                                                |
| `utility`  | `bg-surface-sunken shadow-control-inset`                | `border-border`         | unchanged — the recess                                                                           |

`info` is the fall-through in the component, not by convention: a card with no `surface` renders
`plainFace(tone, variant)`, and `surface="info"` is declared as exactly that string. The suite
asserts the equality, so the two cannot drift into a seventh undocumented treatment. This is also
why nothing in the tree writes `surface="info"`: every unannotated card already is one.

### The reference's two signature details

Both come from the attached card form, and both were kept in **shape** while their mechanism was
replaced:

- **The corner light.** The reference lights its card from a stack of six radial pools. That idea
  is kept as one pool — light arriving from a corner and falling off across the surface — and the
  two accent pools are dropped, because on a product card they would be a second decorative accent
  competing with `emphasis`.
- **The inset shine.** `box-shadow: 0px -16px 24px rgba(255,255,255,0.25) inset` is the reference's
  opening detail: a broad pool of light inside the top of the card rather than the 1px hairline the
  rest of the product uses. Kept at 9% and inset by 14px — light rather than a white smear — and
  halved on `data`, whose body is what should carry the light.

What was **not** copied, and why: the reference's rotating `card__border::before`. It is
`position: fixed` with a 200%-wide box and an `animation`, and it is the same construction that made
the viewport scroll sideways in Phase 7.2.1. The product already has one ambient animation, on the
agent card's ring, and it is clipped.

### Radius

`--radius-panel` moved from `0.875rem` to `1rem` — the reference's own `border-radius`. At 16px a
corner is a clear quarter-circle rather than a softened right angle, which is what lets a card hold
raised tiles without the two radii reading as the same surface. `--radius-inset` and
`--radius-control` are untouched, so the well and the tile keep their step down.

### Where the surfaces were spent

74 cards across 23 files. The distribution is the design: `data` 29, `metric` 26, `utility` 11,
`featured` 6, `action` 2 — and the remaining cards in the tree carry no surface at all, which is a
decision too.

| drawer group | sections     | what was differentiated                                                                      |
| ------------ | ------------ | -------------------------------------------------------------------------------------------- |
| workspace    | Dashboard    | the stat row as plates; one featured                                                         |
| workspace    | AI Workspace | the transcript stays a transcript; the runtime readout is a frame                            |
| workspace    | Memory       | trust figures as plates, the growth chart as a frame, the policy as prose                    |
| workspace    | Research     | experiment metrics as plates; the timeline as a frame                                        |
| workspace    | Journal      | 10 plates for the headline figures, 6 frames for the chart wall, the footnote cards recessed |
| workspace    | Portfolio    | value and concentration as plates                                                            |
| workspace    | Evaluation   | the readiness and history readouts as frames                                                 |
| workspace    | Trading Lab  | the calculator as the action card, closed by the reference's full-width pill                 |
| learning     | Academy      | progress as plates, the three tracks recessed, one featured                                  |
| learning     | Exams        | scores as plates, the question panel as the action card                                      |
| system       | Activity     | the stream and queue as frames; the legend recessed                                          |
| system       | Usage        | credits and plan as plates                                                                   |
| system       | Profile      | preferences as plates                                                                        |
| system       | Settings     | appearance controls recessed, the safety posture featured                                    |

Variety is not the same as annotation. `action` is deliberately the rarest surface — it is for a
card whose job ends in one control, and there are two — and the informational panel is still the
majority of the tree, asserted as such: a page where all twelve cards carry a surface has moved the
uniformity, not removed it.

### Bounds

Every face and border is built from a closed set: a fill, a depth, a paint utility or a border
colour. Nothing in a face may move, resize or paint outside the card — no `overflow`, no
`position`, no transform, no `w-`/`h-`, no `animate` — and the suite enforces the set with the
7.2.1 regression named in the failure message. The two new effects are safe by construction: a
`radial-gradient` pool is painted in the element's own box, and an `inset` shadow is painted inside
the border box and clipped to it.

One paint per face, also enforced: `background-image` is a single property, so a face naming two
gradient utilities would show whichever the stylesheet happened to order last.

### What was not changed

No functionality, no copy, no data shape, no route, no element order, no breakpoint. Every change is
a `className`, a token value, or the `surface` prop on a card that already existed. The one
component edit outside the card system is `TradingLabPage`'s calculator button, which gained
`shape="pill" fullWidth` and a block wrapper so the reference's closing control resolves its width
against the card's body.

Verified after the change, on the built bundle:

- `npm run typecheck:web` clean; `npm run typecheck` clean.
- **1315** unit tests across **67** files, including the new 17-test card-surface contract
  (`tests/frontend-card-surfaces.test.ts`) and the 19-test colour-harmony contract.
- `npm run build` and `npm run build:web` clean; `npm run desktop:verify` still **0 errors,
  4 warnings**.
- **27** browser end-to-end assertions.
- The three faces read back off the DOM as three different treatments: `metric` at
  `rgb(16,24,35)` with a corner radial gradient and `inset 0 14px 26px -16px rgba(255,255,255,0.09)`;
  `data` flat (`background-image: none`) closed by `inset 0 0 0 1px rgba(255,255,255,0.027)`; the
  fall-through panel on its own linear sheen. All three at a 16px radius.
- Horizontal overflow measured at **1440 / 834 / 390** on **all 14** drawer pages:
  `documentElement.scrollWidth - clientWidth === 0` everywhere.

Four of the fourteen pages (Portfolio, Evaluation, Usage, Profile) render their unavailable state
in the preview, because they read from a backend that is not connected. Tabbed pages show their
first tab only in the sweep; the remaining tabs were checked individually by clicking them.

## 16. Phase 7.3 — tables, charts, indicators

Three shapes carry all of this product's structured information: a **table** of records, a **chart**
of a series, and a **mark** saying which way a figure went. Each had grown its own way of doing it,
and the three ways disagreed with each other.

### One table

`web/src/components/Table.tsx` is now the only place a `<table>` is emitted, and the contract suite
fails by name on a second one. It owns the head (uppercase, `border-strong` rule, `aria-sort` with
the inactive state as `none` and the arrow reserving its space so toggling a sort cannot resize a
column), the cell (`numeric` decides alignment _and_ the monospaced face in one prop, so a figure
cannot be monospaced and left-aligned), two densities, the row states (hover, selected, positive,
negative, muted) and the three content states — including `TableEmptyRow`, which keeps the head so a
reader can still see what would have been there.

Six hand-rolled tables moved onto it: the journal's trade history, the three analytics breakdowns,
risk summary, evaluation history and the plan comparison. Four cell paddings, three head treatments
and two ways of drawing the rule under a head became one of each. `tabular-nums` is gone from the
tree — it set the figure variant and left the font, which is exactly how a column of prices ended up
in two faces.

### One plot

`web/src/components/charts/ChartFrame.tsx` owns the frame, the shared grid and baseline, and the
three content states. Both charts now route loading, empty and error through `ChartStatePanel`; the
market chart used to draw an empty grid for data that had not arrived, which reads as a market that
did not move. The plot's height is a style and never a layout size, the series is `direction: ltr`
(so an RTL locale cannot mirror a time axis while the labels stay upright), and no chart may set its
own overflow — the frame clips. `Sparkline` insets its geometry by half a stroke instead of relying
on `overflow-visible`, so a hairline of light no longer lands on the surface behind it.

### One direction

The vocabulary — `up`, `down`, `flat`, `unavailable`, what each is called and what ink it is
written in — lives in `web/src/design/trend.ts`, a module with no JSX, because the tables, the
calendar and the decision engine all classify a figure without drawing it. `Trend` adds the cues: an
arrow, a word in the accessibility tree, and the ink last. `+0.69R` and `−0.69R` were previously the
same string in two colours; a missing figure is now an absence (`not scored`) and never a zero.

### The overflow, measured properly

This is where the interesting work was, and where §15's claim needs a correction. That measurement
used `documentElement.scrollWidth - clientWidth` **on each page's default view**, and it passed on
all fourteen while a real defect sat one tab away: the journal's trade history could be panned
**329px** sideways at 390px. `scrollWidth` on an ancestor with `overflow: visible` includes the
scrollable overflow of _nested scroll containers_, so it is the wrong probe — and the reason the
defect survived the sweep that introduced the tables. The probe that finds it is the one the browser
actually answers:

```js
document.documentElement.scrollLeft = 700; // ask to pan
const panned = document.documentElement.scrollLeft; // 0 means no real overflow
```

Switching to that probe, and sweeping **every tab of every section** rather than the default view,
found three distinct defects at 390px — all three the same underlying fact wearing different
clothes: _a box that must be able to shrink was refusing to._

| View                    | Pan   | Cause                                                                                                                                                                                                               | Fix                                                                                                                                   |
| ----------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Journal · Trade history | 329px | `sr-only` is `position: absolute`, so a reader-only span at the far right of a 1080px row took the `Card` behind the table — positioned for its own shine — as its containing block and escaped the scroller's clip | every scroll container is now positioned: `relative overflow-x-auto`                                                                  |
| Journal · Analytics     | 110px | a card holding a table in a scroll container reported the table's minimum as _its own_, so the card in a `grid gap-4 xl:grid-cols-2` track pushed the grid wider than the viewport                                  | `Card` is `min-w-0`; a card never sets the page's width                                                                               |
| Journal · Calendar      | 32px  | `CardHeader`'s actions group was `shrink-0`, so wrapping the header row moved the overflow instead of removing it — a group of badges is wider than a 390px card on its own line                                    | the actions group shrinks _and_ wraps; a control is still never squeezed, because a flex item's automatic minimum size is its content |

The rules are asserted, not remembered: every scroll container in the tree is positioned, `Card`
keeps `min-w-0` and never hides its own overflow, and the actions group cannot go back to
`shrink-0`. `overflow-hidden` on the card would have "fixed" all three and silently amputated a
table, a tooltip or a chart that legitimately needed the box, which is why the suite forbids it.

### Verified

- Both typechecks clean.
- **1342** unit tests across **68** files, including the new 27-test data-component contract
  (`tests/frontend-data-components.test.ts`).
- `npm run build` and `npm run build:web` clean; `npm run desktop:verify` **0 errors, 4 warnings**.
- **27** browser end-to-end assertions.
- Pan sweep at **1440 / 834 / 390**: `scrollLeft` stays **0** on all **14** sections and every tab
  reachable inside them — the three defects above were the only views that moved, and are fixed.
- Read back off the built bundle: the trade table's scroll container is `position: relative`, 230px
  wide, `scrollWidth` 1080 — the table scrolls inside its own box while the document does not move;
  the analytics breakdowns sit in 264px cards with their tables scrolling internally.

The backend-dependent tables (portfolio holdings, evaluation history, the plan comparison) render
their unavailable state in the preview, so their markup is covered by the typecheck and the source
contract rather than by the browser sweep.

## 17. Phase 7.4 — the system, as the application actually uses it

7.1–7.3 built the system. This section is about the gaps between its parts, which is where a design
system fails in practice: a second implementation of a control that drifts, a cue that disappears, a
target nobody can hit, a figure that reorders itself in one writing direction. The contract suite is
`tests/frontend-integration.test.ts` (11 tests) and it states each rule as what the product must _not_
contain, because that is what a later change can break without noticing.

### Responsive

Measured, not asserted from classes. At **1440 / 834 / 390**, every one of the 14 drawer sections and
every tab reachable inside them was swept with the pan probe from §16 — `scrollLeft = 800`, read it
back — and the answer is **0 on every view**. The rail collapses to icons at 834 and expands to 264px
at 1440; content grids start at one column and widen at their breakpoints; the journal's tab rail keeps
one row and scrolls inside its own box rather than wrapping into three (the Phase 5.10 failure mode).

No shadows, shine, gradients or glow were changed in this phase, and the earlier rule that none of them
may move, resize or paint outside its card is still asserted by the 7.2.4 suite. `overflow-hidden` is
still forbidden as an overflow fix, for the reason §16 records.

### Accessibility and interaction

- **One tab strip.** The journal had its own rail, trigger and panel, because it wanted a sliding
  active indicator. The duplicate is gone — `JournalTabs.tsx` deleted, the journal renders the shared
  `Tabs` — and with it went the defect that made the duplication more than untidy: the journal's
  trigger and panel carried `focus-visible:outline-none` with nothing drawn in its place, so the one
  control a keyboard user reached _after_ the strip was the one control that showed no sign it was
  there.
- **One focus ring, stated once** in `global.css`, and the suite fails on an `outline-none` that has no
  ring, shadow, border colour or underline beside it. Five exceptions are named with their reasons —
  they are field borders and dialog surfaces, and the suite also asserts each named exception is still a
  real line, so the list cannot rot into blanket permission.
- **Targets.** The journal's figure hint was a bare 13×13 glyph and the only way to read what a figure
  is measured against. It is a 28px box with the icon centred and equal negative margins, so the margin
  box the flex line measures is unchanged and the header does not grow. The product's smallest button
  stays 32px, asserted so a future `xs` size cannot be added quietly.
- **Direction.** The shell's toggle sets `documentElement.dir`, and two rules keep the RTL case honest:
  the chart frame pins its plot to `direction: ltr` (a mirrored series reverses the axis while the
  labels stay upright), and `.num` now declares `unicode-bidi: isolate; direction: ltr`. A sign is a
  _neutral_ in the bidi algorithm, so `−1.00R` beside right-to-left text resolves to `1.00R−` — a
  different number wearing the same digits. Measured on the built bundle under `dir="rtl"`, all ten
  signed figures in the journal already resolve left-to-right, because the product ships no Persian copy
  and a figure alone in a cell is a single run; the rule is what keeps that true when it does. It is a
  no-op today, which is why it was cheap to state.
- Contrast is unchanged from the 7.2.2 palette (19 assertions in `frontend-color-harmony.test.ts`),
  which is what made the touch-target and focus findings the only accessibility defects in the phase.

### Integration

Every page builds its screens from the shared parts: the suite fails on a raw `<table>`, a raw
`role="tablist"` or a direct Radix import inside `web/src/pages`. The audit found the one duplicate
that mattered (the tabs) and no others worth removing: `panel-gradient`/`edge-highlight` are used by
`Card`, `Modal`, `Tooltip` and `Alert` — each a panel that owns its own face — and the plan comparison's
bordered frame is a deliberate plate around a matrix, with its reason written at the call site.
Variety was left alone: the six card surfaces, the two table densities, the four chart tones and the
per-category `surface` assignments from 7.2.4 are all still there.

### Verified

- Both typechecks clean; `format:check` clean.
- **1359** unit tests across **70** files, including the new 11-test integration contract and the
  12-attack Phase 7 security stage.
- `npm run build` and `npm run build:web` clean; `npm run desktop:verify` **0 errors, 4 warnings**.
- **27** browser end-to-end assertions, and four of these rules were already checked there at runtime
  rather than in source: no sideways scroll at five viewports (1440×900, 1024×768, 768×1024, 430×932,
  390×844, 375×812), "keeps every control big enough to touch at phone widths" across every drawer
  section at three widths, "survives a right-to-left mirror without overflowing", and "names every
  control and every image the browser paints". What this phase added to that layer is the part it did
  not have: a ring on the panel a keyboard user lands _inside_, and a target rule that covers a
  focusable span rather than only the elements a form would post.
- Pan sweep with the pan probe: 0 on all 14 sections and their tabs at 1440 / 834 / 390, with the rail
  collapsed at 834 and expanded at 1440.
- The Phase 7 security stage: 12 attacks, 12 pass, 0 not applicable, 0 unresolved CRITICAL or HIGH —
  recorded in `docs/security-gate-baseline.json` under `phase7`, with the Phase 6 checkpoint untouched.

## 18. Phase 7.5.1 — Persian, as a language the product owns

The phase is explicitly _not_ translation. It is the layer a translation will be written into: a
knowledge store with provenance, a locale foundation that agrees with Unicode and CLDR, and a typeface
that ships as a file. Three artefacts — `web/src/language/model.ts` (the shape), `memory.ts` (the
store), `fa.ts` (the locale) — plus `seed.ts` and `web/public/fonts/`. The full record, including the
resource evaluation, is `docs/persian-language.md`; the contract suite is
`tests/persian-language.test.ts` (46 tests).

### The language memory

An entry is `{ key, kind, locale, value, status, confidence, version, provenance, examples, mapping,
notes }`, where `kind` is one of the seven categories the phase names and `provenance` carries an
origin, **a mandatory reference** and a timestamp. `status` is the trust ladder — `proposed` →
`validated` → `trusted`, with `deprecated` as retirement — and only `trusted` knowledge may be
rendered as interface copy.

The update path is the whole design: `propose → validate → version → review`. A proposal is
schema-validated before it is looked at, its `baseVersion` must match what the store holds (a proposal
written against version 2 cannot silently replace version 4 — it fails with `CONFLICT`), and the status
it ends up with is **decided by the store from its origin, never by the caller**. `human-review` and
`upstream-standard` may be trusted; `agent-proposal` may not, ever: model output is parked as `pending`
and cannot touch a trusted entry even with a correct `baseVersion`. Promotion takes a review with a
trusted origin, so an agent cannot review its own proposal, and the reviewer's provenance — not the
model's — becomes the provenance of what is current. Nothing is edited in place: a correction archives
what it replaced, `revisions(key)` holds every version, and `history()` is an append-only log.

**Separate from Agent Memory and Secrets, as a shape rather than a policy.** Agent Memory mints `mem_*`
ids (`src/memory/store.ts`) and holds statements expected to change; this store addresses `lang:<key>`
and holds reviewed decisions, and a key reading as an Agent Memory id is refused at the door. The
language directory cannot reach `src/` at all — the declared boundary makes it unresolvable — and no
entry has a field a credential could occupy: the suite pins the exact field list and fails if any field
ever matches `/secret|token|credential|password/`. A durable store is **not** built; the snapshot is
the persistence seam, exactly as `src/memory/store.ts` was in memory in Phase 1.

The seed is deliberately small and deliberately _only_ what this phase can source: the orthographic
rules whose authority is Unicode, plus two decisions this phase recorded with `human-review` provenance
(the technical-figure rule and the punctuation rule). There is no Persian glossary — inventing one
would be the exact failure the store exists to prevent. Each orthographic rule that states a character
mapping is asserted against `normalizePersianText`, so the store's prose and the code's behaviour are
one fact stated twice.

### The fa-IR locale foundation

Normalization folds the Arabic letters Persian does not write (U+064A/U+0649 → U+06CC, U+0643 →
U+06A9), the Arabic-Indic digits onto the Persian set, the tatweel and the Arabic vowel marks; it
preserves the ZWNJ and anything Latin, and it is idempotent. Digits move in both directions. Mixed text
is isolated with Unicode's LRI/RLI/FSI … PDI controls rather than a deprecated embedding. Dates, times,
currency, relative time, plural categories and collation all come from `Intl` — and every separator,
digit set and calendar claim this module hard-codes is asserted against CLDR rather than typed from
memory: `arabext` numbering, U+066B/U+066C separators, U+066A percent sign, the Persian calendar, the
`one`/`other` plural categories.

Two things are stated with their edges rather than half-done. The vowel-mark removal names its range
(U+064B–U+0652 and U+0670) and **excludes** U+0653–U+0655, the combining hamza and madda, because a
decomposed Persian letter can legitimately be built from them — removing them would change a letter,
not a vowel mark. And ZWNJ _placement_ is not implemented at all: this phase keeps the ZWNJ exactly as
it found it, dropping only one at a string edge or beside a space where it joins nothing, because
correct `میرود` typography is a word-level decision that belongs in the store as a reviewed rule rather
than in a normalizer as a letter table.

### The typeface

Vazirmatn is vendored from a declared `vazirmatn@33.0.3` devDependency by `scripts/vendor-fonts.mjs` —
the **variable** face, one 108.5 KB woff2 covering weights 100–900 instead of nine static files — with
its OFL licence beside it and version, upstream, byte count and SHA-256 recorded in
`web/public/fonts/vazirmatn.json`. The suite re-hashes the shipped file against that record, and the
browser suite measures the rest. It is applied by `:lang(fa)` and never by `[dir='rtl']`: direction
decides flow, language decides typeface, and keying the face to direction would change how _English_
looks the moment the shell is mirrored. `@font-face` declaration downloads nothing, and nothing in the
interface sets `lang="fa"` yet, so this costs the existing product zero bytes — measured below rather
than argued. The desktop content security policy already permits it (`font-src 'self' data:`), so no
remote font origin was added anywhere.

`@persian-tools/persian-tools` was evaluated utility by utility and **not adopted**: everything the
layer needs today is CLDR, Unicode code points, or a handful of mapping lines the store can cite, and
the two functions that would add real value (word forms, half-space placement) are word-level Persian
typography with a named reviewer still to come. DadmaTools is a Python NLP pipeline and is not a
frontend dependency at any size; it stays deferred behind a real backend/offline NLP need. Both
evaluations, with the trigger that would change each decision, are in `docs/persian-language.md`.

### Verified

- Both typechecks clean; `format:check` clean.
- **1405** unit tests across **71** files (1359/70 before), including the new 46-test Persian contract
  suite: store separation, the controlled update path, CLDR agreement, normalization idempotence, bidi
  isolation, the sealed font, and the English formatters producing exactly what they produced.
- One real defect, found by running the locale layer on values rather than only asserting them: a
  missing currency code printed `۱٬۲۵۰٬۰۰۰٫۵ undefined`, because `Intl.NumberFormat` renders the name of
  a missing currency instead of throwing. The code's shape is now checked before it is used, so a
  missing or malformed code claims no symbol; the regression test is `claims no symbol when there is no
currency to claim`, and the English `formatMoney` path is untouched.
- `npm run build` and `npm run build:web` clean; the font and its provenance land in `web/dist/fonts`;
  `npm run desktop:verify` **0 errors, 4 warnings** (unchanged).
- **29** browser end-to-end cases, up from 27. Two are new and both are measurements: at 1440×900 the
  built application reports `lang="en"`, a body font stack with no Vazirmatn in it and **zero** requests
  for the font — then, once a `lang="fa"` element exists, the computed family resolves to Vazirmatn,
  `document.fonts.check` is true _with the sample text_ (a coverage answer, not a load answer) and the
  resource request appears, so the lazy fetch is real. The second renders a signed figure inside a
  right-to-left paragraph and asserts the sign is painted to the left of the last character: the `.num`
  isolation rule from §17, measured for the first time with Persian actually on the page.
- Desktop, tablet and phone are unchanged: the seven-viewport "never scrolls sideways" sweep
  (1920/1440/1024/768/430/390/375), the touch-target sweep and the RTL mirror check all pass against the
  same bundle that carries the new face and the new stylesheet rule.

## 19. Phase 7.5.2.1 — Persian that is normalized before anyone has to fix it by hand

Phase 7.5.1 built the store and the locale; this phase is the _correction_ layer over them, and it is two
new modules with no UI of their own — `web/src/language/rules.ts` (nineteen rules, in five kinds) and
`web/src/language/normalize.ts` (the pipeline and its report). Nothing imports them from the interface
yet: no screen is translated, so nothing in the product calls them, and the whole phase costs the running
application zero bytes. The full record is in `docs/persian-language.md`; the contract suite is
`tests/persian-normalization.test.ts` (26 tests).

### The question that makes it a different job from 7.5.1

`normalizePersianText` (7.5.1) answers _"are these two strings the same string?"_ and folds every digit
to do it. `normalizePersianContent` (this phase) answers _"is this text written the way Persian is
written?"_ over mixed content, and it must therefore know **where** it is: a URL, an email, a path or
slash token (`BTC/USDT`), a code span, a dotted identifier (`index.ts`) and a figure with a separator
(`3345.20`, `2026-09-19`, `1:3`) are runs nothing may edit. The suite asserts the split directly —
`normalizePersianText('XAUUSD 3345.20')` folds, `normalizePersianContent('XAUUSD 3345.20').text` does
not — because 7.5.1's docstring claimed the identity pass was "safe to run over mixed content", and for
digits that claim was false. It is replaced by the honest two-function contract rather than a flag.

Context is decided by neighbours rather than by a flag: a mark is folded only when the nearer of its two
neighbouring letters is Persian, so `quote, said the shell` keeps its comma and `نسبت ریسک 1:3` keeps its
colon while `قیمت ورود 3345 است` becomes `قیمت ورود ۳۳۴۵ است`. Ties go to Persian; text with no letter on
either side is left exactly as given.

### What it fixes, and what it only reports

Fixed: the six character folds (including NFKC **scoped to the Arabic script**, so `fi` and `２` in
English text are untouched), Arabic-Indic → Persian digits, digit shape by context, four spacing rules
(never touching newlines, blank lines or indentation), four ZWNJ hygiene rules (a ZWNJ beside a space or
at an edge joins nothing; one between two letters is never touched), and the Persian comma/semicolon/
question mark plus a percent sign that **follows its figure**, which is what CLDR itself does
(`fa-IR` → U+066A, `fa-IR-u-nu-latn` → `%`).

Reported and not fixed: the half-space that Persian writes and a space that a typist wrote — after
`می`/`نمی`, before `ها`/`های`/`تر`/`ترین` — because the same letters are also words of their own, and a
figure wearing Persian digits beside a technical token. Those are the two `report` rules; the entry that
authorises the first carries `confidence: 0.7`, so the uncertainty is stored rather than hidden.

### The learnable half, wired rather than described

Every rule names the language-memory key that authorises it, and the pipeline asks the store:

- a rule runs only while its key holds a **trusted** entry (`proposed` and `validated` are not enough —
  a correction is text a reader sees);
- an **agent proposal enables nothing**: the suite proposes a rule's entry from `agent-proposal`, proves
  the text is untouched, has a human reviewer accept it, and proves the rule starts working;
- **deprecating** an entry retires its rule with no code change, while rules on other keys keep working;
- a trusted **`exception`** entry contributes protected literals — the mechanism for the string a
  normalizer is right about in general and wrong about here. None is seeded, because none is justified
  yet; the mechanism and its test are the hook.

Making the half-space rules _automatic_ needs a word-level `from → to` pair in the schema; today's
`mapping` is one code point in, one code point or nothing out, and widening it would break the invariant
7.5.1 asserts. The trigger is a reviewed entry per pattern, and the schema change lands with it.

### Verified

- Both typechecks clean; `format:check` clean.
- **1431** unit tests across **72** files (1405/71 before), including the new 26-test pipeline suite: one
  regression case per rule with a first test that fails if a rule ships without one, a corpus of English,
  symbols, URLs, paths, identifiers and figures that comes out byte-identical with an empty change list,
  idempotence and determinism over the whole corpus, the four governance paths, and an RTL-safety case.
- `npm run build` and `npm run build:web` clean; `npm run desktop:verify` **0 errors, 4 warnings across 51
  checks** (unchanged).
- **30** browser end-to-end cases, up from 29. The new one runs the pipeline in Node and paints its output
  in the browser at 390×844 inside a `dir="rtl"`, `lang="fa"` wrapper: the painted text equals the
  corrected text, the technical figure inside it renders as a real run, and the paragraph neither exceeds
  the viewport nor pans the page. The seven-viewport sideways sweep, the touch-target sweep and the RTL
  mirror check all still pass, on the same bundle, with no component or stylesheet change in this phase.
- The rules were run over deliberately broken Persian as well as correct Persian, including a mixed
  paragraph (`XAUUSD در تایمفریم ۱ ساعته، 3345.20 را شکست و R آن 2.60 بود.`) that the pipeline reports as
  already correct — no change, no finding, which is the answer that matters for a paragraph a human wrote.

## 20. Phase 7.5.2.2 — the vocabulary, as knowledge rather than as strings

Two new modules — `web/src/language/terminology.ts` (the lexicon: catalogue, view, lookup, consistency)
and `web/src/language/terminologyUpdates.ts` (candidate → validation → source → accepted or rejected →
versioned) — plus six lines in `seed.ts` that compose the terms into the store. Nothing renders them: no
component reads the lexicon, the interface is still English, and the phase costs the running application
zero bytes. The full record, including the contested terms and every alternative rejected, is
`docs/persian-terminology.md`; the suite is `tests/persian-terminology.test.ts` (28 tests).

### One glossary, three pieces, and no second store

The phase's hardest constraint is a negative one: _do not create duplicate terminology systems_. So the
knowledge is not copied anywhere. The **catalogue** holds what a knowledge entry has no field for (the
English equivalent, the domain, the forms the product does not write, the usage sentence, the
confidence); the **store** holds the trusted, versioned half, one `terminology` entry per term whose
`value` is the preferred form; and the **view** joins them with the store winning, because the store is
what can be corrected, reviewed and retired. The seed _derives_ its entries from the catalogue
(`terminologyProposals`), so a term is written down once and cannot drift into two glossaries — and the
suite asserts the agreement in both directions, including that every store entry is a term the lexicon
can show.

The vocabulary is the product's, not a dictionary's: 57 terms across the six domains the phase names —
**14 trading, 6 risk, 6 agent, 6 memory, 7 education, 18 ui** — with 85 forms recorded as _not_ what this
product writes. Every page and group the shell renders has a preferred form, and the suite asserts the
mapping covers all fourteen navigation entries and all three groups.

### Consistency is reported, never rewritten

`terminologyFindings` names one concept's inconsistency at a time: the form found, the form this product
writes, the definition it belongs to, the offset, and a reason that says which of two facts it is —
"used to write this, and version _n_ replaced it" versus "this is understood and is not the preferred
form". A boundary check keeps it honest: `حد سود` inside `حد سوددهی` is not a match, `درس` inside `درسی`
is not, and a half-space joins a word rather than separating one. Text inside a technical span is skipped.

Nothing is rewritten, and that is a decision rather than an omission. Renaming a word inside a trade
rationale, a lesson note or an imported record changes something a human wrote deliberately; what this
product owns is the copy _it_ ships. So the check says what it found, and the copy that gets corrected is
the copy somebody is about to write.

The phase's "controlled alternatives where context genuinely requires a different wording" is the store's
`exception` kind, reused from §19: a form a reviewer names in a trusted exception entry is approved, so
the check stops reporting it while lookup still calls it an alternative and `preferredTerm` still returns
the preferred form. The decision lives in the store with a person's provenance, and no code changes to
allow it.

### A candidate only moves through the controlled path

Six checks run in the order a person would make them, each with its own refusal sentence: the candidate's
shape; that a preferred form carries Persian letters; that it is already canonical (the Arabic kaf is
refused with the canonical spelling named); that no alternative collides with another term's preferred
form; that the preferred form is not a form the product already rejects; and — the rule that makes the
store's history worth keeping — **a correction must name the form it replaces**, so the old form stays
reported instead of being rediscovered. Then the store does what it already does: model output is parked
as `pending` and cannot replace trusted terminology, a review promotes it with the _reviewer's_
provenance, and a rejection is recorded rather than half-applied. A rejection is a value, not an
exception, because "this word is not acceptable, and here is why" is an ordinary answer.

The suite exercises nine kinds of bad candidate, the parked-then-accepted path, the parked-then-rejected
path, a correction that becomes version 2 while version 1 is kept, a stale correction, and a snapshot
round trip that preserves the term, the correction and the rejection.

### Verified

- Both typechecks clean; `format:check` clean.
- **1459** unit tests across **73** files (1431/72 before), including the new 28-test terminology suite
  and the three Persian suites together at 99 tests.
- `npm run build` and `npm run build:web` clean; `npm run desktop:verify` **0 errors, 4 warnings across 51
  checks** (unchanged).
- Browser end-to-end unchanged at **30** cases: no component, stylesheet or bundle input changed in this
  phase, so the seven-viewport sweep, the touch-target sweep and the RTL mirror check pass on the same
  bundle — and the phase has no rendering to measure.
- The store grew from 15 entries to **72** (15 rules + 57 terms), and the one 7.5.1 assertion that
  required the `terminology` kind to be _empty_ was replaced by what is still true — no `translation`
  entries exist, because naming the vocabulary is not writing the copy.

## 21. Phase 7.5.2.3 — grammar, spelling, and one engine instead of four

Three new modules — `web/src/language/grammar.ts` (7 rules), `web/src/language/spelling.ts` (10 rules)
and `web/src/language/languageQa.ts` (the pipeline and the three decisions that make a suggestion
permanent) — plus the shared vocabulary they needed, which is the part worth reading first. Nothing
renders them: no component imports the QA pipeline, the interface is still English, and the phase costs
the running application zero bytes. The suite is `tests/persian-qa.test.ts` (32 tests); the full record,
including the two resource re-checks and the six defects verification found, is `docs/persian-language.md`.

### One runner, one gate, one meaning of _protected_

The phase could have grown a second pipeline next to §19's. It does not, and the way it avoids that is the
change with the longest reach: `normalize.ts` gained a **`runRules(input, rules, options)`** engine and an
**`authorisedOfRules(rules, memory, options)`** gate, and `normalizePersianContent` became one _caller_ of
them rather than the only implementation. The grammar half now gets the same three things the character
folds get — the memory gate that refuses an untrusted rule, the protected-span predicate, and an exact
report of every edit — for free, and cannot disagree with them, because there is nothing to disagree with.

`rules.ts` grew the vocabulary the new families needed: a `LanguageRule` (a `NormalizationRule` that also
carries the knowledge it stands for — its `value`, `notes`, `examples`, `confidence` and `origin`), a
`languageRuleProposals` list so a rule's own prose _is_ its store entry, `standaloneMatches` for the
whole-word boundary three separate rules were about to write for themselves, and two new rule kinds,
`grammar` and `spelling`. `terminology.ts` was refactored onto `standaloneMatches` rather than keeping its
private copy.

### 17 rules, and the enforcement is the honesty

Seven grammar rules and ten spelling rules, each one either **mechanical** (`enforcement: 'correct'`: the
answer is a fact about characters, so the fix is applied and the exact characters it replaced are in the
report) or a **pattern** (`enforcement: 'report'`: the shape is usually wrong and never certainly wrong,
so a person decides). Two of the seven grammar rules and nine of the ten spelling rules are mechanical;
the rest report. The split is the design, not a staging post — `۳ معاملات` needs a table of broken
plurals that does not exist, `خوبها` may be a legitimate noun, and `میشه` is a register choice rather than
a mistake. Each reported rule carries a confidence below 1 and says in its own `notes` what it does not
cover, and there is no score, no model and no probability anywhere in the types.

The grammar families are the five the phase asks for and nothing more: sentence structure (the object
marker and the verb that must follow it), verb forms and agreement, singular/plural usage, the ezafe,
adjective agreement, and the mixed Persian + English technical sentence this product is full of — where a
Latin token takes a space and the four suffixes that bind to it take a half-space.

### The pipeline is a pipeline, and it exposes its frames

`languageQa(text)` runs Text → normalize → grammar → spelling → terminology, and its two properties worth
having are negative ones. It **reuses** the layers rather than re-deriving them, and it **never re-bases
an offset**: every stage carries the text it received and the text it produced, because re-basing offsets
across four transformations is arithmetic that looks tidy and is eventually wrong. Nothing is written to
any store — a suggestion is a _reading_ of the text, and the knowledge that would make it permanent goes
through `promoteLanguageRule`, `retireLanguageRule` or `approveForm`, each of which is a decision with a
provenance.

The suite asserts the report is **complete**: replaying the corrections it lists, in the order the rules
ran and right-to-left within each rule, reproduces `report.text` exactly. That is a stronger claim than it
looks — nothing was changed that the report does not name — and it is the reason a per-suggestion slice
against the stage input is _not_ asserted instead: an offset belongs to the text its rule received, and an
earlier rule in the same pass has already moved every offset after it.

One deliberate departure from the flow the phase lists: terminology is checked **last**, on the text the
deterministic rules produced, rather than second. Checking it before them would report a form the pipeline
was about to change, against a text no caller holds. The stage report makes the order visible, so the
deviation is inspectable rather than implied.

### The suggestion-acceptance path is the store's, reused for the third time

`approveForm` writes an `exception` entry — the mechanism §19 built for the string a normalizer is right
about in general and wrong about here, which §20 reused for a context where a non-preferred term is
intended. A language QA suggestion is the third case, and it needs no new mechanism: the entry names the
form in its `examples`, `protectedLiterals` reads it, and the rule that found the form stops reporting it
while every other rule stops writing it. `promoteLanguageRule` goes through the ordinary `review` path, so
the provenance on an accepted candidate is the **reviewer's**, not the model's; `retireLanguageRule` is a
versioned decision with a reference rather than a flag in a config file.

### Verified

- Both typechecks clean; `format:check` clean; `npm run build` and `npm run build:web` clean.
- **1491** unit tests across **74** files (1459/73 before), including the new 32-test QA suite. The four
  Persian suites are 132 tests together: 46, 26, 28, 32.
- `npm run desktop:verify` **0 errors, 4 warnings across 51 checks** (unchanged).
- Browser end-to-end unchanged at **30** cases: no component, stylesheet or bundle input changed, so the
  seven-viewport sweep, the touch-target sweep and the RTL mirror check pass on the same bundle — the
  phase has no rendering to measure, and says so rather than adding a case that measures nothing.
- The store grew from 72 current entries to **88** (of 89 proposals — one rule ships as an
  `agent-proposal` candidate and is parked as `pending`, which is the learnable path demonstrated with
  the machinery §18 already built). The 7.5.1 assertion that required all seeded knowledge to be current
  was replaced by what is still true: everything seeded is either current or deliberately waiting on a
  review, and nothing is lost.

## 22. Phase 7.5.3.1 — reading a message, and the switch that outranks the reading

Three modules — `web/src/language/detect.ts` (Task 1), `web/src/language/profile.ts` (Task 2) and
`web/src/language/preference.ts` (Task 3) — plus the first piece of the Persian line a user can touch: a
**Language** card in Settings → Appearance. The suite is `tests/language-detection.test.ts` (23 tests) and
two new browser cases; the language record, including the two defects the verification found, is
`docs/persian-language.md`.

### Detection is a census, and it says so

`detectLanguage` counts letters per script and matches closed lists, and nothing else. No model, no
classifier, no score pretending to be a probability — because the layer around it stores _cited_ knowledge,
and `detected: 'fa'` has to be answerable with "32 of the letters were Persian and none were Latin" rather
than with "a model said so". Confidence is therefore a statement about **evidence**, not certainty: a
visible formula over the share of letters in the winning script and how many letters there were. `XAUUSD`
scores about 0.7 — real evidence and thin evidence — and a full sentence of one script scores 1.

Three decisions follow from that, and each has a test. **Digits are not evidence**: a price reads the same
in every language, so a message of digits alone is `unknown` with confidence 0 rather than Persian because
of its Persian digits. **`mixed` is a first-class answer**: a Persian sentence full of `XAUUSD` is the
normal shape of this product's text, and a detector that called it one language would be wrong about the
case it exists for. **A mix's confidence is how evenly divided it is**, not how sure the census is of one
language — one stray Latin token is a weak claim about mixing and it is already reported as the technical
token it is. Finglish is a closed list plus three Latin shapes with a stated ceiling of 0.85, and it refuses
to guess from one word: `salam` alone is `en`, and a message carrying English stopwords is English however
Persian one of its words looks.

Register comes from the register table §21 already owns plus two short closed lists; style is three
mechanical predicates; verbosity is word-count bands and is called a band. A tie is `neutral` rather than a
coin toss.

### The profile is a value, and the reply is one rule

Task 2 is one type: the detection, plus the person's standing choice, plus the resolution between them,
under `LANGUAGE_PROFILE_VERSION`. The separation is the design — detection is about the _message_ and
changes every time somebody types, the preference is about the _person_ and changes when they say so, and
the reply is the only thing that combines them. `resolveLanguage` states the precedence in one sentence:
**an explicit choice wins, otherwise the message decides.** Finglish resolves to Persian; a message with no
letters resolves to the product's own language with `source: 'default'`, because nothing was detected; and
when an explicit choice disagrees with the reading, `overridden` records it rather than reconciling it
silently.

The phase's honesty rule — analysis must never alter the meaning of the message — is structural rather than
promised. The profile holds **no copy of the message**: counts, closed-vocabulary verdicts and the exact
words that were evidence. The suite asserts every reported string is a verbatim substring of what was
typed, that the corrected paragraph the normalizer would produce appears nowhere in the reading, and that
the built profile's field names are exactly the closed list in `LANGUAGE_PROFILE_FIELDS` — so a field
describing _who somebody is_ fails here instead of shipping quietly.

### The switch overrides detection without joining the knowledge store

`auto` is a **value**, not the absence of one. Without it, a person who never opens Settings has silently
chosen English and a person who clears their choice cannot get back to automatic — and "override automatic
detection when explicitly selected" needs both halves to mean anything.

The preference is deliberately not in `LanguageMemory`: that store is shared, versioned and reviewed, and a
per-user setting is none of those things. `preference.ts` owns the key, the validation and the storage
access; the interface store **mirrors** the value so the control renders its selected state on the first
paint, and `storedProfileOptions` is the single seam a later agent stage calls. Persistence is
`localStorage` — the architecture has no settings API yet — and both directions go through one module that
swallows a hostile or missing store instead of throwing. A failed write is reported (`languageStorable`) so
the caption says the choice lasts until the app closes rather than showing a remembered state that is not
one. When a settings API arrives, `preference.ts` is the only file that changes.

The control is three buttons — Automatic, Persian (فارسی), English — beside Writing direction, using the
pattern already on that page: selected state in `aria-pressed`, expressed through the primary/secondary
variant. It is not a UI translation: the browser case asserts `document.documentElement.lang` is still `en`
after Persian has been chosen, because the switch sets the language of the _answer_.

### Verified

- Both typechecks clean; `format:check` clean; `npm run build` and `npm run build:web` clean.
- **1514** unit tests across **75** files (1491/74 before), including the new 23-test detection suite and
  a `web/src/store/ui.ts` change that the root typecheck now sees — which is how the store's two
  extensionless imports were found and corrected.
- `npm run desktop:verify` **0 errors, 4 warnings across 51 checks** (unchanged).
- Browser end-to-end at **32** cases (30 before). The two new ones are the phase's real rendering claims:
  the switch adopts and writes the choice, survives a **reload** with the interface still English, has
  exactly one pressed option, and puts all three options on screen at 375 px without panning the page.
- No new dependency, and the bundle gains exactly one module: `preference.ts`, plus the store change and
  the card in Settings. `detect.ts` and `profile.ts` are **not in the built JavaScript at all** — nothing
  in the interface imports them, and the shipped bundle contains no `finglish` and no `stopwords`, which is
  the measured form of "this phase did not put a language model in the product's download".

## 23. Phase 7.5.3.2 — what the turn is like, and a way to say how to answer it

Three more modules on the same shelf — `web/src/language/context.ts` (Task 1), `communication.ts` (Task 2)
and `guidance.ts` (Task 3) — plus one extension to 7.5.3.1's resolver. Nothing renders them and nothing in
`web/src` imports them, so the running application is unchanged again; the bundle argument at the end of §22
still holds, and the suite is `tests/language-context.test.ts` (22 tests). The language record, including
the six defects that running it found, is `docs/persian-language.md`.

### The context adds readings; it does not re-derive them

§22 read one message and said what it _is_. This phase asks what the interaction looks like, which is the
thing a response stage actually needs, and the phase's six bullets split cleanly into two halves: three the
earlier phase already answers and three it cannot.

Formality **is** 7.5.3.1's register, carried with the same confidence and the same markers, because a second
opinion about politeness is a second thing for the interface to disagree with. The suite asserts the two
agree on four messages, which is what makes "one language system" checkable. The dimensions that are new
are new questions: `setting` is the situation rather than the phrasing — `سلام، حد ضرر را چک کن` is an
informal greeting around a work request, and both readings are right — `expertise` is a _gradation_ of how
much of the message is the product's own vocabulary, and `intent` adds the one shape the earlier phase
cannot see, a statement that runs to several sentences or ties itself to the conversation and is therefore
making a point rather than reporting a fact.

Each dimension carries its evidence as a field, and the evidence is either verbatim from the message or a
store id for a concept the message named. Wording is measured as _density_, which is why `حد ضرر چیه؟`
reads as technical — a third of its three words are the product's vocabulary — and that is a fact about the
sentence rather than a guess about the writer. There is no dimension about a person, the produced object's
field names are a closed list the suite compares against, and the conflict case worth naming is that
`plain` wording and a _question about a stop-loss_ are two different dimensions, so the product can answer
`حد ضرر چیه؟` plainly and still call it technical.

### The strongest source wins, and the loser is named

Four things can have an opinion about each preference, and the file states their order once: an **explicit
instruction in the message** (`خلاصه بگو`, `رسمی بنویس`, `با معادل فارسی`), then **the message itself**,
then **what previous turns looked like**, then the **default**. The ordering of the middle two is the
design decision: the message is evidence about _this turn_, a learned preference is evidence about _the
person's standing style_, and the standing style is consulted only where the turn is silent. A person who
usually wants one line and who this time writes a paragraph and asks for detail gets the detailed answer.

What is learned is **counts of closed-vocabulary readings** — no message, no word from one, no identifier,
no timestamp. The suite walks the stored value and requires every leaf to be a number, which is the
property that makes a learned store reviewable: a histogram of _how_ somebody writes cannot become a record
of _what_ they wrote. Nothing writes a preference from those counts — they are an input to a resolution
whose output carries `source: 'observed'` and a reason — so a learned reading can never silently replace a
trusted one; and the memory is bounded and decays, because a style from a year ago should not outlive the
current one. Register and detail are counted, and terminology deliberately is not: terminology is never
silent, so a count of past turns would only ever be a third and weaker opinion.

The phase's rule about explicit instructions outranking everything also settled the question §22 left open.
`resolveLanguage` now reads an instruction _inside the message_ first (`به انگلیسی جواب بده`), then the
stored setting, then the reading, and `requested` joins the closed list of sources at the top. When a
stored choice was passed over the reason says so, which is the only way a later stage can tell that two
explicit statements disagreed.

### Guidance is a specification, and it cannot carry a fact

The output of Task 3 is a set of wording instructions whose every string comes from a closed catalogue in
the file: the tone, depth, terminology style and structure are closed vocabularies, the notes are **ids**
the response layer resolves against `GUIDANCE_NOTES`, and even the `reason` is assembled from
`GUIDANCE_CLAUSES` rather than from the readings — which matters, because _a reading's_ reason quotes the
message, and guidance that quotes the message is guidance that can drift into restating it.

The suite turns that into two measurements. A message carrying a token that appears nowhere else cannot get
that token into the guidance, and no string in a guidance contains a digit at all — so guidance cannot
carry a number. And two messages whose facts differ but whose readings match produce **byte-identical**
guidance, which is the mechanical form of the phase's real requirement: guidance may change wording,
structure, depth, terminology and formality, and it may not change facts, calculations, tool results,
permissions, safety rules, trading restrictions or uncertainty. `GUIDANCE_INVARIANTS` is exactly those
seven and travels with every guidance; `GUIDANCE_FIELDS` is the closed field list the suite compares the
produced object against, so a field added to carry a result fails here rather than reaching a model.

The four cases the phase names come out as it describes them: Persian and technical is Persian with the
product's own term forms and every figure verbatim, Persian and conversational is natural Persian with the
bookish copula called out by name, English and technical is English with the product's English wording, and
a mixed message keeps the English beside the Persian form instead of translating a term that has no Persian
counterpart.

### Verified

- Both typechecks clean; `format:check` clean; `npm run build` and `npm run build:web` clean.
- **1537** unit tests across **76** files (1514/75 before), including the new 22-test context suite and one
  added case in the detection suite for the precedence change.
- `npm run desktop:verify` **0 errors, 4 warnings across 51 checks**, and the browser end-to-end suite
  unchanged: nothing renders, no stylesheet changed, and the two cases §22 added still pass on the same
  bundle.
- No new dependency. `context.ts`, `communication.ts` and `guidance.ts` join `detect.ts` and `profile.ts` as
  code the product ships but does not yet call, and the note catalogue is checked for reachability: every
  note in it is produced by some message in the suite's corpus, so no instruction can sit in the catalogue
  untested.

## 24. Phase 7.5.3.3 — the interface in Persian, and the one control that decides it

The visible application is translatable: 2,440 keys in `web/src/i18n/messages.en.ts`, the same 2,440 in
`messages.fa.ts`, and a component that addresses its copy by id rather than holding a sentence. The
mechanism, and the boundary that the phase had to state before it could write any Persian, are
`docs/ui-language.md`; the wording, the terminology it stays consistent with and the defects below are
`docs/persian-language.md`.

The claim the phase makes is narrow and testable: **the words the interface shows come from a catalogue, and
one explicit choice decides which catalogue**. Everything else follows from that — including what the layer
must _not_ do, which is decide anything for itself.

### The setting was already there, so nothing new is persisted

Phase 7.5.3.1 built a three-way control — `auto`, `fa`, `en` — that decides what language the _agent_ answers
in, and stored it under one namespaced key. This phase gives the same choice a second effect: an explicit
`fa` is also an instruction about the interface, and `auto` is not. So there is no second setting, no second
key and no second store; `uiLocaleOf` is a pure function of the value 7.5.3.1 already kept, which is why
"connected to the entire visible UI" and "do not mix the two persistence systems" could both be satisfied by
one control.

The interface layer reads that value and never writes it. The suite asserts the separation in both
directions — no module under `web/src/i18n` may import the language knowledge store, and no module under
`web/src/language` may import the interface — and the browser case measures the effect on the document
(`<html lang>` becomes `fa-IR`, which is also what loads the Vazirmatn face) rather than only on one card.

### One function at module level, and the reason it is not a hook per component

The idiomatic React answer is `const { t } = useTranslation()` in each component, and about ninety
components here render copy. So the locale lives in `active.ts`, the store's subscription updates it _before_
React re-renders, and the shell subscribes to the locale so the whole tree re-renders and reads the new
value. A `useEffect` would have run after paint and flashed the previous language on every switch.

The one failure mode that mechanism has is a memoised component skipping the re-render, so the suite fails if
any file under `web/src` imports `memo`. The second is subtler and is why a module-level value can never hold
the result of a lookup: `const ALERTS = [{ title: 'Worth knowing' }]` is evaluated once at import, and the
switch happens later. A module-scope property whose value is copy therefore became a **getter**, and an array
of copy became one getter that rebuilds the array on each read; function-scope values stayed plain calls. The
suite reads a label map before and after a switch, because that is the case a snapshot of the catalogue
cannot see.

### Two migrations, and the honest account of the first one

The first pass rewrote JSX text nodes and module-level prose constants — 1,288 keys — and it was written as a
regex over the source. That was a mistake, and it was caught by reading the diff: a pattern broad enough to
match a sentence inside JSX is also broad enough to reach into a template literal, and it corrupted
seventy-one files before it was reverted. The second attempt walked the TypeScript AST, which cannot rewrite
anything that is not a string literal in a position the pass chose, and the second _phase_ of that attempt
— the 1,152 keys this commit adds — extended it to the three positions the first pass could not reach: a JSX
attribute built inside a `.map()`, an object property in a data array, and a string handed to a helper.

What made the volume tractable was refusing to classify by hand: a value is copy if it looks like a sentence
and sits somewhere a sentence can be shown, and it is data if it looks like an identifier, a class list, a
path, a timestamp or a record reference. Everything the pass could not classify faithfully — a module-scope
scalar const, a module-scope array that is not a property value — was _reported_ rather than guessed at, and
those twenty-odd sites were converted by hand. Of the 1,362 rewrites, 161 reused a key the first pass had
already translated, which is how the Persian for `Try again` did not get written twice.

### Verified

- `format:check` clean; both typechecks clean; `npm run build` and `npm run build:web` clean, with the
  running bundle at 1,687 kB (476 kB gzipped). The Persian catalogue is **in** that bundle, because a
  language switch that needed a network round trip would not be a switch.
- **1554** unit tests across **77** files (1537/76 before), including the new `tests/ui-language.test.ts` (22
  tests) and one case in `tests/persian-terminology.test.ts` that ties the sidebar's Persian wording to the
  7.5.2 terminology record — the interface cannot rename a concept the glossary already named.
- `npm run desktop:verify` **0 errors, 4 warnings across 51 checks**.
- The browser suite is **32** cases (30 before): the switch offers one visible selected state and remembers it
  across a reload, the interface around it changes with it, `<html lang>` and the navigation landmark's own
  name follow, and all three controls fit and do not pan the layout at 375 px **in both languages**.
- No new dependency and no new persistence key. `web/src/i18n` reads one value the product already stored.

### What verification found

Seven defects, and the pattern is that six of them are the migration believing it knew better than the code
it was rewriting:

1. **The regex pass corrupted template literals** in seventy-one files. Caught by reading the diff, reverted,
   and replaced with an AST pass that can only touch a node it has classified.
2. **A getter for a quoted key is not valid JavaScript.** `const EXPLANATION = { 'not-available': … }`
   produced `get not-available()`; a computed accessor (`get ['not-available']()`) is what a record keyed by
   a discriminant needs, and the key stays data while only the value is wording.
3. **A file that already imported the catalogue still needed the import.** `Badge.tsx` imported
   `liveLabels` and not `msg`, and the guard that decided whether to add the import asked whether the file
   imported from the module rather than whether it imported the symbol.
4. **Inline SVG path geometry is not a sentence.** `M32 0H0V32` reached the Persian catalogue before a rule
   requiring a lower-case letter anywhere in the value ruled it out.
5. **A driver that navigates by the landmark's English name stops working the moment the switch works.** Both
   the browser driver and three shell cases selected `nav[aria-label="Primary"]`; the driver now finds the
   navigation by shape, and the shell cases read the name from the catalogue.
6. **`localStorage` belongs to an origin.** A browser case wrote the stored choice into a document that had
   not loaded the app yet, which is a `SecurityError` rather than a preference; the case now loads the app
   first and then sets the choice.
7. **Seven test files asserted on English sentences that had moved into the catalogue.** They read through
   `tests/helpers/source-copy.ts`, which resolves the keys a file mentions into the English it renders, so
   each one still asserts what the surface _says_ rather than which id it says it with.

## 25. Phase 7.5.3.4.1 — the language of the answer, and the boundary it crosses as data

Phases 7.5.3.1–7.5.3.3 built the layer that _reads_ (a message, an interaction) and the layer that _renders_
(the catalogue). This sub-phase is the first one that hands a **decision** to a model, and the interesting
part of it is not the rule but where the rule can live: the signals are all in the interface process — a
sentence a person typed, a setting in their own storage, a count of their own turns — and the prompt is
built in the other one.

### The two sides cannot share code, so they share a verdict

`tests/monorepo-boundary.test.ts` holds the boundary one-way and in both directions: nothing under `src/`
may import the frontend, and no frontend file may reach into `src/` by relative path. There is therefore no
version of this phase in which `src/llm/prompt.ts` detects a language itself; doing that would be the second
detection the phase forbids. What crosses is the resolved value, on the request that already exists:

| Piece                         | Where                          | What it does                                                                                                        |
| ----------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `responseControl`             | `web/src/language/response.ts` | Reads the message once, resolves `.reply` through the four signals, returns 7.5.3.2's `.guidance` for the same turn |
| `storedResponseOptions`       | same file                      | The seam: the preference and the learned store read from the modules that own them, so no caller touches storage    |
| `RESPONSE_LANGUAGES`          | `packages/shared/src/types.ts` | The two languages, as a shared vocabulary — asserted equal to the language layer's own list                         |
| `responseLanguage`            | `agentChatBodySchema`          | Optional `fa` \| `en` on the turn request; absent means the prompt is byte-identical to before                      |
| `withResponseLanguage`        | `src/llm/prompt.ts`            | The directive appended to the instruction text, or the text unchanged                                               |
| `RESPONSE_LANGUAGE_DIRECTIVE` | same file                      | Two closed strings: the language, what the instruction may not change, and what cannot overrule it                  |

The synchronous adapter has no prompt builder, so it receives the directive inside the instructions it
already gets; the provider path receives it through `buildTurnMessages`. Both go through the same function, so
the two paths cannot state the language differently.

### Precedence, and the step that joined it

`resolveLanguage` now reads four signals in the order the phase names: a request in the message, the explicit
choice, what previous turns showed, then the reading. `observed` joined `REPLY_SOURCES` between the second
and the third — above the reading because it is evidence about the person rather than about one sentence,
below the choice because it is inferred and the choice is stated. The learned store gained the language
dimension under the rules it already had: a minimum sample count, a tie is not a habit, counts halve past
the window, and every leaf is still a number.

### Verified

- `format:check` clean; both typechecks clean; `npm run build` and `npm run build:web` clean.
- **1576** unit tests across **78** files (1554/77 before), including the new `tests/response-language.test.ts`
  (22 tests) and the precedence list in `tests/language-detection.test.ts` updated to name `observed`.
- `npm run desktop:verify` **0 errors, 4 warnings across 51 checks**; the browser suite is unchanged at **32**
  cases, because this phase renders nothing.
- No new dependency, no new persistence key, and no field added to 7.5.3.1's profile: the learned step is an
  input to the resolution, not a new claim about a person.

### What verification found

Two defects, both a chain with one more link than expected, both caught by reading the new code against its
callers rather than by running it:

1. **The guidance would have described an inferred decision as no decision at all.** `responseGuidance` maps
   the reply's `source` to one of its closed clauses, and its chain was exhaustive over 7.5.3.1's four
   sources — so `observed` fell through to `default-language`: _"Nothing was read and nothing was chosen"_,
   on a turn that had been decided by a learned preference. `observed-language` is now a clause of its own.
2. **`learnedLanguage` indexed a store a first run does not have.** Fine for a caller with a history and a
   crash for the caller with none — which is every new installation. The parameter is now `| null`.
