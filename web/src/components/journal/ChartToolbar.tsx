import type { ReactNode } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '../Button';
import { cn } from '../../lib/cn';
import { CardTile } from '../Card';
import { msg } from '../../i18n/index.js';

export type ChartTone = 'primary' | 'danger' | 'info' | 'warning' | 'ai' | 'muted';

export const CHART_TONE_VAR: Record<ChartTone, string> = {
  primary: 'var(--color-primary)',
  danger: 'var(--color-danger)',
  info: 'var(--color-info)',
  warning: 'var(--color-warning)',
  ai: 'var(--color-ai)',
  muted: 'var(--color-text-faint)',
};

export interface ChartLegendEntry {
  id: string;
  label: string;
  tone: ChartTone;
  /** Secondary line in the legend tooltip, e.g. what the series is measured over. */
  note?: string;
}

export interface ChartToolbarProps {
  /** Timeframe options, e.g. Today / This week / Custom. */
  ranges?: readonly string[];
  range?: string;
  onRangeChange?: (range: string) => void;
  legend?: readonly ChartLegendEntry[];
  /** Series the user has switched off. A legend entry is always still listed. */
  hiddenSeries?: readonly string[];
  onToggleSeries?: (id: string) => void;
  onFullscreen?: () => void;
  fullscreen?: boolean;
  /** Extra controls, e.g. a symbol selector or an export action. */
  children?: ReactNode;
  className?: string;
}

/**
 * The control strip that sits above a journal chart: range, legend and expansion.
 *
 * Legend entries stay listed when a series is switched off rather than
 * disappearing, so the reader can always see that a series exists and is currently
 * excluded. A hidden series that vanishes from the legend reads as a series that
 * vanished from the data.
 */
export function ChartToolbar({
  ranges,
  range,
  onRangeChange,
  legend,
  hiddenSeries = [],
  onToggleSeries,
  onFullscreen,
  fullscreen = false,
  children,
  className,
}: ChartToolbarProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {ranges && ranges.length > 0 ? (
          <CardTile
            space="none"
            role="group"
            aria-label={msg('journal.chartTimeframe')}
            className="inline-flex items-center gap-0.5 p-0.5"
          >
            {ranges.map((option) => {
              const active = option === range;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onRangeChange?.(option)}
                  className={cn(
                    'rounded-[calc(var(--radius-control)-2px)] px-2.5 py-1 text-caption font-medium',
                    'transition-colors duration-[var(--duration-fast)]',
                    active
                      ? 'bg-surface-raised text-text shadow-panel'
                      : 'text-text-muted hover:text-text',
                  )}
                >
                  {option}
                </button>
              );
            })}
          </CardTile>
        ) : null}
        {children}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {legend && legend.length > 0 ? (
          <ul className="flex flex-wrap items-center gap-2 text-caption text-text-muted">
            {legend.map((entry) => {
              const hidden = hiddenSeries.includes(entry.id);
              const interactive = onToggleSeries !== undefined;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    aria-pressed={!hidden}
                    disabled={!interactive}
                    {...(interactive
                      ? { 'aria-label': `Toggle ${entry.label} series` }
                      : { 'aria-label': `${entry.label} series` })}
                    onClick={() => onToggleSeries?.(entry.id)}
                    title={entry.note ?? entry.label}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-border px-2 py-0.5',
                      interactive && 'hover:border-border-strong',
                      hidden && 'opacity-45 line-through',
                      !interactive && 'cursor-default',
                    )}
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: CHART_TONE_VAR[entry.tone] }}
                    />
                    {entry.label}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {onFullscreen ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onFullscreen}
            label={fullscreen ? 'Leave fullscreen chart' : 'Open chart fullscreen'}
            leadingIcon={
              fullscreen ? <Minimize2 size={14} aria-hidden /> : <Maximize2 size={14} aria-hidden />
            }
          >
            {fullscreen ? 'Inline' : 'Fullscreen'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
