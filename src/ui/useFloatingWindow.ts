import { useEffect, useRef } from 'preact/hooks';
import { raiseWindow, registerWindow, unregisterWindow } from './windowStacking.ts';

/**
 * Drag-by-header and resize-by-corner for a floating window, plus a memory of where the
 * player left it.
 *
 * Position and size are written straight to the element's style rather than held in a
 * signal: a window is an absolutely positioned overlay, so moving it is a purely visual
 * concern and re-rendering Preact on every mousemove would be wasted work. They are copied
 * into `geometryById` when a drag ends, so closing and reopening a window does not throw
 * away the layout the player arranged.
 */

interface Geometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Small enough to tuck a window out of the way, large enough to keep a header usable. */
const MIN_WIDTH = 260;
const MIN_HEIGHT = 140;

/** Survives unmounting, so a reopened window comes back where it was. */
const geometryById = new Map<string, Geometry>();

export function useFloatingWindow(id: string) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const stored = geometryById.get(id);
    // Clamped on the way back in: the browser window may have shrunk since, and a window
    // restored past the edge would be unreachable — there is nothing to drag it back by.
    if (stored) applyGeometry(card, clampToViewport(stored));

    // Touching a window brings it to the front. In the capture phase and on the element
    // itself, so it fires for a click anywhere inside — including the code editor, which
    // handles mousedown for its own selection.
    const onMouseDownCapture = () => raiseWindow(id);
    card.addEventListener('mousedown', onMouseDownCapture, true);
    registerWindow(id, card);

    return () => {
      card.removeEventListener('mousedown', onMouseDownCapture, true);
      unregisterWindow(id);
    };
  }, [id]);

  const remember = () => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    geometryById.set(id, { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  };

  const onHeaderMouseDown = (e: MouseEvent) => {
    // Buttons and tabs in the header stay buttons and tabs.
    if ((e.target as HTMLElement).closest('button, select, input')) return;
    const card = cardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const origin = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };

    trackPointer(e, move => {
      card.style.left = `${origin.left + move.clientX - origin.x}px`;
      card.style.top = `${origin.top + move.clientY - origin.y}px`;
    }, remember);
  };

  const onResizeMouseDown = (e: MouseEvent) => {
    const card = cardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const origin = { x: e.clientX, y: e.clientY, width: rect.width, height: rect.height };
    // The window is positioned from its top-left, so pin that corner before resizing:
    // a card placed with `left: calc(50% - …)` would otherwise re-centre as it grows.
    applyGeometry(card, { left: rect.left, top: rect.top, width: rect.width, height: rect.height });

    trackPointer(e, move => {
      card.style.width = `${Math.max(MIN_WIDTH, origin.width + move.clientX - origin.x)}px`;
      card.style.height = `${Math.max(MIN_HEIGHT, origin.height + move.clientY - origin.y)}px`;
    }, remember);
  };

  return { cardRef, onHeaderMouseDown, onResizeMouseDown };
}

/** Keep enough of the header on screen to grab it again. */
function clampToViewport(geometry: Geometry): Geometry {
  const VISIBLE_EDGE = 80;
  return {
    ...geometry,
    left: Math.min(Math.max(geometry.left, VISIBLE_EDGE - geometry.width), window.innerWidth - VISIBLE_EDGE),
    top: Math.min(Math.max(geometry.top, 0), window.innerHeight - VISIBLE_EDGE),
  };
}

function applyGeometry(card: HTMLElement, geometry: Geometry): void {
  card.style.left = `${geometry.left}px`;
  card.style.top = `${geometry.top}px`;
  card.style.width = `${geometry.width}px`;
  card.style.height = `${geometry.height}px`;
}

/** Follow the pointer until it is released, then run `onDone`. */
function trackPointer(
  start: MouseEvent, onMove: (e: MouseEvent) => void, onDone: () => void,
): void {
  start.preventDefault();

  const onMouseMove = (move: MouseEvent) => {
    // A release outside the browser never reaches us; the first move back in reports no
    // button held. Without this the window would keep following the cursor.
    if (move.buttons === 0) {
      finish();
      return;
    }
    onMove(move);
  };

  const finish = () => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', finish);
    onDone();
  };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', finish);
}
