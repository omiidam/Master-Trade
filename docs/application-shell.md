# Application Shell — Phases 7.1.1 through 8.2.1

The layout foundation of the workstation: **Top Bar, Sidebar, Main Content**. Phase 7.1.1 adds no
region and changes no arrangement — the shell has existed since Phase 3.2 and every phase since has
extended it. It _states_ the layout as a contract and holds it there: which element is which
landmark, the widths it must survive, and the two properties a trading workstation cannot lose — the
workspace keeps its own width, and the Persian mirror does not break it. Phase 8.1.2 then makes the
navigation's **behaviour** explicit at each of those widths (§ 6) without touching the structure.

Nothing in `web/src/app/` was restructured. The deliverable is the focused suite
([`tests/frontend-shell-layout.test.ts`](../tests/frontend-shell-layout.test.ts), 24 cases), the
browser cases in `tests/browser/e2e.test.ts`, and this record.

## 1. The three regions

```
┌──────────────┬───────────────────────────────────────────────┐
│ Sidebar      │ Topbar  · page title · preview · host · status │
│ brand        │           direction · notices · Safety         │
│ nav (grouped)├───────────────────────────────────────────────┤
│ safety card  │ Main Content                                   │
│              │  Workspace: page header, grids, tabs, cards    │
│              ├───────────────────────────────────────────────┤
│              │ footer · safety statement                      │
└──────────────┴───────────────────────────────────────────────┘
```

| Region       | Element    | Landmark        | Source                     |
| ------------ | ---------- | --------------- | -------------------------- |
| Sidebar      | `<aside>`  | `complementary` | `web/src/app/Sidebar.tsx`  |
| Top Bar      | `<header>` | `banner`        | `web/src/app/Topbar.tsx`   |
| Main Content | `<main>`   | `main`          | `web/src/app/AppShell.tsx` |
| Footer       | `<footer>` | `contentinfo`   | `web/src/app/AppShell.tsx` |

`AppShell` owns the frame and no domain state: the rail is its first region child (so it sits on the
_inline-start_ edge), and the top bar and main region share the flexible content column beside it.
The main region is the skip link's target (`#workspace-main`), is focusable (`tabIndex={-1}`), and is
the one slot a page renders into. Pages reach it through the shared `Workspace` frame
(`web/src/app/Workspace.tsx`), which caps its own width rather than fixing it.

## 2. The widths it must survive

The product is **desktop-first**: the expanded rail is the default and every narrower step is a
concession. Four modes are designed at, and the ladder that produces them is declared in the theme
(`--breakpoint-*`) and inventoried in `web/src/design/tokens.ts`:

| Mode    | Width            | Rail                                     |
| ------- | ---------------- | ---------------------------------------- |
| Desktop | ≥ 1280 px (`xl`) | expanded, or collapsed by the reader     |
| Laptop  | 1100–1279 px     | expanded, or collapsed by the reader     |
| Tablet  | 768–1099 px      | automatically collapsed to the icon rail |
| Mobile  | < 768 px (`md`)  | automatically collapsed to the icon rail |

One boundary decides the collapse — `COMPACT_SHELL_QUERY` in `web/src/lib/useMediaQuery.ts`
(`(max-width: 1099px)`), a value that sits between the `md` (768) and `xl` (1280) steps. It is a
deliberate deviation from the ladder, recorded in `frontend-foundation.md` § 10: moving it is a
layout decision, not a token one. Below it the window wins over the reader's saved preference
(`userCollapsed || compactShell`), every item keeps its accessible name and its tooltip, and the
collapse control is not rendered — the rail is already collapsed, so there is nothing to collapse to.

The workspace keeps its width for the same reason at every mode: the content column carries `min-w-0`
(so a wide child scrolls inside its own box instead of stretching the flex parent) and the frame caps
itself with `max-w-`. `density` is the second layout control: the whole shell tightens up for a
reader who wants more rows on screen.

## 3. The Persian mirror

