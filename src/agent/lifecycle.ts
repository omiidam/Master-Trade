/**
 * Agent lifecycle — explicit, testable state machine.
 *
 *   IDLE -> LOADING -> READY -> RUNNING -> RESPONDING -> IDLE
 *                                     \-> BLOCKED (safety/permission) -> IDLE
 *
 * Illegal transitions throw, so bugs surface in tests instead of production.
 */

export type AgentState = 'IDLE' | 'LOADING' | 'READY' | 'RUNNING' | 'RESPONDING' | 'BLOCKED';

const TRANSITIONS: Record<AgentState, AgentState[]> = {
  IDLE: ['LOADING'],
  LOADING: ['READY'],
  READY: ['RUNNING'],
  RUNNING: ['RESPONDING', 'BLOCKED'],
  // A safety/permission failure can surface while responding too: a tool the
  // model referenced may not exist or may be denied. Blocking must stay legal.
  RESPONDING: ['IDLE', 'BLOCKED'],
  BLOCKED: ['IDLE'],
};

export class AgentLifecycle {
  private state: AgentState = 'IDLE';

  current(): AgentState {
    return this.state;
  }

  /** Attempt a transition; throws on illegal moves. */
  transitionTo(next: AgentState): void {
    const allowed = TRANSITIONS[this.state];
    if (!allowed.includes(next)) {
      throw new Error(`Illegal lifecycle transition: ${this.state} -> ${next}`);
    }
    this.state = next;
  }

  /** Convenience: full legal startup path. */
  start(): void {
    this.transitionTo('LOADING');
    this.transitionTo('READY');
  }

  reset(): void {
    if (this.state !== 'IDLE') this.transitionTo('IDLE');
  }
}
