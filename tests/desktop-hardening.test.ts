/**
 * Phase 6.6 — the desktop hardening boundary, and the build-version handshake.
 *
 * This is the final sub-phase's reliability layer. It is deliberately narrow: Phases 6.1–6.5
 * already test their own subsystems (process supervision, storage, keychain, update), so this
 * suite holds only what no earlier suite could — the places where two subsystems meet and the
 * failure is a *boundary* rather than a bug in either half:
 *
 *   1. **A child that never sends a newline.** `MAX_CAPTURED_LINE` bounds each forwarded line;
 *      it never bounded the buffer waiting for one. Phase 6.6 found that buffer unbounded and
 *      `child-process.ts` now caps it. The test proves the cap *engages before the newline
 *      arrives* — the old code emitted nothing at all until one did, so waiting for the
 *      truncation record while the child is still silent is a regression test rather than a
 *      restatement of the implementation.
 *   2. **A `stop()` that races a spawn.** The child was made `this.process` before the state
 *      machine was asked whether it could be adopted, so a raced stop could leave a running
 *      process that no later `stop()` could reach. The supervisor now stops it and refuses.
 *   3. **An IPC rejection.** A Tauri command failure arrives as whatever the WebView produced —
 *      a string that can name a path. `createShellBridge` now replaces it with a typed, curated
 *      error, and the test asserts the original text is *not* reproduced.
 *   4. **A native failure that must not become a plaintext fallback.** The credential layer may
 *      not reach the Phase 6.3 database or file store at all, asserted structurally, because a
 *      secret written to a file is not something a behavioural test would necessarily see.
 *   5. **The build-version handshake.** Readiness has three clauses; the third — the API is the
 *      build the shell shipped — is new here, and its whole point is that it fails closed.
 *
 * Everything is driven through injected ports, a fake child or a real one, and conditions that
 * are awaited (`waitUntil`). No test waits a fixed amount and hopes.
 */

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { AppError } from '../packages/shared/src/core/errors.js';
import { Logger, MemoryLogSink } from '../packages/shared/src/core/logging.js';
import { desktopStartupState } from '../packages/shared/src/desktop/startup.js';
import {
  SHELL_COMMANDS,
  assertShellCommand,
  browserShellBridge,
  createShellBridge,
} from '../packages/shared/src/desktop/ipc.js';
import type { ShellStatus } from '../packages/shared/src/desktop/ipc.js';
import { REQUIRED_DESKTOP_CAPABILITIES } from '../packages/shared/src/desktop/host.js';
import {
  isProcessAlive,
  MAX_CAPTURED_LINE,
  MAX_PENDING_BUFFER,
  nodeSidecarSpawner,
} from '../src/desktop/child-process.js';
import {
  DESKTOP_API_PORT,
  SidecarSupervisor,
  type SidecarPlan,
  type SidecarProcess,
} from '../src/desktop/sidecar.js';
import {
  COMPATIBLE_HANDSHAKE_STATES,
  HANDSHAKE_STATES,
  assertHandshakeCompatible,
  checkVersionHandshake,
  decideHandshake,
  isHandshakeCompatible,
  versionProbeFromHealth,
  type HandshakeResult,
} from '../src/desktop/handshake.js';

// ── helpers ────────────────────────────────────────────────────────────────

const TOKEN = 'b'.repeat(64);

function plan(overrides: Partial<SidecarPlan> = {}): SidecarPlan {
  return {
    executable: '/app/master-trade-api',
    args: ['--host', '127.0.0.1', '--port', String(DESKTOP_API_PORT), '--data-dir', '/data'],
    env: {},
    cwd: '/data',
    host: '127.0.0.1',
    port: DESKTOP_API_PORT,
    baseUrl: `http://127.0.0.1:${DESKTOP_API_PORT}`,
    token: TOKEN,
    ...overrides,
  };
}

