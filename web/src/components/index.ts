/**
 * Component library barrel.
 *
 * One import surface for the whole interface. Every component is presentation
 * only: no component fetches data, runs a calculation or holds a secret. The
 * module families are grouped by product area — `exams/`, `memory/`, `research/`
 * — and each keeps the same rule as the primitives: it renders what it is given
 * and says plainly when the surface is a preview.
 */

export { Badge, EpistemicBadge, ProvenanceBadge } from './Badge';
export type { BadgeProps, BadgeShape, BadgeTone } from './Badge';

// Brand marks (Phase 5.8). Both render the generated icon set, so the interface, the
// browser tab and the desktop launcher show one logo rather than three lookalikes.
export { BrandLockup, BrandMark } from './brand';
export type { BrandLockupProps, BrandMarkProps } from './brand';

export { Button, IconButton } from './Button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button';

export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Section,
} from './Card';
export type { CardEmphasis, CardProps, CardTone } from './Card';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

// Usage, credits and subscription (Phase 5.4). The numbers these render are the
// server's: no component here adds, subtracts or estimates a credit.
export {
  ComingSoonNotice,
  CreditBalance,
  CreditTransactionItem,
  DisabledFeatureNotice,
  FeatureEntitlementBadge,
  InsufficientCreditsState,
  PlanComparison,
  SubscriptionPlanCard,
  SubscriptionStatusCard,
  UpgradePrompt,
  UsageCreditsCard,
  UsageEmptyState,
  UsageHistory,
  UsageLimitNotice,
  UsageProgressBar,
  UsageRetryAction,
  asSubscriptionStatus,
  attemptStatusLabel,
  creditReasonLabel,
  creditReasonMeaning,
  denialGroup,
  denialHeading,
  denialTone,
  describeReset,
  featureBadgeTone,
  formatDelta,
  ledgerKindLabel,
  ledgerStatusLabel,
  subscriptionStatusLabel,
  usageBarState,
  usageCategoryLabel,
} from './usage';
export type {
  ComingSoonNoticeProps,
  CreditBalanceProps,
  CreditTransactionItemProps,
  DenialGroup,
  FeatureEntitlementBadgeProps,
  InsufficientCreditsStateProps,
  PlanComparisonProps,
  SubscriptionPlanCardProps,
  SubscriptionStatusCardProps,
  UpgradePromptProps,
  UsageBarState,
  UsageCreditsCardProps,
  UsageHistoryProps,
  UsageLimitNoticeProps,
  UsageProgressBarProps,
} from './usage';

// Feedback and overlays (Phase 7.2). One primitive, six tones: `ErrorState`, `RealtimeNotification`
// and every toast are this component in three places, so the tones cannot drift into six versions.
export { Alert, alertRole } from './Alert';
export type { AlertProps, AlertTone } from './Alert';

export { ErrorState } from './ErrorState';
export type { ErrorStateProps, ErrorSeverity } from './ErrorState';

export { ToastProvider, ToastViewport, useToast } from './Toast';
export type { ToastApi, ToastOptions } from './Toast';

export { FeedbackStatesPanel } from './FeedbackStates';
export type { FeedbackStatesPanelProps } from './FeedbackStates';

export { Field, Input, ReadOnlyValue, Select, Textarea } from './Input';
export type { FieldProps, SelectDensity, SelectProps } from './Input';

export { Modal } from './Modal';
export type { ModalProps } from './Modal';

export { Skeleton, SkeletonCard } from './Skeleton';
export type { SkeletonProps, SkeletonShape } from './Skeleton';

export { TabPanel, Tabs } from './Tabs';
export type { TabItem, TabsProps } from './Tabs';

export { Tooltip, TooltipProvider } from './Tooltip';
export type { TooltipProps } from './Tooltip';

export { ProvenanceBanner } from './ProvenanceBanner';
export type { ProvenanceBannerProps } from './ProvenanceBanner';

export { Reveal, RevealList } from './Reveal';
export type { RevealListProps, RevealProps } from './Reveal';

export { InterfaceStatesPanel } from './InterfaceStates';
export type { InterfaceStateId, InterfaceStatesPanelProps } from './InterfaceStates';

export { ChartAdapter } from './charts/ChartAdapter';
export type { ChartAdapterProps, ChartBar } from './charts/ChartAdapter';
export { Sparkline } from './charts/Sparkline';
export type { SparklineProps } from './charts/Sparkline';

/* Assessments ------------------------------------------------------------ */

export { ExamCard } from './exams/ExamCard';
export type { ExamCardProps } from './exams/ExamCard';

export { QuestionPanel } from './exams/QuestionPanel';
export type { QuestionPanelChoice, QuestionPanelProps } from './exams/QuestionPanel';

