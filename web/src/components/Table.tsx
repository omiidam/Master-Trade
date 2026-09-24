import {
  createContext,
  useContext,
  type HTMLAttributes,
  type ReactNode,
  type ThHTMLAttributes,
} from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '../lib/cn';
import { EmptyState } from './EmptyState';

/**
 * The table system.
 *
 * Six tables in the product, and before this file every one of them restated the whole table: four
 * cell paddings, three header treatments, two colours for the rule under the head, and numeric
 * alignment re-decided at each cell. `px-3 py-2` sat beside `py-3 pr-3` beside `py-2`, a header of
 * `text-caption font-semibold uppercase text-text-faint` sat beside `text-caption font-medium
 * text-text-muted`, and the same right-aligned figure was written `text-end` here, `tabular-nums`
 * there and `num` somewhere else. Those are not variants; they are six copies of the system.
 *
 * What is shared is the *frame*: how much air a row gets, where a number sits, what a header looks
 * like, how a row states its outcome, and what a table says when it has nothing to show. What stays
 * local is everything a table is *about* — the columns, the cells, the wording.
 *
 * Three rules are structural rather than stylistic:
 *
 *   1. **A number is right-aligned and monospaced.** A column of figures is only readable if the
 *      digits line up, so `numeric` sets the alignment *and* the product's `.num` — not Tailwind's
 *      `tabular-nums`, which sets the figure variant and leaves the font to whatever it inherits.
 *      Two utilities for one job is how a column of prices ends up one screen ragged and the next
 *      one straight.
 *   2. **The head is a rule, not a band.** No fill, no second surface: a table sits inside a card
 *      that already has a fill, and a shaded head would be a panel inside a panel. The head states
 *      itself with an uppercase micro-label and a stronger hairline than the rows.
 *   3. **A row's outcome is on its edge.** `accent` paints a 2px rule down the row's start edge —
 *      the same construction the journal already used — so a win, a loss and a flat are separable
 *      before any figure is read, and it works in a dense table where a badge per row would not.
 */

/** How much air a row gets. `compact` is the default: this is a dense-data product. */
export type TableDensity = 'compact' | 'spacious';

export type TableAlign = 'start' | 'end';

/** The ink a cell's content takes. The semantic states from `design/tokens.ts`, at cell scale. */
export type TableCellTone =
  'default' | 'muted' | 'faint' | 'success' | 'danger' | 'warning' | 'info';

/**
 * The outcome a row is marked with, on its start edge.
 *
 * `none` is the ordinary row and the default: a table of reference data has no outcome, and marking
 * every row would make the marking meaningless.
 */
export type TableRowAccent = 'none' | 'success' | 'danger' | 'warning' | 'info';

interface DensityScale {
  /** A header cell. */
  head: string;
  /** A body cell. */
  cell: string;
}

const DENSITY: Record<TableDensity, DensityScale> = {
  compact: { head: 'px-3 py-2', cell: 'px-3 py-2' },
  spacious: { head: 'px-4 py-2.5', cell: 'px-4 py-3' },
};

/**
 * The parts read the density from the table they are in.
 *
 * A context rather than a prop on every part, for the reason the card system uses one: the
 * alternative is a table that says `density="compact"` once and then restates the same padding on
 * every cell of every row — which is how one number becomes six and drifts. A part may still
 * override with its own `className`.
 */
const TableDensityContext = createContext<TableDensity>('compact');

export const TABLE_ALIGN: Record<TableAlign, string> = {
  start: 'text-start',
  end: 'text-end',
};

/**
 * The header label: an uppercase micro-label, and the same one the metric cards use.
 *
 * Uppercase is the convention that separates a *label* from the data under it at this size, and it
 * is chosen over a shaded band because it costs no surface — a table already sits on a card, and a
 * fill here would be a panel inside a panel.
 */
/**
 * Two head variants, because a head cell is one of two things.
 *
 * A **label** names a column of values — `Planned`, `Actual`, `Sample` — and an uppercase
 * micro-label is what separates it from the figures beneath it at this size. A **heading** names a
 * *thing* — a plan, a symbol, a party — and uppercasing it would make the most important column in
 * the table the quietest one. The distinction is real rather than decorative: the second variant
 * exists because a table with per-plan columns has a head made of proper nouns.
 */
export type TableHeadVariant = 'label' | 'heading';

const HEAD_VARIANT: Record<TableHeadVariant, string> = {
  label: 'text-caption font-medium tracking-wide text-text-muted uppercase',
  heading: 'text-body font-medium text-text',
};

