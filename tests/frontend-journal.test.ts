import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertNoExecutionControls } from '../packages/shared/src/frontend/viewModels.js';
import { APP_PAGE_IDS, NAV_SECTIONS } from '../web/src/config/navigation.js';
import { translate } from '../web/src/i18n/index.js';
import {
  buildTradeTimeline,
  findTrade,
  mockTradeEvents,
  mockTrades,
} from '../web/src/mock/journalTrades.js';
import {
  AI_REVIEW_STATE_LABEL,
  AI_REVIEW_STATE_ORDER,
  CALENDAR_DAY_STATE_LABEL,
  COMPLIANCE_LABEL,
  EMPTY_TRADE_FILTERS,
  previewNotice,
  JOURNAL_RULE_CHECKLIST,
  RESULT_LABEL,
  REVIEW_STATES,
  RULE_COMPLIANCES,
  countActiveFilters,
  describeRange,
  filterTrades,
  mockCalendarDays,
  mockCumulativeR,
  mockDrawdownCurve,
  mockEquityCurve,
  mockJournalStats,
  mockPlannedVsActual,
  mockSessionPerformance,
  mockSetupPerformance,
  rangeWindow,
  setupById,
  sortTrades,
  summariseTradeStates,
  withinRange,
} from '../web/src/mock/journal.js';
import {
  EMPTY_TRADE_FORM,
  positiveNumber,
  validateTradeForm,
} from '../web/src/components/journal/tradeFormModel.js';
import type { TradeFormValues } from '../web/src/components/journal/tradeFormModel.js';
import type { TradeStatus } from '../web/src/mock/journal.js';

const root = process.cwd();
const web = join(root, 'web');
const journalDir = join(web, 'src', 'components', 'journal');

function journalFiles(extension: string): string[] {
  if (!existsSync(journalDir)) return [];
  return readdirSync(journalDir)
    .filter((entry) => entry.endsWith(extension))
    .sort();
}

