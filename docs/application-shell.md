# Application Shell — Phases 7.1.1 and 8.1.2

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
- **Mirrored by the direction.** It slides from the inline-start edge with a Framer Motion transform
  (`x`), not a `translate-x` utility, so it arrives from the right in Persian and the left in English;
  under `prefers-reduced-motion` it fades instead of sliding.

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
