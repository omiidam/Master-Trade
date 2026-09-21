/**
 * Concrete health checks.
 *
 * The critical checks exist to prove the *safety* invariants are still true at
 * runtime, not only in tests: safe configuration, a catalogue with no trade
 * capability, side-effect-free tools, policy-compliant instructions, and a
 * lifecycle that is in a legal state.
 *
 * The non-critical checks report the honest state of the phase: no database, no
 * hosted model provider, no market-data provider and no persistent file storage
 * are wired yet, so readiness is expected to be `degraded` — which is different
 * from, and much better than, claiming `ok`.
 */

import type { AppConfig } from '../core/config.js';
import { assertNoHardlineOperations } from '../../packages/shared/src/auth/model.js';
import { assertSafeConfig } from '../core/config.js';
import { loadInstructions } from '../instructions/loader.js';
import { MODEL_PRICES } from '../llm/pricing.js';
import type { JobQueue } from '../../packages/shared/src/jobs/queue.js';
import type { JobWorkerPool } from '../jobs/worker.js';
import type { RealtimeHub } from '../realtime/hub.js';
import type { EventBus } from '../../packages/shared/src/realtime/events.js';
import type { SessionService } from '../auth/sessions.js';
import type { AgentService } from '../agent/service.js';
import { defaultToolRegistry } from '../../packages/trading-engine/src/index.js';
import { assertApiCatalogue } from '../../packages/shared/src/api/contracts.js';
import { check, type HealthCheck } from './health.js';
import { databaseStatus } from '../db/index.js';

export interface HealthCheckDeps {
  config: AppConfig;
  sessions: SessionService;
  jobs: JobQueue;
  workers: JobWorkerPool;
  realtime: RealtimeHub;
  /** Store identity and durability, reported rather than assumed. */
  jobStoreKind: string;
  durableJobs: boolean;
  /** True when a repository bundle exists, so a profile can actually be stored. */
  profileStore: boolean;
  eventBus: EventBus;
  agent: AgentService;
  /** Provider ids registered with the LLM gateway (usually just 'scripted'). */
  llmProviders: readonly string[];
}

