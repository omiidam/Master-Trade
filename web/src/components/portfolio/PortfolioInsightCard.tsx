import { Info } from 'lucide-react';
import type { PortfolioInsight } from '@shared/portfolio/model';
import { Badge } from '../Badge';
import { Card, CardContent } from '../Card';
import {
  insightSeverityLabel,
  insightSeverityTone,
  insightTypeLabel,
  insightTypeMeaning,
} from './labels';

/**
 * One observation about the composition, with everything needed to weigh it.
 *
 * Every field is required by the contract, and this component renders each of them, because an
 * insight that dropped its limitations would be a claim presented as a fact. The confidence
 * badge is the load-bearing one: `confirmed` means the figure came from a declared value,
 * `assumed` means it rests on something the product substituted, and a reader is entitled to
 * know which before acting on anything.
 *
 * Two things this card will not do:
 *
 *   - **it does not rank or score.** Insights are observations, and the loudest severity is
 *     `elevated` rather than `critical`, because a composition is not an incident;
 *   - **it does not phrase anything as advice.** The engine writes the explanation, and the
 *     engine has no vocabulary for what to buy or sell — the text is rendered verbatim rather
 *     than re-worded here, so a surface cannot introduce a suggestion the engine never made.
 */
export interface PortfolioInsightCardProps {
  insight: PortfolioInsight;
  className?: string;
}

const CONFIDENCE_TONE = {
  confirmed: 'success',
  derived: 'info',
  assumed: 'warning',
  missing: 'danger',
} as const;

export function PortfolioInsightCard({ insight, className }: PortfolioInsightCardProps) {
  return (
    <Card className={className}>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Info size={16} aria-hidden className="text-text-muted" />
          <h3 className="text-body font-medium text-text">{insight.title}</h3>
          <Badge tone={insightSeverityTone(insight.severity)}>
            {insightSeverityLabel(insight.severity)}
          </Badge>
          <Badge tone="outline">{insightTypeLabel(insight.type)}</Badge>
          <Badge tone={CONFIDENCE_TONE[insight.confidence]}>{insight.confidence}</Badge>
        </div>

        <p className="text-caption text-text-faint">{insightTypeMeaning(insight.type)}</p>
        <p className="text-body-sm text-text-muted">{insight.explanation}</p>

        {insight.metrics.length > 0 ? (
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {insight.metrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-[var(--radius-control)] border border-border bg-surface-sunken px-3 py-2"
              >
                <dt className="text-caption text-text-muted">{metric.label}</dt>
                <dd className="text-body-sm font-semibold tabular-nums text-text">
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {insight.assumptions.length > 0 ? (
          <div className="space-y-1">
            <h4 className="text-body-sm font-medium text-text">What this rests on</h4>
            <ul className="list-disc space-y-1 pl-5 text-body-sm text-text-muted" role="list">
              {insight.assumptions.map((assumption, index) => (
                <li key={index}>{assumption}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {insight.limitations.length > 0 ? (
          <div className="space-y-1">
            <h4 className="text-body-sm font-medium text-text">Limitations</h4>
            <ul className="list-disc space-y-1 pl-5 text-body-sm text-text-muted" role="list">
              {insight.limitations.map((limitation, index) => (
                <li key={index}>{limitation}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          {insight.sources.map((source) => (
            <Badge key={`${source.kind}:${source.ref}`} tone="neutral">
              {source.kind}
              <span className="font-mono text-text-faint">{source.ref}</span>
            </Badge>
          ))}
          <span className="text-caption text-text-faint">observed {insight.observedAt}</span>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The insights, worst first.
 *
 * Ordering is the engine's own severity order rather than alphabetical or declaration order,
 * so the most consequential observation is read first — and because the sort is stable in the
 * contract's own terms, the same composition always renders in the same order.
 */
export interface PortfolioInsightsListProps {
  insights: readonly PortfolioInsight[];
  className?: string;
}

export function PortfolioInsightsList({ insights, className }: PortfolioInsightsListProps) {
  if (insights.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="space-y-1 pt-4">
          <h3 className="text-body font-medium text-text">No observations</h3>
          <p className="text-body-sm text-text-muted">
            The engine produced no insight for this composition. That is not a clean bill of health:
            it means there was nothing it could observe — most often because too little was declared
            for a figure to exist at all. The gaps panel says which figures those are.
          </p>
        </CardContent>
      </Card>
    );
  }

  const order = { elevated: 2, watch: 1, observation: 0 } as const;
  const sorted = [...insights].sort(
    (a, b) => (order[b.severity] ?? -1) - (order[a.severity] ?? -1),
  );

  return (
    <div className={className}>
      <div className="space-y-3">
        {sorted.map((insight) => (
          <PortfolioInsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </div>
  );
}
