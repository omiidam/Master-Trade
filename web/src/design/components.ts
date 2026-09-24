/**
 * The component contract, as data.
 *
 * The same reasoning as `design/motion.ts`: dependency-free values that components spread and
 * tests inspect, so a rule about a component is a value someone can read rather than a behaviour
 * inferred from its markup. Nothing here renders, imports React, or knows about the DOM.
 *
 * What lives here is the vocabulary the feedback surfaces share. It is deliberately not in
 * `design/tokens.ts`: that manifest is about *theme variables* — values the stylesheet declares —
 * and this is about how those values are used. Keeping the two apart is what lets the token suite
 * ask "is every declared variable inventoried?" without component semantics appearing in the
 * answer.
 */

/**
 * The six things the interface is allowed to say back to someone.
 *
 * `error` and `destructive` are the pair worth keeping apart. `error` describes something that
 * already happened and could not be done; `destructive` describes something that is about to be
 * done and cannot be undone. Both are red, and they are separate tones because a report and a
 * confirmation must not look interchangeable — only the destructive one carries a glow.
 */
export type AlertTone = 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'destructive';

/** The tones in escalation order, so a gallery can render them the way a reader expects. */
export const ALERT_TONES: readonly AlertTone[] = [
  'neutral',
  'info',
  'success',
  'warning',
  'error',
  'destructive',
];

/** How an assistive technology is told about a tone. */
export type AlertRole = 'status' | 'alert';

/**
 * Which tones interrupt.
 *
 * A live region that shouts about something informational is a live region people learn to ignore,
 * so a statement is announced politely and only a warning, a failure or a decision cuts in. This is
 * a property of the tone rather than of the sentence, which is why it is a table here and not a
 * decision each caller makes.
 */
export const ALERT_TONE_ROLE: Record<AlertTone, AlertRole> = {
  neutral: 'status',
  info: 'status',
  success: 'status',
  warning: 'alert',
  error: 'alert',
  destructive: 'alert',
};

/**
 * How long a toast of each tone stays, in milliseconds. `0` means until it is dismissed.
 *
 * The times are not uniform because the tones are not: a confirmation is read at a glance while a
 * failure has to be read *and* acted on, so the more there is to do about a message the longer it
 * waits. A destructive prompt never self-dismisses at all — a confirmation that disappears while
 * someone is reading it is a decision the interface made for them.
 */
export const TOAST_DURATIONS: Record<AlertTone, number> = {
  neutral: 5000,
  info: 5000,
  success: 5000,
  warning: 7000,
  error: 9000,
  destructive: 0,
};
