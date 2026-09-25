/**
 * The portfolio surface, as the repository actually ships it.
 *
 * These guard the properties that make the UI trustworthy rather than pretty, and each one is
 * about a claim the surface could make that it has no right to make:
 *
 *   1. **One navigation entry.** The portfolio's sections are internal tabs, so the sidebar
 *      never grows a sub-tree — the rule the journal and usage surfaces already keep.
 *   2. **No figure is computed in the browser.** The store has no arithmetic: every number it
 *      holds arrived from the server, because a share or a total derived in the client would be
 *      a second opinion about money.
 *   3. **No fixture stands in for an account.** There is no sample holding, no illustrative
 *      portfolio and no placeholder value anywhere in the family: on this surface a fabricated
 *      number is indistinguishable from a real one.
 *   4. **No execution affordance.** Nothing in the surface can place an order, size a position
 *      or reach a broker — the invariant the whole product keeps.
 *   5. **A gap is rendered, not smoothed.** The components that report missing data exist and
 *      are wired, so a `null` figure reaches the screen as an absence rather than as a zero.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertNoExecutionControls } from '../packages/shared/src/frontend/viewModels.js';
import { APP_PAGE_IDS, NAV_SECTIONS } from '../web/src/config/navigation.js';
import { translate } from '../web/src/i18n/index.js';
import { copyIn, copyOf } from './helpers/source-copy.js';

const read = (path: string): string => readFileSync(path, 'utf8');

const COMPONENT_FILES = [
  'web/src/components/portfolio/PortfolioOverview.tsx',
  'web/src/components/portfolio/PortfolioValueCard.tsx',
  'web/src/components/portfolio/HoldingsTable.tsx',
  'web/src/components/portfolio/HoldingsEditor.tsx',
  'web/src/components/portfolio/AssetAllocationChart.tsx',
  'web/src/components/portfolio/ConcentrationRiskCard.tsx',
  'web/src/components/portfolio/PortfolioInsightCard.tsx',
  'web/src/components/portfolio/PortfolioPanels.tsx',
] as const;

describe('the portfolio navigation entry', () => {
  it('is exactly one entry, whose sections are internal', () => {
    expect(APP_PAGE_IDS).toContain('portfolio');
    expect(APP_PAGE_IDS.filter((id) => id === 'portfolio')).toHaveLength(1);

    const section = NAV_SECTIONS.find((entry) => entry.id === 'portfolio');
    expect(section).toBeDefined();
    expect(section && translate('en', section.labelKey)).toBe('Portfolio');
    expect(section?.group).toBe('workspace');

    // No portfolio subsection is its own navigation entry.
    for (const id of APP_PAGE_IDS) {
      expect(['holdings', 'allocation', 'valuation', 'decisions']).not.toContain(id);
    }
  });

  it('describes a measurement rather than a promise', () => {
    const section = NAV_SECTIONS.find((entry) => entry.id === 'portfolio');
    const text = section
      ? `${translate('en', section.labelKey)} ${translate('en', section.descriptionKey)}`.toLowerCase()
      : '';
    // No execution vocabulary anywhere in the navigation, and no claim about returns.
    for (const word of ['order', 'execute', 'broker', 'buy now', 'profit', 'guarantee']) {
      expect(text).not.toContain(word);
    }
    expect(text).toContain('gap');
  });
});

describe('the portfolio components', () => {
  it('exist and are exported through one family barrel', () => {
    const barrel = read('web/src/components/portfolio/index.ts');
    for (const name of [
      'PortfolioOverview',
      'PortfolioValueCard',
      'HoldingsTable',
      'HoldingsEditor',
      'AssetAllocationChart',
      'ConcentrationRiskCard',
      'PortfolioInsightCard',
      'PortfolioQualitySummary',
      'PortfolioReadinessPanel',
      'MissingHoldingData',
      'PortfolioSnapshotTimeline',
      'RiskExposurePanel',
    ]) {
      expect(barrel).toContain(name);
    }

    // And the library barrel re-exports the family, so a page imports from one place.
    const library = read('web/src/components/index.ts');
    expect(library).toContain("from './portfolio'");
  });

  it('compute nothing: no component multiplies, divides or sums a position', () => {
    for (const path of COMPONENT_FILES) {
      const source = read(path);
      // Arithmetic about value is the engine's job and arrives already done. Prose may say
      // "quantity × price"; the check is for code that performs it.
      expect(source, `${path} must not value a position`).not.toMatch(
        /\.quantity\s*\*|\*\s*\w+\.price\b|\.marketValue\s*[*/]|\/\s*\w+\.(total|marketValue)\b/,
      );
      expect(source, `${path} must not sum anything`).not.toMatch(/\.reduce\(/);
      // And no share is derived from a total in the browser.
      expect(source, `${path} must not derive a share`).not.toMatch(
        /\/\s*(total|marketValue|pricedTotal)\s*\)?\s*\*\s*100/,
      );
    }
  });

  it('holds no sample security and no synthetic account', () => {
    for (const path of [...COMPONENT_FILES, 'web/src/store/portfolio.ts']) {
      const source = read(path);
      // A surface about somebody's money must not be able to render a portfolio nobody owns.
      // The check is for a synthetic *source*, not for the words: a comment that names the
      // practice ("a fixture would be a claim about the user") is the opposite of the fault.
      expect(source, `${path} must not name a security`).not.toMatch(
        /['"]\s*(VOO|VTI|AAPL|MSFT|SPY|BTCUSD)\s*['"]/,
      );
      expect(source, `${path} must not hold sample data`).not.toMatch(
        /const\s+(mock|sample|demo|fake|seed)[A-Za-z]*\s*[:=]/i,
      );
    }
  });

  it("passes the project's own execution-control guard on every string it shows", () => {
    const visible: string[] = [];
    for (const path of [...COMPONENT_FILES, 'web/src/pages/PortfolioPage.tsx']) {
      const source = read(path);
      // Every string the user can read, resolved from the keys the file names.
      visible.push(...copyIn(source));
    }
    expect(visible.length).toBeGreaterThan(10);
    expect(() => assertNoExecutionControls(visible)).not.toThrow();
    // The guard is real: it still refuses the thing it exists to refuse.
    expect(() => assertNoExecutionControls(['Place order'])).toThrow();
  });

  it('renders an absent figure as absent, never as zero', () => {
    const value = read('web/src/components/portfolio/PortfolioValueCard.tsx');
    // The formatter is the single place `null` becomes text, and it becomes an em dash.
    expect(value).toContain('formatMoney');
    const labels = read('web/src/components/portfolio/labels.ts');
    expect(labels).toMatch(/if \(value === null\) return '—'/);
    // And the card says out loud why a zero would have been a false claim.
    expect(copyOf(value)).toContain('A zero here would have been a factual claim');
  });

  it('reports the engine verdict rather than re-deriving a threshold', () => {
    const concentration = read('web/src/components/portfolio/ConcentrationRiskCard.tsx');
    // The band is the engine's own; the card must not compare a share against a copied number.
    expect(concentration).not.toMatch(/top1Percent\s*>=\s*\d/);
    expect(concentration).toContain('insight.severity');
  });
});

