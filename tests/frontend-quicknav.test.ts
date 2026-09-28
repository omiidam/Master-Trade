/**
 * Phase 8.2.3 — quick navigation: the search, and the surface that is a view over it.
 *
 * Phase 8.2.1 stated the navigation (`NAV_MODEL`) and Phase 8.2.2 gave each entry one box and one
 * identifier. This phase adds a *second way in* to the same fourteen destinations — a palette that
 * finds one by typing at it — and the risk it carries is the risk every second way in carries: a
 * second list of where the product goes. So the two halves of this file are:
 *
 *   1. **The search**, called directly (`searchQuickNav`). It answers to the label a reader can see,
 *      to the entry's identifier (the semantic route metadata), to the sentence that says what the
 *      destination holds, and to the group it lives under — and it answers in an order that is stated
 *      rather than incidental: the best match first, then the rail's own order for equal matches.
 *   2. **The source contract**, in the style the shell's other suites use. The palette must *derive*
 *      from the one navigation model rather than restate it, must not claim a page for itself
 *      (`aria-current` stays the rail's), must route a choice through the same store action the rail
 *      uses, and must keep the keyboard story Radix supplies rather than hand-rolling a second one.
 *
 * The half only a layout engine can answer — that the palette really opens from `Ctrl`/`⌘`+`K`, that
 * the arrow keys really move the highlight, that Enter really opens the page and leaves exactly one
 * entry current, at four widths and in both directions — is measured in `tests/browser/e2e.test.ts`
 * under `quick navigation, in a browser`.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  APP_PAGE_IDS,
  NAV_MODEL,
  NAV_SECTIONS,
  findNavSection,
} from '../web/src/config/navigation.js';
import { QUICK_NAV_KEYS, quickNavShortcut, searchQuickNav } from '../web/src/app/navSearch.js';
import { setActiveLocale, translate, type UiLocale } from '../web/src/i18n/index.js';
import { useUiStore } from '../web/src/store/ui.js';

const NAV_SEARCH = 'web/src/app/navSearch.ts';
const QUICK_NAV = 'web/src/app/QuickNav.tsx';
const SIDEBAR = 'web/src/app/Sidebar.tsx';
const SHELL = 'web/src/app/AppShell.tsx';
const UI_STORE = 'web/src/store/ui.ts';

const read = (path: string): string => readFileSync(path, 'utf8');

/** A source file with its comments removed, so prose about a rule is not read as a declaration. */
function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const code = (path: string): string => strip(read(path));

/** A source file with its line breaks flattened, so a formatter wrap cannot fail an assertion. */
const flat = (source: string): string => source.replace(/\s+/g, ' ');

/** The workspace's destinations, in the order the rail draws them — from the rail's own model. */
const DRAWN_ORDER = NAV_MODEL.flatMap((group) => group.items.map((item) => item.id));

/** What a query selects, as ids. */
const found = (query: string, locale: UiLocale = 'en'): string[] =>
  searchQuickNav(query, locale).map((match) => match.section.id);

const LOCALES: readonly UiLocale[] = ['en', 'fa'];