/** A child the supervisor can drive with no OS process behind it. */
function fakeChild(pid = 4242): SidecarProcess & { calls: string[] } {
  const calls: string[] = [];
  return {
    pid,
    calls,
    async stop() {
      calls.push('stop');
    },
    kill() {
      calls.push('kill');
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

function capturingLogger(): { logger: Logger; sink: MemoryLogSink } {
  const sink = new MemoryLogSink();
  return { logger: new Logger({ component: 'test.hardening', sink, level: 'debug' }), sink };
}

/** A shell status that names a failed start, for the UI derivation. */
function failedStatus(reason: string): ShellStatus {
  return {
    protocolVersion: 3,
    platform: 'windows',
    appVersion: '0.6.0',
    apiBaseUrl: null,
    runtime: {
      state: 'error',
      pid: null,
      health: 'unreachable',
      uptimeMs: 0,
      restartCount: 1,
      lastError: reason,
    },
    capabilities: [...REQUIRED_DESKTOP_CAPABILITIES],
    unavailable: [],
  };
}

// ── 1. child output cannot grow the shell without bound ────────────────────

describe('a child that never sends a newline', () => {
  /**
   * 200 KiB with no newline in it, then a newline, then idle.
   *
   * The order matters: the parent must be able to observe the bound tripping *while* the
   * unbroken run is still the only thing written. A script that sent the 200 KiB and exited
   * would let an unbounded implementation look identical, because the line would arrive in the
   * same tick as the process's death.
   */
  const NOISY_SCRIPT = [
    "process.stdout.write('x'.repeat(200000));",
    "process.stdout.write('api-listening\\n');",
    'setInterval(() => {}, 1000);',
  ].join('\n');

  it('is cut off at the capture bound, and says the line was truncated', async () => {
    const { logger, sink } = capturingLogger();
    const child = await nodeSidecarSpawner(logger)({
      ...plan(),
      executable: process.execPath,
      args: ['-e', NOISY_SCRIPT],
      cwd: process.cwd(),
      baseUrl: 'http://127.0.0.1:1',
    });

    try {
      // The distinct behaviour: the bound engages before any newline arrives. An implementation
      // that only sliced the completed line would never produce this record while the child is
      // still holding the run open.
      await waitUntil(
        () =>
          sink.records.some(
            (record) =>
              record.event === 'desktop.sidecar.output' && record.data?.truncated === true,
          ),
        6_000,
        'the capture bound to engage',
      );

      const captured = sink.records.filter((record) => record.event === 'desktop.sidecar.output');
      // Every forwarded line respects the per-line bound, so nothing reached the log sink whole.
      for (const record of captured) {
        expect(record.message.length).toBeLessThanOrEqual(MAX_CAPTURED_LINE);
      }
      // The bound, and the arithmetic behind it, are on their own record: a reader can tell
      // "this line was cut" from "this is the whole line", which is the difference between a
      // truncated stack trace and a real one.
      const bound = sink.records.find(
        (record) => record.event === 'desktop.sidecar.output.truncated',
      );
      expect(Number(bound?.data?.boundBytes)).toBe(MAX_PENDING_BUFFER);
      expect(Number(bound?.data?.heldBytes)).toBeGreaterThanOrEqual(MAX_PENDING_BUFFER);
    } finally {
      await child.stop();
    }
  });

  it('still reports the line that follows, so the cut does not swallow the stream', async () => {
    const { logger, sink } = capturingLogger();
    const child = await nodeSidecarSpawner(logger)({
      ...plan(),
      executable: process.execPath,
      args: ['-e', NOISY_SCRIPT],
      cwd: process.cwd(),
      baseUrl: 'http://127.0.0.1:1',
    });

    try {
      await waitUntil(
        () => sink.records.some((record) => record.message.includes('api-listening')),
        6_000,
        'the line after the truncated run to be captured',
      );
    } finally {
      await child.stop();
    }
  });
});

// ── 2. concurrent start/stop ───────────────────────────────────────────────

describe('a stop that races a spawn', () => {
  it('stops the child it cannot adopt, rather than leaking it', async () => {
    const { logger } = capturingLogger();
    const child = fakeChild(9001);
    // A gate the test opens by hand, so the race is an ordering rather than a coincidence.
    const gate = { release: (): void => {} };
    const spawned = new Promise<void>((resolve) => {
      gate.release = resolve;
    });

    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      // The spawn does not resolve until this test says so, which is what makes the race an
      // ordering rather than a coincidence.
      spawn: async () => {
        await spawned;
        return child;
      },
      health: async () => true,
      logger,
    });

    const starting = supervisor.start();
    await waitUntil(() => supervisor.currentState() === 'starting', 2_000, 'the spawn to start');

    // The user asks the application to quit while the API is still being launched.
    await supervisor.stop();
    expect(supervisor.currentState()).toBe('stopped');

    gate.release();
    await expect(starting).rejects.toThrow(/abandoned while it was spawning/);

    // The process exists and cannot be adopted, so it must be told to leave. Without this the
    // child runs on with no supervisor and no `stop()` able to reach it.
    expect(child.calls).toContain('stop');
    expect(supervisor.currentState()).toBe('stopped');
    expect(supervisor.status().pid).toBeNull();
  });
});

describe('stopping', () => {
  it('is idempotent: a second stop does not signal a second time', async () => {
    const child = fakeChild();
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => child,
      health: async () => true,
    });

    await supervisor.start();
    await supervisor.stop();
    await supervisor.stop();

    expect(child.calls).toEqual(['stop']);
    expect(supervisor.currentState()).toBe('stopped');
  });

  it('leaves no process behind when the start was already stopped', async () => {
    const child = fakeChild();
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => child,
      health: async () => true,
    });
    await supervisor.start();
    const pid = supervisor.status().pid;
    await supervisor.stop();
    expect(supervisor.status().pid).toBeNull();
    expect(pid).toBe(4242);
  });
});