export { AnswerOption } from './exams/AnswerOption';
export type {
  AnswerInputKind,
  AnswerOptionProps,
  AnswerOptionState,
  PostSubmitReview,
} from './exams/AnswerOption';

export { ProgressIndicator } from './exams/ProgressIndicator';
export type { ProgressIndicatorProps, ProgressTone } from './exams/ProgressIndicator';

export { ScoreCard } from './exams/ScoreCard';
export type { ScoreCardProps, ScorePointInput } from './exams/ScoreCard';

export { MistakeAnalysisCard } from './exams/MistakeAnalysisCard';
export type { MistakeAnalysisCardProps, MistakePatternInput } from './exams/MistakeAnalysisCard';

/* Knowledge memory ------------------------------------------------------- */

export { MemoryCard } from './memory/MemoryCard';
export type { MemoryCardProps } from './memory/MemoryCard';

export { KnowledgeSearch, ClearFiltersButton } from './memory/KnowledgeSearch';
export type { KnowledgeSearchProps, SearchFacet } from './memory/KnowledgeSearch';

export { TrustBadge } from './memory/TrustBadge';
export type { TrustBadgeProps } from './memory/TrustBadge';

export { SourceIndicator, SOURCE_KIND_LABEL } from './memory/SourceIndicator';
export type { SourceIndicatorEntry, SourceIndicatorProps } from './memory/SourceIndicator';

export { MemoryTimeline } from './memory/MemoryTimeline';
export type {
  MemoryEventKind,
  MemoryTimelineEntryInput,
  MemoryTimelineProps,
} from './memory/MemoryTimeline';

/* Research --------------------------------------------------------------- */

export { ResearchCard } from './research/ResearchCard';
export type { ResearchCardProps, ResearchExperimentInput } from './research/ResearchCard';

export { ExperimentTimeline } from './research/ExperimentTimeline';
export type {
  ExperimentEventKind,
  ExperimentTimelineEntryInput,
  ExperimentTimelineProps,
} from './research/ExperimentTimeline';

export { MetricsPanel } from './research/MetricsPanel';
export type { MetricsPanelProps, ResearchMetrics } from './research/MetricsPanel';

export { ReportViewer } from './research/ReportViewer';
export type { ReportSectionInput, ReportViewerProps } from './research/ReportViewer';

/* Trading journal ------------------------------------------------------- */

export {
  AIReviewPanel,
  AIReviewStateGallery,
  AnalyticsPanel,
  CHART_TONE_VAR,
  ChartToolbar,
  ChecklistField,
  DEFAULT_VISIBLE_COLUMNS,
  DirectionBadge,
  FullscreenChartViewer,
  FormSection,
  JournalCalendar,
  JournalStatCard,
  JournalTabPanel,
  JournalTabs,
  LoadingState,
  MetricBar,
  MistakeTag,
  PerformanceChart,
  PsychologyScale,
  RMultipleIndicator,
  RiskSummary,
  RuleComplianceBadge,
  ScreenshotGallery,
  SetupBadge,
  TRADE_COLUMNS,
  TradeFilters,
  TradeForm,
  TradeRow,
  TradeTable,
  TradeTimeline,
} from './journal';
export type {
  ChartAnnotation,
  ChartLevel,
  ChartMarker,
  ChartSeriesInput,
  ChartToolbarProps,
  ChartTone,
  JournalStatCardProps,
  JournalTabItem,
  MistakeTagProps,
  PerformanceChartProps,
  TradeColumnId,
  TradeFormValues,
  TradeRowProps,
  TradeTableProps,
} from './journal';

// Phase 5.5 — the declared portfolio and the figures computed from it. Every number
// these render is the server's: no component here values a position or sums a total, and
// an absent figure stays absent rather than becoming a zero.
export {
  AllocationPair,
  AssetAllocationChart,
  ConcentrationRiskCard,
  HoldingsEditor,
  HoldingsTable,
  MissingHoldingData,
  PortfolioInsightCard,
  PortfolioInsightsList,
  PortfolioOverview,
  PortfolioQualitySummary,
  PortfolioReadinessPanel,
  PortfolioSnapshotTimeline,
  PortfolioValueCard,
  RiskExposurePanel,
  assetClassLabel,
  currencyLabel,
  describePriceAge,
  formatMoney,
  formatPercent,
  formatSignedPercent,
  insightSeverityLabel,
  insightSeverityRank,
  insightSeverityTone,
  insightTypeLabel,
  insightTypeMeaning,
  issueMeaning,
  issueTone,
  scopeLabel,
  scopeMeaning,
  snapshotReasonLabel,
} from './portfolio';
export type {
  AllocationPairProps,
  AssetAllocationChartProps,
  ConcentrationRiskCardProps,
  HoldingsEditorProps,
  HoldingsTableProps,
  MissingHoldingDataProps,
  PortfolioInsightCardProps,
  PortfolioInsightsListProps,
  PortfolioOverviewProps,
  PortfolioQualitySummaryProps,
  PortfolioReadinessPanelProps,
  PortfolioSnapshotTimelineProps,
  PortfolioValueCardProps,
  RiskExposurePanelProps,
} from './portfolio';

