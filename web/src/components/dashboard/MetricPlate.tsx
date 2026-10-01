/**
 * A KPI plate: one figure, its name, and what the figure means.
 *
 * The dashboard's top strip is three of these — identity, habit, evaluation — and they are the
 * same shape on purpose: a reader scanning for "how am I doing" should compare three numbers
 * without re-learning the layout three times. What differs between them is the *content*
 * (a level is a word, a streak is a count with a unit, a score is a percentage with a verdict),
 * which is why the figure and the empty state are slots rather than props this component
 * formats. It renders what it is given and computes nothing — the server derived every number
 * upstream, and a plate that did its own arithmetic would be a second opinion about it.
 *
 * The form is `surface="metric"`: raised, corner-cut, the hardest edge in the system. That is
 * deliberate — a metric is an object you could pick up, and the plate that carries the figure
 * should read as more lifted than the panels that explain it.
 */

import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../Card';

export interface MetricPlateProps {
  /** What the figure is called. Rendered as the plate's own heading. */
  label: string;
  /** One line of context under the label — a definition, or the subject of the figure. */
  description?: string;
  /** A status chip for the header: a verdict, a module marker, a count. */
  badge?: ReactNode;
  /** The figure itself, already formatted. Absent means the plate shows its empty state. */
  value?: ReactNode;
  /** The line under the figure: counts, timestamps, units. */
  detail?: ReactNode;
  /** What to draw when there is no figure to draw. Stated, never a zero. */
  empty?: ReactNode;
  /** The footer note: what the figure means, or what it cannot tell you. */
  note?: string;
  /** A way out of an empty plate, or into the page the figure belongs to. */
  action?: ReactNode;
}

export function MetricPlate({
  label,
  description,
  badge,
  value,
  detail,
  empty,
  note,
  action,
}: MetricPlateProps) {
  return (
    <Card surface="metric" className="flex flex-col">
      <CardHeader divider actions={badge ?? null}>
        <div>
          <CardTitle className="text-body">{label}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-2">
        {value === undefined ? (empty ?? null) : value}
        {detail ? <div className="text-caption text-text-muted">{detail}</div> : null}
      </CardContent>
      {note || action ? (
        <CardFooter className="text-caption text-text-faint">
          {note ? <span>{note}</span> : <span />}
          {action ?? null}
        </CardFooter>
      ) : null}
    </Card>
  );
}
