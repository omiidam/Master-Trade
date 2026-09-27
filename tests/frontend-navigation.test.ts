/**
 * Phase 8.2.1 — the navigation foundation.
 *
 * The workspace's navigation is not new. Fourteen entries shipped across Phases 3–7 and this phase
 * adds, removes and renames none of them: *Dashboard*, *AI Workspace*, *Memory*, *Research*,
 * *Journal*, *Portfolio*, *Evaluation*, *Trading Lab*, *Academy*, *Exams*, *Activity*, *Usage*,
 * *Profile*, *Settings*. What it adds is the *statement* of it — one derived model
 * (`NAV_MODEL` in `web/src/config/navigation.ts`), drawn by one entry component
 * (`NavItem` in `web/src/app/Sidebar.tsx`) — and this suite holds that statement to the order the
 * product names, so the two cannot drift apart quietly.
 *
 * The distinction this file exists to make
 * ----------------------------------------
 * Three orders are in play and only two of them are the same:
 *
 *   - **declaration order** — `NAV_SECTIONS`, held to `APP_PAGE_IDS` by
 *     `tests/frontend-shell.test.ts`, which is why `lab` is declared after `exams`;
 *   - **display order** — `NAV_MODEL`, the groups above each carrying their own entries, which is
 *     what the rail and the drawer actually draw;
 *   - **group order** — `NAV_GROUPS`: workspace, learning, system.
 *
 * Every assertion below is about one of those three, read as source rather than as a render. The
 * half of the answer only a layout engine can give — the entries a real browser draws, their order
 * at four widths in both directions, and whether the keyboard can reach and activate them — is
 * measured in `tests/browser/e2e.test.ts` under `the navigation foundation`.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_PAGE_IDS, NAV_GROUPS, NAV_MODEL, NAV_SECTIONS } from '../web/src/config/navigation.js';
import { translate, type UiLocale } from '../web/src/i18n/index.js';
import { useUiStore } from '../web/src/store/ui.js';

const NAVIGATION = 'web/src/config/navigation.ts';
const SIDEBAR = 'web/src/app/Sidebar.tsx';
const LOCALES: readonly UiLocale[] = ['en', 'fa'];

const read = (path: string): string => readFileSync(path, 'utf8');

/** A source file with its line breaks flattened, so a formatter wrap cannot fail an assertion. */
const flat = (source: string): string => source.replace(/\s+/g, ' ');

/**
 * The workspace's navigation, in the order the product names it.
 *
 * Written out rather than derived, and deliberately: a list computed from the model would agree with
 * the model by construction and prove nothing. This is the phase brief's own order, so a heading
 * that moved, an entry that was dropped, or a pair that was merged all fail here.
 */
const DECLARED_ORDER = [
  'dashboard',
  'agent',
  'memory',
  'research',
  'journal',
  'portfolio',
  'evaluation',
  'lab',
  'academy',
  'exams',
  'activity',
  'usage',
  'profile',
  'settings',
] as const;

/** Every entry the model draws, in the order it draws them. */
const drawn = (): string[] => NAV_MODEL.flatMap((group) => group.items.map((item) => item.id));

/** The entry component's own source, from its declaration to the next one. */
const entrySource = (): string => {
  const sidebar = read(SIDEBAR);
  const start = sidebar.indexOf('function NavItem(');
  const end = sidebar.indexOf('function NavGroup(');
  expect(start, 'the sidebar no longer declares a navigation entry').toBeGreaterThan(-1);
  expect(end, 'the sidebar no longer declares a navigation group').toBeGreaterThan(start);
  return sidebar.slice(start, end);
};

