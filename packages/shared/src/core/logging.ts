/**
 * Structured logging with mandatory secret redaction.
 *
 * Rules (see docs/observability.md):
 * - logs are structured records, never free-form strings;
 * - every record may carry a correlation id and an event name;
 * - secrets are redacted before they reach any sink, including nested data;
 * - sinks are pluggable, so the desktop app can write JSONL while tests use
 *   an in-memory sink.
 */

import type { CorrelationId } from './ids.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export const REDACTED = '[redacted]';

/** Keys whose values must never be logged. */
const SENSITIVE_KEY =
  /(api[_-]?key|apikey|secret|password|passwd|token|authorization|cookie|credential|private[_-]?key|session[_-]?id|session[_-]?secret)/i;

/**
 * Value shapes that are almost always credentials.
 *
 * Key-based redaction cannot see a secret that arrives *inside* a sentence — "the provider rejected
 * the token mt_s_…" names no sensitive key — so this list is the second half of the rule, and it
 * has to know the shapes this product actually mints. It did not know its own session-token prefix
 * (VULN-004, end-of-Phase-6 security gate): a session token interpolated into a log message was
 * written verbatim, while the same token under a key named `token` was redacted. The prefix is
 * therefore here, spelled out rather than imported — this module lives in `packages/shared`, which
 * may not depend on `src/`, and a redaction rule that only works when a boundary is crossed is not
 * a redaction rule. `src/auth/sessions.ts` owns the value; this owns the shape a sink must refuse.
 */
const SECRET_VALUE =
  /(\bsk-[A-Za-z0-9]{6,}|\bAKIA[0-9A-Z]{12,}|\beyJ[A-Za-z0-9._-]{10,}|\bbearer\s+\S+|\bgh[pousr]_[A-Za-z0-9]{10,}|\bmt_s_[A-Za-z0-9_-]{8,})/gi;

const MAX_DEPTH = 6;

export function redactString(value: string): string {
  return value.replace(SECRET_VALUE, REDACTED);
}

/** Recursively redact a structured value. Cycles are pruned by depth. */
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[depth-limit]';
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactValue(item, depth + 1);
  }
  return out;
}

export interface LogRecord {
  level: LogLevel;
  time: string;
  component: string;
  message: string;
  correlationId?: CorrelationId;
  /** Stable event name, e.g. `agent.tool.completed`. */
  event?: string;
  data?: Record<string, unknown>;
}

export interface LogSink {
  write(record: LogRecord): void;
}

/** Test/dev sink; also the desktop app's in-memory log panel source. */
export class MemoryLogSink implements LogSink {
  readonly records: LogRecord[] = [];

  write(record: LogRecord): void {
    this.records.push(record);
  }

  clear(): void {
    this.records.length = 0;
  }
}

/** JSON-lines sink suitable for a local desktop log file. */
export class JsonLinesLogSink implements LogSink {
  private readonly lines: string[] = [];

  write(record: LogRecord): void {
    this.lines.push(JSON.stringify(record));
  }

  toJSONL(): string {
    return this.lines.join('\n');
  }
}

export interface LoggerOptions {
  component: string;
  sink: LogSink;
  level?: LogLevel;
  correlationId?: CorrelationId;
  now?: () => string;
}

export class Logger {
  private readonly component: string;
  private readonly sink: LogSink;
  private readonly level: LogLevel;
  private readonly correlationId: CorrelationId | undefined;
  private readonly now: () => string;

  constructor(options: LoggerOptions) {
    this.component = options.component;
    this.sink = options.sink;
    this.level = options.level ?? 'info';
    this.correlationId = options.correlationId;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /** Derive a logger for a sub-component, optionally with a new correlation id. */
  child(component: string, correlationId?: CorrelationId): Logger {
    const options: LoggerOptions = {
      component: `${this.component}.${component}`,
      sink: this.sink,
      level: this.level,
      now: this.now,
    };
    const id = correlationId ?? this.correlationId;
    return id === undefined ? new Logger(options) : new Logger({ ...options, correlationId: id });
  }

  debug(message: string, data?: Record<string, unknown>, event?: string): void {
    this.log('debug', message, data, event);
  }

  info(message: string, data?: Record<string, unknown>, event?: string): void {
    this.log('info', message, data, event);
  }

  warn(message: string, data?: Record<string, unknown>, event?: string): void {
    this.log('warn', message, data, event);
  }

  error(message: string, data?: Record<string, unknown>, event?: string): void {
    this.log('error', message, data, event);
  }

  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    event?: string,
  ): void {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[this.level]) return;
    const record: LogRecord = {
      level,
      time: this.now(),
      component: this.component,
      message: redactString(message),
    };
    if (this.correlationId !== undefined) record.correlationId = this.correlationId;
    if (event !== undefined) record.event = event;
    if (data !== undefined) record.data = redactValue(data) as Record<string, unknown>;
    this.sink.write(record);
  }
}
