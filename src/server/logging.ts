/**
 * Structured logging for the server.
 *
 * The application already owns a `Logger` (src/core/logging.ts) that redacts
 * secrets recursively before anything is written. Pino is used as the *sink*: it
 * serializes to JSON and adds its own redaction list as a second line of defence.
 * Request logging is deliberately ours (`disableRequestLogging`) so every line
 * carries a route id and correlation id instead of a raw URL.
 */

import { pino, type DestinationStream, type Logger as PinoLogger } from 'pino';
import type { AppConfig } from '../core/config.js';
import {
  MemoryLogSink,
  Logger,
  type LogRecord,
  type LogSink,
} from '../../packages/shared/src/core/logging.js';

/** Header names pino must strip even if a record is built by hand. */
export const PINO_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  'authorization',
  'token',
  '*.token',
  '*.password',
  '*.apiKey',
  'shellToken',
];

export class PinoLogSink implements LogSink {
  constructor(private readonly pino: PinoLogger) {}

  write(record: LogRecord): void {
    const payload: Record<string, unknown> = {
      component: record.component,
      ...(record.correlationId === undefined ? {} : { correlationId: record.correlationId }),
      ...(record.event === undefined ? {} : { event: record.event }),
      ...(record.data ?? {}),
    };
    this.pino[record.level](payload, record.message);
  }
}

export interface LoggingOptions {
  /** Write to this sink instead of (or in addition to) pino. */
  sink?: LogSink;
  /** Capture every record in memory as well; used by tests and diagnostics. */
  capture?: boolean;
  stream?: DestinationStream;
  level?: string;
}

export interface ServerLogging {
  pino: PinoLogger;
  sink: LogSink;
  logger: Logger;
  /** Present when `capture` was requested. */
  captured: MemoryLogSink | null;
}

export function createLogging(config: AppConfig, options: LoggingOptions = {}): ServerLogging {
  const pinoLogger = pino(
    {
      name: config.appName,
      level: options.level ?? config.observability.level,
      base: { app: config.appName, version: config.version },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      redact: { paths: PINO_REDACT_PATHS, censor: '[redacted]' },
    },
    options.stream,
  );

  const captured = options.capture ? new MemoryLogSink() : null;
  const primary = options.sink ?? new PinoLogSink(pinoLogger);
  const sink: LogSink =
    captured === null
      ? primary
      : {
          write(record) {
            captured.write(record);
            primary.write(record);
          },
        };

  return {
    pino: pinoLogger,
    sink,
    logger: new Logger({ component: 'server', sink, level: config.observability.level }),
    captured,
  };
}

/**
 * One structured line per completed request. Counts, ids and durations only:
 * query strings, bodies and headers are never logged.
 */
export function logRequestCompleted(
  logger: Logger,
  input: {
    method: string;
    routeId: string;
    status: number;
    durationMs: number;
    correlationId: string;
    principalId: string | null;
    errorCode?: string;
  },
): void {
  const data: Record<string, unknown> = {
    method: input.method,
    routeId: input.routeId,
    status: input.status,
    durationMs: Math.round(input.durationMs),
    principalId: input.principalId,
  };
  if (input.errorCode !== undefined) data.errorCode = input.errorCode;
  logger.info('request completed', data, 'http.request.completed');
}
