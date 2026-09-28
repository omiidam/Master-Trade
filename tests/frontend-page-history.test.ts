/**
 * Phase 8.2.4 — the session history, and the shell's half of it.
 *
 * The workspace is path-less by decision (no router, one mount element, no address the host has to
 * resolve), and the reader still expects the browser's own Back button to undo a move between the
 * fourteen sections. The resolution is `pushState(state, '')`: a step in the session history with no
 * URL argument, so the address never moves and no deep link comes into existence.
 *
 * What this file holds, in three parts:
 *
 *   1. **The model, called directly.** The functions take their session history and their event target
 *      as arguments, so the suite drives a fake of each and asserts what a browser would have received —
 *      two arguments, the second the protocol's unused title, and a state that names a page and nothing
 *      else.
 *   2. **The traversal contract.** A history entry's state is input from outside the application, so
 *      everything unrecognised must come back `null` rather than becoming a page the shell shows. The
 *      list it is validated against is `APP_PAGE_IDS` — the same list the rail is drawn from.
 *   3. **The connection, behaviourally.** `connectPageHistory` is a plain function, so with a fake
 *      session history and a fake window installed the whole mechanism is observable: a move records an
 *      entry, standing still records nothing, and a traversal moves the page *without* recording — which
 *      is the one that would make Back a key that never moves.
 *
 * The half only a layout engine can answer — that Back really returns to the previous section with the
 * rail marking exactly that entry, at desktop and on a phone, in both directions — is measured in
 * `tests/browser/e2e.test.ts` under `the session history, in a browser`.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { APP_PAGE_IDS } from '../web/src/config/navigation.js';
import {
  PAGE_ENTRY_KEY,
  connectPageHistory,
  followPageEntries,
  readPageEntry,
  recordPageEntry,
  seedPageEntry,
  sessionHistory,
  type PageEntryEvent,
  type SessionHistory,
} from '../web/src/app/pageHistory.js';
import { useUiStore } from '../web/src/store/ui.js';

const PAGE_HISTORY = 'web/src/app/pageHistory.ts';
const PAGE_HISTORY_HOOK = 'web/src/app/usePageHistory.ts';
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

function uiSources(): string[] {
  const walk = (directory: string): string[] => {
    const found: string[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) found.push(...walk(path));
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) found.push(path);
    }
    return found;
  };
  return walk(join('web', 'src')).map((path) => path.split(sep).join('/'));
}

/** One call a fake session history received, recorded rather than performed. */
interface Call {
  readonly method: 'pushState' | 'replaceState';
  readonly args: readonly unknown[];
}

/**
 * A session history that records instead of navigating.
 *
 * The point of the injection is that the suite can say what a browser was *told*: which method, with how
 * many arguments, and with what state. A real one could only be asked what happened afterwards, which
 * is a different question and a weaker one — and in this process there is no real one at all.
 */
function fakeHistory(): { history: SessionHistory; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    history: {
      pushState: (...args: unknown[]) => calls.push({ method: 'pushState', args }),
      replaceState: (...args: unknown[]) => calls.push({ method: 'replaceState', args }),
    } as unknown as SessionHistory,
  };
}

interface FakeWindow {
  host: { addEventListener: unknown; removeEventListener: unknown };
  fire(state: unknown): void;
  listeners(): number;
}

/** An event target that records its listeners instead of storing them. */
function fakeWindow(): FakeWindow {
  const registered = new Set<(event: PageEntryEvent) => void>();
  return {
    host: {
      addEventListener: (_type: string, listener: (event: PageEntryEvent) => void) => {
        registered.add(listener);
      },
      removeEventListener: (_type: string, listener: (event: PageEntryEvent) => void) => {
        registered.delete(listener);
      },
    },
    fire: (state: unknown) => {
      for (const listener of registered) listener({ state });
    },
    listeners: () => registered.size,
  };
}

/** What the pages a session history was told about, in order. */
const pagesSent = (calls: readonly Call[]): unknown[] =>
  calls.map((call) => (call.args[0] as Record<string, unknown>)[PAGE_ENTRY_KEY]);

/* -------------------------------------------------------------------------- */
/* The model, called directly                                                  */
/* -------------------------------------------------------------------------- */