describe('the quick-navigation search', () => {
  it('finds all fourteen destinations, once each, in the order the rail draws them', () => {
    // An empty query is the directory: opening the palette and typing nothing shows the whole
    // workspace, which is what makes the list itself a way of discovering what is here.
    const all = found('');
    expect(all).toEqual(DRAWN_ORDER);
    expect(all).toHaveLength(APP_PAGE_IDS.length);
    expect(all).toHaveLength(14);
    expect(new Set(all).size, 'a destination is offered twice').toBe(all.length);
    expect([...all].sort()).toEqual([...APP_PAGE_IDS].sort());

    // The same order in either language: the rail's order is a fact about the product, not about the
    // words, so a Persian interface offers the same list in the same sequence.
    for (const locale of LOCALES) expect(found('', locale)).toEqual(DRAWN_ORDER);

    // Portfolio and Evaluation are two destinations, and neither is folded into the other or into a
    // performance summary the navigation does not have.
    expect(all.filter((id) => id === 'portfolio' || id === 'evaluation')).toHaveLength(2);
    expect(all).not.toContain('performance');
    expect(found('performance')).toEqual([]);
  });

  it('finds a destination by the name the rail draws, in either language', () => {
    for (const locale of LOCALES) {
      for (const section of NAV_SECTIONS) {
        const label = translate(locale, section.labelKey);
        expect(found(label, locale), `${label} does not find ${section.id}`).toContain(section.id);
      }
    }

    // And the label is matched the way a reader types it, not the way the catalogue spells it: case
    // is folded on both sides, so a query shouted or half-typed still lands.
    expect(found('PORTFOLIO')).toEqual(['portfolio']);
    expect(found('  portfolio  ')).toEqual(['portfolio']);
  });

  it('finds a destination by its identifier — the semantic route metadata', () => {
    // `agent` is the case that matters: the entry is *drawn* as "AI Workspace" and its identifier is
    // `agent`, so this is a query that nothing visible contains. It is the name the product's own
    // vocabulary uses, and a reader who thinks in it should not have to translate.
    expect(translate('en', 'shell.nav.agent.label')).not.toMatch(/agent/i);
    expect(found('agent')[0]).toBe('agent');

    // Its description mentions an agent too ("What the agent may use…"), so the entry that *is* the
    // agent has to come first. That is the ranking: the identifier beats the prose.
    expect(found('agent')).toEqual(['agent', 'memory']);

    // Every identifier finds its own destination, which is what makes `data-nav-id` and this argument
    // the same vocabulary rather than two spellings of it.
    for (const section of NAV_SECTIONS) {
      expect(found(section.id)[0], `${section.id} does not find itself`).toBe(section.id);
    }
  });

  it('finds a destination by what it holds, and by where it lives', () => {
    // Nothing on screen says "cost basis" about the Portfolio entry; its description does. This is
    // the query a reader makes when they know what they want to *do*, not what it is called.
    expect(found('cost basis')).toEqual(['portfolio']);
    expect(found('rubric')).toEqual(['exams']);

    // The group headings are searchable too, so a reader can ask for a *place*: "learning" is not in
    // any entry's name or description, and it still finds the two study surfaces, in rail order.
    expect(found('learning')).toEqual(['academy', 'exams']);
    expect(found('system')).toEqual(['activity', 'usage', 'profile', 'settings']);
  });

  it('answers with the best match first, and the rail’s order between equals', () => {
    // "set" is in the Settings' *name* — which starts with it — and in the Journal's and the Lab's
    // descriptions ("setups"). A name beats a sentence, so the best answer is the *last* entry the
    // rail draws: the ladder and the display order are two different things, and this is the query
    // that would look wrong if only one of them were in play.
    expect(found('set')).toEqual(['settings', 'journal', 'lab']);

    // Two entries matched in the same field — the Journal's "risk" and the Lab's "risk math" — so the
    // tie is broken by the order the rail draws them in, which is stated in the ranking rather than
    // inherited from whatever the sort happens to be stable about.
    expect(found('risk')).toEqual(['journal', 'lab']);

    // The order is a property of the query, not of the call: asking twice asks the same question.
    expect(found('risk')).toEqual(found('risk'));
  });

  it('folds the query the way the field is spelled, joiners included', () => {
    // Persian writes many words with a zero-width non-joiner that a reader typing the same word may
    // not produce. Both sides lose theirs, so the two spellings are one query — the alternative is a
    // search that fails on a word the interface itself is showing.
    const joined = NAV_SECTIONS.filter((section) =>
      translate('fa', section.labelKey).includes('\u200c'),
    );
    expect(joined.length, 'no Persian label carries a joiner any more').toBeGreaterThan(0);
    for (const section of joined) {
      const label = translate('fa', section.labelKey);
      expect(found(label.replace(/\u200c/g, ''), 'fa'), label).toContain(section.id);
    }
  });

  it('offers nothing that is not a destination the product declares', () => {
    // The results keep the *same* section objects the rail draws — `NAV_MODEL` filters the declaration
    // rather than copying it — so a palette row cannot describe a page that is not the one the rail
    // opens, and an id that the navigation dropped cannot reappear here.
    for (const match of searchQuickNav('', 'en')) {
      expect(match.section).toBe(findNavSection(match.section.id));
      expect(match.group.items).toContain(match.section);
      expect(APP_PAGE_IDS).toContain(match.section.id);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The surface, as source                                                      */
/* -------------------------------------------------------------------------- */

describe('the palette is a view over the navigation, not a second copy of it', () => {
  it('reads the one navigation model, and restates no destination of its own', () => {
    const search = code(NAV_SEARCH);
    // The index is built from the rail's model…
    expect(search).toMatch(/from '\.\.\/config\/navigation\.js'/);
    expect(search).toMatch(/NAV_MODEL/);
    // …and the file contains no entry id at all. A second list of where the product goes is the thing
    // this suite exists to prevent; a literal here would be it.
    for (const id of APP_PAGE_IDS) {
      expect(search, `${NAV_SEARCH} names the ${id} destination itself`).not.toMatch(
        new RegExp(`'${id}'`),
      );
    }

    // The palette draws from the search, and the glyph for a destination is the rail's own map rather
    // than a second one — one icon per section, or the two surfaces teach different symbols.
    const palette = code(QUICK_NAV);
    expect(palette).toMatch(/searchQuickNav/);
    expect(palette).toMatch(/import \{ NAV_ICONS \} from '\.\/Sidebar'/);
    expect(palette).toMatch(/NAV_ICONS\[match\.section\.icon\]/);
    for (const id of APP_PAGE_IDS) {
      expect(palette, `${QUICK_NAV} names the ${id} destination itself`).not.toMatch(
        new RegExp(`'${id}'`),
      );
    }
  });

  it('opens the page the reader chose through the rail’s own action', () => {
    const palette = code(QUICK_NAV);
    // One action sets the page — the same one `NavItem` calls — so the rail cannot announce a page the
    // workspace is not showing, and the palette cannot open a page the rail does not mark.
    expect(palette).toMatch(/setPage\(match\.section\.id\)/);
    expect(palette).toMatch(/const setPage = useUiStore\(\(state\) => state\.setPage\)/);
    // And it does not claim a page for itself: `aria-current` belongs to the rail's entries, which is
    // what makes "the current entry" a single element rather than a set.
    expect(palette).not.toMatch(/aria-current/);
  });

  it('is a combobox over a listbox, and keeps the keyboard story Radix supplies', () => {
    const palette = code(QUICK_NAV);
    // The accessible shape: a field that names the list it filters and says which row is highlighted
    // without moving focus out of itself, over options that say whether they are the highlighted one.
    expect(palette).toMatch(/role="combobox"/);
    expect(palette).toMatch(/aria-controls=\{LIST_ID\}/);
    expect(palette).toMatch(
      /aria-activedescendant=\{highlighted < 0 \? undefined : optionId\(highlighted\)\}/,
    );
    expect(palette).toMatch(/role="listbox"/);
    expect(palette).toMatch(/role="option"/);
    expect(palette).toMatch(/aria-selected=\{index === highlighted\}/);
    // The rows are not a second tab route through the same fourteen answers.
    expect(palette).toMatch(/tabIndex=\{-1\}/);

    // The dialog behaviour — a portal, a scrim, focus moved in and returned, Escape, Tab cycled inside
    // — is Radix's, and this file does not hand-roll a second version of any of it: the only listener
    // here is the global shortcut.
    expect(palette).toMatch(/from '@radix-ui\/react-dialog'/);
    expect(palette).toMatch(/RadixDialog\.Portal forceMount/);
    expect([...palette.matchAll(/document\.addEventListener\('keydown'/g)]).toHaveLength(1);
    expect(palette).not.toMatch(/'Escape'/);
    expect(palette).not.toMatch(/event\.key !== 'Tab'/);

    // ...and the shared `Modal` is deliberately *not* used. Radix focuses the first tabbable thing
    // inside a dialog when it opens, which in `Modal` is its close control, and that focus pass runs
    // after mount — so a field that must own the keyboard on open is a race it loses there.
    expect(palette).not.toMatch(/from '\.\.\/components\/Modal'/);
  });

  it('opens from a global shortcut, and says which shortcut that is', () => {
    const palette = code(QUICK_NAV);
    // Both modifiers, because the same product runs on keyboards that have one or the other…
    expect(palette).toMatch(/event\.metaKey \|\| event\.ctrlKey/);
    expect(palette).toMatch(/event\.key\.toLowerCase\(\) !== 'k'/);
    // …it is claimed from the browser rather than shared with it…
    expect(palette).toMatch(/event\.preventDefault\(\)/);
    expect(palette).toMatch(/toggleQuickNav\(\)/);
    // …and it is announced as well as printed: a screen reader is told the keys, and the `<kbd>` beside
    // the field shows them to everyone else.
    expect(palette).toMatch(/aria-keyshortcuts=\{QUICK_NAV_KEYS\}/);
    expect(palette).toMatch(/quickNavShortcut\(\)/);
    expect(QUICK_NAV_KEYS).toBe('Control+K Meta+K');

    // The printed hint names the modifier the platform actually has: `⌘` on an Apple keyboard, `Ctrl`
    // everywhere else. A hint naming the wrong key is worse than no hint.
    expect(quickNavShortcut()).toMatch(/^(?:\u2318K|Ctrl\+K)$/);
    expect(code(NAV_SEARCH)).toMatch(/Mac\|iPhone\|iPad\|iPod/);
  });

  it('is not a fifteenth entry inside the navigation landmark', () => {
    const sidebar = read(SIDEBAR);
    // The trigger is drawn beside the landmark, above the list it is not part of. Inside `<nav>` it
    // would be a fifteenth entry for every suite that counts what the navigation offers — and, worse,
    // a row that looks like a destination and is not one.
    const nav = ((): string => {
      const start = sidebar.indexOf('function SidebarNav(');
      const end = sidebar.indexOf('\nfunction QuickNavTrigger(');
      expect(start, 'the sidebar no longer declares SidebarNav').toBeGreaterThan(-1);
      expect(
        end,
        'the sidebar no longer declares QuickNavTrigger after SidebarNav',
      ).toBeGreaterThan(start);
      return flat(sidebar.slice(start, end));
    })();
    expect(nav).toMatch(/<nav/);
    expect(nav).not.toMatch(/QuickNavTrigger/);

    // It is drawn once per surface — the rail and the off-canvas drawer — and above the same list.
    expect([...sidebar.matchAll(/<QuickNavTrigger\b/g)]).toHaveLength(2);
    const flatSidebar = flat(strip(sidebar));
    expect(flatSidebar).toContain(
      '<QuickNavTrigger collapsed={collapsed} railSide={railSide} /> <SidebarNav collapsed={collapsed} railSide={railSide} />',
    );
    expect(flatSidebar).toContain(
      '<QuickNavTrigger collapsed={false} railSide={railSide} /> <SidebarNav collapsed={false} railSide={railSide} id="shell-navigation" />',
    );

    // It is a real button that says it opens a dialog, and it keeps a name in both presentations: the
    // label where there is room for one, `aria-label` where there is not.
    const trigger = ((): string => {
      const start = sidebar.indexOf('function QuickNavTrigger(');
      const end = sidebar.indexOf('\n/**', start + 10);
      return flat(sidebar.slice(start, end));
    })();
    expect(trigger).toMatch(/<button/);
    expect(trigger).toMatch(/type="button"/);
    expect(trigger).toMatch(/aria-haspopup="dialog"/);
    expect(trigger).toMatch(/collapsed \? \{ 'aria-label': msg\('shell\.quickNav'\) \} : \{\}/);
    expect(trigger).toMatch(/onClick=\{\(\) => setQuickNavOpen\(true\)\}/);
    // …and the shortcut is printed on the control, because a keyboard route nobody can see is a route
    // only the person who wrote it knows.
    expect(trigger).toMatch(/\{shortcut\}/);
    expect(code(SIDEBAR)).toMatch(/quickNavShortcut\(\)/);

    // The shell mounts it once, for every page, and it is not one of the three regions.
    expect(read(SHELL)).toMatch(/<QuickNav\s*\/>/);
  });

  it('opens over the drawer rather than beside it, and closes nothing on its way out', () => {
    const store = flat(read(UI_STORE));
    // Two modal surfaces cannot both hold the keyboard, so opening the palette closes the drawer it
    // may have been opened from…
    expect(store).toContain(
      'setQuickNavOpen: (quickNavOpen) => set(quickNavOpen ? { quickNavOpen, sidebarOpen: false } : { quickNavOpen }),',
    );
    expect(store).toContain(
      'toggleQuickNav: () => set((state) => state.quickNavOpen ? { quickNavOpen: false } : { quickNavOpen: true, sidebarOpen: false }',
    );
    // …while closing it touches nothing else: a reader who dismisses the search is exactly where they
    // were, not a drawer further on.
    expect(store).toMatch(/setPage: \(page\) => set\(\{ page, sidebarOpen: false \}\)/);

    // The state is memory, like the other dialog flags and unlike the rail's preference: a product that
    // reopened on a palette someone closed would be remembering the wrong thing.
    expect(store).toMatch(/quickNavOpen: false,/);
    expect(read(UI_STORE)).not.toMatch(/quickNav.*localStorage/);

    // And it behaves as stated, not only as written.
    const page = useUiStore.getState().page;
    useUiStore.getState().setSidebarOpen(true);
    useUiStore.getState().setQuickNavOpen(true);
    expect(useUiStore.getState().quickNavOpen).toBe(true);
    expect(useUiStore.getState().sidebarOpen).toBe(false);
    useUiStore.getState().setQuickNavOpen(false);
    expect(useUiStore.getState().quickNavOpen).toBe(false);
    useUiStore.getState().toggleQuickNav();
    expect(useUiStore.getState().quickNavOpen).toBe(true);
    useUiStore.getState().toggleQuickNav();
    expect(useUiStore.getState().quickNavOpen).toBe(false);
    // Opening a destination from the palette is the rail's own action, and it closes the drawer too.
    useUiStore.getState().setPage('portfolio');
    expect(useUiStore.getState().page).toBe('portfolio');
    expect(useUiStore.getState().sidebarOpen).toBe(false);
    useUiStore.getState().setPage(page);
    setActiveLocale('en');
  });
});
