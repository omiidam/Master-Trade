import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { FADE_UP, STAGGER } from '../design/motion';
import { cn } from '../lib/cn';

export interface RevealProps {
  children: ReactNode;
  /** Position in a list, so a sequence reveals in order rather than all at once. */
  index?: number;
  className?: string;
}

/**
 * Entrance animation for one block.
 *
 * Two properties matter: it is *subtle* (a 10px rise, not a zoom), and it is
 * *optional* — `useReducedMotion` removes the movement entirely rather than
 * shortening it, because for a vestibular-sensitive user a fast animation is still
 * an animation. The presets themselves live in `web/src/design/motion.ts` so the
 * timing vocabulary is shared with the shell's page transition.
 */
export function Reveal({ children, index = 0, className }: RevealProps) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={FADE_UP.initial}
      animate={FADE_UP.animate}
      transition={STAGGER(index)}
    >
      {children}
    </motion.div>
  );
}

export interface RevealListProps {
  children: ReactNode;
  className?: string;
  /** `1` for `<ol>`, `0` for a plain stacked `<ul>`. */
  ordered?: boolean;
  ariaLabel?: string;
}

/** A list whose children reveal in order. Children are wrapped in `Reveal`. */
export function RevealList({ children, className, ordered = false, ariaLabel }: RevealListProps) {
  const items = Array.isArray(children) ? children : [children];
  const List = ordered ? 'ol' : 'ul';
  return (
    <List className={cn(className)} {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}>
      {items.map((child, index) => (
        // The key is positional on purpose: this component only ever re-orders what
        // it is given, and a stable key would make React reuse the animation state of
        // a different row.
        <li key={index}>
          <Reveal index={index}>{child}</Reveal>
        </li>
      ))}
    </List>
  );
}
