import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query from React.
 *
 * Used by the shell for one decision only: below the desktop-first breakpoint the
 * sidebar collapses to icons so the workspace keeps its width. Everything else is
 * handled by CSS.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mediaQueryList = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mediaQueryList.matches);
    mediaQueryList.addEventListener('change', handleChange);
    return () => mediaQueryList.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}

/** Desktop-first breakpoint: below this the shell tightens up. */
export const COMPACT_SHELL_QUERY = '(max-width: 1099px)';
