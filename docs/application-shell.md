# Application Shell — Phases 7.1.1 through 8.2.4

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

## 9. Phase 8.2.2 — the navigation's UX and semantics

Phase 8.2.1 stated _which_ fourteen entries the workspace has and in what order. This phase refines
how each one is **drawn**, **named** and **identified** — and, like 8.2.1, adds no destination,
removes none and renames none. Portfolio and Evaluation are still two modules; there is still no
Performance entry.

### 9.1 One box, in both presentations

The measured starting point: expanded, every row was 237×**38** with its icon 10px in; collapsed,
every row was 59×**33** with the same padding. The five-pixel difference was the label — the row's
height was whatever its content happened to be, so taking the label away re-flowed the whole list
vertically. That is a layout shift in the shell's own furniture: collapse the rail and every entry
under the one you were looking at moves, in both directions, for a reason that has nothing to do with
where you are.

The icon now sits in a fixed 22px square slot, so the row's height is that slot or the label's line —
whichever is taller, and the same either way. Both presentations are measured at **38px**, with one
padding and one icon column, and a case asserts they are equal rather than each being plausible.

The same pass removed a contradiction the eye had hidden: the collapsed entry carried `px-2.5` _and_
`px-0`, two horizontal paddings in one class list, where which one applied was the stylesheet's
business. It happened to be the 10px one, and the icon was centred anyway — because it was centred by
`justify-center`, not by the padding — so nothing looked wrong and the class list said two different
things. It now says one.

### 9.2 Every entry has a name the interface cannot translate away

Each entry carries `data-nav-id`, its section id. The rail has always been navigable by _label_ — and
that is still how the browser suite clicks it, deliberately, because a reader navigates by the word
they see — but the word is either English or Persian, and neither is an identity. `data-nav-id` lets a
case (or a surface that has to name a destination without drawing it — the breadcrumb a later phase
might add) ask for `portfolio` and be answered the same way in both languages.

### 9.3 The grouping is named, not only drawn

The three groups are exposed with `role="group"`, `aria-label` from the message catalogue, and
`data-nav-group` for the value. The name has to come from the catalogue rather than from the drawn
heading, because the collapsed rail has no room for a heading and draws a rule instead: a grouping
that could only be _read_ would disappear exactly when a reader has least to go on.

### 9.4 The collapsed rail's tooltip finally says something

The tooltip carried the label alone. For a reader hovering an icon that is the one thing they already
know — the glyph and the order are the whole clue — so it now carries the entry's **name and its
description**: `descriptionKey` had been translated into two languages, asserted non-empty by two
suites, and drawn nowhere for five phases.

It stays a _collapsed_ affordance. The expanded rail draws the label beside the icon, and a popover
repeating it is noise; the drawer, which always has room, draws no tooltips at all. The entry is
wrapped in the tooltip only in the branch that has no label, and the browser case asserts the
difference structurally — a labelled entry is not a trigger at all (`data-state` absent), rather than
a trigger that happens not to be open.

### 9.5 The states an entry has, and the two it does not

Default, hover, focus and current are unchanged in intent and now stated in one place next to the
markup. The two absent states are deliberate and asserted: there is no **disabled** entry, because all
fourteen pages exist and are reachable — a greyed-out entry would state something the product does not
— and there is no **selected** state distinct from current, because the page being read _is_ the
selection and that is what `aria-current="page"` says. The current entry is not signalled by colour
alone: it takes the raised surface, a panel shadow, a primary-tinted icon and, where there is room, a
dot beside the label.

### 9.6 A pointer, which the driver did not have

A tooltip is a _pointer_ affordance, and the browser suite had no pointer: it could click and it could
press keys, so it could only ever verify the focus path of a hover component. `hover(selector)` now
moves a real pointer through the DevTools protocol, and it taught the harness something on its first
run — a single synthesised mouse move to the next element does not tell the element being left that it
was left, so the tooltip stayed open over an entry the pointer had already gone. Chrome derives the
boundary events from the previous position; the driver now moves in two legs, which is what a hand
does, and the tooltip closes as it should.

