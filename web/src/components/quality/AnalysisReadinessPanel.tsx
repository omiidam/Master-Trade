import { ClipboardCheck, GaugeCircle, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { ReadinessCounts, AnalysisReadinessDecision } from '@shared/quality/readiness';
import { describeDecisionCode } from '@shared/quality/readiness';
import { Badge } from '../Badge';
import { DataQualityBadge } from './DataQualityBadge';
import { AssumptionNotice } from './AssumptionNotice';
import { ClarificationQuestionCard } from './ClarificationQuestionCard';
import { DimensionGrid } from './InputQualitySummary';
import { ValidationIssueList } from './ValidationIssueList';
import { Card, CardContent, CardHeader, CardTile, CardTitle } from '../Card';

/**
 * Whether one requested analysis may run, and in what form.
 *
 * This is the surface the phase is really about, so it renders the decision as four
 * separate things rather than one verdict:
 *
 *   1. **the outcome** — readiness and output mode, taken straight from the contract;
 *   2. **the evidence** — the counts, the dimensions and the findings behind it;
 *   3. **the rule** — `decidedBy` explained by the model's own `describeDecisionCode`,
 *      so a refusal is arguable rather than mysterious;
 *   4. **what is still possible** — the topics that remain analysable, the questions that
 *      would unblock it, and the premises it would have to carry.
 *
 * Two choices worth naming. A `planned` capability is shown as such and **not** as a
 * refusal of the user's inputs — the inputs were assessed and were fine; the analysis
 * simply does not exist yet, and saying otherwise would blame the user for a backlog item.
 * And `outputMode` is rendered separately from `readiness`, because "ready with
 * limitations" plus "labelled hypothetical" is a materially different answer from "ready
 * with limitations" alone, and one badge cannot carry both.
 */

const COUNT_ROWS: readonly { key: keyof ReadinessCounts; label: string }[] = [
  { key: 'inputsConsidered', label: 'Inputs considered' },
  { key: 'required', label: 'Required' },
  { key: 'satisfied', label: 'Satisfied' },
  { key: 'missing', label: 'Missing' },
  { key: 'stale', label: 'Out of date' },
  { key: 'invalid', label: 'Invalid' },
  { key: 'conflicting', label: 'Conflicting' },
  { key: 'assumed', label: 'Assumed' },
];

export interface AnalysisReadinessPanelProps {
  decision: AnalysisReadinessDecision;
  onAnswer?: () => void;
  answerLabel?: string;
  className?: string;
}

export function AnalysisReadinessPanel({
  decision,
  onAnswer,
  answerLabel,
  className,
}: AnalysisReadinessPanelProps) {
  const refuses =
    decision.readiness === 'BLOCKED' || decision.readiness === 'REQUIRES_CLARIFICATION';
  const planned = decision.capability === 'planned';

  return (
    <Card as="section" className={className} aria-label={`Readiness for ${decision.requestedType}`}>
      {/*
        The panel's name and the rule under it come from the card system, and the "why" moves into
        the body with the rest of the reasoning: a title head carrying three paragraphs is not a
        head, and the badges belong level with the name so the verdict is readable before the
        explanation is.
      */}
      <CardHeader divider>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <GaugeCircle size={16} aria-hidden className="text-text-muted" />
          <CardTitle className="text-body">{decision.requestedType}</CardTitle>
          <Badge tone={planned ? 'outline' : 'neutral'}>
            {decision.capability === 'planned'
              ? 'Declared, not implemented'
              : decision.capability === 'available'
                ? 'Capability available'
                : 'Not a declared capability'}
          </Badge>
          <DataQualityBadge kind="readiness" value={decision.readiness} />
          <DataQualityBadge kind="outputMode" value={decision.outputMode} />
          {decision.classification === null ? null : (
            <DataQualityBadge kind="classification" value={decision.classification} />
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-body text-text-muted">
          <span className="text-text">Why: </span>
          {describeDecisionCode(decision.decidedBy)}
        </p>
        <p className="text-caption text-text-faint font-mono">{decision.decidedBy}</p>

        {planned ? (
          <p className="text-body text-warning">
            The inputs were assessed and the verdict stands. This capability has not been built yet,
            so no analysis is produced — that is a gap in the product, not a problem with your
            inputs.
          </p>
        ) : null}

        {decision.capabilityNote === null ? null : (
          <p className="text-body text-text-muted">{decision.capabilityNote}</p>
        )}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {COUNT_ROWS.map((row) => (
            <CardTile key={row.key}>
              <p className="text-caption text-text-muted">{row.label}</p>
              <p className="text-h3 font-semibold tabular-nums text-text">
                {decision.counts[row.key]}
              </p>
            </CardTile>
          ))}
        </div>

        <DimensionGrid dimensions={decision.dimensions} />

        {decision.limitations.length > 0 ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <TriangleAlert size={14} aria-hidden className="text-warning" />
              <h4 className="text-caption font-semibold text-text-muted uppercase">
                Limitations this answer would carry
              </h4>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-body text-text-muted" role="list">
              {decision.limitations.map((limitation, index) => (
                <li key={index}>{limitation}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {decision.assumptions.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-caption font-semibold text-text-muted uppercase">
              Substitutions and premises
            </h4>
            {decision.assumptions.map((notice) => (
              <AssumptionNotice key={`${notice.field}:${notice.origin}`} notice={notice} />
            ))}
          </div>
        ) : null}

        {decision.clarifications.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <ClipboardCheck size={14} aria-hidden className="text-text-muted" />
              <h4 className="text-caption font-semibold text-text-muted uppercase">
                {refuses ? 'Required before an answer exists' : 'Would improve the answer'}
              </h4>
            </div>
            {decision.clarifications.map((question, index) => (
              <ClarificationQuestionCard
                key={`${question.field}:${question.reason}`}
                question={question}
                index={index + 1}
                total={decision.clarifications.length}
                {...(answerLabel === undefined ? {} : { answerLabel })}
                {...(onAnswer === undefined ? {} : { onAnswer })}
              />
            ))}
          </div>
        ) : null}

        {decision.analysable.length > 0 ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={14} aria-hidden className="text-success" />
              <h4 className="text-caption font-semibold text-text-muted uppercase">
                What can still be analysed
              </h4>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-body text-text-muted" role="list">
              {decision.analysable.map((topic, index) => (
                <li key={index}>{topic}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-2">
          <h4 className="text-caption font-semibold text-text-muted uppercase">
            Findings behind this verdict
          </h4>
          <ValidationIssueList
            issues={decision.issues}
            emptyMessage="No findings: every input this analysis consumes is present, well-formed and current."
          />
        </div>

        <p className="text-caption text-text-faint">{decision.note}</p>
      </CardContent>
    </Card>
  );
}
