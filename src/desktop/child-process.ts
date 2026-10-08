/**
 * The Node implementation of the supervisor's spawn port.
 *
 * This is the only file in `src/` that imports `node:child_process`, and
 * `npm run desktop:verify` fails if a second one appears — the same one-spawner rule the
 * verifier already applies to Rust (`only sidecar.rs may spawn a process`). A second place
 * that can start a process is a second place that can start the wrong one.
 *
 * **Where this runs.** In a packaged app it does not: the Rust host spawns the bundled API
 * (`src-tauri/src/sidecar.rs`) because the WebView must hold no process capability. This
 * exists so the supervisor's policy in `./sidecar.ts` is exercised against a *real* child
 * process — graceful stop, forced termination, orphan prevention and stdout capture are
 * things a fake cannot honestly claim — and so the design the Rust side mirrors is executable
 * somewhere it can be tested. `docs/desktop-runtime.md` §11 states the split plainly.
 *
 * Two details worth the words:
 *
 *   - **Captured output is redacted.** The child is handed the per-launch token in its
 *     environment, so a backend that ever printed its own environment would put a credential
 *     in the shell log. Every forwarded line has the token replaced before it is logged.
 *   - **`stop()` resolves when the process is gone, not when the signal is sent.** A signal is
 *     a request. The supervisor decides the deadline and calls `kill()` if it passes; this
 *     port's job is to report the truth about whether the child actually left.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type { Logger } from '../../packages/shared/src/core/logging.js';
import type { SidecarPlan, SidecarProcess, SidecarSpawner } from './sidecar.js';

/** The longest captured line forwarded; a runaway process cannot grow the log without bound. */
export const MAX_CAPTURED_LINE = 4_000;

/**
 * The most output held back while waiting for a newline — 64 KiB, one pipe buffer.
 *
 * `MAX_CAPTURED_LINE` bounds each line that is *forwarded*, which is not the same thing as
 * bounding this buffer. A child that writes megabytes with no newline in them — a stack trace
 * printed without breaks, a `JSON.stringify` of something huge, a binary accidentally written to
 * stdout — accumulates here, because the split loop only drains on `\n`. Phase 6.6 found the
 * buffer unbounded: the shell process would grow to match whatever the API emitted. The pipe was
 * always drained (so there was no deadlock); memory was not.
 *
 * Reaching this bound forwards what has arrived, truncated, and keeps only the tail rather than
 * growing: a shell that dies reporting a fault is worse than a shell that reports a truncated
 * line and stays up. The record carries `truncated: true`, so the cut is visible rather than
 * reading as the whole story. The tail is kept — not just the head — because the end of an
 * over-long line is where the interesting part tends to be (`npm`-style progress spam is the
 * head; the error is the tail), and because discarding it would swallow whatever the child
 * writes next if it lands in the same read.
 */
export const MAX_PENDING_BUFFER = 64 * 1024;

/** Replace the launch credential anywhere it appears. */
export function redactToken(line: string, token: string): string {
  if (token.length === 0) return line;
  return line.split(token).join('[redacted]');
}

/**
 * The child, as the supervisor's port. Adds `exited()` so the supervisor can tell "died while
 * starting" from "starting slowly" without polling the OS.
 */
interface NodeSidecarProcess extends SidecarProcess {
  exited(): boolean;
}

/**
 * Build a spawner over `node:child_process`.
 *
 * The child is **not** detached: it stays in this process's group, so a normal shell exit
 * takes it with us. A detached child is exactly the orphan this phase is required to avoid.
 */
