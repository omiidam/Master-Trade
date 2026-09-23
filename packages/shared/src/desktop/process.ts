/**
 * The desktop API process — its states, said once.
 *
 * Phase 6.2 gives the desktop app a real process supervisor. Two implementations speak
 * about it: the Rust host, which actually spawns the bundled API, and the interface, which
 * has to tell a person whether the app is working. If each kept its own idea of what
 * "starting" or "crashed" means, the status card could report a state the shell never had.
 *
 * So the vocabulary lives here, in the shared surface, and everything else refers to it:
 *
 *   - `src-tauri/src/sidecar.rs` mirrors `PROCESS_STATES` literally, and
 *     `npm run desktop:verify` fails if the two lists drift apart (the same way
 *     `port.agreement` keeps one port honest);
 *   - `src/desktop/sidecar.ts` implements the transitions below — it owns a `SupervisorStatus`
 *     and moves it through these states, refusing an illegal move;
 *   - `./startup.js` narrows a `SupervisorStatus` into the five states a screen branches on,
 *     and `web/src/desktop/` consumes that, so the UI never inspects a process directly.
 *
 * Why this is not the same machine as `src/desktop/lifecycle.ts`
 * -------------------------------------------------------------
 * That machine sequences the **shell**: single-instance check → spawn → probe → show window →
 * ready → shut down. It is about window visibility, and it is the shell's own business. This
 * one describes the **child process** the shell supervises, which the shell and the interface
 * both need to reason about and which changes for reasons the window does not care about (a
 * crash and a restart, for instance, do not hide the window). One describes the host's
 * sequencing; the other describes a process's condition. Neither replaces the other, and
 * neither is a second copy of the other — `lifecycle.ts` never reports a process state and
 * this module never decides when a window appears.
 *
 * The rule the whole phase turns on
 * ---------------------------------
 * **A process that spawned is not an API that answers.** `starting` means the child exists;
 * `ready` means the child is running *and* `/v1/health` answered *and* the answer came from
 * this launch's credential. Nothing here may report `ready` on a spawn alone, and
 * `isProcessReady` is the only thing a caller should trust for that question.
 */

/**
 * The nine states a supervised API process passes through.
 *
 * Lowercase and hyphenated to match the codebase's existing state unions (`lifecycle.ts`'s
 * `sidecar-starting`, `shutting-down`), so the two read as one vocabulary rather than two.
 *
 * `crashed` and `restarting` are separate on purpose: "it died" and "we are bringing it back"
 * are different things to a person watching, and a UI that shows only the second hides an
 * incident.
 */
export type ProcessState =
  | 'idle'
  | 'starting'
  | 'health-checking'
  | 'ready'
  | 'stopping'
  | 'stopped'
  | 'crashed'
  | 'restarting'
  | 'error';

/**
 * The canonical list, in lifecycle order.
 *
 * Mirrored in Rust (`sidecar.rs`, `pub const STATES`) and compared by the desktop verifier:
 * adding a state here without adding it there is a parity failure, not a silent divergence.
 */
export const PROCESS_STATES: readonly ProcessState[] = [
  'idle',
  'starting',
  'health-checking',
  'ready',
  'stopping',
  'stopped',
  'crashed',
  'restarting',
  'error',
];

/**
 * Legal moves.
 *
 * Read it as: what may follow what. Three properties are deliberate:
 *
 *   - **`ready` is only ever reached from `health-checking`.** There is no edge from
 *     `starting` to `ready`, so a spawn that never answers health cannot be reported as
 *     ready even by accident — the state machine itself refuses it.
 *   - **`error` is reachable from every state, `idle` included**, because anything can fail —
 *     including building the launch plan, which happens before any process exists. A machine
 *     that could only fail *after* a spawn would have to leave that case as `idle`, which reads
 *     as "nothing has been tried" when in fact the attempt was refused.
 *   - **`stopped` is terminal for this launch's process**, and is the only state a restart
 *     starts from. A restart is a new process, not a resurrection of the old one.
 */
const TRANSITIONS: Readonly<Record<ProcessState, readonly ProcessState[]>> = {
  idle: ['starting', 'error'],
  starting: ['health-checking', 'crashed', 'error', 'stopping'],
  'health-checking': ['ready', 'crashed', 'error', 'stopping'],
  ready: ['stopping', 'crashed', 'error'],
  stopping: ['stopped', 'error'],
  stopped: ['starting'],
  crashed: ['restarting', 'error', 'stopping'],
  restarting: ['starting', 'error', 'stopping'],
  error: ['starting', 'stopping', 'stopped'],
};

