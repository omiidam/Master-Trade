import { AlertTriangle, Download, FileText } from 'lucide-react';
import type { DataProvenance } from '@shared/marketdata/provider';
import { cn } from '../../lib/cn';
import { formatTimestamp } from '../../lib/format';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { Card, CardContent, CardDescription, CardDivider, CardHeader, CardTitle } from '../Card';
import { EmptyState } from '../EmptyState';
import { ProvenanceBanner } from '../ProvenanceBanner';
import { Tooltip } from '../Tooltip';
import { msg } from '../../i18n/index.js';

export interface ReportSectionInput {
  heading: string;
  body: string;
}

export interface ReportViewerProps {
  report: {
    id: string;
    title: string;
    summary: string;
    sections: readonly ReportSectionInput[];
    generatedAt: string;
    /** Always present: what the reader must not conclude from this report. */
    limitation: string;
  } | null;
  provenance: DataProvenance;
  sourceRef: string;
  className?: string;
}

/**
 * Evaluation report.
 *
 * The caveats are rendered at the same visual weight as the findings and above
 * the export control, because a report whose limitations are only in a footnote
 * is read as a green light. Export is intentionally inert: nothing here is a real
 * measurement yet.
 */
export function ReportViewer({ report, provenance, sourceRef, className }: ReportViewerProps) {
  if (!report) {
    return (
      <Card surface="data" className={className}>
        <CardHeader divider>
          <CardTitle className="text-body">{msg('research.report')}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<FileText size={22} aria-hidden />}
            title={msg('research.noReportForThisExperiment')}
            description={msg('reportViewer.reportsAreAssembledFromStoredEvaluationRowsOnce')}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader divider>
        <div>
          <CardTitle className="text-body">{report.title}</CardTitle>
          <CardDescription>
            <span className="num">{report.id}</span> {msg('research.generated')}{' '}
            {formatTimestamp(report.generatedAt)}
          </CardDescription>
        </div>
        <Badge tone="info">{msg('research.assembledFromEvidence')}</Badge>
      </CardHeader>

      <CardContent className="space-y-3">
        <ProvenanceBanner
          provenance={provenance}
          source={sourceRef}
          updatedAt={report.generatedAt}
        />

        <p className="text-body text-text">{report.summary}</p>

        <div className="space-y-3">
          {report.sections.map((section) => (
            <section key={section.heading} className="space-y-1">
              <h4 className="text-caption font-semibold tracking-wide text-text-muted uppercase">
                {section.heading}
              </h4>
              <p className={cn('text-caption text-text')}>{section.body}</p>
            </section>
          ))}
        </div>

        <div
          role="note"
          className="flex items-start gap-2 rounded-[var(--radius-control)] border border-warning-border bg-warning-soft px-3 py-2 text-warning"
        >
          <AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0" />
          <div>
            <p className="text-caption font-medium">{msg('research.limitation')}</p>
            <p className="mt-0.5 text-caption opacity-90">{report.limitation}</p>
          </div>
        </div>

        <p className="text-caption text-text-faint">
          {msg('research.noModelAuthoredTextIsIncluded')}
        </p>
      </CardContent>

      <CardDivider />
      <CardContent className="pt-4">
        <Tooltip content={msg('reportViewer.noResearchServiceIsConnectedInThisPhase')}>
          <span>
            <Button
              size="sm"
              variant="secondary"
              disabled
              leadingIcon={<Download size={13} aria-hidden />}
            >
              {msg('research.exportReport')}
            </Button>
          </span>
        </Tooltip>
      </CardContent>
    </Card>
  );
}