describe('the portfolio store', () => {
  it('adds, subtracts and estimates nothing', () => {
    const source = read('web/src/store/portfolio.ts');
    // No arithmetic over a balance or a value: the client owns no figure.
    expect(source).not.toMatch(/credits\s*[-+]=|balance\s*[-+]=|total\s*[-+]=/);
    // Declaring is a write; reading is a read. No other route is called.
    expect(source).toContain('savePortfolio');
    expect(source).toContain('getPortfolio');
  });

  it('keeps the undeclared state apart from an empty portfolio', () => {
    const source = read('web/src/store/portfolio.ts');
    expect(source).toContain('declared');
    // The reason there is nothing to show is the resolver's, never an invented one.
    expect(source).toContain('unavailableReason');
  });
});

describe('the portfolio page', () => {
  it('is wired into the shell and reads the real API', () => {
    expect(read('web/src/App.tsx')).toContain('<PortfolioPage />');
    const page = read('web/src/pages/PortfolioPage.tsx');
    expect(page).toContain('usePortfolioStore');
    // The gate's verdict is shown alongside the document's own reading, not merged into it.
    expect(page).toContain('AnalysisReadinessPanel');
    expect(page).toContain('PortfolioReadinessPanel');
  });

  it('does not import the engine or the server directly', () => {
    const page = read('web/src/pages/PortfolioPage.tsx');
    // The thresholds and every figure arrive as data; the engine is server-side code and the
    // web app must not reach into the repository for it.
    expect(page).not.toContain('trading-engine');
    expect(page).not.toMatch(/from '\.\.\/\.\.\/\.\.\/packages\//);
    expect(page).not.toContain('../src/');
  });
});