describe('a page entry, read back', () => {
  it('reads every one of the fourteen destinations the rail is drawn from', () => {
    for (const page of APP_PAGE_IDS) {
      expect(readPageEntry({ [PAGE_ENTRY_KEY]: page }), page).toBe(page);
    }
    // The list is the rail's own, not a copy kept for this purpose: a destination added to the
    // navigation is one the history can name, with nothing here to update.
    expect(APP_PAGE_IDS).toHaveLength(14);
  });

  it('refuses anything that is not a page this build can show', () => {
    const refused: readonly unknown[] = [
      undefined,
      null,
      '',
      'portfolio',
      ['portfolio'],
      { [PAGE_ENTRY_KEY]: 7 },
      { [PAGE_ENTRY_KEY]: null },
      { [PAGE_ENTRY_KEY]: {} },
      { [PAGE_ENTRY_KEY]: 'portfolio ' },
      // A section this product deliberately does not have: a state written by something else must not
      // become a page, and an id that is not a destination has nothing to render.
      { [PAGE_ENTRY_KEY]: 'performance' },
      { [PAGE_ENTRY_KEY]: 'PORTFOLIO' },
      // The right value under the wrong key is not this build's state.
      { section: 'portfolio' },
    ];
    for (const state of refused) {
      expect(readPageEntry(state), JSON.stringify(state) ?? 'undefined').toBeNull();
    }
  });

  it('reads an own property, not one it inherited', () => {
    // The state this build writes is a plain object, and the browser structured-clones it on the way in
    // and out — so a value found on a prototype is not this build's state, whatever it says. Asserted
    // because the read is what decides whether the shell can be sent to a page by something else.
    expect(readPageEntry(Object.create({ [PAGE_ENTRY_KEY]: 'portfolio' }))).toBeNull();

    // The shape a browser can actually hand back — a plain object with the key on itself — is the one
    // that reads, which is what keeps the rule above from refusing the application's own state.
    expect(readPageEntry({ [PAGE_ENTRY_KEY]: 'portfolio' })).toBe('portfolio');
  });
});

describe('recording a page entry', () => {
  it('pushes a move and replaces the entry the document loaded on', () => {
    const { history, calls } = fakeHistory();
    recordPageEntry('journal', history);
    seedPageEntry('dashboard', history);

    // Two different verbs, and the difference is the whole of the boot story: a move is a step the
    // reader can undo, and naming the entry already under the document is not a step at all.
    expect(calls.map((call) => call.method)).toEqual(['pushState', 'replaceState']);
    expect(pagesSent(calls)).toEqual(['journal', 'dashboard']);
  });

  it('passes the state and the unused title, and nothing that could be an address', () => {
    const { history, calls } = fakeHistory();
    recordPageEntry('evaluation', history);
    seedPageEntry('lab', history);

    for (const call of calls) {
      // Exactly two arguments: the protocol's title slot is required syntactically, and an absent URL
      // is what keeps the document where it is. A third value here would be a deep link.
      expect(call.args).toHaveLength(2);
      expect(call.args[1]).toBe('');
      expect(call.args[0]).toEqual({ [PAGE_ENTRY_KEY]: expect.any(String) });
      // A state that names a page and nothing else, so a later phase cannot smuggle a second meaning
      // through the same slot without this line changing.
      expect(Object.keys(call.args[0] as object)).toEqual([PAGE_ENTRY_KEY]);
    }
  });

  it('is a no-op in a process that has no session history', () => {
    // The Node suites import this module through the store, so this path is not hypothetical.
    expect(sessionHistory()).toBeNull();
    expect(() => recordPageEntry('journal')).not.toThrow();
    expect(() => seedPageEntry('dashboard')).not.toThrow();
    const stop = followPageEntries(() => {
      throw new Error('a traversal arrived with no window to hear it');
    });
    expect(() => stop()).not.toThrow();
  });

  it('treats a session history that throws on being read as absent', () => {
    const host = globalThis as { history?: unknown };
    const saved = Object.getOwnPropertyDescriptor(host, 'history');
    Object.defineProperty(host, 'history', {
      configurable: true,
      get() {
        throw new Error('the profile refuses the history');
      },
    });
    try {
      expect(sessionHistory()).toBeNull();
    } finally {
      if (saved) Object.defineProperty(host, 'history', saved);
      else delete host.history;
    }
  });
});