Direction is a document-level property, not a stylesheet fork, and the shell is where that is
load-bearing:

- every shell spacing rule is a **logical** property (`ms-*`, `ps-*`, `border-e`, `text-start`), so
  flipping `dir` on `<html>` mirrors the layout with no second stylesheet — the shell introduces no
  physical utility of its own;
- the rail is the first region child, so it follows the flow to the inline-start edge, and its
  tooltips open away from it (`direction === 'rtl' ? 'left' : 'right'`), stated from the resolved
  direction rather than left to a popper's collision avoidance;
- the collapse glyph is chosen in JavaScript (`PanelStartIcon` in
  `web/src/components/Directional.tsx`), because the cascade cannot know which panel shape means
  "this side";
- `<html lang>` and `<html dir>` are written by **one** owner — `useDocumentLanguage()`, which the
  shell calls, and `main.tsx` once before the first paint — so a Persian reader never sees a
  left-to-right frame;
- the safety readouts are technical values and carry `.num`, which pins a figure left-to-right inside
  a right-to-left page.

## 4. No region is positioned by a trick

The shell is laid out in flow: `flex` for the frame, `sticky` for the rail and the top bar. In the
modes that have a rail, nothing is `fixed` or `absolute` — that is how a rail ends up drawn over the
content it frames. The one `fixed` surface is the **off-canvas drawer**, and being out of the flow is
its whole point (§ 6): a rail cannot be in the flow and off-canvas at once. Nothing is positioned
with a physical `left`/`right`, and the only `absolute` in the three shell files is the skip link
(visible on focus) and two decorations inside controls: the search glyph and the unread dot. The
suite asserts that enumerated set, so a new position in the shell has to be justified before it can
exist; and no region hides a defect behind a blanket `overflow-hidden`.

## 5. What was verified

| Check                                | Where                                                        | Result |
| ------------------------------------ | ------------------------------------------------------------ | ------ |
| The three regions and landmarks      | `tests/frontend-shell-layout.test.ts`                        | 24/24  |
| Shell contract from the broad matrix | `tests/frontend-responsive.test.ts`                          | 21/21  |
| The whole tree mirrors               | `tests/rtl-layout.test.ts`                                   | 15/15  |
| No sideways scroll, 7 widths         | `tests/browser/e2e.test.ts` (1920→375 px)                    | 7/7    |
| RTL at desktop, tablet and phone     | `tests/browser/e2e.test.ts`                                  | pass   |
| No clipped text at phone width       | `tests/browser/e2e.test.ts`                                  | pass   |
| Every page still loads and routes    | `frontend-responsive.test.ts` / `frontend-prototype.test.ts` | pass   |
| Types and build                      | `npm run typecheck`, `typecheck:web`, `build:web`            | pass   |

The layout engine's half of the answer — real overflow, clipping and metric parity under a mirror —
is measured in the browser suite, not asserted from a class list. The shell's half is stated in the
source suite, so it runs offline and names the region rather than the symptom.

## 6. Phase 8.1.2 — the navigation's behaviour, stated per width

Phase 7.1.1 described _what_ the shell is; this phase describes _what it does_, so that a width is a
decision rather than wherever a `max-width` happened to be typed. The arrangement is untouched — Top
Bar, Sidebar, Main Content, in the same place — and the work is behaviour: one responsive model, a
polished collapsible rail, and a real off-canvas drawer on a phone.

### One model, one reader

`web/src/app/shellLayout.ts` is the whole width behaviour as a value: it maps a viewport width to one
of the four modes, and a mode plus the reader's preference to how the navigation is presented.
`web/src/app/useShellLayout.ts` is the only place that reads a media query; every component asks it.
The three queries are **derived** from the same `SHELL_WIDTHS`, so the hook and a unit test cannot
disagree about a boundary.

