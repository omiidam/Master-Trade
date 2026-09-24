import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import type { DataProvenance } from '@shared/marketdata/provider';
import { LineChart } from 'lucide-react';
import { ProvenanceBanner } from '../ProvenanceBanner';
import { EmptyState } from '../EmptyState';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../Card';
import {
  ChartFrame,
  ChartStatePanel,
  PlotGrid,
  PlotReferenceLine,
  PlotZeroLine,
} from '../charts/ChartFrame';
import {
  CHART_TONE_VAR,
  ChartToolbar,
  type ChartLegendEntry,
  type ChartTone,
} from './ChartToolbar';
import { FullscreenChartViewer } from './FullscreenChartViewer';
import { JOURNAL_REPORT_DATE } from '../../mock/journal';
import { cn } from '../../lib/cn';

export interface ChartSeriesInput {
  id: string;
  label: string;
  tone: ChartTone;
  points: readonly { label: string; value: number }[];
  /** Fill under the line down to the baseline. */
  area?: boolean;
  bars?: boolean;
  dashed?: boolean;
}

export interface ChartLevel {
  value: number;
  label: string;
  tone: ChartTone;
}

export interface ChartMarker {
  index: number;
  value: number;
  label: string;
  tone: ChartTone;
}

export interface ChartAnnotation {
  index: number;
  label: string;
}

export interface PerformanceChartProps {
  title: string;
  description?: string;
  series: readonly ChartSeriesInput[];
  /** `R`, `%`, `currency`, `trades` or a plain number. Formats labels and tooltips. */
  unit?: string;
  height?: number;
  /** Horizontal reference lines: a planned stop, a take-profit, a budget. */
  levels?: readonly ChartLevel[];
  /** Point markers: an entry, an exit, a key event. */
  markers?: readonly ChartMarker[];
  annotations?: readonly ChartAnnotation[];
  /** Extra controls for the toolbar, e.g. a symbol selector. */
  toolbar?: ReactNode;
  legend?: readonly ChartLegendEntry[];
  hiddenSeries?: readonly string[];
  onToggleSeries?: (id: string) => void;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  provenance?: DataProvenance;
  sourceRef?: string;
  updatedAt?: string;
  /** One line under the chart, e.g. what the reader must not conclude from it. */
  footnote?: string;
  className?: string;
}

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 320;
const PAD = 26;

