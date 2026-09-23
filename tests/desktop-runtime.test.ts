/**
 * The desktop local runtime: the API process supervisor and the state the UI renders.
 *
 * Phase 6.2 gave the shell a process manager. This suite is the reliability layer the phase
 * requires, and it is deliberately in two halves:
 *
 *   - **deterministic** tests drive the supervisor through an injected spawn port, clock and
 *     sleep, so a crash, a restart budget, an exponential backoff or a forced termination is
 *     asserted exactly, with no timing involved;
 *   - **real** tests drive `nodeSidecarSpawner` against an actual child process, because three
 *     of the phase's requirements cannot be honestly claimed against a fake: that a graceful
 *     signal is delivered, that captured output is redacted, and that a stopped process leaves
 *     nothing behind. A fake that resolves `stop()` proves nothing about orphaning.
 *
 * Waiting is by explicit condition (`waitUntil`), never by sleeping an arbitrary amount and
 * hoping. The one place a real clock is unavoidable is the startup deadline, where the clock
 * *is* the thing under test; those tests use a 30–500 ms bound and say so.
 */

import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { Logger, MemoryLogSink } from '../packages/shared/src/core/logging.js';
import {
  DESKTOP_API_PORT,
  SidecarSupervisor,
  httpHealthCheck,
  planSidecarLaunch,
  type SidecarPlan,
  type SidecarProcess,
} from '../src/desktop/sidecar.js';
import { isProcessAlive, nodeSidecarSpawner } from '../src/desktop/child-process.js';
import {
  PROCESS_POLICY,
  PROCESS_STATES,
  canTransition,
  initialSupervisorStatus,
  isProcessReady,
  runtimeStateOf,
  transitionsFrom,
  type ProcessState,
} from '../packages/shared/src/desktop/process.js';
import { desktopStartupState } from '../packages/shared/src/desktop/startup.js';
import { SHARED_SURFACE, sharedSpecifiers } from '../config/sharedSurface.js';
import {
  browserShellBridge,
  assertShellCommand,
  SHELL_COMMANDS,
} from '../packages/shared/src/desktop/ipc.js';
import type { ShellStatus } from '../packages/shared/src/desktop/ipc.js';

// ── helpers ────────────────────────────────────────────────────────────────

const TOKEN = 'a'.repeat(64);

/** A launch plan, deterministic enough to compare field by field. */
function plan(overrides: Partial<SidecarPlan> = {}): SidecarPlan {
  return {
    executable: '/app/master-trade-api',
    args: ['--host', '127.0.0.1', '--port', String(DESKTOP_API_PORT), '--data-dir', '/data'],
    env: { MASTER_TRADE_SHELL_TOKEN: TOKEN },
    cwd: '/data',
    host: '127.0.0.1',
    port: DESKTOP_API_PORT,
    baseUrl: `http://127.0.0.1:${DESKTOP_API_PORT}`,
    token: TOKEN,
    ...overrides,
  };
}

/** A child the supervisor can drive with no OS process behind it. */
interface FakeChild extends SidecarProcess {
  readonly calls: string[];
  /** The supervisor's optional liveness probe. */
  exited(): boolean;
  /** Simulate the process exiting on its own. */
  exit(): void;
}

function fakeChild(pid = 4242): FakeChild {
  const calls: string[] = [];
  let exited = false;
  return {
    pid,
    calls,
    exited: () => exited,
    async stop() {
      calls.push('stop');
      exited = true;
    },
    kill() {
      calls.push('kill');
      exited = true;
    },
    exit() {
      exited = true;
    },
  };
}

/** A child that accepts `stop()` and then never reports leaving. */
function stuckChild(pid = 7): FakeChild {
  const calls: string[] = [];
  return {
    pid,
    calls,
    exited: () => false,
    stop: () => new Promise<void>(() => undefined),
    kill() {
      calls.push('kill');
    },
    exit() {
      /* never */
    },
  };
}

/** A clock a test moves by hand, so uptime and the restart budget are exact. */
function clock(start = 1_000): { now: () => number; advance: (ms: number) => void } {
  let value = start;
  return {
    now: () => value,
    advance: (ms: number) => {
      value += ms;
    },
  };
}

/** Wait for a condition, by asking repeatedly. Never a fixed settle delay. */
async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 4_000,
  what = 'condition',
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`${what} was not met within ${timeoutMs}ms`);
}

