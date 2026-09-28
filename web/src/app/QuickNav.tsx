import * as RadixDialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { IconButton } from '../components/Button';
import { Input } from '../components/Input';
import { DURATION, EASE, PANEL_IN } from '../design/motion';
import { msg, useUiLocale } from '../i18n/index.js';
import { cn } from '../lib/cn';
import { useUiStore } from '../store/ui';
import { NAV_ICONS } from './Sidebar';
import { QUICK_NAV_KEYS, quickNavShortcut, searchQuickNav, type QuickNavMatch } from './navSearch';

/**
 * Quick navigation — the palette over the fourteen workspace sections (Phase 8.2.3).
 *
 * The rail is the primary navigation and stays that: a list, always there, read in order. This is the
 * *other* way in — for a reader who already knows the name of what they want, and would rather type
 * three letters of it than read eleven entries to be sure the twelfth is not the one. It changes
 * nothing about the rail: choosing a result calls the same `setPage` the rail's own entries call, so
 * which page is open and which entry says it is current remain one answer from one field.
 *
 * Why it is built on Radix Dialog rather than on the shared `Modal`
 * --------------------------------------------------------------
 * `Modal` is a *form* surface: a title bar, a body and a footer, and Radix focuses the first tabbable
 * thing inside it, which there is the close control. A command palette's whole keyboard story is that
 * the field has the keyboard the instant it opens, and Radix's focus pass runs after mount — so a
 * `Modal` with an `autoFocus` field is a race the field loses. It also has no room for the two things
 * this surface is made of: a field that filters and a list that answers to the arrow keys underneath
 * it. So the dialog primitive is used directly, with the panel shaped here.
 *
 * What was kept from `Modal` is everything that makes a dialog a dialog and not a positioned div:
 * a portal, a scrim, `role="dialog"` with `aria-modal`, focus moved in on open and returned to what
 * opened it on close, Escape, and Tab cycled inside. None of that is re-implemented — it is Radix's.
 *
 * The one thing this file does *not* have, deliberately: a second list of destinations. The results
 * are `searchQuickNav`'s, which reads `NAV_MODEL` — the same value the rail draws — so a section that
 * moved or was renamed moved here too, and there is no target in this surface that is not a real page.
 *
 * Accessibility shape
 * -------------------
 * It is the combobox pattern, because that is what it *is*: the field is `role="combobox"`, it names
 * the listbox it filters (`aria-controls`), it says which option is highlighted through
 * `aria-activedescendant` rather than by moving focus — so the reader never leaves the field while
 * walking results — and each result is a `role="option"` with `aria-selected`. `aria-keyshortcuts`
 * publishes the shortcut that opens it, next to the `<kbd>` that prints it.
 */

/** The listbox, and the option ids the field points at through `aria-activedescendant`. */
const LIST_ID = 'quick-nav-results';
const optionId = (index: number): string => `quick-nav-option-${index}`;

/**
 * The palette itself, mounted only while it is open.
 *
 * Mounting on open rather than hiding on close is what makes the query state self-clearing: there is
 * no "reset the search" step to forget, because the next open is a new component. It is also why the
 * shell can keep this in the tree unconditionally — closed, it renders nothing at all.
 */