describe('following the browser’s traversal', () => {
  it('hands back the page the entry names, and nothing for an entry it did not write', () => {
    const { host, fire } = fakeWindow();
    const seen: (string | null)[] = [];
    const stop = followPageEntries((page) => seen.push(page), host as never);

    fire({ [PAGE_ENTRY_KEY]: 'journal' });
    fire({ [PAGE_ENTRY_KEY]: 'portfolio' });
    // An entry from before this build, or from something else entirely: `null` is the answer, and the
    // shell decides what to show for it rather than being handed a page out of a foreign state.
    fire(undefined);
    fire({ [PAGE_ENTRY_KEY]: 'performance' });
    fire({ [PAGE_ENTRY_KEY]: 'settings' });

    expect(seen).toEqual(['journal', 'portfolio', null, null, 'settings']);
    stop();
  });

  it('unsubscribes with the same listener it registered', () => {
    const { host, fire, listeners } = fakeWindow();
    const seen: (string | null)[] = [];
    const stop = followPageEntries((page) => seen.push(page), host as never);
    expect(listeners()).toBe(1);

    stop();
    // A removal that passes a *different* function is how a listener survives a remount: the count is
    // what proves the same identity went in and came out.
    expect(listeners()).toBe(0);
    fire({ [PAGE_ENTRY_KEY]: 'usage' });
    expect(seen).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* The connection, behaviourally                                               */
/* -------------------------------------------------------------------------- */

describe('the connection watches the store, and the browser', () => {
  const host = globalThis as { history?: SessionHistory };

  beforeEach(() => {
    // `page` is memory, so a file that walks around the product leaves the store where it stopped.
    useUiStore.getState().setPage('dashboard');
  });

  afterEach(() => {
    delete host.history;
    useUiStore.getState().setPage('dashboard');
  });

  /** Connect against a fake session history and a fake window, and hand back the teardown. */
  function connect(): { calls: Call[]; window: FakeWindow; disconnect: () => void } {
    const { history, calls } = fakeHistory();
    host.history = history;
    const window = fakeWindow();
    const disconnect = connectPageHistory(window.host as never);
    return { calls, window, disconnect };
  }

  it('names the entry the document loaded on without spending a step on it', () => {
    const { calls, disconnect } = connect();
    try {
      expect(calls.map((call) => call.method)).toEqual(['replaceState']);
      expect(pagesSent(calls)).toEqual(['dashboard']);
    } finally {
      disconnect();
    }
  });

  it('records a move once, and does not record standing still', () => {
    const { calls, disconnect } = connect();
    try {
      useUiStore.getState().setPage('journal');
      expect(useUiStore.getState().page).toBe('journal');
      expect(pagesSent(calls)).toEqual(['dashboard', 'journal']);

      // The rail's current entry is a button like any other, so this press really happens. Recorded, it
      // would be a step that appears to do nothing when the reader walks to it — and undoing one move
      // would take two presses. The store does not change, so nothing is recorded and no guard is
      // needed to make that true.
      useUiStore.getState().setPage('journal');
      expect(pagesSent(calls)).toEqual(['dashboard', 'journal']);

      useUiStore.getState().setPage('memory');
      expect(pagesSent(calls)).toEqual(['dashboard', 'journal', 'memory']);
    } finally {
      disconnect();
    }
  });

  it('applies a traversal without recording it', () => {
    const { calls, window, disconnect } = connect();
    try {
      useUiStore.getState().setPage('journal');

      // This is Back arriving. If it recorded, every traversal would append the page the reader just
      // left and the next Back would return to it — the key would never move.
      window.fire({ [PAGE_ENTRY_KEY]: 'academy' });
      expect(useUiStore.getState().page).toBe('academy');
      expect(pagesSent(calls)).toEqual(['dashboard', 'journal']);
    } finally {
      disconnect();
    }
  });

  it('leaves the shell exactly where it is for an entry it did not write', () => {
    const { calls, window, disconnect } = connect();
    try {
      useUiStore.getState().setPage('usage');
      const before = pagesSent(calls);

      // An entry from another build, another script or another session. The shell does not jump to a
      // page nothing asked for, and it does not add a step of its own: it stays where the reader is.
      window.fire(undefined);
      window.fire({ [PAGE_ENTRY_KEY]: 'performance' });
      expect(useUiStore.getState().page).toBe('usage');
      expect(pagesSent(calls)).toEqual(before);
    } finally {
      disconnect();
    }
  });

  it('closes the drawer when a traversal moves the page, because it covers the page', () => {
    const { window, disconnect } = connect();
    try {
      useUiStore.getState().setSidebarOpen(true);
      window.fire({ [PAGE_ENTRY_KEY]: 'profile' });
      expect(useUiStore.getState().page).toBe('profile');
      expect(useUiStore.getState().sidebarOpen).toBe(false);
    } finally {
      disconnect();
    }
  });

  it('stops both halves when it is disconnected', () => {
    const { calls, window, disconnect } = connect();
    disconnect();

    // The subscription is gone: a later move is nobody's to record.
    const recorded = pagesSent(calls).length;
    useUiStore.getState().setPage('settings');
    expect(pagesSent(calls)).toHaveLength(recorded);

    // And so is the listener: nothing outlives the component that asked for the connection.
    expect(window.listeners()).toBe(0);
    window.fire({ [PAGE_ENTRY_KEY]: 'academy' });
    expect(useUiStore.getState().page).toBe('settings');
  });
});

/* -------------------------------------------------------------------------- */
/* The source contracts                                                        */
/* -------------------------------------------------------------------------- */

describe('the one file that touches the session history', () => {
  it('is the only file in the interface that does', () => {
    const touch = /history\.(pushState|replaceState)|addEventListener\(\s*'popstate'/;
    const touchers = uiSources().filter((path) => touch.test(read(path)));
    expect(touchers).toEqual([PAGE_HISTORY]);
  });

  it('never reads an address, and never passes one', () => {
    const home = read(PAGE_HISTORY);
    // The rule the static host depends on, stated from both sides: no address is read here…
    expect(home).not.toMatch(/location\.(href|pathname|search|hash)/);
    // …and none is passed. A third argument is the only way a `pushState` could create a deep link.
    expect(home).toMatch(/pushState\(\s*\{[^)]*\},\s*''\s*\)/);
    expect(home).toMatch(/replaceState\(\s*\{[^)]*\},\s*''\s*\)/);
    // And no router has appeared beside it.
    expect(home).not.toMatch(/Router|useNavigate|<Route/);
  });

  it('validates against the navigation’s own list rather than a second one', () => {
    const home = code(PAGE_HISTORY);
    expect(home).toMatch(/APP_PAGE_IDS/);
    // No destination ids written out here: the entries come from the declaration, so a section that is
    // renamed or added is nameable by the history with nothing to update in this file.
    for (const page of APP_PAGE_IDS) {
      expect(home, `${page} is restated in the history model`).not.toMatch(
        new RegExp(`['"\`]${page}['"\`]`),
      );
    }
  });

  it('reaches into the store, and the store does not reach back', () => {
    // The direction is not a style choice: `config/navigation.ts` reads its labels through `i18n`, and
    // `i18n/active.ts` reads the store while it is evaluating — so a store that imported this file,
    // which imports the navigation, would leave the store's own value undefined at the moment the
    // language layer asks for it. The `language-detection` suite imports the store first and is what
    // catches it.
    const store = code(UI_STORE);
    expect(store).not.toMatch(/pageHistory|recordPageEntry|sessionHistory/);
    // One action, so there is no second way to change the page that a later phase could record
    // differently — or forget to record at all. This is the whole of how the page moves.
    expect(store.match(/setPage: \(page\) =>/g)).toHaveLength(1);
    expect(store).not.toMatch(/syncPage/);

    const home = code(PAGE_HISTORY);
    expect(home).toMatch(/import \{ useUiStore \} from '\.\.\/store\/ui\.js'/);
    // The recorder is a *subscription*, so it sees the page change however the change was made, and
    // sees nothing when nothing changed.
    expect(home).toMatch(/useUiStore\.subscribe\(/);
    expect(home).toMatch(/state\.page === previous\.page/);
  });

  it('is wired once, from the shell, and tears itself down', () => {
    expect(code(SHELL).match(/usePageHistory\(\)/g)).toHaveLength(1);

    const hook = flat(code(PAGE_HISTORY_HOOK));
    expect(hook).toMatch(/useEffect\(\(\) => connectPageHistory\(\), \[\]\)/);
    // The teardown is the effect's return value, so the listener and the subscription cannot outlive
    // the shell that made them.
    expect(hook).toMatch(/return connectPageHistory|=> connectPageHistory/);
  });
});