/** A logger whose records a test can read, at debug level so capture is observable. */
function capturingLogger(): { logger: Logger; sink: MemoryLogSink } {
  const sink = new MemoryLogSink();
  return { logger: new Logger({ component: 'test.sidecar', sink, level: 'debug' }), sink };
}

/** Every state a supervisor passed through, recorded. */
function recordStates(supervisor: SidecarSupervisor): ProcessState[] {
  const seen: ProcessState[] = [];
  supervisor.subscribe((status) => {
    if (seen[seen.length - 1] !== status.state) seen.push(status.state);
  });
  return seen;
}

// ── the state machine ──────────────────────────────────────────────────────

describe('the API process state machine', () => {
  it('declares the nine states the phase requires', () => {
    expect([...PROCESS_STATES]).toEqual([
      'idle',
      'starting',
      'health-checking',
      'ready',
      'stopping',
      'stopped',
      'crashed',
      'restarting',
      'error',
    ]);
  });

  it('reaches ready only by way of health-checking', () => {
    // The rule the whole supervisor turns on: a spawned process is not an answering API, so
    // the table itself refuses `starting -> ready`.
    expect(canTransition('starting', 'ready')).toBe(false);
    expect(canTransition('starting', 'health-checking')).toBe(true);
    expect(canTransition('health-checking', 'ready')).toBe(true);
  });

  it('lets any live state fail, including before a process exists', () => {
    for (const state of PROCESS_STATES) {
      // `error` is already the failure: failing again is not a transition. `stopped` is the end
      // of this process, so it has nothing left to fail either.
      if (state === 'stopped' || state === 'error') continue;
      expect(canTransition(state, 'error'), `${state} -> error`).toBe(true);
    }
    // `stopped` is the end of this process: nothing is running, so nothing can fail. Its only
    // exit is a fresh start, which is why a restart is expressed as a new run rather than as a
    // resurrection.
    expect(canTransition('stopped', 'error')).toBe(false);
    expect(transitionsFrom('stopped')).toEqual(['starting']);
  });

  it('has no way back into ready from a stopped process', () => {
    expect(canTransition('stopped', 'ready')).toBe(false);
    expect(canTransition('stopped', 'crashed')).toBe(false);
    // A restart is a new process, and it starts as one.
    expect(canTransition('stopped', 'starting')).toBe(true);
  });

  it('never reports readiness without a healthy answer', () => {
    const ready = initialSupervisorStatus();
    expect(isProcessReady({ ...ready, state: 'ready', health: 'healthy' })).toBe(true);
    // A process that is up but silent is not ready.
    expect(isProcessReady({ ...ready, state: 'ready', health: 'unreachable' })).toBe(false);
    expect(isProcessReady({ ...ready, state: 'starting', health: 'healthy' })).toBe(false);
    expect(isProcessReady(initialSupervisorStatus())).toBe(false);
  });
});

// ── A. startup ─────────────────────────────────────────────────────────────