### 9.7 What was adopted from the references, and what was not

Both reference dashboards give every sidebar item one reusable structure — an icon slot, a label, an
active treatment — and show the item's name in a tooltip exactly when the sidebar is collapsed. That
is what § 9.1 and § 9.4 adopt. Neither adopts a second navigation for the icon rail, and this phase
did not either: it is one entry component, one model, and one box at two widths. Their visual identity,
component library and state library remain untouched, as in § 6 and § 8.3.

### 9.8 What was verified

| Check                                                     | Where                                 | Result |
| --------------------------------------------------------- | ------------------------------------- | ------ |
| Every entry named, and identified, in both presentations  | `tests/browser/e2e.test.ts`           | pass   |
| The three groups named in both presentations              | `tests/browser/e2e.test.ts`           | pass   |
| Exactly one current entry, on all fourteen routes         | `tests/browser/e2e.test.ts`           | pass   |
| The tooltip opens on a hover and closes when it leaves    | `tests/browser/e2e.test.ts`           | pass   |
| One row height, padding and icon column in both           | `tests/browser/e2e.test.ts`           | pass   |
| Identifier, grouping, tooltip, states, one box (source)   | `tests/frontend-navigation.test.ts`   | 11/11  |
| Collapsed rail keeps its name and its tooltip             | `tests/frontend-shell-layout.test.ts` | 24/24  |
| RTL, responsive and the whole-tree contracts (regression) | `rtl-layout` / matrix / shell state   | pass   |
| Types, formatting and build                               | `typecheck`, `format:check`, build    | pass   |

Both presentations were also measured in a live browser at 1440px and 76px: 14 rows each, one height
(38px), one icon column, icons centred to the pixel in the icon rail, three group rules, and no clipped
label or overflow.

## 10. Phase 8.2.3 — navigation discoverability and quick access

Phase 8.2.1 stated _which_ fourteen destinations the workspace has and in what order, and 8.2.2 gave
each one a box, a name and an identifier. This phase adds the **second way in**: a quick-navigation
palette — one field over the same fourteen entries, opened from anywhere with `Ctrl`/`⌘`+`K`. It
adds no destination, removes none, renames none, and moves none.

The rail stays the primary navigation, in every sense that matters. It is still the list that is
always there, still the thing a reader reads to learn what the product does. The palette is for the
reader who already knows the name of what they want and would rather type three letters of it than
read eleven entries to be sure the twelfth is not the one. Portfolio and Evaluation are still two
modules; there is still no Performance entry; no page, no Top Bar control and no region was redesigned.

### 10.1 One list, drawn twice — and not a second list of destinations

The whole risk of a second way in is a second answer to "where does this product go". So the palette
has no list of its own: `web/src/app/navSearch.ts` builds its index from `NAV_MODEL` — the same value
the rail draws — and a case asserts the module contains no section id at all, while the results keep
the _same_ section objects the rail holds (`expect(match.section).toBe(findNavSection(...))`, which
only passes because the model filters the declaration rather than copying it). A destination that
moved or was renamed moved here too, and there is no target in this surface that is not a real page.

One thing is shared the other way round: the glyph each destination is drawn with. `Sidebar.tsx` now
exports its `NAV_ICONS` map, and the palette renders `NAV_ICONS[match.section.icon]` — one icon per
section, so the two surfaces cannot teach different symbols for the same page.

### 10.2 What a query can be found by

`searchQuickNav(query, locale)` answers to four fields, and the order they are ranked in is the
ladder from "what the reader was looking at" to "where it happens to live":

| Rank | Field                 | Why it is where it is                                                                   |
| ---- | --------------------- | --------------------------------------------------------------------------------------- |
| 0–1  | the visible **label** | the word on screen, prefix first — typing `ex` should put Exams above nothing           |
| 2    | the **identifier**    | the semantic route metadata: `agent` finds the AI Workspace, which nothing visible says |
| 3    | the **description**   | so "cost basis" finds Portfolio; the reader knows the job, not the name                 |
| 4    | the **group**         | so "learning" finds the two study surfaces; a query can ask for a _place_               |

