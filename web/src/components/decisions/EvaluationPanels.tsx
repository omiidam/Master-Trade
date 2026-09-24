/**
 * The decision evaluation surface, as components.
 *
 * Presentation only: no component here measures anything, ranks anything or labels a decision as
 * right or wrong. Every figure arrives formatted and labelled by the engine, and every reason
 * arrives as contract text from the gate. That split is the reason this family exists at all — the
 * alternative is a surface that decides for itself what a number means.
 *
 * Three presentation rules, and each exists to stop a misreading that the data would otherwise
 * permit:
 *
 *   1. **The outcome label sits with the figure, not at the top of the page.** A record can hold
 *      more than one kind at once — a realised entry beside an unrealised result — and one badge for
 *      the whole document would have to misdescribe one of them.
 *   2. **Absence is rendered as absence.** A figure the engine could not produce shows the reason it
 *      could not, never a zero and never a dash with no explanation, because `—` reads as "flat".
 *   3. **A limitation is never behind a disclosure.** Every layout below keeps the limitations in
 *      the same flow as the figures they qualify, including on the narrowest column.
 */

import type { ReactNode } from 'react';
import type { DecisionEvaluationView, DecisionSummaryView } from '@shared/api/contracts';
import type {
  DecisionEvaluationReport,
  DecisionObservation,
  DecisionRecord,
  EvaluationOutcome,
  ExpectedVersusActual,
} from '@shared/decisions/model';
import type { DecisionReadinessDecision } from '@shared/decisions/readiness';
import { Badge } from '../Badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardDivider,
  CardHeader,
  CardTile,
  CardTitle,
  Section,
} from '../Card';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../Table';
import { EmptyState } from '../EmptyState';
import { TrendMark } from '../Trend';
import { cn } from '../../lib/cn';
import {
  BASE_READINESS_TONE,
  CONFIDENCE_LABEL,
  CONFIDENCE_TONE,
  DECISION_EVALUATION_REASON_LABEL,
  DECISION_OBSERVATION_SEVERITY_LABEL,
  DECISION_OBSERVATION_TYPE_LABEL,
  DECISION_TYPE_LABEL,
  EVALUATION_OUTCOME_LABEL,
  EVALUATION_OUTCOME_MEANING,
  EVALUATION_READINESS_LABEL,
  EVALUATION_READINESS_MEANING,
  EVALUATION_READINESS_TONE,
  KIND_TONE,
  OBSERVATION_TONE,
  OUTCOME_TONE,
  figureClass,
  figureMark,
} from './labels';

/**
 * The badge that must travel with anything a scenario produced.
 *
 * Rendered for every figure whose outcome is not realised or unrealised, so there is no layout in
 * which a hypothetical number appears without saying so. It is a separate component rather than a
 * prop on a list because a caller should have to *choose* to omit it.
 */
export function HypotheticalScenarioBadge({
  outcome,
  className,
}: {
  outcome: EvaluationOutcome;
  className?: string;
}) {
  if (outcome === 'realised' || outcome === 'unrealised') return null;
  return (
    <Badge tone={OUTCOME_TONE[outcome]} className={className}>
      {EVALUATION_OUTCOME_LABEL[outcome]} — not a result
    </Badge>
  );
}

function Chip({ label, value }: { label: string; value: ReactNode }) {
  return (
    <CardTile tone="raised" className="min-w-0">
      <p className="text-caption text-text-muted">{label}</p>
      <p className="mt-0.5 truncate text-body font-medium text-text">{value}</p>
    </CardTile>
  );
}

