# Application Shell — Phase 7.1.1

The layout foundation of the workstation: **Top Bar, Sidebar, Main Content**. This phase adds no
region and changes no arrangement — the shell has existed since Phase 3.2 and every phase since has
extended it. What Phase 7.1.1 does is _state_ the layout as a contract and hold it there: which
element is which landmark, the widths it must survive, and the two properties a trading workstation
cannot lose — the workspace keeps its own width, and the Persian mirror does not break it.

Nothing in `web/src/app/` was restructured to write this. The deliverable is the focused suite
([`tests/frontend-shell-layout.test.ts`](../tests/frontend-shell-layout.test.ts), 16 cases) plus this
record.

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

The shell is laid out in flow: `flex` for the frame, `sticky` for the rail and the top bar. A
_region_ is never `fixed` or `absolute` — that is how a rail ends up drawn over the content it
frames. The only absolute positioning in the three shell files is the skip link (visible on focus)
and two decorations inside controls: the search glyph and the unread dot. The suite asserts that
enumerated set, so a new absolute position in the shell has to be justified before it can exist.

## 5. What was verified

| Check                                | Where                                                        | Result |
| ------------------------------------ | ------------------------------------------------------------ | ------ |
| The three regions and landmarks      | `tests/frontend-shell-layout.test.ts`                        | 16/16  |
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
