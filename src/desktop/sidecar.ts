/**
 * Bundled API sidecar: launch plan and supervision.
 *
 * The desktop app runs the TypeScript backend as a child process the shell owns.
 * Two properties matter more than convenience here:
 *
 *   1. **The launch is a plan, not a command string.** Executable, arguments and
 *      environment come from a typed structure, so there is no place for a
 *      caller-supplied argument to appear. The WebView cannot influence it at all
 *      (it holds no `shell:` permission — see `capabilities.ts`).
 *   2. **Readiness is proven, not assumed.** The shell polls `/v1/health` with the
 *      per-launch token until it answers, and gives up on a deadline. A window is
 *      never shown against an API that is not listening, and a failure says which
 *      step failed instead of showing an empty workspace.
 *
 * The token is generated per launch and handed to the child through the
 * environment — never written to a file, never logged, never sent to the WebView
 * except through `shell_handshake`.
 */

import { randomBytes } from 'node:crypto';
import { AppError } from '../../packages/shared/src/core/errors.js';
import type { Logger } from '../../packages/shared/src/core/logging.js';
import {
  backoffDelay,
  defaultSleep,
  type RetryPolicy,
} from '../../packages/shared/src/core/retry.js';

/**
 * Fixed loopback port for the bundled API.
 *
 * Fixed rather than dynamic on purpose: the CSP in `tauri.conf.json` names the
 * exact origin the WebView may reach, and `http://127.0.0.1:*` would let a page
 * talk to any local service. A busy port is therefore a start-up failure with an
 * actionable message, not a silent relocation.
 */
export const DESKTOP_API_PORT = 4317;

/** Environment variable the backend reads to learn *which* variable holds the token. */
export const SHELL_TOKEN_ENV_NAME = 'MASTER_TRADE_SHELL_TOKEN_ENV';
/** Environment variable that actually carries the token. */
export const SHELL_TOKEN_ENV = 'MASTER_TRADE_SHELL_TOKEN';

export type SidecarState = 'stopped' | 'starting' | 'ready' | 'failed';

export interface SidecarPlan {
  /** The bundled executable. A path, but a shell-side one: it never reaches the WebView. */
  executable: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  host: '127.0.0.1';
  port: number;
  baseUrl: string;
  token: string;
}

export interface PlanSidecarInput {
  /** Absolute path of the bundled sidecar for this platform. */
  executable: string;
  /** Absolute app-data directory; the child owns config, cache and database beneath it. */
  dataDir: string;
  port: number;
  /** Override the generated credential (tests, and a fixed-port dev session). */
  token?: string;
  /** Randomness source; injected so tests are deterministic. */
  randomBytes?: (size: number) => Buffer;
}

/** A 256-bit per-launch credential, hex-encoded. */
export function generateShellToken(random: (size: number) => Buffer = randomBytes): string {
  return random(32).toString('hex');
}

/**
 * Build the launch plan. Validates the two things a wrong value would silently
 * break: the bind address must be loopback, and the port must be a real port.
 */
export function planSidecarLaunch(input: PlanSidecarInput): SidecarPlan {
  if (input.executable.trim().length === 0) {
    throw new AppError('INTERNAL', 'sidecar executable path is empty; the bundle is incomplete');
  }
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65_535) {
    throw new AppError('VALIDATION_FAILED', `sidecar port ${input.port} is not a valid TCP port`);
  }
  const token = input.token ?? generateShellToken(input.randomBytes);
  if (token.length < 32) {
    throw new AppError(
      'POLICY_VIOLATION',
      'refusing to launch the sidecar with a short shell token',
    );
  }

  const host = '127.0.0.1' as const;
  return {
    executable: input.executable,
    // Fixed argument list. The API refuses any non-loopback host (assertSafeConfig).
    args: ['--host', host, '--port', String(input.port), '--data-dir', input.dataDir],
    env: {
      [SHELL_TOKEN_ENV_NAME]: SHELL_TOKEN_ENV,
      [SHELL_TOKEN_ENV]: token,
      MASTER_TRADE_API_HOST: host,
      MASTER_TRADE_API_PORT: String(input.port),
      // Absolute data directory, so the app-data rule survives a different cwd.
      MASTER_TRADE_DB_FILE: `${input.dataDir}/master-trade.db`,
    },
    cwd: input.dataDir,
    host,
    port: input.port,
    baseUrl: `http://${host}:${input.port}`,
    token,
  };
}

/** A running sidecar, as the supervisor sees it. */
export interface SidecarProcess {
  readonly pid?: number;
  /** Signal the child to stop and resolve once it has exited. */
  stop(): Promise<void>;
}

export type SidecarSpawner = (plan: SidecarPlan) => Promise<SidecarProcess>;

/** Resolves true when the API answers an authenticated liveness request. */
export type SidecarHealthCheck = (plan: SidecarPlan) => Promise<boolean>;

/**
 * The real health check: `GET /v1/health` with the per-launch token. It uses the
 * same route and the same credential the frontend will use, so "ready" means the
 * actual path works.
 */
