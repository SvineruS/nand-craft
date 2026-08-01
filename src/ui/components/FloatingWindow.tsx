import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { useFloatingWindow } from '../useFloatingWindow.ts';

/**
 * A draggable, resizable, non-blocking window — the shell every in-editor panel sits in.
 *
 * Nothing here dims the board or swallows clicks: a window is something the player works
 * *beside*, not through. Modals are still modals (level complete), but everything that
 * shows information while the circuit stays reachable is one of these.
 */

interface FloatingWindowProps {
  /** Identifies the window's remembered position and size. Stable per window kind. */
  id: string;
  title: string;
  onClose: () => void;
  /** Header controls, placed between the title and the close button. */
  actions?: ComponentChildren;
  /** Extra class, for the window's default size and place on screen. */
  class?: string;
  children?: ComponentChildren;
}

export function FloatingWindow(props: FloatingWindowProps) {
  const { id, title, onClose, actions, class: extraClass, children } = props;
  const { cardRef, onHeaderMouseDown, onResizeMouseDown } = useFloatingWindow(id);

  // Through a ref, so the listener is bound once instead of on every render — the RAM
  // window re-renders on every tick of a running circuit.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Escape inside a text field belongs to that field.
      if (e.key !== 'Escape' || isTextTarget(e.target)) return;
      closeRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div class={`floating-window${extraClass ? ` ${extraClass}` : ''}`} ref={cardRef}>
      <div class="floating-window-header" onMouseDown={onHeaderMouseDown}>
        <span class="floating-window-title">{title}</span>
        <div class="floating-window-actions">{actions}</div>
        <button class="floating-window-close" title="Close" onClick={onClose}>✕</button>
      </div>

      <div class="floating-window-body">{children}</div>

      <div class="floating-window-resize" title="Resize" onMouseDown={onResizeMouseDown} />
    </div>
  );
}

function isTextTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || (target instanceof HTMLElement && target.isContentEditable);
}
