/**
 * Credit arithmetic — pure, integer, and the only place a balance is computed.
 *
 * Credits are the unit of consumption, and the rules that make them trustworthy are
 * arithmetic rules rather than service rules:
 *
 *   1. **Integer only.** A fractional credit makes a balance unable to be reconciled
 *      exactly, so a non-integer amount is refused rather than rounded.
 *   2. **A balance is never negative, and that is a function, not a hope.** `applyDelta`
 *      returns a refusal when a debit would cross zero, so the check cannot be skipped
 *      by a caller that forgot it and cannot be reordered by a caller that is racing.
 *   3. **No exceptions in the arithmetic.** Every operation returns a `Result`, which is
 *      why this module is testable without a database and why the boundary above it is
 *      the only place that turns a refusal into an HTTP status.
 *   4. **Every movement is bounded.** A single operation has a ceiling and so does a
 *      balance: hard cost control means a runaway loop cannot inflate an account, and
 *      a bound is the only thing that stops it.
 *   5. **A period is a UTC boundary, computed from the clock, never stored as a
 *      description of "today".** The key is derived, so two processes on the same
 *      instant always agree about which period they are in.
 *
 * The lifecycle implemented here is *reserve → settle → (release)*: a reservation debits
 * immediately so a concurrent request sees the reduced balance, and a release returns
 * the credits in full with its own ledger row. Charging at settlement instead would let
 * two requests both pass an affordability check against the same balance.
 */

import { AppError } from '../core/errors.js';
import type { ResetPolicy } from './plans.js';

/** What kind of movement a ledger row records. Closed set. */
export const LEDGER_KINDS = ['grant', 'consume', 'refund', 'expire', 'adjustment'] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

/**
 * Where a movement is in its lifecycle.
 *
 * `reserved` and `settled` both hold the debit; the difference is whether the work the
 * debit paid for has finished. `released` means the debit was returned, and a released
 * row must have a matching `refund` row — the pair is what a test asserts, because a
 * status that says "returned" with no row that returned it would be a lie.
 */
export const LEDGER_STATUSES = ['reserved', 'settled', 'released'] as const;
export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

/**
 * Why a movement happened. Closed set, and deliberately coarse.
 *
 * Free text is not an option: an adjustment note is written by an operator and could
 * name anything, so it lives in the audit record with its own redaction rules while the
 * ledger carries a code. The ledger is the accounting record and must stay machine
 * readable; the audit trail is the human record.
 */
export const CREDIT_REASONS = [
  'plan-allowance',
  'metered-usage',
  'operation-failed',
  'period-expiry',
  'admin-adjustment',
] as const;
export type CreditReason = (typeof CREDIT_REASONS)[number];

export const CREDIT_REASON_LABEL: Readonly<Record<CreditReason, string>> = {
  'plan-allowance': 'Period allowance',
  'metered-usage': 'Capability use',
  'operation-failed': 'Returned — the operation failed',
  'period-expiry': 'Expired at the end of the period',
  'admin-adjustment': 'Administrative adjustment',
};

export const CREDIT_REASON_MEANING: Readonly<Record<CreditReason, string>> = {
  'plan-allowance': 'Credits granted by the plan at the start of a period.',
  'metered-usage':
    'Credits held for one invocation of a metered capability. Held at reservation, kept when the capability completes, returned in full when it fails.',
  'operation-failed':
    'The reservation was returned because the capability did not complete. A failed operation costs nothing.',
  'period-expiry':
    'The allowance from a previous period expired. Free credits are a budget for a day, not a balance that accumulates.',
  'admin-adjustment':
    'A correction made by an operator under a recorded approval, with the reason in the audit trail rather than here.',
};

/** The largest single movement. A guard against a runaway grant or a typo. */
export const MAX_MOVEMENT = 100_000;

/** The largest a balance may reach. Hard cost control: no loop can inflate an account. */
export const MAX_BALANCE = 1_000_000;

export interface CreditMovement {
  kind: LedgerKind;
  reason: CreditReason;
  /** Positive magnitude for a movement. For `adjustment` the sign lives in `delta`. */
  amount: number;
}

/** A refusal, in the shape the repository and the service both speak. */
export type CreditRefusal = 'insufficient-credits' | 'zero-movement';

export type CreditOutcome =
  | { ok: true; balance: number }
  | { ok: false; reason: CreditRefusal; balance: number; shortfall: number };

