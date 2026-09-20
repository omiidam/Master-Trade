/**
 * Desktop application lifecycle.
 *
 * A desktop shell has an ordering problem a server does not: the window must not
 * appear before the API is answerable, the API must not start before the single
 * instance check has passed, and quitting must not race the database. Sequencing
 * bugs here show up as "the app opened blank once", which is exactly the kind of
 * bug that survives review.
 *
 * So the sequence is a state machine, like `AgentLifecycle`: illegal transitions
 * throw, and the order itself is data (`STARTUP_ORDER`) that the tests and the
 * docs both read.
 */

export type DesktopState =
  | 'idle'
  | 'instance-checked'
  | 'sidecar-starting'
  | 'sidecar-ready'
  | 'window-shown'
  | 'ready'
  | 'failed'
  | 'shutting-down'
  | 'stopped';

/** Legal transitions. `failed` is reachable from any started state. */
const TRANSITIONS: Record<DesktopState, DesktopState[]> = {
  idle: ['instance-checked'],
  'instance-checked': ['sidecar-starting'],
  'sidecar-starting': ['sidecar-ready', 'failed'],
  'sidecar-ready': ['window-shown', 'failed'],
  'window-shown': ['ready', 'failed'],
  ready: ['shutting-down', 'failed'],
  failed: ['shutting-down', 'stopped'],
  'shutting-down': ['stopped'],
  stopped: [],
};

/**
 * Why the order is what it is. Each step is here for a reason that a faster
 * ordering would break; the test asserts the machine follows this list.
 */
export const STARTUP_ORDER: readonly { state: DesktopState; why: string }[] = [
  {
    state: 'instance-checked',
    why: 'a second instance must exit before it opens a second database handle or a second sidecar',
  },
  {
    state: 'sidecar-starting',
    why: 'the API process is spawned with the per-launch token before anything can call it',
  },
  {
    state: 'sidecar-ready',
    why: 'liveness is confirmed by polling /v1/health, so the window never renders against a dead API',
  },
  {
    state: 'window-shown',
    why: 'the window appears only once the API answers, so a slow start shows a splash, not a blank page',
  },
  {
    state: 'ready',
    why: 'the frontend has received the handshake (base URL + token) and the shell is interactive',
  },
];

export interface ShutdownOrder {
  state: DesktopState;
  why: string;
}

/** The reverse order, for the same reasons. */
export const SHUTDOWN_ORDER: readonly ShutdownOrder[] = [
  { state: 'shutting-down', why: 'stop accepting work: the UI is told to stop issuing requests' },
  {
    state: 'stopped',
    why: 'the sidecar is signalled and awaited so the database closes cleanly before the shell exits',
  },
];

export class DesktopLifecycle {
  private state: DesktopState = 'idle';
  private failure: string | null = null;

  current(): DesktopState {
    return this.state;
  }

  reason(): string | null {
    return this.failure;
  }

  /** Attempt a transition; throws on illegal moves. */
  transitionTo(next: DesktopState): void {
    if (!TRANSITIONS[this.state].includes(next)) {
      throw new Error(`Illegal desktop lifecycle transition: ${this.state} -> ${next}`);
    }
    this.state = next;
    if (next !== 'failed') this.failure = null;
  }

  /** Startup path, step by step. */
  startup(): void {
    for (const step of STARTUP_ORDER) this.transitionTo(step.state);
  }

  /** Mark the shell failed from wherever it was, recording why. */
  fail(reason: string): void {
    if (this.state === 'failed' || this.state === 'stopped') {
      this.failure = reason;
      return;
    }
    this.transitionTo('failed');
    this.failure = reason;
  }

  /** Shutdown path, step by step, from any state that can reach it. */
  shutdown(): void {
    if (this.state === 'stopped') return;
    if (this.state === 'failed' || this.state === 'idle' || this.state === 'instance-checked') {
      // Nothing was started: going straight to stopped is the honest end state.
      this.state = 'stopped';
      return;
    }
    for (const step of SHUTDOWN_ORDER) this.transitionTo(step.state);
  }

  isReady(): boolean {
    return this.state === 'ready';
  }

  /** True once the API is answerable, which is what the window waits for. */
  isApiAnswerable(): boolean {
    return (
      this.state === 'sidecar-ready' || this.state === 'window-shown' || this.state === 'ready'
    );
  }
}
