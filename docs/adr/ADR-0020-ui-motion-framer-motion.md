# ADR-0020 — UI motion: Framer Motion behind reduced-motion presets

- **Status:** Accepted (Phase 3.2, architecture lock `DEC-FE-5-MOTION`)
- **Date:** 2026-09-19
- **Supersedes:** none
- **Refines:** [ADR-0010](./ADR-0010-frontend-framework-react-vite.md) (framework), [ADR-0012](./ADR-0012-ui-system-tailwind-radix.md) (UI system)

## Context

The workstation needs motion in three places and nowhere else: page transitions
between the five workspace pages, overlays (modal, tooltips, sidebar collapse),
and list reinforcement (curriculum modules, activity rows). Two hard constraints
come from the product, not from taste:

1. **Motion must never carry information.** If an animation is the only signal
   that something changed, the UI is inaccessible and unreliable.
2. **`prefers-reduced-motion` must be honored**, including the environment this
   preview runs in. Radix primitives already animate nothing themselves, so the
   decision is only about _how_ transitions are expressed.

Tailwind provides transitions but not exit animations (a Modal or route must stay
mounted while it leaves), and hand-rolled `requestAnimationFrame` code for exit
transitions is exactly the kind of state machine that grows bugs.

## Decision

**Framer Motion** (`framer-motion` v12), used through presets in
`web/src/design/motion.ts`, with `AnimatePresence` for exit animations.

- Presets are plain data (`FADE_UP`, `PANEL_IN`, `SLIDE_IN`, `STAGGER`) matching
  the motion tokens declared in `web/src/design/motion.ts` and
  `web/src/styles/global.css`; components spread them instead of inventing
  timings.
- Components call `useReducedMotion()` and drop `initial`/`animate`/`exit` when
  it is true. The CSS layer additionally neutralizes animation and transition
  durations under `prefers-reduced-motion`, so a component that forgets the hook
  still cannot animate.
- Motion is presentational only: no state, no data, and no meaning depends on an
  animation completing.

## Alternatives rejected

| Alternative                            | Why rejected                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| CSS transitions/animations only        | Cannot express exit animations without keeping components mounted by hand; that state machine is ours to maintain and bug-prone.   |
| `@react-spring`                        | Spring-first model is heavier to reason about for the handful of simple fades we need, and its reduced-motion story is manual too. |
| GSAP                                   | Timeline-oriented, large, and its license/attribution model is unnecessary complexity for a desktop training tool.                 |
| Motion One / Web Animations API direct | Small and capable, but no `AnimatePresence` equivalent, so unmount orchestration would be re-implemented per component.            |
| Radix data-state CSS animations only   | Fine for a dropdown, insufficient for route transitions and staggered lists; would mix two animation systems anyway.               |

## Consequences

**Positive:** one animation system; declarative exit handling; reduced motion is a
documented, testable requirement rather than a per-developer habit; timings live
in the design token layer.

**Negative:** one more runtime dependency (~30 kB gzipped in the shell bundle)
and a library that owns unmount timing, so a misused `AnimatePresence` can hold a
stale node — accepted, and constrained by using the shared presets.

**Accessibility impact:** positive, provided the hooks above are kept: information
never arrives _only_ via motion, and reduced-motion users get an instantly stable
interface.

## References

- [technology-decisions.md § 1.6](../technology-decisions.md)
- [`web/src/design/motion.ts`](../../web/src/design/motion.ts), [`web/src/components/Modal.tsx`](../../web/src/components/Modal.tsx)
- [ADR-0012](./ADR-0012-ui-system-tailwind-radix.md), [ADR-0010](./ADR-0010-frontend-framework-react-vite.md)
