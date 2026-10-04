/**
 * Weak areas — the study list.
 *
 * The same rows as mastery, asked a different question: not "how much do I know" but "what do I
 * open next". So this card draws ranks rather than shares (see `RankedDomainList`) and uses a
 * `data` surface with a quieter frame than the featured card, because it is a follow-up to
 * reading, not the place the screen points at. Its density is stated so it lines up with the card
 * it is read beside.
 */

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../Card';
import { EmptyState } from '../EmptyState';
import { RankedDomainList } from './RankedDomainList';
import { msg } from '../../i18n/index.js';
import type { DomainMasteryView } from '@shared/frontend/viewModels';

export interface WeakAreasSectionProps {
  /** Domains to study, weakest first, as the server ranked them. */
  domains: readonly DomainMasteryView[];
}

export function WeakAreasSection({ domains }: WeakAreasSectionProps) {
  return (
    <Card surface="data" density="cozy" className="flex flex-col">
      <CardHeader divider>
        <div>
          <CardTitle className="text-body">{msg('dashboard.weakAreas')}</CardTitle>
          <CardDescription>{msg('dashboard.weakestDomainsFirst')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col [&>*]:grow">
        {domains.length === 0 ? (
          <EmptyState
            title={msg('dashboard.noWeakAreasYet')}
            hint={msg('dashboard.noWeakAreaYet')}
          />
        ) : (
          <RankedDomainList domains={domains} attemptsLabel={msg('dashboard.attempts')} />
        )}
      </CardContent>
      <CardFooter className="text-caption text-text-faint">
        <span>{msg('dashboard.weakIsTheLowestMean')}</span>
      </CardFooter>
    </Card>
  );
}
