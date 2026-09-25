/**
 * Realtime + background-job state (Zustand).
 *
 * This is the only place where the event stream, the job API and the UI meet, and
 * it holds one rule: **state is either real or explicitly unavailable.** When there
 * is no session or no sidecar, the store reports `unavailable` with a reason and
 * never substitutes fixtures — the preview fixtures live in `web/src/mock/realtime.ts`
 * and are rendered by the page only inside panels that label them.
 *
 * What lives here:
 *
 *   - the connection (`RealtimeClient`) and its snapshot;
 *   - a bounded feed derived from delivered events, so the UI has something to
 *     render without re-implementing event handling per component;
 *   - the job list from `GET /v1/jobs`, refreshed on demand and on `job.status`
 *     events (a status event is a hint to refresh, not the source of truth — the
 *     queue's own record is);
 *   - notifications, including the ones the *client* produces (a dropped frame, a
 *     replay gap), because a silently-discarded message is a lie by omission.
 */

import { create } from 'zustand';
import type { RealtimeEvent, RealtimeEventType } from '@shared/realtime/events';
import { ApiClient, ApiError, type JobStatus } from '../api/client.js';
import { inDesktopShell, shellBridge, apiHandshake } from '../desktop/bridge.js';
import type { JobView } from '@shared/jobs/service';
import {
  RealtimeClient,
  type ConnectionState,
  type RealtimeClientSnapshot,
  type SocketFactory,
} from './client.js';
import { resolveRealtimeSession, SESSION_TOKEN_KEY, type SessionResolution } from './session.js';
import { msg } from '../i18n/index.js';

export type { JobView } from '@shared/jobs/service';

/** How many feed entries and notifications the store keeps. Bounded on purpose. */
export const FEED_LIMIT = 200;
export const NOTIFICATION_LIMIT = 50;

export interface FeedEntry {
  id: string;
  /** Contract type, e.g. `agent.status`. */
  type: string;
  source: string;
  at: string;
  /** One line, derived from the payload by `describeEvent`. */
  text: string;
  detail?: string;
  correlationId: string | null;
  /** Provenance of the underlying data when the event states one. */
  provenance?: string;
  seq: number;
}

export interface NotificationEntry {
  id: string;
  level: 'info' | 'warning' | 'danger';
  title: string;
  body: string;
  at: string;
  /** Where it came from: the server, or this client's own validation. */
  origin: 'server' | 'client';
}

export interface JobsState {
  jobs: JobView[];
  summary: Record<string, number> | null;
  loading: boolean;
  error: string | null;
  /** Set when the job list could not be read and the reason is not retryable. */
  errorCode: string | null;
  cancelling: Record<string, boolean>;
}

export interface RealtimeStoreState {
  /** Null until `connect()` has resolved the session. */
  resolution: SessionResolution | null;
  snapshot: RealtimeClientSnapshot | null;
  state: ConnectionState | 'initialising';
  feed: FeedEntry[];
  notifications: NotificationEntry[];
  jobs: JobsState;
  /** Types this client asks for; user-editable in the UI. */
  subscribed: RealtimeEventType[];
  initialize: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => void;
  retry: () => void;
  subscribe: (types: readonly RealtimeEventType[]) => void;
  refreshJobs: (filter?: { status?: JobStatus; kind?: string }) => Promise<void>;
  cancelJob: (jobId: string, reason?: string) => Promise<void>;
  dismissNotification: (id: string) => void;
  clearFeed: () => void;
}

/** What the page asks for by default: the user-facing surfaces, nothing internal. */
export const DEFAULT_SUBSCRIPTION: RealtimeEventType[] = [
  'agent.status',
  'agent.message',
  'training.progress',
  'exam.progress',
  'backtest.progress',
  'research.update',
  'job.status',
  'notification',
  'system.status',
  'system.error',
];

let client: RealtimeClient | null = null;
let api: ApiClient | null = null;