// ── 3. IPC failures stay typed and bounded ─────────────────────────────────

describe('an IPC command failure', () => {
  it('refuses a command that is not in the allow-list, before invoking anything', async () => {
    const invoked: string[] = [];
    const bridge = createShellBridge(async <T>(command: string): Promise<T> => {
      invoked.push(command);
      return undefined as T;
    });

    expect(() => assertShellCommand('process_spawn')).toThrow(
      /not in the desktop command allow-list/,
    );
    // A declared command still reaches the shell, so the refusal above is the allow-list and not
    // a bridge that never invokes anything.
    await bridge.status();
    expect(invoked).toEqual(['shell_status']);
    // And nothing that could start, signal or enumerate a process is in the surface at all: the
    // shell supervises the API, the interface may only read the report about it.
    expect(
      SHELL_COMMANDS.some((command) => /spawn|exec|process|kill|signal|ps_/.test(command)),
    ).toBe(false);
  });

  it('replaces a raw transport error with a curated one that carries none of it', async () => {
    const leaky =
      'ENOENT: no such file or directory, open C:\\Users\\omid\\AppData\\master-trade.db';
    const bridge = createShellBridge(async () => {
      throw new Error(leaky);
    });

    const failure = await bridge.hideWindow().then(
      () => null,
      (error: unknown) => error as AppError,
    );
    expect(failure).toBeInstanceOf(AppError);
    expect(failure?.code).toBe('PROVIDER_UNAVAILABLE');
    expect(failure?.details?.command).toBe('window_hide');
    // The whole point: the transport's text — which names a user's directory — is not repeated.
    expect(failure?.message).not.toContain('C:\\');
    expect(failure?.message).not.toContain('AppData');
    expect(JSON.stringify(failure?.details)).not.toContain('AppData');
  });

  it('passes an already-typed failure through, so the reason survives', async () => {
    const original = new AppError('VALIDATION_FAILED', 'the key is not a known credential name');
    const bridge = createShellBridge(async () => {
      throw original;
    });

    const failure = await bridge.secureStore.get('unknown-key').then(
      () => null,
      (error: unknown) => error as AppError,
    );
    // A malformed key is refused by the frontend's own validator before the shell is called;
    // a refused credential *from* the shell keeps its code, because it is already curated.
    expect(failure?.code).toBe('VALIDATION_FAILED');
  });

  it('refuses a malformed key without asking the shell at all', async () => {
    const invoked: string[] = [];
    const bridge = createShellBridge(async <T>(command: string): Promise<T> => {
      invoked.push(command);
      return null as T;
    });
    await expect(bridge.secureStore.get('../escape')).rejects.toThrow(/namespaced under/);
    expect(invoked).toEqual([]);
  });

  it('keeps the browser unable to reach native storage or an updater', async () => {
    const bridge = browserShellBridge();
    await expect(bridge.secureStore.set('provider-token', 'value')).rejects.toThrow(
      /only available in the desktop shell/,
    );
    await expect(bridge.handshake()).rejects.toThrow(/only available in the desktop shell/);
    // Reads answer honestly rather than throwing: this runtime simply has no keychain.
    await expect(bridge.secureStore.get('provider-token')).resolves.toBeNull();
    await expect(bridge.secureStore.has('provider-token')).resolves.toBe(false);

    const status = await bridge.status();
    expect(status.apiBaseUrl).toBeNull();
    expect(status.runtime.state).toBe('idle');
    // A browser never reports READY, from the same derivation the shell's status card uses.
    expect(desktopStartupState({ runtime: 'web', status, stopping: false }).state).toBe('STOPPED');
  });
});