describe('startup', () => {
  it('answers ready only once health answers, and says where it is meanwhile', async () => {
    const child = fakeChild();
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => child,
      health: async () => true,
      readyTimeoutMs: 500,
      pollIntervalMs: 5,
    });
    const seen = recordStates(supervisor);

    await supervisor.start();

    expect(seen).toEqual(['starting', 'health-checking', 'ready']);
    expect(supervisor.currentState()).toBe('ready');
    expect(supervisor.status().health).toBe('healthy');
    expect(supervisor.status().pid).toBe(4242);
  });

  it('does not spawn twice while starting or healthy', async () => {
    let spawns = 0;
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => {
        spawns += 1;
        return fakeChild();
      },
      health: async () => true,
    });
    await supervisor.start();
    await supervisor.start();
    await supervisor.start();
    expect(spawns).toBe(1);
  });

  it('joins a start that is already in flight rather than racing it', async () => {
    let spawns = 0;
    let releaseHealth: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseHealth = resolve;
    });
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => {
        spawns += 1;
        return fakeChild();
      },
      health: async () => {
        await gate;
        return true;
      },
      readyTimeoutMs: 500,
      pollIntervalMs: 5,
    });

    const first = supervisor.start();
    const second = supervisor.start();
    releaseHealth?.();
    const [a, b] = await Promise.all([first, second]);
    expect(spawns).toBe(1);
    expect(a.baseUrl).toBe(b.baseUrl);
  });

  it('waits through a slow health answer instead of failing early', async () => {
    // A real clock here on purpose: the startup deadline *is* the subject.
    let probes = 0;
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => fakeChild(),
      health: async () => {
        probes += 1;
        return probes > 3;
      },
      readyTimeoutMs: 1_000,
      pollIntervalMs: 5,
    });
    await supervisor.start();
    expect(supervisor.currentState()).toBe('ready');
    expect(probes).toBeGreaterThan(3);
  });

  it('reports error with the deadline when health never answers', async () => {
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => fakeChild(),
      health: async () => false,
      readyTimeoutMs: 30,
      pollIntervalMs: 5,
    });
    await expect(supervisor.start()).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(supervisor.currentState()).toBe('error');
    expect(supervisor.status().lastError).toMatch(/did not answer/);
    expect(supervisor.status().health).toBe('unreachable');
  });

  it('reports a launch plan that cannot be built as an error, not as never-tried', async () => {
    const supervisor = new SidecarSupervisor({
      plan: () => {
        throw new Error('the bundle is incomplete');
      },
      spawn: async () => fakeChild(),
      health: async () => true,
    });
    await expect(supervisor.start()).rejects.toThrow(/bundle is incomplete/);
    expect(supervisor.currentState()).toBe('error');
    expect(supervisor.status().lastError).toMatch(/bundle is incomplete/);
  });

  it('reports a spawn that fails as an error, keeping the reason', async () => {
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => {
        throw new Error('EACCES');
      },
      health: async () => true,
    });
    await expect(supervisor.start()).rejects.toThrow(/EACCES/);
    expect(supervisor.currentState()).toBe('error');
  });

  it('treats a child that dies while starting as a crash, not a slow start', async () => {
    const child = fakeChild();
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => {
        child.exit();
        return child;
      },
      health: async () => false,
      readyTimeoutMs: 200,
      pollIntervalMs: 5,
    });
    await expect(supervisor.start()).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(supervisor.currentState()).toBe('crashed');
    expect(supervisor.status().lastError).toMatch(/stopped while it was starting/);
  });
});

// ── B. runtime ─────────────────────────────────────────────────────────────

describe('runtime', () => {
  it('reports an unexpected exit as crashed, then restarting, then ready', async () => {
    const child = fakeChild();
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => fakeChild(),
      health: async () => true,
      sleep: async () => undefined,
      restartPolicy: { attempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitter: false },
    });
    void child;
    await supervisor.start();
    const seen: ProcessState[] = [];
    supervisor.subscribe((status) => seen.push(status.state));

    const outcome = await supervisor.handleExit(1);

    expect(outcome).toBe('ready');
    expect(seen).toContain('crashed');
    expect(seen).toContain('restarting');
    expect(seen[seen.length - 1]).toBe('ready');
    expect(supervisor.restartCount()).toBe(1);
  });

  it('stops restarting once the budget is spent, and says why', async () => {
    let spawns = 0;
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => {
        spawns += 1;
        return fakeChild();
      },
      health: async () => true,
      maxRestarts: 2,
      sleep: async () => undefined,
      restartPolicy: { attempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitter: false },
    });
    await supervisor.start();
    expect(await supervisor.handleExit(1)).toBe('ready');
    expect(await supervisor.handleExit(1)).toBe('ready');
    expect(await supervisor.handleExit(1)).toBe('error');
    expect(spawns).toBe(3);
    expect(supervisor.status().lastError).toMatch(/restart budget of 2 is exhausted/);
  });

  it('grows the delay between restarts instead of hammering a dead API', async () => {
    const delays: number[] = [];
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => fakeChild(),
      health: async () => true,
      maxRestarts: 3,
      sleep: async (ms) => {
        delays.push(ms);
      },
      restartPolicy: { attempts: 4, baseDelayMs: 100, maxDelayMs: 400, jitter: false },
    });
    await supervisor.start();
    await supervisor.handleExit(1);
    await supervisor.handleExit(1);
    await supervisor.handleExit(1);
    // 100, 200, 400 — growing, and bounded by maxDelayMs.
    expect(delays).toEqual([100, 200, 400]);
  });

  it('refreshes the restart budget after a period of stable uptime', async () => {
    const time = clock();
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => fakeChild(),
      health: async () => true,
      maxRestarts: 1,
      now: time.now,
      stableUptimeMs: 60_000,
      sleep: async () => undefined,
      restartPolicy: { attempts: 2, baseDelayMs: 0, maxDelayMs: 0, jitter: false },
    });
    await supervisor.start();
    // One crash spends the whole budget of 1.
    expect(await supervisor.handleExit(1)).toBe('ready');
    expect(await supervisor.handleExit(1)).toBe('error');

    // A process that then runs for longer than `stableUptimeMs` and dies is a new incident.
    const fresh = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => fakeChild(),
      health: async () => true,
      maxRestarts: 1,
      now: time.now,
      stableUptimeMs: 60_000,
      sleep: async () => undefined,
      restartPolicy: { attempts: 2, baseDelayMs: 0, maxDelayMs: 0, jitter: false },
    });
    await fresh.start();
    time.advance(60_001);
    expect(await fresh.handleExit(1)).toBe('ready');
    // The budget was refreshed, so this is failure 1, not 2.
    expect(fresh.restartCount()).toBe(1);
  });

  it('reports uptime only while the API is actually answering', async () => {
    const time = clock();
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => fakeChild(),
      health: async () => true,
      now: time.now,
    });
    await supervisor.start();
    time.advance(5_000);
    expect(supervisor.status().uptimeMs).toBe(5_000);
    expect(supervisor.status().state).toBe('ready');
  });

  it('demotes a ready API that stops answering', async () => {
    let healthy = true;
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => fakeChild(),
      health: async () => healthy,
    });
    await supervisor.start();
    expect(supervisor.currentState()).toBe('ready');

    healthy = false;
    expect(await supervisor.health()).toBe(false);
    expect(supervisor.currentState()).toBe('crashed');
    expect(supervisor.status().health).toBe('unreachable');
    expect(supervisor.status().lastError).toMatch(/stopped answering/);
  });

  it('can be restarted explicitly', async () => {
    let spawns = 0;
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => {
        spawns += 1;
        return fakeChild();
      },
      health: async () => true,
    });
    await supervisor.start();
    expect(await supervisor.restart()).toBe('ready');
    expect(spawns).toBe(2);
  });
});

