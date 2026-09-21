/**
 * Process entry point.
 *
 * Binds the loopback interface only (`assertSafeConfig` refuses any other host)
 * and shuts down gracefully on SIGINT/SIGTERM, closing the socket before the
 * process exits so a restart does not race with a lingering listener.
 *
 * Run it with `npm run build && npm run api`.
 */

import { pathToFileURL } from 'node:url';
import { AppError } from '../../packages/shared/src/core/errors.js';
import { redactString, redactValue } from '../../packages/shared/src/core/logging.js';
import { createServer, type ServerDeps, type ServerInstance } from './app.js';

/** A minimal write target, so the refusal path is testable without a real stderr. */
export interface RefusalSink {
  write(chunk: string): unknown;
}

/**
 * Report a start-up **refusal** on stderr.
 *
 * The preconditions (`assertSafeConfig`, the unsafe-env refusal,
 * `assertNoHardlineOperations`, the route catalogue, the instruction policy) all
 * run before a logger exists, because they run before there is a server to log
 * through. Without this, a refusal left the process exiting non-zero with *no
 * output at all* — the operator sees a silent failure and no reason, on the one
 * path whose whole purpose is to refuse loudly.
 *
 * It writes to stderr directly rather than through the logger, because the
 * refusal is the reason there is no logger. One structured, redacted record, the
 * same shape the logger emits, so it can be parsed by the same tooling.
 */
export function reportBootRefusal(error: unknown, stream: RefusalSink = process.stderr): void {
  const appError = error instanceof AppError ? error : null;
  const record = {
    level: 'error',
    time: Date.now(),
    event: 'server.refused',
    code: appError?.code ?? 'INTERNAL',
    message: redactString(appError?.message ?? String(error)),
    details: redactValue(appError?.details ?? {}),
  };
  stream.write(`${JSON.stringify(record)}\n`);
}

export async function startServer(deps: ServerDeps = {}): Promise<ServerInstance> {
  // Constructing the server runs the preconditions, which may refuse. Nothing has
  // logged yet at that point, so the refusal is reported here before it propagates.
  let instance: ServerInstance;
  try {
    instance = createServer(deps);
  } catch (error) {
    reportBootRefusal(error);
    throw error;
  }

  const { app, config, logger } = instance;

  try {
    await app.listen({ host: config.api.host, port: config.api.port });
  } catch (error) {
    const appError =
      error instanceof AppError
        ? error
        : new AppError('INTERNAL', `Failed to bind ${config.api.host}:${config.api.port}`);
    logger.error(appError.message, { code: appError.code }, 'server.listen.failed');
    throw appError;
  }

  logger.info(
    'api listening',
    {
      baseUrl: `http://${config.api.host}:${config.api.port}/${config.api.version}`,
      health: `http://${config.api.host}:${config.api.port}/v1/health`,
      mode: config.mode,
      liveTradingEnabled: config.safety.liveTradingEnabled,
      brokerExecutionEnabled: config.safety.brokerExecutionEnabled,
    },
    'server.listening',
  );

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutting down', { signal }, 'server.shutdown');
    await instance.close();
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  return instance;
}

/** Only boot when executed directly, so importing this module has no side effect. */
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  startServer().catch(() => {
    // The reason has been logged structurally (or reported by reportBootRefusal);
    // exit non-zero.
    process.exitCode = 1;
  });
}
