/**
 * Event contracts — the schema half of the realtime layer.
 *
 * Every event type is declared once, with:
 *
 *   1. a **payload schema** (Zod, strict). An event whose payload does not match
 *      is refused *before* it reaches the bus, so a subscriber never has to
 *      defend against a shape it was not written for;
 *   2. a **schema version**. The version travels with the event, so a consumer
 *      can refuse a version it does not understand instead of misreading a field
 *      that changed meaning. Adding a required field or changing a type is a
 *      version bump, and the contract registry is what makes that visible;
 *   3. an **audience** (roles) and an explicit `internal` flag. An event is
 *      deny-by-default: it reaches a client only if its audience names a role the
 *      principal holds, and an internal event is never serialized to a client at
 *      all;
 *   4. **who may publish it**. Publishing is a privileged act — a compromised or
 *      mistaken module must not be able to emit `audit.record` or fake a
 *      `job.status`. Anything with no listed publisher is system-only.
 *
 * Payloads are additionally scanned for credential-shaped keys and bounded in
 * size. Realtime frames are the easiest place in a system to leak a token: they
 * are built from arbitrary objects and sent straight to a client.
 */

import { z } from 'zod';
import { PolicyViolationError } from '../core/errors.js';
import type { Role } from '../auth/model.js';

export const EVENT_SCHEMA_VERSION = 1 as const;
export const MAX_EVENT_PAYLOAD_BYTES = 32 * 1024;

export type RealtimeEventType =
  | 'agent.message'
  | 'agent.status'
  | 'agent.tool'
  | 'training.progress'
  | 'exam.progress'
  | 'backtest.progress'
  | 'research.update'
  | 'marketdata.tick'
  | 'job.status'
  | 'notification'
  | 'system.status'
  | 'system.error'
  | 'audit.record';

/**
 * Who published an event. This is provenance, not decoration: the UI shows
 * whether a statement came from the agent, a deterministic tool, a job or the
 * system, and the bus refuses a source that is not allowed for the type.
 */
export type EventSourceKind = 'agent' | 'tool' | 'job' | 'system' | 'market-data' | 'user';

export interface EventSource {
  kind: EventSourceKind;
  /** Agent id, tool name, job id or route id — whatever produced the event. */
  id?: string;
  /** How the data was produced, when that matters (synthetic, historical). */
  provenance?: string;
}

/** Publishers are a principal role or the process itself. */
export type EventPublisher = Role | 'system';

const identifier = z.string().trim().min(1).max(128);
const shortText = z.string().trim().min(1).max(2_000);

/** Progress is always a bounded fraction plus an optional human note. */
const progressSchema = z.strictObject({
  current: z.number().min(0).max(100),
  total: z.number().min(0).max(100_000),
  label: z.string().trim().max(200).optional(),
});

/** Epistemic labels are shared vocabulary, never free text. */
export const EVENT_STATEMENT_KINDS = ['fact', 'analysis', 'hypothesis', 'uncertainty'] as const;

const statementSchema = z.strictObject({
  kind: z.enum(EVENT_STATEMENT_KINDS),
  text: shortText,
  sources: z.array(z.string().trim().min(1).max(200)).max(20),
});

const jobStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'dead-letter',
  'cancelled',
]);

export interface EventContract<TPayload = unknown> {
  type: RealtimeEventType;
  schemaVersion: number;
  description: string;
  /** Internal events have no audience and are never serialized to a client. */
  internal: boolean;
  defaultAudience: readonly Role[];
  publishers: readonly EventPublisher[];
  payloadSchema: z.ZodType<TPayload>;
}

function contract<TPayload>(input: EventContract<TPayload>): EventContract<TPayload> {
  return input;
}

/**
 * The registry. Ordering and completeness are asserted by test: every member of
 * `RealtimeEventType` has exactly one contract, and no contract exists for a type
 * that is not in the union.
 */