// ── 4. no plaintext fallback for a secret ──────────────────────────────────

describe('the credential layer', () => {
  /**
   * The claim is negative — "a native failure is never downgraded to a file" — and the strongest
   * evidence for it is structural: the modules that hold credentials have no route to the
   * filesystem or the database at all, so a fallback could not be written without adding an
   * import a reviewer would see. Behavioural tests exist for the refusal itself in
   * `desktop-secure-storage.test.ts`; this is the invariant behind them.
   */
  const CREDENTIAL_MODULES = [
    'src/desktop/secure-store.ts',
    'src/desktop/credential-vault.ts',
    'packages/shared/src/desktop/secrets.ts',
    'web/src/desktop/bridge.ts',
  ];

  const STORAGE_IMPORT =
    /\bfrom\s+['"](?:node:fs(?:\/promises)?|node:path|node:child_process|[^'"]*\/(?:data-paths|file-store|database|managed-files|db)\.js)['"]/;

  it('can reach neither the filesystem nor the database', async () => {
    for (const module of CREDENTIAL_MODULES) {
      const source = await readFile(module, 'utf8');
      expect(STORAGE_IMPORT.test(source), `${module} imports a storage module`).toBe(false);
    }
  });

  it('has no file-writing call anywhere in the boundary', async () => {
    for (const module of CREDENTIAL_MODULES) {
      const source = await readFile(module, 'utf8');
      expect(/\b(writeFile|appendFile|createWriteStream|mkdir)\b/.test(source), module).toBe(false);
    }
  });
});

// ── 5. the build-version handshake ─────────────────────────────────────────

