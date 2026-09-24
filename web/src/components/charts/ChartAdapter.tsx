import { useMemo } from 'react';
import type { DataProvenance } from '@shared/marketdata/provider';
import { Card } from '../Card';
import { ProvenanceBanner } from '../ProvenanceBanner';
import { cn } from '../../lib/cn';

export interface ChartBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface ChartAdapterProps {
  bars: readonly ChartBar[];
  symbol: string;
  timeframe: string;
  provenance: DataProvenance;
  source: string;
  updatedAt: string;
  height?: number;
  className?: string;
}

const VIEW_WIDTH = 1000;
const PADDING = 24;

interface PlottedBar extends ChartBar {
  x: number;
  bodyTop: number;
  bodyHeight: number;
  up: boolean;
}

/**
 * The single place a chart is rendered (ADR-0013).
 *
 * Phase 3.2 responsibility: prove the *contract* — bars in, provenance banner
 * out, read-only, no trading affordance. The chart itself is drawn as plain SVG
 * so this phase installs no charting dependency. Phase 3.3 swaps the rendering
 * body for TradingView Lightweight Charts behind exactly these props; nothing
 * outside this file needs to change.
 *
 * Two rules this component must never lose:
 *   - the provenance label is always rendered with the data;
 *   - the chart is LTR even in an RTL interface (financial time series read
 *     left-to-right), and it exposes no interactive order affordance at all.
 */
export function ChartAdapter({
  bars,
  symbol,
  timeframe,
  provenance,
  source,
  updatedAt,
  height = 280,
  className,
}: ChartAdapterProps) {
  const { plotted, min, max } = useMemo(() => {
    if (bars.length === 0) return { plotted: [] as PlottedBar[], min: 0, max: 1 };
    const lows = bars.map((bar) => bar.low);
    const highs = bars.map((bar) => bar.high);
    const lowest = Math.min(...lows);
    const highest = Math.max(...highs);
    const span = highest - lowest || 1;
    const slot = (VIEW_WIDTH - PADDING * 2) / bars.length;
    const scaled = bars.map<PlottedBar>((bar, index) => {
      const y = (value: number) => PADDING + (1 - (value - lowest) / span) * (100 - PADDING * 2);
      const openY = y(bar.open);
      const closeY = y(bar.close);
      return {
        ...bar,
        x: PADDING + slot * (index + 0.5),
        bodyTop: Math.min(openY, closeY),
        bodyHeight: Math.max(Math.abs(closeY - openY), 1.2),
        up: bar.close >= bar.open,
      };
    });
    return { plotted: scaled, min: lowest, max: highest };
  }, [bars]);

  const last = bars.at(-1);
  const slotWidth = plotted.length > 0 ? (VIEW_WIDTH - PADDING * 2) / plotted.length : 12;

  return (
    <figure className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-3" style={{ direction: 'ltr' }}>
        <figcaption className="flex items-baseline gap-2">
          <span className="text-body font-semibold text-text">{symbol}</span>
          <span className="text-caption text-text-muted">{timeframe}</span>
        </figcaption>
        <div className="flex items-baseline gap-3 text-caption text-text-faint">
          <span className="num">low {min.toFixed(2)}</span>
          <span className="num">high {max.toFixed(2)}</span>
          {last ? <span className="num">last {last.close.toFixed(2)}</span> : null}
        </div>
      </div>

      <Card tone="sunken" className="overflow-hidden" style={{ direction: 'ltr' }}>
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} 100`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${symbol} ${timeframe} chart, ${provenance} data, read-only`}
          style={{ height, width: '100%', display: 'block' }}
        >
          {[20, 40, 60, 80].map((line) => (
            <line
              key={line}
              x1={0}
              x2={VIEW_WIDTH}
              y1={line}
              y2={line}
              stroke="var(--color-border)"
              strokeWidth={0.4}
              strokeDasharray="4 6"
            />
          ))}
          {plotted.map((bar) => {
            const color = bar.up ? 'var(--color-primary)' : 'var(--color-danger)';
            const wickX = bar.x;
            return (
              <g key={bar.time}>
                <line
                  x1={wickX}
                  x2={wickX}
                  y1={PADDING + (1 - (bar.high - min) / (max - min || 1)) * (100 - PADDING * 2)}
                  y2={PADDING + (1 - (bar.low - min) / (max - min || 1)) * (100 - PADDING * 2)}
                  stroke={color}
                  strokeWidth={0.7}
                  opacity={0.75}
                />
                <rect
                  x={wickX - Math.max(slotWidth * 0.28, 1.4)}
                  y={bar.bodyTop}
                  width={Math.max(slotWidth * 0.56, 2.8)}
                  height={bar.bodyHeight}
                  fill={color}
                  opacity={0.9}
                />
              </g>
            );
          })}
          {last ? (
            <line
              x1={0}
              x2={VIEW_WIDTH}
              y1={PADDING + (1 - (last.close - min) / (max - min || 1)) * (100 - PADDING * 2)}
              y2={PADDING + (1 - (last.close - min) / (max - min || 1)) * (100 - PADDING * 2)}
              stroke="var(--color-info)"
              strokeWidth={0.5}
              strokeDasharray="2 4"
            />
          ) : null}
        </svg>
      </Card>

      <ProvenanceBanner provenance={provenance} source={source} updatedAt={updatedAt} />
      <p className="text-caption text-text-faint">
        Illustrative render — the charting library is not installed in this phase. The adapter keeps
        provenance and read-only guarantees in one place.
      </p>
    </figure>
  );
}
