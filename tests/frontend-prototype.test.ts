import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_PAGE_IDS, NAV_SECTIONS, previewNotice } from '../web/src/config/navigation.js';
import { DURATION, EASE, FADE_UP, STAGGER } from '../web/src/design/motion.js';
import { assertNoExecutionControls } from '../packages/shared/src/frontend/viewModels.js';

const web = join(process.cwd(), 'web');

function source(relative: string): string {
  return readFileSync(join(web, 'src', relative), 'utf8');
}

/** The pages the preview prototype is delivered as. */
const PRODUCT_PAGES = [
  'DashboardPage',
  'AgentWorkspacePage',
  'AcademyPage',
  'TradingLabPage',
  'MemoryPage',
  'ExamsPage',
  'ResearchPage',
  'JournalPage',
  'SettingsPage',
  'ActivityPage',
] as const;

/**
 * Prototype invariants.
 *
 * A prototype's job is to be *reviewable*: real navigation, and no state left
 * undesigned. These assertions pin the parts that are easy to lose in a later edit —
 * a page that stops handling failure, a nav entry with no page behind it, an
 * animation that ignores `prefers-reduced-motion`.
 */
describe('preview prototype', () => {
  it('wires every navigation entry to a page the app actually renders', () => {
    const app = source('App.tsx');
    for (const section of NAV_SECTIONS) {
      expect(app, `App.tsx does not render ${section.id}`).toContain(`case '${section.id}':`);
    }
    // And every declared page id is a navigation section, in the same order.
    expect(APP_PAGE_IDS).toEqual(NAV_SECTIONS.map((section) => section.id));
    for (const page of PRODUCT_PAGES) {
      expect(existsSync(join(web, 'src', 'pages', `${page}.tsx`)), `${page} is missing`).toBe(true);
    }
  });

  it('renders a loading, an empty and an error surface somewhere in the product', () => {
    /**
     * The three states are required per *surface*, not per page: a summary card and a
     * list have different obligations. What is checked here is that each state is
     * genuinely reachable in the delivered pages — a prototype that only draws the
     * happy path teaches nothing about the interface.
     */
    const pages = PRODUCT_PAGES.map((page) => source(`pages/${page}.tsx`));
    const joined = pages.join('\n');
    expect(joined).toContain('Skeleton');
    expect(joined).toContain('EmptyState');
    expect(joined).toContain('ErrorState');

    const states = source('components/InterfaceStates.tsx');
    for (const state of ['loading', 'empty', 'error']) {
      expect(states).toContain(`'${state}'`);
    }
    // The exhibit uses the real components rather than describing them.
    expect(states).toContain('SkeletonCard');
    expect(states).toMatch(/import \{ EmptyState \}/);
    expect(states).toMatch(/import \{ ErrorState \}/);

    // Pages that had no failure surface before the prototype phase now have one.
    for (const page of [
      'AcademyPage',
      'TradingLabPage',
      'AgentWorkspacePage',
      'SettingsPage',
      'JournalPage',
    ]) {
      expect(source(`pages/${page}.tsx`), `${page} lost its state coverage`).toContain(
        'InterfaceStatesPanel',
      );
    }
  });

  it('animates with shared presets and honours prefers-reduced-motion', () => {
    // Presets are data, so a component cannot invent its own timing vocabulary.
    expect(Object.keys(DURATION)).toEqual(['fast', 'base', 'slow']);
    expect(EASE.standard).toHaveLength(4);
    expect(FADE_UP.initial).toMatchObject({ opacity: 0 });
    const stagger = STAGGER(3);
    expect(stagger.delay).toBeGreaterThan(0);
    // The stagger is capped, so a long list does not animate for a second and a half.
    expect(STAGGER(100).delay).toBeLessThanOrEqual(0.24);

    const reveal = source('components/Reveal.tsx');
    expect(reveal).toContain('useReducedMotion');
    // Reduced motion removes the movement rather than shortening it.
    expect(reveal).toMatch(/if \(reduceMotion\) return <div/);

    const shell = source('app/AppShell.tsx');
    expect(shell).toContain('AnimatePresence');
    expect(shell).toContain('useReducedMotion');
  });

  it('keeps the preview labelled and free of any execution affordance', () => {
    expect(previewNotice()).toMatch(/preview/i);
    const topbar = source('app/Topbar.tsx');
    expect(topbar).toContain('previewNotice');

    // Every page's user-visible strings still pass the execution-control guard.
    for (const page of PRODUCT_PAGES) {
      const text = source(`pages/${page}.tsx`);
      for (const match of text.matchAll(/title="([^"]{3,120})"/g)) {
        const title = match[1];
        if (title === undefined) continue;
        expect(() => assertNoExecutionControls([title])).not.toThrow();
      }
    }
    expect(() => assertNoExecutionControls(['Place order'])).toThrow();
  });

  it('shows its data as clearly labelled mock data, and says which surface is live', () => {
    const mock = source('mock/realtime.ts');
    expect(mock).toContain('realtime.activityPreviewNotice');
    expect(mock).toContain('realtime.previewNotice');
    expect(mock).toContain('realtime.jobPreviewNotice');
    // A fixture can never be a trading outcome: the backtest fixture carries no result.
    expect(mock).not.toMatch(/win rate\s*[:=]\s*\d/i);

    const activity = source('pages/ActivityPage.tsx');
    // Every fixture panel is labelled with the same code the error surfaces use.
    expect(activity).toContain('PREVIEW_FIXTURE');
    // The stream panel states whether it is live, and fixtures are only used when it is not.
    expect(activity).toContain('live={live}');
    expect(activity).toMatch(/live \? feed : mockActivity/);
  });

  it('leaves the frontend ready for a backend connection, without holding a secret', () => {
    // A typed client over the real API contracts, and a session resolver that reports
    // unavailability instead of inventing an endpoint or a credential.
    const api = source('api/client.ts');
    // The boundary is a declared name, not a path depth (Phase 4.2, ADR-0035).
    expect(api).toContain("from '@shared/api/contracts'");
    expect(api).toContain('ApiError');
    expect(api).not.toMatch(/localStorage|sessionStorage|document\.cookie/);

    const session = source('realtime/session.ts');
    expect(session).toContain("reason: 'not-in-shell'");
    // The resolver builds no socket and derives no credential: it either reports a
    // session it was handed or reports why there is none.
    expect(session).not.toContain('new WebSocket');
    expect(session).not.toMatch(/Math\.random\(/);

    const store = source('realtime/store.ts');
    expect(store).toContain('resolveRealtimeSession');
    expect(store).not.toMatch(/mockJobs|mockActivity/);
  });
});
