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
export type { BadgeProps, BadgeTone } from './Badge';

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
export type { CardProps } from './Card';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { ErrorState } from './ErrorState';
export type { ErrorStateProps, ErrorSeverity } from './ErrorState';

export { Field, Input, ReadOnlyValue, Textarea } from './Input';
export type { FieldProps } from './Input';

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