| Mode    | Width         | Navigation                                    |
| ------- | ------------- | --------------------------------------------- |
| Desktop | ≥ 1280 (`xl`) | the rail, expanded or collapsed by the reader |
| Laptop  | 1100–1279     | the rail, expanded or collapsed by the reader |
| Tablet  | 768–1099      | the rail, forced to the icon width            |
| Mobile  | < 768 (`md`)  | the off-canvas drawer                         |

`railModeFor` is where "the window wins over the saved preference" lives: a laptop or desktop honours
the reader's collapse choice; a tablet overrides it, because a 264px rail does not fit; and a phone
does not show a rail at all — a 76px rail still costs a third of a 375px screen.

### The rail

Unchanged in the ways that matter: sticky and viewport-tall, expanded to 264px and collapsed to 76px,
the width transition tokenised (`--duration-base` / `--ease-standard`). What the phase adds is that
the collapse control is rendered **only where the rail can be collapsed** (`canCollapse`), so it is
never a control that does nothing. The main content keeps its own spacing — the frame's padding is a
function of `density` alone, and the drawer overlays rather than pushes — so opening the navigation
at any width cannot reflow what is already being read.

### The off-canvas drawer

A phone gets a **modal** drawer, not a narrow rail:

- **Closed until asked for.** The navigation is not in the document until the top bar's trigger opens
  it, so there is no hidden, focusable navigation to tab into.
- **A disclosure trigger.** The top-bar control carries `aria-controls="shell-navigation"` and
  `aria-expanded`; found by what it controls rather than by a label, so it works in either language.
- **Modal, and honest about it.** `role="dialog"` + `aria-modal`, focus moved into the panel on open
  and **returned to the trigger** on close, Tab cycled inside, Escape closes from anywhere.
- **Four ways out**: the close control, the scrim (a real, named `button`, not a bare `div`), Escape,
  or choosing a destination — the store closes the drawer on `setPage`.
- **Mirrored by the direction.** It opens from the inline-start edge with a Framer Motion _clip_ —
  not a `translate-x` utility, and not a transform at all — so it arrives from the right in Persian and
  the left in English while never leaving the edge it is anchored to (§ 7.4). Under
  `prefers-reduced-motion` it fades instead of revealing.

The shell also closes the drawer itself when the window leaves the mobile mode, so a drawer left open
while the window grows cannot reappear later.

### What was adopted from the references, and what was not

The two reference dashboards (`arhamkhnz/next-shadcn-admin-dashboard`, `nellavio/nellavio-layout`)
both keep the sidebar's state in one provider and switch the _presentation_ by width — a collapsed
rail on a tablet, a sheet on a phone. That shape is what this phase adopts. Their visual identity,
their component library and their state library are not: the product already owns a design system, a
token ladder and a UI store, and a second one is how a shell acquires two sources of truth.

### Verified

| Check                                             | Where                                     | Result |
| ------------------------------------------------- | ----------------------------------------- | ------ |
| The four modes and their boundaries (pure model)  | `tests/frontend-shell-layout.test.ts`     | 24/24  |
| Collapsed / expanded rail, and where it is forced | `tests/frontend-shell-layout.test.ts`     | pass   |
| The drawer's trigger, focus, Escape and scrim     | `tests/browser/e2e.test.ts`               | pass   |
| The drawer opens from the start edge in Persian   | `tests/browser/e2e.test.ts`               | pass   |
| Every page, at every width, still navigable       | `tests/browser/e2e.test.ts` (7 widths)    | pass   |
| No overflow and no clipped text                   | `tests/browser/e2e.test.ts`               | pass   |
| Types and build                                   | `typecheck`, `typecheck:web`, `build:web` | pass   |

The browser harness learned the one thing the new behaviour changes: on a phone the navigation is
behind the trigger, so `clickNav` opens the drawer before it clicks the entry — the path a person
takes, rather than a DOM shortcut that would pass while the drawer was unreachable.

## 7. Phase 8.1.3 — the shell's state and context

