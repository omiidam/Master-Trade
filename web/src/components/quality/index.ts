/**
 * Input-quality components.
 *
 * Presentation only: nothing here fetches, computes a verdict or decides a readiness.
 * The gate runs on the server, the verdict arrives typed, and these components render
 * it — which is the property that makes "no language model can override the validation"
 * true on the surface as well as in the backend.
 *
 * The shared rules across the family:
 *
 *   - the contract's own words, imported rather than re-written, wherever the shared
 *     model exports them;
 *   - an unrecognised token shown as itself, never prettified;
 *   - absence rendered as a finding rather than as a blank;
 *   - no user-supplied text anywhere — findings carry the system's sentences and inputs
 *     are named by their labels.
 */

export { AssumptionNotice } from './AssumptionNotice';
export type { AssumptionNoticeProps } from './AssumptionNotice';

export { ClarificationQuestionCard } from './ClarificationQuestionCard';
export type { ClarificationQuestionCardProps } from './ClarificationQuestionCard';

export { DataQualityBadge, qualityBadgePresentation } from './DataQualityBadge';
export type { DataQualityBadgeProps, QualityBadgeKind } from './DataQualityBadge';

export { DataFreshnessIndicator, InputFreshnessCell, describeAge } from './DataFreshnessIndicator';
export type { DataFreshnessIndicatorProps } from './DataFreshnessIndicator';

export { InputQualitySummary, DimensionGrid } from './InputQualitySummary';
export type { InputQualitySummaryProps } from './InputQualitySummary';

export { AnalysisReadinessPanel } from './AnalysisReadinessPanel';
export type { AnalysisReadinessPanelProps } from './AnalysisReadinessPanel';

export { MissingInformationPanel } from './MissingInformationPanel';
export type { MissingInformationPanelProps } from './MissingInformationPanel';

export { ProvenanceIndicator, InputProvenanceCell } from './ProvenanceIndicator';
export type { ProvenanceIndicatorProps } from './ProvenanceIndicator';

export { ValidationIssueList, orderIssues } from './ValidationIssueList';
export type { ValidationIssueListProps } from './ValidationIssueList';

export { clarificationReasonLabel, dimensionLabel, inputLabel, issueCodeLabel } from './labels';
