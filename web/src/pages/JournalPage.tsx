import { useMemo, useState } from 'react';
import {
  BookOpen,
  BrainCircuit,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  Download,
  GraduationCap,
  LineChart,
  ListChecks,
  NotebookPen,
  Plus,
  ScrollText,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Section,
} from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { InterfaceStatesPanel } from '../components/InterfaceStates';
import { ProvenanceBanner } from '../components/ProvenanceBanner';
import { Tooltip } from '../components/Tooltip';
import { Grid, Workspace } from '../app/Workspace';
import {
  AIReviewStateGallery,
  AnalyticsPanel,
  DirectionBadge,
  JournalCalendar,
  JournalStatCard,
  JournalTabPanel,
  JournalTabs,
  MetricBar,
  MistakeTag,
  PerformanceChart,
  RiskSummary,
  RuleComplianceBadge,
  ScreenshotGallery,
  SetupBadge,
  TradeFilters,
  TradeForm,
  TradeTable,
  TradeTimeline,
} from '../components/journal';
import { formatTimestamp } from '../lib/format';
import {
  EMOTIONAL_STATE_LABEL,
  EMPTY_TRADE_FILTERS,
  JOURNAL_PREVIEW_NOTICE,
  JOURNAL_STAT_NOTE,
  RESULT_LABEL,
  REVIEW_STATE_LABEL,
  STATUS_LABEL,
  describeRange,
  filterTrades,
  mockCalendarDays,
  mockCalendarMonth,
  mockCumulativeR,
  mockDrawdownCurve,
  mockEquityCurve,
  mockJournalStats,
  mockMistakeFrequency,
  mockPlannedVsActual,
  mockSessionPerformance,
  mockWinLossDistribution,
  setupLabel,
  summariseTradeStates,
} from '../mock/journal';
import { buildTradeTimeline, findTrade, mockTrades } from '../mock/journalTrades';
import type {
  AiReviewState,
  JournalTrade,
  TradeFilters as TradeFilterState,
  TradeRange,
} from '../mock/journal';

const TABS = [
  { id: 'overview', label: 'Overview', icon: <ChartNoAxesCombined size={14} aria-hidden /> },
  { id: 'history', label: 'Trade history', icon: <ClipboardList size={14} aria-hidden /> },
  { id: 'add', label: 'Add trade', icon: <Plus size={14} aria-hidden /> },
  { id: 'details', label: 'Trade details', icon: <Search size={14} aria-hidden /> },
  { id: 'analytics', label: 'Analytics', icon: <LineChart size={14} aria-hidden /> },
  { id: 'calendar', label: 'Calendar', icon: <CalendarDays size={14} aria-hidden /> },
  { id: 'reviews', label: 'Reviews and lessons', icon: <GraduationCap size={14} aria-hidden /> },
] as const;

function lineSeries(
  series: { id: string; title: string; points: readonly { label: string; value: number }[] },
  tone: 'primary' | 'danger' | 'info' | 'ai',
) {
  return [{ id: series.id, label: series.title, tone, points: series.points, area: true }];
}

/**
 * The trading journal.
 *
 * One sidebar entry, seven internal sections — the navigation rule this module is
 * built to. What the journal is for is the part that shapes every design decision
 * here: it records what the trader *actually did*, so it can be reviewed later
 * without the benefit of hindsight.
 *
 * Four rules hold throughout:
 *   - **a record is a record**: the interface never places, changes or closes
 *     anything, and no affordance suggests it could;
 *   - **an unrecorded value is a gap**: a trade with no exit shows "not scored",
 *     never `0.00R`, because a measured flat result and a missing one are different
 *     facts;
 *   - **a rate carries its sample**: sample size is reported beside every rate, and
 *     unassessed records are excluded rather than counted as successes;
 *   - **the preview says what it is**: every statistic here is a hand-written
 *     constant with a provenance strip, and the store is not connected.
 */