/** Interactive control names found in a source file, as in the shell suite. */
function controlNames(source: string): string[] {
  const names: string[] = [];
  const tagPattern = /<(Button|IconButton|button|a)\b([^>]*)>/g;
  let tag: RegExpExecArray | null;
  while ((tag = tagPattern.exec(source)) !== null) {
    const attributes = tag[2] ?? '';
    const attributePattern = /(?:aria-label|label)=["']([^"']+)["']/g;
    let attribute: RegExpExecArray | null;
    while ((attribute = attributePattern.exec(attributes)) !== null) {
      if (attribute[1] !== undefined) names.push(attribute[1]);
    }
  }
  return names;
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function sumR(values: readonly number[]): number {
  return round(values.reduce((total, value) => total + value, 0));
}

const COMPONENT_FILES = [
  'AIReviewPanel.tsx',
  'AnalyticsPanel.tsx',
  'ChartToolbar.tsx',
  'ChecklistField.tsx',
  'DirectionBadge.tsx',
  'FormSection.tsx',
  'FullscreenChartViewer.tsx',
  'JournalCalendar.tsx',
  'JournalStatCard.tsx',
  'MetricBar.tsx',
  'MistakeTag.tsx',
  'PerformanceChart.tsx',
  'PsychologyScale.tsx',
  'RMultipleIndicator.tsx',
  'RiskSummary.tsx',
  'RuleComplianceBadge.tsx',
  'ScreenshotGallery.tsx',
  'SetupBadge.tsx',
  'TradeFilters.tsx',
  'TradeForm.tsx',
  'TradeRow.tsx',
  'TradeTable.tsx',
  'TradeTimeline.tsx',
  'index.ts',
  'tradeFormModel.ts',
] as const;

/** The seven internal sections. Journal is one sidebar entry; these are tabs, not pages. */
const JOURNAL_SECTIONS = [
  'overview',
  'history',
  'add',
  'details',
  'analytics',
  'calendar',
  'reviews',
] as const;

/**
 * Trading journal invariants.
 *
 * A journal is the one surface where being *wrong* is worse than being empty: it
 * is the record every later review is built on. These assertions guard the
 * properties that make it trustworthy rather than pretty — an unrecorded value
 * never reads as a zero, a level set never contradicts its direction, and no part
 * of the module offers an execution affordance.
 */
describe('trading journal module', () => {
  it('is exactly one navigation entry, with its sections inside the page', () => {
    const journalEntries = NAV_SECTIONS.filter((section) => section.id === 'journal');
    expect(journalEntries).toHaveLength(1);
    expect(APP_PAGE_IDS.filter((id) => id === 'journal')).toHaveLength(1);
    // No sub-section leaks into the sidebar as its own category.
    expect(NAV_SECTIONS.filter((section) => section.id.startsWith('journal-'))).toHaveLength(0);
    const navLabels = NAV_SECTIONS.map((section) =>
      translate('en', section.labelKey).toLowerCase(),
    );
    for (const label of ['trade history', 'add trade', 'trade details', 'reviews and lessons']) {
      expect(navLabels, `${label} leaked into the sidebar`).not.toContain(label);
    }
    for (const section of NAV_SECTIONS) {
      expect(() =>
        assertNoExecutionControls([
          translate('en', section.labelKey),
          translate('en', section.descriptionKey),
        ]),
      ).not.toThrow();
    }
  });

  it('keeps the journal page and every component on disk', () => {
    expect(existsSync(join(web, 'src', 'pages', 'JournalPage.tsx'))).toBe(true);
    for (const file of COMPONENT_FILES) {
      expect(existsSync(join(journalDir, file)), `${file} is missing`).toBe(true);
    }
    expect(journalFiles('.tsx')).toHaveLength(
      COMPONENT_FILES.filter((file) => file.endsWith('.tsx')).length,
    );
  });

  it('exposes the journal components through the module barrel', () => {
    const barrel = readFileSync(join(journalDir, 'index.ts'), 'utf8');
    const required = [
      'JournalStatCard',
      'PerformanceChart',
      'ChartToolbar',
      'TradeTable',
      'TradeRow',
      'TradeFilters',
      'TradeForm',
      'FormSection',
      'SetupBadge',
      'DirectionBadge',
      'RiskSummary',
      'RMultipleIndicator',
      'RuleComplianceBadge',
      'MistakeTag',
      'ScreenshotGallery',
      'TradeTimeline',
      'JournalCalendar',
      'AnalyticsPanel',
      'AIReviewPanel',
      'FullscreenChartViewer',
      'MetricBar',
      'ChecklistField',
      'PsychologyScale',
    ];
    for (const component of required) {
      expect(barrel, `${component} is missing from the journal barrel`).toMatch(
        new RegExp(`\\b${component}\\b`),
      );
    }
    // And the same surface is re-exported by the application barrel.
    const appBarrel = readFileSync(join(web, 'src', 'components', 'index.ts'), 'utf8');
    for (const component of required) {
      expect(appBarrel, `${component} is missing from the component barrel`).toMatch(
        new RegExp(`\\b${component}\\b`),
      );
    }
  });

  it('never labels a journal control with an execution affordance', () => {
    const sources = [
      ...journalFiles('.tsx').map((file) => readFileSync(join(journalDir, file), 'utf8')),
      readFileSync(join(web, 'src', 'pages', 'JournalPage.tsx'), 'utf8'),
    ];
    const offenders: string[] = [];
    for (const source of sources) {
      for (const name of controlNames(source)) {
        try {
          assertNoExecutionControls([name]);
        } catch {
          offenders.push(name);
        }
      }
    }
    expect(offenders).toEqual([]);
    // Deliberate probe: the guard must still catch execution vocabulary.
    expect(() => assertNoExecutionControls(['Place order'])).toThrow();
  });

  it('does not reach for a backend module, a browser store or a network call', () => {
    for (const file of [...journalFiles('.tsx'), ...journalFiles('.ts')]) {
      const source = readFileSync(join(journalDir, file), 'utf8');
      expect(source, `${file} imports a backend path`).not.toMatch(/from '(\.\.\/)+src\//);
      expect(source, `${file} imports a node builtin`).not.toMatch(/from 'node:/);
      expect(source, `${file} touches browser storage`).not.toMatch(
        /localStorage|sessionStorage|document\.cookie/,
      );
      expect(source, `${file} makes a network call`).not.toMatch(/\bfetch\(|XMLHttpRequest/);
    }
  });

  it('states on the page that the data is a preview', () => {
    expect(previewNotice()).toMatch(/preview/i);
    const page = readFileSync(join(web, 'src', 'pages', 'JournalPage.tsx'), 'utf8');
    expect(page).toMatch(/\bpreviewNotice\b/);
    expect(page).toMatch(/preview/i);
    // Every internal section is rendered from the page rather than from the sidebar.
    for (const section of JOURNAL_SECTIONS) {
      expect(page, `section ${section} is missing`).toContain(`id: '${section}'`);
    }
  });

  describe('the records themselves', () => {
    it('covers every declared state across the sample', () => {
      const statuses = new Set(mockTrades.map((trade) => trade.status));
      for (const status of ['closed', 'open', 'incomplete', 'archived'] as TradeStatus[]) {
        expect(statuses.has(status), `no record exercises the "${status}" status`).toBe(true);
      }
      const results = new Set(mockTrades.map((trade) => trade.result));
      for (const key of Object.keys(RESULT_LABEL) as (keyof typeof RESULT_LABEL)[]) {
        expect(results.has(key), `no record exercises the "${key}" result`).toBe(true);
      }
      const compliances = new Set(mockTrades.map((trade) => trade.compliance));
      for (const key of RULE_COMPLIANCES) {
        expect(compliances.has(key), `no record exercises "${key}" compliance`).toBe(true);
      }
      const reviews = new Set(mockTrades.map((trade) => trade.reviewState));
      for (const key of REVIEW_STATES) {
        expect(reviews.has(key), `no record exercises "${key}" review state`).toBe(true);
      }
      // The review surface must design all five states, in lifecycle order.
      expect(AI_REVIEW_STATE_ORDER).toEqual([
        'not-available',
        'pending',
        'processing',
        'completed',
        'failed',
      ]);
      for (const state of AI_REVIEW_STATE_ORDER) {
        expect(AI_REVIEW_STATE_LABEL[state].length).toBeGreaterThan(0);
      }
    });

    it('keeps every level set coherent with the direction', () => {
      for (const trade of mockTrades) {
        const { entry, stopLoss, takeProfit, riskAmount, plannedRr, positionSize } = trade.plan;
        expect(positionSize, `${trade.ref} has no size`).toBeGreaterThan(0);
        expect(riskAmount, `${trade.ref} risks nothing`).toBeGreaterThan(0);
        expect(plannedRr, `${trade.ref} plans no reward`).toBeGreaterThan(0);
        if (trade.direction === 'long') {
          expect(stopLoss, `${trade.ref} long stop is not below entry`).toBeLessThan(entry);
          expect(takeProfit, `${trade.ref} long target is not above entry`).toBeGreaterThan(entry);
        } else {
          expect(takeProfit, `${trade.ref} short target is not below entry`).toBeLessThan(entry);
          expect(stopLoss, `${trade.ref} short stop is not above entry`).toBeGreaterThan(entry);
        }
      }
    });

    it('scores a result consistently, and never scores zero for "unrecorded"', () => {
      const band = 0.15;
      for (const trade of mockTrades) {
        const actualR = trade.actual?.actualR ?? null;
        switch (trade.result) {
          case 'win':
            expect(actualR, `${trade.ref} is a win with no R`).not.toBeNull();
            expect(actualR ?? 0).toBeGreaterThan(band);
            break;
          case 'loss':
            expect(actualR, `${trade.ref} is a loss with no R`).not.toBeNull();
            expect(actualR ?? 0).toBeLessThan(-band);
            break;
          case 'breakeven':
            expect(actualR, `${trade.ref} is break-even with no R`).not.toBeNull();
            expect(Math.abs(actualR ?? 1)).toBeLessThanOrEqual(band);
            break;
          case 'pending':
            // An unscored record is a gap, never a measured flat result.
            expect(actualR, `${trade.ref} is unscored but carries an R`).toBeNull();
            expect(trade.actual?.exit ?? null).toBeNull();
            break;
        }
      }
    });

    it('agrees between status, timestamps and the outcome', () => {
      for (const trade of mockTrades) {
        if (trade.status === 'closed' || trade.status === 'archived') {
          expect(trade.closedAt, `${trade.ref} is closed with no close time`).not.toBeNull();
          expect(trade.actual?.exit ?? null).not.toBeNull();
        } else {
          expect(trade.closedAt, `${trade.ref} is not closed but has a close time`).toBeNull();
          expect(trade.closedAt === null && trade.actual?.exit === null).toBe(true);
        }
      }
    });

    it('forces a review when a rule was broken, and once an unscored record is finished', () => {
      for (const trade of mockTrades) {
        // A record that is still open cannot be reviewed yet: the trade has not
        // finished, so asking for a review would be asking for a guess.
        const reviewable = trade.status !== 'open';
        const mustReview =
          trade.compliance === 'violation' || (trade.result === 'pending' && reviewable);
        if (mustReview) {
          expect(
            trade.reviewState,
            `${trade.ref} needs a review and does not ask for one`,
          ).not.toBe('not-required');
        }
        if (!reviewable) {
          expect(trade.reviewState, `${trade.ref} is open but asks for a review`).toBe(
            'not-required',
          );
        }
      }
      const required = mockTrades.filter((trade) => trade.reviewState === 'required');
      expect(required.length).toBeGreaterThan(0);
      // Both routes into a review are exercised: a rule break and a finished but
      // unscored record.
      expect(required.some((trade) => trade.compliance === 'violation')).toBe(true);
      expect(required.some((trade) => trade.result === 'pending')).toBe(true);
    });

    it('never claims a completed model review', () => {
      // No provider is connected, so no record may present generated output as real.
      for (const trade of mockTrades) {
        expect(trade.aiReviewState, `${trade.ref} claims a generated review`).not.toBe('completed');
      }
      // The states exist as a design exhibit instead.
      expect(AI_REVIEW_STATE_LABEL.completed).toBe('Completed');
    });

    it('names a real setup and carries at least one attachment per record', () => {
      for (const trade of mockTrades) {
        expect(setupById(trade.setupId), `${trade.ref} names an unknown setup`).toBeDefined();
        expect(trade.screenshots.length, `${trade.ref} has no attachment`).toBeGreaterThan(0);
        for (const attachment of trade.screenshots) {
          expect(attachment.id.startsWith(trade.ref.toLowerCase())).toBe(true);
          expect(attachment.capturedAt.length).toBeGreaterThan(0);
        }
        expect(trade.tags.length, `${trade.ref} has no tags`).toBeGreaterThan(0);
      }
    });

    it('keeps psychology self-reports inside their scale', () => {
      for (const trade of mockTrades) {
        if (trade.psychology === undefined) continue;
        for (const value of [
          trade.psychology.confidence,
          trade.psychology.fear,
          trade.psychology.greed,
          trade.psychology.fomo,
          trade.psychology.hesitation,
          trade.psychology.impulsiveness,
          trade.psychology.discipline,
        ]) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(10);
        }
      }
    });

    it('marks every checklist entry a written plan claims to have satisfied', () => {
      const known = new Set(JOURNAL_RULE_CHECKLIST.map((item) => item.id));
      for (const trade of mockTrades) {
        if (trade.rationale === undefined) continue;
        for (const item of trade.rationale.checklist) {
          expect(known.has(item), `${trade.ref} cites unknown checklist item ${item}`).toBe(true);
        }
        // A compliant record cannot cite fewer items than the plan acknowledges.
        if (trade.rationale.compliance === 'compliant') {
          expect(trade.rationale.checklist.length).toBeGreaterThan(0);
        }
      }
    });

    it('builds a timeline only from timestamps the record actually has', () => {
      for (const trade of mockTrades) {
        const events = buildTradeTimeline(trade);
        expect(events.length, `${trade.ref} has no history`).toBeGreaterThan(0);
        for (const event of events) {
          expect(event.tradeId).toBe(trade.id);
          expect(event.detail.length).toBeGreaterThan(0);
        }
        const kinds = events.map((event) => event.kind);
        // No exit event without a close, and no review event without a review.
        expect(kinds.includes('exit')).toBe(trade.closedAt !== null);
        expect(kinds.includes('review')).toBe(trade.review !== undefined);
      }
      const ids = new Set(mockTrades.map((trade) => trade.id));
      for (const event of mockTradeEvents) {
        expect(ids.has(event.tradeId), `${event.id} references an unknown trade`).toBe(true);
      }
      expect(findTrade('TR-041')?.symbol).toBe('ES');
      expect(findTrade('nope')).toBeUndefined();
    });
  });

  describe('the aggregates', () => {
    it('reports the ten headline figures under unique ids', () => {
      const ids = mockJournalStats.map((stat) => stat.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual([
        'total-trades',
        'win-rate',
        'average-r',
        'profit-factor',
        'expectancy',
        'max-drawdown',
        'net-performance',
        'average-risk',
        'rule-compliance',
        'average-rr',
      ]);
      for (const stat of mockJournalStats) {
        expect(stat.comparison.length, `${stat.id} has no comparison`).toBeGreaterThan(0);
        expect(stat.basis.length, `${stat.id} has no basis`).toBeGreaterThan(0);
        expect(['positive', 'negative', 'neutral', 'warning']).toContain(stat.tone);
      }
      // A drawdown is never positive, and risk is never zero.
      const drawdown = mockJournalStats.find((stat) => stat.id === 'max-drawdown');
      expect(drawdown?.value.trim().startsWith('−')).toBe(true);
      const risk = mockJournalStats.find((stat) => stat.id === 'average-risk');
      expect(Number(risk?.value)).toBeGreaterThan(0);
    });

    it('keeps the headline figures consistent with the rows they summarise', () => {
      const scored = mockTrades
        .map((trade) => trade.actual?.actualR ?? null)
        .filter((value): value is number => value !== null);
      const average = sumR(scored) / scored.length;
      const averageStat = mockJournalStats.find((stat) => stat.id === 'average-r');
      expect(averageStat?.value.trim().startsWith('+')).toBe(average > 0);
      expect(Math.abs(Number(averageStat?.value.replace('+', '') ?? '0') - average)).toBeLessThan(
        0.02,
      );

      const total = mockJournalStats.find((stat) => stat.id === 'total-trades');
      expect(Number(total?.value)).toBe(mockTrades.length);

      const states = summariseTradeStates(mockTrades);
      expect(states.scored).toBe(scored.length);
      expect(states.total).toBe(mockTrades.length);
      expect(
        states.byStatus.closed +
          states.byStatus.open +
          states.byStatus.incomplete +
          states.byStatus.archived,
      ).toBe(mockTrades.length);
    });

    it('keeps the R curve, the drawdown curve and the headline drawdown in agreement', () => {
      const scored = mockTrades
        .map((trade) => trade.actual?.actualR ?? null)
        .filter((value): value is number => value !== null);
      expect(mockEquityCurve.points).toHaveLength(scored.length);
      const last = mockEquityCurve.points.at(-1)?.value ?? 0;
      expect(Math.abs(last - sumR(scored))).toBeLessThan(0.02);

      // Cumulative R is one value per scored trade, in the order the trades closed.
      const chronological = [...mockTrades]
        .sort((a, b) => (a.openedAt < b.openedAt ? -1 : 1))
        .map((trade) => trade.actual?.actualR ?? null)
        .filter((value): value is number => value !== null);
      expect(mockCumulativeR.points.map((point) => point.value)).toEqual(
        mockCumulativeR.points.map((_, index) => round(chronological[index] ?? 0)),
      );

      // The equity curve is the running total of that series, and the drawdown
      // curve is its distance below the running peak. Both are recomputed here, so
      // a hand-edited point in one series cannot silently disagree with the others.
      let running = 0;
      let peak = 0;
      mockCumulativeR.points.forEach((point, index) => {
        running = round(running + point.value);
        peak = Math.max(peak, running);
        expect(Math.abs((mockEquityCurve.points[index]?.value ?? 0) - running)).toBeLessThan(0.02);
        expect(
          Math.abs((mockDrawdownCurve.points[index]?.value ?? 0) - round(running - peak)),
        ).toBeLessThan(0.02);
      });

      // Drawdown is a distance below a high-water mark, so it is never positive.
      for (const point of mockDrawdownCurve.points) {
        expect(point.value).toBeLessThanOrEqual(0);
      }
      const worst = Math.min(...mockDrawdownCurve.points.map((point) => point.value));
      const stat = mockJournalStats.find((entry) => entry.id === 'max-drawdown');
      expect(Math.abs(Number(stat?.value.replace('−', '-') ?? '0') - worst)).toBeLessThan(0.001);
    });

    it('reports a sample size with every breakdown rate', () => {
      for (const rows of [mockSetupPerformance, mockSessionPerformance, mockPlannedVsActual]) {
        let sample = 0;
        for (const row of rows) {
          expect(row.sample).toBeGreaterThan(0);
          expect(row.winRatePct).toBeGreaterThanOrEqual(0);
          expect(row.winRatePct).toBeLessThanOrEqual(100);
          expect(row.plannedRr).toBeGreaterThan(0);
          sample += row.sample;
        }
        // Setup buckets partition the scored trades exactly once.
        expect(sample).toBe(summariseTradeStates(mockTrades).scored);
      }
    });
  });

  describe('the calendar', () => {
    it('accounts for every record exactly once, with the day total recomputed', () => {
      for (const day of mockCalendarDays) {
        const onDay = mockTrades.filter((trade) => trade.openedAt.slice(0, 10) === day.date);
        expect(onDay.length, `${day.date} trade count disagrees`).toBe(day.tradeCount);
        const scored = onDay
          .map((trade) => trade.actual?.actualR ?? null)
          .filter((value): value is number => value !== null);
        if (scored.length === 0) {
          expect(day.netR, `${day.date} reports a result with nothing scored`).toBeNull();
        } else {
          expect(Math.abs((day.netR ?? 0) - sumR(scored))).toBeLessThan(0.02);
        }
        const risk = onDay.reduce((total, trade) => total + trade.plan.riskAmount, 0);
        expect(day.riskTotal, `${day.date} risk total disagrees`).toBe(risk);
        expect(CALENDAR_DAY_STATE_LABEL[day.state].length).toBeGreaterThan(0);
        expect(day.emotionalScore).toBeGreaterThanOrEqual(1);
        expect(day.emotionalScore).toBeLessThanOrEqual(10);
        expect(day.lesson.length).toBeGreaterThan(20);
        expect(COMPLIANCE_LABEL[day.compliance]).toBeDefined();
      }
      // Every record appears on a calendar day.
      const dates = new Set(mockCalendarDays.map((day) => day.date));
      for (const trade of mockTrades) {
        expect(dates.has(trade.openedAt.slice(0, 10)), `${trade.ref} is on no calendar day`).toBe(
          true,
        );
      }
    });
  });

  describe('selection and sorting', () => {
    it('filters on the record, not on a re-computed metric', () => {
      expect(countActiveFilters(EMPTY_TRADE_FILTERS)).toBe(0);
      const filtered = filterTrades(mockTrades, {
        ...EMPTY_TRADE_FILTERS,
        setupId: 'liquidity-sweep',
      });
      expect(filtered.length).toBeGreaterThan(0);
      for (const trade of filtered) expect(trade.setupId).toBe('liquidity-sweep');

      const search = filterTrades(mockTrades, { ...EMPTY_TRADE_FILTERS, search: 'eurusd' });
      expect(search.length).toBeGreaterThan(0);
      for (const trade of search) expect(trade.symbol.toLowerCase()).toContain('eurusd');

      expect(countActiveFilters({ ...EMPTY_TRADE_FILTERS, search: 'es' })).toBe(1);
      expect(countActiveFilters({ ...EMPTY_TRADE_FILTERS, result: 'win' })).toBe(1);
    });

    it('excludes unrecorded values from a sorted column instead of ranking them as zero', () => {
      const ascending = sortTrades(mockTrades, 'actualR', 'asc');
      const descending = sortTrades(mockTrades, 'actualR', 'desc');
      expect(ascending.at(-1)?.actual?.actualR ?? null).toBeNull();
      expect(descending.at(-1)?.actual?.actualR ?? null).toBeNull();
      const first = ascending[0]?.actual?.actualR ?? 0;
      expect(first).toBeLessThan(0);
      const top = descending[0]?.actual?.actualR ?? 0;
      expect(top).toBeGreaterThan(0);
    });

    it('applies a date range against the fixed report date, not the wall clock', () => {
      const window = rangeWindow('last-90');
      expect(window.from).toBe('2026-06-22T12:00:00.000Z');
      expect(window.to).toBe('2026-09-20T12:00:00.000Z');
      for (const trade of mockTrades) {
        expect(withinRange(trade.openedAt, EMPTY_TRADE_FILTERS)).toBe(true);
      }
      const tooEarly = withinRange('2026-01-01T00:00:00Z', EMPTY_TRADE_FILTERS);
      expect(tooEarly).toBe(false);
      const custom = { ...EMPTY_TRADE_FILTERS, range: 'custom' as const, rangeTo: '2026-09-05' };
      expect(withinRange('2026-09-05T23:00:00Z', custom)).toBe(true);
      expect(withinRange('2026-09-06T00:30:00Z', custom)).toBe(false);
    });
  });

  describe('the add-trade rules', () => {
    const valid: TradeFormValues = {
      ...EMPTY_TRADE_FORM,
      symbol: 'ES',
      setupId: 'breakout-retest',
      entryPrice: '5842.25',
      stopLoss: '5833.25',
      takeProfit: '5865.25',
      positionSize: '4',
      plannedRisk: '1800',
      thesis: 'The retest of the broken level holds and continues with the daily bias.',
      invalidation: 'A close back inside the zone without a rejection voids the setup.',
      checklist: ['bias', 'level', 'invalidation'],
    };

    it('refuses a record with nothing in it', () => {
      const errors = validateTradeForm(EMPTY_TRADE_FORM);
      expect(errors.information?.length).toBeGreaterThan(0);
      expect(errors.risk?.length).toBeGreaterThan(0);
      expect(errors.plan?.length).toBeGreaterThan(0);
    });

    it('accepts a coherent record', () => {
      expect(validateTradeForm(valid)).toEqual({});
    });

    it('refuses a long whose invalidation sits above its entry', () => {
      const errors = validateTradeForm({ ...valid, stopLoss: '5900' });
      expect(errors.risk?.join(' ')).toMatch(/long needs invalidation below/i);
    });

    it('refuses a short whose target sits above its entry', () => {
      const errors = validateTradeForm({
        ...valid,
        direction: 'short',
        takeProfit: '5900',
        stopLoss: '5860',
      });
      expect(errors.risk?.join(' ')).toMatch(/short needs the target below/i);
    });

    it('requires an invalidation level, a thesis and a marked checklist', () => {
      expect(validateTradeForm({ ...valid, invalidation: 'later' }).plan?.length).toBeGreaterThan(
        0,
      );
      expect(validateTradeForm({ ...valid, thesis: '' }).plan?.length).toBeGreaterThan(0);
      expect(validateTradeForm({ ...valid, checklist: [] }).plan?.length).toBeGreaterThan(0);
    });

    it('treats an unparseable or non-positive number as missing', () => {
      expect(positiveNumber('')).toBe(false);
      expect(positiveNumber('abc')).toBe(false);
      expect(positiveNumber('0')).toBe(false);
      expect(positiveNumber('-3')).toBe(false);
      expect(positiveNumber('1.5')).toBe(true);
      const errors = validateTradeForm({ ...valid, positionSize: '0' });
      expect(errors.risk?.join(' ')).toMatch(/position size/i);
    });

    it('leaves no checklist item pre-ticked and no psychology value out of range', () => {
      expect(EMPTY_TRADE_FORM.checklist).toEqual([]);
      expect(EMPTY_TRADE_FORM.attachments).toEqual([]);
      for (const value of [
        EMPTY_TRADE_FORM.confidence,
        EMPTY_TRADE_FORM.fear,
        EMPTY_TRADE_FORM.greed,
        EMPTY_TRADE_FORM.fomo,
        EMPTY_TRADE_FORM.hesitation,
        EMPTY_TRADE_FORM.impulsiveness,
        EMPTY_TRADE_FORM.discipline,
      ]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(10);
      }
    });
  });

  describe('the analytics timeframe', () => {
    it('offers every range on the control, custom included', () => {
      const source = readFileSync(join(journalDir, 'AnalyticsPanel.tsx'), 'utf8');
      // The control iterates the vocabulary itself. A filtered copy of it is how
      // `custom` went missing while the selector still looked complete.
      expect(source).not.toMatch(/TRADE_RANGES\.filter/);
      expect(source).toMatch(/\{TRADE_RANGES\.map\(/);
      expect(source.match(/type="date"/g) ?? []).toHaveLength(2);
    });

    it('describes a preset by its label and a custom range by its bounds', () => {
      for (const range of [
        'today',
        'this-week',
        'this-month',
        'last-30',
        'last-90',
        'custom',
      ] as const) {
        expect(describeRange(range).length, `${range} has no description`).toBeGreaterThan(0);
      }
      expect(describeRange('last-90')).toBe('Last 90 days');

      // An empty window is reported as open, not quietly read as the report date.
      expect(describeRange('custom')).toMatch(/open ended/i);

      const window = describeRange('custom', '2026-07-01', '2026-09-19');
      expect(window).toMatch(/1 Jul 2026/);
      expect(window).toMatch(/19 Sep(t)? 2026/);
      expect(window).not.toBe('Last 90 days');

      // A half-open window names the bound that is missing rather than inventing one.
      const halfOpen = describeRange('custom', '2026-07-01', '');
      expect(halfOpen).toMatch(/1 Jul 2026/);
      expect(halfOpen).toMatch(/open end/i);
    });
  });
});
