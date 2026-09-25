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
  activityPreviewNotice,
  jobPreviewNotice,
  previewNotice,
  mockActivity,
  mockJobs,
  mockNotifications,
  mockRetryingSnapshot,
  summariseJobs,
} from '../mock/realtime';
import { msg, liveLabels } from '../i18n/index.js';

const TABS = [
  {
    id: 'stream',
    get label(): string {
      return msg('activityPage.eventStream');
    },
    icon: <Radio size={14} aria-hidden />,
  },
  {
    id: 'tasks',
    get label(): string {
      return msg('realtime.backgroundTasks');
    },
    icon: <ListChecks size={14} aria-hidden />,
  },
  {
    id: 'notifications',
    get label(): string {
      return msg('ui.notifications');
    },
    icon: <BellRing size={14} aria-hidden />,
  },
  {
    id: 'connection',
    get label(): string {
      return msg('activityPage.connection');
    },
    icon: <PlugZap size={14} aria-hidden />,
  },
] as const;

/** Human wording for the job kinds the queue defines. */
const KIND_LABELS: Record<string, string> = liveLabels({
  'training.gradeSession': 'activity.kind.training.gradeSession',
  'training.progress': 'activity.kind.training.progress',
  'dataset.process': 'activity.kind.dataset.process',
  'embedding.generate': 'activity.kind.embedding.generate',
  'memory.index': 'activity.kind.memory.index',
  'marketData.ingest': 'activity.kind.marketData.ingest',
  'backtest.run': 'activity.kind.backtest.run',
  'report.generate': 'activity.kind.report.generate',
  'evaluation.scheduled': 'activity.kind.evaluation.scheduled',
  'maintenance.cleanup': 'activity.kind.maintenance.cleanup',
});

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
      title={msg('realtime.activity')}
      description={msg('activityPage.theRealtimeEventStreamAndTheBackgroundTaskQueue')}
      actions={
        <>
          <ConnectionStatus state={state} detail={snapshot?.detail} compact />
          <Tooltip content={msg('activityPage.theEventStreamOpensOverAnAuthenticatedWebSocket')}>
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
        <Card surface="data">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('activity.stream')}</CardTitle>
              <CardDescription>{msg('activity.deliveredVsDroppedFrames')}</CardDescription>
            </div>
            <Badge tone={live ? 'success' : 'neutral'}>{live ? 'live' : 'not live'}</Badge>
          </CardHeader>
          <CardContent>
            <span className="num text-metric text-text">{streamSummary.delivered}</span>
            <p className="mt-2 text-caption text-text-faint">
              {streamSummary.dropped} {msg('activity.frameSDroppedStaleOrUnreadable')}
            </p>
          </CardContent>
        </Card>

        <Card surface="data">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('activity.queue')}</CardTitle>
              <CardDescription>
                {live ? 'From the running queue' : 'Preview fixture counts'}
              </CardDescription>
            </div>
            <Badge tone="outline" icon={<Database size={12} aria-hidden />}>
              {jobs.summary ? 'queue counts' : 'fixture counts'}
            </Badge>
          </CardHeader>
          <CardContent>
            <span className="num text-metric text-text">
              {jobs.summary ? (jobs.jobs.length ?? 0) : previewSummary.total}
            </span>
            <p className="mt-2 text-caption text-text-faint">
              {jobs.summary
                ? `${jobs.summary.running ?? 0} running · ${jobs.summary.queued ?? 0} queued · ${(jobs.summary['dead-letter'] ?? 0) + (jobs.summary.failed ?? 0)} stopped`
                : `${previewSummary.running} running · ${previewSummary.queued} queued · ${previewSummary.attention} needing attention`}
            </p>
          </CardContent>
        </Card>

        <Card surface="data">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('ui.notifications')}</CardTitle>
              <CardDescription>{msg('activity.serverNoticesAndStreamWarnings')}</CardDescription>
            </div>
            <Badge tone="outline" icon={<BellRing size={12} aria-hidden />}>
              {notifications.length}
            </Badge>
          </CardHeader>
          <CardContent>
            <span className="num text-metric text-text">
              {notifications.filter((entry) => entry.origin === 'client').length}
            </span>
            <p className="mt-2 text-caption text-text-faint">
              {msg('activity.raisedByThisClientAboutThe')}
            </p>
          </CardContent>
        </Card>

        <Card surface="data">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('activity.subscription')}</CardTitle>
              <CardDescription>{msg('activity.whatThisClientAskedToReceive')}</CardDescription>
            </div>
            <Badge tone="outline" icon={<Layers size={12} aria-hidden />}>
              {snapshot?.availableTypes.length ?? 0} {msg('activity.available')}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="num text-caption text-text">
              {subscribed.length} {msg('exams.of')} {DEFAULT_SUBSCRIPTION.length}{' '}
              {msg('activity.defaultTypes')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {subscribed.slice(0, 6).map((type) => (
                <Badge key={type} tone="neutral">
                  {type}
                </Badge>
              ))}
              {subscribed.length > 6 ? (
                <Badge tone="outline">
                  +{subscribed.length - 6} {msg('activity.more')}
                </Badge>
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
                {msg('activity.subscribeToEverythingThisRoleMay')}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </Grid>

      {unavailable ? (
        <ErrorState
          severity="warning"
          title={msg('activity.noLiveStreamInThisSession')}
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
        aria-label={msg('activity.activitySections')}
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
                  emptyTitle: msg('activityPage.nothingHasArrivedYet'),
                  emptyDescription: msg('activityPage.connectToSeeRealEntriesTheRowsBelow'),
                })}
          />

          {!live ? (
            <ErrorState
              severity="info"
              title={msg('activity.showingCapturedFixtures')}
              description={previewNotice()}
              code="PREVIEW_FIXTURE"
            />
          ) : null}

          <Grid columns={3}>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">
                  {msg('activity.sequenceNotArrivalOrder')}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                {msg('activity.everyEventCarriesAMonotonicSequence')}
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">
                  {msg('activity.internalEventsNeverArrive')}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                {msg('activity.toolExecutionDetailAndAuditRecords')}
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">
                  {msg('activity.unknownTypesAreDropped')}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                {msg('activity.aPayloadThatFailsItsContract')}
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
            {...(live || jobs.jobs.length > 0 ? {} : { previewNotice: jobPreviewNotice() })}
          />

          <Section
            title={msg('activity.lifecycle')}
            description={msg('activityPage.theFourTransitionsTheQueueDefinesAndWhat')}
          >
            <Grid columns={4}>
              {[
                {
                  state: 'Queued → running',
                  text: msg('activityPage.aWorkerClaimedTheJobAndHoldsA'),
                },
                {
                  state: 'Running → completed',
                  text: msg('activityPage.theResultIsStoredAndTheProgressRow'),
                },
                {
                  state: 'Running → failed',
                  text: msg('activityPage.aRetryableFailureReturnsToQueuedWithBackoff'),
                },
                {
                  state: 'Queued or running → cancelled',
                  text: msg('activityPage.theStatusIsRecordedInTheRowSo'),
                },
              ].map((item) => (
                <Card surface="utility" key={item.state}>
                  <CardHeader divider>
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
              title={msg('activity.noNoticesInThisSession')}
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
            title={msg('activity.previewFixtures')}
            description={msg('activityPage.deterministicSamplesSoTheSeverityLevelsCanBe')}
          >
            <ul className="space-y-2">
              {mockNotifications.map((entry) => (
                <li key={entry.id}>
                  <RealtimeNotification notification={{ ...entry, origin: 'server' }} />
                </li>
              ))}
            </ul>
            <p className="text-caption text-text-faint">{activityPreviewNotice()}</p>
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
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('activity.whatAReconnectKeeps')}</CardTitle>
                  <CardDescription>{msg('activity.resumeReplayAndTheHonestGap')}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-caption text-text-muted">
                <p>{msg('activity.theClientRemembersTheHighestSequence')}</p>
                <p>{msg('activity.ifTheServerSBufferNo')}</p>
                {snapshot?.gapDetected ? (
                  <ErrorState
                    severity="warning"
                    title={msg('activity.aReplayGapWasDetectedIn')}
                    description={msg('activityPage.someEventsBetweenTheDeliveredSequenceAndThe')}
                    code="REPLAY_GAP"
                  />
                ) : null}
              </CardContent>
            </Card>

            <Card surface="utility">
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('activity.endpoint')}</CardTitle>
                  <CardDescription>{msg('activity.whereThisClientIsPointedAnd')}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <dl className="space-y-1 text-caption">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-text-faint">{msg('activity.source')}</dt>
                    <dd className="text-text">
                      {resolution?.status === 'ready' ? resolution.source : 'none'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-text-faint">{msg('activity.socket')}</dt>
                    <dd className="num truncate text-text">
                      {resolution?.status === 'ready' ? resolution.websocketUrl : 'not configured'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-text-faint">{msg('activity.session')}</dt>
                    <dd className="text-text">
                      {snapshot?.principalId ??
                        (resolution?.status === 'ready' ? 'not authenticated' : 'none')}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-text-faint">{msg('activity.roles')}</dt>
                    <dd className="text-text">
                      {snapshot?.roles.length ? snapshot.roles.join(', ') : 'none reported'}
                    </dd>
                  </div>
                </dl>
                <p className="text-caption text-text-faint">
                  {msg('activity.theTokenIsNeverRenderedNever')}
                </p>
              </CardContent>
            </Card>
          </Grid>

          <Grid columns={3}>
            <Card surface="utility">
              <CardHeader divider>
                <CardTitle className="text-body">{msg('activity.heartbeat')}</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                {msg('activity.theClientPingsOnTheServer')}
              </CardContent>
            </Card>
            <Card surface="utility">
              <CardHeader divider>
                <CardTitle className="text-body">{msg('activity.backoffThenStop')}</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                {msg('activity.retriesUseBoundedExponentialBackoffWith')}
              </CardContent>
            </Card>
            <Card surface="utility">
              <CardHeader divider>
                <CardTitle className="text-body">{msg('activity.frameValidation')}</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                {msg('activity.inboundFramesAreBoundedParsedAnd')}
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
              {msg('activity.retryTheStreamNow')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<Sigma size={12} aria-hidden />}
              onClick={() => void refreshJobs()}
              disabled={resolution?.status !== 'ready'}
            >
              {msg('activity.reReadTheQueue')}
            </Button>
            <span className="text-caption text-text-faint">
              {msg('activity.bothActionsGoThroughTheSame')}
            </span>
          </div>
        </TabPanel>
      </Tabs>
    </Workspace>
  );
}
