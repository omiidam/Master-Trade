/**
 * The evaluation and capability surfaces, as the repository actually ships them.
 *
 * These guard the properties that make the UI trustworthy rather than pretty, and every one is a
 * claim the surface could make that it has no right to make:
 *
 *   1. **One navigation entry.** Evaluation's sections are internal tabs, so the sidebar never grows
 *      a sub-tree — the rule the journal, usage and portfolio surfaces already keep.
 *   2. **No arithmetic in the browser.** Neither family subtracts, averages, percentages or rounds.
 *      Every figure arrives computed by the engine, including the expected-versus-actual difference,
 *      and the components were written around that constraint rather than in spite of it.
 *   3. **No fixture stands in for an account.** There is no sample decision, no illustrative
 *      evaluation and no placeholder capability state: on these surfaces a fabricated record is
 *      indistinguishable from a real one.
 *   4. **Nothing can trade.** No order, broker or execution affordance appears anywhere in the
 *      family, and the capability catalogue declares none.
 *   5. **Responsive from the first line, not retrofitted.** Every file is checked for the properties
 *      that make desktop, tablet and mobile work: no fixed pixel widths on containers, a container
 *      for the one table so the page body never scrolls sideways, mobile-first grids that widen at a
 *      breakpoint, and visible focus states on the things a person can act on.
 *   6. **A refusal is rendered as a refusal.** The page renders the stage, the reasons and the next
 *      actions from the structured result, so a blocked capability is explained rather than silently
 *      disabled.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertNoExecutionControls } from '../packages/shared/src/frontend/viewModels.js';
import { APP_PAGE_IDS, NAV_SECTIONS } from '../web/src/config/navigation.js';

const read = (path: string): string => readFileSync(path, 'utf8');

/**
 * Every string a surface could put in front of a person: attribute values, JSX text and quoted
 * literals. Feeding all of them to the execution guard is strictly stronger than feeding the
 * control labels alone, because a label assembled from a template is still a literal here.
 */
function literalsIn(source: string): string[] {
  return [...source.matchAll(/'([^'\n]*)'|"([^"\n]*)"|>([^<>{}\n]+)</g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? '',
  );
}

const DECISION_FILES = [
  'web/src/components/decisions/EvaluationPanels.tsx',
  'web/src/components/decisions/labels.ts',
] as const;

const CAPABILITY_FILES = ['web/src/components/capabilities/CapabilityPanels.tsx'] as const;

const PAGE = 'web/src/pages/EvaluationPage.tsx';
const DECISION_STORE = 'web/src/store/decisions.ts';
const CAPABILITY_STORE = 'web/src/store/capabilities.ts';
const ALL_FILES = [...DECISION_FILES, ...CAPABILITY_FILES, PAGE, DECISION_STORE, CAPABILITY_STORE];

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

describe('the evaluation navigation entry', () => {
  it('is exactly one entry, whose sections are internal', () => {
    expect(APP_PAGE_IDS).toContain('evaluation');
    expect(APP_PAGE_IDS.filter((id) => id === 'evaluation')).toHaveLength(1);

    const section = NAV_SECTIONS.find((entry) => entry.id === 'evaluation');
    expect(section).toBeDefined();
    expect(section?.label).toBe('Evaluation');
    expect(section?.group).toBe('workspace');

    // No evaluation subsection is its own navigation entry: the tabs are internal.
    for (const id of APP_PAGE_IDS) {
      expect([
        'decisions',
        'capabilities',
        'decision',
        'registry',
        'evaluation-details',
      ]).not.toContain(id);
    }
  });

  it('describes a measurement rather than a promise', () => {
    const section = NAV_SECTIONS.find((entry) => entry.id === 'evaluation');
    const text = `${section?.label ?? ''} ${section?.description ?? ''}`.toLowerCase();
    for (const word of [
      'order',
      'execute',
      'broker',
      'buy now',
      'profit',
      'guarantee',
      'predict',
    ]) {
      expect(text).not.toContain(word);
    }
  });

  it('declares exactly two internal sections, both owned by the page', () => {
    const page = read(PAGE);
    // The tabs are declared in one place and rendered as `TabPanel`s, so a section that existed as a
    // label but had no panel would be a tab that shows nothing.
    expect(page).toContain("id: 'decisions'");
    expect(page).toContain("id: 'capabilities'");
    expect(page).toContain('<TabPanel value="decisions"');
    expect(page).toContain('<TabPanel value="capabilities"');
  });
});

/* ------------------------------------------------------------------ */
/* No arithmetic                                                       */
/* ------------------------------------------------------------------ */

