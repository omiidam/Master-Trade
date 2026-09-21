import {
  PORTFOLIO_ASSET_CLASS_LABEL,
  PORTFOLIO_CURRENCY_LABEL,
  PORTFOLIO_INSIGHT_SEVERITY_LABEL,
  PORTFOLIO_INSIGHT_SEVERITY_ORDER,
  PORTFOLIO_INSIGHT_TYPE_LABEL,
  PORTFOLIO_INSIGHT_TYPE_MEANING,
  PORTFOLIO_ISSUE_MEANING,
  PORTFOLIO_ISSUE_SEVERITY,
  PORTFOLIO_SCOPE_LABEL,
  PORTFOLIO_SNAPSHOT_REASON_LABEL,
  type PortfolioInsightSeverity,
  type PortfolioInsightType,
  type PortfolioIssueCode,
  type PortfolioScope,
  type PortfolioSnapshotReason,
} from '@shared/portfolio/model';
import { PORTFOLIO_SCOPE_MEANING } from '@shared/portfolio/readiness';
import type { BadgeTone } from '../Badge';

/**
 * Names for the things a portfolio surface talks about.
 *
 * Everything the shared catalogue already names — the issue codes, the asset classes, the
 * currencies, the insight types, the scopes — is *imported* rather than re-written. A second
 * copy in the UI is a second vocabulary that eventually describes a different state, and on
 * this surface a vocabulary drift means a user reading a caveat that no longer matches the
 * rule that produced it.
 *
 * The functions an unknown token hits all fall back to the raw token, for the same reason:
 * a value this build does not recognise is evidence the two sides have drifted, and
 * prettifying it would hide exactly that.
 */

export function assetClassLabel(assetClass: string): string {
  return (
    (PORTFOLIO_ASSET_CLASS_LABEL as Readonly<Record<string, string>>)[assetClass] ?? assetClass
  );
}

export function currencyLabel(currency: string): string {
  return (PORTFOLIO_CURRENCY_LABEL as Readonly<Record<string, string>>)[currency] ?? currency;
}

export function scopeLabel(scope: PortfolioScope | string): string {
  return (PORTFOLIO_SCOPE_LABEL as Readonly<Record<string, string>>)[scope as string] ?? scope;
}

export function scopeMeaning(scope: PortfolioScope | string): string {
  return (
    (PORTFOLIO_SCOPE_MEANING as Readonly<Record<string, string>>)[scope as string] ??
    'What this reading covers.'
  );
}

export function insightTypeLabel(type: PortfolioInsightType | string): string {
  return (PORTFOLIO_INSIGHT_TYPE_LABEL as Readonly<Record<string, string>>)[type as string] ?? type;
}

export function insightTypeMeaning(type: PortfolioInsightType | string): string {
  return (
    (PORTFOLIO_INSIGHT_TYPE_MEANING as Readonly<Record<string, string>>)[type as string] ??
    'An observation about the declared composition.'
  );
}

export function insightSeverityLabel(severity: PortfolioInsightSeverity | string): string {
  return (
    (PORTFOLIO_INSIGHT_SEVERITY_LABEL as Readonly<Record<string, string>>)[severity as string] ??
    severity
  );
}

/** The loudest an insight can be is `elevated`: none of these is an error. */
export function insightSeverityTone(severity: PortfolioInsightSeverity | string): BadgeTone {
  switch (severity) {
    case 'elevated':
      return 'warning';
    case 'watch':
      return 'info';
    default:
      return 'outline';
  }
}

export function insightSeverityRank(severity: string): number {
  const rank = (PORTFOLIO_INSIGHT_SEVERITY_ORDER as Readonly<Record<string, number>>)[severity];
  return rank === undefined ? -1 : rank;
}

export function issueMeaning(code: PortfolioIssueCode | string): string {
  return (PORTFOLIO_ISSUE_MEANING as Readonly<Record<string, string>>)[code as string] ?? code;
}

export function issueSeverity(code: PortfolioIssueCode | string): string {
  return (PORTFOLIO_ISSUE_SEVERITY as Readonly<Record<string, string>>)[code as string] ?? 'info';
}

/** A finding's severity, as a tone. A finding is never a success, so none of these is green. */
export function issueTone(code: PortfolioIssueCode | string): BadgeTone {
  switch (issueSeverity(code)) {
    case 'blocking':
      return 'danger';
    case 'warning':
      return 'warning';
    case 'info':
      return 'info';
    default:
      return 'outline';
  }
}

export function snapshotReasonLabel(reason: PortfolioSnapshotReason | string): string {
  return (
    (PORTFOLIO_SNAPSHOT_REASON_LABEL as Readonly<Record<string, string>>)[reason as string] ??
    reason
  );
}

/**
 * Money, in the currency the figure is actually in.
 *
 * The currency is a required argument rather than a default, and that is the point: the
 * engine produces a single total only when every priced position sits in one currency, and
 * everything else is grouped by currency. A formatter with a fallback would let a surface
 * print a number from one currency beside another's symbol.
 */
export function formatMoney(value: number | null, currency: string): string {
  if (value === null) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // An unrecognised code is still a number the server computed; showing it with its code
    // is honest, and inventing a symbol would not be.
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** A percentage, with the sign kept visible when there is one. */
export function formatPercent(value: number | null, digits = 1): string {
  if (value === null) return '—';
  return `${value.toFixed(digits)}%`;
}

export function formatSignedPercent(value: number | null, digits = 2): string {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

/** A plain number, with thousands separators. */
export function formatNumber(value: number | null, digits = 2): string {
  if (value === null) return '—';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);
}

/**
 * How long ago a price was observed.
 *
 * The age is stated in the same vocabulary the engine uses (`priceAgeHours`), so a reader
 * comparing the two cannot find them disagreeing.
 */
export function describePriceAge(hours: number | null): string {
  if (hours === null) return 'no observation time';
  if (hours < 1) return 'less than an hour old';
  if (hours < 48) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'} old`;
  return `${Math.round(hours / 24)} days old`;
}