describe('the navigation the workspace declares', () => {
  it('draws the fourteen entries the product names, in the order it names them', () => {
    expect(drawn()).toEqual([...DECLARED_ORDER]);
    // `lab` is the one entry whose declaration and display positions differ — it is declared after
    // `exams` because `NAV_SECTIONS` is held to product-page order, and drawn under the workspace
    // heading it belongs to. Both orders are stated here, so the difference stays a decision rather
    // than a surprise.
    expect(NAV_SECTIONS.map((section) => section.id).indexOf('lab')).toBeGreaterThan(
      drawn().indexOf('lab'),
    );

    // Each entry is drawn exactly once. Two controls claiming one page are two controls claiming to
    // be `aria-current`; an id the grouping dropped is a page reachable only through an address the
    // workspace does not have.
    expect(drawn()).toHaveLength(DECLARED_ORDER.length);
    expect(new Set(drawn()).size).toBe(DECLARED_ORDER.length);
    expect([...drawn()].sort()).toEqual([...APP_PAGE_IDS].sort());

    // Portfolio and Evaluation are separate entries, and neither is folded into the other or into a
    // performance summary the navigation does not have.
    expect(drawn().filter((id) => id === 'portfolio' || id === 'evaluation')).toHaveLength(2);
    expect(drawn()).not.toContain('performance');
  });

  it('keeps the three product groups, each under a heading that exists in both languages', () => {
    expect(NAV_MODEL.map((group) => group.id)).toEqual(NAV_GROUPS.map((group) => group.id));
    expect(NAV_MODEL.map((group) => group.id)).toEqual(['workspace', 'learning', 'system']);

    for (const group of NAV_MODEL) {
      // A heading over nothing draws a rule through the middle of the rail with no entries under
      // it, which is what a group that lost its last entry would look like.
      expect(group.items.length, `${group.id} declares no entries`).toBeGreaterThan(0);
      for (const locale of LOCALES) {
        expect(
          translate(locale, group.labelKey).trim().length,
          `${group.id} has no heading in ${locale}`,
        ).toBeGreaterThan(0);
      }
      // Each entry is drawn by the group it says it belongs to, so membership is read from the one
      // declaration that states it.
      for (const item of group.items) expect(item.group).toBe(group.id);
    }
  });

  it('is a view over the declarations rather than a second copy of them', () => {
    const source = flat(read(NAVIGATION));
    // The model filters the two declarations and keeps the same objects. A re-declared entry inside
    // the model would be a copy that can drift — a label changed in one place and not the other.
    for (const group of NAV_MODEL) {
      for (const item of group.items) expect([...NAV_SECTIONS]).toContain(item);
    }
    expect(source).toContain(
      'export const NAV_MODEL: readonly NavGroupModel[] = NAV_GROUPS.map((group) => ({',
    );
    expect(source).toContain(
      'items: NAV_SECTIONS.filter((section) => section.group === group.id),',
    );
    // Membership is declared once per entry, as `group`, and nowhere else.
    expect(source.match(/group: '[a-z]+'/g) ?? []).toHaveLength(NAV_SECTIONS.length);

    // And the file stays dependency-free data — no React, no components — because the backend
    // suites (`frontend-shell`, `frontend-prototype`) import it and run without a renderer.
    expect(source).not.toMatch(/from 'react'|from '\.\.\/components|from 'lucide-react'/);
  });
});

describe('the sidebar draws that model, and only it', () => {
  it('draws one entry from one component, in both surfaces', () => {
    const sidebar = flat(read(SIDEBAR));
    // One entry component...
    expect([...sidebar.matchAll(/function NavItem\(/g)]).toHaveLength(1);
    // ...drawn once per item by one group component...
    expect([...sidebar.matchAll(/function NavGroup\(/g)]).toHaveLength(1);
    expect(sidebar).toMatch(/group\.items\.map\(\(section\) => \( <NavItem key=\{section\.id\}/);
    // ...over the model, rather than filtering the section list for itself: which entry sits under
    // which heading, and in what order, is the configuration's answer.
    expect(sidebar).toMatch(/NAV_MODEL\.map\(\(group\) => \( <NavGroup key=\{group\.id\}/);
    expect(sidebar).not.toMatch(/NAV_SECTIONS\.filter/);
    expect(sidebar).not.toMatch(/NAV_GROUPS\.map/);

    // The rail and the off-canvas drawer are the same navigation at two widths, so they are two
    // call sites of one component — and the drawer's is the one the top bar's trigger points at.
    expect([...sidebar.matchAll(/<SidebarNav\b/g)]).toHaveLength(2);
    expect(sidebar).toContain('<SidebarNav collapsed={collapsed} railSide={railSide} />');
    expect(sidebar).toContain(
      '<SidebarNav collapsed={false} railSide={railSide} id="shell-navigation" />',
    );
  });

  it('draws each entry as a control a keyboard can reach and activate', () => {
    const entry = flat(entrySource());
    // A button, not a link: there is no router and no address for a page, so a link would promise a
    // URL, a new tab and a middle-click target that do not exist.
    expect(entry).toMatch(/<button/);
    expect(entry).toContain('type="button"');
    expect(entry).not.toMatch(/<a\b/);
    expect(entry).toContain('onClick={() => setPage(section.id)}');
    // Every entry is reachable by Tab — no roving tabindex, and no `-1` on a control that is the
    // only way to read the navigation.
    expect(entry).not.toMatch(/tabIndex/);
    // The ring is not removed on the entry itself. The one place this file does remove it is the
    // drawer *panel*, whose line says so — a dialog surface holds no action to point a ring at,
    // which `frontend-integration.test.ts` acknowledges.
    expect(entry).not.toMatch(/outline-(none|hidden)/);
    const ringless = read(SIDEBAR)
      .split('\n')
      .filter((line) => /outline-(none|hidden)/.test(line));
    expect(ringless).toHaveLength(1);
    expect(ringless[0]).toContain('focus:outline-none');
  });

  it('marks the entry for the page the store is showing, and no other', () => {
    const entry = flat(entrySource());
    // The active entry is derived from the one field the workspace also reads, so the rail cannot
    // announce a page the workspace is not showing...
    expect(entry).toContain('const page = useUiStore((state) => state.page)');
    expect(entry).toContain('const active = page === section.id;');
    expect(entry).toContain("aria-current={active ? 'page' : undefined}");
    // ...and it is derived rather than handed in, so there is no second answer to "which entry is
    // current" for a caller to get wrong.
    expect(entry).not.toMatch(/active\?:/);
    expect(entry).not.toMatch(/active: boolean/);

    const before = useUiStore.getState().page;
    for (const id of APP_PAGE_IDS) {
      useUiStore.getState().setPage(id);
      expect(useUiStore.getState().page).toBe(id);
      // Exactly one drawn entry answers to that page, which is what makes "the current entry" a
      // single element rather than a set.
      expect(drawn().filter((entryId) => entryId === useUiStore.getState().page)).toHaveLength(1);
    }
    useUiStore.getState().setPage(before);
  });
});
