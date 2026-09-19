import { useEffect, useState } from 'react';
import {
  Activity,
  BookOpen,
  Clock,
  Info,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/Card';
import { ChartAdapter } from '../components/charts/ChartAdapter';
import { Sparkline } from '../components/charts/Sparkline';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { SkeletonCard } from '../components/Skeleton';
import { TabPanel, Tabs } from '../components/Tabs';
import { Tooltip } from '../components/Tooltip';
import { Grid, Workspace } from '../app/Workspace';
import {
  MOCK_GENERATED_AT,
  mockActivity,
  mockBars,
  mockDashboard,
  mockSeries,
  mockStudyMetrics,
} from '../mock/data';
import { formatRelative, formatTimestamp } from '../lib/format';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
  { id: 'states', label: 'State examples' },
] as const;

export function DashboardPage() {
  const [tab, setTab] = useState<string>('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 900);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Workspace
      title="Training dashboard"
      description="Progress, study metrics and read-only charts. Every figure below is illustrative preview data typed against the backend view models."
      actions={
        <>
          <Badge tone="outline" icon={<ShieldCheck size={12} aria-hidden />}>
            read-only
          </Badge>
          <Tooltip content="Reloads the layout skeleton. No job is queued in this phase.">
            <Button
              variant="secondary"
              leadingIcon={<RefreshCw size={14} aria-hidden />}
              onClick={() => setLoading(true)}
            >
              Refresh view
            </Button>
          </Tooltip>
        </>
      }
    >
      <Grid columns={4}>
        {mockStudyMetrics.map((metric) => (
          <Card key={metric.id}>
            <CardHeader>
              <div>
                <CardTitle className="text-body">{metric.label}</CardTitle>
                <CardDescription>{metric.hint}</CardDescription>
              </div>
              <Badge tone={metric.trend === 'up' ? 'primary' : 'warning'}>{metric.delta}</Badge>
            </CardHeader>
            <CardContent className="flex items-end justify-between gap-3">
              <span className="num text-[1.5rem] leading-none font-semibold text-text">
                {metric.value}
              </span>
              {metric.trend === 'up' ? (
                <span className="text-primary" aria-hidden>
                  <TrendingUp size={16} />
                </span>
              ) : (
                <span className="text-warning" aria-hidden>
                  <TrendingDown size={16} />
                </span>
              )}
            </CardContent>
            <CardFooter className="text-caption text-text-faint">
              <span>vs. previous 30 days</span>
              <Sparkline values={mockSeries.slice(0, 12)} width={72} height={20} />
            </CardFooter>
          </Card>
        ))}
      </Grid>

      <Tabs
        items={TABS.map((item) => ({ id: item.id, label: item.label }))}
        value={tab}
        onValueChange={setTab}
        aria-label="Dashboard sections"
      >
        <TabPanel value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Training equity curve</CardTitle>
                <CardDescription>
                  {mockDashboard.headings[0]} · {mockDashboard.symbol} · {mockDashboard.timeframe}
                </CardDescription>
              </div>
              <Badge tone="info">chart adapter</Badge>
            </CardHeader>
            <CardContent>
              <ChartAdapter
                bars={mockBars}
                symbol={mockDashboard.symbol}
                timeframe={mockDashboard.timeframe}
                provenance={mockDashboard.dataProvenance}
                source="synthetic-generator"
                updatedAt={mockDashboard.lastUpdated}
                height={260}
              />
            </CardContent>
          </Card>

          <Grid columns={2}>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="text-body">Strengths</CardTitle>
                  <CardDescription>{mockDashboard.headings[1]}</CardDescription>
                </div>
                <BookOpen size={16} aria-hidden className="text-text-faint" />
              </CardHeader>
              <CardContent className="space-y-2 text-caption text-text-muted">
                <p>Consistent review habit: 11 consecutive days with a written session.</p>
                <p>Risk-first framing appears in every journal entry this month.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="text-body">Watch list</CardTitle>
                  <CardDescription>{mockDashboard.headings[2]}</CardDescription>
                </div>
                <ShieldCheck size={16} aria-hidden className="text-text-faint" />
              </CardHeader>
              <CardContent className="space-y-2 text-caption text-text-muted">
                <p>Exam average dipped on the second risk module attempt.</p>
                <p>One journal entry missing an explicit invalidation level.</p>
              </CardContent>
            </Card>
          </Grid>

          <ErrorState
            severity="info"
            title="Preview data"
            description="This dashboard is not connected to the backend. Progress, metrics and charts are illustrative and typed against the final view models."
            code="PREVIEW_NOTICE"
            action={
              <span className="inline-flex items-center gap-1.5 text-caption">
                <Info size={13} aria-hidden />
                Real figures will come from deterministic backend tools, never from the model.
              </span>
            }
          />
        </TabPanel>

        <TabPanel value="activity" className="space-y-3">
          {loading ? (
            <Grid columns={2}>
              <SkeletonCard rows={4} />
              <SkeletonCard rows={4} />
            </Grid>
          ) : (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="text-body">Recent agent and system events</CardTitle>
                  <CardDescription>
                    The shape of the activity log: correlation id, actor, event, evidence
                  </CardDescription>
                </div>
                <Badge tone="neutral">mock</Badge>
              </CardHeader>
              <CardContent className="divide-y divide-border">
                {mockActivity.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="mt-0.5 text-text-faint" aria-hidden>
                      <Activity size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-body text-text">{entry.event}</span>
                        <Badge tone={entry.actor === 'agent' ? 'ai' : 'neutral'}>
                          {entry.actor}
                        </Badge>
                        <span className="num text-caption text-text-faint">
                          {entry.correlationId}
                        </span>
                      </div>
                      <p className="mt-0.5 text-caption text-text-muted">{entry.detail}</p>
                    </div>
                    <span className="num shrink-0 text-caption text-text-faint">
                      {formatTimestamp(entry.at)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabPanel>

        <TabPanel value="states" className="space-y-4">
          <Grid columns={2}>
            <Card>
              <CardHeader>
                <CardTitle className="text-body">Loading state</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <SkeletonCard rows={3} />
                <p className="text-caption text-text-faint">
                  Skeletons are used while a query is in flight; the pulse respects
                  prefers-reduced-motion.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-body">Empty state</CardTitle>
              </CardHeader>
              <CardContent>
                <EmptyState
                  icon={<Clock size={22} aria-hidden />}
                  title="No sessions recorded yet"
                  description="Completed lessons and graded exams will appear here as soon as the persistence slice lands."
                  hint="Empty is a valid state — it is stated, not hidden."
                />
              </CardContent>
            </Card>
          </Grid>
          <ErrorState
            severity="warning"
            title="Scheduled evaluation has not run"
            description="The evaluation harness is in place; the scheduler that enqueues it arrives with the durable job queue."
            code="PROVIDER_UNAVAILABLE"
            action={
              <span className="text-caption">
                Failure surfaces report a typed error code, never a raw provider payload.
              </span>
            }
          />
        </TabPanel>
      </Tabs>

      <p className="text-caption text-text-faint">
        Preview generated {formatRelative(MOCK_GENERATED_AT)} · {formatTimestamp(MOCK_GENERATED_AT)}
      </p>
    </Workspace>
  );
}
