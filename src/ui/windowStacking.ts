/**
 * Which floating window is drawn over which.
 *
 * The window last touched goes on top. Rather than handing out ever-larger z-indexes, the
 * open windows are kept in bottom-to-top order and renumbered from a fixed base on every
 * raise: the values stay inside a known band however long a session runs, so modals (which
 * sit far above the band) always win.
 *
 * Kept apart from `useFloatingWindow` because it is the one piece of window behaviour with
 * state shared between windows — and the one worth testing without a DOM.
 */

/** The only part of an element this module writes, so a test can pass a plain object. */
export interface Stackable {
  style: { zIndex: string };
}

export const WINDOW_Z_BASE = 900;

const openWindows = new Map<string, Stackable>();

/** Ids bottom to top. */
const stackOrder: string[] = [];

/** Add a window and put it on top — a window that just opened is the one being reached for. */
export function registerWindow(id: string, element: Stackable): void {
  openWindows.set(id, element);
  raiseWindow(id);
}

export function unregisterWindow(id: string): void {
  openWindows.delete(id);
  const at = stackOrder.indexOf(id);
  if (at >= 0) stackOrder.splice(at, 1);
  applyStacking();
}

export function raiseWindow(id: string): void {
  const at = stackOrder.indexOf(id);
  // `at >= 0` matters: an id that is not in the list yet also reports length - 1 when the
  // list is empty, and skipping then would leave the first window unnumbered forever.
  if (at >= 0 && at === stackOrder.length - 1) return;

  if (at >= 0) stackOrder.splice(at, 1);
  stackOrder.push(id);
  applyStacking();
}

function applyStacking(): void {
  stackOrder.forEach((id, index) => {
    const element = openWindows.get(id);
    if (element) element.style.zIndex = String(WINDOW_Z_BASE + index);
  });
}