describe('the build-version handshake', () => {
  it('declares the four answers the phase requires, and one compatible one', () => {
    expect([...HANDSHAKE_STATES]).toEqual([
      'VERSION_OK',
      'VERSION_MISMATCH',
      'VERSION_UNAVAILABLE',
      'VERSION_CHECK_FAILED',
    ]);
    // Exactly one of the four is compatible, and it is the one equality produces: "compatible"
    // is a property of the state, not a judgement any caller makes for itself.
    expect(COMPATIBLE_HANDSHAKE_STATES).toEqual(['VERSION_OK']);
    expect(isHandshakeCompatible(decideHandshake('1.0.0', '1.0.0'))).toBe(true);
    for (const state of HANDSHAKE_STATES.filter((entry) => entry !== 'VERSION_OK')) {
      expect(
        isHandshakeCompatible({
          state,
          expected: null,
          reported: null,
          reason: null,
          compatible: true,
        }),
      ).toBe(false);
    }
  });

  it('accepts the same build', () => {
    const result = decideHandshake('0.6.0', '0.6.0');
    expect(result.state).toBe('VERSION_OK');
    expect(result.compatible).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.expected).toBe('0.6.0');
    expect(result.reported).toBe('0.6.0');
  });

  it('normalizes both sides, so a `v` prefix or a short version is not a mismatch', () => {
    expect(decideHandshake('0.6.0', 'v0.6.0').state).toBe('VERSION_OK');
    expect(decideHandshake('v0.6.0', '0.6.0').state).toBe('VERSION_OK');
    expect(decideHandshake('0.6', '0.6.0').state).toBe('VERSION_OK');
    expect(decideHandshake('0.6.0+build.7', '0.6.0').state).toBe('VERSION_OK');
  });

  it('refuses an API from another build, and says which way round it is', () => {
    const older = decideHandshake('0.6.0', '0.5.0');
    expect(older.state).toBe('VERSION_MISMATCH');
    expect(older.compatible).toBe(false);
    expect(older.reason).toMatch(/API is version 0\.5\.0 and the shell is 0\.6\.0/);
    expect(older.reason).toMatch(/older/);

    const newer = decideHandshake('0.6.0', '0.7.0');
    expect(newer.state).toBe('VERSION_MISMATCH');
    expect(newer.reason).toMatch(/newer/);
  });

  it('refuses a pre-release in place of the release it precedes', () => {
    // `1.0.0-rc1 < 1.0.0` — a beta channel must never satisfy a stable shell.
    expect(decideHandshake('1.0.0', '1.0.0-rc1').state).toBe('VERSION_MISMATCH');
    expect(decideHandshake('1.0.0-rc1', '1.0.0').state).toBe('VERSION_MISMATCH');
    expect(decideHandshake('1.0.0-rc1', '1.0.0-rc1').state).toBe('VERSION_OK');
  });

  it('reports an API that answered without a version as unavailable, not as a mismatch', () => {
    for (const reported of [null, undefined, '', '   ']) {
      const result = decideHandshake('0.6.0', reported);
      expect(result.state).toBe('VERSION_UNAVAILABLE');
      expect(result.reported).toBeNull();
      expect(result.compatible).toBe(false);
    }
  });

  it('reports metadata it cannot read as a failed check, not as an absent one', () => {
    for (const reported of ['not-a-version', '2026-09-23', '1.2.3.4', 42, {}]) {
      expect(decideHandshake('0.6.0', reported).state).toBe('VERSION_CHECK_FAILED');
    }
    // A shell that cannot read its own version can never establish that the API matches it.
    expect(decideHandshake(undefined, '0.6.0').state).toBe('VERSION_CHECK_FAILED');
    expect(decideHandshake('nonsense', '0.6.0').state).toBe('VERSION_CHECK_FAILED');
  });

  it('throws the refusal rather than returning a state a caller might ignore', () => {
    expect(assertHandshakeCompatible(decideHandshake('0.6.0', '0.6.0')).state).toBe('VERSION_OK');
    expect(() => assertHandshakeCompatible(decideHandshake('0.6.0', '0.5.1'))).toThrow(
      /the API is version 0\.5\.1 and the shell is 0\.6\.0/,
    );
    try {
      assertHandshakeCompatible(decideHandshake('0.6.0', '0.5.1'));
    } catch (error) {
      expect((error as AppError).code).toBe('POLICY_VIOLATION');
      expect((error as AppError).details).toEqual({
        handshake: 'VERSION_MISMATCH',
        expected: '0.6.0',
        reported: '0.5.1',
      });
    }
  });

  describe('against a health endpoint', () => {
    function responder(body: unknown, status = 200): typeof fetch {
      return (async () =>
        ({
          ok: status >= 200 && status < 300,
          status,
          json: async () => body,
        }) as unknown as Response) as unknown as typeof fetch;
    }

    it('reads the version the API reports', async () => {
      const result = await checkVersionHandshake({
        expected: '0.6.0',
        plan: plan(),
        probe: versionProbeFromHealth(responder({ status: 'ok', version: '0.6.0' })),
      });
      expect(result.state).toBe('VERSION_OK');
    });

    it('treats a missing field as unavailable and a broken probe as a failed check', async () => {
      const missing = await checkVersionHandshake({
        expected: '0.6.0',
        plan: plan(),
        probe: versionProbeFromHealth(responder({ status: 'ok' })),
      });
      expect(missing.state).toBe('VERSION_UNAVAILABLE');

      const refused = await checkVersionHandshake({
        expected: '0.6.0',
        plan: plan(),
        probe: versionProbeFromHealth(responder({}, 401)),
      });
      expect(refused.state).toBe('VERSION_CHECK_FAILED');
      expect(refused.reason).toMatch(/status 401/);
    });

    it('does not repeat the endpoint in what it reports', async () => {
      const exploding = (async () => {
        throw new Error(`connect ECONNREFUSED ${plan().baseUrl}/v1/health`);
      }) as unknown as typeof fetch;
      const result = await checkVersionHandshake({
        expected: '0.6.0',
        plan: plan(),
        probe: versionProbeFromHealth(exploding),
      });
      expect(result.state).toBe('VERSION_CHECK_FAILED');
      expect(result.reason).not.toContain('http');
      expect(result.reason).not.toContain(String(DESKTOP_API_PORT));
    });

    it('turns a probe that throws into a decided state rather than a rejection', async () => {
      const result = await checkVersionHandshake({
        expected: '0.6.0',
        plan: plan(),
        probe: async () => {
          throw new AppError('INTERNAL', 'the probe is broken');
        },
      });
      expect(result.state).toBe('VERSION_CHECK_FAILED');
      expect(result.reason).toMatch(/the probe is broken/);
    });

    it('never asks when the shell cannot read its own version', async () => {
      let asked = false;
      const result = await checkVersionHandshake({
        expected: 'not-a-version',
        plan: plan(),
        probe: async () => {
          asked = true;
          return { ok: true, version: '0.6.0' };
        },
      });
      expect(asked).toBe(false);
      expect(result.state).toBe('VERSION_CHECK_FAILED');
    });
  });

  describe('as a supervisor gate', () => {
    function supervised(result: HandshakeResult) {
      return new SidecarSupervisor({
        plan: () => plan(),
        spawn: async () => fakeChild(),
        health: async () => true,
        verifyVersion: async () => result,
      });
    }

    it('refuses to report ready for an API from another build', async () => {
      const supervisor = supervised(decideHandshake('0.6.0', '0.5.0'));
      const seen: string[] = [];
      supervisor.subscribe((status) => {
        if (seen[seen.length - 1] !== status.state) seen.push(status.state);
      });

      await expect(supervisor.start()).rejects.toThrow(/the API is version 0\.5\.0/);
      expect(supervisor.currentState()).toBe('error');
      // Health answered, and readiness was still refused: the whole point of the third clause.
      expect(seen).not.toContain('ready');

      const view = desktopStartupState({
        runtime: 'desktop-tauri',
        status: failedStatus(supervisor.status().lastError ?? ''),
        stopping: false,
      });
      expect(view.state).toBe('ERROR');
      expect(view.reason).toMatch(/the API is version 0\.5\.0/);
      expect(view.apiBaseUrl).toBeNull();
    });

    it('proceeds when the API is the build the shell shipped', async () => {
      const supervisor = supervised(decideHandshake('0.6.0', '0.6.0'));
      await supervisor.start();
      expect(supervisor.currentState()).toBe('ready');
    });

    it('treats a probe that throws as a refusal, not as an unhandled rejection', async () => {
      const supervisor = new SidecarSupervisor({
        plan: () => plan(),
        spawn: async () => fakeChild(),
        health: async () => true,
        verifyVersion: async () => {
          throw new Error('the keychain refused');
        },
      });
      await expect(supervisor.start()).rejects.toThrow(/handshake could not be completed/);
      expect(supervisor.currentState()).toBe('error');
    });

    it('is skipped when the shell supplies no probe, which is how development runs', async () => {
      const supervisor = new SidecarSupervisor({
        plan: () => plan(),
        spawn: async () => fakeChild(),
        health: async () => true,
      });
      await supervisor.start();
      expect(supervisor.currentState()).toBe('ready');
    });
  });
});

// ── 6. a real child, for the parts a fake cannot prove ─────────────────────

describe('a real child process under the hardening rules', () => {
  it('is gone after a stop, and its pid is not reported afterwards', async () => {
    const script = "console.log('api-listening'); setInterval(() => {}, 1000);";
    const supervisor = new SidecarSupervisor({
      plan: () => ({
        ...plan(),
        executable: process.execPath,
        args: ['-e', script],
        cwd: process.cwd(),
      }),
      spawn: nodeSidecarSpawner(),
      health: async () => true,
      stopTimeoutMs: 8_000,
    });

    await supervisor.start();
    const pid = supervisor.status().pid as number;
    expect(await isProcessAlive(pid)).toBe(true);

    await supervisor.stop();
    await waitUntil(async () => !(await isProcessAlive(pid)), 4_000, 'the child to exit');
    expect(await isProcessAlive(pid)).toBe(false);
    expect(supervisor.status().pid).toBeNull();
  });
});
