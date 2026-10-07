/**
 * Architecture lock (Phase 3.1).
 *
 * Machine-readable source of truth for the technology decisions recorded in
 * `docs/technology-decisions.md`. The document explains *why*; this module
 * makes the decision set checkable so documentation cannot silently drift away
 * from the code and so Phase 3.2 cannot start on an undocumented stack.
 *
 * Rules encoded here:
 * 1. Every `LockArea` must have at least one decision.
 * 2. Every decision must cite at least one existing ADR file.
 * 3. The lock document must mention every decision id.
 * 4. No locked choice may be (or depend on) an experimental technology that is
 *    forbidden as a core dependency (Menai, Agen, Vercel Zero, AXON) or an
 *    opaque agent framework that would hide tool execution from our
 *    permission model (LangChain, LlamaIndex).
 *
 * No dependency is installed by this module: it is data plus a validator.
 */

import { PolicyViolationError } from '../../packages/shared/src/core/errors.js';

/**
 * The required decision areas. Phase 3.1 must answer all of them; a missing
 * area is an incomplete architecture lock, not a minor gap.
 */
export const LOCK_AREAS = [
  'frontend.framework',
  'frontend.state',
  'frontend.ui',
  'frontend.charting',
  'backend.runtime',
  'backend.framework',
  'backend.api',
  'backend.validation',
  'database.local',
  'database.production',
  'database.migrations',
  'database.repositories',
  'ai.abstraction',
  'ai.gateway',
  'ai.providerIndependence',
  // Task 1.2: training is its own area — infrastructure, not the request path.
  'ai.training',
  // Task 1.3: the run harness owns the per-run lifecycle and the ephemeral memory.
  'ai.harness',
  // Task 1.4: the prompt engine owns the layered prompt and the quarantine boundary.
  'ai.prompt',
  // Task 1.5: persistent memory is three scoped layers with their own contracts.
  'ai.memory',
  // Phase 2.7: agent tools execute through one server-side registry.
  'ai.tools',
  'desktop.runtime',
  'desktop.security',
  // Phase 3.6: the shell became an implementation, so three areas of its policy
  // are locked in the same machine-checked form rather than left in prose.
  'desktop.capabilities',
  'desktop.lifecycle',
  'desktop.config',
  'realtime.transport',
  'jobs.queue',
] as const;

export type LockArea = (typeof LOCK_AREAS)[number];

export type LockStatus = 'locked' | 'locked-with-fallback' | 'deferred';

export interface LockedDecision {
  /** Stable id, also quoted in `docs/technology-decisions.md`. */
  id: string;
  area: LockArea;
  /** The chosen technology, named explicitly (never "some library"). */
  choice: string;
  status: LockStatus;
  /** ADR file names (no directory) that record the decision and alternatives. */
  adr: readonly string[];
  /** What the choice must never do, restated where safety depends on it. */
  constraint?: string;
}

/**
 * Technologies that may not become core dependencies. Their *ideas* may inform
 * future phases (see ADR-0008); adding one as a runtime dependency requires a
 * new ADR that supersedes this lock.
 */
export const FORBIDDEN_CORE_TECHNOLOGIES = [
  'menai',
  'agen',
  'vercel-zero',
  'axon',
  'langchain',
  'llamaindex',
] as const;

/**
 * Provider SDK scoping. Business logic must remain provider-independent, so
 * vendor SDKs are importable only from the provider adapter directory.
 */
export const PROVIDER_SDK_SCOPE = 'src/llm/providers' as const;

export const FORBIDDEN_PROVIDER_SDK_PATTERNS = [
  /^openai$/,
  /^@anthropic-ai\//,
  /^@google\/generative-ai$/,
  /^@google\/genai$/,
  /^cohere-ai$/,
  /^mistralai$/,
  /^@mistralai\//,
  /^langchain/,
  /^@langchain\//,
  /^llamaindex$/,
] as const;

/** The lock document that must quote every decision id. */
export const ARCHITECTURE_LOCK_DOC = 'docs/technology-decisions.md';

