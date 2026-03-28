import type { KeyEvent } from './input.ts';

type KeyHandler = (e: KeyEvent) => void;

interface Binding {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  handler: KeyHandler;
}

/**
 * Parse a shortcut string like "ctrl+shift+z" or "Delete" into its parts.
 * Modifier order doesn't matter: "shift+ctrl+z" === "ctrl+shift+z".
 */
function parseShortcut(shortcut: string): { key: string; ctrl: boolean; shift: boolean; alt: boolean } {
  const parts = shortcut.toLowerCase().split('+');
  const key = parts.pop()!;
  return {
    key,
    ctrl: parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
  };
}

function matchKey(binding: Binding, e: KeyEvent): boolean {
  return e.key.toLowerCase() === binding.key
    && e.ctrl === binding.ctrl
    && e.shift === binding.shift
    && e.alt === binding.alt;
}

export class KeyMap {
  private bindings: Binding[] = [];

  on(shortcut: string, handler: KeyHandler): void {
    const parsed = parseShortcut(shortcut);
    this.bindings.push({ ...parsed, handler });
  }

  handle(e: KeyEvent): boolean {
    for (const binding of this.bindings) {
      if (matchKey(binding, e)) {
        e.raw.preventDefault();
        binding.handler(e);
        return true;
      }
    }
    return false;
  }
}
