import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_PAGE_IDS,
  NAV_GROUPS,
  NAV_SECTIONS,
  PREVIEW_NOTICE,
  findNavSection,
} from '../web/src/config/navigation.js';
import {
  ALL_TOKEN_VARIABLES,
  REQUIRED_TOKEN_GROUPS,
  THEME,
  TOKEN_GROUPS,
} from '../web/src/design/tokens.js';
import { assertNoExecutionControls } from '../packages/shared/src/frontend/viewModels.js';

const root = process.cwd();
const web = join(root, 'web');

function uiFiles(extension: string): string[] {
  return readdirSync(join(web, 'src'), { recursive: true })
    .map((entry) => String(entry).split(sep).join('/'))
    .filter((entry) => entry.endsWith(extension))
    .map((entry) => entry);
}

/**
 * Accessible names that belong to an *interactive* control. Read-only value
 * labels (e.g. the "Broker execution: disabled" readout) are deliberately not
 * included: describing a capability the system disables is not an affordance.
 */
function controlNames(source: string): string[] {
  const names: string[] = [];
  const tagPattern = /<(Button|IconButton|button|a)\b([^>]*)>/g;
  let tag: RegExpExecArray | null;
  while ((tag = tagPattern.exec(source)) !== null) {
    const attributes = tag[2] ?? '';
    const attributePattern = /(?:aria-label|label)=["']([^"']+)["']/g;
    let attribute: RegExpExecArray | null;
    while ((attribute = attributePattern.exec(attributes)) !== null) {
      const value = attribute[1];
      if (value !== undefined) names.push(value);
    }
  }
  return names;
}

/**
 * Frontend shell invariants.
 *
 * These guard the properties that make the UI trustworthy rather than pretty:
 * no execution affordance can be labelled, the design tokens a component uses
 * actually exist, the component library is complete, and the preview says what
 * it is.
 */
describe('frontend shell', () => {
  it('exposes exactly the required workspace pages', () => {
    expect(NAV_SECTIONS.map((section) => section.id)).toEqual([...APP_PAGE_IDS]);
    expect(APP_PAGE_IDS).toEqual([
      'dashboard',
      'agent',
      'memory',
      'research',
      'academy',
      'exams',
      'lab',
      'activity',
      'settings',
    ]);
    for (const section of NAV_SECTIONS) {
      expect(section.label.length).toBeGreaterThan(0);
      expect(section.description.length).toBeGreaterThan(0);
      expect(NAV_GROUPS.map((group) => group.id)).toContain(section.group);
    }
    expect(findNavSection('dashboard').label).toBe('Dashboard');
    expect(() => findNavSection('nope' as never)).toThrow(/Unknown navigation section/);
  });

  it('never labels a navigation item or control with an execution affordance', () => {
    for (const section of NAV_SECTIONS) {
      expect(() => assertNoExecutionControls([section.label, section.description])).not.toThrow();
    }
    // Deliberate probe: the guard must actually catch execution vocabulary.
    expect(() => assertNoExecutionControls(['Place order'])).toThrow();

    const offenders: string[] = [];
    for (const file of uiFiles('.tsx')) {
      for (const name of controlNames(readFileSync(join(web, 'src', file), 'utf8'))) {
        try {
          assertNoExecutionControls([name]);
        } catch {
          offenders.push(`${file}: ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('declares every design token the UI is allowed to reference', () => {
    expect(TOKEN_GROUPS.map((group) => group.group)).toEqual([...REQUIRED_TOKEN_GROUPS]);
    expect(THEME.mode).toBe('dark');

    const css = readFileSync(join(web, 'src', 'styles', 'global.css'), 'utf8');
    const missing = ALL_TOKEN_VARIABLES.filter((variable) => !css.includes(variable));
    expect(missing).toEqual([]);
  });

  it('ships the ten reusable primitives through one import surface', () => {
    const required = [
      'Button',
      'Card',
      'Badge',
      'Modal',
      'Input',
      'Tooltip',
      'Tabs',
      'Skeleton',
      'EmptyState',
      'ErrorState',
    ];
    const barrel = readFileSync(join(web, 'src', 'components', 'index.ts'), 'utf8');
    for (const component of required) {
      expect(barrel, `${component} is missing from the component barrel`).toMatch(
        new RegExp(`\\b${component}\\b`),
      );
    }
    for (const file of [
      'components/Button.tsx',
      'components/Card.tsx',
      'components/Badge.tsx',
      'components/Modal.tsx',
      'components/Input.tsx',
      'components/Tooltip.tsx',
      'components/Tabs.tsx',
      'components/Skeleton.tsx',
      'components/EmptyState.tsx',
      'components/ErrorState.tsx',
    ]) {
      expect(existsSync(join(web, 'src', file)), `${file} is missing`).toBe(true);
    }
  });

  it('says plainly that it is a preview and not connected', () => {
    expect(PREVIEW_NOTICE).toMatch(/preview/i);
    expect(PREVIEW_NOTICE).toMatch(/mock data/i);
    const app = readFileSync(join(web, 'src', 'pages', 'AgentWorkspacePage.tsx'), 'utf8');
    expect(app).toMatch(/not connected|no model provider/i);
  });
});
