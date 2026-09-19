# ADR-0012 — UI system: Tailwind + Radix primitives

- **Status:** Accepted (Phase 3.1, architecture lock `DEC-FE-3-UI-SYSTEM`)
- **Date:** 2026-09-19
- **Supersedes:** none

## Context

The UI needs a component layer that is (a) accessible without hand-rolling focus
traps and ARIA wiring, (b) cheap to render next to a high-frequency token stream
inside a WebView, and (c) legible enough that safety invariants can be reviewed
by reading component and label vocabulary rather than auditing a vendor's
internals. Phase 2 already asserts that no navigation label or control matches
`FORBIDDEN_UI_CONTROL`; the component layer must not make that assertion
meaningless by hiding controls inside opaque prebuilt components.

## Decision

**Tailwind CSS v4 for styling, Radix UI primitives for behavior, shadcn-style
components vendored into the repository, lucide-react for icons.**

- Behavior (dialog, popover, tabs, tooltip, menu, select) comes from Radix.
- Presentation is Tailwind utility classes colocated with markup.
- Component code is copied into `src/frontend/components/` and owned by us, so
  no dependency release can restyle or re-scope the design system.
- One shared `NavItem`/control-label convention keeps the forbidden-control test
  meaningful: labels and affordances are declared, not improvised per screen.

## Alternatives rejected

| Alternative         | Why rejected                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MUI (Material UI)   | Large runtime, strongly opinionated visual language, and its prebuilt components make "is there an execution affordance on this screen?" a question about the library rather than about our code. |
| Ant Design          | Enterprise-console look and heavy bundle; theming to a trading-training tone means fighting it.                                                                                                   |
| Chakra UI           | Runtime CSS-in-JS costs during streaming re-renders; less control over what ships to the WebView.                                                                                                 |
| Mantine             | Good, but no advantage over Tailwind + Radix here, and the vendored-primitives property is lost.                                                                                                  |
| Bespoke SCSS system | Would rebuild focus management, keyboard semantics and ARIA from scratch — the expensive, error-prone part of any design system.                                                                  |

## Consequences

**Positive:** accessible behavior without vendor lock-in on appearance; zero
runtime CSS engine; the design system is reviewable code; a11y regressions are
testable with standard tooling.

**Negative:** more assembly work per component than importing a full kit, and a
one-time cost to establish the token set (colors, spacing, typography) in the
Tailwind config.

**Security impact:** positive — because components are ours, the
`FORBIDDEN_UI_CONTROL` and provenance-label invariants live in the same files
that define navigation and chart controls.

## References

- [technology-decisions.md § 1.3](../technology-decisions.md)
- [desktop-and-frontend.md](../desktop-and-frontend.md)
- [ADR-0010](./ADR-0010-frontend-framework-react-vite.md)
