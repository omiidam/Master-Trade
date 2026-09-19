# ADR-0010 — Frontend framework: React 19 + Vite

- **Status:** Accepted (Phase 3.1, architecture lock `DEC-FE-1-FRAMEWORK`)
- **Date:** 2026-09-19
- **Supersedes:** none

## Context

The frontend is a long-lived desktop console hosted in the Tauri WebView: a
streaming agent conversation, a six-month curriculum with exams, a read-only
trading dashboard with charts, an activity log and a settings screen. It must be
TypeScript (the repo standard, and the same contracts the backend validates
against), it must be testable in CI, and it must stay legible enough that the
"no execution controls" invariant remains reviewable.

Constraints that shaped the decision: one small team, an offline-first desktop
app, no server rendering, and a hard requirement that the UI never calls a
provider or the database directly.

## Decision

**React 19 with TypeScript (strict), bundled by Vite 6.**

- `src/frontend/viewModels.ts` remains the shared contract; the UI renders view
  models, never raw backend or provider payloads.
- Vite is also the dev server and the Tauri 2 template's bundler, so there is
  exactly one frontend build pipeline.
- React's ecosystem covers the three hardest UI needs here: virtualization for
  long conversation/activity lists, accessible primitives (Radix, see ADR-0012),
  and trading-chart wrappers (ADR-0013).

## Alternatives rejected

| Alternative             | Why rejected                                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Svelte 5                | Leaner runtime and pleasant ergonomics, but a smaller ecosystem for virtualized lists, a11y primitives and financial charts, and fewer people to hire/replace on a 6-month project.     |
| Vue 3                   | Perfectly capable; React won on charting/virtualization ecosystem maturity and on being the default target of the Tauri templates we rely on.                                           |
| SolidJS                 | Excellent performance characteristics we do not currently need (one local user), with a markedly smaller ecosystem and fewer battle-tested libraries for our specific needs.            |
| Next.js / SSR framework | Solves problems this app does not have (SEO, edge routing, server rendering). Adds a server runtime inside a desktop app and a data-fetching model that duplicates our typed API layer. |
| Plain Web Components    | Would mean hand-rolling state, routing and composition patterns that React/Vite provide as boring defaults.                                                                             |

## Consequences

**Positive:** largest ecosystem for the specific widgets needed; Vite keeps
builds fast; type-strict React pairs well with the existing view-model contracts;
strong CI story (Vitest + Testing Library, Playwright for WebView E2E via
`tauri-driver`).

**Negative:** React 19's Compiler is opt-in and not adopted yet, so re-render
discipline for streaming tokens must be handled explicitly (transient Zustand
slice, see ADR-0011). Bundle size is larger than Svelte's — irrelevant inside a
~10–15 MB Tauri shell.

**Security impact:** none by itself. The UI prohibition list is enforced by
`assertNoExecutionControls()` and by tests, independent of the framework.

## References

- [technology-decisions.md § 1](../technology-decisions.md)
- [desktop-and-frontend.md](../desktop-and-frontend.md)
- [ADR-0001](./ADR-0001-desktop-shell-tauri.md), [ADR-0011](./ADR-0011-frontend-state-tanstack-query-zustand.md)