Phase 8.1.2 made the navigation _behave_ per width. This phase is about what the shell — and the pages
it frames — **remembers**. The workspace renders one page at a time and unmounts the rest, and that
shape is load-bearing for every measurement in this file: a page swap is a real swap, so "the page on
screen" is the page whose heading was painted. Its cost is that anything a page held in `useState` was
thrown away the moment its reader looked elsewhere. Three things were made to survive instead.

### 7.1 The page's context lives above the page

`web/src/store/pageContext.ts` keeps the _view_ a reader was on, keyed by page and by slot: the tab
every page opens on, the journal's filters, analytics range and calendar view, the memory page's query
and its two filters, the research selection, and the agent workspace's unsent draft.
`usePageView(page, slot, initial)` is a drop-in for `useState` — the same tuple, and a setter that still
accepts an updater — so a page states _what_ it is keeping and _where_ it belongs and changes nothing
else. The slots are a closed set (`VIEW_SLOTS`), because a slot that can be misspelled is a second,
empty copy of the reader's state waiting to happen.

It is deliberately **not a router** (nothing enters the URL; `page` in `store/ui.ts` still decides which
page is open) and **not a cache** (only choices are kept — a page still reads its data on mount). It is
also not persisted: this is session context, and a new session should start where its defaults say.

### 7.2 The rail's choice is a preference

`web/src/app/shellPreference.ts` persists `sidebarCollapsed` under
`master-trade.shell.sidebarCollapsed`, on the language preference's own rules and its own storage probe
(`preferenceStorage`, imported rather than re-derived, so "can this origin remember anything?" has one
answer). The store reads it once at creation and writes it as the control flips, so the choice and the
pixel change together. The docs had called this "the reader's saved preference" since Phase 3.2 while it
was in fact memory-only; this is the half that was missing. Whether a width _honours_ it is still
`railModeFor`'s decision, not this module's.

### 7.3 The shell's status is fetched once

`web/src/desktop/shellReport.ts` owns the report and the poll; `useShellStatus` is a subscription plus a
pure derivation (`shellStatusState`). It replaced a poll **per mount**: the topbar and Settings each held
their own snapshot on their own cadence, so for up to a poll interval the same process could be
_loading_ in one place and _ready_ in another — the same product describing itself two ways. Two readers
can now differ only about `stopping`, which is an argument to a pure function rather than a fact about
the process. Polling is reference-counted and stops with the last reader, so importing the module starts
no timer and the report is never fetched by nobody.

### 7.4 The drawer no longer leaves the edge it is anchored to

The clip in § 6 is a fix, not a preference. The drawer is `fixed` to the inline-start edge, so in a
right-to-left interface it is pinned to the **right** edge — and hiding it by translating the panel by
its own width carried every box inside it past that edge for as long as the animation ran. The phone
layout is measured against exactly that edge, so the mirrored drawer reported its own panel, nav, header
and safety block as overflow whenever a measurement landed mid-animation; the identical code in English
was invisible only because `-100%` moves the panel away from the edge being measured. The panel now
stays put and the reveal is a direction-aware clip, so its box is inside the layout viewport at every
frame.

### 7.5 What was verified

| Check                                             | Where                                           | Result |
| ------------------------------------------------- | ----------------------------------------------- | ------ |
| The page context, the rail preference, one report | `tests/frontend-shell-state.test.ts`            | 22/22  |
| Every page's tab is kept under its own page id    | `tests/frontend-shell-state.test.ts`            | pass   |
| A tab survives a walk away and back               | `tests/browser/e2e.test.ts`                     | pass   |
| The rail's choice survives a reload               | `tests/browser/e2e.test.ts`                     | pass   |
| The active navigation entry follows the page      | `tests/browser/e2e.test.ts`                     | pass   |
| The host is described the same way in both places | `tests/browser/e2e.test.ts`                     | pass   |
| The stream states its own condition, never "live" | `tests/browser/e2e.test.ts`                     | pass   |
| Every connection state still has words            | `tests/frontend-shell-state.test.ts`            | pass   |
| Shell contract and the whole tree (regression)    | `frontend-shell-layout` / `rtl-layout` / matrix | pass   |
| Types, formatting and build                       | `typecheck`, `typecheck:web`, `format:check`    | pass   |

