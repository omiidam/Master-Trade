import {
  CalendarClock,
  ClipboardList,
  HelpCircle,
  History,
  Layers,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import type { PortfolioSnapshotView } from '@shared/api/contracts';
import type {
  PortfolioDocumentAssessment,
  PortfolioFinding,
  PortfolioGap,
  PortfolioMetrics,
} from '@shared/portfolio/model';
import type { PortfolioReadinessDecision } from '@shared/portfolio/readiness';
import { Badge } from '../Badge';
import { Card, CardContent, CardHeader, CardTile, CardTitle } from '../Card';
import { cn } from '../../lib/cn';
import {
  describePriceAge,
  formatNumber,
  formatPercent,
  issueMeaning,
  issueTone,
  scopeLabel,
  scopeMeaning,
  snapshotReasonLabel,
} from './labels';

/**
 * The panels a portfolio surface needs beyond its figures.
 *
 * Five readings of the same declaration, kept together because they answer the same kind of
 * question — *what is this reading worth?* — and separated from the components that render
 * numbers because a figure and a caveat must never be the same component. A card that showed
 * a total and quietly dropped its limitation would be the failure mode these panels exist to
 * prevent.
 *
 * Every panel has an honest empty state. None of them substitutes a zero, a placeholder or an
 * illustrative row for a value the engine did not produce: on a surface about somebody's money
 * a fabricated figure is indistinguishable from a real one, which is precisely why the engine
 * returns `null` and a code instead.
 */

/* ------------------------------------------------------------------ */
/* Readiness                                                           */
/* ------------------------------------------------------------------ */

const READINESS_TONE = {
  BLOCKED: 'danger',
  REQUIRES_CLARIFICATION: 'warning',
  READY_WITH_LIMITATIONS: 'info',
  READY_FOR_ANALYSIS: 'success',
} as const;

export interface PortfolioReadinessPanelProps {
  decisions: readonly PortfolioReadinessDecision[];
  className?: string;
}

/**
 * Whether a portfolio question may be answered, and in what form.
 *
 * Readiness is the **worse of two readings** — what the user declared about themselves, and
 * what the document actually supports — and both are shown, because a refusal that hid which
 * layer refused would send the user to fix the wrong thing. A `planned` capability is stated
 * as a gap in the product, never as a verdict on the user's inputs.
 */
export function PortfolioReadinessPanel({ decisions, className }: PortfolioReadinessPanelProps) {
  if (decisions.length === 0) {
    return (
      <Card className={className}>
        <CardHeader divider>
          <CardTitle className="text-body">Portfolio readiness</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body text-text-muted">
            No readiness verdict was produced, so nothing is claimed about whether an analysis may
            run.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader divider>
        <div className="flex flex-wrap items-center gap-1.5">
          <ShieldCheck size={16} aria-hidden className="text-text-muted" />
          <CardTitle className="text-body">Portfolio readiness</CardTitle>
          <Badge tone="outline">the worse of two readings decides</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {decisions.map((decision) => (
          <CardTile
            as="section"
            key={decision.scope}
            space="roomy"
            className="space-y-2"
            aria-label={scopeLabel(decision.scope)}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <h4 className="text-body font-medium text-text">{scopeLabel(decision.scope)}</h4>
              <Badge tone={READINESS_TONE[decision.readiness]}>{decision.readiness}</Badge>
              <Badge tone="outline">{decision.base.readiness} from declared inputs</Badge>
              {decision.capability === 'planned' ? <Badge tone="info">not built yet</Badge> : null}
            </div>

            <p className="text-body text-text-muted">{scopeMeaning(decision.scope)}</p>
            <p className="text-caption font-mono text-text-faint">
              decided by {decision.decidedBy}
            </p>

            {decision.limitations.length > 0 ? (
              <div className="space-y-1">
                <p className="text-caption text-text-muted">Limitations this answer carries</p>
                <ul className="list-disc space-y-1 pl-5 text-body text-text-muted" role="list">
                  {decision.limitations.map((limitation, index) => (
                    <li key={index}>{limitation}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {decision.clarifications.length > 0 ? (
              <div className="space-y-1.5">
                <p className="inline-flex items-center gap-1.5 text-caption text-text-muted">
                  <HelpCircle size={13} aria-hidden />
                  What would unblock it
                </p>
                <ul className="space-y-1.5" role="list">
                  {decision.clarifications.map((question) => (
                    <li
                      key={`${question.field}:${question.reason}`}
                      className="rounded-[var(--radius-control)] bg-surface px-2.5 py-2"
                    >
                      <p className="text-body text-text">{question.question}</p>
                      <p className="text-caption text-text-faint">
                        {question.label} · {question.reason}
                        {question.blocking ? ' · required before an answer exists' : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {decision.findings.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {decision.findings.map((found: PortfolioFinding) => (
                  <Badge key={found.code} tone={issueTone(found.code)}>
                    {issueMeaning(found.code)}
                    {found.count === null ? '' : ` ×${found.count}`}
                  </Badge>
                ))}
              </div>
            ) : null}

            <p className="text-caption text-text-faint">{decision.note}</p>
          </CardTile>
        ))}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Quality summary                                                     */
/* ------------------------------------------------------------------ */

export interface PortfolioQualitySummaryProps {
  assessment: PortfolioDocumentAssessment;
  metrics?: PortfolioMetrics;
  className?: string;
}

/**
 * What the composition could and could not support.
 *
 * `coverage` is counted rather than scored: a quality *score* would be a number with no
 * defined meaning, and a reader would reasonably ask what 0.7 means. Counts answer the
 * question underneath — how many positions could be valued, costed and weighted — and the
 * findings name each gap in the engine's own codes.
 */
export function PortfolioQualitySummary({
  assessment,
  metrics,
  className,
}: PortfolioQualitySummaryProps) {
  const coverage = assessment.coverage;

  return (
    <Card className={className}>
      <CardHeader divider>
        <div className="flex flex-wrap items-center gap-1.5">
          <ClipboardList size={16} aria-hidden className="text-text-muted" />
          <CardTitle className="text-body">Data quality</CardTitle>
          {assessment.worst === null ? (
            <Badge tone="success">no findings</Badge>
          ) : (
            <Badge tone={assessment.worst === 'blocking' ? 'danger' : 'warning'}>
              worst: {assessment.worst}
            </Badge>
          )}
          <Badge tone={assessment.described ? 'neutral' : 'info'}>
            {assessment.described ? 'a composition is declared' : 'nothing declared'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ['Positions read', formatNumber(coverage.positions, 0), 'After the bound is applied'],
              ['Usable', formatNumber(assessment.usable, 0), 'Not malformed'],
              ['Priced', formatNumber(coverage.priced, 0), 'Quantity and price both usable'],
              ['Weighted', formatNumber(coverage.weighted, 0), 'A declared share exists'],
              ['Costed', formatNumber(coverage.costed, 0), 'Quantity and entry price both usable'],
              [
                'Declared weight sum',
                formatPercent(assessment.declaredWeightSumPercent),
                'Shares are meant to add up to a whole portfolio',
              ],
            ] as const
          ).map(([label, value, hint]) => (
            <CardTile key={label}>
              <dt className="text-caption text-text-muted">{label}</dt>
              <dd className="text-body font-semibold num text-text">{value}</dd>
              <p className="text-caption text-text-faint">{hint}</p>
            </CardTile>
          ))}
        </dl>

        <div className="space-y-1.5">
          <p className="inline-flex items-center gap-1.5 text-caption text-text-muted">
            <CalendarClock size={13} aria-hidden />
            Price freshness
          </p>
          <p className="text-body text-text-muted">
            {assessment.newestPriceAt === null
              ? 'No price was declared anywhere in the composition, so freshness cannot be reported.'
              : `Newest observation ${assessment.newestPriceAt}, oldest ${assessment.oldestPriceAt}.`}
          </p>
          {metrics === undefined ? null : (
            <ul className="flex flex-wrap gap-1.5" role="list">
              {metrics.positions.map((position) => {
                const age = position.priceAgeHours;
                if (age === null) return null;
                return (
                  <li key={position.id}>
                    <Badge tone={age >= 72 ? 'warning' : 'neutral'}>
                      <span className="font-mono">{position.symbol}</span>
                      {describePriceAge(age)}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-1.5">
          <h4 className="text-body font-medium text-text">Findings</h4>
          {assessment.findings.length === 0 ? (
            <p className="text-body text-text-muted">
              Every position declared carries what a calculation needs.
            </p>
          ) : (
            <ul className="space-y-1.5" role="list">
              {assessment.findings.map((found) => (
                <li key={found.code} className="flex items-start gap-2">
                  <Badge tone={issueTone(found.code)}>{found.code}</Badge>
                  <span className="text-body text-text-muted">{found.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-caption text-text-faint">{assessment.note}</p>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Gaps                                                                */
/* ------------------------------------------------------------------ */

export interface MissingHoldingDataProps {
  gaps: readonly PortfolioGap[];
  className?: string;
}

/**
 * What is missing, and what would close it.
 *
 * A gap is a **figure that could not be produced**, which is why it is listed rather than
 * summarised: "no cost basis" and "no price" are different absences with different
 * consequences, and a count would lose that. `remedies` are phrased as conditions, never as
 * instructions to trade — the product may say what would make a calculation possible and may
 * never say what to buy.
 */
export function MissingHoldingData({ gaps, className }: MissingHoldingDataProps) {
  if (gaps.length === 0) {
    return (
      <Card className={className}>
        <CardHeader divider>
          <CardTitle className="text-body">Missing holding data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-body text-text-muted">
            Nothing is missing: every figure these scopes ask for could be produced from what is
            declared.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader divider>
        <div className="flex flex-wrap items-center gap-1.5">
          <TriangleAlert size={16} aria-hidden className="text-warning" />
          <CardTitle className="text-body">Missing holding data</CardTitle>
          <Badge tone="warning">{gaps.length} figure(s) not produced</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2" role="list">
          {gaps.map((gap) => (
            <CardTile as="li" key={gap.code} className="space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={issueTone(gap.code)}>{issueMeaning(gap.code)}</Badge>
                <span className="font-mono text-caption text-text-faint">{gap.code}</span>
              </div>
              <p className="text-body text-text-muted">{gap.detail}</p>
              {gap.remedies.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-5 text-caption text-text-faint" role="list">
                  {gap.remedies.map((remedy, index) => (
                    <li key={index}>{remedy}</li>
                  ))}
                </ul>
              ) : null}
            </CardTile>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Version history                                                     */
/* ------------------------------------------------------------------ */

export interface PortfolioSnapshotTimelineProps {
  snapshots: readonly PortfolioSnapshotView[];
  currentVersion: number;
  className?: string;
}

/**
 * Every version the composition has been through.
 *
 * The document itself is deliberately not carried here: a list view that shipped each
 * historical composition would send a user's entire holdings history to render a set of
 * dates. What is shown is what a reader needs to trust the current reading — that it is
 * version *n*, when it was written, by whom, and why.
 */
export function PortfolioSnapshotTimeline({
  snapshots,
  currentVersion,
  className,
}: PortfolioSnapshotTimelineProps) {
  if (snapshots.length === 0) {
    return (
      <Card className={className}>
        <CardHeader divider>
          <CardTitle className="text-body">Version history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-body text-text-muted">
            No version has been written, because no composition has been declared for this account.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader divider>
        <div className="flex flex-wrap items-center gap-1.5">
          <History size={16} aria-hidden className="text-text-muted" />
          <CardTitle className="text-body">Version history</CardTitle>
          <Badge tone="outline">newest first</Badge>
          <Badge tone="neutral">{snapshots.length} version(s) shown</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="space-y-2" role="list">
          {snapshots.map((snapshot) => (
            <CardTile
              key={snapshot.version}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={snapshot.version === currentVersion ? 'primary' : 'outline'}>
                  version {snapshot.version}
                </Badge>
                <span className="text-body text-text-muted">
                  {snapshotReasonLabel(snapshot.reason)}
                </span>
              </div>
              <div className="text-right">
                <p className="text-caption text-text-muted">{snapshot.createdAt}</p>
                <p className="text-caption text-text-faint">
                  changed by <span className="font-mono">{snapshot.changedBy}</span>
                </p>
              </div>
            </CardTile>
          ))}
        </ol>

        <p className="text-caption text-text-faint">
          A version is never rewritten. An analysis can therefore still be traced back to the exact
          composition it was computed from.
        </p>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Risk exposure                                                       */
/* ------------------------------------------------------------------ */

export interface RiskExposurePanelProps {
  metrics: PortfolioMetrics;
  className?: string;
}

/**
 * Where the composition is exposed, by category and by currency.
 *
 * Only groups that **can** be summed are summed, and a mixed-currency document is grouped
 * rather than converted, because no rate source is wired. The panel therefore reports a
 * shape — counts and shares — and states the currency position rather than printing a total
 * the engine declined to produce.
 *
 * There is no risk score. A single number for "risk" would have no defined meaning, would
 * invite comparison between portfolios, and would read as advice; the product's answer to
 * "how risky is this" is the set of observations below and nothing shorter.
 */
export function RiskExposurePanel({ metrics, className }: RiskExposurePanelProps) {
  const classes = metrics.weights.byMarketValue?.byAssetClass ?? [];
  const currencies = metrics.totals.byCurrency;

  return (
    <Card className={className}>
      <CardHeader divider>
        <div className="flex flex-wrap items-center gap-1.5">
          <Layers size={16} aria-hidden className="text-text-muted" />
          <CardTitle className="text-body">Exposure</CardTitle>
          <Badge tone="outline">measured, not scored</Badge>
          {metrics.valuationComplete ? (
            <Badge tone="neutral">every position valued</Badge>
          ) : (
            <Badge tone="warning">partial valuation</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {classes.length === 0 && currencies.length === 0 ? (
          <p className="text-body text-text-muted">
            No exposure can be described, because no position could be valued. Nothing is shown in
            place of it: a share of a total that does not exist is not a share.
          </p>
        ) : null}

        {classes.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-caption text-text-muted">By asset class, from market values</p>
            <ul className="flex flex-wrap gap-1.5" role="list">
              {classes.map((bucket) => (
                <li key={bucket.key}>
                  <Badge tone="neutral">
                    {bucket.label}
                    <span className="num">{formatPercent(bucket.weightPercent)}</span>
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {currencies.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-caption text-text-muted">
              By currency, summed only within each currency
            </p>
            <ul className="grid gap-2 sm:grid-cols-2" role="list">
              {currencies.map((group) => (
                <CardTile key={group.currency} className="flex items-center justify-between gap-2">
                  <span className="text-body text-text-muted">
                    {group.currency} · {group.positions} position
                    {group.positions === 1 ? '' : 's'}
                  </span>
                  <span className="text-body num text-text">{formatNumber(group.marketValue)}</span>
                </CardTile>
              ))}
            </ul>
            {currencies.length > 1 ? (
              <p className="text-caption text-text-faint">
                More than one currency and no rate source: the groups are reported separately rather
                than converted into one figure.
              </p>
            ) : null}
          </div>
        ) : null}

        <p className={cn('text-caption text-text-faint')}>{metrics.note}</p>
      </CardContent>
    </Card>
  );
}
