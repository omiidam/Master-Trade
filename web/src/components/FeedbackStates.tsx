import { useState } from 'react';
import { Alert, type AlertTone } from './Alert';
import { Badge } from './Badge';
import { Button, type ButtonVariant } from './Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Section } from './Card';
import { Reveal } from './Reveal';
import { useToast } from './Toast';
import { msg } from '../i18n/index.js';

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
    get title(): string {
      return msg('feedbackStates.nothingToReport');
    },
    get description(): string {
      return msg('feedbackStates.aStatementWithNoVerdictOfItsOwn');
    },
  },
  {
    tone: 'info',
    label: 'info',
    get title(): string {
      return msg('feedbackStates.worthKnowing');
    },
    get description(): string {
      return msg('feedbackStates.announcedPolitelyInformationDoesNotInterruptWhichIs');
    },
  },
  {
    tone: 'success',
    label: 'success',
    get title(): string {
      return msg('feedbackStates.thatWorked');
    },
    get description(): string {
      return msg('feedbackStates.aCompletedActionConfirmedItSharesTheBrand');
    },
  },
  {
    tone: 'warning',
    label: 'warning',
    get title(): string {
      return msg('feedbackStates.checkThisBeforeContinuing');
    },
    get description(): string {
      return msg('feedbackStates.proceedAbleButNotSilentlySomethingHereMayNot');
    },
  },
  {
    tone: 'error',
    label: 'error',
    get title(): string {
      return msg('feedbackStates.thatCouldNotBeDone');
    },
    get description(): string {
      return msg('feedbackStates.aFailureReportedWithItsTypedCodeAs');
    },
  },
  {
    tone: 'destructive',
    label: 'destructive',
    get title(): string {
      return msg('feedbackStates.thisCannotBeUndone');
    },
    get description(): string {
      return msg('feedbackStates.aConfirmationRatherThanAReportTheOnly');
    },
  },
];

interface ToastExhibit {
  tone: AlertTone;
  label: string;
  variant: ButtonVariant;
}

const TOASTS: readonly ToastExhibit[] = [
  {
    tone: 'neutral',
    get label(): string {
      return msg('feedbackStates.note');
    },
    variant: 'secondary',
  },
  {
    tone: 'info',
    get label(): string {
      return msg('feedbackStates.information');
    },
    variant: 'info',
  },
  {
    tone: 'success',
    get label(): string {
      return msg('feedbackStates.success');
    },
    variant: 'success',
  },
  {
    tone: 'warning',
    get label(): string {
      return msg('feedbackStates.warning');
    },
    variant: 'warning',
  },
  {
    tone: 'error',
    get label(): string {
      return msg('feedbackStates.failure');
    },
    variant: 'danger',
  },
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
        <CardHeader divider>
          <div>
            <CardTitle className="text-body">{msg('ui.toastsOnTheAccentCard')}</CardTitle>
            <CardDescription>{msg('ui.theSameComponentWithALifetime')}</CardDescription>
          </div>
          <Badge tone="outline" shape="tag">
            {msg('ui.live')}
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
                    description: msg('feedbackStates.raisedThroughTheSharedProviderSoItPauses'),
                  });
                }}
              >
                {msg('ui.raise')} {entry.label.toLowerCase()}
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
