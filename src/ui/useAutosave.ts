import { useEffect } from 'preact/hooks';
import { AUTOSAVE_INTERVAL_MS } from '../circuit-builder/persistence/storage.ts';

/**
 * Save periodically, when the tab is hidden, and when it closes.
 *
 * Only the triggers are shared. What a save *does* is not: the level editor writes a circuit
 * to localStorage under a level id, while the component editor builds a whole component
 * definition and can fail — so each screen passes its own.
 *
 * Leaving the screen is deliberately not a trigger here. Both screens save on teardown
 * through `CircuitWorkspace`, which runs after the canvas has stopped ticking.
 */
export function useAutosave(save: () => void): void {
  useEffect(() => {
    const onVisibilityChange = () => { if (document.hidden) save(); };
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const interval = setInterval(save, AUTOSAVE_INTERVAL_MS);

    return () => {
      window.removeEventListener('beforeunload', save);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(interval);
    };
  }, [save]);
}
