import { useLayoutEffect } from 'react';

/**
 * The workspace's content surface (Phase 8.3.2).
 *
 * There is exactly one, and it is the **window**. The shell around it is chrome — a sticky top bar
 * and a sticky, viewport-tall rail — and the `<main>` between them is a landmark the page renders
 * into rather than a container with a height of its own: neither it, nor the root, nor the page
 * inside it establishes a second scroll box. Scroll position, the scrollbar and the browser's own
 * chrome all belong to the document.
 *
 * Three consequences, and each one is a measurement rather than a preference:
 *
 *   - **The surface is never shorter than the window.** The root is `min-h-screen` and the content
 *     region is `flex-1`, so a section with less content than a screen still draws a full-height
 *     surface and the footer sits at the window's bottom edge instead of halfway up it. That is also
 *     why a short section does not grow a second scrollbar of its own.
 *   - **The surface is never emptied between sections.** `AnimatePresence` swaps one section for the
 *     next in a single commit, so the document's height steps from one section's height to the
 *     other's. A surface that went through zero in between would let the engine clamp the scroll to
 *     whatever was left — the failure this phase's `SectionOrigin` exists to make impossible.
 *   - **A section begins at its own origin.** Scrolling to the bottom of the journal and choosing the
 *     trading lab used to leave the reader at the *end* of the lab: the engine had clamped a 2500px
 *     offset down to the 420px the shorter section allows, so the shortest section in the product
 *     opened at its own foot with its title off screen. A section change now presents the new section
 *     from its beginning, and that beginning is the same one whether the reader arrived from a long
 *     section, a short one, or the browser's Back button.
 */

/** The content surface put back at the origin of the section being read. */
export function resetContentOrigin(surface: { scrollTo: (x: number, y: number) => void }): void {
  // Instant, never smooth: a section change is a new page rather than a scroll, and an animation
  // across a whole section's height is exactly the "unnecessary animation" this phase may not add.
  surface.scrollTo(0, 0);
}

/**
 * A section's own origin, asserted as the section mounts.
 *
 * It renders nothing, and *where* it is mounted is the whole point. The shell re-renders as soon as
 * the reader chooses a section, while the outgoing section is still on screen playing its exit
 * animation — so a `page`-keyed effect in the shell would scroll the reader to the top of the
 * section they were already leaving. Mounted inside the keyed surface instead, the reset happens in
 * the same commit that brings the new section in and before the browser paints it: no frame is ever
 * drawn at another section's offset.
 */
export function SectionOrigin(): null {
  useLayoutEffect(() => {
    resetContentOrigin(window);
  }, []);
  return null;
}