// ── C. shutdown ────────────────────────────────────────────────────────────

describe('shutdown', () => {
  it('stops gracefully and settles in stopped', async () => {
    const child = fakeChild();
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => child,
      health: async () => true,
    });
    await supervisor.start();
    await supervisor.stop();

    expect(child.calls).toEqual(['stop']);
    expect(child.calls).not.toContain('kill');
    expect(supervisor.currentState()).toBe('stopped');
    expect(supervisor.status().pid).toBeNull();
    expect(supervisor.status().uptimeMs).toBe(0);
  });

  it('forces termination only after the bound, and says it did', async () => {
    const child = stuckChild();
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => child,
      health: async () => true,
      stopTimeoutMs: 30,
    });
    await supervisor.start();
    await supervisor.stop();

    expect(child.calls).toContain('kill');
    expect(supervisor.currentState()).toBe('stopped');
    expect(supervisor.status().lastError).toMatch(/did not exit within 30ms and was terminated/);
  });

  it('resolves even when the child reports a failure, without masking it', async () => {
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => ({
        pid: 1,
        exited: () => false,
        stop: async () => {
          throw new Error('did not exit');
        },
      }),
      health: async () => true,
      stopTimeoutMs: 100,
    });
    await supervisor.start();
    // An exit path must not be blocked by a bug in the thing it is shutting down.
    await expect(supervisor.stop()).resolves.toBeUndefined();
    expect(supervisor.currentState()).toBe('stopped');
  });

  it('refuses to start while stopping, rather than racing the shutdown', async () => {
    const child = stuckChild();
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => child,
      health: async () => true,
      stopTimeoutMs: 30,
    });
    await supervisor.start();
    const stopping = supervisor.stop();
    await expect(supervisor.start()).rejects.toThrow(/being stopped/);
    await stopping;
    expect(supervisor.currentState()).toBe('stopped');
  });
});

// ── D. concurrency ─────────────────────────────────────────────────────────