The tie-break is the rail's own display order, stated rather than inherited from `Array.sort`'s
stability, and an empty query is the whole directory in that order — the palette is a directory as
well as a search, which is what makes opening it a way of discovering what is here. `found('set')`
returns `['settings', 'journal', 'lab']`: the best answer is the _last_ entry the rail draws, which is
the case that would look wrong if the ladder and the display order were one thing.

Both sides of the comparison are folded: case, `NFKC`, and the zero-width joiners Persian writes into
words a reader may not type. A word spelled with a non-joiner is found by the spelling without one,
which is the difference between a search that works in Persian and one that works in English.

### 10.3 The surface, and which primitive it is built on

The palette is a **combobox over a listbox** rather than a dialog with a list in it: the field is
`role="combobox"`, it names the list it filters (`aria-controls`), it says which row is highlighted
through `aria-activedescendant` — so the keyboard never leaves the field while walking results — and
each row is a `role="option"` whose `aria-selected` is the highlight. The rows are `tabIndex={-1}`:
the field already has the keyboard, and fourteen tab stops would be a second route through the same
fourteen answers.

It is built on Radix's dialog primitive directly, not on the shared `Modal`, and the reason is
particular: Radix moves focus into a dialog from a passive effect after mount, and `Modal`'s first
tabbable thing is its close control. A command surface whose field must own the keyboard the instant
it opens is a race the shared component loses. Everything that makes a dialog a dialog — the portal,
the scrim, `aria-modal`, focus moved in and returned, Escape, Tab cycled inside — is still Radix's;
this file re-implements none of it. A case asserts there is exactly _one_ `document.addEventListener`
call in it (the shortcut) and no hand-rolled Escape or Tab handling, so a later phase cannot quietly
grow a second focus trap.

The palette is not a page and claims no page: it contains no `aria-current`. Choosing a result calls
the same `setPage` the rail's own entries call, so "which page is open" and "which entry is current"
stay one answer from one field — and after a quick-navigation the rail is asked, unprompted, and
marks exactly one entry.

### 10.4 The shortcut, printed and published

The shortcut is `Ctrl`/`⌘`+`K`, read from the same `keydown` for both modifiers, `preventDefault`ed so
the browser's own search bar does not also open, and toggling (so the same keys close it). It is
written where it is used, in the platform's own dialect — `⌘K` on an Apple keyboard, `Ctrl+K`
otherwise, because a hint that names a key the keyboard does not have is worse than no hint — and it
is published to assistive technology as well, through `aria-keyshortcuts="Control+K Meta+K"` on both
the field and the rail's control. A `<kbd>` in the palette and the same notation at the end of the
rail's row: a keyboard route nobody can see is a route only the person who wrote it knows.

### 10.5 Where it is drawn, and why it is not inside `<nav>`

The control that opens the palette is part of the rail, above the list, in both presentations: the
label and the hint where there is room, an icon with the tooltip where there is not. It is
**beside** the landmark rather than inside it, and that is not tidiness: inside `<nav>` it would be a
fifteenth entry for every case that counts what the navigation offers, a fifteenth tab stop on the way
to a page, and — the part that matters — a row that looks like a destination and is not one. A case
slices `SidebarNav`'s own source and asserts the trigger is not in it, alongside the two call sites
(the rail and the off-canvas drawer) it must have.

The row is the same box as the entries: 22px glyph slot, 10px padding, and — after the same kind of
measurement this phase's predecessor made — **38px** in both presentations. The first draft drew the
two rows at 39px, because the `<kbd>` chip's line box was one pixel taller than the glyph slot beside
it; the chip is `leading-none` now, and a browser case is what said so. The one difference left is
honest and stated: at a window height where the fourteen entries need to scroll, the entries are 237px
and the row is 247px, because the 10px is the navigation's own scrollbar. The row spans the rail's
inner width; the entries stop at the scroll marker.

