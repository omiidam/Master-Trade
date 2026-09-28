/**
 * Which page the browser's own Back and Forward have walked to — Phase 8.2.4.
 *
 * The workspace has been path-less since Phase 3.2 and that is a decision, not an omission: there is no
 * router, the URL never changes, and `web/index.html` mounts the whole product at one element. The
 * reason is written down in `tests/production-readiness.test.ts` and it is still true — a static host
 * behind a reverse proxy is never asked to resolve a path, so no deployment can 404 on a deep link
 * *because no deep link exists* to fall back to.
 *
 * What that left open is the reader's other hand. The rail, the palette and the page's own links all
 * move between the fourteen sections, and the one navigation control every browser has — Back — did not
 * move with them: pressing it after walking from Journal to Portfolio left the application entirely.
 * This module closes that without reopening the decision it sits inside.
 *
 * How both can be true at once
 * ----------------------------
 * The History API can push a *state-carrying entry onto the same address*. `pushState(state, '')` — with
 * no URL argument at all — adds a step to the session history and changes nothing about where the
 * document is: same origin, same path, same query, same fragment. The reader's Back button then walks
 * the entries this application put there, each carrying the section it was recorded from, and a
 * `popstate` listener moves the shell to it. A static host still only ever serves one path, so the
 * property that made the router unnecessary is untouched; what changes is that the app is now a
 * participant in the session history rather than a stranger to it.
 *
 * The two halves of the rule this file keeps
 * ------------------------------------------
 *   1. **It never puts a path in the URL.** Both calls pass two arguments, the second the protocol's
 *      unused title, so there is no third value that *could* be a deep link. A later phase that wants
 *      addresses would have to argue for the third argument in this file, where the rule is written.
 *   2. **It is the only file that touches the History API.** `tests/production-readiness.test.ts` scans
 *      the whole of `web/src` for a session-history reference and expects to find exactly this path,
 *      so "the router came back in a component" fails at the gate rather than at a code review.
 *
 * What the state is not
 * ---------------------
 * A history entry's state is **input from outside the application**: another script, a previous build,
 * a hand-edited session or a browser extension can put anything in it, and a traversal hands that value
 * back as-is. So it is read as `unknown` and validated against the same `APP_PAGE_IDS` the rail is drawn
 * from, and anything else is `null` — a page the reader never chose is not a page the shell will show
 * (see `docs/application-shell.md` § 11.4).
 *
 * The direction of the dependency
 * -------------------------------
 * This module reaches *into* the store; the store does not reach out to it. That is not a style choice.
 * `config/navigation.ts` reads its labels through `i18n/index.ts`, and `i18n/active.ts` reads the store
 * while it is being evaluated — so anything the store imports may not reach the navigation, or the
 * three of them are a cycle and the store's own value is undefined by the time the language layer asks
 * for it. A store that recorded its own moves (importing this file) is exactly that cycle; a history
 * that watches the store is not.
 *
 * The mirror is also the better shape for what it does: `subscribe` fires on every change of the page,
 * so a move is recorded however it was made — the rail, the palette, the top bar's stream chip, a link
 * inside a page or a phase that has not been written yet — and re-choosing where the reader already is
 * is not a change at all, so it costs no step and needs no guard of its own.
 *
 * No React and no components, like `navSearch.ts`, so the suite can call it directly.
 */

import { APP_PAGE_IDS, type AppPageId } from '../config/navigation.js';
import { useUiStore } from '../store/ui.js';

/**
 * The key a page id travels under, namespaced like the storage settings are.
 *
 * A keyed object rather than a bare string, so a state written by something else — or by a build that
 * used this slot for a different purpose — is legible in a debugger instead of being a mystery value.
 */
export const PAGE_ENTRY_KEY = 'masterTrade.page';

/**
 * The slice of the session history this module uses, and nothing more.
 *
 * Declared structurally rather than as `History` for the same reason `shellPreference` declares its
 * storage structurally: the module runs in the desktop webview, in a browser, and in a Node test
 * process where the global does not exist at all, and the shape is what makes those three the same
 * question ("is there a session history here?") rather than three code paths.
 */
export interface SessionHistory {
  pushState(data: unknown, unused: string): void;
  replaceState(data: unknown, unused: string): void;
}

/** A `popstate` event, of which this module reads exactly one field. */
export interface PageEntryEvent {
  readonly state?: unknown;
}

/** The slice of the event target a traversal listener needs. */
export interface HistoryHost {
  addEventListener(type: 'popstate', listener: (event: PageEntryEvent) => void): void;
  removeEventListener(type: 'popstate', listener: (event: PageEntryEvent) => void): void;
}

/**
 * The platform's session history, or nothing.
 *
 * Probed rather than assumed, and the probe itself is wrapped, because reading the property can throw
 * in the same environments where using it would. A missing global is a normal answer here — the Node
 * suites import this module through the store — and it means every function below is a no-op rather
 * than a crash in a process that has no history to walk.
 */
export function sessionHistory(): SessionHistory | null {
  try {
    const candidate = (globalThis as { history?: SessionHistory }).history;
    return candidate === undefined ? null : candidate;
  } catch {
    return null;
  }
}