export const LOCKED_DECISIONS: readonly LockedDecision[] = [
  {
    id: 'DEC-FE-1-FRAMEWORK',
    area: 'frontend.framework',
    choice: 'React 19 + TypeScript (strict) bundled by Vite 6',
    status: 'locked',
    adr: ['ADR-0010-frontend-framework-react-vite.md'],
    constraint: 'The UI never calls an LLM, market-data provider or database directly.',
  },
  {
    id: 'DEC-FE-2-STATE',
    area: 'frontend.state',
    choice: 'TanStack Query v5 for async/server state + Zustand v5 for local UI state',
    status: 'locked',
    adr: ['ADR-0011-frontend-state-tanstack-query-zustand.md'],
    constraint: 'Secrets never live in client state; only keychain references do.',
  },
  {
    id: 'DEC-FE-3-UI-SYSTEM',
    area: 'frontend.ui',
    choice:
      'Tailwind CSS v4 + Radix primitives, vendored shadcn-style components, lucide-react icons',
    status: 'locked',
    adr: ['ADR-0012-ui-system-tailwind-radix.md'],
    constraint: 'No navigation label or control may match FORBIDDEN_UI_CONTROL.',
  },
  {
    id: 'DEC-FE-5-MOTION',
    area: 'frontend.ui',
    choice:
      'Framer Motion behind the presets in web/src/design/motion.ts; every animation is disabled under prefers-reduced-motion',
    status: 'locked',
    adr: ['ADR-0020-ui-motion-framer-motion.md'],
    constraint: 'No information may be conveyed by motion alone.',
  },
  {
    id: 'DEC-FE-4-CHARTING',
    area: 'frontend.charting',
    choice:
      'TradingView Lightweight Charts behind an internal ChartAdapter that is the only place provenance labels and read-only rules are applied',
    status: 'locked-with-fallback',
    adr: ['ADR-0013-charting-lightweight-charts.md'],
    constraint: 'Charts are read-only: no order, position or execution affordance exists.',
  },
  {
    id: 'DEC-BE-1-RUNTIME',
    area: 'backend.runtime',
    choice: 'Node.js 22 LTS (CI keeps a Node 20 compatibility lane)',
    status: 'locked',
    adr: ['ADR-0014-backend-runtime-fastify.md'],
  },
  {
    id: 'DEC-BE-2-FRAMEWORK',
    area: 'backend.framework',
    choice: 'Fastify 5, mounted on loopback only, with plugin-based lifecycle hooks',
    status: 'locked',
    adr: ['ADR-0014-backend-runtime-fastify.md'],
    constraint: 'No route may exist whose operation can trade; the guard runs before handlers.',
  },
  {
    id: 'DEC-BE-3-API',
    area: 'backend.api',
    choice:
      'Transport-agnostic typed contracts in packages/shared/src/api/contracts.ts; Fastify is an adapter that maps HTTP into the same envelope → guard → dispatch pipeline as the desktop in-process bridge',
    status: 'locked',
    adr: ['ADR-0002-modular-monolith.md', 'ADR-0014-backend-runtime-fastify.md'],
  },
  {
    id: 'DEC-BE-4-VALIDATION',
    area: 'backend.validation',
    choice:
      'Zod schemas as the single source of truth; Fastify body/schema validation is disabled so exactly one validator decides',
    status: 'locked',
    adr: ['ADR-0015-validation-zod-single-source.md'],
    constraint:
      'Untrusted input is parsed only in packages/shared/src/api; everything downstream is typed.',
  },
  {
    id: 'DEC-BE-5-PIPELINE',
    area: 'backend.api',
    choice:
      'Every catalogue route is registered behind one preHandler pipeline (version → access → envelope → authN → authZ → approval → validation); coverage is asserted at start-up and unimplemented routes answer 501 through the same pipeline',
    status: 'locked',
    adr: ['ADR-0021-single-request-pipeline.md'],
    constraint:
      'No route may be registered outside the pipeline, and authorization must run before body validation.',
  },
  {
    id: 'DEC-DB-1-LOCAL',
    area: 'database.local',
    choice:
      'SQLite via node:sqlite in WAL mode with foreign keys and busy_timeout enabled, database file under the OS app-data directory',
    status: 'locked',
    adr: [
      'ADR-0003-sqlite-first.md',
      'ADR-0016-persistence-driver-and-orm.md',
      'ADR-0025-sqlite-driver-and-dialects.md',
    ],
    constraint:
      'No secrets and no raw file bytes are ever stored in the database; better-sqlite3 remains the documented fallback driver if a prebuilt binary makes it preferable.',
  },
  {
    id: 'DEC-DB-2-PRODUCTION',
    area: 'database.production',
    choice:
      'PostgreSQL behind the same schema declarations, migrations and repositories, reached through the postgres dialect and an injected client (the pg driver is added when a server exists)',
    status: 'locked-with-fallback',
    adr: ['ADR-0016-persistence-driver-and-orm.md', 'ADR-0025-sqlite-driver-and-dialects.md'],
    constraint:
      'Production mode may not fork the domain: it changes the dialect and the driver, never the repositories.',
  },
  {
    id: 'DEC-DB-3-MIGRATIONS',
    area: 'database.migrations',
    choice:
      'Numbered, forward-only, checksummed migrations generated from the schema declarations and recorded in schema_migrations, which refuses drift, a tampered migration and a newer database',
    status: 'locked',
    adr: ['ADR-0003-sqlite-first.md', 'ADR-0024-generated-migrations-and-ledger.md'],
    constraint: 'Destructive changes require the documented two-step migration.',
  },
  {
    id: 'DEC-DB-4-REPOSITORIES',
    area: 'database.repositories',
    choice:
      'Business logic depends on repository interfaces over a SqlExecutor port; SQL and driver imports exist only under src/db, and every table has exactly one owner repository',
    status: 'locked',
    adr: ['ADR-0023-repository-boundary-and-data-ownership.md'],
    constraint:
      'No module outside src/db may write SQL or import a database driver (enforced by test); the audit trail is append-only.',
  },
  {
    id: 'DEC-AI-1-ABSTRACTION',
    area: 'ai.abstraction',
    choice:
      'The LlmProvider interface with concrete adapters (OpenAI, Anthropic, OpenAI-compatible local servers) living only in src/llm/providers/',
    status: 'locked',
    adr: ['ADR-0004-llm-gateway-abstraction.md', 'ADR-0019-llm-adapters-not-frameworks.md'],
    constraint:
      'LlmRequest cannot express tool execution; providers only return tool-call requests.',
  },
  {
    id: 'DEC-AI-2-GATEWAY',
    area: 'ai.gateway',
    choice:
      'The existing LlmGateway owns endpoint order, fallback, retry, timeout, streaming, token/cost accounting and budget refusal',
    status: 'locked',
    adr: ['ADR-0004-llm-gateway-abstraction.md', 'ADR-0019-llm-adapters-not-frameworks.md'],
    constraint: 'The gateway holds no ToolRegistry and exposes no execution method.',
  },
  {
    id: 'DEC-AI-3-INDEPENDENCE',
    area: 'ai.providerIndependence',
    choice:
      'Provider SDK imports are confined to src/llm/providers/** and an import-boundary test fails the build if any other module imports one',
    status: 'locked',
    adr: ['ADR-0004-llm-gateway-abstraction.md', 'ADR-0019-llm-adapters-not-frameworks.md'],
  },
  {
    id: 'DEC-AI-4-EXTENSION-SEAMS',
    area: 'ai.abstraction',
    choice:
      'Six type-only seams in src/llm/extensionPoints.ts (PromptEngine, ContextBuilder, AgentLoop, ToolCalling, Evaluator, Trainer) collected in LlmExtensionPoints — contracts with no implementation, wiring or default behavior',
    status: 'locked',
    adr: ['ADR-0058-llm-core-extension-seams-and-request-scoping.md'],
    constraint:
      'A seam is a type, not a wire: nothing is implemented or consumed until a phase installs it, and the LlmGateway stays the single entry point for every LLM request.',
  },
  {
    id: 'DEC-AI-5-REQUEST-SCOPING',
    area: 'ai.abstraction',
    choice:
      'Every completion request carries a LlmRequestScope (correlationId plus an opaque userId) from src/llm/provider.ts, threaded through src/agent/asyncModel.ts to the gateway',
    status: 'locked',
    adr: ['ADR-0058-llm-core-extension-seams-and-request-scoping.md'],
    constraint:
      'userId is an opaque identifier, never a Principal, a role or a credential; the LLM layer gains attribution, not authorization.',
  },
  {
    id: 'DEC-AI-6-NO-LIVE-DATA',
    area: 'ai.training',
    choice:
      'Training datasets are curated exports only; the reviewed-conversation origin is excluded from the default quality rules until an approved redaction pipeline exists',
    status: 'locked',
    adr: ['ADR-0059-training-foundation-datasets-provenance-and-the-infrastructure-boundary.md'],
    constraint:
      'No runtime component captures conversations for training; a reviewed-conversation record must name its pipeline and approver, and is refused until both exist.',
  },
  {
    id: 'DEC-AI-7-DATASET-PROVENANCE',
    area: 'ai.training',
    choice:
      'Every dataset carries a provenance block with explicit approval (approvedBy/approvedAt/approvedUses) and is content-addressed by a deterministic fingerprint',
    status: 'locked',
    adr: ['ADR-0059-training-foundation-datasets-provenance-and-the-infrastructure-boundary.md'],
    constraint:
      'validateDataset refuses a dataset without recorded approval; a job references a fingerprint, never loose bytes.',
  },
  {
    id: 'DEC-AI-8-TRAINING-LADDER',
    area: 'ai.training',
    choice:
      'Training stages are base (referenced, never trained), instruction-tuning (SFT), domain, and continuous-learning (reserved); infrastructure is an injected TrainingBackend port the runtime never imports',
    status: 'locked',
    adr: ['ADR-0059-training-foundation-datasets-provenance-and-the-infrastructure-boundary.md'],
    constraint:
      'Continuous learning is refused at validation and must not be scheduled by any backend; the gateway holds no training surface.',
  },
  {
    id: 'DEC-AI-9-RUN-LIFECYCLE',
    area: 'ai.harness',
    choice:
      'AgentRunHarness.run is the single entry point for one bounded run; AgentRunLifecycle is a machine-checked state machine (pending → assembling → calling-model → responding → completed, with failed/cancelled) and every run reaches exactly one terminal state',
    status: 'locked',
    adr: ['ADR-0060-agent-run-harness-lifecycle-and-ephemeral-working-memory.md'],
    constraint:
      'Failure is a recorded state with the phase it surfaced in, never a dangling run; tool requests are recorded, never executed by the harness.',
  },
  {
    id: 'DEC-AI-10-EPHEMERAL-CONTEXT-RAM',
    area: 'ai.harness',
    choice:
      'WorkingMemory is created inside the run, seeded from the caller-supplied history and the current prompt, and disposed in a finally block on every terminal path',
    status: 'locked',
    adr: ['ADR-0060-agent-run-harness-lifecycle-and-ephemeral-working-memory.md'],
    constraint:
      'Nothing persists and nothing is shared between runs; disposed memory refuses every read and write; persistent memory is a later phase with its own contract.',
  },
  {
    id: 'DEC-AI-11-PROMPT-LAYERS',
    area: 'ai.prompt',
    choice:
      'The prompt is composed in five separated layers (system-instructions, developer-instructions, agent-policies, context, user-input) from versioned templates whose slots take trusted parameters only',
    status: 'locked',
    adr: ['ADR-0061-prompt-engine-layered-roles-and-the-quarantine-boundary.md'],
    constraint:
      'User input and context never enter the system message; a template may own only behaviour layers; prompts change by new template version, never an in-place edit.',
  },
  {
    id: 'DEC-AI-13-MEMORY-LAYERS',
    area: 'ai.memory',
    choice:
      'Three closed memory layers with separate storage contracts — procedural (skills, rules, how-tos; system-owned), semantic (durable facts, user profile), episodic (dated events, conversation history) — each with its own query type and token cap',
    status: 'locked',
    adr: ['ADR-0062-three-memory-layers-scoped-versioned-and-bridged-to-the-context-builder.md'],
    constraint:
      'Records are immutable and versioned (a change appends a semver, never an edit); private content is refused in procedural memory and in system-owned records.',
  },
  {
    id: 'DEC-AI-14-MEMORY-SCOPING',
    area: 'ai.memory',
    choice:
      'Every record carries a MemoryOwner (system or user scope); read, history and query are scope-checked and a cross-user read throws rather than filtering quietly',
    status: 'locked',
    adr: ['ADR-0062-three-memory-layers-scoped-versioned-and-bridged-to-the-context-builder.md'],
    constraint:
      'Retrieval output reaches a run only as labelled ContextSection[] through the harness context assembly; working memory stays ephemeral and separate.',
  },
  {
    id: 'DEC-AI-12-INJECTION-QUARANTINE',
    area: 'ai.prompt',
    choice:
      'Untrusted text is fenced in the user message; instruction-override patterns are scanned, recorded and annotated in-message rather than refused',
    status: 'locked',
    adr: ['ADR-0061-prompt-engine-layered-roles-and-the-quarantine-boundary.md'],
    constraint:
      'The system layer is closed (template + developer block + policies + output contract); a scan marker is data for the response layer, never a regex veto.',
  },
  {
    id: 'DEC-AI-15-ARVANCLOUD-PROVIDER',
    area: 'ai.gateway',
    choice:
      'ArvanCloud AI (api.arvancloudai.ir, /chat/completions, DeepSeek-V4-Flash) is a hosted provider inside the existing LlmGateway: id arvancloud, an adapter composing the OpenAI-compatible one with the apikey Authorization scheme, a price row, and registry wiring — no second gateway or configuration system',
    status: 'locked',
    adr: ['ADR-0063-arvancloud-ai-hosted-provider.md'],
    constraint:
      'The credential is referenced by a SecretRef and resolved server-side (env: ARVANCLOUD_API_KEY); with no key the provider is skipped with a reason and the offline scripted adapter answers.',
  },
  {
    id: 'DEC-AI-16-CONTEXT-BUILDER',
    area: 'ai.harness',
    choice:
      'One centralized Context Builder (src/agent/contextBuilder.ts) owns assembly for every LLM call: five separated layers (system instructions and policies never dropped, then runtime, conversation, user input), configurable token budgets with per-layer caps, digest-based deduplication, and size validation before every request',
    status: 'locked',
    adr: ['ADR-0064-central-context-builder-between-harness-and-gateway.md'],
    constraint:
      'The builder is stateless and produces plain ContextSection[] for the existing prompt path; the LlmGateway is untouched, and safety text that cannot fit the budget is an INTERNAL refusal, never a truncation.',
  },
  {
    id: 'DEC-AI-17-AGENT-RUN-MANAGER',
    area: 'ai.harness',
    choice:
      'One Agent Run Manager (src/agent/runManager.ts) owns the durable run lifecycle the AI Workplace reads: a unique id per run, a machine-checked state machine (idle → running → waiting-tool → validating → responding → completed, with blocked/failed/cancelled), start/end time, model, token usage and error tracking, cooperative cancellation, and owner-checked reads that throw on a cross-user access — with every transition announced as an agent.status event on the existing EventBus',
    status: 'locked',
    adr: ['ADR-0065-agent-run-manager-durable-lifecycle-and-workplace-status.md'],
    constraint:
      'The registry is in-process and bounded (an active run is never evicted); cancellation is cooperative, never a force-end mid-write; model work is reached only through the existing adapter over the LlmGateway, and no second status channel exists.',
  },
  {
    id: 'DEC-AI-18-AGENT-LOOP-ENGINE',
    area: 'ai.harness',
    choice:
      'One Agent Loop Engine (src/agent/agentLoop.ts) owns the controlled multi-step loop around the per-run harness: each iteration is one AgentRunHarness.run (the LLM reasoning step through the existing gateway), then a context update that records delivered digests, then a next-step decision read off the structured summary — bounded by configurable maxIterations, maxExecutionTimeMs and maxOutputTokens, ending in exactly one terminal state (completed, blocked, failed, cancelled)',
    status: 'locked',
    adr: ['ADR-0066-agent-loop-engine-bounded-multi-step-reasoning.md'],
    constraint:
      'The loop composes the harness, the Context Builder and the adapter over the LlmGateway — it never reaches a provider itself; an identical step is refused by input digest before it runs; tool requests are recorded, never executed, and no tool calling, RAG, memory, evaluation or learning lives here.',
  },
  {
    id: 'DEC-AI-19-TOOL-REGISTRY',
    area: 'ai.tools',
    choice:
      'One centralized Tool Registry (src/agent/tools/registry.ts, contracts in src/agent/tools/contracts.ts) is the single server-side execution path for agent tools: typed contracts (identity, description, zod input/output schemas, capabilities, risk level, timeout, approval requirement, side effects), a per-invocation gate sequence of identity, existence, approval, permissions (checkPermission over the existing PHASE1_PERMISSIONS — consumed, never re-implemented), input validation, execution under the tool timeout, and output validation, settling every call into one recorded outcome (succeeded, failed, timeout, refused)',
    status: 'locked',
    adr: ['ADR-0067-tool-registry-server-side-tool-calling.md'],
    constraint:
      'Tools run server-side only, scoped to an explicit user/run context, and a run with no user identity can never execute a tool; the registry consumes the existing permission and approval systems and creates no second one; the Agent Loop Engine invokes registered tools through it and feeds validated outcomes back as fresh runtime context; no trading action, RAG/retrieval tool, persistent tool history, evaluation or learning ships in this phase.',
  },
  {
    id: 'DEC-DESKTOP-1-RUNTIME',
    area: 'desktop.runtime',
    choice:
      'Tauri 2 shell hosting the TypeScript backend as a bundled Node sidecar on a loopback port, with the frontend in the system WebView',
    status: 'locked',
    adr: ['ADR-0001-desktop-shell-tauri.md'],
  },
  {
    id: 'DEC-DESKTOP-2-SECURITY',
    area: 'desktop.security',
    choice:
      'Loopback-only bind with a per-launch bearer token handshake, keychain-only secrets, capability allow-list, CSP without remote origins',
    status: 'locked',
    adr: [
      'ADR-0001-desktop-shell-tauri.md',
      'ADR-0007-deny-by-default-auth.md',
      'ADR-0022-local-api-trust-boundary.md',
    ],
    constraint:
      'No shell or API capability exists for broker connection, order placement or live trading.',
  },
  {
    id: 'DEC-DESKTOP-3-CAPABILITIES',
    area: 'desktop.capabilities',
    choice:
      'The WebView is granted five permissions and no shell:/fs:/path:/http:/process:/store: permission at all; Rust performs privileged work and exposes typed commands',
    status: 'locked',
    adr: ['ADR-0029-webview-capability-boundary.md'],
    constraint:
      'No command returns a filesystem path; command names must match between packages/shared/src/desktop/ipc.ts and src-tauri/src/commands.rs in both directions.',
  },
  {
    id: 'DEC-DESKTOP-4-LIFECYCLE',
    area: 'desktop.lifecycle',
    choice:
      'Sidecar launched from a fixed typed plan on a fixed loopback port with a per-launch environment token; readiness proven by an authenticated health probe; restarts bounded and the budget not cleared by a restart',
    status: 'locked',
    adr: ['ADR-0030-sidecar-supervision-fixed-port.md'],
    constraint:
      'The window is never shown before the API answers; the shell token never reaches a file, a log or the config.',
  },
  {
    id: 'DEC-DESKTOP-5-CONFIG',
    area: 'desktop.config',
    choice:
      'Local config in the per-OS app-data directory under one strict schema shared with the Rust host, with a recursive refusal of credential-shaped keys',
    status: 'locked',
    adr: ['ADR-0031-desktop-config-appdata-keychain.md'],
    constraint:
      'A credential value in the config file is rejected, not filtered; a malformed file fails the start rather than falling back to defaults.',
  },
  {
    id: 'DEC-RT-1-WEBSOCKET',
    area: 'realtime.transport',
    choice:
      'WebSocket at /ws via @fastify/websocket over the existing EventBus (audience filtering, monotonic seq, bounded replay, heartbeat)',
    status: 'locked',
    adr: ['ADR-0017-realtime-websocket-transport.md'],
    constraint: 'Events with an empty audience are internal and are never serialized to a client.',
  },
  {
    id: 'DEC-RT-2-PROTOCOL',
    area: 'realtime.transport',
    choice:
      'Versioned event contracts with deny-by-default audiences, auth+subscription in the first frame, and client-side validation of every inbound frame',
    status: 'locked',
    adr: ['ADR-0032-versioned-event-contracts-deny-by-default.md'],
    constraint:
      'An internal event is never serialized to a client, and a payload that looks like it carries a credential is refused rather than stripped.',
  },
  {
    id: 'DEC-JOBS-1-QUEUE',
    area: 'jobs.queue',
    choice:
      'Durable database-backed queue with in-process workers: atomic claim, lease expiry, backoff, dead-letter and the existing approval gate',
    status: 'locked',
    adr: ['ADR-0018-durable-db-backed-job-queue.md'],
    constraint: 'Approval-gated job kinds cannot be enqueued without a recorded human approval.',
  },
  {
    id: 'DEC-JOBS-2-STORE',
    area: 'jobs.queue',
    choice:
      'JobStore port with an in-memory implementation and a SQLite one over the jobs table; a Redis/BullMQ backend would be a third implementation, never a local requirement',
    status: 'locked',
    adr: ['ADR-0033-job-store-port-sqlite-first.md'],
    constraint:
      'Queue guarantees (idempotency, cancellation, durability) are store obligations, so an in-memory store must report itself as non-durable.',
  },
  {
    id: 'DEC-FE-8-STATES',
    area: 'frontend.ui',
    choice:
      'Loading, empty and error are designed states rendered with the real components; each surface carries only the states it can reach',
    status: 'locked',
    adr: ['ADR-0034-loading-empty-error-are-designed-states.md'],
    constraint:
      'No placeholder number stands in for a value that has not been read, and mock data is rendered only where it is labelled.',
  },
];