export const EVENT_CONTRACTS = {
  'agent.message': contract<{
    conversationId: string;
    state: string;
    statements: { kind: string; text: string; sources: string[] }[];
    uncertainty: string[];
  }>({
    type: 'agent.message',
    schemaVersion: EVENT_SCHEMA_VERSION,
    description: 'A structured agent answer. Never chain-of-thought.',
    internal: false,
    defaultAudience: ['owner', 'coach', 'student'],
    publishers: ['owner', 'coach', 'system'],
    payloadSchema: z.strictObject({
      conversationId: identifier,
      state: z.string().trim().min(1).max(32),
      statements: z.array(statementSchema).max(20),
      uncertainty: z.array(shortText).max(20),
    }),
  }),

  'agent.status': contract<{ state: string; previous: string; reason?: string }>({
    type: 'agent.status',
    schemaVersion: EVENT_SCHEMA_VERSION,
    description: 'Agent lifecycle transition.',
    internal: false,
    defaultAudience: ['owner', 'coach', 'student'],
    publishers: ['system'],
    payloadSchema: z.strictObject({
      state: z.string().trim().min(1).max(32),
      previous: z.string().trim().min(1).max(32),
      reason: z.string().trim().max(500).optional(),
    }),
  }),

  'agent.tool': contract<{
    tool: string;
    outcome: string;
    durationMs: number;
    toolCallId: string;
  }>({
    type: 'agent.tool',
    schemaVersion: EVENT_SCHEMA_VERSION,
    description: 'Deterministic tool execution result. Internal by default.',
    internal: true,
    defaultAudience: [],
    publishers: ['system'],
    payloadSchema: z.strictObject({
      tool: z.string().trim().min(1).max(120),
      outcome: z.string().trim().min(1).max(32),
      durationMs: z.number().int().min(0),
      toolCallId: identifier,
    }),
  }),

  'training.progress': contract<{
    lessonId: string;
    completed: number;
    total: number;
    score?: number;
  }>({
    type: 'training.progress',
    schemaVersion: EVENT_SCHEMA_VERSION,
    description: 'Curriculum progress for the learner, per lesson.',
    internal: false,
    defaultAudience: ['owner', 'coach', 'student'],
    publishers: ['owner', 'coach', 'system'],
    payloadSchema: z.strictObject({
      lessonId: identifier,
      completed: z.number().int().min(0),
      total: z.number().int().min(0).max(10_000),
      score: z.number().min(0).max(100).optional(),
    }),
  }),

  'exam.progress': contract<{
    attemptId: string;
    questionIndex: number;
    questionCount: number;
    status: string;
  }>({
    type: 'exam.progress',
    schemaVersion: EVENT_SCHEMA_VERSION,
    description: 'Assessment attempt progress (question by question).',
    internal: false,
    defaultAudience: ['owner', 'coach', 'student'],
    publishers: ['owner', 'coach', 'system'],
    payloadSchema: z.strictObject({
      attemptId: identifier,
      questionIndex: z.number().int().min(0),
      questionCount: z.number().int().min(1).max(10_000),
      status: z.string().trim().min(1).max(32),
    }),
  }),

  'backtest.progress': contract<{
    experimentId: string;
    progress: { current: number; total: number; label?: string };
    status: string;
  }>({
    type: 'backtest.progress',
    schemaVersion: EVENT_SCHEMA_VERSION,
    description: 'Backtest run progress. Results are never a rule activation.',
    internal: false,
    defaultAudience: ['owner', 'coach'],
    publishers: ['system'],
    payloadSchema: z.strictObject({
      experimentId: identifier,
      progress: progressSchema,
      status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
    }),
  }),

  'research.update': contract<{
    experimentId: string;
    status: string;
    metricsSource: string;
    adoption: string;
    summary?: string;
  }>({
    type: 'research.update',
    schemaVersion: EVENT_SCHEMA_VERSION,
    description: 'Research experiment state. States its metric provenance.',
    internal: false,
    defaultAudience: ['owner', 'coach'],
    publishers: ['system'],
    payloadSchema: z.strictObject({
      experimentId: identifier,
      status: z.string().trim().min(1).max(32),
      metricsSource: z.enum(['synthetic', 'historical', 'none']),
      adoption: z.enum(['none', 'awaiting-approval', 'approved', 'rejected']),
      summary: z.string().trim().max(1_000).optional(),
    }),
  }),

  'marketdata.tick': contract<{
    symbol: string;
    timeframe: string;
    provenance: 'synthetic' | 'historical';
    time: string;
    close: number;
  }>({
    type: 'marketdata.tick',
    schemaVersion: EVENT_SCHEMA_VERSION,
    description: 'Normalized bar update. Provenance is mandatory.',
    internal: false,
    defaultAudience: ['owner', 'coach', 'student', 'observer'],
    publishers: ['system'],
    payloadSchema: z.strictObject({
      symbol: z
        .string()
        .trim()
        .min(1)
        .max(32)
        .regex(/^[A-Z0-9._:/-]+$/),
      timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']),
      provenance: z.enum(['synthetic', 'historical']),
      time: z.string().datetime(),
      close: z.number().finite(),
    }),
  }),

  'job.status': contract<{
    jobId: string;
    kind: string;
    status: string;
    attempts: number;
    maxAttempts: number;
    progress?: { current: number; total: number; label?: string };
    error?: string;
  }>({
    type: 'job.status',
    schemaVersion: EVENT_SCHEMA_VERSION,
    description: 'Background job lifecycle and progress.',
    internal: false,
    defaultAudience: ['owner', 'coach'],
    publishers: ['system'],
    payloadSchema: z.strictObject({
      jobId: identifier,
      kind: z.string().trim().min(1).max(120),
      status: jobStatusSchema,
      attempts: z.number().int().min(0).max(100),
      maxAttempts: z.number().int().min(1).max(100),
      progress: progressSchema.optional(),
      error: z.string().trim().max(1_000).optional(),
    }),
  }),

  notification: contract<{
    level: 'info' | 'warning' | 'danger';
    title: z.infer<typeof shortText>;
    body: string;
    actionId?: string;
  }>({
    type: 'notification',
    schemaVersion: EVENT_SCHEMA_VERSION,
    description: 'A user-facing notice, at one of three severity levels.',
    internal: false,
    defaultAudience: ['owner', 'coach', 'student'],
    publishers: ['system', 'owner', 'coach'],
    payloadSchema: z.strictObject({
      level: z.enum(['info', 'warning', 'danger']),
      title: shortText,
      body: z.string().trim().max(4_000),
      actionId: identifier.optional(),
    }),
  }),

  'system.status': contract<{ component: string; status: string; detail: string }>({
    type: 'system.status',
    schemaVersion: EVENT_SCHEMA_VERSION,
    description: 'Readiness or component status change.',
    internal: false,
    defaultAudience: ['owner', 'coach', 'observer'],
    publishers: ['system'],
    payloadSchema: z.strictObject({
      component: z.string().trim().min(1).max(64),
      status: z.enum(['ok', 'degraded', 'fail']),
      detail: z.string().trim().max(1_000),
    }),
  }),

  'system.error': contract<{ code: string; routeId: string; message: string }>({
    type: 'system.error',
    schemaVersion: EVENT_SCHEMA_VERSION,
    description: 'A failed request or turn, with a typed code and no stack trace.',
    internal: false,
    defaultAudience: ['owner'],
    publishers: ['system'],
    payloadSchema: z.strictObject({
      code: z.string().trim().min(1).max(64),
      routeId: z.string().trim().min(1).max(64),
      message: z.string().trim().min(1).max(1_000),
    }),
  }),

  'audit.record': contract<{ event: string; severity: string; subject: string }>({
    type: 'audit.record',
    schemaVersion: EVENT_SCHEMA_VERSION,
    description: 'Audit trail append. Internal: never broadcast to a client.',
    internal: true,
    defaultAudience: [],
    publishers: ['system'],
    payloadSchema: z.strictObject({
      event: z.string().trim().min(1).max(120),
      severity: z.enum(['info', 'notice', 'warning', 'critical']),
      subject: z.string().trim().min(1).max(200),
    }),
  }),
} as const satisfies Record<RealtimeEventType, EventContract<unknown>>;

