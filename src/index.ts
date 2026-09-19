export * from './types.js';

/* Phase 1 core: model / tools / instructions */
export * from './tools/framework.js';
export * from './tools/risk.js';
export * from './tools/marketData.js';
export * from './tools/index.js';
export * from './instructions/loader.js';
export * from './permissions/model.js';
export * from './memory/store.js';
export * from './agent/lifecycle.js';
export * from './agent/orchestrator.js';
export * from './evaluation/index.js';

/* Phase 2 platform: core primitives */
export * from './core/errors.js';
export * from './core/provenance.js';
export * from './core/ids.js';
export * from './core/logging.js';
export * from './core/retry.js';
export * from './core/rateLimit.js';
export * from './core/config.js';

/* Phase 2 platform: layers */
export * from './llm/provider.js';
export * from './auth/model.js';
export * from './api/contracts.js';
export * from './marketdata/provider.js';
export * from './storage/files.js';
export * from './jobs/queue.js';
export * from './realtime/events.js';
export * from './vector/memory.js';

/* Phase 2 platform: agent workflows + clients */
export * from './agent/approval.js';
export * from './agent/proposals.js';
export * from './agent/context.js';
export * from './desktop/host.js';
export * from './frontend/viewModels.js';

/* Phase 3.1: technology lock (decisions, not dependencies) */
export * from './core/architectureLock.js';

/* Phase 3.3: validation + authentication surfaces (the HTTP server lives in
   ./server/index.js so backend entry points do not load Fastify). */
export * from './api/schemas.js';
export * from './auth/sessions.js';
export * from './agent/service.js';
export * from './config/loader.js';

/* Phase 3.4: database foundation — schema, dialects, migrations, ownership and
   the repositories. `./db/index.js` opens nothing on import: `openDatabase()`
   is the only function that touches a driver. */
export * from './db/index.js';
