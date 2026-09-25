import { FolderTree, History, Layers, Wallet } from 'lucide-react';
import type { PortfolioViewData } from '@shared/api/contracts';
import { Badge } from '../Badge';
import { Card, CardContent, CardDescription, CardHeader, CardTile, CardTitle } from '../Card';
import { cn } from '../../lib/cn';
import { formatNumber, scopeLabel } from './labels';
import { msg } from '../../i18n/index.js';

/**
 * What the account has declared, stated before any figure is.
 *
 * The order inside this card is the reading order of the question it answers: *is anything
 * declared at all*, then *which version*, then *how much of it could be used*. The coverage
 * counts sit above the totals on purpose — a total is only as good as how many positions it
 * could be computed from, and a reader who sees the number first will not look for the rest.
 *
 * **The undeclared state is not an empty portfolio.** `declared: false` is rendered as its
 * own sentence, with the version line absent rather than showing a zero, because \"nobody
 * has told us\" and \"there is nothing\" are different facts and a version of 0 would read as
 * the second.
 */
export interface PortfolioOverviewProps {
  view: PortfolioViewData;
  className?: string;
}

export function PortfolioOverview({ view, className }: PortfolioOverviewProps) {
  const coverage = view.metrics.coverage;
  const worst = view.assessment.worst;

  return (
    <Card className={className}>
      <CardHeader
        divider
        actions={<p className="text-caption text-text-faint">as of {view.asOf}</p>}
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Wallet size={16} aria-hidden className="text-text-muted" />
            <CardTitle>{view.portfolio.name}</CardTitle>
            <Badge tone="neutral">{view.portfolio.baseCurrency}</Badge>
            {view.declared ? (
              <Badge tone="outline" icon={<History size={12} aria-hidden />}>
                {msg('portfolio.version')} {view.version}
              </Badge>
            ) : (
              <Badge tone="info">{msg('portfolio.notDeclaredYet')}</Badge>
            )}
            {worst === null ? (
              <Badge tone="success">{msg('portfolio.noFindings')}</Badge>
            ) : (
              <Badge tone={worst === 'blocking' ? 'danger' : 'warning'}>
                {msg('portfolio.findingsWorstIs')} {worst}
              </Badge>
            )}
          </div>
          <CardDescription className="mt-1">
            {view.declared
              ? `Declared as ${coverage.positions} position${coverage.positions === 1 ? '' : 's'}, last written ${view.portfolio.updatedAt}.`
              : 'No composition has been declared for this account, so there is nothing to value. That is different from a portfolio that holds nothing — one of them is an answer and the other is a missing one.'}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              [
                msg('portfolioOverview.positionsDeclared'),
                formatNumber(coverage.positions, 0),
                msg('portfolioOverview.everythingInTheDocumentAsStored'),
              ],
              [
                msg('portfolioOverview.usable'),
                formatNumber(view.assessment.usable, 0),
                msg('portfolioOverview.positionsACalculationCouldReadAtAll'),
              ],
              [
                msg('portfolioOverview.priced'),
                formatNumber(coverage.priced, 0),
                msg('portfolioOverview.positionWithAUsableQuantityAndPrice'),
              ],
              [
                msg('portfolioOverview.costBasisKnown'),
                formatNumber(coverage.costed, 0),
                msg('portfolioOverview.positionWithAQuantityAndAnEntryPrice'),
              ],
            ] as const
          ).map(([label, value, hint]) => (
            <CardTile key={label}>
              <dt className="text-caption text-text-muted">{label}</dt>
              <dd className="text-h3 font-semibold num text-text">{value}</dd>
              <p className="text-caption text-text-faint">{hint}</p>
            </CardTile>
          ))}
        </dl>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="inline-flex items-center gap-1.5 text-caption text-text-muted">
              <Layers size={13} aria-hidden />
              {msg('portfolio.currenciesInTheDocument')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {view.assessment.currencies.map((currency) => (
                <Badge
                  key={currency}
                  tone={currency === view.portfolio.baseCurrency ? 'primary' : 'neutral'}
                >
                  {currency}
                  {currency === view.portfolio.baseCurrency ? ' (base)' : ''}
                </Badge>
              ))}
              {view.assessment.currencies.length <= 1 ? (
                <span className="text-caption text-text-faint">
                  {msg('portfolio.aSingleCurrencySoThePriced')}
                </span>
              ) : (
                <span className="text-caption text-text-warning">
                  {msg('portfolio.moreThanOneCurrencyAndNo')}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="inline-flex items-center gap-1.5 text-caption text-text-muted">
              <FolderTree size={13} aria-hidden />
              {msg('decisions.readiness')}
            </p>
            <ul className="space-y-1" role="list">
              {view.readiness.map((decision) => (
                <li
                  key={decision.scope}
                  className="flex items-center justify-between gap-2 text-body"
                >
                  <span className="text-text-muted">{scopeLabel(decision.scope)}</span>
                  <Badge
                    tone={
                      decision.readiness === 'BLOCKED'
                        ? 'danger'
                        : decision.readiness === 'REQUIRES_CLARIFICATION'
                          ? 'warning'
                          : decision.readiness === 'READY_WITH_LIMITATIONS'
                            ? 'info'
                            : 'success'
                    }
                  >
                    {decision.readiness}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {view.assessment.truncated ? (
          <p className={cn('text-body text-warning')}>
            {msg('portfolio.theDocumentDeclaresMorePositionsThan')}
          </p>
        ) : null}

        <p className="text-caption text-text-faint">{view.note}</p>
      </CardContent>
    </Card>
  );
}
