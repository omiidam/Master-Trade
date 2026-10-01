/**
 * Phase 8.1.3 — the shell's state and context.
 *
 * Phase 7.1.1 stated *what* the shell is and Phase 8.1.2 stated *what it does* at each width. This
 * phase is about what the shell **remembers**, which is a different kind of question: not "does the
 * navigation exist on a phone" but "is it still the same navigation after a walk around the product".
 *
 * Three answers are held here, and each is held in the place the answer lives:
 *
 *   - the **page context** — a page is unmounted when its reader looks elsewhere, so anything it wants
 *     to still be there has to live above it (`web/src/store/pageContext.ts`);
 *   - the **rail's preference** — a standing choice, so it survives a reload
 *     (`web/src/app/shellPreference.ts`);
 *   - the **shell's own status** — one report, so two screens cannot describe the same process two
 *     ways (`web/src/desktop/shellReport.ts` and `useShellStatus.ts`).
 *
 * The rest is source contract, in the style the shell's other suites use: it reads the files and
 * asserts the shape that keeps the three above true, because the half only a browser can answer (does
 * the reader actually land back on their tab) is measured in `tests/browser/e2e.test.ts`.
 */

import { readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runtimeStateOf, type ProcessState } from '../packages/shared/src/desktop/process.js';
import { desktopStartupState } from '../packages/shared/src/desktop/startup.js';
import type { ShellStatus } from '../packages/shared/src/desktop/ipc.js';
import { APP_PAGE_IDS } from '../web/src/config/navigation.js';
import {
  DENSITY_KEY,
  SIDEBAR_COLLAPSED_KEY,
  readDensity,
  readSidebarCollapsed,
  writeDensity,
  writeSidebarCollapsed,
  type ShellStorage,
} from '../web/src/app/shellPreference.js';
import { useUiStore } from '../web/src/store/ui.js';
import { VIEW_SLOTS, usePageContextStore, viewKey } from '../web/src/store/pageContext.js';
import { shellStatusState } from '../web/src/desktop/useShellStatus.js';
import { initialShellReport, type ShellReport } from '../web/src/desktop/shellReport.js';

const read = (path: string): string => readFileSync(path, 'utf8');

/**
 * A source file with its line breaks flattened.
 *
 * Several of the calls asserted below are wrapped by the formatter, and a test that pinned the wrap
 * would fail the next time a name grew by a character. What is being asserted is which page and slot a
 * value was filed under, not how the call was laid out.
 */
const flat = (source: string): string => source.replace(/\s+/g, ' ');

const PAGE_CONTEXT = 'web/src/store/pageContext.ts';
const SHELL_PREFERENCE = 'web/src/app/shellPreference.ts';
const UI_STORE = 'web/src/store/ui.ts';
const SHELL_REPORT = 'web/src/desktop/shellReport.ts';
const SHELL_HOOK = 'web/src/desktop/useShellStatus.ts';
const SIDEBAR = 'web/src/app/Sidebar.tsx';
const CONNECTION_STATUS = 'web/src/components/realtime/ConnectionStatus.tsx';
const REALTIME_CLIENT = 'web/src/realtime/client.ts';

const page = (name: string): string => join('web', 'src', 'pages', `${name}.tsx`);

/** A storage that works, so the read and write paths can be driven without a browser. */
function fakeStorage(initial: Record<string, string> = {}): ShellStorage & {
  readonly entries: Record<string, string>;
} {
  const entries = { ...initial };
  return {
    entries,
    getItem: (key) => entries[key] ?? null,
    setItem: (key, value) => {
      entries[key] = value;
    },
  };
}

/** A storage that refuses, which is a real state: a hardened profile, a disabled origin, a quota. */
function hostileStorage(): ShellStorage {
  const refuse = (): never => {
    throw new Error('storage is not available in this origin');
  };
  return { getItem: refuse, setItem: refuse };
}

/* -------------------------------------------------------------------------- */
/* The page's context survives the page                                        */
/* -------------------------------------------------------------------------- */

