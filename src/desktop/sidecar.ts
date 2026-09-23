/**
 * Bundled API sidecar: launch plan and process supervision.
 *
 * The desktop app runs the TypeScript backend as a child process the shell owns. Three
 * properties matter more than convenience here:
 *
 *   1. **The launch is a plan, not a command string.** Executable, arguments and
 *      environment come from a typed structure, so there is no place for a
 *      caller-supplied argument to appear. The WebView cannot influence it at all
 *      (it holds no `shell:` permission — see `capabilities.ts`).
 *   2. **Readiness is proven, not assumed.** The supervisor polls `/v1/health` with the
 *      per-launch token until it answers, and gives up on a deadline. A window is
 *      never shown against an API that is not listening, and a failure says which
 *      step failed instead of showing an empty workspace. A spawned process is
 *      `starting`; only an answered health check is `ready`.
 *   3. **The process is watched, not launched and forgotten.** An API that dies while
 *      the app is open is detected, reported (so the interface can stop claiming to be
 *      connected) and restarted within a bounded budget with growing delay.
 *
 * The states are the shared vocabulary in `@shared/desktop/process`: the Rust host mirrors
 * the same list and `npm run desktop:verify` fails if they drift. This file owns the
 * *implementation* of those transitions; the shared module owns their meaning.
 *
 * The token is generated per launch and handed to the child through the
 * environment — never written to a file, never logged, never sent to the WebView
 * except through `shell_handshake`.
 *
 * **Where the real spawn happens.** In a packaged app the Rust host spawns the child
 * (`src-tauri/src/sidecar.rs`), because the WebView must hold no process capability. This
 * module is the same policy expressed where it can be tested and where the verifier can
 * read it, and `src/desktop/child-process.ts` is a real Node implementation of the spawn
 * port so the behaviour below is exercised against an actual child process rather than
 * only against a fake. Phase 6.2 §12 documents which half runs where.
 */

import { randomBytes } from 'node:crypto';
import { AppError } from '../../packages/shared/src/core/errors.js';
import type { Logger } from '../../packages/shared/src/core/logging.js';
import {
  backoffDelay,
  defaultSleep,
  type RetryPolicy,
} from '../../packages/shared/src/core/retry.js';
import {
  PROCESS_POLICY,
  canTransition,
  initialSupervisorStatus,
  transitionStatus,
  type ProcessState,
  type SupervisorStatus,
} from '../../packages/shared/src/desktop/process.js';

export type { ProcessState, SupervisorStatus };

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

/**
 * A running sidecar, as the supervisor sees it.
 *
 * Deliberately three methods and a pid — not a `ChildProcess`. The supervisor's policy must
 * be testable against a fake, and a port that handed out a Node handle would make every test
 * a real spawn and every future runtime a Node assumption.
 */
export interface SidecarProcess {
  readonly pid?: number;
  /**
   * Signal the child to stop and resolve once it has exited.
   *
   * Should ask politely first. Resolving before the process is actually gone would let the
   * supervisor report `stopped` over a live child, which is the orphan this port exists to
   * prevent.
   */
  stop(): Promise<void>;
  /**
   * Terminate unconditionally. Only called after `stop()` exceeded `stopTimeoutMs`.
   *
   * Optional so a fake need not implement it; a real spawner always does.
   */
  kill?(): void;
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
  /** How long `stop()` waits for a graceful exit before terminating. */
  stopTimeoutMs?: number;
  /** Healthy uptime after which the restart budget is refreshed. */
  stableUptimeMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Injectable clock, so uptime and stability are deterministic in tests. */
  now?: () => number;
}

/** A listener told about every state change. */
export type SupervisorListener = (status: SupervisorStatus) => void;

/**
 * Supervises the child process.
 *
 * A crash is a restart with exponential backoff up to a bound, and then a failure — not an
 * infinite loop that quietly eats the machine. Every state change is reportable, both to a
 * listener and through `status()`, so the status card can say what happened instead of
 * showing a spinner forever.
 *
 * The budget rule is the subtle one. The failure counter is cleared for a **fresh** start and
 * after a period of *stable* uptime, but **not** on every restart: clearing it on each restart
 * would reset the budget every time and turn the bound into an infinite respawn loop — exactly
 * what the budget exists to prevent.
 */
export class SidecarSupervisor {
  private readonly options: SidecarSupervisorOptions;
  private process: SidecarProcess | null = null;
  private currentPlan: SidecarPlan | null = null;
  private current: SupervisorStatus = initialSupervisorStatus();
  private failures = 0;
  /** When the current process last answered health; the origin of `uptimeMs`. */
  private healthySince: number | null = null;
  /** An in-flight start, so a second caller joins it instead of spawning a second API. */
  private pendingStart: Promise<SidecarPlan> | null = null;
  private readonly listeners = new Set<SupervisorListener>();