describe('the surfaces compute nothing', () => {
  it('does no arithmetic on money anywhere in either family', () => {
    for (const file of ALL_FILES) {
      const source = read(file);
      expect(source, file).not.toMatch(/\.toFixed\(/);
      expect(source, file).not.toMatch(/toLocaleString\(\s*['"]en/);
      // A percentage sign in a template literal would be a figure this file produced.
      expect(source, file).not.toMatch(/returnPercent\s*[-+*/]/);
      expect(source, file).not.toMatch(/percent\s*[-+*/]\s*100/);
    }
  });

  it('shows the expected-versus-actual difference the engine reported, and never derives one', () => {
    const source = read('web/src/components/decisions/EvaluationPanels.tsx');
    // The difference is read from the contract…
    expect(source).toContain('comparison.differencePercent');
    // …and the R multiple row says the engine reports no difference rather than filling the gap.
    expect(source).toContain('reported for the return only');
    // The obvious shortcut is absent.
    expect(source).not.toMatch(/actualReturnPercent\s*-/);
    expect(source).not.toMatch(/expectedReturnPercent\s*-/);
  });

  it('renders a figure the engine could not produce as an absence with a reason', () => {
    const source = read('web/src/components/decisions/EvaluationPanels.tsx');
    expect(source).toContain('not measurable');
    expect(source).toContain('not stated');
    // Specifically not a zero in its place.
    expect(source).not.toMatch(/value\s*\?\?\s*0/);
    expect(source).not.toMatch(/value\s*:\s*0\b/);
  });

  it('holds no balance, no total and no figure in either store', () => {
    for (const file of [DECISION_STORE, CAPABILITY_STORE]) {
      const source = read(file);
      expect(source, file).not.toMatch(/\+\s*=\s*\d/);
      expect(source, file).not.toMatch(/Math\.(round|abs|min|max)/);
    }
  });
});

/* ------------------------------------------------------------------ */
/* No fixtures                                                         */
/* ------------------------------------------------------------------ */

describe('neither surface invents an account', () => {
  it('has no sample decision, evaluation or capability state', () => {
    for (const file of ALL_FILES) {
      const source = read(file);
      expect(source, file).not.toMatch(/mock[A-Z]/);
      expect(source, file).not.toMatch(/sample(Decision|Evaluation|Portfolio)/);
      // Identifier-shaped, so a legitimate `placeholder=` attribute on an input is not a fixture.
      expect(source, file).not.toMatch(/\b(SAMPLE|FIXTURE|DUMMY|ILLUSTRATIVE)_[A-Z]/i);
      // No illustrative figure anywhere: a demo number on this surface is a claim about money.
      expect(source, file).not.toMatch(/10000|1234\.56/);
    }
  });

  it('renders nothing in place of a missing session, and says why', () => {
    for (const file of [DECISION_STORE, CAPABILITY_STORE]) {
      const source = read(file);
      expect(source, file).toContain("'unavailable'");
      expect(source, file).toContain('unavailableReason');
      expect(source, file).toContain("'PROVIDER_UNAVAILABLE'");
    }
    // And the page shows the resolver's own reason rather than a plausible-looking catalogue.
    const page = read(PAGE);
    expect(page).toContain('unavailableReason');
    expect(page).toContain('stand-in');
  });

  it('keeps every refusal reason as contract text rather than a rewording', () => {
    // The labels are re-exported from the shared contract, not written here.
    const labels = read('web/src/components/decisions/labels.ts');
    expect(labels).toContain("from '@shared/decisions/model'");
    expect(labels).toContain("from '@shared/decisions/readiness'");
    // The state vocabulary too, for the same reason.
    const capabilities = read('web/src/components/capabilities/CapabilityPanels.tsx');
    expect(capabilities).toContain('CAPABILITY_STATE_LABEL');
    expect(capabilities).toContain("from '@shared/capabilities/model'");
  });
});

/* ------------------------------------------------------------------ */
/* Security                                                            */
/* ------------------------------------------------------------------ */

describe('the surfaces authorize nothing', () => {
  it('carries no execution affordance anywhere', () => {
    // The guard is proven first: a surface that did offer to trade must fail this test.
    expect(() => assertNoExecutionControls(['Place order'])).toThrow();
    expect(() => assertNoExecutionControls(['Execute now'])).toThrow();

    for (const file of ALL_FILES) {
      expect(() => assertNoExecutionControls(literalsIn(read(file))), file).not.toThrow();
    }
  });

  it('decides no capability state in the browser', () => {
    for (const file of [PAGE, ...CAPABILITY_FILES, CAPABILITY_STORE]) {
      const source = read(file);
      // The registry is not imported by the frontend at all: the catalogue reaches it through the
      // API, already resolved, and the boundary test refuses a surface entry nothing consumes.
      expect(source, file).not.toContain('@shared/capabilities/registry');
      // Nothing derives a state from an availability.
      expect(source, file).not.toMatch(/availability\s*===\s*'available'\s*\?/);
      expect(source, file).not.toMatch(/state\s*===\s*'READY'\s*\?/);
    }
  });

  it('passes the permission and entitlement answer through instead of re-deriving it', () => {
    const source = read(DECISION_STORE);
    // The store reads and evaluates; it never checks a role or a balance.
    expect(source).not.toContain('authorize(');
    expect(source).not.toContain('roleHasOperation');
    expect(source).not.toContain('resolveEntitlement');
  });

  it('renders the refusal verdict as data rather than as a disabled control', () => {
    const page = read(PAGE);
    // A refusal is badged where the button that produced it sits…
    expect(page).toContain("evaluateStatus === 'refused'");
    expect(page).toContain('Not evaluated');
    // …and the verdict itself comes from the gate, not from the page.
    expect(page).toContain('<DecisionReadinessPanel readiness={view.readiness} />');
    expect(page).toContain(
      '<EvaluationLimitationsPanel report={null} readiness={view.readiness} />',
    );

    const panels = read('web/src/components/decisions/EvaluationPanels.tsx');
    // The two layers the gate reports are both rendered, with the findings it produced.
    expect(panels).toContain('readiness.base.readiness');
    expect(panels).toContain('readiness.findings');
    expect(panels).toContain('readiness?.limitations');

    // The capability side names the authority that decided, and the tab shows the pipeline stages.
    expect(page).toContain('decision.decidedBy');
    expect(page).toContain('decision.limitations');
    expect(page).toContain('<CapabilityPipeline stages={capabilities.stages} />');
  });
});

/* ------------------------------------------------------------------ */
/* Responsive                                                          */
/* ------------------------------------------------------------------ */

describe('the surfaces are responsive from the first line', () => {
  it('uses no fixed pixel width on a container', () => {
    for (const file of ALL_FILES) {
      const source = read(file);
      // `w-[Npx]` is the shape that makes a phone scroll sideways. A `min-w-[Nrem]` inside an
      // `overflow-x-auto` table is the deliberate exception, and it is asserted separately below.
      const fixed = source.match(/className="[^"]*(?<![\w-])w-\[[0-9]+(px|rem)\][^"]*"/g) ?? [];
      expect(fixed, file).toEqual([]);
    }
  });

  it('starts every grid at one column and widens at a breakpoint', () => {
    for (const file of [PAGE, ...DECISION_FILES, ...CAPABILITY_FILES]) {
      const source = read(file);
      const grids = source.match(/grid-cols-[a-z0-9]+/g) ?? [];
      for (const grid of grids) {
        // A grid that begins at a multi-column width on a narrow screen is the classic overflow.
        if (/^grid-cols-\[/.test(grid)) continue;
        expect(source, `${file} uses ${grid}`).toMatch(/grid-cols-1\b/);
      }
      // And no grid goes wider than a pair of columns on the narrowest screen: two chips fit at
      // 320px, three do not. Anything beyond that must be behind a breakpoint.
      const unconditional = source.match(/(?<!:)grid-cols-(3|4|5|6)\b/g) ?? [];
      expect(unconditional, file).toEqual([]);
      // A two-column grid must still widen at some breakpoint, or it is a mobile-only layout.
      if (/(?<!:)grid-cols-2\b/.test(source)) {
        expect(source, `${file} keeps a two-column grid at every width`).toMatch(
          /(sm|md|lg|xl):grid-cols-/,
        );
      }
    }
  });

  it('keeps the one table inside a container that scrolls, not the page', () => {
    const source = read('web/src/components/decisions/EvaluationPanels.tsx');
    // The table is the only thing allowed a minimum width and the container is the shared table's,
    // built in Section 7.3 — so this asserts the two facts that are still this file's: it has one
    // table, it says how narrow that table may be squeezed, and it does not scroll anything itself.
    expect(source).toMatch(/<Table\b/);
    expect(source.match(/<Table\b/g) ?? []).toHaveLength(1);
    expect(source).toMatch(/minWidth=\{\d+\}/);
    expect(source, 'the panel scrolls something of its own').not.toContain('overflow-x-auto');
  });

  it('gives every interactive element a visible focus state', () => {
    const source = read('web/src/components/decisions/EvaluationPanels.tsx');
    expect(source).toContain('focus-visible:ring-2');
    expect(source).toContain('aria-current');
    // A row is a button rather than a div with a handler, so it is reachable by keyboard.
    expect(source).toContain('<button');
    expect(source).not.toMatch(/<div[^>]*onClick/);
  });

  it('exposes touch-friendly controls and labelled landmarks', () => {
    const page = read(PAGE);
    // The tab set is labelled, and the page shell is the shared responsive workspace.
    expect(page).toContain('aria-label="Evaluation sections"');
    expect(page).toContain('<Workspace');
    expect(page).toContain('<Tabs');
    // Buttons carry their own size, so a tap target is not a text run.
    expect(page).toMatch(/<Button\s+size="sm"/);
  });

  it('renders every interface state the phase requires', () => {
    const page = read(PAGE);
    for (const state of ['Skeleton', 'EmptyState', 'ErrorState']) {
      expect(page, state).toContain(`<${state}`);
    }
    // Loading, empty, error, unavailable and blocked are all reachable.
    expect(page).toContain("listStatus === 'loading'");
    expect(page).toContain("listStatus === 'unavailable'");
    expect(page).toContain("listStatus === 'error'");
    expect(page).toContain("detailStatus === 'unavailable'");
    expect(page).toContain("evaluateStatus === 'refused'");
  });
});
