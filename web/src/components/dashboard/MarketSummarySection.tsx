/**
 * Market analysis — a summary surface, not the engine (this phase draws no analysis logic).
 *
 * It names no surface, which is itself the choice: the card with no surface *is* the system's
 * informational panel, and that is what this one is — a panel about the instrument rather than a
 * figure from the learner's record. Naming `surface="info"` would ask for exactly what the
 * default already gives.
 *
 * What it states is exactly what the read can support: the symbol and timeframe in its header,
 * the provenance as the badge the system already has for that claim, and, in the body, that no
 * series is held yet. It draws no chart — the read reports `barCount: 0`, and a curve assembled
 * from local numbers under a real symbol would be indistinguishable from a measured one. When
 * the API starts serving bars, this card is where they arrive.
 *
 * It states its density for the same reason the panels above do: a page whose cards each inherit a
 * different inner rhythm has no left edge for the eye to follow down it.
 *
 * The "summary surface" caveat is stated once, in the footer, which is the band this page puts
 * caveats in. It used to be passed to the empty state as its hint as well, so the card printed the
 * same sentence twice — once inside the well and once directly beneath it.
 */

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../Card';
import { EmptyState } from '../EmptyState';
import { ProvenanceBadge } from '../Badge';
import { formatRelative, formatTimestamp } from '../../lib/format';
import { msg } from '../../i18n/index.js';
import type { DashboardMarketView } from '@shared/frontend/viewModels';

export interface MarketSummarySectionProps {
  /** The market fact the server holds: symbol, timeframe, provenance, and how many bars. */
  market: DashboardMarketView;
  /** When the read was taken, so the summary states its own freshness. */
  asOf: string;
}

export function MarketSummarySection({ market, asOf }: MarketSummarySectionProps) {
  return (
    <Card density="cozy" finish="glass" className="flex flex-col">
      <CardHeader divider actions={<ProvenanceBadge provenance={market.dataProvenance} />}>
        <div>
          <CardTitle className="text-body">{msg('dashboard.marketAnalysis')}</CardTitle>
          <CardDescription>
            <span className="num">{market.symbol}</span> ·{' '}
            <span className="num">{market.timeframe}</span>
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col [&>*]:grow">
        <EmptyState
          title={msg('dashboard.nothingYet')}
          description={msg('dashboard.marketSeriesUnavailable')}
        />
      </CardContent>
      <CardFooter className="text-caption text-text-faint">
        <span>{msg('dashboard.marketAnalysisSummaryOnly')}</span>
        <span className="num" title={formatTimestamp(asOf)}>
          {formatRelative(asOf)}
        </span>
      </CardFooter>
    </Card>
  );
}
