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
  CardTile,
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
import { TabPanel, Tabs } from '../components/Tabs';
import { formatTimestamp } from '../lib/format';
import {
  EMOTIONAL_STATE_LABEL,
  EMPTY_TRADE_FILTERS,
  previewNotice,
  statNote,
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
import { msg } from '../i18n/index.js';

const TABS = [
  {
    id: 'overview',
    get label(): string {
      return msg('dashboardPage.overview');
    },
    icon: <ChartNoAxesCombined size={14} aria-hidden />,
  },
  {
    id: 'history',
    get label(): string {
      return msg('journal.tradeHistory');
    },
    icon: <ClipboardList size={14} aria-hidden />,
  },
  {
    id: 'add',
    get label(): string {
      return msg('journalPage.addTrade');
    },
    icon: <Plus size={14} aria-hidden />,
  },
  {
    id: 'details',
    get label(): string {
      return msg('journalPage.tradeDetails');
    },
    icon: <Search size={14} aria-hidden />,
  },
  {
    id: 'analytics',
    get label(): string {
      return msg('journalPage.analytics');
    },
    icon: <LineChart size={14} aria-hidden />,
  },
  {
    id: 'calendar',
    get label(): string {
      return msg('journalPage.calendar');
    },
    icon: <CalendarDays size={14} aria-hidden />,
  },
  {
    id: 'reviews',
    get label(): string {
      return msg('journalPage.reviewsAndLessons');
    },
    icon: <GraduationCap size={14} aria-hidden />,
  },
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
      description={msg('journalPage.theJournalStoreAndItsExportPipelineArrive')}
      code="JOURNAL_STORE_UNAVAILABLE"
    />
  );

  return (
    <Workspace
      title={msg('journal.tradingJournal')}
      description={msg('journalPage.everyRecordItsPlanItsRiskWhetherThe')}
      actions={
        <>
          <Badge tone="outline" icon={<ShieldCheck size={12} aria-hidden />}>
            record only — no execution
          </Badge>
          <Tooltip content={previewNotice()}>
            <Badge tone="warning">preview data</Badge>
          </Tooltip>
          <Tooltip content={msg('journalPage.exportIsNotConnectedInThisPhaseThe')}>
            <Button
              variant="secondary"
              size="md"
              onClick={() => setExportNotice(true)}
              label={msg('journalPage.exportTheCurrentJournalView')}
              leadingIcon={<Download size={14} aria-hidden />}
            >
              Export
            </Button>
          </Tooltip>
          <Button
            variant="primary"
            size="md"
            onClick={() => setTab('add')}
            label={msg('journalPage.openTheAddTradeForm')}
            leadingIcon={<Plus size={14} aria-hidden />}
          >
            Add trade
          </Button>
        </>
      }
    >
      {exportNotice ? notConnected(msg('journal.export')) : null}

      <Grid columns={4}>
        <Card>
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('journal.recordsByState')}</CardTitle>
              <CardDescription>
                {states.scored} {msg('journal.scored')} {states.total - states.scored}{' '}
                {msg('journal.notScored')}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-caption text-text-muted">
            <p>
              {states.byResult.win} {msg('journal.wins')} {states.byResult.loss}{' '}
              {msg('journal.losses')} {states.byResult.breakeven} {msg('journal.breakeven')}{' '}
              {states.byResult.pending} {msg('journal.unscored')}
            </p>
            <p>
              {states.byStatus.open} {msg('journal.open')} {states.byStatus.incomplete}{' '}
              {msg('journal.incomplete')} {states.byStatus.archived} {msg('journal.archived')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('journal.ruleAdherence')}</CardTitle>
              <CardDescription>{msg('journal.assessedSeparatelyFromTheOutcome')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-caption text-text-muted">
            <p>
              {states.byCompliance.compliant} {msg('journal.compliant')}{' '}
              {states.byCompliance.partial} {msg('journal.partial')} {states.byCompliance.violation}{' '}
              {msg('journal.broken')}
            </p>
            <p className="text-text-faint">
              {states.byCompliance['not-assessed']} {msg('journal.notAssessedExcludedFromTheRate')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('journal.writeUps')}</CardTitle>
              <CardDescription>{msg('journal.aRecordWithNoReviewCannot')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-caption text-text-muted">
            <p>
              {states.withReview} {msg('exams.of')} {states.total}{' '}
              {msg('journal.recordsCarryAWrittenReview')}
            </p>
            <p className="text-text-faint">
              {states.withoutWriteUp} {msg('journal.haveNoMarketContextRecordedAt')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('journal.reviewsAwaitingYou')}</CardTitle>
              <CardDescription>{msg('journal.flaggedByTheRecordNotBy')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-caption text-text-muted">
            <p className="num text-metric text-warning">{states.byReviewState.required}</p>
            <p className="text-text-faint">{msg('journal.aRuleBreakAndAnUnscored')}</p>
          </CardContent>
        </Card>
      </Grid>

      <Tabs
        items={TABS.map((item) => ({ id: item.id, label: item.label, icon: item.icon }))}
        value={tab}
        onValueChange={setTab}
        aria-label={msg('journal.journalSections')}
      >
        {/* Overview ------------------------------------------------------- */}
        <TabPanel value="overview">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {mockJournalStats.map((stat) => (
              <JournalStatCard
                key={stat.id}
                label={stat.label}
                value={stat.value}
                {...(stat.unit ? { unit: stat.unit } : {})}
                comparison={stat.comparison}
                {...(stat.comparisonDelta === undefined
                  ? {}
                  : { comparisonDelta: stat.comparisonDelta })}
                basis={stat.basis}
                tone={stat.tone}
                {...(stat.hint ? { hint: stat.hint } : {})}
                {...(stat.id === 'net-performance'
                  ? { sparkline: mockEquityCurve.points.map((point) => point.value) }
                  : {})}
              />
            ))}
          </div>

          <p className="text-caption text-text-faint">{statNote()}</p>

          <Section
            title={msg('journal.performance')}
            description={msg('journalPage.everyChartStatesItsScopeAndEveryOne')}
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
                levels={[{ value: 0, label: msg('analyticsPanel.highWaterMark'), tone: 'muted' }]}
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
                    label: msg('journalPage.records'),
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
            title={msg('journal.plannedVersusActual')}
            description={msg('journalPage.theComparisonTheJournalExistsForWhatWas')}
          >
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <PerformanceChart
                title={msg('journal.plannedRRAgainstRealisedAverage')}
                description={msg('journalPage.plannedRewardToRiskIsTheDashedReferenceTheBars')}
                series={[
                  {
                    id: 'realised',
                    label: msg('journalPage.realisedAverageR'),
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
                footnote={msg('journalPage.aBucketWhoseRealisedResultSitsBelowThe')}
              />
              <PerformanceChart
                title={msg('journal.performanceBySession')}
                description={msg('analyticsPanel.theSessionASetupIsTakenInIs')}
                series={[
                  {
                    id: 'session',
                    label: msg('journalPage.realisedAverageR'),
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
        </TabPanel>

        {/* Trade history -------------------------------------------------- */}
        <TabPanel value="history">
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
              <CardHeader divider>
                <CardTitle className="text-body">{msg('journal.recordStates')}</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                {msg('journal.aRowRsquoSLeftEdge')}
              </CardContent>
            </Card>
            <Card tone="sunken">
              <CardHeader divider>
                <CardTitle className="text-body">{msg('journal.actionsOnARecord')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-caption text-text-muted">
                <p className="flex items-center gap-2">
                  <ListChecks size={13} aria-hidden className="text-text-faint" />
                  {msg('journal.viewEditDuplicateArchiveDeleteReview')}
                </p>
                <p className="text-text-faint">{msg('journal.thereIsNoRowActionThat')}</p>
              </CardContent>
            </Card>
            <Card tone="sunken">
              <CardHeader divider>
                <CardTitle className="text-body">
                  {msg('journal.filteringIsHowAReviewStarts')}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                {msg('journal.narrowingToOneSetupOneSession')}
              </CardContent>
            </Card>
          </Grid>
        </TabPanel>

        {/* Add trade ------------------------------------------------------ */}
        <TabPanel value="add">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <TradeForm onCancel={() => setTab('history')} className="xl:col-span-1" />
            <div className="space-y-4">
              <Card tone="sunken">
                <CardHeader divider>
                  <div>
                    <CardTitle className="text-body">
                      {msg('journal.noStoreIsConnectedYet')}
                    </CardTitle>
                    <CardDescription>{msg('journal.whatHappensWhenYouSubmitIn')}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-caption text-text-muted">
                  <p>{msg('journal.validationIsRealTheFormRefuses')}</p>
                  <p>
                    {msg('journal.theWriteIsNotSubmittingReports')}{' '}
                    <span className="num text-text-faint">JOURNAL_STORE_UNAVAILABLE</span>{' '}
                    {msg('journal.andKeepsYourValuesInThe')}
                  </p>
                </CardContent>
              </Card>
              <Card tone="sunken">
                <CardHeader divider>
                  <div>
                    <CardTitle className="text-body">
                      {msg('journal.riskIsNotCalculatedHere')}
                    </CardTitle>
                    <CardDescription>{msg('journal.whereTheNumbersComeFrom')}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="text-caption text-text-muted">
                  {msg('journal.theFormRecordsTheLevelsYou')}{' '}
                  <span className="num text-text-faint">
                    {msg('journal.packagesTradingEngine')}
                  </span>
                  {msg('journal.neverByTheInterfaceAndNever')}
                </CardContent>
              </Card>
              <Card tone="sunken">
                <CardHeader divider>
                  <div>
                    <CardTitle className="text-body">
                      {msg('journal.recordingIsNotAdopting')}
                    </CardTitle>
                    <CardDescription>{msg('journal.theSafetyBoundary')}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="text-caption text-text-muted">
                  {msg('journal.aRecordIsAnAppendTo')}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabPanel>

        {/* Trade details -------------------------------------------------- */}
        <TabPanel value="details">
          <Card>
            <CardHeader divider>
              <div>
                <CardTitle className="text-body">{msg('journal.chooseARecord')}</CardTitle>
                <CardDescription>
                  {mockTrades.length} {msg('journal.recordsInThePreviewIncludingOne')}
                </CardDescription>
              </div>
              <Badge tone="outline" icon={<ScrollText size={11} aria-hidden />}>
                {msg('journal.readOnly')}
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
              title={msg('journal.thatRecordCouldNotBeFound')}
              description={msg('journalPage.theReferenceDoesNotMatchARecordIn')}
              code="JOURNAL_RECORD_NOT_FOUND"
            />
          ) : (
            <>
              <Card>
                <CardHeader divider>
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
                    label={msg('journalPage.realisedR')}
                    value={
                      selected.actual?.actualR == null
                        ? 'not scored'
                        : `${selected.actual.actualR > 0 ? '+' : ''}${selected.actual.actualR.toFixed(2)}R`
                    }
                    hint={msg('journalPage.unscoredRecordsShowAGapNotAZero')}
                  />
                  <SummaryCell
                    label={msg('tradeForm.plannedRewardToRisk')}
                    value={`${selected.plan.plannedRr.toFixed(1)} : 1`}
                    hint={msg('journalPage.writtenBeforeEntry')}
                  />
                  <SummaryCell
                    label={msg('journalPage.riskCommitted')}
                    value={selected.plan.riskAmount.toLocaleString('en-US')}
                    hint={msg('journalPage.accountRiskAsPlanned')}
                  />
                  <SummaryCell
                    label={msg('journalPage.reviewState')}
                    value={REVIEW_STATE_LABEL[selected.reviewState]}
                    hint={msg('journalPage.aRuleBreakOrAnUnscoredRecordForces')}
                  />
                </CardContent>
              </Card>

              <RiskSummary trade={selected} />

              <PerformanceChart
                title={`${selected.ref} — recorded levels`}
                description={msg('journalPage.twoPointsOnlyTheRecordedEntryAndThe')}
                series={[
                  {
                    id: 'recorded',
                    label: msg('journalPage.recordedEntryExit'),
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
                  {
                    value: selected.plan.entry,
                    label: msg('journalPage.plannedEntry'),
                    tone: 'muted',
                  },
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
                footnote={msg('journalPage.theKeyZoneMarketStructureAndLiquidityContext')}
              />

              <Grid columns={2}>
                <Card>
                  <CardHeader divider>
                    <div>
                      <CardTitle className="text-body">{msg('journal.marketAnalysis')}</CardTitle>
                      <CardDescription>
                        {msg('journal.writtenBeforeTheEntryNotAfter')}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-caption">
                    {selected.context === undefined ? (
                      <p className="text-text-faint">
                        {msg('journal.noMarketContextWasRecordedFor')}
                      </p>
                    ) : (
                      <dl className="space-y-1.5">
                        <DetailRow
                          label={msg('tradeForm.higherTimeframeBias')}
                          value={selected.context.higherTimeframeBias}
                        />
                        <DetailRow
                          label={msg('profile.array.market-structure')}
                          value={selected.context.marketStructure}
                        />
                        <DetailRow
                          label={msg('tradeForm.liquidityContext')}
                          value={selected.context.liquidityContext}
                        />
                        <DetailRow
                          label={msg('tradeForm.keyZone')}
                          value={selected.context.keyZone}
                        />
                        <DetailRow
                          label={msg('tradeForm.entryConfirmation')}
                          value={selected.context.entryConfirmation}
                        />
                        <DetailRow
                          label={msg('tradeForm.confluences')}
                          value={selected.context.confluences.join(' · ')}
                        />
                        <DetailRow
                          label={msg('journalPage.volatility')}
                          value={selected.context.volatility}
                        />
                        <DetailRow
                          label={msg('tradeForm.newsExposure')}
                          value={selected.context.newsExposure}
                        />
                      </dl>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader divider>
                    <div>
                      <CardTitle className="text-body">
                        {msg('journal.executionRiskAndManagement')}
                      </CardTitle>
                      <CardDescription>{msg('journal.whatWasPlannedAndWhatWas')}</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-caption">
                    {selected.rationale === undefined ? (
                      <p className="text-text-faint">{msg('journal.noWrittenPlanForThisRecord')}</p>
                    ) : (
                      <dl className="space-y-1.5">
                        <DetailRow
                          label={msg('journalPage.thesis')}
                          value={selected.rationale.thesis}
                        />
                        <DetailRow
                          label={msg('tradeForm.entryRationale')}
                          value={selected.rationale.entryRationale}
                        />
                        <DetailRow
                          label={msg('riskSummary.invalidation')}
                          value={selected.rationale.invalidation}
                        />
                        <DetailRow
                          label={msg('journalPage.management')}
                          value={selected.rationale.management}
                        />
                        <DetailRow
                          label={msg('tradeForm.exitPlan')}
                          value={selected.rationale.exitPlan}
                        />
                        <DetailRow
                          label={msg('journalPage.checklist')}
                          value={`${selected.rationale.checklist.length} of 8 items marked`}
                        />
                        <DetailRow
                          label={msg('journalPage.complianceNote')}
                          value={selected.rationale.complianceNote}
                        />
                      </dl>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader divider>
                    <div>
                      <CardTitle className="text-body">{msg('journal.psychology')}</CardTitle>
                      <CardDescription>{msg('journal.selfReportedAtTheTime')}</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-caption">
                    {selected.psychology === undefined ? (
                      <p className="text-text-faint">
                        {msg('journal.noPsychologyRecordedForThisTrade')}
                      </p>
                    ) : (
                      <>
                        <p className="text-text-muted">
                          {EMOTIONAL_STATE_LABEL[selected.psychology.beforeEntry]}{' '}
                          {msg('journal.before')}{' '}
                          {EMOTIONAL_STATE_LABEL[selected.psychology.duringTrade]}{' '}
                          {msg('journal.during')}{' '}
                          {EMOTIONAL_STATE_LABEL[selected.psychology.afterExit]}{' '}
                          {msg('journal.after')}
                        </p>
                        <div className="space-y-2">
                          <MetricBar
                            label={msg('tradeForm.discipline')}
                            value={`${selected.psychology.discipline}/10`}
                            share={selected.psychology.discipline / 10}
                            tone="primary"
                          />
                          <MetricBar
                            label={msg('tradeForm.greed')}
                            value={`${selected.psychology.greed}/10`}
                            share={selected.psychology.greed / 10}
                            tone="warning"
                          />
                          <MetricBar
                            label={msg('tradeForm.impulsiveness')}
                            value={`${selected.psychology.impulsiveness}/10`}
                            share={selected.psychology.impulsiveness / 10}
                            tone="warning"
                          />
                          <MetricBar
                            label={msg('tradeForm.fear')}
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
                  <CardHeader divider>
                    <div>
                      <CardTitle className="text-body">
                        {msg('journal.mistakesAndLessons')}
                      </CardTitle>
                      <CardDescription>{msg('journal.whatTheRecordTaught')}</CardDescription>
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
                          <MistakeTag
                            label={msg('journalPage.nothingRecordedAsAMistake')}
                            positive
                          />
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
                          <DetailRow label={msg('journal.lesson')} value={selected.review.lesson} />
                          <DetailRow
                            label={msg('usage.ledgerKind.adjustment')}
                            value={selected.review.adjustment}
                          />
                          <DetailRow
                            label={msg('journalPage.wentWell')}
                            value={selected.review.wentWell.join(' · ')}
                          />
                          <DetailRow
                            label={msg('journalPage.improvements')}
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
        </TabPanel>

        {/* Analytics ------------------------------------------------------ */}
        <TabPanel value="analytics">
          <AnalyticsPanel
            range={analyticsRange}
            onRangeChange={setAnalyticsRange}
            rangeFrom={analyticsFrom}
            rangeTo={analyticsTo}
            onRangeFromChange={setAnalyticsFrom}
            onRangeToChange={setAnalyticsTo}
          />
        </TabPanel>

        {/* Calendar ------------------------------------------------------- */}
        <TabPanel value="calendar">
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
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('journal.whatADayHolds')}</CardTitle>
                  <CardDescription>{msg('journal.tradeCountNetRRiskCompliance')}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                {msg('journal.aDayWhoseRecordsWereNever')}
              </CardContent>
            </Card>
            <Card tone="sunken">
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">
                    {msg('journal.theEmotionalScoreIsSelfReported')}
                  </CardTitle>
                  <CardDescription>{msg('journal.labelledSoItIsNeverRead')}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                {msg('journal.itIsTheTraderRsquoS')}
              </CardContent>
            </Card>
          </Grid>
        </TabPanel>

        {/* Reviews and lessons -------------------------------------------- */}
        <TabPanel value="reviews">
          <Grid columns={2}>
            <Card>
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('journal.awaitingAReview')}</CardTitle>
                  <CardDescription>{msg('journal.flaggedByTheRecordARule')}</CardDescription>
                </div>
                <Badge tone="warning">{awaitingReview.length}</Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                {awaitingReview.length === 0 ? (
                  <EmptyState
                    title={msg('journal.nothingIsWaitingForAReview')}
                    description={msg('journalPage.everyRecordThatRequiredAReviewHasOne')}
                  />
                ) : (
                  <ul className="space-y-2">
                    {awaitingReview.map((trade) => (
                      <CardTile key={trade.id} className="flex flex-wrap items-center gap-2">
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
                          {msg('journal.review')}
                        </Button>
                      </CardTile>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('journal.mistakeFrequency')}</CardTitle>
                  <CardDescription>
                    {msg('journal.recordedPatternsEachWithItsCorrective')}
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
                  {msg('journal.sharesAreOfTheRecordedOccurrences2')}
                </p>
              </CardContent>
            </Card>
          </Grid>

          <Section
            title={msg('journal.lessons')}
            description={msg('journalPage.oneLinePerReviewedRecordTheWhole')}
          >
            {reviewedTrades.length === 0 ? (
              <EmptyState
                title={msg('journal.noReviewsWrittenYet')}
                description={msg('journalPage.aJournalWithRecordsButNoLessonsIs')}
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                {reviewedTrades.map((trade) => (
                  <Card key={trade.id} tone="sunken">
                    <CardHeader divider>
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
                        <MistakeTag label={msg('journalPage.noMistakesRecorded')} positive />
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-0"
                        onClick={() => openTrade(trade)}
                        label={`Open ${trade.ref}`}
                      >
                        {msg('journal.openTheRecord')}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </Section>

          <Section
            title={msg('journal.studyPrompts')}
            description={msg('journalPage.whatTheJournalIsForAndWhatIt')}
          >
            <Grid columns={3}>
              <Card tone="sunken">
                <CardHeader divider>
                  <CardTitle className="text-body">
                    <span className="inline-flex items-center gap-2">
                      <NotebookPen size={14} aria-hidden className="text-text-faint" />
                      {msg('journal.aRecordIsNotAResult')}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-caption text-text-muted">
                  {msg('journal.theJournalStoresWhatWasDone')}
                </CardContent>
              </Card>
              <Card tone="sunken">
                <CardHeader divider>
                  <CardTitle className="text-body">
                    <span className="inline-flex items-center gap-2">
                      <BrainCircuit size={14} aria-hidden className="text-text-faint" />
                      {msg('journal.noModelWritesANumberHere')}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-caption text-text-muted">
                  {msg('journal.reviewAssistanceExplainsARecordIt')}
                </CardContent>
              </Card>
              <Card tone="sunken">
                <CardHeader divider>
                  <CardTitle className="text-body">
                    <span className="inline-flex items-center gap-2">
                      <ShieldCheck size={14} aria-hidden className="text-text-faint" />
                      {msg('journal.recordingChangesNothing')}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-caption text-text-muted">
                  {msg('journal.writingARecordCannotActivateA')}
                </CardContent>
              </Card>
            </Grid>
          </Section>

          <InterfaceStatesPanel
            states={['loading', 'empty', 'error']}
            title={msg('journal.interfaceStates')}
            description={msg('journalPage.howTheJournalBehavesBeforeRecordsArriveWhen')}
            loadingTitle={msg('journalPage.readingTheJournal')}
            loadingDescription={msg('journalPage.thePlaceholderMatchesTheTableItIsStanding')}
            emptyTitle={msg('journalPage.noRecordsMatchTheseFilters')}
            emptyDescription={msg('journalPage.anEmptyTableAfterFilteringIsASelected')}
            errorTitle={msg('journalPage.theJournalStoreCouldNotBeRead')}
            errorDescription={msg('journalPage.theFailureReportsItsTypedReasonAFailed')}
            errorCode="JOURNAL_STORE_UNAVAILABLE"
            hint={`Selection, sorting and paging run over the ${
              mockTrades.length
            } preview records. Nothing in this phase is written anywhere.`}
          />

          <p className="text-caption text-text-faint">
            {mockTrades.length} {msg('journal.records2')} {reviewedTrades.length}{' '}
            {msg('journal.reviewed')} {awaitingReview.length} {msg('journal.awaitingAReviewScope')}{' '}
            {describeRange(analyticsRange, analyticsFrom, analyticsTo)}{' '}
            {msg('journal.forTheAnalyticsSectionAbove')}
          </p>
        </TabPanel>
      </Tabs>
    </Workspace>
  );
}

function SummaryCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <CardTile>
      <p className="text-caption text-text-muted">{label}</p>
      <p className="num mt-0.5 text-body text-text">{value}</p>
      {hint ? <p className="mt-0.5 text-caption text-text-faint">{hint}</p> : null}
    </CardTile>
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