export type EventContractRegistry = typeof EVENT_CONTRACTS;

export function contractFor(type: RealtimeEventType): EventContract<unknown> {
  return EVENT_CONTRACTS[type] as EventContract<unknown>;
}

export function eventTypes(): RealtimeEventType[] {
  return Object.keys(EVENT_CONTRACTS) as RealtimeEventType[];
}

export function isRealtimeEventType(value: unknown): value is RealtimeEventType {
  return typeof value === 'string' && value in EVENT_CONTRACTS;
}

/** Types that are internal by default and require an explicit audience override. */
export function internalEventTypes(): RealtimeEventType[] {
  return eventTypes().filter((type) => contractFor(type).internal);
}

export function mayPublish(type: RealtimeEventType, publisher: EventPublisher): boolean {
  return contractFor(type).publishers.includes(publisher);
}

/** Any key whose name suggests a credential, anywhere in a payload. */
export const EVENT_SECRET_KEY_PATTERN =
  /(secret|token|password|passphrase|api[-_]?key|credential|private[-_]?key)|key(s)?$/i;

/**
 * Refuse a payload that looks like it carries a credential. Values are refused,
 * never filtered: a silently-stripped field is a field a caller will believe was
 * delivered.
 */
export function assertNoSecretsInPayload(value: unknown, path = 'payload'): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSecretsInPayload(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const here = `${path}.${key}`;
    if (EVENT_SECRET_KEY_PATTERN.test(key)) {
      throw new PolicyViolationError(
        `refusing "${here}": realtime payloads are delivered to clients and must not carry credentials`,
        { field: here },
      );
    }
    assertNoSecretsInPayload(entry, here);
  }
}