  constructor(options: SidecarSupervisorOptions) {
    this.options = options;
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  private readyTimeout(): number {
    return this.options.readyTimeoutMs ?? PROCESS_POLICY.readyTimeoutMs;
  }

  private pollInterval(): number {
    return this.options.pollIntervalMs ?? PROCESS_POLICY.pollIntervalMs;
  }

  private maxRestarts(): number {
    return this.options.maxRestarts ?? PROCESS_POLICY.maxRestarts;
  }

  private stopTimeout(): number {
    return this.options.stopTimeoutMs ?? PROCESS_POLICY.stopTimeoutMs;
  }

  private stableUptime(): number {
    return this.options.stableUptimeMs ?? PROCESS_POLICY.stableUptimeMs;
  }

  private sleep(): (ms: number) => Promise<void> {
    return this.options.sleep ?? defaultSleep;
  }

  /** The full report. A copy, so a caller cannot mutate the supervisor's own state. */
  status(): SupervisorStatus {
    return { ...this.current, uptimeMs: this.uptimeMs() };
  }

  /** Milliseconds of healthy uptime, or 0 when the API is not currently answering. */
  private uptimeMs(): number {
    if (this.healthySince === null) return 0;
    if (this.current.state !== 'ready') return 0;
    return Math.max(0, this.now() - this.healthySince);
  }

  currentState(): ProcessState {
    return this.current.state;
  }

  plan(): SidecarPlan | null {
    return this.currentPlan;
  }

  restartCount(): number {
    return this.failures;
  }

  lastFailure(): string | null {
    return this.current.lastError;
  }

  /**
   * Watch the supervisor. Returns an unsubscribe function.
   *
   * The listener is called for every state change, so a UI can show `recovering` while a
   * restart is in flight rather than only learning the outcome.
   */
  subscribe(listener: SupervisorListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Update the report without changing state, and tell everyone. */
  private patch(partial: Partial<Omit<SupervisorStatus, 'state'>>): void {
    this.current = { ...this.current, ...partial };
    const snapshot = this.status();
    for (const listener of this.listeners) listener(snapshot);
  }

  /** Move to a state, refusing an illegal move, and tell everyone. */
  private move(
    to: ProcessState,
    patch: Partial<Omit<SupervisorStatus, 'state'>> = {},
  ): SupervisorStatus {
    this.current = transitionStatus(this.current, to, patch);
    const snapshot = this.status();
    for (const listener of this.listeners) listener(snapshot);
    return snapshot;
  }

  /**
   * Spawn and wait until the API answers, or fail with the step that failed.
   *
   * **Idempotent.** A start while the process is already starting or healthy returns the
   * existing plan instead of spawning again. Two API processes on a fixed port would mean one
   * of them dying on bind, and a duplicate spawn in a packaged app is a bug the user sees as
   * "the app opens twice".
   *
   * `idle` is the only state that spawns without having been stopped first, which the
   * transition table enforces: `ready → starting` is not a legal move.
   */
  async start(options: { fromRestart?: boolean } = {}): Promise<SidecarPlan> {
    if (
      this.current.state === 'ready' ||
      this.current.state === 'starting' ||
      this.current.state === 'health-checking'
    ) {
      if (!this.currentPlan) {
        throw new AppError('INTERNAL', 'the supervisor is running with no launch plan');
      }
      this.options.logger?.debug(
        'start ignored: the API process is already up',
        { state: this.current.state },
        'desktop.sidecar.start.duplicate',
      );
      return this.currentPlan;
    }
    if (this.current.state === 'stopping') {
      throw new AppError(
        'POLICY_VIOLATION',
        'the API is being stopped; starting it again would race the shutdown',
      );
    }
    // A second caller joins the first attempt rather than racing it.
    if (this.pendingStart) return this.pendingStart;

    const attempt = this.attemptStart(options.fromRestart ?? false);
    this.pendingStart = attempt;
    try {
      return await attempt;
    } finally {
      this.pendingStart = null;
    }
  }

  private async attemptStart(fromRestart: boolean): Promise<SidecarPlan> {
    // The plan is built before anything is spawned, and building it can fail (a missing
    // bundle, a bad port, a short token). That is an `error`, not an `idle` that never happened.
    let plan: SidecarPlan;
    try {
      plan = await this.options.plan();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.move('error', { lastError: `the API could not be launched: ${message}` });
      throw error;
    }
    this.currentPlan = plan;
    // A crash reported by `health()` leaves the machine in `crashed`, which has no edge
    // straight to `starting`: a new run of a dead process is a restart, and the table says so.
    if (this.current.state === 'crashed') this.move('restarting');
    this.move('starting', { pid: null, health: 'unknown', uptimeMs: 0 });

    let child: SidecarProcess;
    try {
      child = await this.options.spawn(plan);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.move('error', { lastError: `the API could not be launched: ${message}` });
      this.options.logger?.error(
        'sidecar failed to spawn',
        { message },
        'desktop.sidecar.spawn.failed',
      );
      throw error instanceof AppError
        ? error
        : new AppError('INTERNAL', `the API could not be launched: ${message}`);
    }

    this.process = child;
    // The pid is not a state change: we are already `starting`, and re-entering it would be an
    // illegal move that the table rightly refuses. Report the new fact and carry on.
    this.patch({ pid: child.pid ?? null });
    this.move('health-checking', { pid: child.pid ?? null });

    await this.awaitReady(plan);
    this.healthySince = this.now();
    this.move('ready', { health: 'healthy', uptimeMs: 0 });
    // A fresh start earns a fresh budget. A *restart* does not: see the class comment.
    if (!fromRestart) this.failures = 0;
    return plan;
  }

  /**
   * Poll until the API answers or the deadline passes.
   *
   * If the child dies while we are waiting, that is a crash rather than a timeout — the
   * supervisor has a `crashed` state for exactly this, and reporting a slow start would hide
   * the real cause.
   */
  private async awaitReady(plan: SidecarPlan): Promise<void> {
    const timeout = this.readyTimeout();
    const interval = this.pollInterval();
    const sleep = this.sleep();
    const deadline = this.now() + timeout;
    let liveness = 0;
    while (this.now() <= deadline) {
      if (await this.options.health(plan)) return;
      // A child that exited is not "starting slowly".
      if (this.process && (await this.hasExited())) {
        const message = 'the API stopped while it was starting';
        this.move('crashed', { health: 'unknown', lastError: message });
        this.options.logger?.error(
          message,
          { port: plan.port },
          'desktop.sidecar.crashed.starting',
        );
        throw new AppError('PROVIDER_UNAVAILABLE', message, {
          details: { baseUrl: plan.baseUrl },
        });
      }
      liveness += 1;
      await sleep(interval);
    }
    const message = `the API did not answer ${plan.baseUrl}/v1/health within ${timeout}ms`;
    this.move('error', {
      health: 'unreachable',
      lastError: message,
    });
    this.options.logger?.error(message, { port: plan.port }, 'desktop.sidecar.timeout');
    throw new AppError('PROVIDER_UNAVAILABLE', message, {
      details: { baseUrl: plan.baseUrl, timeoutMs: timeout, attempts: liveness },
    });
  }

  /**
   * Whether the child has already exited.
   *
   * The port does not require an exit probe, so a process that cannot say is assumed alive;
   * the health check is what actually decides readiness, and a live-but-silent child is still
   * a timeout.
   */
  private async hasExited(): Promise<boolean> {
    const exited = (this.process as { exited?: () => Promise<boolean> | boolean }).exited;
    if (typeof exited !== 'function') return false;
    return await exited();
  }

  /**
   * Probe health right now and report the answer.
   *
   * Used by a caller that wants to re-check a suspect API, and by tests. A refusal downgrades
   * `ready` to `crashed`: an API that stopped answering is not usable, and continuing to report
   * `ready` is the false positive this whole module avoids.
   */
  async health(): Promise<boolean> {
    const plan = this.currentPlan;
    if (!plan) return false;
    const ok = await this.options.health(plan);
    if (!ok && this.current.state === 'ready') {
      this.healthySince = null;
      this.move('crashed', { health: 'unreachable', lastError: 'the API stopped answering' });
      this.options.logger?.warn(
        'the API stopped answering health checks',
        { port: plan.port },
        'desktop.sidecar.unhealthy',
      );
    }
    return ok;
  }

  /**
   * Called when the child exits on its own. Restarts within the bound.
   *
   * Resolves with the resulting state rather than throwing, so a supervision loop never has to
   * catch an exception to learn the outcome.
   */
  async handleExit(code: number | null): Promise<ProcessState> {
    this.process = null;
    const uptime = this.uptimeMs();

    // A process that ran stably and then died is a new incident. Refresh the budget, so a
    // long-lived API that crashes once after an hour gets a real retry rather than consuming
    // a budget earned by unrelated failures hours ago.
    if (this.healthySince !== null && uptime >= this.stableUptime()) {
      this.options.logger?.info(
        'the API ran stably; refreshing the restart budget',
        { uptimeMs: uptime },
        'desktop.sidecar.stable',
      );
      this.failures = 0;
    }
    this.healthySince = null;
    this.failures += 1;
    const message = `the API exited with code ${code ?? 'unknown'}`;
    this.move('crashed', { pid: null, health: 'unreachable', uptimeMs: 0, lastError: message });
    this.options.logger?.warn(
      'sidecar exited',
      { code, failures: this.failures },
      'desktop.sidecar.exited',
    );

    const maxRestarts = this.maxRestarts();
    if (this.failures > maxRestarts) {
      this.move('error', {
        lastError: `${message}; the restart budget of ${maxRestarts} is exhausted`,
      });
      this.options.logger?.error(
        'sidecar restart budget exhausted',
        { failures: this.failures, maxRestarts },
        'desktop.sidecar.failed',
      );
      return this.current.state;
    }

    this.move('restarting');
    const sleep = this.sleep();
    const policy: RetryPolicy = this.options.restartPolicy ?? {
      attempts: maxRestarts + 1,
      baseDelayMs: PROCESS_POLICY.baseBackoffMs,
      maxDelayMs: PROCESS_POLICY.maxBackoffMs,
      jitter: false,
    };
    await sleep(backoffDelay(policy, this.failures, () => 0.5));
    // A restart that itself fails to come up keeps counting toward the budget. The state is
    // already `error`/`crashed`; report it rather than rejecting.
    try {
      await this.start({ fromRestart: true });
    } catch {
      return this.current.state;
    }
    return this.current.state;
  }

  /** Stop the API explicitly, then start it again. */
  async restart(): Promise<ProcessState> {
    await this.stop();
    try {
      await this.start();
    } catch {
      return this.current.state;
    }
    return this.current.state;
  }

  /**
   * Stop the child and wait for it, so the database closes before we exit.
   *
   * Graceful first, then bounded, then forced. A `stop()` that never returns would hang
   * application exit, and a child left alive after the shell quits is an orphan holding the
   * database and the port — so the deadline is not optional, and neither is the fallback.
   *
   * Resolves even when the child refuses to stop: the caller is on an exit path and must not
   * be blocked by a bug in the thing it is shutting down. The reason is recorded in
   * `lastError` so the failure is visible rather than swallowed.
   */
  async stop(): Promise<void> {
    const child = this.process;
    if (!child) {
      if (this.current.state !== 'idle') {
        this.healthySince = null;
        this.moveToStopped();
      }
      return;
    }

    this.move('stopping');
    const timeout = this.stopTimeout();
    const outcome = await this.withDeadline(child.stop(), timeout);
    this.process = null;
    this.healthySince = null;

    if (outcome === 'timeout') {
      // Forced termination, and said out loud: SQLite may need WAL recovery next launch, which
      // is precisely the cost the graceful path exists to avoid.
      const message = `the API did not exit within ${timeout}ms and was terminated`;
      this.options.logger?.warn(message, { timeoutMs: timeout }, 'desktop.sidecar.stop.forced');
      try {
        child.kill?.();
      } catch (error) {
        this.options.logger?.warn(
          'forcing the API to stop failed',
          { message: error instanceof Error ? error.message : String(error) },
          'desktop.sidecar.stop.kill.failed',
        );
      }
      this.moveToStopped(message);
      return;
    }

    if (outcome === 'failed') {
      this.options.logger?.warn('sidecar did not stop cleanly', {}, 'desktop.sidecar.stop.failed');
      this.moveToStopped('the API reported a failure while stopping');
      return;
    }

    this.moveToStopped();
  }

  /**
   * The terminal move, from wherever the machine happens to be.
   *
   * A live state reaches `stopped` through `stopping`, because that is the only honest edge
   * into it — saying "stopped" without having stopped anything would be the claim this module
   * exists to prevent. A state already past it keeps its error text.
   */
  private moveToStopped(lastError: string | null = null): void {
    if (this.current.state === 'stopped' || this.current.state === 'idle') {
      this.current = { ...this.current, pid: null, health: 'unknown', lastError };
      return;
    }
    if (!canTransition(this.current.state, 'stopped')) this.move('stopping');
    this.move('stopped', { pid: null, health: 'unknown', uptimeMs: 0 });
    if (lastError) this.current = { ...this.current, lastError };
  }

  /**
   * Race a promise against a deadline.
   *
   * `stopTimeoutMs` of 0 or less means "no wait at all", which is only useful in a test that
   * wants the forced path.
   */
  private async withDeadline(
    work: Promise<void>,
    timeoutMs: number,
  ): Promise<'done' | 'failed' | 'timeout'> {
    if (timeoutMs <= 0) return 'timeout';
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs);
      });
      const settled = work.then(
        () => 'done' as const,
        () => 'failed' as const,
      );
      return await Promise.race([settled, deadline]);
    } finally {
      if (timer) clearTimeout(timer);
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
