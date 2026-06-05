import { useState, useEffect } from 'react';

/**
 * S5-5: React hook for prefers-reduced-motion media query.
 * Returns true when the user has enabled reduced motion in their OS settings.
 * Use to conditionally skip animations, transitions, or complex motion in components.
 *
 * @example
 * ```tsx
 * const reduced = useReducedMotion();
 * return <div style={{ transition: reduced ? 'none' : 'all 0.3s' }} />;
 * ```
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}
