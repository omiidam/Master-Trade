/**
 * Portfolio component family.
 *
 * Presentation only, like every other family: no component here fetches data, values a
 * position or holds a secret. The figures they render are the server's — including the ones
 * that are `null`, which are rendered as absent rather than as zero, because on a surface about
 * somebody's money a fabricated number is indistinguishable from a real one.
 */

export { AllocationPair, AssetAllocationChart } from './AssetAllocationChart';
export type { AllocationPairProps, AssetAllocationChartProps } from './AssetAllocationChart';

export { ConcentrationRiskCard } from './ConcentrationRiskCard';
export type { ConcentrationRiskCardProps } from './ConcentrationRiskCard';

export { HoldingsEditor } from './HoldingsEditor';
export type { HoldingsEditorProps } from './HoldingsEditor';

export { HoldingsTable } from './HoldingsTable';
export type { HoldingsTableProps } from './HoldingsTable';

export { PortfolioInsightCard, PortfolioInsightsList } from './PortfolioInsightCard';
export type { PortfolioInsightCardProps, PortfolioInsightsListProps } from './PortfolioInsightCard';

export { PortfolioOverview } from './PortfolioOverview';
export type { PortfolioOverviewProps } from './PortfolioOverview';

export { PortfolioValueCard } from './PortfolioValueCard';
export type { PortfolioValueCardProps } from './PortfolioValueCard';

export {
  MissingHoldingData,
  PortfolioQualitySummary,
  PortfolioReadinessPanel,
  PortfolioSnapshotTimeline,
  RiskExposurePanel,
} from './PortfolioPanels';
export type {
  MissingHoldingDataProps,
  PortfolioQualitySummaryProps,
  PortfolioReadinessPanelProps,
  PortfolioSnapshotTimelineProps,
  RiskExposurePanelProps,
} from './PortfolioPanels';

export {
  assetClassLabel,
  currencyLabel,
  describePriceAge,
  formatMoney,
  formatNumber,
  formatPercent,
  formatSignedPercent,
  insightSeverityLabel,
  insightSeverityRank,
  insightSeverityTone,
  insightTypeLabel,
  insightTypeMeaning,
  issueMeaning,
  issueSeverity,
  issueTone,
  scopeLabel,
  scopeMeaning,
  snapshotReasonLabel,
} from './labels';
