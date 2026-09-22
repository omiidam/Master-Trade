/**
 * Decision evaluation components.
 *
 * Presentation only: nothing here measures, ranks or grades. Every figure is the engine's and every
 * reason is the gate's, which is what lets the surface render a refusal as an answer.
 */

export {
  DecisionReadinessPanel,
  DecisionSummary,
  DecisionCard,
  EvaluationHistory,
  EvaluationLimitationsPanel,
  EvaluationSummary,
  ExpectedVsActualPanel,
  FigureRow,
  HypotheticalScenarioBadge,
  ObservationCard,
} from './EvaluationPanels';

export {
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
} from './labels';