export function formatChartValue(value: number, unit?: string): string {
  switch (unit) {
    case 'R':
      return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}R`;
    case '%':
      return `${value.toFixed(1)}%`;
    case 'currency':
      return `$${Math.round(value).toLocaleString('en-US')}`;
    case 'trades':
      return `${value} ${Math.abs(value) === 1 ? 'trade' : 'trades'}`;
    default:
      return Number.isInteger(value) ? `${value}` : value.toFixed(2);
  }
}

function tickValues(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const step = span / count;
  return Array.from({ length: count + 1 }, (_, index) => min + step * index);
}

/**
 * The journal's chart.
 *
 * One component draws every performance series — equity, drawdown, distribution,
 * risk consistency and the annotated trade chart — so a reader learns the visual
 * language once. Three rules are structural rather than stylistic:
 *
 *   - **plan and outcome remain distinguishable**: planned levels are dashed
 *     reference lines and realised values are the drawn series, so a target is
 *     never mistaken for a result;
 *   - **a missing point is a gap**: unrecorded data is omitted from the series, and
 *     the caption says so, instead of being interpolated through as if measured;
 *   - **expansion is the same chart**: fullscreen re-renders this component, not a
 *     cut-down copy.
 */
export function PerformanceChart({
  title,
  description,
  series,
  unit,
  height = 260,
  levels,
  markers,
  annotations,
  toolbar,
  legend,
  hiddenSeries = [],
  onToggleSeries,
  loading = false,
  error = null,
  emptyMessage = 'No records in this view, so there is nothing to plot.',
  provenance,
  sourceRef,
  updatedAt,
  footnote,
  className,
}: PerformanceChartProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const visible = series.filter((entry) => !hiddenSeries.includes(entry.id));

  const geometry = useMemo(() => {
    const values: number[] = [];
    for (const entry of visible) for (const point of entry.points) values.push(point.value);
    for (const level of levels ?? []) values.push(level.value);
    for (const marker of markers ?? []) values.push(marker.value);

    if (values.length === 0) return null;

    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const span = max - min;
    const pad = span * 0.08;
    min -= pad;
    max += pad;

    const longest = Math.max(...visible.map((entry) => entry.points.length), 1);
    const xAt = (index: number) =>
      PAD + (longest === 1 ? 0.5 : index / (longest - 1)) * (VIEW_WIDTH - PAD * 2);
    const yAt = (value: number) =>
      PAD + (1 - (value - min) / (max - min)) * (VIEW_HEIGHT - PAD * 2);

    return { min, max, longest, xAt, yAt, ticks: tickValues(min, max) };
  }, [visible, levels, markers]);

  const hasData = geometry !== null;

  // The three states come from the shared chart panel, so a journal chart that failed and the
  // market chart that failed are the same object with different words.
  if (loading) {
    return (
      <ChartStatePanel
        state={{ kind: 'loading', label: `Reading ${title.toLowerCase()}` }}
        className={className}
      />
    );
  }
  if (error) {
    return (
      <ChartStatePanel
        state={{
          kind: 'error',
          title: `${title} could not be read`,
          description: error,
          code: 'JOURNAL_CHART_UNAVAILABLE',
        }}
        className={className}
      />
    );
  }

  // The reference's title block: the name of the panel, the sentence explaining it, and the rule
  // that separates both from what the panel draws. The chart is the card's *contents*, so it gets
  // the padded band rather than the chart component owning a `p-4` of its own.
  const header = (
    <CardHeader divider>
      <div className="min-w-0">
        <CardTitle>{title}</CardTitle>
        {description ? (
          <CardDescription className="max-w-2xl">{description}</CardDescription>
        ) : null}
      </div>
    </CardHeader>
  );

  const renderControls = (expanded: boolean) => (
    <ChartToolbar
      legend={legend}
      hiddenSeries={hiddenSeries}
      {...(onToggleSeries ? { onToggleSeries } : {})}
      {...(hasData ? { onFullscreen: () => setFullscreen(!expanded), fullscreen: expanded } : {})}
    >
      {toolbar}
    </ChartToolbar>
  );

  // The strip states what the data is and when it was recorded. When a caller does
  // not name a source, the preview's report date is used rather than an empty
  // field, because an unlabelled chart is worse than a labelled approximation.
  const provenanceStrip = provenance ? (
    <ProvenanceBanner
      provenance={provenance}
      source={sourceRef ?? 'journal preview data'}
      updatedAt={updatedAt ?? JOURNAL_REPORT_DATE}
    />
  ) : null;

  const tooltip =
    hoverIndex === null || geometry === null ? null : (
      <TooltipPanel
        title={visible[0]?.points[hoverIndex]?.label ?? ''}
        series={visible}
        index={hoverIndex}
        unit={unit}
        leftPercent={
          ((PAD +
            (geometry.longest === 1 ? 0.5 : hoverIndex / (geometry.longest - 1)) *
              (VIEW_WIDTH - PAD * 2)) /
            VIEW_WIDTH) *
          100
        }
      />
    );

  const surface = (
    <ChartSurface
      geometry={geometry}
      series={visible}
      levels={levels}
      markers={markers}
      annotations={annotations}
      unit={unit}
      height={height}
      hoverIndex={hoverIndex}
      onHoverChange={setHoverIndex}
      onLeave={() => setHoverIndex(null)}
    />
  );

  return (
    // `surface="data"`: a chart card is a *frame* around a plot, so it drops the panel's own face
    // and its top hairline instead of lighting one itself. What should carry the light here is the
    // well the series is drawn in, and a card that lights its own top edge as well halves the
    // contrast that well depends on.
    <Card as="figure" surface="data" className={className}>
      {header}
      <CardContent className="space-y-3">
        {hasData ? renderControls(false) : null}

        {hasData ? (
          <div className="relative" style={{ direction: 'ltr' }}>
            {surface}
            {tooltip}
          </div>
        ) : (
          <EmptyState
            icon={<LineChart size={22} aria-hidden />}
            title="Nothing to plot yet"
            description={emptyMessage}
            hint="An empty chart is left empty rather than filled with a placeholder series."
          />
        )}

        {hasData && provenance ? provenanceStrip : null}
        {footnote ? <p className="text-caption text-text-faint">{footnote}</p> : null}

        {hasData ? (
          <FullscreenChartViewer
            open={fullscreen}
            onOpenChange={setFullscreen}
            title={title}
            {...(description ? { description } : {})}
            toolbar={renderControls(true)}
          >
            <div className="relative" style={{ direction: 'ltr' }}>
              {surface}
              {tooltip}
            </div>
            {provenance ? <div className="mt-3">{provenanceStrip}</div> : null}
          </FullscreenChartViewer>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface Geometry {
  min: number;
  max: number;
  longest: number;
  xAt: (index: number) => number;
  yAt: (value: number) => number;
  ticks: number[];
}

function TooltipPanel({
  title,
  series,
  index,
  unit,
  leftPercent,
}: {
  title: string;
  series: readonly ChartSeriesInput[];
  index: number;
  unit?: string;
  leftPercent: number;
}) {
  const rows = series
    .map((entry) => ({ entry, point: entry.points[index] }))
    .filter((row): row is { entry: ChartSeriesInput; point: { label: string; value: number } } =>
      Boolean(row.point),
    );
  if (rows.length === 0) return null;
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-none absolute top-1 z-[var(--z-tooltip)] min-w-[9rem] -translate-x-1/2',
        'rounded-[var(--radius-control)] border border-border-strong bg-bg-elevated/95 px-2.5 py-2 shadow-popover',
      )}
      style={{ left: `${Math.min(Math.max(leftPercent, 8), 92)}%` }}
    >
      <p className="text-caption text-text-faint">{title}</p>
      <ul className="mt-1 space-y-0.5">
        {rows.map(({ entry, point }) => (
          <li key={entry.id} className="flex items-center justify-between gap-3 text-caption">
            <span className="inline-flex items-center gap-1.5 text-text-muted">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: CHART_TONE_VAR[entry.tone] }}
              />
              {entry.label}
            </span>
            <span className="num text-text">{formatChartValue(point.value, unit)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChartSurface({
  geometry,
  series,
  levels,
  markers,
  annotations,
  unit,
  height,
  hoverIndex,
  onHoverChange,
  onLeave,
}: {
  geometry: Geometry | null;
  series: readonly ChartSeriesInput[];
  levels?: readonly ChartLevel[];
  markers?: readonly ChartMarker[];
  annotations?: readonly ChartAnnotation[];
  unit?: string;
  height: number;
  hoverIndex: number | null;
  onHoverChange: (index: number | null) => void;
  onLeave: () => void;
}) {
  if (geometry === null) return null;
  const { min, max, longest, xAt, yAt, ticks } = geometry;

  const handleMove = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const fraction = (event.clientX - rect.left) / rect.width;
    const plotFraction = (fraction * VIEW_WIDTH - PAD) / (VIEW_WIDTH - PAD * 2);
    const clamped = Math.min(Math.max(plotFraction, 0), 1);
    onHoverChange(Math.round(clamped * (longest - 1)));
  };

  return (
    <ChartFrame
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      height={height}
      label={`${series.map((entry) => entry.label).join(', ')} chart, read-only`}
      onMouseMove={handleMove}
      onMouseLeave={onLeave}
    >
      <PlotGrid
        ticks={ticks}
        y={yAt}
        x1={PAD}
        x2={VIEW_WIDTH - PAD}
        format={(tick) => formatChartValue(tick, unit)}
      />

      {min < 0 && max > 0 ? <PlotZeroLine y={yAt(0)} x1={PAD} x2={VIEW_WIDTH - PAD} /> : null}

      {(levels ?? []).map((level) => (
        <PlotReferenceLine
          key={level.label}
          y={yAt(level.value)}
          x1={PAD}
          x2={VIEW_WIDTH - PAD}
          color={CHART_TONE_VAR[level.tone]}
          label={level.label}
        />
      ))}

      {series.map((entry) => {
        const color = CHART_TONE_VAR[entry.tone];
        if (entry.bars) {
          const slot = (VIEW_WIDTH - PAD * 2) / Math.max(entry.points.length, 1);
          const baseline = yAt(Math.max(min, 0));
          return (
            <g key={entry.id}>
              {entry.points.map((point, index) => {
                const y = yAt(point.value);
                const top = Math.min(y, baseline);
                return (
                  <rect
                    key={point.label}
                    x={xAt(index) - Math.max(slot * 0.26, 2)}
                    y={top}
                    width={Math.max(slot * 0.52, 4)}
                    height={Math.max(Math.abs(y - baseline), 1.2)}
                    rx={1.5}
                    fill={color}
                    opacity={0.85}
                  />
                );
              })}
            </g>
          );
        }

        const path = entry.points
          .map(
            (point, index) =>
              `${index === 0 ? 'M' : 'L'}${xAt(index).toFixed(2)},${yAt(point.value).toFixed(2)}`,
          )
          .join(' ');
        return (
          <g key={entry.id}>
            {entry.area && entry.points.length > 0 ? (
              <path
                d={`${path} L${xAt(entry.points.length - 1).toFixed(2)},${yAt(Math.max(min, 0)).toFixed(2)} L${xAt(0).toFixed(2)},${yAt(Math.max(min, 0)).toFixed(2)} Z`}
                fill={color}
                opacity={0.12}
              />
            ) : null}
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={1.6}
              strokeLinecap="round"
              {...(entry.dashed ? { strokeDasharray: '5 4' } : {})}
            />
            {entry.points.length <= 24
              ? entry.points.map((point, index) => (
                  <circle
                    key={point.label}
                    cx={xAt(index)}
                    cy={yAt(point.value)}
                    r={2}
                    fill={color}
                  />
                ))
              : null}
          </g>
        );
      })}

      {(markers ?? []).map((marker) => (
        <g key={marker.label}>
          <line
            x1={xAt(marker.index)}
            x2={xAt(marker.index)}
            y1={PAD}
            y2={VIEW_HEIGHT - PAD}
            stroke={CHART_TONE_VAR[marker.tone]}
            strokeWidth={0.6}
            opacity={0.4}
          />
          <circle
            cx={xAt(marker.index)}
            cy={yAt(marker.value)}
            r={4}
            fill="var(--color-bg)"
            stroke={CHART_TONE_VAR[marker.tone]}
            strokeWidth={1.6}
          />
          <text
            x={xAt(marker.index)}
            y={yAt(marker.value) - 8}
            textAnchor="middle"
            fill={CHART_TONE_VAR[marker.tone]}
            fontSize={10}
          >
            {marker.label}
          </text>
        </g>
      ))}

      {(annotations ?? []).map((annotation) => (
        <text
          key={annotation.label}
          x={xAt(annotation.index)}
          y={VIEW_HEIGHT - 8}
          textAnchor="middle"
          fill="var(--color-text-faint)"
          fontSize={10}
        >
          {annotation.label}
        </text>
      ))}

      {hoverIndex !== null && hoverIndex < longest ? (
        <line
          x1={xAt(hoverIndex)}
          x2={xAt(hoverIndex)}
          y1={PAD}
          y2={VIEW_HEIGHT - PAD}
          stroke="var(--color-border-strong)"
          strokeWidth={0.8}
        />
      ) : null}
    </ChartFrame>
  );
}