describe('page context', () => {
  it('files a kept value under the page and the slot it was kept for', () => {
    expect(viewKey('journal', 'filters')).toBe('journal.filters');
    expect(viewKey('journal', 'tab')).not.toBe(viewKey('journal', 'filters'));
    expect(viewKey('journal', 'tab')).not.toBe(viewKey('memory', 'tab'));
  });

  it('gives the slots names rather than free strings', () => {
    // A closed set is what makes "filters" unrunnable to write as "filter": the typo is a type error
    // rather than a second, empty copy of the reader's state that looks like the store is broken.
    expect(VIEW_SLOTS).toContain('tab');
    expect(VIEW_SLOTS.length).toBe(new Set(VIEW_SLOTS).size);
  });

  it('keeps each page’s values apart, and changes only the slot it was given', () => {
    const { setView } = usePageContextStore.getState();
    setView('journal', 'tab', 'analytics');
    setView('journal', 'filters', { status: 'closed' });
    setView('memory', 'tab', 'graph');

    const views = usePageContextStore.getState().views;
    expect(views[viewKey('journal', 'tab')]).toBe('analytics');
    expect(views[viewKey('journal', 'filters')]).toEqual({ status: 'closed' });
    expect(views[viewKey('memory', 'tab')]).toBe('graph');
    // Writing one page's tab left the other page's tab exactly where it was.
    expect(views[viewKey('memory', 'query')]).toBeUndefined();
  });

  it('holds only choices: nothing derived from a fetch or another store', () => {
    const source = read(PAGE_CONTEXT);
    // The store's own imports, which are the whole answer to "what can it depend on".
    const imports = [...source.matchAll(/^import[^;]+from '([^']+)';$/gm)].map((match) => match[1]);
    expect(new Set(imports)).toEqual(new Set(['react', 'zustand', '../config/navigation.js']));
    // And it is a store, not a component: the values are read, never computed from data.
    expect(source).not.toMatch(/\bfetch\(/);
  });

  it('gives every page that renders a tab strip its own tab', () => {
    // The page id is the navigation id, and a copy-paste that kept the previous page's id would look
    // exactly like working code: the value would be remembered, under somebody else's name.
    const owners: readonly (readonly [string, string])[] = [
      ['AcademyPage', 'academy'],
      ['ActivityPage', 'activity'],
      ['EvaluationPage', 'evaluation'],
      ['ExamsPage', 'exams'],
      ['JournalPage', 'journal'],
      ['MemoryPage', 'memory'],
      ['PortfolioPage', 'portfolio'],
      ['ProfilePage', 'profile'],
      ['ResearchPage', 'research'],
      ['SettingsPage', 'settings'],
      ['TradingLabPage', 'lab'],
      ['UsagePage', 'usage'],
    ];

    for (const [file, id] of owners) {
      const source = flat(read(page(file)));
      expect(source, `${file} does not keep its tab`).toMatch(
        new RegExp(`usePageView<[^>]*>\\('${id}', 'tab',`),
      );
      // The id is a real navigation id, so a renamed page cannot leave an orphan behind.
      expect(APP_PAGE_IDS as readonly string[]).toContain(id);
    }
  });

  it('keeps the working state of the pages that build one up, not only their tab', () => {
    const journal = flat(read(page('JournalPage')));
    for (const slot of ['filters', 'range', 'from', 'to', 'calendar']) {
      expect(journal, `the journal does not keep ${slot}`).toContain(`'journal', '${slot}'`);
    }

    const memory = flat(read(page('MemoryPage')));
    for (const slot of ['query', 'statusFilter', 'sourceFilter']) {
      expect(memory, `the memory page does not keep ${slot}`).toContain(`'memory', '${slot}'`);
    }

    expect(flat(read(page('ResearchPage')))).toContain("'research', 'selection'");
    // The agent workspace's half-written message is context too: losing typed text is the complaint
    // this phase exists to answer.
    expect(flat(read(page('AgentWorkspacePage')))).toContain("'agent', 'draft'");
  });
});

/* -------------------------------------------------------------------------- */
/* The rail remembers what the reader chose                                    */
/* -------------------------------------------------------------------------- */

describe('the rail’s saved preference', () => {
  it('starts open, and opens again for anything it cannot understand', () => {
    expect(readSidebarCollapsed(fakeStorage())).toBe(false);
    expect(readSidebarCollapsed(fakeStorage({ [SIDEBAR_COLLAPSED_KEY]: 'collapsed' }))).toBe(false);
    expect(readSidebarCollapsed(fakeStorage({ [SIDEBAR_COLLAPSED_KEY]: '' }))).toBe(false);
  });

  it('round-trips the reader’s choice, which is what survives a reload', () => {
    const storage = fakeStorage();
    expect(writeSidebarCollapsed(true, storage)).toBe(true);
    expect(storage.entries[SIDEBAR_COLLAPSED_KEY]).toBe('true');
    expect(readSidebarCollapsed(storage)).toBe(true);

    // Flipping back is a written choice too, not an erased one: the reader could tell us either way.
    expect(writeSidebarCollapsed(false, storage)).toBe(true);
    expect(readSidebarCollapsed(storage)).toBe(false);
  });

  it('degrades to the default when storage refuses, and never throws', () => {
    const hostile = hostileStorage();
    expect(readSidebarCollapsed(hostile)).toBe(false);
    expect(writeSidebarCollapsed(true, hostile)).toBe(false);
    // The answer *is* the contract: a caller can tell a remembered choice from a shown one.
    expect(writeSidebarCollapsed(true, null)).toBe(false);
    expect(readSidebarCollapsed(null)).toBe(false);
  });

  it('is the store’s starting value, and is written as the control flips it', () => {
    const store = read(UI_STORE);
    expect(store).toMatch(/sidebarCollapsed: storedSidebarCollapsed/);
    expect(store).toMatch(/const storedSidebarCollapsed = readSidebarCollapsed\(\)/);
    expect(store).toMatch(/writeSidebarCollapsed\(collapsed\)/);
    // One module owns the key, and it is the one that names it.
    expect(read(SHELL_PREFERENCE)).toContain(`'master-trade.shell.sidebarCollapsed'`);
    // And it owns its probe: the language layer may not be reached from outside its own boundary, so
    // the shell asks the platform the same question itself rather than importing that layer's answer.
    expect(read(SHELL_PREFERENCE)).toMatch(
      /export function shellStorage\(\): ShellStorage \| null/,
    );
    expect(read(SHELL_PREFERENCE)).not.toMatch(/from '\.\.\/language\//);
  });

  it('flips the rail’s state through the store the shell actually reads', () => {
    const before = useUiStore.getState().sidebarCollapsed;
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarCollapsed).toBe(!before);
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarCollapsed).toBe(before);
  });
});