Opening it from the phone's off-canvas navigation closes that drawer (`setQuickNavOpen(true)` sets
`sidebarOpen: false`), because two modal surfaces cannot both hold the keyboard — and closing the
palette touches nothing else, so a reader who dismisses the search is exactly where they were.

### 10.6 What was adopted from the references, and what was not

All four reference dashboards put a command palette over their route table: one keyboard-first
surface, one list of destinations derived from the router's own metadata, a highlighted row driven by
`aria-activedescendant`, and the shortcut printed on it. That is § 10.2–§ 10.4, and it is the whole
of what was adopted. None of them has a second navigation — they replace or supplement the sidebar,
and this phase deliberately does not: the rail is the primary navigation and the palette is an
accelerator beside it, which is why the control lives in the rail and the Top Bar is untouched.

Left alone on purpose: the Top Bar's disabled `Search lessons, sessions, notes` field. Its subject is
_content_ — lessons, sessions and notes — which still arrives with the API layer, and this phase's
mechanism is navigation. Wiring one to the other would have renamed a control without building what
its label promises.

### 10.7 What was verified

| Check                                                                   | Where                              | Result |
| ----------------------------------------------------------------------- | ---------------------------------- | ------ |
| Every destination offered, in rail order, on open                       | `tests/browser/e2e.test.ts`        | pass   |
| Found by name, identifier, description and group                        | `tests/browser/e2e.test.ts`        | pass   |
| Enter opens the page, and exactly one entry is left current             | `tests/browser/e2e.test.ts`        | pass   |
| The arrows walk the list and wrap, at both ends                         | `tests/browser/e2e.test.ts`        | pass   |
| Reached from the rail's control, and the keyboard is handed back        | `tests/browser/e2e.test.ts`        | pass   |
| The same directory, order and names under a mirrored interface (**fa**) | `tests/browser/e2e.test.ts`        | pass   |
| No overflow, no clipping and no layout shift at 1440 / 1024 / 390       | `tests/browser/e2e.test.ts`        | pass   |
| Opens over the phone's drawer rather than behind it                     | `tests/browser/e2e.test.ts`        | pass   |
| Search: totality, rank, tie-break, folding, no foreign targets          | `tests/frontend-quicknav.test.ts`  | 13/13  |
| The palette derives from the model, and claims no page                  | `tests/frontend-quicknav.test.ts`  | pass   |
| Navigation, shell layout, RTL, responsive, integration (regression)     | `frontend-*` / `rtl-layout`        | pass   |
| Types, formatting and build                                             | `typecheck`, `format:check`, build | pass   |

And measured in a live browser rather than inferred: the palette at 1440px and at 390px — 14 rows,
the panel inside the viewport (16→374 of 390, 76→751 of 844), one dialog in the document, and
`scrollWidth === innerWidth`; the rail's control 59×38 collapsed and 247×38 expanded, against entries
of 59×38 and 237×38.

### 10.8 A defect the browser case found, and the one it would have missed

