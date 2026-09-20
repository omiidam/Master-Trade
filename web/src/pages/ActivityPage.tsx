import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  BellRing,
  Database,
  Layers,
  ListChecks,
  PlugZap,
  Radio,
  RefreshCw,
  Sigma,
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
import { TabPanel, Tabs } from '../components/Tabs';
import { Tooltip } from '../components/Tooltip';
import {
  AgentActivityFeed,
  BackgroundTaskPanel,
  ConnectionStatus,
  RealtimeNotification,
  RetryState,
  type RetryKind,
} from '../components';
import { Grid, Workspace } from '../app/Workspace';
import { describeUnavailability, type RealtimeUnavailable } from '../realtime/session.js';
import { DEFAULT_SUBSCRIPTION, useRealtimeStore } from '../realtime/store.js';
import {
  ACTIVITY_PREVIEW_NOTICE,
  JOB_PREVIEW_NOTICE,
  REALTIME_PREVIEW_NOTICE,
  mockActivity,
  mockJobs,
  mockNotifications,
  mockRetryingSnapshot,
  summariseJobs,
} from '../mock/realtime';

const TABS = [
  { id: 'stream', label: 'Event stream', icon: <Radio size={14} aria-hidden /> },
  { id: 'tasks', label: 'Background tasks', icon: <ListChecks size={14} aria-hidden /> },
  { id: 'notifications', label: 'Notifications', icon: <BellRing size={14} aria-hidden /> },
  { id: 'connection', label: 'Connection', icon: <PlugZap size={14} aria-hidden /> },
] as const;

/** Human wording for the job kinds the queue defines. */
const KIND_LABELS: Record<string, string> = {
  'training.gradeSession': 'Grade a training session',
  'training.progress': 'Recompute curriculum progress',
  'dataset.process': 'Validate and index a dataset',
  'embedding.generate': 'Generate embeddings',
  'memory.index': 'Index memory records',
  'marketData.ingest': 'Ingest normalized bars',
  'backtest.run': 'Run a backtest (needs approval)',
  'report.generate': 'Render a report',
  'evaluation.scheduled': 'Scheduled invariant evaluation',
  'maintenance.cleanup': 'Purge expired scratch data',
};

/**
 * Activity: the live event stream and the background-task queue.
 *
 * The page's whole design question is "what is real right now?". It answers it in
 * three ways that must agree:
 *
 *   1. the connection banner states the socket's state and its reason, including
 *      how many frames were dropped as stale or unreadable;
 *   2. every panel fed by the stream says `live` or `not live`, and the panels fed
 *      by fixtures say `preview` in the same position;
 *   3. the queue is read from `GET /v1/jobs` under the same session as the socket,
 *      and a queue that cannot be read says why instead of showing an empty list.
 *
 * Nothing here can start work. Cancelling is offered because the server authorizes
 * it and audits it; starting a task is server-side only, so there is no control for
 * it — a UI that could enqueue arbitrary background work would be a much larger
 * capability than this phase grants.
 */
