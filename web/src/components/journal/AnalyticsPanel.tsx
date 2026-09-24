import { AlertTriangle, Divide, Flame, Repeat, Sigma } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '../Badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTile,
  CardTitle,
  Section,
} from '../Card';
import { AgentBadge, AgentCardItem, AgentCardList } from '../agent/AgentCard';
import { Input } from '../Input';
import { ProgressIndicator } from '../exams/ProgressIndicator';
import { PerformanceChart } from './PerformanceChart';
import { MetricBar } from './MetricBar';
import { cn } from '../../lib/cn';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableRowHeaderCell,
} from '../Table';
import {
  JOURNAL_STAT_NOTE,
  TRADE_RANGES,
  TRADE_RANGE_LABEL,
  describeRange,
  mockAverageWinLoss,
  mockCumulativeR,
  mockDirectionPerformance,
  mockDrawdownCurve,
  mockEquityCurve,
  mockExpectancyOverTime,
  mockMistakeFrequency,
  mockRiskConsistency,
  mockRuleComplianceBreakdown,
  mockSessionPerformance,
  mockSetupPerformance,
  mockStreaks,
  mockTradeDuration,
  mockWinLossDistribution,
} from '../../mock/journal';
import type { BreakdownRow, JournalSeries, TradeRange } from '../../mock/journal';

function toSeries(series: JournalSeries, tone: 'primary' | 'danger' | 'info' | 'ai' | 'warning') {
  return [
    {
      id: series.id,
      label: series.title,
      tone,
      points: series.points,
      area: !series.bars,
      bars: series.bars === true,
    },
  ];
}

/**
 * Breakdown table for setup, session and direction.
 *
 * Sample size is the first numeric column on purpose. A 100% win rate over three
 * trades and a 100% win rate over three hundred are the same two digits and not
 * remotely the same evidence, so the sample cannot be optional or last.
 */
function BreakdownTable({
  title,
  description,
  rows,
  plannedLabel = 'planned reward-to-risk',
}: {
  title: string;
  description: string;
  rows: readonly BreakdownRow[];
  plannedLabel?: string;
}) {
  return (
    <Card as="section">
      <CardHeader divider>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Table
          className="text-caption"
          label={`${title}: sample size, win rate, average R and ${plannedLabel} for each bucket.`}
        >
          <TableHead>
            <TableHeaderCell>Bucket</TableHeaderCell>
            <TableHeaderCell numeric>Sample</TableHeaderCell>
            <TableHeaderCell numeric>Win rate</TableHeaderCell>
            <TableHeaderCell numeric>Average R</TableHeaderCell>
            <TableHeaderCell numeric>Planned</TableHeaderCell>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableRowHeaderCell>{row.label}</TableRowHeaderCell>
                <TableCell numeric tone="faint">
                  {row.sample}
                </TableCell>
                <TableCell numeric tone="muted">
                  {row.winRatePct.toFixed(1)}%
                </TableCell>
                <TableCell
                  numeric
                  tone={row.averageR > 0.15 ? 'success' : row.averageR < -0.15 ? 'danger' : 'muted'}
                >
                  {row.averageR > 0 ? '+' : row.averageR < 0 ? '−' : ''}
                  {Math.abs(row.averageR).toFixed(2)}R
                </TableCell>
                <TableCell numeric tone="faint">
                  {row.plannedRr.toFixed(1)}:1
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-caption text-text-faint">
          Rows are buckets of the same records, not independent samples — a bucket with a small
          sample is a hint, not a finding.
        </p>
      </CardContent>
    </Card>
  );
}

export interface AnalyticsPanelProps {
  range: TradeRange;
  onRangeChange: (range: TradeRange) => void;
  /** Used only when `range` is `custom`; empty means "open ended". */
  rangeFrom?: string;
  rangeTo?: string;
  onRangeFromChange?: (value: string) => void;
  onRangeToChange?: (value: string) => void;
  className?: string;
}

/**
 * The analytic section.
 *
 * Every chart here carries the same footnote: these are illustrative values laid
 * out by hand, because the deterministic analytics that will produce them live in
 * the trading engine and are not wired to the journal yet. Showing a real-looking
 * curve with no provenance strip is how a preview turns into a false memory.
 */