function QuickNavPanel() {
  const locale = useUiLocale();
  const page = useUiStore((state) => state.page);
  const setPage = useUiStore((state) => state.setPage);
  const setQuickNavOpen = useUiStore((state) => state.setQuickNavOpen);
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  /** What held the keyboard when this panel opened, so it can be given back when it closes. */
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const active = document.activeElement;
    returnFocusRef.current = active instanceof HTMLElement ? active : null;
  }, []);

  const results = useMemo(() => searchQuickNav(query, locale), [query, locale]);
  // The highlight is always a row that exists: the list shrinks as a query narrows, and an index left
  // over from a longer list would point at an answer that is no longer drawn.
  const highlighted = results.length === 0 ? -1 : Math.min(active, results.length - 1);

  const open = (match: QuickNavMatch): void => {
    // The rail's own action, so the two cannot disagree about which page is current...
    setPage(match.section.id);
    // ...and the palette leaves with the choice it made, rather than sitting over the page it opened.
    setQuickNavOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (results.length === 0) return;
      // The default would scroll the list and move the caret to an end of the field; walking results
      // is this surface's own use of the arrow keys.
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + results.length) % results.length);
      return;
    }
    if (event.key !== 'Enter' || highlighted < 0) return;
    const chosen = results[highlighted];
    if (!chosen) return;
    event.preventDefault();
    open(chosen);
  };

  const panel = reduceMotion
    ? {}
    : {
        initial: PANEL_IN.initial,
        animate: PANEL_IN.animate,
        exit: PANEL_IN.exit,
        transition: PANEL_IN.transition,
      };

  return (
    <RadixDialog.Portal forceMount>
      <RadixDialog.Overlay asChild forceMount>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : DURATION.fast, ease: EASE.standard }}
          className="fixed inset-0 z-[var(--z-overlay)] bg-overlay overlay-veil backdrop-blur-sm"
        />
      </RadixDialog.Overlay>

      <RadixDialog.Content
        asChild
        forceMount
        // Radix closes a dialog by returning the keyboard to its own `Dialog.Trigger` — and it stops
        // the browser's own restore in order to do that, so with no trigger in this dialog's tree the
        // keyboard would simply be dropped. This palette's trigger is the rail's control, a component
        // away, so the element is handed back from here instead. It is a *layout* effect that recorded
        // it: Radix moves focus onto the field from a passive effect, so a passive effect here would
        // read the field rather than what had the keyboard before it.
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef.current;
          if (!target) return;
          event.preventDefault();
          target.focus();
        }}
      >
        <motion.div
          {...panel}
          onKeyDown={onKeyDown}
          className={cn(
            // Centred by an offset and an equal transform, so the mirror does not move it: uploading
            // it to the flow would need a wrapper, and the wrapper would be the thing that mirrors.
            'fixed left-1/2 top-[9vh] z-[var(--z-modal)] w-[92vw] max-w-xl -translate-x-1/2',
            'flex max-h-[80vh] flex-col',
            'rounded-[var(--radius-panel)] border border-border-strong',
            'bg-surface-raised shadow-popover panel-gradient edge-highlight',
            // A dialog surface rather than a control: Radix moves focus onto it on open and keeps it
            // on the controls inside, so a ring drawn round the panel would point at nothing pressable.
            'focus:outline-none',
          )}
        >
          {/* Both are read out and not drawn: the field is the visible title of this surface, and the
              description is the sentence that says what it is for. A dialog that names itself is the
              difference between a screen reader announcing "dialog" and announcing what it opens. */}
          <RadixDialog.Title className="sr-only">{msg('shell.quickNav')}</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">
            {msg('shell.quickNavDescription')}
          </RadixDialog.Description>

          <div className="flex items-center gap-2 border-b border-border px-3 py-3">
            <div className="relative min-w-0 flex-1">
              <Search
                size={15}
                aria-hidden
                className="pointer-events-none absolute inset-y-0 start-3 my-auto text-text-faint"
              />
              <Input
                // The first tabbable thing inside the panel, which is where Radix's own focus pass
                // puts the keyboard on open — so this is a field a reader can type in immediately,
                // with nothing to click first.
                autoFocus
                role="combobox"
                className="ps-9"
                placeholder={msg('shell.quickNavPlaceholder')}
                aria-label={msg('shell.quickNav')}
                aria-expanded
                aria-controls={LIST_ID}
                aria-activedescendant={highlighted < 0 ? undefined : optionId(highlighted)}
                aria-autocomplete="list"
                aria-keyshortcuts={QUICK_NAV_KEYS}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  // A new query is a new answer, so the highlight starts at its best one rather than
                  // staying on a row number that used to mean something.
                  setActive(0);
                }}
              />
            </div>
            {/* The shortcut, printed where it is used: a keyboard route nobody can see is a route only
                the person who wrote it knows. */}
            <kbd className="num shrink-0 rounded-[var(--radius-control)] border border-border bg-surface-sunken px-1.5 py-0.5 text-caption leading-none text-text-faint">
              {quickNavShortcut()}
            </kbd>
            <RadixDialog.Close asChild>
              <IconButton label={msg('ui.closeDialog')} variant="ghost">
                <X size={16} aria-hidden />
              </IconButton>
            </RadixDialog.Close>
          </div>

          <ul
            id={LIST_ID}
            role="listbox"
            aria-label={msg('shell.quickNavResults')}
            className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
          >
            {results.length === 0 ? (
              // Inside the listbox, and not an option: there is no destination to open, and a row that
              // said otherwise would be a target that does not exist.
              <li
                role="presentation"
                className="px-3 py-8 text-center text-caption text-text-faint"
              >
                {msg('shell.quickNavNoMatches')}
              </li>
            ) : (
              results.map((match, index) => (
                <li key={match.section.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    id={optionId(index)}
                    data-quick-nav-id={match.section.id}
                    aria-selected={index === highlighted}
                    // Not a tab stop: the field holds the keyboard, and the arrows walk the list. A row
                    // in the tab order would be a second way through the same fourteen answers.
                    tabIndex={-1}
                    onMouseMove={() => setActive(index)}
                    // A press must not take the keyboard out of the field, or a reader who clicked a
                    // result they did not want could no longer type to narrow the list.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => open(match)}
                    className={cn(
                      'group flex w-full items-start gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2',
                      'text-start text-body transition-colors duration-[var(--duration-fast)]',
                      index === highlighted
                        ? 'bg-surface-raised text-text'
                        : 'text-text-muted hover:text-text',
                    )}
                  >
                    {/* The glyph the rail draws for this destination, from the rail's own map: one
                        icon per section, so the two surfaces cannot teach different symbols. */}
                    <span
                      className={cn(
                        'mt-0.5 grid size-[22px] shrink-0 place-items-center',
                        index === highlighted ? 'text-primary' : 'text-text-faint',
                      )}
                    >
                      {NAV_ICONS[match.section.icon]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{msg(match.section.labelKey)}</span>
                      <span className="block truncate text-caption text-text-faint">
                        {msg(match.section.descriptionKey)}
                      </span>
                    </span>
                    {/* Where the reader already is, marked the way the rail marks it — not by colour
                        alone, and never as a second `aria-current`: the rail's entries are the only
                        things that claim a page. */}
                    {match.section.id === page ? (
                      <span className="ms-auto flex shrink-0 items-center gap-1.5 self-center text-caption text-text-faint">
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
                        {msg('shell.quickNavCurrent')}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>

          <p className="border-t border-border px-3 py-2 text-caption text-text-faint">
            {msg('shell.quickNavKeyboard')}
          </p>
        </motion.div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

/**
 * The quick-navigation palette, and the shortcut that opens it from anywhere.
 *
 * The listener is on the document rather than on a field, because that is what "global" means here: a
 * reader can ask for a destination from any page, without first finding a control. `Ctrl`/`⌘`+`K` is
 * the shortcut every command surface uses, so it is the one nobody has to be taught — and the browser
 * must not keep it, which is why the handler says so before it toggles.
 *
 * It is mounted by the shell, unconditionally, and renders nothing while closed.
 */
export function QuickNav() {
  const open = useUiStore((state) => state.quickNavOpen);
  const setQuickNavOpen = useUiStore((state) => state.setQuickNavOpen);
  const toggleQuickNav = useUiStore((state) => state.toggleQuickNav);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      // Someone else's shortcut, and already handled. Also anything that escapes it: a combination
      // with Alt or Shift is a different key, and claiming it would shadow the platform's own.
      if (event.defaultPrevented || event.altKey || event.shiftKey) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      // Claimed before the browser acts: `⌘K` is not ours alone, and a shortcut that also opened a
      // search bar would be two answers to one key press.
      event.preventDefault();
      toggleQuickNav();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toggleQuickNav]);

  return (
    <RadixDialog.Root open={open} onOpenChange={setQuickNavOpen}>
      <AnimatePresence>{open ? <QuickNavPanel key="quick-nav" /> : null}</AnimatePresence>
    </RadixDialog.Root>
  );
}
