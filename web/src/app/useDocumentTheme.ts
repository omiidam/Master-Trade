/**
 * The active theme, applied to the document — Phase 9.
 *
 * This is the whole runtime cost of having two themes, and it is one attribute on one element.
 * Everything else follows from `web/src/styles/global.css`: `[data-theme='light']` redeclares the
 * same custom property names that `@theme` declares, so switching this attribute repaints every
 * surface, ink, edge, well and rim in the product at once. No component subscribes to the theme, no
 * component branches on it, and nothing re-renders because of it — which is exactly the property
 * that makes a component written today correct in both themes and a component written tomorrow
 * correct in both themes without being told.
 *
 * The module is the mirror of `i18n/useTranslation.ts`'s `useDocumentLanguage`, deliberately, down
 * to the shape: a hook for the lifetime of the shell, and an `apply…` for the moment before the
 * first paint. Both reach the document through `globalThis` rather than through a bare `document`,
 * so the module stays loadable in the Node suites, and both read the *same* setting and write the
 * *same* rule, so the pre-paint call and the effect cannot disagree.
 */

import { useEffect } from 'react';
import { useUiStore } from '../store/ui.js';
import type { ShellTheme } from './shellPreference.js';

/** The theme attributes are written to the document element, and nowhere else. */
type DocumentThemeTarget = {
  documentElement: { dataset: DOMStringMap; style: { colorScheme: string } };
};

/**
 * Apply a theme, given the document.
 *
 * `color-scheme` is set alongside `data-theme` and it is not optional: it is what tells the
 * browser which way to draw its own scrollbars, form controls and focus rings, and leaving it on
 * `dark` while the page is light produces a light page with dark scrollbars — a seam that no token
 * in this file can reach, because it belongs to the user agent rather than to us.
 */
function write(theme: ShellTheme, target: DocumentThemeTarget | undefined): void {
  if (!target) return;
  target.documentElement.dataset.theme = theme;
  target.documentElement.style.colorScheme = theme;
}

/** The document, or `undefined` where there is none. */
function browsing(): DocumentThemeTarget | undefined {
  return (globalThis as { document?: DocumentThemeTarget }).document;
}

/**
 * Keep the document on the reader's theme for as long as the shell is mounted.
 *
 * Returns the theme so a caller can render it, though nothing in the shell needs to: the point of
 * the design is that the *stylesheet* reacts to the attribute, not the component tree.
 */
export function useDocumentTheme(): ShellTheme {
  const theme = useUiStore((state) => state.theme);
  useEffect(() => {
    write(theme, browsing());
  }, [theme]);
  return theme;
}

/**
 * The document's theme attribute, applied outside React and before it paints.
 *
 * Called once in `main.tsx`. Without it a reader who chose the light theme gets a full dark frame
 * and then a light one on the first paint — the flash `i18n`'s `applyDocumentLocale` already
 * prevents for the locale, for exactly this reason.
 */
export function applyDocumentTheme(theme: ShellTheme): void {
  write(theme, browsing());
}