The case that presses Escape and asks where the keyboard went came back with **nowhere**: Radix closes
a dialog by returning focus to its own `Dialog.Trigger`, and it calls `preventDefault()` on the
browser's own restore in order to do that — so with no trigger inside the dialog's tree, the keyboard
was simply dropped onto the document. This palette's trigger is the rail's control, a component away
and outside the `Dialog.Root`, so the element is remembered when the panel opens (a _layout_ effect,
because Radix's own focus move is a passive one and would otherwise be read back) and handed back in
`onCloseAutoFocus`. The off-canvas drawer remembers its opener the same way and for the same reason;
this is the second surface in the shell to do it, and both say why next to the line.

The near-miss is worth recording: the same case asserts the field has the keyboard when the palette
opens, and _that_ would have passed either way — Radix's mount focus works. Only the way back was
broken, and only a case that closes the surface and then asks catches it.

## 11. Phase 8.2.4 — the navigation as an integrated system

8.2.1 stated the fourteen destinations, 8.2.2 gave each one a box and an identifier, and 8.2.3 added a
second way in. This phase is the one that treats them as one system and checks the _joins_: every entry
resolves to its page, every page agrees with the entry that opened it, the rail and the palette cannot
disagree, the four widths and both directions behave, and the reader's own navigation — the browser's
Back and Forward buttons — works.

One thing was missing, and it was not a detail. The application had never participated in the session
history at all: pressing Back after walking from Journal to Portfolio **left the application**. § 11.2 to
§ 11.4 are that gap and its resolution; § 11.5 records the two defects the browser cases found in it.
Nothing else changed — no destination was added, removed or renamed, Portfolio and Evaluation are still
two modules, there is still no Performance entry, and no page or Top Bar control was redesigned.

### 11.1 What the integration pass found, besides the history

Everything else the phase asked for was already true, and is now asserted as a _flow_ rather than as a
set of parts: the rail and the phone drawer draw the same fourteen entries in the same order
(8.2.2), each entry's page is titled by the string the entry is labelled with (8.1.3), the rail marks
exactly one entry current on all fourteen routes, choosing a destination closes the drawer it was
chosen from, the collapsed rail stays 76px and stays a navigation, the palette offers the same
directory in the same order under a mirrored interface, and no width the design commits to scrolls
sideways or clips a label. The one surface that had no coverage at all was the one the browser owns,
which is what the rest of this section is about.

### 11.2 The page is a position the browser also keeps

The workspace is path-less on purpose, and § 5.9 of the deployment record depends on that: there is no
client router, so a static host is never asked to resolve a path and no deep link can 404. The reader's
Back button nevertheless expects to undo a move between sections, and the two are not in conflict —
because the History API can put a **state-carrying entry on the same address**.

`web/src/app/pageHistory.ts` writes entries with `pushState(state, '')`: two arguments, the second the
protocol's unused title, and no URL at all. A step is added to the session history and the address does
not move, so every entry the reader can walk to is at the one path the host already serves. A `popstate`
listener then moves the shell to whatever the entry it landed on names.

The entry the document loads on is _named_ rather than left unnamed (`replaceState`, on mount), so the
first Back returns to the page the reader started on instead of to an entry this build never wrote. And
there is still exactly **one** way to change the page: the store's `setPage`, unchanged from Phase 3.
The history watches it rather than being called by it — `connectPageHistory` subscribes to the store and
records every change of `page`, which means a move is recorded however it was made (the rail, the
palette, the top bar's stream chip, a link inside a page, or a phase that does not exist yet) and
re-choosing the page the reader is already on is not a change, so it costs no step and needs no guard.

**The direction of that dependency is load-bearing, not stylistic.** `config/navigation.ts` reads its
labels through `i18n/index.ts`, and `i18n/active.ts` reads the store while it is being evaluated. So
anything the store imports may not reach the navigation: a store that recorded its own moves — importing
this module, which imports the navigation for `APP_PAGE_IDS` — is a cycle in which the store's own value
is undefined by the time the language layer asks for it, and the `language-detection` suite (which
imports the store first) fails on it. The first draft of this phase did exactly that and was rewritten.
The mirror arrangement is also the one this store already uses for its two settings: the store holds the
value, and one owner outside it keeps the copy that outlives the process — except that the page is not
persisted at all, because a position is not a choice (§ 7). A reload still starts at the dashboard.

### 11.3 What a traversal is not allowed to do

Four rules, each with a case:

| Rule                                                                   | Why                                                                              |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A traversal is **not recorded**                                        | recorded, it would append the page just left and Back would never move           |
| An entry this build did not write **changes nothing**                  | a state from another script or build must not be able to send the shell anywhere |
| A traversal **closes the drawer** it arrives over                      | the drawer covers the page it is over; the page changed under it                 |
| A traversal **does not reopen a surface** the reader already dismissed | the palette is where the reader _was_, not part of the page they are on          |

The second is the interesting one. `readPageEntry` validates the state against the same
`APP_PAGE_IDS` the rail is drawn from, accepts only an _own_ property, and answers `null` for everything
else — including a section this product deliberately does not have (`performance`), which a hostile or
stale state could otherwise name. `null` means "not a page this build wrote", and the shell's answer is
to stay exactly where the reader is rather than to jump somewhere nothing asked for.

### 11.4 The defect the browser cases found, twice

**`popstate` never reaches the document.** The first draft listened on `document`, which is where a
`popstate` looks like it should arrive and where nothing arrives at all: the specification fires it at
`window`, the event does not reach `document`, and the listener simply never ran. In a browser the
symptom was a walk that changed `history.state` and left the rail marking the page the address had
already left; there was no console error, because nothing had failed. Measured, then fixed: the listener
is on `window`, and the line above it says why.

**A shared tab hits the browser's history ceiling.** The first version of these cases counted steps with
`history.length`. Chrome caps a tab's session history at **fifty entries** and prunes the oldest as new
ones arrive, and this suite shares one tab for its whole run — so by the time the walk ran, the entries
it had just pushed were being pruned out from under it, and `back 2` of a four-move walk stepped _past
the document_ into whatever the suite had loaded before. The count was measuring the browser's ceiling
rather than the application (`expected 51 to be 50`), and the walk was measuring the tab's age rather
than the shell.

Both halves of that are now stated in the cases rather than worked around: `startClean` resets the tab's
navigation history (`Page.resetNavigationHistory`) before each one, because a reader presses Back in a
tab they have just opened; and the walk itself is the measurement — a move that was not recorded is a
move Back cannot undo, and every case presses Back and asserts which page it lands on. `history.length`
is not asserted anywhere in the phase.

### 11.5 What was verified

| Check                                                                       | Where                                   | Result |
| --------------------------------------------------------------------------- | --------------------------------------- | ------ |
| Four moves, three steps back, three forward, and the address never moves    | `tests/browser/e2e.test.ts`             | pass   |
| The entry the document loaded on is named before any move                   | `tests/browser/e2e.test.ts`             | pass   |
| A move made from the palette is undone exactly like one from the rail       | `tests/browser/e2e.test.ts`             | pass   |
| The keyboard stays on the rail's entry across a walk                        | `tests/browser/e2e.test.ts`             | pass   |
| A press on the entry already current spends no step                         | `tests/browser/e2e.test.ts`             | pass   |
| The walk in a mirrored interface on a phone: drawer shut, one entry current | `tests/browser/e2e.test.ts`             | 5/5    |
| Every entry, its page, and exactly one entry current on all fourteen routes | `tests/browser/e2e.test.ts`             | pass   |
| The palette and the rail cannot disagree after a walk                       | `tests/browser/e2e.test.ts`             | pass   |
| Collapsed rail, phone drawer, four widths, both directions (regression)     | `tests/browser/e2e.test.ts`             | pass   |
| Entry reading: totality, validation, own-property, foreign states           | `tests/frontend-page-history.test.ts`   | 20/20  |
| The connection: recording, traversal, teardown (behavioural)                | `tests/frontend-page-history.test.ts`   | pass   |
| One home for the History API, and no address ever passed to it              | `tests/production-readiness.test.ts`    | pass   |
| Navigation, shell, RTL, responsive, integration, quick nav (regression)     | `frontend-*` / `rtl-layout`             | pass   |
| Types, formatting, build and the whole node suite                           | `typecheck`, `format:check`, `npm test` | pass   |

### 11.6 What was not changed

No entry was added, removed, renamed or reordered; Portfolio and Evaluation remain two modules and there
is still no Performance page; the palette and the rail keep the same fourteen destinations and the same
order; the store's action for changing the page is the one it has had since Phase 3; no page content and
no Top Bar control was touched; no dependency was added — the whole mechanism is the platform's History
API and one store subscription.
