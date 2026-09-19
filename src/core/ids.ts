/**
 * Identifier factory.
 *
 * One correlation id is minted at the API boundary and threaded through the
 * backend, agent, tools, jobs and logs so a user-visible action can be traced
 * end to end. Injectable entropy keeps tests deterministic.
 */

export type CorrelationId = string;

export interface IdFactoryOptions {
  prefix?: string;
  entropy?: () => number;
  now?: () => number;
}

export class IdFactory {
  private counter = 0;
  private readonly prefix: string;
  private readonly entropy: () => number;
  private readonly now: () => number;

  constructor(options: IdFactoryOptions = {}) {
    this.prefix = options.prefix ?? 'mt';
    this.entropy = options.entropy ?? Math.random;
    this.now = options.now ?? Date.now;
  }

  /** Correlation id for one user-visible operation. */
  correlationId(): CorrelationId {
    return `${this.prefix}_c${this.stamp()}`;
  }

  /** Prefixed unique id for a domain object (job, memory record, file, ...). */
  id(kind: string): string {
    return `${kind}_${this.stamp()}`;
  }

  private stamp(): string {
    this.counter += 1;
    const suffix = Math.floor(this.entropy() * 1e9).toString(36);
    return `${this.now().toString(36)}${this.counter.toString(36)}${suffix}`;
  }
}

/** Process-wide factory; tests construct their own seeded instances. */
export const ids = new IdFactory();