/* Realtime + background tasks -------------------------------------------- */

export { ConnectionStatus, CONNECTION_PRESENTATION } from './realtime/ConnectionStatus';
export type { ConnectionStatusProps, ConnectionTone } from './realtime/ConnectionStatus';

export { JobStatusCard } from './realtime/JobStatusCard';
export type { JobStatusCardProps } from './realtime/JobStatusCard';

export { JobProgressIndicator, progressPercent } from './realtime/JobProgressIndicator';
export type { JobProgress, JobProgressIndicatorProps } from './realtime/JobProgressIndicator';

export { AgentActivityFeed } from './realtime/AgentActivityFeed';
export type { ActivityEntryInput, AgentActivityFeedProps } from './realtime/AgentActivityFeed';

export { BackgroundTaskPanel } from './realtime/BackgroundTaskPanel';
export type { BackgroundTaskPanelProps } from './realtime/BackgroundTaskPanel';

export { RealtimeNotification } from './realtime/RealtimeNotification';
export type {
  NotificationInput,
  NotificationLevel,
  RealtimeNotificationProps,
} from './realtime/RealtimeNotification';

export { RetryState } from './realtime/RetryState';
export type { RetryKind, RetryStateProps } from './realtime/RetryState';

export { CancelTaskControl } from './realtime/CancelTaskControl';
export type { CancelTaskControlProps } from './realtime/CancelTaskControl';

// Phase 5.2 — the user profile and declared trading context.
export {
  ClarifyingPrompts,
  CompletenessMeter,
  ContextStatusBadge,
  FactRow,
  FactSourceBadge,
  ProfileEditor,
  STATUS_LABEL,
  STATUS_EXPLANATION,
  formatFieldValue,
} from './profile';
export type { ClarifyingPromptsProps, FactRowProps, ProfileEditorProps } from './profile';

// Phase 5.3 — input quality, validation findings and the analysis-readiness gate.
export {
  AnalysisReadinessPanel,
  AssumptionNotice,
  ClarificationQuestionCard,
  DataFreshnessIndicator,
  DataQualityBadge,
  DimensionGrid,
  InputFreshnessCell,
  InputProvenanceCell,
  InputQualitySummary,
  MissingInformationPanel,
  ProvenanceIndicator,
  ValidationIssueList,
  clarificationReasonLabel,
  describeAge,
  dimensionLabel,
  inputLabel,
  issueCodeLabel,
  orderIssues,
  qualityBadgePresentation,
} from './quality';
export type {
  AnalysisReadinessPanelProps,
  AssumptionNoticeProps,
  ClarificationQuestionCardProps,
  DataFreshnessIndicatorProps,
  DataQualityBadgeProps,
  InputQualitySummaryProps,
  MissingInformationPanelProps,
  ProvenanceIndicatorProps,
  QualityBadgeKind,
  ValidationIssueListProps,
} from './quality';

// Decision evaluation (Phases 5.6/5.7). Presentation only: no component here measures, ranks or
// grades a decision, and no component labels a figure it did not receive already labelled.
export {
  DecisionCard,
  DecisionReadinessPanel,
  DecisionSummary,
  EvaluationHistory,
  EvaluationLimitationsPanel,
  EvaluationSummary,
  ExpectedVsActualPanel,
  FigureRow,
  HypotheticalScenarioBadge,
  ObservationCard,
  BASE_READINESS_TONE,
  CONFIDENCE_LABEL,
  CONFIDENCE_TONE,
  EVALUATION_OUTCOME_LABEL,
  EVALUATION_OUTCOME_MEANING,
  EVALUATION_READINESS_LABEL,
  EVALUATION_READINESS_MEANING,
  EVALUATION_READINESS_TONE,
  KIND_TONE,
  OBSERVATION_TONE,
  OUTCOME_TONE,
  figureClass,
  figureSign,
} from './decisions';

// Capability catalogue (Phase 5.7). The browser resolves nothing here: every state and reason is
// the server's, because a frontend restriction is never an authorization.
export {
  CapabilityCard,
  CapabilityPipeline,
  CapabilityStateBadge,
  CapabilitySummary,
  ModuleMap,
  STATE_LABEL,
  STATE_TONE,
} from './capabilities';