/**
 * Record the reader's moves, and apply the browser's — the whole of the connection.
 *
 * Three things happen here and nowhere else:
 *
 *   1. The entry the document loaded on is *named* (`seedPageEntry`), so the first Back lands on a page
 *      the shell can describe rather than on an entry this build never wrote.
 *   2. Every change of the store's page is recorded as a step the reader can walk back to. `subscribe`
 *      calls back synchronously inside the store's own `set`, which is what the flag below relies on.
 *   3. A traversal is applied, and *not* recorded — the flag is raised for exactly the length of that
 *      call. Recording it would append the page the reader just left and make Back a key that never
 *      moves; applying it while the flag is up is why one action serves both directions.
 *
 * An entry this build did not write is not acted on at all: the shell stays where it is rather than
 * jumping to a page nothing asked for. `readPageEntry` has already refused it; the reader simply keeps
 * reading what they were reading.
 *
 * Returns the disconnect, so a consumer with a lifetime can end both halves — the traversal listener
 * *and* the store subscription — and nothing outlives the component that asked for it.
 */
export function connectPageHistory(host: HistoryHost | null = windowHost()): () => void {
  const setPage = (page: AppPageId): void => useUiStore.getState().setPage(page);

  seedPageEntry(useUiStore.getState().page);

  let walking = false;
  const stopListening = followPageEntries((page) => {
    if (page === null) return;
    walking = true;
    try {
      setPage(page);
    } finally {
      walking = false;
    }
  }, host);

  const stopRecording = useUiStore.subscribe((state, previous) => {
    if (walking || state.page === previous.page) return;
    recordPageEntry(state.page);
  });

  return () => {
    stopListening();
    stopRecording();
  };
}

/**
 * The page a history entry names, or `null` when it names none this build recognises.
 *
 * The `APP_PAGE_IDS` membership test is the whole of the validation and it is deliberately the *same*
 * list the rail is drawn from: a state-only identifier that is not a destination would be a target the
 * shell cannot render, which is exactly the class of thing this phase is verifying it does not have.
 */
export function readPageEntry(state: unknown): AppPageId | null {
  if (typeof state !== 'object' || state === null) return null;
  // An *own* property, because that is the only kind this build writes: the browser structured-clones
  // the state it is given, so what comes back is a plain object and never a chain with an opinion.
  if (!Object.hasOwn(state, PAGE_ENTRY_KEY)) return null;
  const candidate = (state as Record<string, unknown>)[PAGE_ENTRY_KEY];
  if (typeof candidate !== 'string') return null;
  return (APP_PAGE_IDS as readonly string[]).includes(candidate) ? (candidate as AppPageId) : null;
}

/**
 * Record a move the reader made, so the browser's Back button can undo it.
 *
 * The second argument is the protocol's *title*, which every implementation ignores; passing the empty
 * string and nothing else is what keeps the address exactly where it was. `state` is a fresh object
 * rather than the page id itself, so the entry is recognisable by shape as well as by key.
 */
export function recordPageEntry(page: AppPageId, history = sessionHistory()): void {
  history?.pushState({ [PAGE_ENTRY_KEY]: page }, '');
}

/**
 * Name the entry the document was loaded on.
 *
 * `replaceState` rather than `pushState`: this is not a move, it is the entry that already exists
 * getting a name. Without it, the first Back from the first in-app move would land on an entry this
 * build never wrote, and the shell would have nothing to show for it — it stays where it is rather than
 * guessing, which is the right answer for a foreign entry and a poor one for the page the reader started
 * on. With it, every entry the reader can reach through Back is one this application named.
 */
export function seedPageEntry(page: AppPageId, history = sessionHistory()): void {
  history?.replaceState({ [PAGE_ENTRY_KEY]: page }, '');
}

/**
 * Follow the browser's own traversal, handing back whatever the entry it lands on names.
 *
 * The listener is registered on **`window`**, which is where the specification fires `popstate` and the
 * only place it arrives: the event does not reach `document` at all, so a listener registered there
 * never runs and the traversal looks like a page that simply refuses to move. That was measured in a
 * browser rather than assumed — an earlier draft listened on the document, and the Rail kept marking a
 * page the address had already left.
 *
 * The returned function removes the listener, so the hook that calls this cannot leave one behind
 * across a remount. `null` is a real answer and not a failure: it is an entry this build did not write,
 * and the caller decides what the shell shows for it.
 */
export function followPageEntries(
  onTraversal: (page: AppPageId | null) => void,
  host: HistoryHost | null = windowHost(),
): () => void {
  if (host === null) return () => {};
  const listener = (event: PageEntryEvent): void => onTraversal(readPageEntry(event.state));
  host.addEventListener('popstate', listener);
  return () => host.removeEventListener('popstate', listener);
}

/** The window, or nothing — the event target a traversal arrives on, and the only one it arrives at. */
function windowHost(): HistoryHost | null {
  try {
    const candidate = (globalThis as { window?: HistoryHost }).window;
    return candidate === undefined ? null : candidate;
  } catch {
    return null;
  }
}
