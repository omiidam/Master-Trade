import type { ReactNode } from 'react';
import { useId } from 'react';
import { Send } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Badge } from '../Badge';
import { Button, IconButton } from '../Button';
import { Tooltip } from '../Tooltip';

/**
 * One tool in the composer's left cluster.
 *
 * `blockedReason` is what makes the cluster honest. A composer affordance that exists but cannot do
 * anything is worse than one that is absent, so a tool without a reason is rendered enabled and a
 * tool with one is rendered disabled *and* explained — the same rule the rest of this interface
 * follows for a capability that is declared and unbuilt.
 */
export interface ComposerTool {
  /** The control's accessible name. */
  label: string;
  icon: ReactNode;
  /** Why the tool is not available. Set only when it genuinely is not. */
  blockedReason?: string;
}

export interface MessageComposerProps {
  /** Accessible name for the message field. Rendered for the label element, not painted. */
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  /** Accessible name for the send control. */
  sendLabel?: string;
  /**
   * Why sending is refused. The send control is disabled exactly while this is set, and the reason
   * is the control's description — a disabled button with no explanation is a dead end.
   */
  blockedReason?: string;
  onSubmit?: () => void;
  /** The composer's tools. An empty list renders no cluster at all. */
  tools?: readonly ComposerTool[];
  /**
   * Examples of what could be asked, shown as static chips under the frame.
   *
   * They are labels rather than shortcuts: nothing here fills the field or sends anything, because
   * a chip that looks like a button and does nothing is the exact affordance this file avoids
   * everywhere else. They say what the surface is for, next to the sentence that says it is off.
   */
  examples?: readonly string[];
  className?: string;
}

/**
 * The message composer.
 *
 * Three pieces of the visual language, all from the token layer:
 *
 *   1. **The frame is the border.** `.composer-frame` is a 1.5px gradient ring lit from the upper
 *      left, with a blurred specular gleam in that same corner. Padding *is* the stroke, which is
 *      the only way to give a radius-respecting element a gradient border — `border-image` ignores
 *      `border-radius`, and a 1px solid stroke is what makes a box look like a box.
 *   2. **The field is a well, not a box.** Inside the ring sits `--color-surface-sunken`, the same
 *      recess every other input in the product is cut into, so a composer is recognisably a form
 *      control rather than a chat widget bolted on beside one.
 *   3. **The send control is two parts**: the accent face from the control family, and an inset
 *      dark well holding the glyph. The reference draws that well as glass with a backdrop blur;
 *      over a smooth accent gradient a blur has nothing to resolve, so it is the inset alone, and
 *      the glyph is what lights up.
 *
 * Reliability over ornament, in one place: the reference rotates the send glyph 45° on focus. A
 * paper plane that has a different heading when focused says nothing about sending, so the hover
 * and focus treatments lift the face, light the glyph and lean on the page-wide focus ring that
 * every other control in the product already gets.
 */
export function MessageComposer({
  label,
  value,
  onValueChange,
  placeholder = 'Ask about a lesson, a risk calculation or a past session…',
  sendLabel = 'Send message',
  blockedReason,
  onSubmit,
  tools = [],
  examples = [],
  className,
}: MessageComposerProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const blocked = blockedReason !== undefined;
  // A send control with nowhere to send is disabled for the same reason a blocked one is: the
  // interface must not offer a control that cannot do what it looks like it does.
  const sendDisabled = blocked || onSubmit === undefined;

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="composer-frame">
        <div className="flex flex-col rounded-[calc(var(--radius-panel)-1.5px)] bg-surface-sunken">
          <label htmlFor={id} className="sr-only">
            {label}
          </label>
          <textarea
            id={id}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder={placeholder}
            rows={2}
            disabled={blocked}
            {...(blocked ? { 'aria-describedby': hintId } : {})}
            className={cn(
              'min-h-[52px] w-full resize-none bg-transparent px-3.5 pb-1 pt-3',
              'text-body leading-relaxed text-text',
              // The placeholder brightens at rest and fades once the field is live, so the prompt
              // stops competing with what is being typed.
              'placeholder:text-text-muted focus:placeholder:text-text-faint',
              'disabled:cursor-not-allowed',
            )}
          />
          <div className="flex items-end justify-between gap-2 px-2.5 pb-2.5">
            <div className="flex items-center gap-1.5">
              {tools.map((tool) => (
                <Tooltip key={tool.label} content={tool.blockedReason ?? tool.label}>
                  {/* The wrapper carries the tooltip: a disabled control is `pointer-events: none`
                      and can never open one itself. */}
                  <span>
                    {/* `size="icon"` rather than `sm`: the small size carries its own horizontal
                        padding, and a square control is the shape a bare glyph wants. */}
                    <IconButton
                      variant="ghost"
                      label={tool.label}
                      disabled={tool.blockedReason !== undefined}
                      className="hover:-translate-y-1"
                    >
                      {tool.icon}
                    </IconButton>
                  </span>
                </Tooltip>
              ))}
            </div>
            <Tooltip content={blockedReason ?? sendLabel}>
              <span>
                <Button
                  variant="primary"
                  size="icon"
                  label={sendLabel}
                  disabled={sendDisabled}
                  onClick={onSubmit}
                  className="p-[3px]"
                >
                  <span
                    aria-hidden
                    className="grid h-full w-full place-items-center rounded-[var(--radius-inset)] bg-surface-sunken/35"
                  >
                    <Send size={14} />
                  </span>
                </Button>
              </span>
            </Tooltip>
          </div>
        </div>
      </div>

      {examples.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1 pt-3.5">
          <span className="text-micro uppercase tracking-wide text-text-faint">Examples</span>
          {examples.map((example) => (
            <Badge key={example} tone="neutral" shape="tag">
              {example}
            </Badge>
          ))}
        </div>
      ) : null}

      {blockedReason ? (
        <p id={hintId} className="mt-3 text-caption text-text-muted">
          {blockedReason}
        </p>
      ) : null}
    </div>
  );
}
