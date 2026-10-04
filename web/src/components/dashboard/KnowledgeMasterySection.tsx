/**
 * Knowledge mastery — the widest reading of the record.
 *
 * A `data` surface rather than a metric plate: this section is a *roster*, several rows read
 * together, and the frame says so (a plain edge around a window, no corner cut). The header badge
 * is a count of what is in the window so the section reports its own completeness, and the footer
 * states the derivation — a reader who does not know that mastery is a mean of best scores cannot
 * tell a diligent student from a lucky one.
 *
 * The density is stated so this frame shares its inner rhythm with the card beside it: the surfaces
 * differ in how they are lit, not in how much room they leave around a title.
 */

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../Card';
import { Badge } from '../Badge';
import { EmptyState } from '../EmptyState';
import { DomainMasteryBars } from './DomainMasteryBars';
import { msg } from '../../i18n/index.js';
import type { DomainMasteryView } from '@shared/frontend/viewModels';

export interface KnowledgeMasterySectionProps {
  /** Assessed domains, as the server ranked them. Empty means nothing is assessed yet. */
  domains: readonly DomainMasteryView[];
}

export function KnowledgeMasterySection({ domains }: KnowledgeMasterySectionProps) {
  return (
    <Card surface="data" density="cozy" className="flex flex-col">
      <CardHeader
        divider
        actions={
          <Badge tone="outline">
            <span className="num">{domains.length}</span> {msg('dashboard.patterns')}
          </Badge>
        }
      >
        <div>
          <CardTitle className="text-body">{msg('dashboard.knowledgeMastery')}</CardTitle>
          <CardDescription>{msg('data.meanOfYourBestScorePerExamination')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col [&>*]:grow">
        {domains.length === 0 ? (
          <EmptyState
            title={msg('dashboard.nothingYet')}
            description={msg('dashboard.noProgressRecordedYet')}
          />
        ) : (
          <DomainMasteryBars domains={domains} attemptsLabel={msg('dashboard.attempts')} />
        )}
      </CardContent>
      <CardFooter className="text-caption text-text-faint">
        <span>{msg('dashboard.masteryIsTheMeanOfBestScores')}</span>
      </CardFooter>
    </Card>
  );
}
