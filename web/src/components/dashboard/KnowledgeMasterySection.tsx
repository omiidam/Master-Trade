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
 *
 * **This is the one roster on the page whose length the reader does not control.** The server sends one
 * row per assessed curriculum domain and bounds nothing else on this card, so a long record grew this
 * card until it was taller than everything beside it — the layout that Phase 9.3.2 spent its pass
 * aligning. `COLLAPSED` keeps the card a card: the weakest domains are first, because the server sorted
 * them that way, so the rows a reader wants are the rows already on screen. The rest are one press away,
 * and the control only appears when there is a rest.
 *
 * The disclosure counts in words as well as in rows. `3 of 11 domains shown` is a claim a reader can
 * check against the badge, and it is the same count the expand button interpolates, so the two cannot
 * disagree about how long the roster is.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../Card';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { EmptyState } from '../EmptyState';
import { DomainMasteryBars } from './DomainMasteryBars';
import { SectionLink } from './SectionLink';
import { cn } from '../../lib/cn';
import { msg } from '../../i18n/index.js';
import type { DomainMasteryView } from '@shared/frontend/viewModels';

/** Rows shown before the reader asks for the rest. */
const COLLAPSED = 4;

export interface KnowledgeMasterySectionProps {
  /** Assessed domains, as the server ranked them. Empty means nothing is assessed yet. */
  domains: readonly DomainMasteryView[];
  /** Opens the assessments this roster is derived from. */
  onOpenExams: () => void;
}

export function KnowledgeMasterySection({ domains, onOpenExams }: KnowledgeMasterySectionProps) {
  const [expanded, setExpanded] = useState(false);
  // One source for both the rows drawn and the count stated, so the number on the control and the
  // number in the badge can never be read off different lists.
  const collapsible = domains.length > COLLAPSED;
  const shown = expanded || !collapsible ? domains : domains.slice(0, COLLAPSED);

  return (
    <Card
      surface="data"
      density="cozy"
      finish="glass"
      interactive
      className="flex flex-col focus-within:border-border-strong"
    >
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
          <div className="flex flex-col gap-3">
            <DomainMasteryBars domains={shown} attemptsLabel={msg('dashboard.attempts')} />
            {/* The control is in the body rather than the footer because it acts on the body: a
                reader who cannot see the rows it would reveal has no reason to press a control parked
                a band below them. */}
            {collapsible ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-caption text-text-faint">
                  {msg('dashboard.domainsShownOf', {
                    shown: shown.length,
                    total: domains.length,
                  })}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setExpanded((value) => !value)}
                  aria-expanded={expanded}
                  // A chevron pointing *down* discloses in every language, so this one is immune to
                  // the writing direction and is not a `ForwardIcon`.
                  leadingIcon={<ChevronDown size={14} aria-hidden />}
                  className={cn(expanded && '[&>svg]:rotate-180')}
                >
                  {expanded
                    ? msg('dashboard.showFewerDomains')
                    : msg('dashboard.showAllDomains', { count: domains.length })}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
      <CardFooter className="text-caption text-text-faint">
        <span>{msg('dashboard.masteryIsTheMeanOfBestScores')}</span>
        <SectionLink label={msg('dashboard.openAssessmentHistory')} onOpen={onOpenExams} />
      </CardFooter>
    </Card>
  );
}
