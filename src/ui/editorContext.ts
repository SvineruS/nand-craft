import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Editor } from '../circuit-builder/editor/Editor.ts';

/**
 * The Editor the current screen owns.
 *
 * Previously a module-level singleton set by whichever navigation action happened to run
 * before the screen mounted, which made initialization order an unwritten contract — one
 * screen had to build its editor during render just to satisfy it. Now the screen that
 * needs an editor constructs it and provides it here, so its lifetime matches the screen's
 * and children cannot observe a half-initialized app.
 */
export const EditorContext = createContext<Editor | null>(null);

/** The editor for the current screen. Throws if used outside an editor screen. */
export function useEditor(): Editor {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error('useEditor() outside an EditorContext provider');
  return editor;
}
