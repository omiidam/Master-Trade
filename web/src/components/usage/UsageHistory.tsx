import { History, Receipt } from 'lucide-react';
import type { UsageAttemptView, UsageHistoryData, UsageMovementView } from '@shared/api/contracts';
import { Badge, type BadgeTone } from '../Badge';
import { Card, CardDescription, CardHeader, CardTitle } from '../Card';
import { EmptyState } from '../EmptyState';
import { Tooltip } from '../Tooltip';
import {
  attemptStatusLabel,
  creditReasonMeaning,
  creditReasonLabel,
  denialHeading,
  formatDelta,
  ledgerKindLabel,
  ledgerStatusLabel,
  usageCategoryLabel,
} from './labels';
import { msg } from '../../i18n/index.js';

/**
 * The ledger and the metering log, as two lists rather than one.
 *
 * They answer different questions and merging them would answer neither:
 *
 *   - a **movement** is accounting — the balance changed, by this much, to this number;
 *   - an **attempt** is explanation — this capability was asked for, and this is what
 *     happened to it, including "nothing, because it was refused".
 *
 * Two rules the timeline keeps:
 *
 *   1. **A corrected charge is not hidden.** A released consumption and its refund are both
 *      shown, each labelled as returned, because a user who sees a charge disappear with no
 *      explanation has been told to trust an invisible process.
 *   2. **A refusal is evidence, not noise.** Refused attempts are listed with the same
 *      prominence, since "why did nothing happen" is usually answered by one of them.
 *
 * No balance is computed here. Each movement carries the `balanceAfter` the server stored
 * with it, so what is displayed is what happened rather than what this file could derive.
 */

const KIND_TONE: Readonly<Record<string, BadgeTone>> = {
  grant: 'success',
  consume: 'neutral',
  refund: 'info',
  expire: 'outline',
  adjustment: 'warning',
};

const ATTEMPT_TONE: Readonly<Record<string, BadgeTone>> = {
  reserved: 'info',
  settled: 'success',
  released: 'outline',
  refused: 'warning',
};

export interface CreditTransactionItemProps {
  movement: UsageMovementView;
  className?: string;
}

export function CreditTransactionItem({ movement, className }: CreditTransactionItemProps) {
  const returned = movement.status === 'released';
  return (
    <li
      className={
        className ??
        'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-2 last:border-b-0'
      }
    >
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={KIND_TONE[movement.kind] ?? 'neutral'}>
            {ledgerKindLabel(movement.kind)}
          </Badge>
          <span className="text-body text-text">{creditReasonLabel(movement.reason)}</span>
          {returned ? <Badge tone="outline">{msg('usage.returned')}</Badge> : null}
        </div>
        <p className="text-caption text-text-muted">{creditReasonMeaning(movement.reason)}</p>
        <p className="font-mono text-caption text-text-faint">
          {movement.id} · {movement.createdAt}
          {movement.feature === null ? '' : ` · ${movement.feature}`}
          {movement.correlationId === null ? '' : ` · ${movement.correlationId}`}
        </p>
      </div>
      <div className="text-right">
        <p
          className={
            returned
              ? 'text-body font-medium num text-text-muted'
              : movement.delta > 0
                ? 'text-body font-medium num text-success'
                : 'text-body font-medium num text-text'
          }
        >
          {formatDelta(movement.delta)}
        </p>
        <p className="text-caption num text-text-faint">
          {msg('usage.balance')} {movement.balanceAfter}
        </p>
        <Tooltip content={ledgerStatusLabel(movement.status)}>
          <span className="text-caption text-text-faint">{movement.status}</span>
        </Tooltip>
      </div>
    </li>
  );
}

export interface UsageHistoryProps {
  history: UsageHistoryData;
  className?: string;
}

export function UsageHistory({ history, className }: UsageHistoryProps) {
  const { movements, attempts, totals } = history;

  return (
    <Card className={className}>
      <CardHeader divider>
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <History size={16} aria-hidden className="text-primary" />
            {msg('usage.usageHistory')}
          </CardTitle>
          <CardDescription>{history.note}</CardDescription>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Badge tone="outline">
            {msg('usage.granted')} {totals.granted}
          </Badge>
          <Badge tone="outline">
            {msg('usage.consumed')} {totals.consumed}
          </Badge>
          <Badge tone="outline">
            {msg('usage.returned2')} {totals.refunded}
          </Badge>
          <Badge tone="outline">
            {msg('usage.expired')} {totals.expired}
          </Badge>
        </div>
      </CardHeader>

      {/*
        This card's body is full-bleed: a movement is a row whose rule runs the whole width of the
        card, so there is no single padded box to wrap it in. `CardContent` would have added a
        second horizontal inset on top of each row's own, which is why the header is the only part
        of this panel the card system takes over.
      */}
      <div className="px-4 pb-2 pt-4">
        <h4 className="flex items-center gap-1.5 text-caption font-semibold text-text-muted uppercase">
          <Receipt size={14} aria-hidden className="text-text-muted" />
          {msg('usage.movements')}
        </h4>
      </div>
      {movements.length === 0 ? (
        <div className="px-4 pb-4">
          <EmptyState
            title={msg('usage.noMovementsYet')}
            description={msg('usageHistory.nothingHasBeenGrantedHeldReturnedOrAdjusted')}
            hint={msg('usageHistory.theFirstAgentTurnOfThePeriodGrants')}
          />
        </div>
      ) : (
        <ul role="list">
          {movements.map((movement) => (
            <CreditTransactionItem key={movement.id} movement={movement} />
          ))}
        </ul>
      )}

      <div className="px-4 pb-2 pt-4">
        <h4 className="text-caption font-semibold text-text-muted uppercase">
          {msg('realtime.attempts')}
        </h4>
        <p className="text-caption text-text-faint">
          {msg('usage.everyInvocationIncludingTheOnesThat')}
        </p>
      </div>
      {attempts.length === 0 ? (
        <div className="px-4 pb-4">
          <EmptyState
            title={msg('usage.noAttemptsYet')}
            description={msg('usageHistory.noMeteredCapabilityHasBeenInvokedOnThis')}
          />
        </div>
      ) : (
        <ul role="list" className="pb-2">
          {attempts.map((attempt) => (
            <AttemptRow key={attempt.id} attempt={attempt} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function AttemptRow({ attempt }: { attempt: UsageAttemptView }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-2 last:border-b-0">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={ATTEMPT_TONE[attempt.status] ?? 'neutral'}>
            {attemptStatusLabel(attempt.status)}
          </Badge>
          <span className="text-body text-text">{attempt.feature}</span>
          <span className="text-caption text-text-faint">
            {usageCategoryLabel(attempt.category)}
          </span>
          {attempt.denial === null ? null : (
            <Badge tone="warning">{denialHeading(attempt.denial)}</Badge>
          )}
        </div>
        {attempt.note === null ? null : (
          <p className="text-caption text-text-muted">{attempt.note}</p>
        )}
        <p className="font-mono text-caption text-text-faint">
          {attempt.id} · {attempt.occurredAt}
          {attempt.settledAt === null ? '' : ` · settled ${attempt.settledAt}`}
        </p>
      </div>
      <p className="text-body num text-text-muted">
        {attempt.credits === 0 ? 'no charge' : `${attempt.credits} held`}
      </p>
    </li>
  );
}