/* -------------------------------------------------------------------------- */
/* How much air the workspace gives each row (Phase 8.3.3)                     */
/* -------------------------------------------------------------------------- */

/**
 * The shell's second standing preference, held to the first one's rules.
 *
 * The defect this phase fixed was not a missing mechanism. `shellPreference.ts`, its probe, its key
 * and its rules all existed — for the rail. The density control sat two cards down on the same Settings
 * screen, changed the workspace's vertical rhythm, and was the one setting in the product that undid
 * itself on the next launch, because nothing said the two preferences were the same kind of thing. The
 * cases below hold the density to the rail's rules, and the last one says out loud that a standing
 * choice has to be added in both halves.
 */
describe('the workspace’s saved density', () => {
  it('starts comfortable, and comes back comfortable for anything it cannot understand', () => {
    expect(readDensity(fakeStorage())).toBe('comfortable');
    expect(readDensity(fakeStorage({ [DENSITY_KEY]: 'tight' }))).toBe('comfortable');
    expect(readDensity(fakeStorage({ [DENSITY_KEY]: '' }))).toBe('comfortable');
  });

  it('round-trips the reader’s choice, which is what survives a reload', () => {
    const storage = fakeStorage();
    expect(writeDensity('compact', storage)).toBe(true);
    expect(storage.entries[DENSITY_KEY]).toBe('compact');
    expect(readDensity(storage)).toBe('compact');

    // Choosing the roomy one again is a written choice too, not an erased one: the reader could tell
    // us either way, and "nobody has chosen" is a different fact from "they chose comfortable".
    expect(writeDensity('comfortable', storage)).toBe(true);
    expect(readDensity(storage)).toBe('comfortable');
  });

  it('degrades to the default when storage refuses, and never throws', () => {
    const hostile = hostileStorage();
    expect(readDensity(hostile)).toBe('comfortable');
    expect(writeDensity('compact', hostile)).toBe(false);
    expect(writeDensity('compact', null)).toBe(false);
    expect(readDensity(null)).toBe('comfortable');
  });

  it('is the store’s starting value, and is written as the control chooses it', () => {
    const store = flat(read(UI_STORE));
    expect(store).toMatch(/const storedDensity = readDensity\(\)/);
    expect(store).toMatch(/density: storedDensity/);
    expect(store).toMatch(/writeDensity\(density\)/);

    // The vocabulary has one home. The store re-exports the preference module's union rather than
    // declaring a second one: two literal unions are two validations, and they disagree the first time
    // one of them gains a value.
    expect(store).toMatch(/type ShellDensity[^}]*\} from '\.\.\/app\/shellPreference\.js'/);
    expect(store).toMatch(/export type Density = ShellDensity/);
    expect(read(SHELL_PREFERENCE)).toContain(`'master-trade.shell.density'`);
  });

  it('is changed through the store the workspace actually reads', () => {
    const before = useUiStore.getState().density;
    useUiStore.getState().setDensity('compact');
    expect(useUiStore.getState().density).toBe('compact');
    useUiStore.getState().setDensity(before);
    expect(useUiStore.getState().density).toBe(before);
  });

  it('is one of the shell’s standing choices, and both of them are remembered', () => {
    // The rail's state and the workspace's density are the same kind of thing — a choice rather than a
    // position — so each needs the same pair, and this is where the next one is forced to have it.
    const preference = read(SHELL_PREFERENCE);
    for (const [reader, writer, key] of [
      ['readSidebarCollapsed', 'writeSidebarCollapsed', SIDEBAR_COLLAPSED_KEY],
      ['readDensity', 'writeDensity', DENSITY_KEY],
    ] as const) {
      expect(preference, `${reader} is not exported`).toMatch(
        new RegExp(`export function ${reader}\\(`),
      );
      expect(preference, `${writer} is not exported`).toMatch(
        new RegExp(`export function ${writer}\\(`),
      );
      expect(preference, `${key} is not named by the module that owns it`).toContain(`'${key}'`);
    }
    // And neither of them is remembered anywhere else: one module owns both keys, and the store only
    // ever asks it.
    expect(flat(read(UI_STORE))).not.toMatch(/localStorage/);
  });
});