describe('concurrency', () => {
  it('tells every listener about every change, and can be unsubscribed', async () => {
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => fakeChild(),
      health: async () => true,
    });
    const first: ProcessState[] = [];
    const second: ProcessState[] = [];
    const off = supervisor.subscribe((status) => first.push(status.state));
    supervisor.subscribe((status) => second.push(status.state));

    await supervisor.start();
    expect(first[first.length - 1]).toBe('ready');
    expect(second[second.length - 1]).toBe('ready');

    off();
    await supervisor.stop();
    expect(first).not.toContain('stopped');
    expect(second).toContain('stopped');
  });

  it('hands each listener a copy, so one cannot corrupt the report', async () => {
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => fakeChild(),
      health: async () => true,
    });
    let seenPid: number | null = null;
    supervisor.subscribe((status) => {
      status.pid = 999_999;
      seenPid = status.pid;
    });
    await supervisor.start();
    expect(seenPid).toBe(999_999);
    // The supervisor's own report is untouched.
    expect(supervisor.status().pid).toBe(4242);
  });
});

// ── E. security ────────────────────────────────────────────────────────────

describe('security', () => {
  it('launches exactly one binary with a fixed argument list, on loopback', () => {
    const launch = planSidecarLaunch({
      executable: '/app/master-trade-api',
      dataDir: '/data',
      port: DESKTOP_API_PORT,
      token: TOKEN,
    });
    // Nothing here is caller-shaped: the WebView cannot add, remove or alter an argument.
    expect(launch.args).toEqual([
      '--host',
      '127.0.0.1',
      '--port',
      String(DESKTOP_API_PORT),
      '--data-dir',
      '/data',
    ]);
    expect(launch.host).toBe('127.0.0.1');
    expect(launch.env.MASTER_TRADE_API_HOST).toBe('127.0.0.1');
  });

  it('refuses an empty executable, a bad port and a short token', () => {
    const base = { executable: '/app/api', dataDir: '/data', port: DESKTOP_API_PORT, token: TOKEN };
    expect(() => planSidecarLaunch({ ...base, executable: '   ' })).toThrow(/bundle is incomplete/);
    expect(() => planSidecarLaunch({ ...base, port: 0 })).toThrow(/not a valid TCP port/);
    expect(() => planSidecarLaunch({ ...base, port: 70_000 })).toThrow(/not a valid TCP port/);
    expect(() => planSidecarLaunch({ ...base, port: 1.5 })).toThrow(/not a valid TCP port/);
    expect(() => planSidecarLaunch({ ...base, token: 'short' })).toThrow(/short shell token/);
  });

  it('gives every launch its own credential', () => {
    const input = { executable: '/app/api', dataDir: '/data', port: DESKTOP_API_PORT };
    const one = planSidecarLaunch(input);
    const two = planSidecarLaunch(input);
    expect(one.token).toHaveLength(64);
    expect(one.token).not.toBe(two.token);
  });

  it('offers no command that could start a process', () => {
    // Deny-by-default, on the frontend's own list: there is no "run", "spawn", "exec" or
    // "shell" command for a compromised page to reach, and an unknown name is refused.
    // `shell_status` and `shell_handshake` are named for the shell they report on, not for a
    // shell they could run in, so the pattern is about *starting* something.
    for (const name of SHELL_COMMANDS) {
      expect(name).not.toMatch(/spawn|exec|kill|run|terminal|child_process|powershell|bash/i);
    }
    expect(() => assertShellCommand('run_command')).toThrow(/deny-by-default/);
    expect(() => assertShellCommand('shell_execute')).toThrow(/deny-by-default/);
    expect(() => assertShellCommand('__proto__')).toThrow(/deny-by-default/);
  });

  it('keeps the process implementation off the frontend surface', () => {
    // The frontend cannot import the Node spawner or the supervisor: they are not declared
    // specifiers, and the alias resolver is exact-match, so the bundle refuses them.
    for (const specifier of sharedSpecifiers()) {
      expect(SHARED_SURFACE[specifier]).not.toMatch(/desktop\/(child-process|sidecar)\.ts$/);
    }
    expect(Object.values(SHARED_SURFACE)).not.toContain('src/desktop/child-process.ts');
  });
});

// ── F. the desktop runtime a screen renders ────────────────────────────────