const CELL_TONE: Record<TableCellTone, string> = {
  default: 'text-text',
  muted: 'text-text-muted',
  faint: 'text-text-faint',
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
};

const ROW_ACCENT: Record<TableRowAccent, string> = {
  none: '',
  success: 'before:bg-success',
  danger: 'before:bg-danger',
  warning: 'before:bg-warning',
  info: 'before:bg-info',
};

export interface TableSortState {
  /**
   * `null` when the column can be sorted but is not the one doing the sorting.
   *
   * Three states rather than a boolean, because "sortable" and "sorted" are different facts and a
   * header that cannot say the first is a header nobody clicks.
   */
  direction: 'asc' | 'desc' | null;
  onToggle: () => void;
  /** Overrides the accessible name, e.g. when the label is an abbreviation. */
  label?: string;
}

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /**
   * The table's accessible name.
   *
   * A table needs one, and it is a caption rather than an `aria-label` so a reader can also reach it
   * as text. Visually hidden: the surface around it already has a visible heading.
   */
  label: string;
  density?: TableDensity;
  /**
   * A floor for the width, in pixels, below which the table scrolls sideways instead of squeezing.
   *
   * A number rather than a class so the floors are comparable across the product and visible in one
   * place; the *scroll container* is this component's own wrapper, so a table never widens the page.
   */
  minWidth?: number;
}

/**
 * The frame: a scroll container and the table in it.
 *
 * The wrapper is `overflow-x-auto` on purpose. A dense table has a minimum readable width, and on a
 * phone the honest answer is a sideways scroll *inside the table's own box* rather than a squeezed
 * column or a page that scrolls as a whole.
 *
 * It is also `relative`, and that is not decoration. `sr-only` — which this table uses for its
 * caption and for every figure's direction — is `position: absolute`, so it takes the nearest
 * *positioned* ancestor as its containing block. Without this, that ancestor is the `Card` behind
 * the table (positioned for its own shine), and a reader-only span sitting at the far right of an
 * 1080px row escapes the scroller's clip and widens the *document*: the page gains a sideways scroll
 * into empty space while every element still measures inside the viewport, which is why the defect
 * is invisible to an element-by-element overflow check. Positioning the scroll container makes it
 * the containing block, so its own clip applies.
 */
export function Table({
  label,
  density = 'compact',
  minWidth,
  className,
  children,
  ...rest
}: TableProps) {
  return (
    <TableDensityContext.Provider value={density}>
      <div className="relative overflow-x-auto">
        <table
          // No type size of its own: the same frame serves a dense journal grid, a footnote table
          // and a plan comparison, and those are three different sizes. The caller sets it once on
          // the table and the cells inherit, so the size cannot differ cell by cell.
          className={cn('w-full border-collapse', className)}
          style={minWidth === undefined ? undefined : { minWidth: `${minWidth}px` }}
          {...rest}
        >
          <caption className="sr-only">{label}</caption>
          {children}
        </table>
      </div>
    </TableDensityContext.Provider>
  );
}

/** The head row. One row: a multi-row head is a header group, which nothing here needs. */
export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-border-strong">{children}</tr>
    </thead>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  /** The outcome, on the row's start edge. */
  accent?: TableRowAccent;
  /**
   * Recede the row without hiding it.
   *
   * An archived or superseded row is still a record — dimming it keeps it readable while saying it
   * is not the current thing, which is the `inactive` state from the semantic vocabulary rather
   * than a second way to say "empty".
   */
  muted?: boolean;
  /** Whether the row lifts under the pointer. True for data a reader scans across. */
  interactive?: boolean;
}