export function httpHealthCheck(
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>,
): SidecarHealthCheck {
  return async (plan) => {
    try {
      const response = await fetchImpl(`${plan.baseUrl}/v1/health`, {
        headers: { authorization: `Bearer ${plan.token}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  };
}

export interface SidecarSupervisorOptions {
  plan: () => SidecarPlan | Promise<SidecarPlan>;
  spawn: SidecarSpawner;
  health: SidecarHealthCheck;
  logger?: Logger;
  /** How long to wait for the first successful health answer. */
  readyTimeoutMs?: number;
  pollIntervalMs?: number;
  /** Restarts allowed after an unexpected exit; 0 means "fail immediately". */
  maxRestarts?: number;
  restartPolicy?: RetryPolicy;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Supervises the child process.
 *
 * A crash is a restart with exponential backoff up to a bound, and then a
 * failure — not an infinite loop that quietly eats the machine. Every state
 * change is reportable so the status card can say what happened.
 */
export class SidecarSupervisor {
  private readonly options: SidecarSupervisorOptions;
  private process: SidecarProcess | null = null;
  private currentPlan: SidecarPlan | null = null;
  private state: SidecarState = 'stopped';
  private failures = 0;
  private lastError: string | null = null;

  constructor(options: SidecarSupervisorOptions) {
    this.options = options;
  }

  currentState(): SidecarState {
    return this.state;
  }

  plan(): SidecarPlan | null {
    return this.currentPlan;
  }

  restartCount(): number {
    return this.failures;
  }

  lastFailure(): string | null {
    return this.lastError;
  }

  /**
   * Spawn and wait until the API answers, or fail with the step that failed.
   *
   * The failure counter is cleared only for a **fresh** start. Clearing it on a
   * restart would reset the budget every time and turn the bound into an
   * infinite respawn loop — exactly what the budget exists to prevent.
   */
  async start(fromRestart = false): Promise<SidecarPlan> {
    const plan = await this.options.plan();
    this.currentPlan = plan;
    this.state = 'starting';
    this.process = await this.options.spawn(plan);
    await this.awaitReady(plan);
    this.state = 'ready';
    if (!fromRestart) this.failures = 0;
    return plan;
  }

  private async awaitReady(plan: SidecarPlan): Promise<void> {
    const timeout = this.options.readyTimeoutMs ?? 20_000;
    const interval = this.options.pollIntervalMs ?? 250;
    const sleep = this.options.sleep ?? defaultSleep;
    const deadline = Date.now() + timeout;
    while (Date.now() <= deadline) {
      if (await this.options.health(plan)) return;
      await sleep(interval);
    }
    this.state = 'failed';
    this.lastError = `the API did not answer ${plan.baseUrl}/v1/health within ${timeout}ms`;
    this.options.logger?.error(this.lastError, { port: plan.port }, 'desktop.sidecar.timeout');
    throw new AppError('PROVIDER_UNAVAILABLE', this.lastError, {
      details: { baseUrl: plan.baseUrl, timeoutMs: timeout },
    });
  }

  /** Called when the child exits on its own. Restarts within the bound. */
  async handleExit(code: number | null): Promise<SidecarState> {
    this.process = null;
    this.failures += 1;
    this.lastError = `sidecar exited with code ${code ?? 'unknown'}`;
    this.options.logger?.warn(
      'sidecar exited',
      { code, failures: this.failures },
      'desktop.sidecar.exited',
    );

    const maxRestarts = this.options.maxRestarts ?? 3;
    if (this.failures > maxRestarts) {
      this.state = 'failed';
      this.options.logger?.error(
        'sidecar restart budget exhausted',
        { failures: this.failures, maxRestarts },
        'desktop.sidecar.failed',
      );
      return this.state;
    }

    const sleep = this.options.sleep ?? defaultSleep;
    const policy: RetryPolicy = this.options.restartPolicy ?? {
      attempts: maxRestarts + 1,
      baseDelayMs: 500,
      maxDelayMs: 10_000,
      jitter: false,
    };
    await sleep(backoffDelay(policy, this.failures, () => 0.5));
    // A restart that itself fails to come up keeps counting toward the budget.
    // The state is already `failed`; report it rather than rejecting, so a
    // supervision loop never has to catch an exception to learn the outcome.
    try {
      await this.start(true);
    } catch {
      return this.state;
    }
    return this.state;
  }

  /** Stop the child and wait for it, so the database closes before we exit. */
  async stop(): Promise<void> {
    this.state = 'stopped';
    const child = this.process;
    this.process = null;
    if (!child) return;
    try {
      await child.stop();
    } catch (error) {
      this.options.logger?.warn(
        'sidecar did not stop cleanly',
        { message: error instanceof Error ? error.message : String(error) },
        'desktop.sidecar.stop.failed',
      );
    }
  }

  /** The credential the frontend receives through `shell_handshake`. */
  handshake(): { apiBaseUrl: string; token: string } {
    if (!this.currentPlan) {
      throw new AppError('INTERNAL', 'no sidecar plan exists yet');
    }
    return { apiBaseUrl: this.currentPlan.baseUrl, token: this.currentPlan.token };
  }
}
