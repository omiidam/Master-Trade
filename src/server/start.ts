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
import { createServer, type ServerDeps } from './app.js';

export async function startServer(deps: ServerDeps = {}) {
  const instance = createServer(deps);
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
    // The failure has already been logged structurally; exit non-zero.
    process.exitCode = 1;
  });
}