export function TableRow({
  accent = 'none',
  muted = false,
  interactive = true,
  className,
  children,
  ...rest
}: TableRowProps) {
  return (
    <tr
      className={cn(
        'border-b border-border transition-colors duration-[var(--duration-fast)] last:border-b-0',
        // The accent is a pseudo-element, so marking a row costs it no width and cannot shift the
        // columns when a row's outcome changes.
        accent === 'none'
          ? ''
          : 'relative before:absolute before:inset-y-0 before:start-0 before:w-0.5',
        ROW_ACCENT[accent],
        muted && 'opacity-60',
        interactive && 'hover:bg-surface-raised/50',
        className,
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

export interface TableHeaderCellProps
  // `align` is omitted because the DOM's own `align` is a deprecated presentational attribute
  // taking `left`/`right`; this component's `align` is the logical `start`/`end`, which is the one
  // that survives an RTL interface.
  extends Omit<ThHTMLAttributes<HTMLTableCellElement>, 'align'> {
  align?: TableAlign;
  /** Right-align and monospace, for a column of figures. */
  numeric?: boolean;
  variant?: TableHeadVariant;
  sort?: TableSortState;
}

export function TableHeaderCell({
  align,
  numeric = false,
  variant = 'label',
  sort,
  className,
  children,
  ...rest
}: TableHeaderCellProps) {
  const density = DENSITY[useContext(TableDensityContext)];
  const resolvedAlign = align ?? (numeric ? 'end' : 'start');
  const sorted = sort?.direction ?? null;
  return (
    <th
      scope="col"
      // `aria-sort` is how a screen reader is told which column is ordering the rows, and in which
      // direction. A sortable column that is not the active one is `none` rather than absent, so the
      // header is announced as sortable at all.
      {...(sort === undefined
        ? {}
        : {
            'aria-sort': sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none',
          })}
      className={cn(HEAD_VARIANT[variant], density.head, TABLE_ALIGN[resolvedAlign], className)}
      {...rest}
    >
      {sort === undefined ? (
        children
      ) : (
        <button
          type="button"
          onClick={sort.onToggle}
          aria-label={`Sort by ${sort.label ?? String(children)}`}
          className={cn(
            'inline-flex items-center gap-1 transition-colors duration-[var(--duration-fast)]',
            sorted === null ? 'hover:text-text' : 'text-text',
          )}
        >
          {children}
          {/* The arrow occupies its space whether or not it is drawn, so toggling the sort cannot
              change the column's width — and it stays in the accessible name's shadow via
              `aria-hidden`, because the button already says what it does. */}
          <span aria-hidden className={cn(sorted === null && 'opacity-0')}>
            {sorted === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
          </span>
        </button>
      )}
    </th>
  );
}

export interface TableCellProps extends HTMLAttributes<HTMLTableCellElement> {
  align?: TableAlign;
  tone?: TableCellTone;
  /** Right-align and monospace, for a column of figures. */
  numeric?: boolean;
}

/**
 * A body cell.
 *
 * `numeric` implies the alignment rather than leaving them to be stated twice, because a number
 * that is monospaced but not right-aligned is the exact half-finished state this replaces.
 */
export function TableCell({
  align,
  tone = 'default',
  numeric = false,
  className,
  children,
  ...rest
}: TableCellProps) {
  const density = DENSITY[useContext(TableDensityContext)];
  const resolvedAlign = align ?? (numeric ? 'end' : 'start');
  return (
    <td
      className={cn(
        density.cell,
        'align-middle',
        TABLE_ALIGN[resolvedAlign],
        CELL_TONE[tone],
        numeric && 'num',
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

export interface TableRowHeaderCellProps extends Omit<
  ThHTMLAttributes<HTMLTableCellElement>,
  'align'
> {
  align?: TableAlign;
  tone?: TableCellTone;
}

/**
 * The cell that names the row.
 *
 * `<th scope="row">` is what makes a table navigable rather than a grid of anonymous cells, and it
 * was already used in three of the six tables; it lives here so the fourth does not become a `<td>`
 * with bold text.
 */
export function TableRowHeaderCell({
  align = 'start',
  tone = 'default',
  className,
  children,
  ...rest
}: TableRowHeaderCellProps) {
  const density = DENSITY[useContext(TableDensityContext)];
  return (
    <th
      scope="row"
      className={cn(
        density.cell,
        'align-middle font-normal',
        TABLE_ALIGN[align],
        CELL_TONE[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export interface TableEmptyRowProps {
  /** How many columns the row spans. There is no way to infer it, so it is required. */
  colSpan: number;
  title: string;
  description?: string;
  action?: ReactNode;
  hint?: string;
  icon?: ReactNode;
}

/**
 * A table's own empty state: a row, inside the table.
 *
 * The distinction this exists for is the one the journal already made in prose — a table with no
 * *rows* is not the same as a surface with no *data*. Keeping the head means a reader can still see
 * what would have been there, which a replaced-by-a-panel table loses. It renders the product's
 * existing `EmptyState`, so there is no second empty-state design and no second set of words.
 */
export function TableEmptyRow({
  colSpan,
  title,
  description,
  action,
  hint,
  icon,
}: TableEmptyRowProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-3">
        <EmptyState
          title={title}
          {...(description === undefined ? {} : { description })}
          {...(action === undefined ? {} : { action })}
          {...(hint === undefined ? {} : { hint })}
          {...(icon === undefined ? {} : { icon })}
        />
      </td>
    </tr>
  );
}