/* -------------------------------------------------------------------------- */
/* The active navigation entry is the page, not a copy of it                   */
/* -------------------------------------------------------------------------- */

describe('the active navigation state', () => {
  it('is derived from the store’s page, so the rail cannot disagree with the workspace', () => {
    const sidebar = read(SIDEBAR);
    expect(sidebar).toMatch(/const page = useUiStore\(\(state\) => state\.page\)/);
    expect(sidebar).toMatch(/const active = page === section\.id;/);
    expect(sidebar).toMatch(/aria-current=\{active \? 'page' : undefined\}/);
  });

  it('closes the drawer when a destination is chosen, so the page is reachable', () => {
    // The one place the store changes two things at once, and the reason it may: a drawer that stayed
    // open would cover the page it had just navigated to.
    expect(read(UI_STORE)).toMatch(/setPage: \(page\) => set\(\{ page, sidebarOpen: false \}\)/);
  });
});

/* -------------------------------------------------------------------------- */
/* The shell reports itself once                                               */
/* -------------------------------------------------------------------------- */

/** A shell report, as the bridge would deliver it. */
function statusReport(runtime: ProcessState): ShellReport {
  const status: ShellStatus = {
    protocolVersion: 1,
    platform: 'linux',
    appVersion: '0.6.0',
    apiBaseUrl: 'http://127.0.0.1:4317',
    runtime: {
      state: runtime,
      pid: 4317,
      health: 'healthy',
      uptimeMs: 1_000,
      restartCount: 0,
      lastError: null,
    },
    capabilities: [],
    unavailable: [],
  };
  return { loading: false, inShell: true, status, error: null, runtime: 'desktop-tauri' };
}

