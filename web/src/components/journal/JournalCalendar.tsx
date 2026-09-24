import { CalendarDays, ChevronLeft, ChevronRight, Rows3 } from 'lucide-react';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { EmptyState } from '../EmptyState';
import { Card, CardContent, CardDescription, CardHeader, CardTile, CardTitle } from '../Card';
import { RuleComplianceBadge } from './RuleComplianceBadge';
import { SetupBadge } from './SetupBadge';
import { MistakeTag } from './MistakeTag';
import { cn } from '../../lib/cn';
import { formatTimestamp } from '../../lib/format';
import { CALENDAR_DAY_STATE_LABEL, RESULT_LABEL, setupLabel } from '../../mock/journal';
import type { CalendarDayState, JournalCalendarDay, JournalTrade } from '../../mock/journal';

const STATE_STYLE: Record<CalendarDayState, string> = {
  win: 'border-success-border bg-primary-soft/60',
  loss: 'border-danger-border bg-danger-soft/60',
  breakeven: 'border-border-strong bg-surface-raised/60',
  mixed: 'border-warning-border bg-warning-soft/50',
  open: 'border-info-border bg-info-soft/60',
  flat: 'border-border bg-surface-sunken',
};

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Monday-first index for the first of the month (0 = Monday). */
function leadingBlanks(year: number, month: number): number {
  const weekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return (weekday + 6) % 7;
}

function formatDayLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatNetR(value: number | null): string {
  if (value === null) return 'not scored';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(2)}R`;
}

export interface JournalCalendarProps {
  days: readonly JournalCalendarDay[];
  month: { year: number; month: number };
  trades: readonly JournalTrade[];
  view: 'month' | 'week';
  onViewChange: (view: 'month' | 'week') => void;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  className?: string;
}

/**
 * Monthly and weekly journal calendar.
 *
 * The calendar answers a question the table cannot: what did a *day* look like —
 * how much risk was committed, whether the rules held, and how it felt. Three
 * details matter: a day with no trades is drawn as an explicit flat cell rather
 * than a blank one; a day whose trades were never scored reports "not scored"
 * rather than a zero; and the emotional score is labelled as self-reported, so it
 * is never read as a measurement.
 */
export function JournalCalendar({
  days,
  month,
  trades,
  view,
  onViewChange,
  selectedDate,
  onSelectDate,
  className,
}: JournalCalendarProps) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const total = daysInMonth(month.year, month.month);
  const blanks = leadingBlanks(month.year, month.month);

  const cells: Array<{ date: string | null; dayNumber: number | null }> = [
    ...Array.from({ length: blanks }, () => ({ date: null, dayNumber: null })),
    ...Array.from({ length: total }, (_, index) => ({
      date: isoDate(month.year, month.month, index + 1),
      dayNumber: index + 1,
    })),
  ];

  // The week view centres on the selected date, falling back to the last day of the month.
  const anchorDate = selectedDate ?? isoDate(month.year, month.month, total);
  const anchor = new Date(`${anchorDate}T00:00:00Z`);
  const anchorIndex = (anchor.getUTCDay() + 6) % 7;
  const weekStart = new Date(anchor.getTime() - anchorIndex * 24 * 60 * 60 * 1000);
  const weekCells = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart.getTime() + index * 24 * 60 * 60 * 1000);
    const iso = date.toISOString().slice(0, 10);
    return { date: iso, dayNumber: date.getUTCDate() };
  });

  const shown = view === 'month' ? cells : weekCells;
  const selectedDay = selectedDate === null ? undefined : byDate.get(selectedDate);
  const selectedTrades =
    selectedDate === null
      ? []
      : trades.filter((trade) => trade.openedAt.slice(0, 10) === selectedDate);

  const monthDays = days.filter((day) =>
    day.date.startsWith(`${month.year}-${String(month.month).padStart(2, '0')}`),
  );
  const monthTrades = monthDays.reduce((sum, day) => sum + day.tradeCount, 0);
  const monthRisk = monthDays.reduce((sum, day) => sum + day.riskTotal, 0);

  return (
    <Card as="section" aria-label="Trading calendar" className={className}>
      <CardHeader divider>
        <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>
              {view === 'month'
                ? new Date(Date.UTC(month.year, month.month - 1, 1)).toLocaleDateString('en-GB', {
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })
                : `Week of ${formatDayLabel(weekCells[0]?.date ?? anchorDate)}`}
            </CardTitle>
            <CardDescription>
              {monthTrades} trades · {monthRisk.toLocaleString('en-US')} committed risk across{' '}
              {monthDays.length} trading {monthDays.length === 1 ? 'day' : 'days'} this month.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CardTile
              space="none"
              role="group"
              aria-label="Calendar view"
              className="inline-flex items-center gap-0.5 p-0.5"
            >
              {(
                [
                  { id: 'month', label: 'Month', icon: <CalendarDays size={13} aria-hidden /> },
                  { id: 'week', label: 'Week', icon: <Rows3 size={13} aria-hidden /> },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={view === option.id}
                  onClick={() => onViewChange(option.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] px-2.5 py-1 text-caption font-medium',
                    view === option.id
                      ? 'bg-surface-raised text-text shadow-panel'
                      : 'text-text-muted hover:text-text',
                  )}
                >
                  {option.icon}
                  {option.label}
                </button>
              ))}
            </CardTile>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSelectDate(null)}
              disabled={selectedDate === null}
              label="Clear the selected day"
            >
              Clear day
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <div className="mb-1 grid grid-cols-7 gap-1.5">
            {WEEKDAY_LABELS.map((label) => (
              <p key={label} className="px-1 text-caption font-semibold text-text-faint uppercase">
                {label}
              </p>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {shown.map((cell, index) => {
              if (cell.date === null || cell.dayNumber === null) {
                return (
                  <div
                    key={`blank-${index}`}
                    aria-hidden
                    className="min-h-[92px] rounded-[var(--radius-control)]"
                  />
                );
              }
              const day = byDate.get(cell.date);
              const state: CalendarDayState = day?.state ?? 'flat';
              const active = cell.date === selectedDate;
              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => onSelectDate(active ? null : cell.date)}
                  aria-pressed={active}
                  aria-label={
                    day
                      ? `${formatDayLabel(cell.date)}: ${day.tradeCount} trades, ${CALENDAR_DAY_STATE_LABEL[state]}, ${formatNetR(day.netR)}`
                      : `${formatDayLabel(cell.date)}: no trades recorded`
                  }
                  className={cn(
                    'flex min-h-[92px] flex-col gap-1 rounded-[var(--radius-control)] border p-1.5 text-start',
                    'transition-colors duration-[var(--duration-fast)]',
                    STATE_STYLE[state],
                    active ? 'ring-2 ring-[var(--color-focus)]' : 'hover:border-border-strong',
                  )}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="num text-caption text-text-muted">{cell.dayNumber}</span>
                    {day ? (
                      <span className="num text-caption text-text-faint">{day.tradeCount}t</span>
                    ) : (
                      <span className="text-caption text-text-faint">—</span>
                    )}
                  </span>
                  {day ? (
                    <>
                      <span
                        className={cn(
                          'num text-caption font-medium',
                          day.netR === null
                            ? 'text-text-faint'
                            : day.netR > 0
                              ? 'text-success'
                              : day.netR < 0
                                ? 'text-danger'
                                : 'text-text-muted',
                        )}
                      >
                        {formatNetR(day.netR)}
                      </span>
                      <span className="truncate text-caption text-text-faint">
                        {setupLabel(day.mainSetupId)}
                      </span>
                      <span className="mt-auto flex items-center justify-between gap-1">
                        <span
                          aria-hidden
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            day.compliance === 'compliant'
                              ? 'bg-success'
                              : day.compliance === 'violation'
                                ? 'bg-danger'
                                : day.compliance === 'partial'
                                  ? 'bg-warning'
                                  : 'bg-text-faint',
                          )}
                        />
                        <span className="num text-caption text-text-faint">
                          {day.emotionalScore}/10
                        </span>
                      </span>
                    </>
                  ) : (
                    <span className="mt-auto text-caption text-text-faint">no trades</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <ul className="flex flex-wrap items-center gap-2 text-caption text-text-faint">
          {(Object.keys(CALENDAR_DAY_STATE_LABEL) as CalendarDayState[]).map((state) => (
            <li key={state} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn('h-2 w-2 rounded-[var(--radius-mark)] border', STATE_STYLE[state])}
              />
              {CALENDAR_DAY_STATE_LABEL[state]}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span className="num">n/10</span> self-reported emotional read
          </li>
        </ul>

        {selectedDay === undefined ? (
          <EmptyState
            icon={<CalendarDays size={22} aria-hidden />}
            title={
              selectedDate === null ? 'Select a day to read it' : 'No trades recorded on that day'
            }
            description={
              selectedDate === null
                ? "Choosing a date shows that day's trades, its committed risk, the mistakes and the lesson taken from it."
                : 'A day with no record is a day with no record. Nothing is filled in to make the panel look complete.'
            }
            hint={
              selectedDate === null
                ? 'The month grid shows trade count, net R and the main setup for every day that was traded.'
                : 'Pick another day, or clear the selection.'
            }
          />
        ) : (
          <Card tone="sunken">
            <CardHeader
              divider
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <RuleComplianceBadge compliance={selectedDay.compliance} />
                  <SetupBadge setupId={selectedDay.mainSetupId} />
                  <Badge tone="outline">emotion {selectedDay.emotionalScore}/10</Badge>
                </div>
              }
            >
              <div className="min-w-0">
                <CardTitle className="text-body">{formatDayLabel(selectedDay.date)}</CardTitle>
                <CardDescription>
                  {CALENDAR_DAY_STATE_LABEL[selectedDay.state]} · {selectedDay.tradeCount}{' '}
                  {selectedDay.tradeCount === 1 ? 'trade' : 'trades'} ·{' '}
                  {formatNetR(selectedDay.netR)} · {selectedDay.riskTotal.toLocaleString('en-US')}{' '}
                  committed risk
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedTrades.length > 0 ? (
                <ul className="divide-y divide-border rounded-[var(--radius-control)] border border-border bg-surface">
                  {selectedTrades.map((trade) => (
                    <li key={trade.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                      <span className="num text-caption text-text-muted">{trade.ref}</span>
                      <span className="text-body text-text">{trade.symbol}</span>
                      <span className="num text-caption text-text-muted">
                        {RESULT_LABEL[trade.result]}
                      </span>
                      <span className="num ms-auto text-caption text-text-muted">
                        {trade.actual?.actualR == null
                          ? 'not scored'
                          : `${trade.actual.actualR > 0 ? '+' : ''}${trade.actual.actualR.toFixed(2)}R`}
                      </span>
                      <span className="num text-caption text-text-faint">
                        closed{' '}
                        {trade.closedAt === null ? '—' : formatTimestamp(trade.closedAt).slice(11)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-caption text-text-faint">
                  The day has a summary but no openable records in this view.
                </p>
              )}

              <div className="grid gap-3 lg:grid-cols-2">
                <div>
                  <p className="text-caption font-semibold text-text-muted uppercase">Mistakes</p>
                  {selectedDay.mistakes.length === 0 ? (
                    <p className="mt-1 text-caption text-text-faint">
                      Nothing recorded as a mistake.
                    </p>
                  ) : (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {selectedDay.mistakes.map((mistake) => (
                        <li key={mistake}>
                          <MistakeTag label={mistake} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-caption font-semibold text-text-muted uppercase">Lesson</p>
                  <p className="mt-1 text-caption text-text-muted">
                    {selectedDay.lesson === '' ? 'No lesson recorded.' : selectedDay.lesson}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 border-t border-border pt-3">
                <ChevronRight size={13} aria-hidden className="mt-0.5 shrink-0 text-text-faint" />
                <p className="text-caption text-text-faint">
                  {selectedDay.notes === '' ? 'No notes for the day.' : selectedDay.notes}
                </p>
              </div>

              <div className="flex items-center gap-2 text-caption text-text-faint">
                <ChevronLeft size={12} aria-hidden />
                Screenshots for these records live on each trade; open a record to see them.
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
