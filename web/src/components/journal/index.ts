/**
 * Trading journal component barrel.
 *
 * One import surface for the journal module. Every component here is presentation
 * only: none of them fetches, computes a trading value, or holds a credential. The
 * numbers they render come from the record they are given, and the record in this
 * phase comes from `web/src/mock/journalTrades.ts`.
 *
 * `EmptyState`, `ErrorState` and `SkeletonCard` are the application-wide primitives
 * reused rather than re-implemented, so a journal panel that fails looks exactly
 * like every other failure in the product.
 */

export { JournalStatCard } from './JournalStatCard';
export type { JournalStatCardProps } from './JournalStatCard';

export { PerformanceChart, formatChartValue } from './PerformanceChart';
export type {
  ChartAnnotation,
  ChartLevel,
  ChartMarker,
  ChartSeriesInput,
  PerformanceChartProps,
} from './PerformanceChart';

export { CHART_TONE_VAR, ChartToolbar } from './ChartToolbar';
export type { ChartLegendEntry, ChartTone, ChartToolbarProps } from './ChartToolbar';

export { FullscreenChartViewer } from './FullscreenChartViewer';
export type { FullscreenChartViewerProps } from './FullscreenChartViewer';

export { TradeTable } from './TradeTable';
export type { TradeTableProps } from './TradeTable';

export { DEFAULT_VISIBLE_COLUMNS, TRADE_COLUMNS, TradeRow } from './TradeRow';
export type { TradeColumn, TradeColumnId, TradeRowProps } from './TradeRow';

export { TradeFilters } from './TradeFilters';
export type { TradeFiltersProps } from './TradeFilters';

export { TradeForm } from './TradeForm';
export type { TradeFormProps } from './TradeForm';

export {
  EMPTY_TRADE_FORM,
  countFormErrors,
  positiveNumber,
  validateTradeForm,
} from './tradeFormModel';
export type { TradeFormErrors, TradeFormSectionId, TradeFormValues } from './tradeFormModel';

export { FormSection } from './FormSection';
export type { FormSectionProps } from './FormSection';

export { ChecklistField } from './ChecklistField';
export type { ChecklistFieldProps } from './ChecklistField';

export { PsychologyScale } from './PsychologyScale';
export type { PsychologyScaleProps } from './PsychologyScale';

export { SetupBadge } from './SetupBadge';
export { DirectionBadge } from './DirectionBadge';
export { RMultipleIndicator } from './RMultipleIndicator';
export type { RMultipleIndicatorProps } from './RMultipleIndicator';
export { RuleComplianceBadge } from './RuleComplianceBadge';
export { MistakeTag } from './MistakeTag';
export type { MistakeTagProps } from './MistakeTag';
export { MetricBar } from './MetricBar';
export type { MetricBarProps } from './MetricBar';

export { RiskSummary } from './RiskSummary';
export { TradeTimeline } from './TradeTimeline';
export type { TradeTimelineProps } from './TradeTimeline';
export { ScreenshotGallery } from './ScreenshotGallery';
export type { ScreenshotGalleryProps } from './ScreenshotGallery';
export { JournalCalendar } from './JournalCalendar';
export type { JournalCalendarProps } from './JournalCalendar';
export { AIReviewPanel, AIReviewStateGallery } from './AIReviewPanel';
export type { AIReviewPanelProps } from './AIReviewPanel';
export { AnalyticsPanel } from './AnalyticsPanel';
export type { AnalyticsPanelProps } from './AnalyticsPanel';