The suite's own boundary is unchanged: the model and the contracts run offline in `tests/`, and the
half only a browser can answer — that a reader really does land back on the tab they chose, and that the
rail really is still collapsed after a reload — is measured in `tests/browser/e2e.test.ts`.

## 8. Phase 8.2.1 — the navigation foundation

Phase 8.1.2 stated how the navigation **behaves** at each width and Phase 8.1.3 what the shell
**remembers**. This phase adds no entry, removes none and renames none: the workspace's fourteen
destinations shipped across Phases 3–7, and they are the ones this file's § 1–7 already describe —
_Dashboard_, _AI Workspace_, _Memory_, _Research_, _Journal_, _Portfolio_, _Evaluation_,
_Trading Lab_, _Academy_, _Exams_, _Activity_, _Usage_, _Profile_, _Settings_. Portfolio and
Evaluation stay two entries, and no performance summary becomes a fifteenth.

What was added is the _statement_ of that list: one derived model, drawn by one entry component.

### 8.1 One model, in display order

`NAV_MODEL` (`web/src/config/navigation.ts`) is the navigation in **display** order — the declared
groups (workspace, learning, system), each carrying its own entries. Three orders are in play and only
two of them are the same:

- **declaration order** — `NAV_SECTIONS`, held to `APP_PAGE_IDS` by `tests/frontend-shell.test.ts`,
  which is why `lab` is declared after `exams`;
- **display order** — `NAV_MODEL`, which is what the rail and the drawer actually draw;
- **group order** — `NAV_GROUPS`.

Before this phase the rail performed the grouping itself (`NAV_SECTIONS.filter(...)` inside a render
loop) and the browser suite re-derived the same order a second time from a hard-coded tuple, so
"which order is the navigation in" had three answers that agreed by maintenance. Now the model is
derived from the two declarations and _keeps their objects_ — it filters, it does not copy — so a
label changed in one place cannot go stale in another, and the rail, the drawer and both suites read
the one value.

### 8.2 One entry, one component

`Sidebar.tsx` now declares three things instead of one monolith: `SidebarNav` (the landmark, drawn
from `NAV_MODEL`), `NavGroup` (a heading, or a rule when the rail is collapsed, over its entries) and
`NavItem` (an entry). The rail and the off-canvas drawer are two call sites of the same component, so
they cannot drift in where they point or in how they say they are current.

Two decisions were made explicit rather than left implied:

- **An entry is a `<button>`, not a link.** There is no router and no address for a page, so a link
  would promise a URL, a new tab and a middle-click target that do not exist. A button is what is
  actually there: reachable by Tab, activated by Enter, named for a screen reader.
- **The active entry is derived, never passed in.** `NavItem` reads the page from the same store the
  workspace reads, so the rail cannot announce a page the workspace is not showing — and there is no
  `active` prop for a caller to get wrong. Collapsed, the entry keeps the name it would otherwise
  draw: `aria-label` plus the tooltip that replaces the label.

Every page keeps its one frame (`Workspace`), which is where the consistent content width and rhythm
come from; nothing in this phase touched it, and no page content was redesigned.

### 8.3 What was adopted from the references, and what was not

The two reference dashboards (`arhamkhnz/next-shadcn-admin-dashboard`, `nellavio/nellavio-layout`)
keep navigation as configuration, render one reusable item per destination, derive the active entry
from the current location, and switch the _presentation_ by width. § 6 adopted the last of those;
this phase adopts the first three. Their visual identity, their component library and their state
library are still not adopted, and neither is their router: a page here is a store field, not an
address, which is the decision § 7 left open and this phase did not change.

### 8.4 A defect the new case found in the harness