export function ActivityPage() {
  const [tab, setTab] = useState<string>('stream');
  const resolution = useRealtimeStore((state) => state.resolution);
  const state = useRealtimeStore((state) => state.state);
  const snapshot = useRealtimeStore((state) => state.snapshot);
  const feed = useRealtimeStore((state) => state.feed);
  const notifications = useRealtimeStore((state) => state.notifications);
  const jobs = useRealtimeStore((state) => state.jobs);
  const subscribed = useRealtimeStore((state) => state.subscribed);
  const initialize = useRealtimeStore((state) => state.initialize);
  const connect = useRealtimeStore((state) => state.connect);
  const disconnect = useRealtimeStore((state) => state.disconnect);
  const retry = useRealtimeStore((state) => state.retry);
  const refreshJobs = useRealtimeStore((state) => state.refreshJobs);
  const cancelJob = useRealtimeStore((state) => state.cancelJob);
  const dismissNotification = useRealtimeStore((state) => state.dismissNotification);
  const clearFeed = useRealtimeStore((state) => state.clearFeed);
  const subscribe = useRealtimeStore((state) => state.subscribe);

  // Resolve the session, then connect once if there is something to connect to.
  // Opening the stream is the page's purpose; a page that requires two clicks to
  // start showing whether it works would hide the answer.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await initialize();
      if (cancelled) return;
      if (useRealtimeStore.getState().resolution?.status === 'ready') await connect();
    })();
    return () => {
      cancelled = true;
    };
  }, [initialize, connect]);

  const live = state === 'online';
  const unavailable =
    resolution?.status === 'unavailable' ? (resolution as RealtimeUnavailable) : null;
  const previewSummary = summariseJobs(mockJobs);
  const streamSummary = useMemo(() => {
    const oldest = feed[feed.length - 1];
    return {
      delivered: snapshot?.delivered ?? 0,
      dropped: (snapshot?.invalidDropped ?? 0) + (snapshot?.staleDropped ?? 0),
      lastEventAt: oldest?.at ?? null,
    };
  }, [feed, snapshot]);

  const retryKind: RetryKind | null =
    state === 'denied'
      ? 'permission-denied'
      : state === 'reconnecting'
        ? 'retrying'
        : state === 'offline' && unavailable === null && snapshot !== null && snapshot.attempts > 0
          ? 'exhausted'
          : null;

  return (
    <Workspace
      title="Activity"
      description="The realtime event stream and the background-task queue. Events carry a contract type, a sequence, a source and a correlation id; jobs are read from the queue that runs them. Neither surface exists to place or execute anything."
      actions={
        <>
          <ConnectionStatus state={state} detail={snapshot?.detail} compact />
          <Tooltip content="The event stream opens over an authenticated WebSocket on the loopback interface only.">
            <Badge tone="outline" icon={<Radio size={12} aria-hidden />}>
              loopback only
            </Badge>
          </Tooltip>
          {live ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={disconnect}
              leadingIcon={<Ban size={12} aria-hidden />}
            >
              Disconnect
            </Button>
          ) : (
            <Button
              size="sm"
              variant="subtle"
              onClick={() => void connect()}
              disabled={resolution?.status !== 'ready'}
              leadingIcon={<PlugZap size={12} aria-hidden />}
            >
              Connect
            </Button>
          )}
        </>
      }
    >
      <Grid columns={4}>
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-body">Stream</CardTitle>
              <CardDescription>Delivered vs. dropped frames</CardDescription>
            </div>
            <Badge tone={live ? 'success' : 'neutral'}>{live ? 'live' : 'not live'}</Badge>
          </CardHeader>
          <CardContent>
            <span className="num text-[1.5rem] leading-none font-semibold text-text">
              {streamSummary.delivered}
            </span>
            <p className="mt-2 text-caption text-text-faint">
              {streamSummary.dropped} frame(s) dropped — stale or unreadable. A dropped frame is
              counted, never rendered as if it passed validation.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-body">Queue</CardTitle>
              <CardDescription>
                {live ? 'From the running queue' : 'Preview fixture counts'}
              </CardDescription>
            </div>
            <Badge tone="outline" icon={<Database size={12} aria-hidden />}>
              {jobs.summary ? 'queue counts' : 'fixture counts'}
            </Badge>
          </CardHeader>
          <CardContent>
            <span className="num text-[1.5rem] leading-none font-semibold text-text">
              {jobs.summary ? (jobs.jobs.length ?? 0) : previewSummary.total}
            </span>
            <p className="mt-2 text-caption text-text-faint">
              {jobs.summary
                ? `${jobs.summary.running ?? 0} running · ${jobs.summary.queued ?? 0} queued · ${(jobs.summary['dead-letter'] ?? 0) + (jobs.summary.failed ?? 0)} stopped`
                : `${previewSummary.running} running · ${previewSummary.queued} queued · ${previewSummary.attention} needing attention`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-body">Notifications</CardTitle>
              <CardDescription>Server notices and stream warnings</CardDescription>
            </div>
            <Badge tone="outline" icon={<BellRing size={12} aria-hidden />}>
              {notifications.length}
            </Badge>
          </CardHeader>
          <CardContent>
            <span className="num text-[1.5rem] leading-none font-semibold text-text">
              {notifications.filter((entry) => entry.origin === 'client').length}
            </span>
            <p className="mt-2 text-caption text-text-faint">
              Raised by this client about the stream itself — a gap in replay coverage, a refused
              frame, a refused subscription. They are kept because a silent hole is worse.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-body">Subscription</CardTitle>
              <CardDescription>What this client asked to receive</CardDescription>
            </div>
            <Badge tone="outline" icon={<Layers size={12} aria-hidden />}>
              {snapshot?.availableTypes.length ?? 0} available
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="num text-caption text-text">
              {subscribed.length} of {DEFAULT_SUBSCRIPTION.length} default types
            </p>
            <div className="flex flex-wrap gap-1.5">
              {subscribed.slice(0, 6).map((type) => (
                <Badge key={type} tone="neutral">
                  {type}
                </Badge>
              ))}
              {subscribed.length > 6 ? (
                <Badge tone="outline">+{subscribed.length - 6} more</Badge>
              ) : null}
            </div>
            {snapshot && snapshot.availableTypes.length > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  subscribe(
                    snapshot.availableTypes.filter((type) => type !== 'audit.record') as never,
                  )
                }
              >
                Subscribe to everything this role may receive
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </Grid>

      {unavailable ? (
        <ErrorState
          severity="warning"
          title="No live stream in this session"
          description={describeUnavailability(unavailable)}
          code={unavailable.reason.toUpperCase().replace(/-/g, '_')}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => void connect()} disabled>
                Connect
              </Button>
              <span className="text-caption">
                The control stays disabled until a session exists, because an unauthenticated socket
                would be closed by the server anyway.
              </span>
            </div>
          }
        />
      ) : null}

      {retryKind ? (
        <RetryState
          kind={retryKind}
          message={snapshot?.detail ?? mockRetryingSnapshot.detail}
          attempts={snapshot?.attempts ?? mockRetryingSnapshot.attempts}
          maxAttempts={6}
          onRetry={retry}
        />
      ) : null}

      <Tabs
        items={TABS.map((item) => ({ id: item.id, label: item.label, icon: item.icon }))}
        value={tab}
        onValueChange={setTab}
        aria-label="Activity sections"
      >
        <TabPanel value="stream" className="space-y-4">
          <AgentActivityFeed
            entries={live ? feed : mockActivity}
            live={live}
            loading={state === 'connecting' || state === 'authenticating'}
            onClear={live ? clearFeed : undefined}
            {...(live
              ? {}
              : {
                  emptyTitle: 'Nothing has arrived yet',
                  emptyDescription:
                    'Connect to see real entries; the rows below this notice are the labelled preview fixtures.',
                })}
          />

          {!live ? (
            <ErrorState
              severity="info"
              title="Showing captured fixtures"
              description={REALTIME_PREVIEW_NOTICE}
              code="PREVIEW_FIXTURE"
            />
          ) : null}

          <Grid columns={3}>
            <Card>
              <CardHeader>
                <CardTitle className="text-body">Sequence, not arrival order</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                Every event carries a monotonic sequence number. A duplicate or an older event is
                dropped, so a reconnect cannot make the feed run backwards — and the count of
                dropped frames is on screen above.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-body">Internal events never arrive</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                Tool execution detail and audit records are internal: the server refuses to give
                them an audience, so no subscription can ask for them and no payload arrives to be
                hidden.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-body">Unknown types are dropped</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                A payload that fails its contract, or a type this build does not know, is counted
                and refused. Rendering it anyway would mean printing a shape nobody validated.
              </CardContent>
            </Card>
          </Grid>
        </TabPanel>

        <TabPanel value="tasks" className="space-y-4">
          <BackgroundTaskPanel
            jobs={live || jobs.jobs.length > 0 ? jobs.jobs : mockJobs}
            summary={live || jobs.jobs.length > 0 ? jobs.summary : null}
            loading={jobs.loading}
            error={jobs.error}
            errorCode={jobs.errorCode}
            onRefresh={live ? () => refreshJobs() : undefined}
            onCancel={(jobId: string, reason?: string) => cancelJob(jobId, reason)}
            cancelling={jobs.cancelling}
            kindLabels={KIND_LABELS}
            unavailableReason={unavailable ? describeUnavailability(unavailable) : null}
            {...(live || jobs.jobs.length > 0 ? {} : { previewNotice: JOB_PREVIEW_NOTICE })}
          />

          <Section
            title="Lifecycle"
            description="The four transitions the queue defines, and what the UI shows for each."
          >
            <Grid columns={4}>
              {[
                {
                  state: 'Queued → running',
                  text: 'A worker claimed the job and holds a lease; the lease is renewed while it runs.',
                },
                {
                  state: 'Running → completed',
                  text: 'The result is stored and the progress row is left behind to expire.',
                },
                {
                  state: 'Running → failed',
                  text: 'A retryable failure returns to queued with backoff; a non-retryable one stops immediately.',
                },
                {
                  state: 'Queued or running → cancelled',
                  text: 'The status is recorded in the row, so cancellation crosses processes and survives a restart.',
                },
              ].map((item) => (
                <Card key={item.state}>
                  <CardHeader>
                    <CardTitle className="text-body">{item.state}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-caption text-text-muted">{item.text}</CardContent>
                </Card>
              ))}
            </Grid>
          </Section>
        </TabPanel>

        <TabPanel value="notifications" className="space-y-4">
          {notifications.length === 0 ? (
            <EmptyState
              icon={<BellRing size={22} aria-hidden />}
              title="No notices in this session"
              description="Server notifications arrive as `notification` events. Notices this client raises about the stream itself appear here too, labelled as such."
            />
          ) : (
            <ul className="space-y-2">
              {notifications.map((entry) => (
                <li key={entry.id}>
                  <RealtimeNotification notification={entry} onDismiss={dismissNotification} />
                </li>
              ))}
            </ul>
          )}

          <Section
            title="Preview fixtures"
            description="Deterministic samples so the severity levels can be reviewed without a server."
          >
            <ul className="space-y-2">
              {mockNotifications.map((entry) => (
                <li key={entry.id}>
                  <RealtimeNotification notification={{ ...entry, origin: 'server' }} />
                </li>
              ))}
            </ul>
            <p className="text-caption text-text-faint">{ACTIVITY_PREVIEW_NOTICE}</p>
          </Section>
        </TabPanel>

        <TabPanel value="connection" className="space-y-4">
          <ConnectionStatus
            state={state}
            detail={snapshot?.detail}
            attempts={snapshot?.attempts}
            maxAttempts={6}
            reconnects={snapshot?.reconnects}
            delivered={snapshot?.delivered}
            invalidDropped={snapshot?.invalidDropped}
            staleDropped={snapshot?.staleDropped}
          />

          <Grid columns={2}>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="text-body">What a reconnect keeps</CardTitle>
                  <CardDescription>Resume, replay and the honest gap</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-caption text-text-muted">
                <p>
                  The client remembers the highest sequence it delivered and asks the server to
                  replay from there, in the same frame as the token — a client that authenticated
                  first and subscribed second would miss the replay it just asked for.
                </p>
                <p>
                  If the server's buffer no longer covers that point, the client records the gap and
                  says so, instead of continuing from a counter that looks continuous.
                </p>
                {snapshot?.gapDetected ? (
                  <ErrorState
                    severity="warning"
                    title="A replay gap was detected in this session"
                    description="Some events between the delivered sequence and the server's buffer were never seen. The queue and the audit trail are the record of what happened; the feed is not."
                    code="REPLAY_GAP"
                  />
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="text-body">Endpoint</CardTitle>
                  <CardDescription>Where this client is pointed, and with what</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <dl className="space-y-1 text-caption">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-text-faint">Source</dt>
                    <dd className="text-text">
                      {resolution?.status === 'ready' ? resolution.source : 'none'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-text-faint">Socket</dt>
                    <dd className="num truncate text-text">
                      {resolution?.status === 'ready' ? resolution.websocketUrl : 'not configured'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-text-faint">Session</dt>
                    <dd className="text-text">
                      {snapshot?.principalId ??
                        (resolution?.status === 'ready' ? 'not authenticated' : 'none')}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-text-faint">Roles</dt>
                    <dd className="text-text">
                      {snapshot?.roles.length ? snapshot.roles.join(', ') : 'none reported'}
                    </dd>
                  </div>
                </dl>
                <p className="text-caption text-text-faint">
                  The token is never rendered, never logged and never placed in a URL. It goes in
                  the first frame, and only the credentials the shell hands over are used.
                </p>
              </CardContent>
            </Card>
          </Grid>

          <Grid columns={3}>
            <Card>
              <CardHeader>
                <CardTitle className="text-body">Heartbeat</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                The client pings on the server's cadence and treats a missed reply as a failure. A
                socket that is open but silent is not a working stream, and showing “live” for one
                is the failure mode the check exists to prevent.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-body">Backoff, then stop</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                Retries use bounded exponential backoff with jitter. A rejected token, a protocol
                mismatch or a refused subscription is terminal: the state moves to “not permitted”
                and no further attempts are made.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-body">Frame validation</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                Inbound frames are bounded, parsed and checked against the contract registry before
                anything is done with them. A malformed frame is counted and dropped, never
                rendered.
              </CardContent>
            </Card>
          </Grid>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<RefreshCw size={12} aria-hidden />}
              onClick={retry}
              disabled={state === 'connecting' || state === 'authenticating'}
            >
              Retry the stream now
            </Button>
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<Sigma size={12} aria-hidden />}
              onClick={() => void refreshJobs()}
              disabled={resolution?.status !== 'ready'}
            >
              Re-read the queue
            </Button>
            <span className="text-caption text-text-faint">
              Both actions go through the same authenticated session as the stream.
            </span>
          </div>
        </TabPanel>
      </Tabs>
    </Workspace>
  );
}