/** The record's own facts. Nothing here is computed. */
export function DecisionSummary({
  decision,
  className,
}: {
  decision: DecisionRecord;
  className?: string;
}) {
  const scope = decision.symbol ?? decision.portfolioId ?? 'Composition-wide';
  return (
    <Card surface="data" className={className}>
      <CardHeader divider>
        <div className="min-w-0">
          <CardTitle className="truncate">{scope}</CardTitle>
          <CardDescription>
            {DECISION_TYPE_LABEL[decision.type]} · recorded{' '}
            {new Date(decision.decidedAt).toLocaleString()}
          </CardDescription>
        </div>
        <Badge tone={KIND_TONE[decision.kind]}>{decision.kind}</Badge>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Chip label="Currency" value={decision.currency} />
        <Chip
          label="Entry"
          value={decision.entryPrice === null ? 'not recorded' : decision.entryPrice.value}
        />
        <Chip
          label="Exit"
          value={decision.exitPrice === null ? 'not recorded' : decision.exitPrice.value}
        />
        <Chip
          label="Planned risk"
          value={
            decision.risk.plannedRiskPercent === null
              ? 'not recorded'
              : `${decision.risk.plannedRiskPercent}%`
          }
        />
        <Chip label="Window opens" value={new Date(decision.period.startAt).toLocaleDateString()} />
        <Chip
          label="Window closes"
          value={
            decision.period.endAt === null
              ? 'still open'
              : new Date(decision.period.endAt).toLocaleDateString()
          }
        />
        <Chip
          label="Expected return"
          value={
            decision.expectation.returnPercent === null
              ? 'not stated'
              : `${decision.expectation.returnPercent}%`
          }
        />
        <Chip
          label="Expected R"
          value={
            decision.expectation.rMultiple === null
              ? 'not stated'
              : `${decision.expectation.rMultiple}R`
          }
        />
      </CardContent>
      {decision.rationale === null ? null : (
        <>
          <CardDivider />
          <CardContent className="pt-3">
            <p className="text-caption text-text-muted">Your rationale, as you recorded it</p>
            <p className="mt-1 text-body text-text">{decision.rationale}</p>
          </CardContent>
        </>
      )}
    </Card>
  );
}

/** One measured figure, with what it is and what it rests on. */
export function FigureRow({ figure }: { figure: DecisionEvaluationReport['figures'][number] }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="text-body font-medium text-text">{figure.label}</p>
        <p className="text-caption text-text-muted">{figure.basis}</p>
      </div>
      <div className="flex items-center gap-2">
        {/* The mark states the direction in shape as well as in ink, and the figure already prints
            its own sign — so a gain and a loss are separable three ways over. */}
        {figure.value === null ? null : (
          <TrendMark direction={figureMark(figure.value)} size="body" />
        )}
        <span
          className={cn(
            'text-body font-semibold num',
            figure.value === null ? 'text-text-muted' : figureClass(figure.value),
          )}
        >
          {figure.value ?? 'not measurable'}
        </span>
        <Badge tone={OUTCOME_TONE[figure.outcome]}>
          {EVALUATION_OUTCOME_LABEL[figure.outcome]}
        </Badge>
      </div>
    </div>
  );
}

/**
 * The comparison the module exists for, and the reason it cannot always be made.
 *
 * **Every number shown is the engine's, including the difference.** There is deliberately no
 * subtraction in this component: `differencePercent` arrives computed, and where the engine reports
 * no difference there is none to show. The obvious shortcut — subtracting two numbers that happen
 * to be side by side — would put a second arithmetic for money in the browser, and it would be the
 * one place a rounding rule other than the engine's could reach a reader.
 *
 * The R multiple row therefore shows two figures and no difference, because the engine does not
 * report one. Saying so is better than filling the gap.
 */