export type DecisionMap = Readonly<Record<LockArea, readonly LockedDecision[]>>;

export function decisionsByArea(
  decisions: readonly LockedDecision[] = LOCKED_DECISIONS,
): DecisionMap {
  const map = {} as Record<LockArea, LockedDecision[]>;
  for (const area of LOCK_AREAS) map[area] = [];
  for (const decision of decisions) map[decision.area].push(decision);
  return map;
}

export function findDecision(id: string): LockedDecision | undefined {
  return LOCKED_DECISIONS.find((decision) => decision.id === id);
}

export interface ArchitectureLockIssue {
  code:
    | 'MISSING_AREA'
    | 'NO_ADR'
    | 'DUPLICATE_ID'
    | 'UNKNOWN_AREA'
    | 'DEPENDENCY_NOT_CONSUMABLE'
    | 'FORBIDDEN_TECHNOLOGY';
  detail: string;
}

/**
 * Validate the lock itself. Pure, no filesystem access: the structural rules
 * are checked here, the documentation-drift rules (doc mentions every id, ADR
 * files exist) are enforced by `tests/technology-lock.test.ts`.
 */
export function validateArchitectureLock(
  decisions: readonly LockedDecision[] = LOCKED_DECISIONS,
): ArchitectureLockIssue[] {
  const issues: ArchitectureLockIssue[] = [];
  const seen = new Set<string>();

  for (const decision of decisions) {
    if (!(LOCK_AREAS as readonly string[]).includes(decision.area)) {
      issues.push({
        code: 'UNKNOWN_AREA',
        detail: `${decision.id}: unknown area ${decision.area}`,
      });
    }
    if (seen.has(decision.id)) {
      issues.push({ code: 'DUPLICATE_ID', detail: decision.id });
    }
    seen.add(decision.id);
    if (decision.adr.length === 0) {
      issues.push({ code: 'NO_ADR', detail: `${decision.id} cites no ADR` });
    }
    const haystack = decision.choice.toLowerCase();
    for (const forbidden of FORBIDDEN_CORE_TECHNOLOGIES) {
      if (new RegExp(`\\b${forbidden}\\b`, 'i').test(haystack)) {
        issues.push({
          code: 'FORBIDDEN_TECHNOLOGY',
          detail: `${decision.id} names ${forbidden} as a core dependency`,
        });
      }
    }
    // A locked choice must be usable: a deferred area cannot be a prerequisite.
    if (decision.status === 'deferred' && decision.area === 'backend.framework') {
      issues.push({
        code: 'DEPENDENCY_NOT_CONSUMABLE',
        detail: `${decision.id}: core framework cannot be deferred`,
      });
    }
  }

  for (const area of LOCK_AREAS) {
    if (!decisions.some((decision) => decision.area === area)) {
      issues.push({ code: 'MISSING_AREA', detail: area });
    }
  }

  return issues;
}

/** Throws a typed policy error if the lock is incomplete or unsafe. */
export function assertArchitectureLock(
  decisions: readonly LockedDecision[] = LOCKED_DECISIONS,
): void {
  const issues = validateArchitectureLock(decisions);
  if (issues.length > 0) {
    throw new PolicyViolationError(
      `Architecture lock is incomplete: ${issues.map((issue) => issue.detail).join('; ')}`,
      { issues },
    );
  }
}