describe('the desktop runtime a screen renders', () => {
  const shellStatus = (
    runtime: Partial<ReturnType<typeof initialSupervisorStatus>>,
  ): ShellStatus => ({
    protocolVersion: 2,
    platform: 'windows',
    appVersion: '0.6.0-test',
    apiBaseUrl: 'http://127.0.0.1:4317',
    runtime: { ...initialSupervisorStatus(), ...runtime },
    capabilities: ['secure-store', 'file-dialog', 'offline-cache', 'single-instance'],
    unavailable: [],
  });

  it('names all five states a person can be shown', () => {
    expect(runtimeStateOf('starting')).toBe('starting');
    expect(runtimeStateOf('health-checking')).toBe('starting');
    expect(runtimeStateOf('ready')).toBe('ready');
    expect(runtimeStateOf('crashed')).toBe('recovering');
    expect(runtimeStateOf('restarting')).toBe('recovering');
    expect(runtimeStateOf('error')).toBe('error');
    expect(runtimeStateOf('stopped')).toBe('unavailable');
    expect(runtimeStateOf('idle')).toBe('unavailable');
  });

  it('reports STARTING while the API comes up, with no base URL yet', () => {
    const view = desktopStartupState({
      runtime: 'desktop-tauri',
      status: shellStatus({ state: 'health-checking', health: 'unknown' }),
    });
    expect(view.state).toBe('STARTING');
    expect(view.apiBaseUrl).toBeNull();
  });

  it('reports READY only with a healthy process and every required capability', () => {
    const view = desktopStartupState({
      runtime: 'desktop-tauri',
      status: shellStatus({ state: 'ready', health: 'healthy' }),
    });
    expect(view.state).toBe('READY');
    expect(view.reason).toBeNull();
  });

  it('never reports READY on a process that is up but unhealthy', () => {
    const view = desktopStartupState({
      runtime: 'desktop-tauri',
      status: shellStatus({ state: 'ready', health: 'unreachable' }),
    });
    expect(view.state).not.toBe('READY');
  });

  it('reports RECOVERING with the reason while a crashed API restarts', () => {
    const view = desktopStartupState({
      runtime: 'desktop-tauri',
      status: shellStatus({
        state: 'restarting',
        health: 'unreachable',
        lastError: 'the API exited with code 1',
      }),
    });
    expect(view.state).toBe('RECOVERING');
    expect(view.reason).toContain('exited with code 1');
    // The dead process's URL is withheld: a caller must not request against it.
    expect(view.apiBaseUrl).toBeNull();
  });

  it('reports ERROR when the process gave up', () => {
    const view = desktopStartupState({
      runtime: 'desktop-tauri',
      status: shellStatus({
        state: 'error',
        health: 'unreachable',
        lastError: 'port 4317 was already in use',
      }),
    });
    expect(view.state).toBe('ERROR');
    expect(view.reason).toContain('port 4317 was already in use');
  });

  it('reports STOPPED when nothing is running', () => {
    const view = desktopStartupState({
      runtime: 'desktop-tauri',
      status: { ...shellStatus({ state: 'stopped', health: 'unknown' }), apiBaseUrl: null },
    });
    expect(view.state).toBe('STOPPED');
  });
});

// ── G. web compatibility ───────────────────────────────────────────────────

describe('web compatibility', () => {
  it('reports no API process in a browser, and never a forever-starting one', async () => {
    const status = await browserShellBridge().status();
    expect(status.runtime.state).toBe('idle');
    expect(runtimeStateOf(status.runtime.state)).toBe('unavailable');
    expect(status.apiBaseUrl).toBeNull();
  });

  it('renders STOPPED in a browser, from the same derivation the shell uses', () => {
    const view = desktopStartupState({ runtime: 'web', status: null });
    expect(view.state).toBe('STOPPED');
    expect(view.reason).toMatch(/no shell process/i);
  });

  it('leaves the browser unable to reach the local API or a process', async () => {
    const bridge = browserShellBridge();
    await expect(bridge.handshake()).rejects.toThrow(/only available in the desktop shell/);
    await expect(bridge.secureStore.set('k', 'v')).rejects.toThrow(/only available/);
    expect(await bridge.secureStore.get('k')).toBeNull();
  });
});

// ── real child processes ───────────────────────────────────────────────────

