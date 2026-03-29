import { useEffect, useState } from 'react';

/**
 * Delays non-critical UI work until the browser is idle (or after a short timeout fallback).
 * Use for sidebar widgets so the main feed can paint first.
 */
export function useDeferredMount(fallbackMs = 400) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) setReady(true);
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = window.requestIdleCallback(run, { timeout: 1200 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }

    const t = window.setTimeout(run, fallbackMs);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [fallbackMs]);

  return ready;
}