describe('the shell’s own status', () => {
  it('says "loading" until an answer arrives, rather than defaulting to fine', () => {
    const state = shellStatusState(initialShellReport(), false);
    expect(state.loading).toBe(true);
    expect(state.status).toBeNull();
    expect(state.error).toBeNull();
  });

  it('turns a refused call into ERROR, never into STARTING', () => {
    // The rule this phase inherited and must not lose: leaving a spinner up because the answer never
    // arrived is a silent failure, so the error branch overrides the derived state.
    const state = shellStatusState(
      { ...initialShellReport(), loading: false, error: 'the shell did not answer' },
      false,
    );
    expect(state.loading).toBe(false);
    expect(state.error).toBe('the shell did not answer');
    expect(state.startup.state).toBe('ERROR');
    expect(state.startup.reason).toBe('the shell did not answer');
  });

  it('passes the shell’s own report through, in the words the UI reads', () => {
    // Every process state, not a sample of them: `runtimeStateOf` is total, and a state added to the
    // supervisor without a meaning here would be the one a status chip rendered as nothing.
    const processes: readonly ProcessState[] = [
      'idle',
      'starting',
      'health-checking',
      'ready',
      'stopping',
      'stopped',
      'crashed',
      'restarting',
      'error',
    ];
    for (const process of processes) {
      const report = statusReport(process);
      const state = shellStatusState(report, false);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.status).toBe(report.status);
      expect(state.processState).toBe(process);
      expect(state.runtimeState).toBe(runtimeStateOf(process));
      expect(state.startup.state).toBe(
        desktopStartupState({ runtime: report.runtime, status: report.status, stopping: false })
          .state,
      );
    }
  });

  it('takes where it is running from the shared report, not from its own probe', () => {
    const inBrowser: ShellReport = { ...initialShellReport(), inShell: false };
    expect(shellStatusState(inBrowser, false).inShell).toBe(false);
    expect(shellStatusState(statusReport('ready'), false).inShell).toBe(true);
  });

  it('is asked in exactly one place, with everyone else subscribing to the answer', () => {
    // Two screens asking separately is two answers: the topbar and Settings each held their own
    // snapshot on their own cadence, so for up to a poll interval the same process could be *loading*
    // in one place and *ready* in another.
    const report = read(SHELL_REPORT);
    expect(report).toMatch(/from '\.\/bridge\.js'/);
    expect(report).toMatch(/await shellStatus\(\)/);
    expect(report).toMatch(/export function subscribeToShellStatus/);
    // The hook derives; it does not fetch.
    const hook = read(SHELL_HOOK);
    expect(hook).toMatch(/useSyncExternalStore\(subscribeToShellStatus, shellStatusReport\)/);
    expect(hook).not.toMatch(/\bshellStatus\(\)/);
    expect(hook).not.toMatch(/from '\.\/bridge'/);
  });

  it('does not start a timer just by being imported', () => {
    // A module that polls from import time would keep a background process answering questions after
    // the interface is gone — and would keep a test process alive.
    const report = read(SHELL_REPORT);
    expect(report).toMatch(/if \(listeners\.size === 1\) void poll\(\)/);
    expect(report).toMatch(/if \(listeners\.size === 0 && timer !== undefined\)/);
    // Nothing at the module's own level starts work: the only calls are inside a subscription.
    expect(report).not.toMatch(/^void poll\(\)/m);
    expect(report).not.toMatch(/^timer = setTimeout/m);
  });
});

/* -------------------------------------------------------------------------- */
/* Every connection state has words, and the two files cannot drift             */
/* -------------------------------------------------------------------------- */

describe('the connection vocabulary', () => {
  const union =
    /export type ConnectionState =\s*([\s\S]*?);/.exec(read(REALTIME_CLIENT))?.[1] ?? '';
  const states = [...union.matchAll(/'([a-z-]+)'/g)].map((match) => match[1]);
  const block =
    /export const CONNECTION_PRESENTATION[^{]*\{([\s\S]*?)\n\};/.exec(
      read(CONNECTION_STATUS),
    )?.[1] ?? '';

  it('reads the states and the presentation from the two real files', () => {
    // A regex that silently matched nothing would make every case below vacuous.
    expect(states.length).toBeGreaterThanOrEqual(6);
    expect(block.length).toBeGreaterThan(200);
  });

  it('names the four the shell has to show, and gives each one its own entry', () => {
    for (const state of ['connecting', 'online', 'reconnecting', 'offline']) {
      expect(states, `${state} is not a connection state`).toContain(state);
      expect(block, `${state} has no presentation`).toMatch(new RegExp(`\\b${state}:\\s*\\{`));
    }
  });

  it('leaves no state without words, including the one before the first attempt', () => {
    for (const state of [...states, 'initialising']) {
      expect(block, `${state} has no presentation`).toMatch(new RegExp(`\\b${state}:\\s*\\{`));
    }
  });
});
