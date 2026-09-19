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
import { assertNoHardlineOperations } from '../auth/model.js';
import { assertSafeConfig } from '../core/config.js';
import { loadInstructions } from '../instructions/loader.js';
import type { JobQueue } from '../jobs/queue.js';
import type { EventBus } from '../realtime/events.js';
import type { SessionService } from '../auth/sessions.js';
import type { AgentService } from '../agent/service.js';
import { defaultToolRegistry } from '../tools/index.js';
import { assertApiCatalogue } from '../api/contracts.js';
import { check, type HealthCheck } from './health.js';

export interface HealthCheckDeps {
  config: AppConfig;
  sessions: SessionService;
  jobs: JobQueue;
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
      const jobs = deps.jobs.list();
      const byStatus = jobs.reduce<Record<string, number>>((acc, job) => {
        acc[job.status] = (acc[job.status] ?? 0) + 1;
        return acc;
      }, {});
      const summary = Object.entries(byStatus)
        .map(([status, count]) => `${status}=${count}`)
        .join(' ');
      return {
        status: 'degraded',
        detail: `In-process queue only (${summary || 'empty'}); durable workers arrive with the persistence slice.`,
      };
    }),

    check('realtime.bus', false, () => ({
      status: 'degraded',
      detail: `Event bus ready (${deps.eventBus.subscriberCount()} subscriber(s), lastSeq=${deps.eventBus.lastSeq()}); WebSocket transport is not mounted yet.`,
    })),

    check('database.sqlite', false, () => ({
      status: 'degraded',
      detail: `Configured for ${config.database.engine} at ${config.database.file}, but no driver/repositories are wired in this phase.`,
    })),

    check('storage.files', false, () => ({
      status: 'degraded',
      detail: `Root ${config.storage.root}; only the validating in-memory adapter exists, so nothing persists yet.`,
    })),

    check('llm.providers', false, () => {
      const registered = [...deps.llmProviders];
      const hosted = registered.filter((id) => id !== 'scripted');
      if (hosted.length > 0) {
        return { status: 'ok', detail: `Providers registered: ${registered.join(', ')}.` };
      }
      return {
        status: 'degraded',
        detail: `Only the offline scripted adapter is registered (${registered.join(', ') || 'none'}); no hosted provider is configured or connected.`,
      };
    }),

    check('marketdata.providers', false, () => ({
      status: 'degraded',
      detail: `Allowed provenance: ${config.marketData.allowedProvenance.join(', ')}. No provider is registered, so no data is served in this phase.`,
    })),
  ];
}
