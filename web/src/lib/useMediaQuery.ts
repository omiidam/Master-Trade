import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query from React.
 *
 * The generic subscription, with no opinion about what is being asked. The shell's own queries —
 * and the mode they add up to — live in `app/shellLayout.ts`, so the boundaries are stated once
 * rather than wherever a component happens to need one. Everything else is handled by CSS.
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