/** Which sign a kind moves the balance by, given a positive magnitude. */
export function deltaFor(kind: LedgerKind, amount: number): number {
  switch (kind) {
    case 'grant':
    case 'refund':
      return amount;
    case 'consume':
    case 'expire':
      return -amount;
    case 'adjustment':
      // An adjustment carries its own sign: a correction can go either way.
      return amount;
  }
}

/**
 * The sign rule, stated once so a caller cannot pass a negative magnitude and expect a
 * debit. `adjustment` is the only kind allowed a signed amount, because a correction is
 * the only movement whose direction is decided by the operator.
 */
export function assertMovement(movement: CreditMovement): void {
  const { kind, amount } = movement;
  if (!Number.isInteger(amount)) {
    throw new AppError('VALIDATION_FAILED', 'A credit amount must be a whole number.', {
      details: { field: 'amount', kind },
    });
  }
  if (amount === 0) {
    throw new AppError('VALIDATION_FAILED', 'A credit movement of zero is not a movement.', {
      details: { field: 'amount', kind },
    });
  }
  if (Math.abs(amount) > MAX_MOVEMENT) {
    throw new AppError(
      'VALIDATION_FAILED',
      `A single credit movement is limited to ${MAX_MOVEMENT}.`,
      {
        details: { field: 'amount', kind, limit: MAX_MOVEMENT },
      },
    );
  }
  if (kind !== 'adjustment' && amount < 0) {
    throw new AppError('VALIDATION_FAILED', 'Only an adjustment may carry a signed amount.', {
      details: { field: 'amount', kind },
    });
  }
  if (kind === 'adjustment' && movement.reason !== 'admin-adjustment') {
    throw new AppError(
      'VALIDATION_FAILED',
      'An adjustment must record that it is administrative.',
      {
        details: { field: 'reason', kind },
      },
    );
  }
  if (kind !== 'adjustment' && movement.reason === 'admin-adjustment') {
    throw new AppError(
      'VALIDATION_FAILED',
      'Only an adjustment may carry the administrative reason.',
      {
        details: { field: 'reason', kind },
      },
    );
  }
}

/** True when the balance covers the cost. Cost 0 is always affordable. */
export function canAfford(balance: number, cost: number): boolean {
  return cost <= balance;
}

/**
 * Apply one movement to a balance.
 *
 * The negative-balance rule lives here and nowhere else, so there is exactly one
 * implementation to trust. `shortfall` is returned rather than thrown: the caller
 * decides what a shortfall means — a refusal with a 402, an upgrade prompt, or a
 * released reservation.
 */
export function applyDelta(balance: number, delta: number): CreditOutcome {
  const next = balance + delta;
  if (next < 0) {
    return { ok: false, reason: 'insufficient-credits', balance, shortfall: -next };
  }
  if (next > MAX_BALANCE) {
    throw new AppError('VALIDATION_FAILED', `A balance is limited to ${MAX_BALANCE} credits.`, {
      details: { field: 'balance', limit: MAX_BALANCE },
    });
  }
  return { ok: true, balance: next };
}

/** Apply a movement by kind and magnitude. Convenience over `applyDelta`. */
export function applyMovement(balance: number, movement: CreditMovement): CreditOutcome {
  assertMovement(movement);
  return applyDelta(balance, deltaFor(movement.kind, movement.amount));
}

/* ------------------------------------------------------------------ */
/* Periods                                                             */
/* ------------------------------------------------------------------ */

const MS_PER_DAY = 86_400_000;

export interface Period {
  /** Stable, derived from the clock. Used as the idempotency key of the period's grant. */
  key: string;
  /** Epoch ms of the period's first instant, inclusive. */
  startMs: number;
  /** Epoch ms of the next period's first instant. */
  endMs: number;
}

function utcDayStart(nowMs: number): number {
  return Math.floor(nowMs / MS_PER_DAY) * MS_PER_DAY;
}