export function AnalyticsPanel({
  range,
  onRangeChange,
  rangeFrom = '',
  rangeTo = '',
  onRangeFromChange,
  onRangeToChange,
  className,
}: AnalyticsPanelProps) {
  const custom = range === 'custom';
  const rangeLabel = describeRange(range, rangeFrom, rangeTo);
  const timeframe = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <CardTile
        space="none"
        role="group"
        aria-label="Analytics timeframe"
        className="inline-flex flex-wrap items-center gap-0.5 p-0.5"
      >
        {TRADE_RANGES.map((value) => {
          const active = value === range;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => onRangeChange(value)}
              className={cn(
                'rounded-[calc(var(--radius-control)-2px)] px-2.5 py-1 text-caption font-medium',
                active
                  ? 'bg-surface-raised text-text shadow-panel'
                  : 'text-text-muted hover:text-text',
              )}
            >
              {TRADE_RANGE_LABEL[value]}
            </button>
          );
        })}
      </CardTile>
      {/*
        A custom window is only actionable once its bounds exist, so the two date
        fields appear with the control that selects them rather than hidden behind
        a modal. An empty field stays empty: it means "open ended", not today.
      */}
      {custom ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="block min-w-0">
            <span className="mb-1 block text-caption font-medium text-text-faint">From</span>
            <Input
              type="date"
              aria-label="Custom range start date"
              className="h-9 text-caption"
              value={rangeFrom}
              onChange={(event) => onRangeFromChange?.(event.target.value)}
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-caption font-medium text-text-faint">To</span>
            <Input
              type="date"
              aria-label="Custom range end date"
              className="h-9 text-caption"
              value={rangeTo}
              onChange={(event) => onRangeToChange?.(event.target.value)}
            />
          </label>
        </div>
      ) : null}
    </div>
  );

  const provenance = 'synthetic' as const;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone="warning">illustrative values</Badge>
          <span className="text-caption text-text-faint">
            Scope: {rangeLabel}. {JOURNAL_STAT_NOTE}
          </span>
        </div>
        {timeframe}
      </div>

      <Section
        title="Curve"
        description="Equity, per-trade result and the distance below the high-water mark."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <PerformanceChart
            title={mockEquityCurve.title}
            description={mockEquityCurve.description}
            series={toSeries(mockEquityCurve, 'primary')}
            unit={mockEquityCurve.unit}
            provenance={provenance}
            sourceRef="synthetic-journal-analytics"
            footnote="A rising curve is history. It is a record of what happened, not a forecast of what will."
          />
          <PerformanceChart
            title={mockCumulativeR.title}
            description={mockCumulativeR.description}
            series={toSeries(mockCumulativeR, 'info')}
            unit={mockCumulativeR.unit}
            provenance={provenance}
            sourceRef="synthetic-journal-analytics"
          />
          <PerformanceChart
            title={mockDrawdownCurve.title}
            description={mockDrawdownCurve.description}
            series={toSeries(mockDrawdownCurve, 'danger')}
            unit={mockDrawdownCurve.unit}
            levels={[{ value: 0, label: 'high-water mark', tone: 'muted' }]}
            provenance={provenance}
            sourceRef="synthetic-journal-analytics"
            footnote="Drawdown is measured from every high-water mark, so a new high resets it to zero."
          />
          <PerformanceChart
            title={mockExpectancyOverTime.title}
            description={mockExpectancyOverTime.description}
            series={toSeries(mockExpectancyOverTime, 'ai')}
            unit={mockExpectancyOverTime.unit}
            levels={[{ value: 0, label: 'break-even', tone: 'muted' }]}
            provenance={provenance}
            sourceRef="synthetic-journal-analytics"
            footnote="Expectancy early in a sample moves for arithmetic reasons, not for strategic ones."
          />
        </div>
      </Section>

      <Section
        title="Distribution and risk"
        description="Outcomes, size of wins against size of losses, and how consistent the risk was."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <PerformanceChart
            title={mockWinLossDistribution.title}
            description={mockWinLossDistribution.description}
            series={toSeries(mockWinLossDistribution, 'primary')}
            unit={mockWinLossDistribution.unit}
            provenance={provenance}
            sourceRef="synthetic-journal-analytics"
            footnote="Open and incomplete records are listed rather than excluded, so the bars account for every row."
          />
          <PerformanceChart
            title={mockAverageWinLoss.title}
            description={mockAverageWinLoss.description}
            series={toSeries(mockAverageWinLoss, 'info')}
            unit={mockAverageWinLoss.unit}
            levels={[{ value: 0, label: 'break-even', tone: 'muted' }]}
            provenance={provenance}
            sourceRef="synthetic-journal-analytics"
          />
          <PerformanceChart
            title={mockRiskConsistency.title}
            description={mockRiskConsistency.description}
            series={toSeries(mockRiskConsistency, 'warning')}
            unit={mockRiskConsistency.unit}
            provenance={provenance}
            sourceRef="synthetic-journal-analytics"
            footnote="Consistent risk is what makes an R multiple comparable between two trades."
          />
          <PerformanceChart
            title={mockTradeDuration.title}
            description={mockTradeDuration.description}
            series={toSeries(mockTradeDuration, 'ai')}
            unit={mockTradeDuration.unit}
            provenance={provenance}
            sourceRef="synthetic-journal-analytics"
          />
        </div>
      </Section>

      <Section
        title="Breakdowns"
        description="Where the results came from. Sample size is reported before any rate."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <BreakdownTable
            title="Performance by setup"
            description="Planned against realised, per setup."
            rows={mockSetupPerformance}
          />
          <BreakdownTable
            title="Performance by session"
            description="The session a setup is taken in is part of the setup's evidence."
            rows={mockSessionPerformance}
          />
          <BreakdownTable
            title="Planned versus actual R:R"
            description="What was planned against what the records realised, by setup."
            rows={mockSetupPerformance}
          />
          <BreakdownTable
            title="Performance by direction"
            description="Long and short, kept separate — they are different samples."
            rows={mockDirectionPerformance}
          />
        </div>
      </Section>

      <Grid4>
        <Card>
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">Rule compliance</CardTitle>
              <CardDescription>Records by checklist outcome</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {mockRuleComplianceBreakdown.map((point) => (
              <ProgressIndicator
                key={point.label}
                value={point.value}
                max={16}
                label={point.label}
                hint={`${point.value} of 16 records`}
              />
            ))}
            <p className="text-caption text-text-faint">
              A rate is reported over assessed records only; unassessed records are shown, not
              counted as compliant.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">Consecutive wins and losses</CardTitle>
              <CardDescription>Streaks read from the recorded sequence</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Flame size={14} aria-hidden className="text-warning" />
              <span className="text-caption text-text-muted">Longest winning run</span>
              <span className="num ms-auto text-body text-text">{mockStreaks.maxWinStreak}</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} aria-hidden className="text-danger" />
              <span className="text-caption text-text-muted">Longest losing run</span>
              <span className="num ms-auto text-body text-text">{mockStreaks.maxLossStreak}</span>
            </div>
            <div className="flex items-center gap-2 border-t border-border pt-2">
              <Repeat size={14} aria-hidden className="text-info" />
              <span className="text-caption text-text-muted">Current run</span>
              <span className="num ms-auto text-caption text-text-muted">
                {mockStreaks.currentLength} {mockStreaks.currentKind}
              </span>
            </div>
            <p className="text-caption text-text-faint">
              A streak is a property of a small sample, not of the trader.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">Mistake frequency</CardTitle>
              <CardDescription>Recorded patterns, with the corrective note</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {mockMistakeFrequency.map((mistake) => (
              <MetricBar
                key={mistake.id}
                label={mistake.label}
                value={`×${mistake.occurrences}`}
                share={mistake.share}
                tone="warning"
                hint={mistake.lesson}
              />
            ))}
            <p className="text-caption text-text-faint">
              Shares are of the recorded occurrences, so a quiet week does not look like progress.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">Reading these numbers</CardTitle>
              <CardDescription>What the analytics do not support</CardDescription>
            </div>
          </CardHeader>
          {/*
            The reference's marked list, with the glyph moved into the mark: the discs are the same
            family the agent's rows use, and the tone says which caveat this is — a sample, an
            arithmetic disagreement, or a limit on what the page may conclude.
          */}
          <CardContent>
            <AgentCardList>
              <AgentCardItem
                badge={
                  <AgentBadge tone="neutral">
                    <Sigma size={10} strokeWidth={2.5} />
                  </AgentBadge>
                }
              >
                Fourteen scored trades is a sample, not a result. Every figure on this page is
                illustrative.
              </AgentCardItem>
              <AgentCardItem
                badge={
                  <AgentBadge tone="neutral">
                    <Divide size={10} strokeWidth={2.5} />
                  </AgentBadge>
                }
              >
                Win rate and average R can disagree; when they do, expectancy is the figure to look
                at.
              </AgentCardItem>
              <AgentCardItem
                badge={
                  <AgentBadge tone="warning">
                    <AlertTriangle size={10} strokeWidth={2.5} />
                  </AgentBadge>
                }
              >
                Nothing here is a signal, a recommendation or a rule. A rule change needs an
                evaluation and a recorded human approval.
              </AgentCardItem>
            </AgentCardList>
          </CardContent>
        </Card>
      </Grid4>
    </div>
  );
}

function Grid4({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}
