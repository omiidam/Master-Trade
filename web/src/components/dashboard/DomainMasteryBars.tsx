/**
 * Domain mastery, as ranked share bars.
 *
 * A generic list over the dashboard's own domain view (`DomainMasteryView`), so any surface that
 * holds assessed domains can render them the same way. The one rule it enforces is the one the
 * contract already states: `masteryPercent: null` means *unassessed*, and an unassessed domain
 * draws an em dash and an empty bar rather than a full one — a zero-length bar and a
 * not-yet-measured bar look identical to a reader, and only one of them is true.
 */

import type { DomainMasteryView } from '@shared/frontend/viewModels';
import { MetricBar } from '../journal/MetricBar';
import { formatPercent } from '../../lib/format';

export interface DomainMasteryBarsProps {
  domains: readonly DomainMasteryView[];
  /** `attempts` / `attempt` label, already translated. */
  attemptsLabel: string;
  /** Bar colour. The mastery frame uses the default; a gap surface reads with a warning. */
  tone?: 'primary' | 'warning' | 'danger' | 'info' | 'ai';
}

export function DomainMasteryBars({
  domains,
  attemptsLabel,
  tone = 'primary',
}: DomainMasteryBarsProps) {
  return (
    <div className="space-y-3">
      {domains.map((domain) => (
        <MetricBar
          key={domain.domain}
          label={domain.domain}
          value={domain.masteryPercent === null ? '—' : formatPercent(domain.masteryPercent, 1)}
          share={domain.masteryPercent === null ? 0 : domain.masteryPercent / 100}
          tone={tone}
          hint={`${domain.attemptCount} ${attemptsLabel}`}
        />
      ))}
    </div>
  );
}