export function nodeSidecarSpawner(logger?: Logger): SidecarSpawner {
  return async (plan: SidecarPlan): Promise<NodeSidecarProcess> => {
    const child: ChildProcess = spawn(plan.executable, plan.args, {
      cwd: plan.cwd,
      env: { ...process.env, ...plan.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      // Never a shell: a string command line is how an argument becomes an injection.
      shell: false,
      windowsHide: true,
      detached: false,
    });

    let exited = false;

    const forward = (stream: NodeJS.ReadableStream, label: 'stdout' | 'stderr'): void => {
      let buffer = '';
      // True once the head of the current over-long, still-unterminated line has been forwarded.
      // It stops the bound from forwarding the same head on every read while the run continues.
      let headForwarded = false;
      stream.setEncoding('utf8');
      const emit = (line: string, truncated: boolean): void => {
        logger?.debug(
          redactToken(line, plan.token),
          { stream: label, port: plan.port, ...(truncated ? { truncated: true } : {}) },
          'desktop.sidecar.output',
        );
      };
      stream.on('data', (chunk: string) => {
        buffer += chunk;
        let index = buffer.indexOf('\n');
        while (index !== -1) {
          const line = buffer.slice(0, index);
          if (line.length <= MAX_CAPTURED_LINE && !headForwarded) {
            emit(line, false);
          } else {
            // An over-long line: forward its head once, then always its tail, so the part that
            // survived the cut is still visible and the next line is not swallowed with it.
            if (!headForwarded) emit(line.slice(0, MAX_CAPTURED_LINE), true);
            emit(line.length <= MAX_CAPTURED_LINE ? line : line.slice(-MAX_CAPTURED_LINE), true);
          }
          headForwarded = false;
          buffer = buffer.slice(index + 1);
          index = buffer.indexOf('\n');
        }
        // No newline arrived within the bound, so this line is not going to be completed here.
        // Reporting it truncated — and saying by how much — is the difference between a cut
        // stack trace and one that reads as the whole story. Only the tail is kept: the head has
        // already been forwarded, and dropping the tail would also drop the start of whatever
        // the child writes next if it shares this read.
        if (buffer.length > MAX_PENDING_BUFFER) {
          const held = buffer.length;
          if (!headForwarded) {
            emit(buffer.slice(0, MAX_CAPTURED_LINE), true);
            headForwarded = true;
          }
          buffer = buffer.slice(-MAX_CAPTURED_LINE);
          logger?.debug(
            'at least one line of child output had no newline within the capture bound and the ' +
              'excess was dropped',
            { stream: label, heldBytes: held, boundBytes: MAX_PENDING_BUFFER },
            'desktop.sidecar.output.truncated',
          );
        }
      });
      stream.on('error', () => {
        // A closed pipe is not an incident; the exit event reports what happened.
      });
    };
    // `stdio: ['ignore', 'pipe', 'pipe']` guarantees both, but a null check keeps the types
    // honest rather than asserting.
    if (child.stdout) forward(child.stdout, 'stdout');
    if (child.stderr) forward(child.stderr, 'stderr');

    const exitedPromise = new Promise<void>((resolve) => {
      child.once('exit', () => {
        exited = true;
        resolve();
      });
      child.once('error', () => {
        exited = true;
        resolve();
      });
    });

    return {
      pid: child.pid,
      exited: () => exited,
      async stop(): Promise<void> {
        if (exited) return;
        // Ask first. SIGTERM is the graceful path the API's own shutdown hook listens for.
        child.kill('SIGTERM');
        await exitedPromise;
      },
      kill(): void {
        if (exited) return;
        child.kill('SIGKILL');
      },
    };
  };
}

/** Wait for a pid to disappear. Used by tests to prove no orphan was left behind. */
export async function isProcessAlive(pid: number): Promise<boolean> {
  try {
    // Signal 0 performs the permission and existence checks without delivering anything.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/* ── one-shot execution ──────────────────────────────────────────────── */

/**
 * The child ran past its budget and was killed. A distinct type rather than
 * a message match: the caller distinguishes "too slow" (retry later, or
 * fall back) from "cannot run" (fall back), and an error string is the one
 * way to make that distinction quietly break.
 */
export class ChildTimeoutError extends Error {
  constructor() {
    super('the child process did not finish within its timeout');
    this.name = 'ChildTimeoutError';
  }
}

/** The child exited non-zero. The tail of its stderr travels as `detail`. */
export class ChildExitError extends Error {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  constructor(message: string, code: number | null, signal: NodeJS.Signals | null) {
    super(message);
    this.name = 'ChildExitError';
    this.code = code;
    this.signal = signal;
  }
}

/** A bounded one-shot request: run, capture stdout, die on the deadline. */
export interface OneShotRequest {
  command: string;
  args: readonly string[];
  /** Hard budget; past it the child is SIGKILLed and `ChildTimeoutError` rejects. */
  timeoutMs: number;
  /** Output cap; stdout beyond it is dropped, and only the cap is returned. */
  maxOutputBytes?: number;
}

/** The stderr tail kept for a failing child — enough to diagnose, bounded. */
const STDERR_TAIL_BYTES = 2_048;

/**
 * Run a short-lived child once and return its stdout — the one-shot sibling
 * of `nodeSidecarSpawner`, for callers that need an answer rather than a
 * supervisable process (the Needle 3 classifier is one).
 *
 * It lives here because this module is the *only* place in `src/` allowed to
 * start a process: `process.single-spawner.typescript` and security gate
 * SEC-082 both fail the build if `node:child_process` is imported anywhere
 * else. A second spawner is a second place that can start the wrong one.
 *
 * Never a shell (`shell: false`), never detached, never inherited env beyond
 * `process.env` — the caller passes explicit arguments or nothing runs.
 */
export function execOnce(request: OneShotRequest): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(request.command, [...request.args], {
      shell: false,
      windowsHide: true,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const cap = request.maxOutputBytes ?? 4 * 1024 * 1024;
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let spawnError: Error | null = null;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, request.timeoutMs);
    // The timer must never hold the event loop open on its own.
    timer.unref?.();

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      if (stdout.length < cap) stdout = (stdout + chunk).slice(0, cap);
    });
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      if (stderr.length < STDERR_TAIL_BYTES) stderr = (stderr + chunk).slice(-STDERR_TAIL_BYTES);
    });

    // A spawn that cannot start (ENOENT, permission) arrives here; the close
    // handler reports exits. One rejection, whichever arrives first.
    child.once('error', (error: Error) => {
      spawnError = error;
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      if (spawnError !== null || timedOut) {
        clearTimeout(timer);
        if (timedOut) reject(new ChildTimeoutError());
        return;
      }
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout });
        return;
      }
      reject(
        new ChildExitError(
          `the child exited with ${signal ?? `code ${String(code)}`}${
            stderr.length > 0 ? `: ${stderr.trim()}` : ''
          }`,
          code,
          signal,
        ),
      );
    });
  });
}
