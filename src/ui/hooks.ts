import { useEffect, useState } from 'react';

// Re-renders when a media query starts / stops matching.
export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

export const WIDE_QUERY = '(min-width: 1000px)';
export const NARROW_QUERY = '(max-width: 759.98px)';