export interface EventValidation {
  ok: boolean;
  issues: string[];
}

/**
 * Validate a payload against its contract, plus the two checks no schema can
 * express: credential-shaped keys and a size ceiling.
 */
export function validateEventPayload(type: RealtimeEventType, payload: unknown): EventValidation {
  const issues: string[] = [];
  try {
    assertNoSecretsInPayload(payload);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(payload) ?? 'null';
  } catch {
    return { ok: false, issues: [...issues, 'payload is not JSON-serializable'] };
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_EVENT_PAYLOAD_BYTES) {
    issues.push(`payload exceeds ${MAX_EVENT_PAYLOAD_BYTES} bytes`);
  }

  const result = contractFor(type).payloadSchema.safeParse(payload);
  if (!result.success) {
    for (const issue of result.error.issues) {
      issues.push(`${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
  }
  return { ok: issues.length === 0, issues };
}

/** Throws unless the payload is valid. The bus calls this before storing anything. */
export function assertValidEventPayload(type: RealtimeEventType, payload: unknown): void {
  const validation = validateEventPayload(type, payload);
  if (!validation.ok) {
    throw new PolicyViolationError(`refusing to publish ${type}: ${validation.issues.join('; ')}`, {
      type,
      issues: validation.issues,
    });
  }
}

/** Assert the registry is complete and internally consistent. */
export function assertEventContracts(
  contracts: Record<string, EventContract<unknown>> = EVENT_CONTRACTS as Record<
    string,
    EventContract<unknown>
  >,
): void {
  const seen = new Set<string>();
  for (const [type, entry] of Object.entries(contracts)) {
    if (seen.has(type)) {
      throw new PolicyViolationError(`duplicate event contract: ${type}`, { type });
    }
    seen.add(type);
    if (entry.type !== type) {
      throw new PolicyViolationError(`event contract key mismatch: ${type} vs ${entry.type}`, {
        type,
      });
    }
    if (!Number.isInteger(entry.schemaVersion) || entry.schemaVersion < 1) {
      throw new PolicyViolationError(`event contract ${type} has an invalid schema version`, {
        type,
      });
    }
    if (entry.internal && (entry.defaultAudience.length > 0 || entry.publishers.length !== 1)) {
      throw new PolicyViolationError(
        `internal event ${type} must have no audience and be system-published only`,
        { type },
      );
    }
    if (entry.defaultAudience.length === 0 && !entry.internal) {
      throw new PolicyViolationError(
        `client-visible event ${type} must declare an audience; an empty audience is internal-only`,
        { type },
      );
    }
    if (entry.publishers.length === 0) {
      throw new PolicyViolationError(`event ${type} declares no publisher (deny-by-default)`, {
        type,
      });
    }
  }
}