export function ExpectedVsActualPanel({
  comparison,
  className,
}: {
  comparison: ExpectedVersusActual;
  className?: string;
}) {
  const format = (value: number | null, unit: string, absent: string): string =>
    value === null ? absent : `${value}${unit}`;

  const rows: { label: string; expected: string; actual: string; difference: string | null }[] = [
    {
      label: 'Return',
      expected: format(comparison.expectedReturnPercent, '%', 'not stated'),
      actual: format(comparison.actualReturnPercent, '%', 'not measurable'),
      difference: format(comparison.differencePercent, '%', 'not measurable'),
    },
    {
      label: 'R multiple',
      expected: format(comparison.expectedRMultiple, 'R', 'not stated'),
      actual: format(comparison.actualRMultiple, 'R', 'not measurable'),
      difference: null,
    },
  ];

  return (
    <Card className={className}>
      <CardHeader divider>
        <div className="min-w-0">
          <CardTitle>Expected versus actual</CardTitle>
          <CardDescription>
            What you said you expected, and what the record says happened. The comparison is only
            made when both sides exist and the actual side is a real outcome.
          </CardDescription>
        </div>
        <Badge tone={comparison.comparable ? 'info' : 'outline'}>
          {comparison.comparable ? 'Comparable' : 'Not comparable'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* A stacked block on narrow widths and a four-column row from `sm` up, so nothing has to
            be read sideways on a phone. */}
        <div className="hidden text-caption text-text-muted sm:grid sm:grid-cols-[minmax(0,7rem)_1fr_1fr_1fr] sm:gap-3">
          <span />
          <span>Expected</span>
          <span>Actual</span>
          <span>Difference</span>
        </div>
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,7rem)_1fr_1fr_1fr]"
          >
            <p className="col-span-2 text-caption font-medium text-text sm:col-span-1 sm:font-normal sm:text-text-muted">
              {row.label}
            </p>
            <p className="text-body text-text">
              <span className="text-caption text-text-muted sm:hidden">Expected </span>
              {row.expected}
            </p>
            <p className="text-body text-text">
              <span className="text-caption text-text-muted sm:hidden">Actual </span>
              {row.actual}
            </p>
            <p className="text-body">
              <span className="text-caption text-text-muted sm:hidden">Difference </span>
              {row.difference === null ? (
                <span className="text-text-muted">reported for the return only</span>
              ) : (
                <span className={figureClass(row.difference.startsWith('-') ? '-1' : '+1')}>
                  {row.difference}
                </span>
              )}
            </p>
          </div>
        ))}
        {comparison.reason === null ? null : (
          <p className="text-caption text-text-muted">{comparison.reason}</p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The composed readiness verdict, with both layers.
 *
 * Both are shown because the second can only narrow the first: a reader who saw one badge could not
 * tell whether it was the declared context or the record that refused them, and those need
 * different actions.
 */
export function DecisionReadinessPanel({
  readiness,
  className,
}: {
  readiness: DecisionReadinessDecision;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader divider>
        <div className="min-w-0">
          <CardTitle>Evaluation readiness</CardTitle>
          <CardDescription>{EVALUATION_READINESS_MEANING[readiness.readiness]}</CardDescription>
        </div>
        <Badge tone={EVALUATION_READINESS_TONE[readiness.readiness]}>
          {EVALUATION_READINESS_LABEL[readiness.readiness]}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-text-muted">Your declared context</span>
          <Badge tone={BASE_READINESS_TONE[readiness.base.readiness]}>
            {readiness.base.readiness.replaceAll('_', ' ').toLowerCase()}
          </Badge>
          <span className="text-caption text-text-muted">·</span>
          <span className="text-caption text-text-muted">the record itself</span>
          <Badge tone={EVALUATION_READINESS_TONE[readiness.readiness]}>
            {readiness.readiness.replaceAll('_', ' ').toLowerCase()}
          </Badge>
        </div>

        {readiness.findings.length > 0 ? (
          <ul className="space-y-1.5">
            {readiness.findings.map((finding) => (
              <li key={`${finding.code}:${finding.field ?? ''}`} className="flex flex-wrap gap-2">
                <Badge tone={finding.severity === 'blocking' ? 'danger' : 'warning'}>
                  {finding.severity === 'blocking' ? 'Blocking' : finding.severity}
                </Badge>
                <span className="min-w-0 text-caption text-text-muted">{finding.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-caption text-text-muted">
            No findings. The record is complete enough to measure, and the window is the one it
            declares.
          </p>
        )}

        {readiness.clarifications.length > 0 ? (
          <CardTile tone="raised" space="roomy">
            <p className="text-caption font-medium text-text">What would change the answer</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              {readiness.clarifications.map((question) => (
                <li
                  key={`${question.field}:${question.reason}`}
                  className="text-caption text-text-muted"
                >
                  {question.question}
                </li>
              ))}
            </ul>
          </CardTile>
        ) : null}

        <p className="text-caption text-text-muted">{readiness.note}</p>
      </CardContent>
    </Card>
  );
}

/** What is unknown, and what is left out, in the same flow as the figures. */
export function EvaluationLimitationsPanel({
  report,
  readiness = null,
  className,
}: {
  report: DecisionEvaluationReport | null;
  readiness?: DecisionReadinessDecision | null;
  className?: string;
}) {
  // The report's own limitations when there is one, the gate's when there is not. Both are contract
  // text; neither is written here.
  const limitations = report === null ? (readiness?.limitations ?? []) : report.limitations;
  const assumptions = report === null ? [] : report.assumptions;

  if (limitations.length === 0 && assumptions.length === 0) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader divider>
        <div className="min-w-0">
          <CardTitle>Limitations and assumptions</CardTitle>
          <CardDescription>
            Kept in the flow of the figures rather than folded away: a number read without these is
            a different number.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {limitations.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5">
            {limitations.map((limitation) => (
              <li key={limitation} className="text-caption text-text-muted">
                {limitation}
              </li>
            ))}
          </ul>
        ) : null}
        {assumptions.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-caption font-medium text-text">Assumptions this reading rests on</p>
            {assumptions.map((assumption) => (
              <div key={assumption.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={assumption.origin === 'user-declared' ? 'info' : 'neutral'}>
                  {assumption.origin}
                </Badge>
                <span className="min-w-0 text-caption text-text-muted">{assumption.statement}</span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ObservationCard({ observation }: { observation: DecisionObservation }) {
  return (
    <Card>
      <CardHeader divider>
        <div className="min-w-0">
          <CardTitle className="text-body">{observation.title}</CardTitle>
          <CardDescription>
            {DECISION_OBSERVATION_TYPE_LABEL[observation.type]} ·{' '}
            {DECISION_OBSERVATION_SEVERITY_LABEL[observation.severity]}
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={OBSERVATION_TONE[observation.severity]}>
            {DECISION_OBSERVATION_SEVERITY_LABEL[observation.severity]}
          </Badge>
          <Badge tone={OUTCOME_TONE[observation.outcome]}>
            {EVALUATION_OUTCOME_LABEL[observation.outcome]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-caption text-text-muted">{observation.explanation}</p>
        {observation.metrics.length > 0 ? (
          <dl className="flex flex-wrap gap-x-4 gap-y-1">
            {observation.metrics.map((metric) => (
              <div key={`${metric.label}:${metric.value}`} className="flex items-baseline gap-1.5">
                <dt className="text-caption text-text-muted">{metric.label}</dt>
                <dd className="inline-flex items-center gap-1">
                  <TrendMark direction={figureMark(metric.value)} />
                  <span className={cn('text-caption font-medium num', figureClass(metric.value))}>
                    {metric.value}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={CONFIDENCE_TONE[observation.confidence] ?? 'neutral'}>
            {CONFIDENCE_LABEL[observation.confidence] ?? observation.confidence}
          </Badge>
          {observation.limitations.map((limitation) => (
            <span key={limitation} className="text-caption text-text-muted">
              {limitation}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** The whole evaluation: journal figures, observations, then the caveats. */
export function EvaluationSummary({
  report,
  className,
}: {
  report: DecisionEvaluationReport;
  className?: string;
}) {
  return (
    <div className={cn('space-y-4', className)}>
      <Card surface="data">
        <CardHeader divider>
          <div className="min-w-0">
            <CardTitle>What the record says happened</CardTitle>
            <CardDescription>
              Window {new Date(report.window.startAt).toLocaleDateString()} –{' '}
              {new Date(report.window.endAt).toLocaleDateString()}
              {report.window.days === null ? '' : ` · ${report.window.days} days`}
              {report.window.elapsing ? ' · still measuring' : ''}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={OUTCOME_TONE[report.outcome]}>
              {EVALUATION_OUTCOME_LABEL[report.outcome]}
            </Badge>
            <HypotheticalScenarioBadge outcome={report.outcome} />
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-caption text-text-muted">
            {EVALUATION_OUTCOME_MEANING[report.outcome]}
          </p>
          {report.figures.length === 0 ? (
            <p className="text-caption text-text-muted">
              No figure exists for this record, and the reasons are listed below rather than shown
              as zeroes.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {report.figures.map((figure) => (
                <FigureRow key={figure.label} figure={figure} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ExpectedVsActualPanel comparison={report.expectedVersusActual} />

      {report.observations.length > 0 ? (
        <Section
          title="Observations"
          description="Readings the engine derived, each with the metrics it rests on and what it does not cover."
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {report.observations.map((observation) => (
              <ObservationCard key={observation.id} observation={observation} />
            ))}
          </div>
        </Section>
      ) : null}

      <EvaluationLimitationsPanel report={report} />
      <p className="text-caption text-text-muted">{report.note}</p>
    </div>
  );
}

/** The append-only history of attempts. Rows carry no figures, by design. */
export function EvaluationHistory({
  evaluations,
  className,
}: {
  evaluations: readonly DecisionEvaluationView[];
  className?: string;
}) {
  if (evaluations.length === 0) {
    return (
      <EmptyState
        title="Not evaluated yet"
        description="Asking for an evaluation appends a row here. Nothing is overwritten, so a changed figure is explained by two rows rather than by one that was edited."
        className={className}
      />
    );
  }

  return (
    <Card surface="data" className={className}>
      <CardHeader divider>
        <div className="min-w-0">
          <CardTitle>Evaluation history</CardTitle>
          <CardDescription>
            Append-only. Each row names the rule that produced the verdict and the version it read;
            the figures themselves are recomputed whenever they are shown.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Table
          className="text-caption"
          minWidth={544}
          label="Each evaluation this decision has had, with the rule that produced it"
        >
          <TableHead>
            <TableHeaderCell>When</TableHeaderCell>
            <TableHeaderCell>Reason</TableHeaderCell>
            <TableHeaderCell>Outcome</TableHeaderCell>
            <TableHeaderCell>Readiness</TableHeaderCell>
            <TableHeaderCell numeric>Version</TableHeaderCell>
          </TableHead>
          <TableBody>
            {evaluations.map((evaluation) => (
              <TableRow key={evaluation.id}>
                <TableCell>
                  <span className="num">{new Date(evaluation.evaluatedAt).toLocaleString()}</span>
                </TableCell>
                <TableCell tone="muted">
                  {DECISION_EVALUATION_REASON_LABEL[evaluation.reason]}
                </TableCell>
                <TableCell>
                  <Badge tone={OUTCOME_TONE[evaluation.outcome]}>
                    {EVALUATION_OUTCOME_LABEL[evaluation.outcome]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge tone={EVALUATION_READINESS_TONE[evaluation.readiness]}>
                    {EVALUATION_READINESS_LABEL[evaluation.readiness]}
                  </Badge>
                </TableCell>
                <TableCell numeric tone="muted">
                  v{evaluation.decisionVersion}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/**
 * One row in the decision list.
 *
 * A button rather than a link with a nested control, so the whole row is one keyboard stop and the
 * action is unambiguous with a screen reader.
 */
export function DecisionCard({
  decision,
  selected,
  onSelect,
}: {
  decision: DecisionSummaryView;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const scope = decision.symbol ?? decision.assetClass ?? 'Composition-wide';
  return (
    <button
      type="button"
      onClick={() => onSelect(decision.id)}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'w-full min-w-0 rounded-[var(--radius-tile)] border px-3 py-3 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        selected
          ? 'border-primary bg-primary-soft'
          : 'border-border bg-surface-raised hover:border-border-strong',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-body font-medium text-text">{scope}</p>
          <p className="truncate text-caption text-text-muted">
            {DECISION_TYPE_LABEL[decision.type]} ·{' '}
            {new Date(decision.decidedAt).toLocaleDateString()}
          </p>
        </div>
        <Badge tone={KIND_TONE[decision.kind]}>{decision.kind}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {decision.latest === null ? (
          <Badge tone="outline">Not evaluated</Badge>
        ) : (
          <>
            <Badge tone={OUTCOME_TONE[decision.latest.outcome]}>
              {EVALUATION_OUTCOME_LABEL[decision.latest.outcome]}
            </Badge>
            <span className="text-caption text-text-muted">
              {DECISION_EVALUATION_REASON_LABEL[decision.latest.reason]} ·{' '}
              {new Date(decision.latest.evaluatedAt).toLocaleDateString()}
            </span>
          </>
        )}
        <span className="text-caption text-text-muted num">v{decision.version}</span>
      </div>
    </button>
  );
}