/** True when `to` may follow `from`. */
export function canTransition(from: ProcessState, to: ProcessState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** The moves allowed out of a state; exposed so a test can walk the graph rather than trust it. */
export function transitionsFrom(from: ProcessState): readonly ProcessState[] {
  return TRANSITIONS[from];
}

/**
 * Move a status to a new state, or throw.
 *
 * The supervisor uses this rather than assigning `state` directly, so an illegal move is a
 * programming error that surfaces in a test rather than a status card that lies.
 */
export function transitionStatus(
  status: SupervisorStatus,
  to: ProcessState,
  patch: Partial<Omit<SupervisorStatus, 'state'>> = {},
): SupervisorStatus {
  if (!canTransition(status.state, to)) {
    throw new Error(`Illegal API process transition: ${status.state} -> ${to}`);
  }
  return { ...status, ...patch, state: to };
}

/** Whether the local API answered a liveness request from this launch's credential. */
export type ProcessHealth = 'unknown' | 'healthy' | 'unreachable';

/**
 * Everything the interface is told about the API process.
 *
 * This is a *report*, not a handle. There is no path, no command, no signal and no port
 * number here: a page cannot use these fields to reach the process, only to describe it.
 * That is what lets the same shape cross the IPC boundary safely.
 */
export interface SupervisorStatus {
  state: ProcessState;
  /** The child's process id, or null when there is no child. Informational only. */
  pid: number | null;
  health: ProcessHealth;
  /** Milliseconds since the current process became healthy; 0 before that. */
  uptimeMs: number;
  /** Restarts performed after unexpected exits, since the last stable period. */
  restartCount: number;
  /** A sentence safe to render verbatim. Never a stack trace, never a filesystem path. */
  lastError: string | null;
}

/** A supervisor that has not started anything yet. */
export function initialSupervisorStatus(): SupervisorStatus {
  return {
    state: 'idle',
    pid: null,
    health: 'unknown',
    uptimeMs: 0,
    restartCount: 0,
    lastError: null,
  };
}

/**
 * The only trustworthy readiness answer.
 *
 * `ready` already implies the process is running and health answered; requiring the health
 * field as well means a status assembled by hand (a test fixture, a future transport) still
 * cannot claim readiness without the evidence.
 */
export function isProcessReady(status: SupervisorStatus): boolean {
  return status.state === 'ready' && status.health === 'healthy';
}

/** True when the process is on its way up. */
export function isProcessPending(state: ProcessState): boolean {
  return state === 'starting' || state === 'health-checking' || state === 'restarting';
}

/** True when nothing further happens without an instruction or a failure. */
export function isProcessSettled(state: ProcessState): boolean {
  return state === 'ready' || state === 'stopped' || state === 'error';
}

/**
 * The five things a screen actually needs to say.
 *
 * `starting | ready | unavailable | recovering | error` — the mapping, not a second machine.
 * Two of these exist only because the supervisor knows more than a boolean:
 *
 *   - `recovering` is what a crash looks like to a person mid-restart. Without it the honest
 *     options would be "starting" (which hides that something broke) or "error" (which is
 *     false while a restart is still in flight);
 *   - `unavailable` is `stopped`/`idle`: there is no API and nothing is being done about it.
 *     In a browser this is the permanent state, and it is the truth there.
 */
export type DesktopRuntimeState = 'starting' | 'ready' | 'unavailable' | 'recovering' | 'error';

/** Narrow a process state into what a screen shows. Total: every state has an answer. */
export function runtimeStateOf(state: ProcessState): DesktopRuntimeState {
  switch (state) {
    case 'ready':
      return 'ready';
    case 'starting':
    case 'health-checking':
      return 'starting';
    case 'crashed':
    case 'restarting':
      return 'recovering';
    case 'error':
      return 'error';
    case 'idle':
    case 'stopping':
    case 'stopped':
      return 'unavailable';
    default: {
      // Exhaustiveness: a new state must be given a meaning here, not defaulted into
      // "unavailable" by a `default` that quietly swallows it.
      const unreachable: never = state;
      return unreachable;
    }
  }
}

/** A sentence a status card may render for the supervisor's state. */
export const PROCESS_STATE_LABEL: Readonly<Record<ProcessState, string>> = {
  idle: 'The local API has not been started.',
  starting: 'Starting the local API.',
  'health-checking': 'Waiting for the local API to answer.',
  ready: 'The local API is running.',
  stopping: 'Stopping the local API.',
  stopped: 'The local API is not running.',
  crashed: 'The local API stopped unexpectedly.',
  restarting: 'Restarting the local API.',
  error: 'The local API could not be started.',
};

/**
 * The bounds, in one place.
 *
 * Mirrored in Rust (`sidecar.rs`) and checked for agreement by the verifier. Each value is a
 * deadline somebody has to live with, so each is defended:
 *
 *   - `readyTimeoutMs` 30s: the API opens SQLite and runs migrations before it listens. Too
 *     short fails a first run on a slow disk; too long leaves a splash on screen after the
 *     app is obviously broken.
 *   - `pollIntervalMs` 250ms: fast enough that a normal start feels immediate, slow enough
 *     that a 30s wait is 120 requests rather than thousands.
 *   - `stopTimeoutMs` 10s: SQLite closes through its own shutdown path. Force-killing sooner
 *     turns a clean close into the WAL recovery the graceful path exists to avoid.
 *   - `maxRestarts` 3 with 500ms → 10s backoff: a crash loop is bounded and its delay grows,
 *     so a genuinely broken binary fails visibly instead of spawning forever.
 *   - `stableUptimeMs` 60s: a process that ran a minute then died is a new incident, not a
 *     continuation of the last one, so the restart budget is refreshed only after this much
 *     healthy uptime — otherwise a flapping process would retry forever at one per minute.
 */
export const PROCESS_POLICY = {
  readyTimeoutMs: 30_000,
  pollIntervalMs: 250,
  stopTimeoutMs: 10_000,
  maxRestarts: 3,
  baseBackoffMs: 500,
  maxBackoffMs: 10_000,
  stableUptimeMs: 60_000,
} as const;

/** The Rust mirror of `PROCESS_STATES`; the verifier compares the two lists. */
export function processStatesForParity(): string[] {
  return [...PROCESS_STATES];
}