export function defaultHealthChecks(deps: HealthCheckDeps): HealthCheck[] {
  const { config } = deps;

  return [
    check('config.safety', true, () => {
      assertSafeConfig(config);
      return {
        status: 'ok',
        detail: `mode=${config.mode}; host=${config.api.host}; redactSecrets=true; shellToken=${
          config.api.shellToken === null ? 'not required' : 'required'
        }`,
      };
    }),

    check('permissions.catalogue', true, () => {
      assertNoHardlineOperations();
      assertApiCatalogue();
      return {
        status: 'ok',
        detail:
          'No broker/execution operation exists; every catalogue route is versioned under /v1.',
      };
    }),

    check('tools.registry', true, () => {
      const tools = defaultToolRegistry().list();
      const withSideEffects = tools.filter((tool) => tool.descriptor.semantics.hasSideEffects);
      if (withSideEffects.length > 0) {
        return {
          status: 'fail',
          detail: `Side-effecting tools registered: ${withSideEffects
            .map((tool) => tool.descriptor.name)
            .join(', ')}`,
        };
      }
      return {
        status: 'ok',
        detail: `${tools.length} deterministic tools, none with side effects.`,
      };
    }),

    check('instructions.policy', true, () => {
      const set = loadInstructions();
      return {
        status: 'ok',
        detail: set.modules.map((module) => `${module.id}@${module.version}`).join(', '),
      };
    }),

    check('agent.lifecycle', true, () => {
      const state = deps.agent.state();
      const known = ['IDLE', 'LOADING', 'READY', 'RUNNING', 'RESPONDING', 'BLOCKED'];
      if (!known.includes(state)) {
        return { status: 'fail', detail: `Agent reported an unknown state: ${state}` };
      }
      if (state === 'BLOCKED') {
        return { status: 'degraded', detail: 'Agent lifecycle is BLOCKED (a run was refused).' };
      }
      return { status: 'ok', detail: `state=${state}; model=${deps.agent.modelLabel()}` };
    }),

    check('sessions.store', false, () => ({
      status: 'ok',
      detail: `${deps.sessions.activeCount()} active session(s).`,
    })),

    check('jobs.queue', false, () => {
      // "Durable" is the difference between "a restart loses queued work" and not,
      // so it is stated rather than implied. The counts come from the store, which
      // is the same source the queue view reads.
      const detail = `${deps.jobStoreKind} store (${deps.durableJobs ? 'survives restart' : 'in-process only: queued work is lost on restart'})`;
      return { status: deps.durableJobs ? 'ok' : 'degraded', detail };
    }),

    check('jobs.workers', false, () => {
      const snapshot = deps.workers.snapshot();
      if (!snapshot.started) {
        return {
          status: 'degraded',
          detail:
            'Worker loop is not started in this process; the queue accepts work and this process does not execute it.',
        };
      }
      return {
        status: 'ok',
        detail: `ticks=${snapshot.ticks} claimed=${snapshot.claimed} inFlight=${snapshot.inFlight} reclaimed=${snapshot.reclaimed}`,
      };
    }),

    check('realtime.bus', false, () => ({
      status: 'ok',
      detail: `Event bus ready (${deps.eventBus.subscriberCount()} subscriber(s), lastSeq=${deps.eventBus.lastSeq()}, dropped=${deps.eventBus.droppedCount()}).`,
    })),

    check('realtime.transport', false, () => {
      const connections = deps.realtime.connectionCount();
      const limits = deps.realtime.limits();
      return {
        status: 'ok',
        detail: `WebSocket mounted at ${config.realtime.path}: ${connections}/${limits.maxConnections} connection(s), authenticated subscriptions only (deny-by-default per event contract).`,
      };
    }),

    check('database.sqlite', false, () => {
      // Phase 3.4 wired the schema, migrations and repositories, but the server
      // does not open a database handle yet: readiness reports what is actually
      // true (driver availability) rather than claiming a connection it has not
      // made.
      const status = databaseStatus(config);
      return {
        status: status.driverAvailable ? 'degraded' : 'fail',
        detail: `${status.detail}. Schema, migrations and repositories are implemented; the server does not open a handle in this phase.`,
      };
    }),

    check('profile.store', false, () => {
      if (!deps.profileStore) {
        return {
          status: 'degraded',
          detail:
            'No repository bundle is configured, so the profile and trading context cannot be read or stored: the routes answer PROVIDER_UNAVAILABLE rather than keeping an in-memory copy that a restart would lose.',
        };
      }
      return {
        status: 'ok',
        detail:
          'Trading context versions are append-only: a change appends n+1 and no earlier version is rewritten.',
      };
    }),

    check('storage.files', false, () => ({
      status: 'degraded',
      detail: `Root ${config.storage.root}; only the validating in-memory adapter exists, so nothing persists yet.`,
    })),

    check('llm.providers', false, () => {
      const registered = [...deps.llmProviders];
      const hosted = registered.filter((id) => id !== 'scripted');
      const priced = `Cost is derived from our own price table (${MODEL_PRICES.length} model rows); a model without a row cannot be budgeted and is refused.`;
      if (hosted.length > 0) {
        return {
          status: 'ok',
          detail: `Providers registered: ${registered.join(', ')}. ${priced}`,
        };
      }
      return {
        status: 'degraded',
        detail: `Only the offline scripted adapter is registered (${registered.join(', ') || 'none'}): openai, anthropic and local OpenAI-compatible adapters exist but none is configured or connected. ${priced}`,
      };
    }),

    check('marketdata.providers', false, () => ({
      status: 'degraded',
      detail: `Allowed provenance: ${config.marketData.allowedProvenance.join(', ')}. No provider is registered, so no data is served in this phase.`,
    })),
  ];
}