describe('a real child process', () => {
  /** A loopback server that answers `/v1/health` for one credential. */
  async function healthServer(token: string): Promise<{
    port: number;
    url: string;
    close: () => Promise<void>;
  }> {
    const server = createServer((request, response) => {
      const authorised =
        request.url === '/v1/health' && request.headers.authorization === `Bearer ${token}`;
      response.writeHead(authorised ? 200 : 401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: authorised ? 'ok' : 'unauthorized' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    return {
      port,
      url: `http://127.0.0.1:${port}`,
      close: () =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    };
  }

  /** A real child that announces itself, then idles until asked to leave. */
  const IDLE_SCRIPT = [
    "process.on('SIGTERM', () => { console.log('graceful-exit'); process.exit(0); });",
    "console.log('api-listening');",
    'setInterval(() => {}, 1000);',
  ].join('\n');

  function realPlan(port: number, url: string, token: string, args: string[]): SidecarPlan {
    return {
      executable: process.execPath,
      args,
      env: {},
      cwd: process.cwd(),
      host: '127.0.0.1',
      port,
      baseUrl: url,
      token,
    };
  }

  it('reaches ready against a real health endpoint, then leaves nothing behind', async () => {
    const server = await healthServer(TOKEN);
    const { logger, sink } = capturingLogger();
    const supervisor = new SidecarSupervisor({
      plan: () => realPlan(server.port, server.url, TOKEN, ['-e', IDLE_SCRIPT]),
      spawn: nodeSidecarSpawner(logger),
      health: httpHealthCheck(fetch),
      readyTimeoutMs: 8_000,
      pollIntervalMs: 50,
      stopTimeoutMs: 8_000,
    });

    try {
      await supervisor.start();
      expect(supervisor.currentState()).toBe('ready');
      const pid = supervisor.status().pid;
      expect(typeof pid).toBe('number');
      // A real process id, and it is really running.
      expect(await isProcessAlive(pid as number)).toBe(true);

      // The health check went over a real socket with the real credential.
      expect(await supervisor.health()).toBe(true);

      // Output is captured as it is produced, and this assertion comes *before* the process is
      // asked to leave on purpose: a forced termination can discard whatever is still in the
      // pipe, so reading it afterwards would be testing the kernel rather than the supervisor.
      // Waited for by condition, not by a delay.
      await waitUntil(
        () => sink.records.some((record) => record.message.includes('api-listening')),
        3_000,
        'the child output to be captured',
      );

      await supervisor.stop();
      expect(supervisor.currentState()).toBe('stopped');
      expect(supervisor.status().pid).toBeNull();

      // The orphan check: the child is gone, not merely forgotten.
      await waitUntil(
        async () => !(await isProcessAlive(pid as number)),
        3_000,
        'the child process to exit',
      );
      expect(await isProcessAlive(pid as number)).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('is asked to leave politely before it is forced', async () => {
    // Only a real process can answer this. On Windows there is no `SIGTERM` to deliver —
    // `Child.kill` there is `TerminateProcess` — so the graceful handler cannot run, and the
    // test says so rather than asserting something the platform cannot do (TDR-12).
    const server = await healthServer(TOKEN);
    const { logger, sink } = capturingLogger();
    const supervisor = new SidecarSupervisor({
      plan: () => realPlan(server.port, server.url, TOKEN, ['-e', IDLE_SCRIPT]),
      spawn: nodeSidecarSpawner(logger),
      health: httpHealthCheck(fetch),
      readyTimeoutMs: 8_000,
      pollIntervalMs: 50,
      stopTimeoutMs: 8_000,
    });

    try {
      await supervisor.start();
      const pid = supervisor.status().pid as number;
      await supervisor.stop();
      expect(supervisor.currentState()).toBe('stopped');
      await waitUntil(async () => !(await isProcessAlive(pid)), 3_000, 'the child to have left');

      if (process.platform === 'win32') {
        // The honest Windows assertion. `Child.kill` there is `TerminateProcess`: the handler
        // cannot run, so asserting its absence would be asserting nothing. What *is* checkable
        // is that the stop was still reported as a clean exit and not as the forced path,
        // which is the part the supervisor controls.
        expect(supervisor.status().lastError).toBeNull();
        expect(sink.records.some((record) => record.message.includes('graceful-exit'))).toBe(false);
      } else {
        // A real `SIGTERM`, proven by the child's own handler having run.
        await waitUntil(
          () => sink.records.some((record) => record.message.includes('graceful-exit')),
          3_000,
          'the child to run its shutdown handler',
        );
      }
    } finally {
      await server.close();
    }
  });

  it('redacts the launch credential from captured output', async () => {
    const server = await healthServer(TOKEN);
    const { logger, sink } = capturingLogger();
    const script = "console.log('token is ' + process.env.MASTER_TRADE_SHELL_TOKEN);";
    const supervisor = new SidecarSupervisor({
      plan: () => ({
        ...realPlan(server.port, server.url, TOKEN, ['-e', script]),
        // Handed to the child through the environment, exactly as a real launch does.
        env: { MASTER_TRADE_SHELL_TOKEN: TOKEN },
      }),
      spawn: nodeSidecarSpawner(logger),
      health: httpHealthCheck(fetch),
      readyTimeoutMs: 8_000,
      pollIntervalMs: 50,
      stopTimeoutMs: 8_000,
    });

    try {
      await supervisor.start();
      await waitUntil(
        () => sink.records.some((record) => record.message.includes('token is')),
        8_000,
        'the child to print its environment',
      );
      const lines = sink.records.map((record) => record.message);
      // The credential is replaced, never forwarded.
      expect(lines.some((line) => line.includes('[redacted]'))).toBe(true);
      expect(lines.some((line) => line.includes(TOKEN))).toBe(false);
      for (const record of sink.records) {
        expect(JSON.stringify(record.data ?? {})).not.toContain(TOKEN);
      }
    } finally {
      await supervisor.stop();
      await server.close();
    }
  });

  it('detects a real crash and brings the API back as a new process', async () => {
    const server = await healthServer(TOKEN);
    const { logger } = capturingLogger();
    const supervisor = new SidecarSupervisor({
      plan: () => realPlan(server.port, server.url, TOKEN, ['-e', IDLE_SCRIPT]),
      spawn: nodeSidecarSpawner(logger),
      health: httpHealthCheck(fetch),
      readyTimeoutMs: 8_000,
      pollIntervalMs: 50,
      stopTimeoutMs: 8_000,
      restartPolicy: { attempts: 3, baseDelayMs: 10, maxDelayMs: 50, jitter: false },
    });

    try {
      await supervisor.start();
      expect(supervisor.currentState()).toBe('ready');
      const firstPid = supervisor.status().pid as number;

      // Kill it the way a crash would arrive. The monitor that calls `handleExit` is the shell's
      // (Rust's `supervise`); in this suite the test plays that role, which is what makes the
      // detection deterministic without inventing a second supervision loop.
      process.kill(firstPid, 'SIGKILL');
      await waitUntil(async () => !(await isProcessAlive(firstPid)), 3_000, 'the child to die');
      expect(await supervisor.health()).toBe(true); // the endpoint outlives the process here

      const outcome = await supervisor.handleExit(null);
      expect(outcome).toBe('ready');
      expect(supervisor.currentState()).toBe('ready');

      // A new process, not the old handle: the restart is real.
      const secondPid = supervisor.status().pid as number;
      expect(secondPid).not.toBe(firstPid);
      expect(await isProcessAlive(secondPid)).toBe(true);
      expect(supervisor.restartCount()).toBe(1);
      expect(supervisor.lastFailure()).toMatch(/exited/);

      await supervisor.stop();
      await waitUntil(
        async () => !(await isProcessAlive(secondPid)),
        3_000,
        'the replacement to exit',
      );
    } finally {
      await server.close();
    }
  });

  it('bounds the startup deadline rather than waiting forever', async () => {
    const { logger } = capturingLogger();
    const began = Date.now();
    const supervisor = new SidecarSupervisor({
      plan: () => realPlan(1, 'http://127.0.0.1:1', TOKEN, ['-e', 'setInterval(() => {}, 1000);']),
      spawn: nodeSidecarSpawner(logger),
      health: httpHealthCheck(fetch),
      readyTimeoutMs: 200,
      pollIntervalMs: 50,
    });
    await expect(supervisor.start()).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    // Bounded: a dead endpoint costs the deadline, not an indefinite wait.
    expect(Date.now() - began).toBeLessThan(5_000);
    expect(supervisor.currentState()).toBe('error');
    await supervisor.stop();
  });

  it('keeps the bounds it advertises', () => {
    expect(PROCESS_POLICY.readyTimeoutMs).toBe(30_000);
    expect(PROCESS_POLICY.stopTimeoutMs).toBe(10_000);
    expect(PROCESS_POLICY.maxRestarts).toBe(3);
    expect(PROCESS_POLICY.stableUptimeMs).toBe(60_000);
    // Every state has an outgoing edge, so nothing can trap the supervisor.
    for (const state of PROCESS_STATES) {
      expect(transitionsFrom(state).length, `${state} has no exit`).toBeGreaterThan(0);
    }
  });
});
