import { useState } from 'react';
import { Alert, type AlertTone } from './Alert';
import { Badge } from './Badge';
import { Button, type ButtonVariant } from './Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Section } from './Card';
import { Reveal } from './Reveal';
import { useToast } from './Toast';

interface AlertExhibit {
  tone: AlertTone;
  label: string;
  title: string;
  description: string;
}

/**
 * The six tones, in the order the interface escalates through them.
 *
 * Each line says what the tone *means*, because that is the part a component cannot show: `error`
 * and `destructive` are the same red and only the copy tells them apart, which is exactly why they
 * are two tones and not one.
 */
const ALERTS: readonly AlertExhibit[] = [
  {
    tone: 'neutral',
    label: 'neutral',
    title: 'Nothing to report',
    description: 'A statement with no verdict of its own — context, a count, a note.',
  },
  {
    tone: 'info',
    label: 'info',
    title: 'Worth knowing',
    description:
      'Announced politely. Information does not interrupt, which is what keeps an interruption meaningful.',
  },
  {
    tone: 'success',
    label: 'success',
    title: 'That worked',
    description:
      'A completed action, confirmed. It shares the brand green and is a distinct fill from it.',
  },
  {
    tone: 'warning',
    label: 'warning',
    title: 'Check this before continuing',
    description: 'Proceed-able, but not silently: something here may not be what was meant.',
  },
  {
    tone: 'error',
    label: 'error',
    title: 'That could not be done',
    description:
      'A failure, reported with its typed code as evidence rather than restated in prose.',
  },
  {
    tone: 'destructive',
    label: 'destructive',
    title: 'This cannot be undone',
    description:
      'A confirmation rather than a report. The only feedback surface allowed a glow, because a decision deserves more weight than a notice.',
  },
];

interface ToastExhibit {
  tone: AlertTone;
  label: string;
  variant: ButtonVariant;
}

const TOASTS: readonly ToastExhibit[] = [
  { tone: 'neutral', label: 'Note', variant: 'secondary' },
  { tone: 'info', label: 'Information', variant: 'info' },
  { tone: 'success', label: 'Success', variant: 'success' },
  { tone: 'warning', label: 'Warning', variant: 'warning' },
  { tone: 'error', label: 'Failure', variant: 'danger' },
];

export interface FeedbackStatesPanelProps {
  title?: string;
  description?: string;
  className?: string;
}

/**
 * The feedback system, exhibited in place.
 *
 * The same reasoning as the interface-states panel next to it: this is where the six tones get
 * argued about, so it renders the real components rather than describing them. Raising a toast
 * really raises it, through the same provider the application uses, with the same auto-dismiss and
 * the same pause-on-hover. Nothing here is a picture of a component.
 *
 * It also has a structural job. `Alert` and `Toast` are the two pieces of the 7.2 component set
 * that no product screen uses yet, and an unused component is one nobody has looked at — this panel
 * is the consumer that keeps them rendered, reviewable and in the browser suite's path.
 */
export function FeedbackStatesPanel({
  title = 'Feedback and overlays',
  description = 'The six things this workstation can say back, and the transient form of the same message.',
  className,
}: FeedbackStatesPanelProps) {
  const { toast } = useToast();
  const [raised, setRaised] = useState<string | null>(null);

  return (
    <Section title={title} description={description} className={className}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {ALERTS.map((entry, index) => (
          <Reveal key={entry.tone} index={index}>
            <Alert
              tone={entry.tone}
              title={entry.title}
              description={entry.description}
              meta={
                <Badge shape="tag" tone="outline">
                  {entry.label}
                </Badge>
              }
              className="h-full"
            />
          </Reveal>
        ))}
      </div>

      {/*
       * The emphasis card, rendered rather than described. `emphasis="accent"` is the one card a
       * screen is organised around — elevation level 3, the single accent surface that asks to be
       * acted on — and this is the interactive card of the exhibit, which is exactly that role.
       * It is here so the emphasis is a surface someone has looked at, not a prop in a type.
       */}
      <Card emphasis="accent">
        <CardHeader>
          <div>
            <CardTitle className="text-body">Toasts — on the accent card</CardTitle>
            <CardDescription>
              The same component with a lifetime. Hover or focus one and it stops counting down;
              each tone's default duration is its own, and a destructive prompt has none because it
              is waiting for a decision. The card itself is the exhibit's accent emphasis: the one
              surface on a screen that asks to be acted on, drawn here rather than described.
            </CardDescription>
          </div>
          <Badge tone="outline" shape="tag">
            live
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {TOASTS.map((entry) => (
              <Button
                key={entry.tone}
                size="sm"
                variant={entry.variant}
                onClick={() => {
                  setRaised(entry.tone);
                  toast({
                    tone: entry.tone,
                    title: `${entry.label} toast`,
                    description:
                      'Raised through the shared provider, so it pauses when you reach for it.',
                  });
                }}
              >
                Raise {entry.label.toLowerCase()}
              </Button>
            ))}
          </div>
          {/* A visible trace of the last raise. Not a live region: the toast already announces
              itself, and a second announcement of the same event is noise. */}
          <p className="text-caption text-text-faint">
            {raised === null
              ? 'Nothing raised yet.'
              : `Last raised: ${raised}. The toast itself is at the bottom of the window.`}
          </p>
        </CardContent>
      </Card>
    </Section>
  );
}