function utcMonthStart(nowMs: number): number {
  const date = new Date(nowMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function nextUtcMonth(monthStart: number): number {
  const date = new Date(monthStart);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Which period `now` falls in, for a reset policy.
 *
 * `none` collapses to a single lifetime period. It exists so a plan that grants once and
 * never resets is expressible without a special case in the service.
 */
export function periodFor(nowMs: number, reset: ResetPolicy): Period {
  switch (reset.cadence) {
    case 'none':
      return { key: 'lifetime', startMs: 0, endMs: Number.MAX_SAFE_INTEGER };
    case 'daily': {
      const start = utcDayStart(nowMs);
      return { key: `d${isoDay(start)}`, startMs: start, endMs: start + MS_PER_DAY };
    }
    case 'monthly': {
      const start = utcMonthStart(nowMs);
      return {
        key: `m${new Date(start).toISOString().slice(0, 7)}`,
        startMs: start,
        endMs: nextUtcMonth(start),
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* The reset rule                                                      */
/* ------------------------------------------------------------------ */

export interface AccountPeriodState {
  /** The period the account's balance belongs to. `null` when nothing has been granted. */
  periodKey: string | null;
  balance: number;
}

export interface PeriodTurnover {
  /**
   * What to expire, or `null` when the account is already in this period.
   *
   * The expiry is named by the period whose balance is being expired, because that is
   * the period the operation id belongs to — so a second call, a concurrent call or a
   * call after a crash resolves to the same row rather than a second expiry.
   */
  expire: { amount: number; forPeriod: string } | null;
  /** What this period's allowance is worth, and the operation id that grants it. */
  grant: { amount: number; operationId: string };
}

/**
 * What to do about the period, given the account's state and the current clock.
 *
 * This is the **reset policy** as a pure function: on the first metered operation of a
 * new period the previous allowance expires, and the new one is granted. Doing it here
 * rather than in a scheduled job means there is no window in which an account holds a
 * stale allowance, and nothing to run when the application has not been opened.
 *
 * `grant` is returned on **every** call, including one where nothing turns over — the
 * grant's idempotency is its operation id, not this decision, so a turnover interrupted
 * after the expiry and before the grant is repaired by the next call instead of leaving
 * the account at zero for the rest of the period. That is why the two halves are
 * reported separately rather than as one "turnover" flag.
 */
export function planPeriodTurnover(
  state: AccountPeriodState,
  period: Period,
  periodCredits: number,
): PeriodTurnover {
  const alreadyInPeriod = state.periodKey === period.key;
  return {
    expire:
      alreadyInPeriod || state.periodKey === null || state.balance <= 0
        ? null
        : { amount: state.balance, forPeriod: state.periodKey },
    grant: { amount: periodCredits, operationId: grantOperationId(period.key) },
  };
}

/** The ledger operation id of a period's grant. Derived, so it cannot be chosen twice. */
export function grantOperationId(periodKey: string): string {
  return `grant:${periodKey}`;
}

/** The ledger operation id of a period's expiry. */
export function expiryOperationId(periodKey: string): string {
  return `expire:${periodKey}`;
}

/** The ledger operation id of the refund that releases a reservation. */
export function refundOperationId(operationId: string): string {
  return `refund:${operationId}`;
}

/* ------------------------------------------------------------------ */
/* Summaries                                                           */
/* ------------------------------------------------------------------ */

export interface LedgerTotals {
  granted: number;
  consumed: number;
  refunded: number;
  expired: number;
  adjusted: number;
  /** Net movement across every kind. Equals the balance when the history is complete. */
  net: number;
}

export interface LedgerLike {
  kind: LedgerKind;
  /** Signed, exactly as stored. */
  delta: number;
  status: LedgerStatus;
}

/**
 * Totals over a ledger.
 *
 * A `released` consumption is excluded from `consumed` and its refund is excluded from
 * `refunded`, so the pair cancels to zero rather than reporting a charge that was given
 * back as if it had been spent. A `reserved` consumption is included: the debit is real,
 * and reporting it as unspent would make a displayed balance disagree with the stored one.
 */
export function summariseLedger(entries: readonly LedgerLike[]): LedgerTotals {
  const totals: LedgerTotals = {
    granted: 0,
    consumed: 0,
    refunded: 0,
    expired: 0,
    adjusted: 0,
    net: 0,
  };
  for (const entry of entries) {
    const magnitude = Math.abs(entry.delta);
    switch (entry.kind) {
      case 'grant':
        totals.granted += magnitude;
        break;
      case 'consume':
        if (entry.status !== 'released') totals.consumed += magnitude;
        break;
      case 'refund':
        if (entry.status !== 'released') totals.refunded += magnitude;
        break;
      case 'expire':
        totals.expired += magnitude;
        break;
      case 'adjustment':
        totals.adjusted += entry.delta;
        break;
    }
    if (entry.kind === 'consume' && entry.status === 'released') continue;
    if (entry.kind === 'refund' && entry.status === 'released') continue;
    totals.net += entry.delta;
  }
  return totals;
}
