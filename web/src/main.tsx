import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import { App } from './App';
import { applyDocumentTheme } from './app/useDocumentTheme.js';
import { applyDocumentLocale } from './i18n/index.js';
import { uiLocaleOf } from './i18n/locales.js';
import { useUiStore } from './store/ui.js';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Missing #root container in index.html');
}

/*
 * The document's locale, before React paints anything.
 *
 * The shell's hook keeps `<html lang>` and `<html dir>` correct from then on, but effects run *after* the
 * first paint: without this, somebody reading Persian gets one left-to-right frame and then a mirror of it.
 * The setting is already read when the store is created, so the correct attributes are one call away — and
 * they are applied here rather than in a second subscription so that the rule has one home.
 */
const { languagePreference, direction, theme } = useUiStore.getState();
applyDocumentLocale(uiLocaleOf(languagePreference), direction);
/*
 * And the theme, for the same reason. The shell's hook keeps `data-theme` and `color-scheme`
 * correct from then on, but effects run after the first paint — so without this, a reader who chose
 * the light theme gets a full dark frame first. Both settings are already read when the store is
 * created, so both correct attributes are one call away before a single pixel is painted.
 */
applyDocumentTheme(theme);

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
