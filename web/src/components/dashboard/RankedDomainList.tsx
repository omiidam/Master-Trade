/**
 * Domains as a ranked list: position, name, score, weight of evidence.
 *
 * Deliberately **not** the bar list the mastery frame uses, even though both read the same
 * `DomainMasteryView`. The mastery frame answers "what do I know?" and wants to be compared
 * against itself at a glance, so it draws shares. This answers "what do I study next?" and is
 * ordered, so it draws an ordinal — a rank is a claim about sequence, and a bar is a claim about
 * proportion. Two sections rendering the identical form would also invite the reader to read the
 * second one as a duplicate of the first, when it is a different question about the same rows.
 *
 * The order is the server's (`weakAreas` arrives sorted); this component never sorts, because
 * re-ordering a derived figure here would be a second derivation of it.
 */

import type { DomainMasteryView } from '@shared/frontend/viewModels';
import { Badge } from '../Badge';
import { CardTile } from '../Card';
import { formatPercent } from '../../lib/format';

export interface RankedDomainListProps {
  domains: readonly DomainMasteryView[];
  /** `attempts` / `attempt` label, already translated. */
  attemptsLabel: string;
}

export function RankedDomainList({ domains, attemptsLabel }: RankedDomainListProps) {
  return (
    <ol className="space-y-2">
      {domains.map((domain, index) => (
        <CardTile as="li" key={domain.domain} className="flex items-center gap-3">
          {/* The ordinal is decorative for the layout and real for the reader, so it is drawn
              as text and the list's own semantics carry the order. */}
          <span aria-hidden className="num w-5 shrink-0 text-caption font-semibold text-text-faint">
            {index + 1}
          </span>
          <span className="min-w-0 flex-1 truncate text-body text-text">{domain.domain}</span>
          <span className="num shrink-0 text-caption text-text-muted">
            {domain.attemptCount} {attemptsLabel}
          </span>
          <Badge tone={domain.masteryPercent === null ? 'outline' : 'warning'}>
            {domain.masteryPercent === null ? '—' : formatPercent(domain.masteryPercent, 1)}
          </Badge>
        </CardTile>
      ))}
    </ol>
  );
}
