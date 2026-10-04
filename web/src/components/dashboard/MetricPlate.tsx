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
 *
 * Four things here exist so a *row* of plates aligns, which is the only way a KPI strip works: the
 * density is stated rather than inherited from the surface, the definition line is reserved whether
 * or not this plate has one, the body grows to fill the space between the two reserved bands, and
 * the note area is held to two lines so a caveat that wraps does not shorten its neighbour's body.
 * A strip whose figures sit at three different heights makes the reader measure instead of compare.
 *
 * The footer therefore renders even when it is empty: it is part of the plate's shape, and a plate
 * that dropped it would have a taller body than the plates beside it.
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
    // `cozy` rather than the surface's own `compact`: the plates share this row with the panels
    // below, and one inner rhythm across the page is what lets a title here and a title there
    // start on the same line. The face is untouched — only the density is stated.
    <Card surface="metric" density="cozy" className="flex flex-col">
      <CardHeader divider actions={badge ?? null}>
        <div>
          <CardTitle className="text-body">{label}</CardTitle>
          {/* The definition line is part of the plate's shape, not an optional extra: a plate
              without one still reserves the line, so a strip of plates has one header height and
              its figures begin together. The spacer is aria-hidden and carries no text. */}
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : (
            <CardDescription aria-hidden>{'\u00a0'}</CardDescription>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2">
        {value === undefined ? (
          <div className="flex flex-1 flex-col [&>*]:grow">{empty ?? null}</div>
        ) : (
          value
        )}
        {detail ? <div className="text-caption text-text-muted">{detail}</div> : null}
      </CardContent>
      <CardFooter className="text-caption text-text-faint">
        {/* Two caption lines, in the caption's own unit: `lh` is this element's line height, so the
            reserve follows the token rather than restating it as a pixel count. */}
        <span className="min-h-[2lh]">{note ?? ''}</span>
        {action ?? null}
      </CardFooter>
    </Card>
  );
}
