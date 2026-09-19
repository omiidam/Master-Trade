/**
 * Framer Motion presets.
 *
 * Dependency-free data so it can be inspected and tested without a React
 * runtime. Components spread these into `motion.*` props and must disable them
 * when the user prefers reduced motion (`useReducedMotion`).
 */

export const DURATION = {
  fast: 0.14,
  base: 0.22,
  slow: 0.34,
} as const;

export const EASE: Record<'standard' | 'emphasis', [number, number, number, number]> = {
  standard: [0.22, 0.61, 0.36, 1],
  emphasis: [0.16, 1, 0.3, 1],
};

export const FADE_IN = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: DURATION.fast, ease: EASE.standard },
} as const;

export const FADE_UP = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: DURATION.base, ease: EASE.emphasis },
} as const;

export const PANEL_IN = {
  initial: { opacity: 0, scale: 0.98, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: 8 },
  transition: { duration: DURATION.base, ease: EASE.emphasis },
} as const;

export const SLIDE_IN = {
  initial: { opacity: 0, x: -8 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -8 },
  transition: { duration: DURATION.fast, ease: EASE.standard },
} as const;

/** Stagger helper for lists (curriculum modules, tool inventory, log rows). */
export const STAGGER = (index: number, step = 0.04) => ({
  duration: DURATION.base,
  ease: EASE.emphasis,
  delay: Math.min(index * step, 0.24),
});