The keyboard case is the first in the suite to activate a control with Enter, and it failed: the
driver's `Enter` was inert. A button acts on Enter from the `keypress` that follows the keydown, and
`pressKey` dispatched a bare `rawKeyDown` — enough for Tab (focus traversal happens on keydown),
and nothing at all for Enter. The driver now marks Enter as a key that carries a character, so the
keypress is dispatched and the entry really is activated. Left alone, "the navigation is reachable
and activatable from the keyboard" would have been a claim that passed by doing nothing.

### 8.5 What was verified

| Check                                                    | Where                                  | Result |
| -------------------------------------------------------- | -------------------------------------- | ------ |
| The fourteen entries, in the product's order             | `tests/frontend-navigation.test.ts`    | 6/6    |
| The model is a view over the declarations, not a copy    | `tests/frontend-navigation.test.ts`    | pass   |
| One entry component, two surfaces, no second filter      | `tests/frontend-navigation.test.ts`    | pass   |
| The entry is a Tab-reachable control that keeps its ring | `tests/frontend-navigation.test.ts`    | pass   |
| Same entries and order on the rail, the tablet and phone | `tests/browser/e2e.test.ts`            | pass   |
| The same order in Persian, rail still on the start edge  | `tests/browser/e2e.test.ts`            | pass   |
| Reached and activated by keyboard, with a visible ring   | `tests/browser/e2e.test.ts`            | pass   |
| Nav keeps working collapsed, and does not shift the page | `tests/browser/e2e.test.ts`            | pass   |
| No overflow, clipping or layout shift (regression)       | `tests/browser/e2e.test.ts`            | pass   |
| Shell contract and the whole tree (regression)           | `frontend-shell` / `rtl-layout` / etc. | pass   |
| Types, formatting and build                              | `typecheck`, `typecheck:web`, build    | pass   |

The distribution is deliberate: the model, the grouping and the shape of the entry run offline in
`tests/frontend-navigation.test.ts`, and the half only a layout engine can answer — the entries a real
browser draws in what order at which width, and whether a keyboard can reach and activate them — is
measured in `tests/browser/e2e.test.ts` under `the navigation foundation`.

### 8.6 A measurement flake in the shell's own cases

Three shell cases were reported failing — `expected 84 to be 76`, an active entry reading `['']`, and
`expected false to be true` — and all three were defects in how the suite _observed_ the rail rather
than in the rail. They are recorded here because the same mistake is easy to make again.

**The rail animates its width**, `w-[76px]` ⇄ `w-[264px]` over `--duration-base` (220 ms, on a
decelerating curve). A case that collapsed the rail and waited for `width < 100` was therefore not
waiting for a layout, it was waiting for a _threshold a transition crosses mid-flight_: sampled every
40 ms, the box travels `264, 264, 160, 96, 78, 76` and the wait accepts at 96 — or 84, a frame later
on a different machine. The reload that followed renders the settled 76 immediately, so the case
compared an animation frame with a layout and failed on a number this design never declares.

That it was reported at all is because `prefers-reduced-motion` follows the _host's_ setting: on a
machine with animations off the app's own reduced-motion rule neutralises the transition, the rail
jumps, and the flake cannot happen. The suite now states the state it measures in
(`Emulation.setEmulatedMedia({ features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })`),
so it means the same thing on every machine — and asks for the harder state, in which the drawer's
reveal is really moving. To measure the rail, a case waits for it to _settle_: past the threshold **and**
no width animation still running on the `aside`.

**The collapsed rail is a standing preference**, so it outlives the case that set it. A case that
collapses the rail and then fails never reaches its own cleanup, and the next two cases inherit a rail
that draws no labels: the current entry reads as `['']` — an entry with no label keeps its name in
`aria-label` alone, so the reading is of a name that is not drawn rather than of a missing entry — and
the collapse control is missing, because the rail is collapsed already. One failure, three reports. Each
of the three cases now establishes the starting point it is about to measure, so a failure of one is a
failure of one; the portfolio active state itself was never wrong (it resolves to exactly one entry in
both presentations).