export function JournalPage() {
  const [tab, setTab] = useState<string>('overview');
  const [filters, setFilters] = useState<TradeFilterState>(EMPTY_TRADE_FILTERS);
  const [analyticsRange, setAnalyticsRange] = useState<TradeRange>('last-90');
  const [analyticsFrom, setAnalyticsFrom] = useState<string>('');
  const [analyticsTo, setAnalyticsTo] = useState<string>('');
  const [calendarView, setCalendarView] = useState<'month' | 'week'>('month');
  const [selectedDate, setSelectedDate] = useState<string | null>('2026-09-19');
  const [selectedRef, setSelectedRef] = useState<string>(mockTrades[0]?.ref ?? '');
  const [reviewState, setReviewState] = useState<AiReviewState>('not-available');
  const [exportNotice, setExportNotice] = useState<boolean>(false);

  const states = useMemo(() => summariseTradeStates(mockTrades), []);
  const filtered = useMemo(() => filterTrades(mockTrades, filters), [filters]);
  const selected: JournalTrade | undefined = findTrade(selectedRef);

  const openTrade = (trade: JournalTrade) => {
    setSelectedRef(trade.ref);
    setTab('details');
  };

  const reviewedTrades = mockTrades.filter((trade) => trade.review !== undefined);
  const awaitingReview = mockTrades.filter((trade) => trade.reviewState === 'required');
  const notConnected = (action: string) => (
    <ErrorState
      severity="info"
      title={`${action} is not connected in this phase`}
      description="The journal store and its export pipeline arrive with the API integration. Nothing was written, and no file was created."
      code="JOURNAL_STORE_UNAVAILABLE"
    />
  );

  return (
    <Workspace
      title="Trading Journal"
      description="Every record, its plan, its risk, whether the rules held and what it taught. A journal is a record of decisions, not a scoreboard — so sample size travels with every rate, and a missing value stays missing."
      actions={
        <>
          <Badge tone="outline" icon={<ShieldCheck size={12} aria-hidden />}>
            record only — no execution
          </Badge>
          <Tooltip content={JOURNAL_PREVIEW_NOTICE}>
            <Badge tone="warning">preview data</Badge>
          </Tooltip>
          <Tooltip content="Export is not connected in this phase: the action reports that rather than producing an empty file.">
            <Button
              variant="secondary"
              size="md"
              onClick={() => setExportNotice(true)}
              label="Export the current journal view"
              leadingIcon={<Download size={14} aria-hidden />}
            >
              Export
            </Button>
          </Tooltip>
          <Button
            variant="primary"
            size="md"
            onClick={() => setTab('add')}
            label="Open the add trade form"
            leadingIcon={<Plus size={14} aria-hidden />}
          >
            Add trade
          </Button>
        </>
      }
    >
      {exportNotice ? notConnected('Export') : null}

      <Grid columns={4}>
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-body">Records by state</CardTitle>
              <CardDescription>
                {states.scored} scored · {states.total - states.scored} not scored
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-caption text-text-muted">
            <p>
              {states.byResult.win} wins · {states.byResult.loss} losses ·{' '}
              {states.byResult.breakeven} breakeven · {states.byResult.pending} unscored
            </p>
            <p>
              {states.byStatus.open} open · {states.byStatus.incomplete} incomplete ·{' '}
              {states.byStatus.archived} archived
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-body">Rule adherence</CardTitle>
              <CardDescription>Assessed separately from the outcome</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-caption text-text-muted">
            <p>
              {states.byCompliance.compliant} compliant · {states.byCompliance.partial} partial ·{' '}
              {states.byCompliance.violation} broken
            </p>
            <p className="text-text-faint">
              {states.byCompliance['not-assessed']} not assessed — excluded from the rate rather
              than counted as compliant.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-body">Write-ups</CardTitle>
              <CardDescription>A record with no review cannot be studied</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-caption text-text-muted">
            <p>
              {states.withReview} of {states.total} records carry a written review.
            </p>
            <p className="text-text-faint">
              {states.withoutWriteUp} have no market context recorded at all.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-body">Reviews awaiting you</CardTitle>
              <CardDescription>Flagged by the record, not by the result</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-caption text-text-muted">
            <p className="num text-[1.5rem] leading-none font-semibold text-warning">
              {states.byReviewState.required}
            </p>
            <p className="text-text-faint">
              A rule break and an unscored record both force a review, whatever the outcome was.
            </p>
          </CardContent>
        </Card>
      </Grid>

      <JournalTabs
        items={TABS.map((item) => ({ id: item.id, label: item.label, icon: item.icon }))}
        value={tab}
        onValueChange={setTab}
        aria-label="Journal sections"
      >
        {/* Overview ------------------------------------------------------- */}
        <JournalTabPanel value="overview">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {mockJournalStats.map((stat) => (
              <JournalStatCard
                key={stat.id}
                label={stat.label}
                value={stat.value}
                {...(stat.unit ? { unit: stat.unit } : {})}
                comparison={stat.comparison}
                basis={stat.basis}
                tone={stat.tone}
                {...(stat.hint ? { hint: stat.hint } : {})}
                {...(stat.id === 'net-performance'
                  ? { sparkline: mockEquityCurve.points.map((point) => point.value) }
                  : {})}
              />
            ))}
          </div>

          <p className="text-caption text-text-faint">{JOURNAL_STAT_NOTE}</p>

          <Section
            title="Performance"
            description="Every chart states its scope, and every one can be expanded to full screen."
          >
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <PerformanceChart
                title={mockEquityCurve.title}
                description={mockEquityCurve.description}
                series={lineSeries(mockEquityCurve, 'primary')}
                unit={mockEquityCurve.unit}
                provenance="synthetic"
                sourceRef="synthetic-journal-analytics"
                updatedAt="2026-09-19T16:45:00Z"
                className="xl:col-span-2"
              />
              <PerformanceChart
                title={mockDrawdownCurve.title}
                description={mockDrawdownCurve.description}
                series={lineSeries(mockDrawdownCurve, 'danger')}
                unit={mockDrawdownCurve.unit}
                levels={[{ value: 0, label: 'high-water mark', tone: 'muted' }]}
                provenance="synthetic"
                sourceRef="synthetic-journal-analytics"
              />
              <PerformanceChart
                title={mockCumulativeR.title}
                description={mockCumulativeR.description}
                series={lineSeries(mockCumulativeR, 'info')}
                unit={mockCumulativeR.unit}
                provenance="synthetic"
                sourceRef="synthetic-journal-analytics"
                className="xl:col-span-2"
              />
              <PerformanceChart
                title={mockWinLossDistribution.title}
                description={mockWinLossDistribution.description}
                series={[
                  {
                    id: mockWinLossDistribution.id,
                    label: 'Records',
                    tone: 'primary',
                    points: mockWinLossDistribution.points,
                    bars: true,
                  },
                ]}
                unit={mockWinLossDistribution.unit}
                provenance="synthetic"
                sourceRef="synthetic-journal-analytics"
              />
            </div>
          </Section>

          <Section
            title="Planned versus actual"
            description="The comparison the journal exists for: what was intended against what happened."
          >
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <PerformanceChart
                title="Planned R:R against realised average R"
                description="Planned reward-to-risk is the dashed reference; the bars are what the records realised, per setup."
                series={[
                  {
                    id: 'realised',
                    label: 'Realised average R',
                    tone: 'info',
                    points: mockPlannedVsActual.map((row) => ({
                      label: row.label,
                      value: row.averageR,
                    })),
                    bars: true,
                  },
                ]}
                unit="R"
                levels={[{ value: 2.5, label: 'planned 2.5:1', tone: 'muted' }]}
                provenance="synthetic"
                sourceRef="synthetic-journal-analytics"
                footnote="A bucket whose realised result sits below the planned level is the gap between plan and execution, not a market opinion."
              />
              <PerformanceChart
                title="Performance by session"
                description="The session a setup is taken in is part of the setup's evidence."
                series={[
                  {
                    id: 'session',
                    label: 'Realised average R',
                    tone: 'ai',
                    points: mockSessionPerformance.map((row) => ({
                      label: row.label,
                      value: row.averageR,
                    })),
                    bars: true,
                  },
                ]}
                unit="R"
                levels={[{ value: 0, label: 'break-even', tone: 'muted' }]}
                provenance="synthetic"
                sourceRef="synthetic-journal-analytics"
              />
            </div>
          </Section>

          <ProvenanceBanner
            provenance="synthetic"
            source="synthetic-journal-analytics"
            updatedAt="2026-09-19T16:45:00Z"
          />
        </JournalTabPanel>

        {/* Trade history -------------------------------------------------- */}
        <JournalTabPanel value="history">
          <TradeFilters
            filters={filters}
            onChange={setFilters}
            onReset={() => setFilters(EMPTY_TRADE_FILTERS)}
            matched={filtered.length}
            total={mockTrades.length}
            collapsible
          />
          <TradeTable
            trades={filtered}
            totalRecords={mockTrades.length}
            onResetFilters={() => setFilters(EMPTY_TRADE_FILTERS)}
            onView={openTrade}
            onEdit={openTrade}
            onDuplicate={openTrade}
            onArchive={openTrade}
            onDelete={() => setExportNotice(true)}
            onAddReview={openTrade}
            onViewScreenshots={openTrade}
            onExport={() => setExportNotice(true)}
          />
          <Grid columns={3}>
            <Card tone="sunken">
              <CardHeader>
                <CardTitle className="text-body">Record states</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                A row&rsquo;s left edge carries its result: green for a win, red for a loss, grey
                for break-even, blue for an open record. An archived row is dimmed rather than
                hidden, because an archived record is still the reason a later decision was made.
              </CardContent>
            </Card>
            <Card tone="sunken">
              <CardHeader>
                <CardTitle className="text-body">Actions on a record</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-caption text-text-muted">
                <p className="flex items-center gap-2">
                  <ListChecks size={13} aria-hidden className="text-text-faint" />
                  View, edit, duplicate, archive, delete, review, screenshots.
                </p>
                <p className="text-text-faint">
                  There is no row action that places, changes or closes anything. The application
                  has no such capability and the menu does not imply one.
                </p>
              </CardContent>
            </Card>
            <Card tone="sunken">
              <CardHeader>
                <CardTitle className="text-body">Filtering is how a review starts</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                Narrowing to one setup, one session or one rule state is the point: a journal that
                can only be read end to end is a diary.
              </CardContent>
            </Card>
          </Grid>
        </JournalTabPanel>

        {/* Add trade ------------------------------------------------------ */}
        <JournalTabPanel value="add">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <TradeForm onCancel={() => setTab('history')} className="xl:col-span-1" />
            <div className="space-y-4">
              <Card tone="sunken">
                <CardHeader>
                  <div>
                    <CardTitle className="text-body">No store is connected yet</CardTitle>
                    <CardDescription>What happens when you submit in this phase</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-caption text-text-muted">
                  <p>
                    Validation is real: the form refuses a record with no symbol, no setup, no
                    invalidation level, or levels that contradict the direction.
                  </p>
                  <p>
                    The write is not. Submitting reports{' '}
                    <span className="num text-text-faint">JOURNAL_STORE_UNAVAILABLE</span> and keeps
                    your values in the form, because a form that says &ldquo;saved&rdquo; when
                    nothing was stored is the worst possible behaviour for a journal.
                  </p>
                </CardContent>
              </Card>
              <Card tone="sunken">
                <CardHeader>
                  <div>
                    <CardTitle className="text-body">Risk is not calculated here</CardTitle>
                    <CardDescription>Where the numbers come from</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="text-caption text-text-muted">
                  The form records the levels you enter and checks that they agree with the
                  direction. Position size, R multiples and every statistic are produced by the
                  deterministic engine in{' '}
                  <span className="num text-text-faint">packages/trading-engine</span>, never by the
                  interface and never by the model.
                </CardContent>
              </Card>
              <Card tone="sunken">
                <CardHeader>
                  <div>
                    <CardTitle className="text-body">Recording is not adopting</CardTitle>
                    <CardDescription>The safety boundary</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="text-caption text-text-muted">
                  A record is an append to a journal. It cannot activate a rule, and it cannot reach
                  a broker. Rule changes need an evaluation and a recorded human approval, which are
                  separate surfaces.
                </CardContent>
              </Card>
            </div>
          </div>
        </JournalTabPanel>

        {/* Trade details -------------------------------------------------- */}
        <JournalTabPanel value="details">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-body">Choose a record</CardTitle>
                <CardDescription>
                  {mockTrades.length} records in the preview, including one open and one incomplete
                  record on purpose.
                </CardDescription>
              </div>
              <Badge tone="outline" icon={<ScrollText size={11} aria-hidden />}>
                read-only
              </Badge>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-wrap gap-2">
                {mockTrades.map((trade) => (
                  <li key={trade.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedRef(trade.ref)}
                      aria-pressed={trade.ref === selectedRef}
                      className={
                        'flex items-center gap-2 rounded-[var(--radius-control)] border px-2.5 py-1.5 text-caption transition-colors duration-[var(--duration-fast)] ' +
                        (trade.ref === selectedRef
                          ? 'border-primary bg-primary-soft text-text'
                          : 'border-border bg-surface-sunken text-text-muted hover:border-border-strong')
                      }
                    >
                      <span className="num">{trade.ref}</span>
                      <span className="text-text">{trade.symbol}</span>
                      <span className="num text-text-faint">
                        {trade.actual?.actualR == null
                          ? 'not scored'
                          : `${trade.actual.actualR > 0 ? '+' : ''}${trade.actual.actualR.toFixed(2)}R`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {selected === undefined ? (
            <ErrorState
              severity="warning"
              title="That record could not be found"
              description="The reference does not match a record in the journal view. Nothing was changed."
              code="JOURNAL_RECORD_NOT_FOUND"
            />
          ) : (
            <>
              <Card>
                <CardHeader>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>{selected.symbol}</CardTitle>
                      <DirectionBadge direction={selected.direction} />
                      <SetupBadge setupId={selected.setupId} />
                      <RuleComplianceBadge compliance={selected.compliance} />
                      <Badge tone="outline">{STATUS_LABEL[selected.status]}</Badge>
                    </div>
                    <CardDescription>
                      {selected.ref} · {formatTimestamp(selected.openedAt)}
                      {selected.closedAt === null
                        ? ' · still open'
                        : ` → ${formatTimestamp(selected.closedAt)}`}{' '}
                      · {setupLabel(selected.setupId)} · {selected.timeframe}
                    </CardDescription>
                  </div>
                  <Badge
                    tone={
                      selected.result === 'win'
                        ? 'success'
                        : selected.result === 'loss'
                          ? 'danger'
                          : 'neutral'
                    }
                  >
                    {RESULT_LABEL[selected.result]}
                  </Badge>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <SummaryCell
                    label="Realised R"
                    value={
                      selected.actual?.actualR == null
                        ? 'not scored'
                        : `${selected.actual.actualR > 0 ? '+' : ''}${selected.actual.actualR.toFixed(2)}R`
                    }
                    hint="Unscored records show a gap, not a zero."
                  />
                  <SummaryCell
                    label="Planned reward-to-risk"
                    value={`${selected.plan.plannedRr.toFixed(1)} : 1`}
                    hint="Written before entry."
                  />
                  <SummaryCell
                    label="Risk committed"
                    value={selected.plan.riskAmount.toLocaleString('en-US')}
                    hint="Account risk as planned."
                  />
                  <SummaryCell
                    label="Review state"
                    value={REVIEW_STATE_LABEL[selected.reviewState]}
                    hint="A rule break or an unscored record forces a review."
                  />
                </CardContent>
              </Card>

              <RiskSummary trade={selected} />

              <PerformanceChart
                title={`${selected.ref} — recorded levels`}
                description="Two points only: the recorded entry and the recorded exit. No intermediate price path is invented."
                series={[
                  {
                    id: 'recorded',
                    label: 'Recorded entry → exit',
                    tone: 'info',
                    points: [
                      { label: 'entry', value: selected.actual?.entry ?? selected.plan.entry },
                      {
                        label: 'exit',
                        value: selected.actual?.exit ?? selected.plan.entry,
                      },
                    ],
                  },
                ]}
                unit="price"
                levels={[
                  { value: selected.plan.stopLoss, label: 'invalidation', tone: 'danger' },
                  { value: selected.plan.takeProfit, label: 'target', tone: 'primary' },
                  { value: selected.plan.entry, label: 'planned entry', tone: 'muted' },
                ]}
                markers={[
                  {
                    index: 0,
                    value: selected.actual?.entry ?? selected.plan.entry,
                    label: 'entry',
                    tone: 'info',
                  },
                  {
                    index: 1,
                    value: selected.actual?.exit ?? selected.plan.entry,
                    label: selected.actual?.exit == null ? 'no exit recorded' : 'exit',
                    tone: 'primary',
                  },
                ]}
                annotations={[
                  { index: 0, label: 'entry' },
                  { index: 1, label: 'exit' },
                ]}
                provenance="synthetic"
                sourceRef={`journal/${selected.ref}`}
                updatedAt={selected.updatedAt}
                footnote="The key zone, market structure and liquidity context are text in the record, so they are shown as text below rather than drawn as lines the data cannot support."
              />

              <Grid columns={2}>
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle className="text-body">Market analysis</CardTitle>
                      <CardDescription>Written before the entry, not after</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-caption">
                    {selected.context === undefined ? (
                      <p className="text-text-faint">
                        No market context was recorded for this trade. It is shown as missing rather
                        than as an empty heading.
                      </p>
                    ) : (
                      <dl className="space-y-1.5">
                        <DetailRow
                          label="Higher-timeframe bias"
                          value={selected.context.higherTimeframeBias}
                        />
                        <DetailRow
                          label="Market structure"
                          value={selected.context.marketStructure}
                        />
                        <DetailRow
                          label="Liquidity context"
                          value={selected.context.liquidityContext}
                        />
                        <DetailRow label="Key zone" value={selected.context.keyZone} />
                        <DetailRow
                          label="Entry confirmation"
                          value={selected.context.entryConfirmation}
                        />
                        <DetailRow
                          label="Confluences"
                          value={selected.context.confluences.join(' · ')}
                        />
                        <DetailRow label="Volatility" value={selected.context.volatility} />
                        <DetailRow label="News exposure" value={selected.context.newsExposure} />
                      </dl>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle className="text-body">Execution, risk and management</CardTitle>
                      <CardDescription>
                        What was planned, and what was actually done
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-caption">
                    {selected.rationale === undefined ? (
                      <p className="text-text-faint">
                        No written plan for this record. The levels are still shown above; the
                        reasoning behind them was not captured.
                      </p>
                    ) : (
                      <dl className="space-y-1.5">
                        <DetailRow label="Thesis" value={selected.rationale.thesis} />
                        <DetailRow
                          label="Entry rationale"
                          value={selected.rationale.entryRationale}
                        />
                        <DetailRow label="Invalidation" value={selected.rationale.invalidation} />
                        <DetailRow label="Management" value={selected.rationale.management} />
                        <DetailRow label="Exit plan" value={selected.rationale.exitPlan} />
                        <DetailRow
                          label="Checklist"
                          value={`${selected.rationale.checklist.length} of 8 items marked`}
                        />
                        <DetailRow
                          label="Compliance note"
                          value={selected.rationale.complianceNote}
                        />
                      </dl>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle className="text-body">Psychology</CardTitle>
                      <CardDescription>Self-reported at the time</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-caption">
                    {selected.psychology === undefined ? (
                      <p className="text-text-faint">No psychology recorded for this trade.</p>
                    ) : (
                      <>
                        <p className="text-text-muted">
                          {EMOTIONAL_STATE_LABEL[selected.psychology.beforeEntry]} before ·{' '}
                          {EMOTIONAL_STATE_LABEL[selected.psychology.duringTrade]} during ·{' '}
                          {EMOTIONAL_STATE_LABEL[selected.psychology.afterExit]} after.
                        </p>
                        <div className="space-y-2">
                          <MetricBar
                            label="Discipline"
                            value={`${selected.psychology.discipline}/10`}
                            share={selected.psychology.discipline / 10}
                            tone="primary"
                          />
                          <MetricBar
                            label="Greed"
                            value={`${selected.psychology.greed}/10`}
                            share={selected.psychology.greed / 10}
                            tone="warning"
                          />
                          <MetricBar
                            label="Impulsiveness"
                            value={`${selected.psychology.impulsiveness}/10`}
                            share={selected.psychology.impulsiveness / 10}
                            tone="warning"
                          />
                          <MetricBar
                            label="Fear"
                            value={`${selected.psychology.fear}/10`}
                            share={selected.psychology.fear / 10}
                            tone="info"
                          />
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle className="text-body">Mistakes and lessons</CardTitle>
                      <CardDescription>What the record taught</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-caption">
                    {selected.review === undefined ? (
                      <p className="text-text-faint">
                        {selected.reviewState === 'required'
                          ? 'This record is flagged as needing a review, and none has been written yet.'
                          : 'No review was written for this trade.'}
                      </p>
                    ) : (
                      <>
                        {selected.review.mistakes.length === 0 ? (
                          <MistakeTag label="nothing recorded as a mistake" positive />
                        ) : (
                          <ul className="flex flex-wrap gap-1.5">
                            {selected.review.mistakes.map((mistake) => (
                              <li key={mistake}>
                                <MistakeTag label={mistake} />
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="space-y-1.5">
                          <DetailRow label="Lesson" value={selected.review.lesson} />
                          <DetailRow label="Adjustment" value={selected.review.adjustment} />
                          <DetailRow
                            label="Went well"
                            value={selected.review.wentWell.join(' · ')}
                          />
                          <DetailRow
                            label="Improvements"
                            value={selected.review.improvements.join(' · ')}
                          />
                        </div>
                      </>
                    )}
                    {selected.tags.length > 0 ? (
                      <ul className="flex flex-wrap gap-1.5">
                        {selected.tags.map((tag) => (
                          <li key={tag}>
                            <Badge tone="outline">{tag}</Badge>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </CardContent>
                </Card>
              </Grid>

              <ScreenshotGallery attachments={selected.screenshots} tradeRef={selected.ref} />

              <AIReviewStateGallery
                value={reviewState}
                onValueChange={setReviewState}
                tradeRef={selected.ref}
              />

              <TradeTimeline events={buildTradeTimeline(selected)} />
            </>
          )}
        </JournalTabPanel>

        {/* Analytics ------------------------------------------------------ */}
        <JournalTabPanel value="analytics">
          <AnalyticsPanel
            range={analyticsRange}
            onRangeChange={setAnalyticsRange}
            rangeFrom={analyticsFrom}
            rangeTo={analyticsTo}
            onRangeFromChange={setAnalyticsFrom}
            onRangeToChange={setAnalyticsTo}
          />
        </JournalTabPanel>

        {/* Calendar ------------------------------------------------------- */}
        <JournalTabPanel value="calendar">
          <JournalCalendar
            days={mockCalendarDays}
            month={mockCalendarMonth}
            trades={mockTrades}
            view={calendarView}
            onViewChange={setCalendarView}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
          <Grid columns={2}>
            <Card tone="sunken">
              <CardHeader>
                <div>
                  <CardTitle className="text-body">What a day holds</CardTitle>
                  <CardDescription>
                    Trade count, net R, risk, compliance, main setup, emotion
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                A day whose records were never scored reports &ldquo;not scored&rdquo; rather than a
                zero, and a day with no trades is an explicit flat cell rather than a blank one.
              </CardContent>
            </Card>
            <Card tone="sunken">
              <CardHeader>
                <div>
                  <CardTitle className="text-body">The emotional score is self-reported</CardTitle>
                  <CardDescription>Labelled so it is never read as a measurement</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                It is the trader&rsquo;s own reading of the day, recorded at the time — useful when
                compared with the same value on a different day, meaningless as a score.
              </CardContent>
            </Card>
          </Grid>
        </JournalTabPanel>

        {/* Reviews and lessons -------------------------------------------- */}
        <JournalTabPanel value="reviews">
          <Grid columns={2}>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="text-body">Awaiting a review</CardTitle>
                  <CardDescription>
                    Flagged by the record: a rule break, an unscored trade or a skipped checklist
                    item
                  </CardDescription>
                </div>
                <Badge tone="warning">{awaitingReview.length}</Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                {awaitingReview.length === 0 ? (
                  <EmptyState
                    title="Nothing is waiting for a review"
                    description="Every record that required a review has one. This state is reachable — it is not an error."
                  />
                ) : (
                  <ul className="space-y-2">
                    {awaitingReview.map((trade) => (
                      <li
                        key={trade.id}
                        className="flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface-sunken px-3 py-2"
                      >
                        <span className="num text-caption text-text-muted">{trade.ref}</span>
                        <span className="text-body text-text">{trade.symbol}</span>
                        <DirectionBadge direction={trade.direction} />
                        <RuleComplianceBadge compliance={trade.compliance} />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ms-auto"
                          onClick={() => openTrade(trade)}
                          label={`Review ${trade.ref}`}
                        >
                          Review
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="text-body">Mistake frequency</CardTitle>
                  <CardDescription>
                    Recorded patterns, each with its corrective note
                  </CardDescription>
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
                  Shares are of the recorded occurrences. A pattern that repeated is worth more
                  attention than a single large loss.
                </p>
              </CardContent>
            </Card>
          </Grid>

          <Section
            title="Lessons"
            description="One line per reviewed record — the whole reason the journal exists."
          >
            {reviewedTrades.length === 0 ? (
              <EmptyState
                title="No reviews written yet"
                description="A journal with records but no lessons is a log. The lessons appear here as they are written."
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                {reviewedTrades.map((trade) => (
                  <Card key={trade.id} tone="sunken">
                    <CardHeader>
                      <div>
                        <CardTitle className="text-body">
                          {trade.ref} · {trade.symbol}
                        </CardTitle>
                        <CardDescription>
                          {setupLabel(trade.setupId)} · {RESULT_LABEL[trade.result]}
                        </CardDescription>
                      </div>
                      <DirectionBadge direction={trade.direction} />
                    </CardHeader>
                    <CardContent className="space-y-2 text-caption">
                      <p className="flex items-start gap-2 text-text">
                        <BookOpen size={13} aria-hidden className="mt-0.5 shrink-0 text-primary" />
                        {trade.review?.lesson ?? 'No lesson recorded.'}
                      </p>
                      {trade.review !== undefined && trade.review.mistakes.length > 0 ? (
                        <ul className="flex flex-wrap gap-1.5">
                          {trade.review.mistakes.map((mistake) => (
                            <li key={mistake}>
                              <MistakeTag label={mistake} />
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <MistakeTag label="no mistakes recorded" positive />
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-0"
                        onClick={() => openTrade(trade)}
                        label={`Open ${trade.ref}`}
                      >
                        Open the record
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Study prompts"
            description="What the journal is for, and what it refuses to pretend"
          >
            <Grid columns={3}>
              <Card tone="sunken">
                <CardHeader>
                  <CardTitle className="text-body">
                    <span className="inline-flex items-center gap-2">
                      <NotebookPen size={14} aria-hidden className="text-text-faint" />A record is
                      not a result
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-caption text-text-muted">
                  The journal stores what was done. Whether the process is worth repeating is a
                  question for the research surface, where a claim needs a sample and an approval.
                </CardContent>
              </Card>
              <Card tone="sunken">
                <CardHeader>
                  <CardTitle className="text-body">
                    <span className="inline-flex items-center gap-2">
                      <BrainCircuit size={14} aria-hidden className="text-text-faint" />
                      No model writes a number here
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-caption text-text-muted">
                  Review assistance explains a record. It never produces the figures, never scores
                  the trade and never changes a rule.
                </CardContent>
              </Card>
              <Card tone="sunken">
                <CardHeader>
                  <CardTitle className="text-body">
                    <span className="inline-flex items-center gap-2">
                      <ShieldCheck size={14} aria-hidden className="text-text-faint" />
                      Recording changes nothing
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-caption text-text-muted">
                  Writing a record cannot activate a rule, cannot alter risk limits and cannot reach
                  a broker. It appends history and stops there.
                </CardContent>
              </Card>
            </Grid>
          </Section>

          <InterfaceStatesPanel
            states={['loading', 'empty', 'error']}
            title="Interface states"
            description="How the journal behaves before records arrive, when a filter selects nothing, and when the store cannot be read."
            loadingTitle="Reading the journal"
            loadingDescription="The placeholder matches the table it is standing in for, so the layout does not jump when records arrive."
            emptyTitle="No records match these filters"
            emptyDescription="An empty table after filtering is a selected subset that is empty, not an empty journal — and it offers to clear the filters."
            errorTitle="The journal store could not be read"
            errorDescription="The failure reports its typed reason. A failed read is never rendered as an empty journal."
            errorCode="JOURNAL_STORE_UNAVAILABLE"
            hint={`Selection, sorting and paging run over the ${
              mockTrades.length
            } preview records. Nothing in this phase is written anywhere.`}
          />

          <p className="text-caption text-text-faint">
            {mockTrades.length} records · {reviewedTrades.length} reviewed · {awaitingReview.length}{' '}
            awaiting a review · scope {describeRange(analyticsRange, analyticsFrom, analyticsTo)}{' '}
            for the analytics section above.
          </p>
        </JournalTabPanel>
      </JournalTabs>
    </Workspace>
  );
}

function SummaryCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-border bg-surface-sunken px-3 py-2">
      <p className="text-caption text-text-muted">{label}</p>
      <p className="num mt-0.5 text-body text-text">{value}</p>
      {hint ? <p className="mt-0.5 text-caption text-text-faint">{hint}</p> : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <dt className="shrink-0 text-caption text-text-faint sm:w-44">{label}</dt>
      <dd className="text-caption text-text-muted">{value === '' ? 'not recorded' : value}</dd>
    </div>
  );
}
