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
      stream.setEncoding('utf8');
      stream.on('data', (chunk: string) => {
        buffer += chunk;
        let index = buffer.indexOf('\n');
        while (index !== -1) {
          const line = buffer.slice(0, index).slice(0, MAX_CAPTURED_LINE);
          buffer = buffer.slice(index + 1);
          logger?.debug(
            redactToken(line, plan.token),
            { stream: label, port: plan.port },
            'desktop.sidecar.output',
          );
          index = buffer.indexOf('\n');
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
