/**
 * Sliding-window rate limiting.
 *
 * Used in front of external providers (market data, LLM) so we respect their
 * quotas instead of discovering them through failures. An injectable clock
 * keeps it testable without real waiting.
 */

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

export function rateLimitPolicyFrom(requestsPerMinute: number): RateLimitPolicy {
  return { limit: requestsPerMinute, windowMs: 60_000 };
}

export type RateLimitDecision =
  { allowed: true; remaining: number } | { allowed: false; retryAfterMs: number };

export class SlidingWindowRateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly policy: RateLimitPolicy,
    private readonly now: () => number = Date.now,
  ) {}

  tryAcquire(): RateLimitDecision {
    const current = this.now();
    const windowStart = current - this.policy.windowMs;
    this.timestamps = this.timestamps.filter((t) => t > windowStart);
    if (this.timestamps.length >= this.policy.limit) {
      const oldest = this.timestamps[0] as number;
      return { allowed: false, retryAfterMs: Math.max(1, oldest + this.policy.windowMs - current) };
    }
    this.timestamps.push(current);
    return { allowed: true, remaining: this.policy.limit - this.timestamps.length };
  }
}
