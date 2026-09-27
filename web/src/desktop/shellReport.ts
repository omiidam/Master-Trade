/**
 * The shell's status: one report, one poll — Phase 8.1.3.
 *
 * The shell answers "where am I running, and how is the local API doing" asynchronously, and every
 * screen that needs the answer used to ask it itself (`useShellStatus()` opened its own poll on every
 * mount). Two screens asking separately is two answers: the topbar and Settings each held their own
 * snapshot, each on its own cadence, so for up to a poll interval the shell could be *loading* in one
 * place and *ready* in another — the same product describing itself two ways, which is exactly what
 * "handle the shell's states consistently" is asking to stop.
 *
 * So the report is fetched once, here, and read by everyone. The hook is a subscription to this; the
 * derivation from a report to what a screen renders stays pure and stays in `useShellStatus`, which is
 * what lets a caller apply its own `stopping` flag to a report everyone shares without the shared half
 * disagreeing.
 *
 * Polling is reference-counted, and stops when the last reader leaves. That is not an optimisation —
 * a module that starts a timer as soon as it is imported would keep a test process alive, and a
 * background shell that keeps asking a local process questions after the interface is gone is work
 * nobody asked for.
 */

import type { ShellStatus } from '@shared/desktop/ipc';
import { currentRuntime, type DesktopRuntime } from '@shared/desktop/runtime';
import { desktopStartupState, isStartupSettled } from '@shared/desktop/startup';
import { inDesktopShell, shellStatus } from './bridge.js';

/**
 * How often the shell is asked how the local API is doing.
 *
 * Two cadences, because the answer stops being interesting once it stops changing — but never
 * becomes *uninteresting*, which is the point. A supervisor can crash the API an hour after a
 * clean start, so a single request at mount would leave the interface claiming "connected" for
 * the rest of the session. Polling at 1s while something is happening and 5s once it has settled
 * keeps a crash visible without asking a local process 86,400 questions a day.
 */
export const SHELL_POLL_PENDING_MS = 1_000;
export const SHELL_POLL_SETTLED_MS = 5_000;

/**
 * The raw answer, before anybody's opinion of it.
 *
 * `loading` is "no answer has arrived yet", which is not the same as "the shell said nothing", and
 * `error` is a refused call — the state the hook turns into `ERROR` rather than leaving a spinner up.
 */
export interface ShellReport {
  loading: boolean;
  inShell: boolean;
  status: ShellStatus | null;
  /** The bridge refused to answer; the string is safe to show. */
  error: string | null;
  runtime: DesktopRuntime;
}

/** The report before the shell has said anything. */
export function initialShellReport(): ShellReport {
  return {
    loading: true,
    inShell: inDesktopShell(),
    status: null,
    error: null,
    runtime: currentRuntime(),
  };
}

let report: ShellReport = initialShellReport();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

/** The current report. A stable reference between polls, which is what a store snapshot must be. */
export function shellStatusReport(): ShellReport {
  return report;
}

/**
 * Read the report, and keep it fresh while somebody is reading it.
 *
 * The first subscriber starts the poll and the last one stops it, so the timer's life is the
 * interface's life. A refused call is not retried on a timer: it is a contract mismatch, and asking
 * twice a second would turn a clear failure into a busy loop. A *later* subscriber does ask again,
 * which is the same latitude a remount had before — a screen opened after the shell settled is
 * entitled to its own answer.
 */
export function subscribeToShellStatus(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) void poll();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
}

/** Publish, and tell every reader. */
function publish(next: ShellReport): void {
  report = next;
  for (const listener of listeners) listener();
}

/**
 * The interval the *next* question is worth.
 *
 * Settled-ness is read from the report alone, with `stopping` at its default: the cadence belongs to
 * the poll, and a flag one caller passes for its own rendering is not something a shared timer should
 * be re-tuned by. `RECOVERING` counts as unsettled (`isStartupSettled` says so), which is the point —
 * a screen that waited five seconds to notice a recovery would show stale content over a downed API.
 */
function nextPollDelayMs(current: ShellReport): number {
  if (current.loading || current.status === null) return SHELL_POLL_PENDING_MS;
  const startup = desktopStartupState({
    runtime: current.runtime,
    status: current.status,
    stopping: false,
  });
  return isStartupSettled(startup.state) ? SHELL_POLL_SETTLED_MS : SHELL_POLL_PENDING_MS;
}

async function poll(): Promise<void> {
  if (listeners.size === 0) return;
  try {
    const status = await shellStatus();
    if (listeners.size === 0) return;
    const next: ShellReport = {
      loading: false,
      inShell: inDesktopShell(),
      status,
      error: null,
      runtime: currentRuntime(),
    };
    publish(next);
    schedule(next);
  } catch (error: unknown) {
    if (listeners.size === 0) return;
    const message = error instanceof Error ? error.message : 'the shell did not answer';
    publish({ ...initialShellReport(), loading: false, error: message });
    // Deliberately no reschedule: see `subscribeToShellStatus`.
  }
}

function schedule(from: ShellReport): void {
  if (listeners.size === 0) return;
  timer = setTimeout(() => {
    timer = undefined;
    void poll();
  }, nextPollDelayMs(from));
}
