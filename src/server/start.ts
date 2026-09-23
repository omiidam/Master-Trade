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
import { CredentialVault, InjectedEnvironmentStorage } from '../desktop/credential-vault.js';
import { SecureCredentialStore } from '../desktop/secure-store.js';
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

/**
 * The credential channel this process has: the shell's injected environment.
 *
 * The API process cannot reach the OS keychain — only the Rust shell can — so a keychain reference
 * is satisfied from the value the shell injected under the credential's derived variable name.
 * Before Phase 6.4 a keychain `SecretRef` resolved to `null` here unconditionally, which is why
 * "only the desktop shell can do this" was true and also why nothing could ever use one.
 */
function credentialChannel(env: NodeJS.ProcessEnv = process.env): CredentialVault {
  return new CredentialVault({
    store: new SecureCredentialStore(new InjectedEnvironmentStorage(env)),
    env,
  });
}

export async function startServer(
  deps: ServerDeps = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<ServerInstance> {
  // Read once, at startup. Every failure is reported rather than thrown: an absent optional key
  // leaves the offline adapter answering, and a product that refused to start over one would be
  // worse than one that says which credential is missing.
  const credentials = credentialChannel(env);
  const credentialMetadata = await credentials.load();

  // Constructing the server runs the preconditions, which may refuse. Nothing has
  // logged yet at that point, so the refusal is reported here before it propagates.
  let instance: ServerInstance;
  try {
    instance = createServer({
      ...deps,
      resolveSecret: deps.resolveSecret ?? ((ref) => credentials.resolve(ref)),
    });
  } catch (error) {
    reportBootRefusal(error);
    throw error;
  }

  const { app, config, logger } = instance;

  // Metadata only: which credentials exist, and why one does not. The logger redacts anything
  // sensitive-looking as a second line, but there is nothing sensitive in this record to redact.
  logger.info(
    'credentials inspected',
    {
      credentials: credentialMetadata.map((entry) => ({
        ref: entry.ref,
        loaded: entry.loaded,
        reason: entry.reason,
      })),
    },
    'credentials.loaded',
  );

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
    // Release every in-memory credential reference before the socket closes, so a supervisor that
    // restarts this process cannot find a value reachable in the one it stopped.
    credentials.clear();
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
