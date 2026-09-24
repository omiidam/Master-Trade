/**
 * The agent surface.
 *
 * Two primitives, and they share one idea: this is the part of the interface where the *agent*
 * lives, so it has a light of its own. The composer is framed by a ring lit from the upper left;
 * the cards are lit from below. Everything else in the product is lit from above.
 *
 * Kept as its own family rather than folded into the top-level primitives because both components
 * are about a surface that talks back — one takes a message, the others describe how the message
 * will be handled — and neither is a general-purpose control. `Select` lives in `Input.tsx` for the
 * opposite reason: it is a form control that differs from an input in one detail.
 */

export { AgentBadge, AgentCard, AgentCardItem, AgentCardList, AgentCheck } from './AgentCard';
export type { AgentBadgeTone, AgentCardProps } from './AgentCard';

export { MessageComposer } from './MessageComposer';
export type { ComposerTool, MessageComposerProps } from './MessageComposer';
