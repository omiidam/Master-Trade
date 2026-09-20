# Preview prototype

The interface is a complete, navigable workstation built against the real design
system. It is a **visual and UX prototype**: it renders mock data, states plainly
that it is a preview, and contains no model inference, no market connection and no
execution path.

```
WebView / browser
  App  ──  AppShell ──┬─ Sidebar        navigation, groups, safety card
                     ├─ Topbar         page context, host status, stream status, preview badge
                     └─ Workspace      page header + responsive grids, animated page change
  pages/  dashboard · agent · memory · research · academy · exams · lab · activity · settings
  components/  primitives (10) · charts · exams · memory · research · realtime · states
  mock/    dashboard · exams · memory · research · realtime   (typed, labelled fixtures)
```

## 1. Navigation

`web/src/config/navigation.ts` is the single source: page ids, labels, descriptions,
icons and groups (`Workspace`, `Learning`, `System`). `App.tsx` maps every id to a
page, and `tests/frontend-prototype.test.ts` asserts that mapping — a nav entry with
no page behind it, or a page no longer reachable, fails the suite rather than
silently existing.

| Page         | Group     | What it is for                                                   |
| ------------ | --------- | ---------------------------------------------------------------- |
| Dashboard    | Workspace | Training progress, study metrics, read-only charts               |
| AI Workspace | Workspace | Conversation shape: epistemic labels, sources, tool-request path |
| Memory       | Workspace | Knowledge records with trust state and provenance                |
| Research     | Workspace | Experiments, metrics, findings, approval gate                    |
| Trading Lab  | Workspace | Setup review and risk-math surfaces, read-only                   |
| Academy      | Learning  | Six-month curriculum, lessons, examinations                      |
| Exams        | Learning  | Assessment list, mistakes, score evolution                       |
| Activity     | System    | The event stream and the background-task queue                   |
| Settings     | System    | Appearance, direction, providers, safety posture                 |

Direction is a document-level property (`<html dir>`), so RTL mirrors the layout
without a second stylesheet: spacing uses logical properties throughout.

## 2. Design system

Tokens are declared once in `web/src/styles/global.css` (Tailwind v4 `@theme`) and
inventoried in `web/src/design/tokens.ts`; the token test asserts every variable a
component may reference actually exists. Primitives (`Button`, `Card`, `Badge`,
`Modal`, `Input`, `Tooltip`, `Tabs`, `Skeleton`, `EmptyState`, `ErrorState`) are
re-exported from `web/src/components/index.ts`, so a surface imports one module.

## 3. Motion

`web/src/design/motion.ts` holds the timing vocabulary as data (`DURATION`, `EASE`,
`FADE_UP`, `PANEL_IN`, `STAGGER`). `Reveal` / `RevealList`
(`web/src/components/Reveal.tsx`) apply it to lists and panels, and the shell
animates page changes through `AnimatePresence`.

Every animation checks `useReducedMotion` and **removes the movement** rather than
shortening it — for a vestibular-sensitive user, a fast animation is still an
animation. The stagger delay is capped so a long list does not introduce a second of
waiting.

## 4. States

A surface owes the user three states, and this prototype draws them rather than
describing them. `InterfaceStatesPanel` (`web/src/components/InterfaceStates.tsx`)
renders the **real** `SkeletonCard`, `EmptyState` and `ErrorState` — no placeholder
number ever stands in for a value that has not been read.

| State   | The question it answers                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------- |
| Loading | "Is the layout going to jump when data arrives?" — skeletons match the coming shape                              |
| Empty   | "Is there nothing, or has it not loaded?" — a successful read that found nothing says so                         |
| Error   | "What failed, and can retrying help?" — the typed code is shown, and a retry is offered only when it can succeed |

Pages carry the states their surfaces can actually reach: Dashboard, Memory, Exams,
Research and Activity already had all three; Academy, Trading Lab, AI Workspace and
Settings gained the ones they were missing, in place, next to the surface they
belong to.

## 5. What is real, what is mock, and where it says so

| Surface                                 | Status                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| Every product page's data               | **Mock fixtures** from `web/src/mock/`, listed as typed data                      |
| Topbar badge                            | `Preview · mock data`, always visible, with the reason on hover                   |
| Activity → Job queue                    | **Real** when a session exists (`GET /v1/jobs`); fixtures labelled otherwise      |
| Activity → Event stream                 | **Real** when a session exists; the panel states `live` / `not live`              |
| Add-ons, credentials, host capabilities | **Real** via the desktop shell bridge; unavailable capabilities name their reason |
| AI answers, market data, broker access  | **Absent**. The interface says "not connected" instead of imitating them          |

Two rules keep this honest, and both are tested: a fixture is only rendered inside a
panel that labels it, and nothing routes a fixture into the live store.

## 6. Preparing for the backend

The prototype is wired for the API that exists, not a fictional one:

- `web/src/api/client.ts` — typed over the backend's own contracts and error codes, so
  a server-side code change breaks the frontend build rather than the runtime;
- `web/src/realtime/session.ts` — resolves an endpoint and credentials, and returns a
  typed _unavailable_ reason when there is none (a browser has no sidecar and no
  keychain);
- `web/src/realtime/store.ts` — one place where the stream and the job API meet React.

What is still missing, and therefore shown as such: no session is issued yet, so the
Activity page reports `no-session`; no model provider is registered, so AI Workspace
reports `PROVIDER_UNAVAILABLE`; no chart data source is connected, so charts render
labelled synthetic series.

## 7. Running it

```bash
npm install
npm run dev          # http://127.0.0.1:5173  (browser preview)
npm run desktop:dev  # inside the Tauri shell (keychain, offline cache, local API)
npm run validate     # format check, both typechecks, tests, both builds, shell verify
```

In a browser the interface is fully navigable and every state is reachable; the only
things it will not do are the things it cannot: stream, read the queue, or reach a
model.
