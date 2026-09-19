/**
 * Display formatting helpers.
 *
 * These format text only. They never compute trading or risk values: all
 * numbers shown in this preview are mock values loaded from `web/src/mock`, and
 * real figures will come from deterministic backend tools (ADR-0009), not from
 * the UI and not from the model.
 */

export function formatUsd(value: number, fractionDigits = 2): string {
  return `$${value.toFixed(fractionDigits)}`;
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

/** Short, locale-independent date for card footers and log rows. */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().replace('T', ' ').replace('.000Z', 'Z').slice(0, 16);
}

export function formatRelative(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const minutes = Math.round((now - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