/** Turn a validated event into one line a human can read. */
export function describeEvent(event: RealtimeEvent): { text: string; detail?: string } {
  const payload = event.payload as Record<string, unknown>;
  switch (event.type) {
    case 'agent.status':
      return {
        text: `Agent: ${String(payload.previous)} → ${String(payload.state)}`,
        ...(typeof payload.reason === 'string' ? { detail: payload.reason } : {}),
      };
    case 'agent.message': {
      const statements = Array.isArray(payload.statements) ? payload.statements : [];
      const headline = statements[0] as { text?: unknown } | undefined;
      const uncertainty = Array.isArray(payload.uncertainty) ? payload.uncertainty.length : 0;
      return {
        text: typeof headline?.text === 'string' ? headline.text : 'Structured answer received.',
        detail: `${statements.length} statement(s), ${uncertainty} uncertainty note(s). Chain-of-thought is never sent.`,
      };
    }
    case 'job.status': {
      const progress = payload.progress as { current?: number; total?: number } | undefined;
      const where =
        progress && typeof progress.current === 'number' && typeof progress.total === 'number'
          ? ` (${progress.current}/${progress.total})`
          : '';
      const detail = typeof payload.error === 'string' ? payload.error : undefined;
      return {
        text: `${String(payload.kind)} → ${String(payload.status)}${where}`,
        ...(detail === undefined ? {} : { detail }),
      };
    }
    case 'training.progress':
      return {
        text: `Lesson ${String(payload.lessonId)}: ${String(payload.completed)}/${String(payload.total)}`,
      };
    case 'exam.progress':
      return {
        text: `Attempt ${String(payload.attemptId)}: question ${String(payload.questionIndex)} — ${String(payload.status)}`,
      };
    case 'backtest.progress':
      return {
        text: `Experiment ${String(payload.experimentId)} → ${String(payload.status)}`,
        detail: msg('store.aBacktestVerdictIsNeverARuleActivation'),
      };
    case 'research.update':
      return {
        text: `${String(payload.experimentId)} → ${String(payload.status)}`,
        detail: `metrics: ${String(payload.metricsSource)} · adoption: ${String(payload.adoption)}`,
      };
    case 'marketdata.tick':
      return {
        text: `${String(payload.symbol)} ${String(payload.timeframe)} close ${String(payload.close)}`,
        detail: `provenance: ${String(payload.provenance)}`,
      };
    case 'notification':
      return { text: String(payload.title), detail: String(payload.body) };
    case 'system.status':
      return {
        text: `${String(payload.component)}: ${String(payload.status)}`,
        detail: String(payload.detail),
      };
    case 'system.error':
      return {
        text: `${String(payload.code)} in ${String(payload.routeId)}`,
        detail: String(payload.message),
      };
    default:
      // Internal types cannot reach a client; if one ever did, it is not rendered as
      // if it were user-facing content.
      return { text: `${event.type} received.` };
  }
}

function entryFor(event: RealtimeEvent): FeedEntry {
  const described = describeEvent(event);
  return {
    id: event.id,
    type: event.type,
    source: event.source.kind,
    at: event.at,
    text: described.text,
    ...(described.detail === undefined ? {} : { detail: described.detail }),
    correlationId: event.correlationId ?? null,
    ...(event.source.provenance === undefined ? {} : { provenance: event.source.provenance }),
    seq: event.seq,
  };
}

/** A server notification, or one this client raised about the stream itself. */
function notificationFrom(event: RealtimeEvent): NotificationEntry | null {
  if (event.type !== 'notification') return null;
  const payload = event.payload as { level?: string; title?: string; body?: string };
  if (typeof payload.title !== 'string') return null;
  return {
    id: event.id,
    level:
      payload.level === 'warning' || payload.level === 'danger'
        ? (payload.level as 'warning' | 'danger')
        : 'info',
    title: payload.title,
    body: typeof payload.body === 'string' ? payload.body : '',
    at: event.at,
    origin: 'server',
  };
}

function pushBounded<T>(list: T[], entry: T, limit: number): T[] {
  const next = [entry, ...list];
  return next.length > limit ? next.slice(0, limit) : next;
}

export const useRealtimeStore = create<RealtimeStoreState>((set, get) => ({
  resolution: null,
  snapshot: null,
  state: 'initialising',
  feed: [],
  notifications: [],
  subscribed: [...DEFAULT_SUBSCRIPTION],
  jobs: { jobs: [], summary: null, loading: false, error: null, errorCode: null, cancelling: {} },

  /**
   * Resolve the session, then build the client. Called once by the page's mount
   * effect. Nothing here guesses an endpoint or invents a credential.
   */
  initialize: async () => {
    if (get().resolution !== null) return;
    const resolution = await resolveRealtimeSession({
      inShell: inDesktopShell(),
      handshake: apiHandshake,
      readSecret: async (key) => {
        try {
          return (await shellBridge().secureStore.get(key)) ?? null;
        } catch {
          return null;
        }
      },
      devOverride: {
        apiBaseUrl: import.meta.env.VITE_MT_API_URL as string | undefined,
        token: import.meta.env.VITE_MT_SESSION_TOKEN as string | undefined,
      },
    });

    set({ resolution });
    if (resolution.status === 'unavailable') {
      set({
        state: 'offline',
        snapshot: null,
        notifications: pushBounded(
          get().notifications,
          {
            id: `client_unavailable_${Date.now()}`,
            level: 'warning',
            get title(): string {
              return msg('store.noLiveEventStream');
            },
            body: `${resolution.detail} ${resolution.action}`,
            at: new Date().toISOString(),
            origin: 'client',
          },
          NOTIFICATION_LIMIT,
        ),
      });
      return;
    }

    api = new ApiClient({
      baseUrl: resolution.apiBaseUrl,
      token: resolution.token,
      shellToken: resolution.shellToken,
    });

    const factory: SocketFactory = {
      create: (url, protocols) => {
        const socket = new WebSocket(url, protocols);
        return {
          send: (data) => socket.send(data),
          close: (code, reason) => socket.close(code, reason),
          set onopen(handler: (() => void) | null) {
            socket.onopen = handler === null ? null : () => handler();
          },
          set onmessage(handler: ((data: string) => void) | null) {
            socket.onmessage =
              handler === null
                ? null
                : (message: MessageEvent) => handler(String(message.data ?? ''));
          },
          set onclose(handler: ((code: number, reason: string) => void) | null) {
            socket.onclose =
              handler === null
                ? null
                : (event: CloseEvent) =>
                    handler(Number(event.code ?? 1006), String(event.reason ?? ''));
          },
          set onerror(handler: ((message: string) => void) | null) {
            socket.onerror =
              handler === null ? null : () => handler('The socket reported an error.');
          },
        };
      },
    };

    client = new RealtimeClient({
      url: resolution.websocketUrl,
      token: resolution.token,
      socketFactory: factory,
      types: get().subscribed,
      onEvent: (event) => {
        const state = get();
        set({ feed: pushBounded(state.feed, entryFor(event), FEED_LIMIT) });
        const notification = notificationFrom(event);
        if (notification) {
          set({
            notifications: pushBounded(get().notifications, notification, NOTIFICATION_LIMIT),
          });
        }
        // A status change is a reason to re-read the queue's own record rather than
        // trusting the event to be the whole truth.
        if (event.type === 'job.status') void get().refreshJobs();
      },
      onStateChange: (_state, snapshot) => set({ state: snapshot.state, snapshot }),
      onNotice: (notice) =>
        set({
          notifications: pushBounded(
            get().notifications,
            {
              id: `client_notice_${notice.at}_${notice.message.slice(0, 24)}`,
              level: notice.level,
              get title(): string {
                return msg('activityPage.eventStream');
              },
              body: notice.message,
              at: notice.at,
              origin: 'client',
            },
            NOTIFICATION_LIMIT,
          ),
        }),
      onProtocolError: (error) =>
        set({
          notifications: pushBounded(
            get().notifications,
            {
              id: `client_error_${error.code}_${error.correlationId ?? ''}`,
              level: 'warning',
              get title(): string {
                return msg('store.theServerRefusedAnAction');
              },
              body: `${error.code}: ${error.message}`,
              at: new Date().toISOString(),
              origin: 'client',
            },
            NOTIFICATION_LIMIT,
          ),
        }),
    });
    set({ state: 'idle', snapshot: client.snapshot() });
  },

  connect: async () => {
    if (get().resolution === null) await get().initialize();
    const resolution = get().resolution;
    if (!resolution || resolution.status !== 'ready') return;
    if (!client) return;
    client.start();
    set({ state: client.stateName(), snapshot: client.snapshot() });
    // The event stream and the job list come from the same authenticated session,
    // so opening the stream is also the moment the list is worth reading.
    await get().refreshJobs();
  },

  disconnect: () => {
    client?.stop();
    set({ state: client?.stateName() ?? 'offline', snapshot: client?.snapshot() ?? null });
  },

  retry: () => {
    if (!client) {
      void get()
        .initialize()
        .then(() => get().connect());
      return;
    }
    client.retryNow();
    set({ state: client.stateName(), snapshot: client.snapshot() });
  },

  subscribe: (types) => {
    client?.setSubscription(types);
    set({ subscribed: [...types], snapshot: client?.snapshot() ?? null });
  },

  refreshJobs: async (filter = {}) => {
    if (!api) {
      set({
        jobs: {
          ...get().jobs,
          loading: false,
          get error(): string {
            return msg('store.noLocalAPISessionSoTheQueueCannot');
          },
          errorCode: 'UNAUTHENTICATED',
        },
      });
      return;
    }
    set({ jobs: { ...get().jobs, loading: true, error: null, errorCode: null } });
    try {
      const data = await api.listJobs(filter);
      set({
        jobs: {
          jobs: data.jobs,
          summary: data.summary ?? null,
          loading: false,
          error: null,
          errorCode: null,
          cancelling: get().jobs.cancelling,
        },
      });
    } catch (error) {
      const described =
        error instanceof ApiError
          ? { message: error.describe(), code: error.code as string }
          : {
              get message(): string {
                return msg('store.theJobListCouldNotBeRead');
              },
              code: 'INTERNAL',
            };
      set({
        jobs: {
          ...get().jobs,
          loading: false,
          ...described,
          error: described.message,
          errorCode: described.code,
        },
      });
    }
  },

  cancelJob: async (jobId, reason) => {
    if (!api) return;
    set({ jobs: { ...get().jobs, cancelling: { ...get().jobs.cancelling, [jobId]: true } } });
    try {
      const updated = await api.cancelJob(jobId, reason);
      set({
        jobs: {
          ...get().jobs,
          cancelling: { ...get().jobs.cancelling, [jobId]: false },
          // The server's answer is the state, not an optimistic guess: a refusal must
          // not look like a cancellation.
          jobs: get().jobs.jobs.map((job) => (job.id === updated.id ? updated : job)),
          error: null,
          errorCode: null,
        },
      });
    } catch (error) {
      const described =
        error instanceof ApiError
          ? { message: error.describe(), code: error.code as string }
          : {
              get message(): string {
                return msg('store.theJobCouldNotBeCancelled');
              },
              code: 'INTERNAL',
            };
      set({
        jobs: {
          ...get().jobs,
          cancelling: { ...get().jobs.cancelling, [jobId]: false },
          error: described.message,
          errorCode: described.code,
        },
      });
    }
  },

  dismissNotification: (id) =>
    set({ notifications: get().notifications.filter((entry) => entry.id !== id) }),

  clearFeed: () => set({ feed: [] }),
}));

export { SESSION_TOKEN_KEY };
