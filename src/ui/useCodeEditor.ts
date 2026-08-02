import type { RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { EditorView, keymap, type KeyBinding } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import type { FileBuffer } from './fileBuffers.ts';

/**
 * A CodeMirror document bound to a FileBuffer.
 *
 * The RAM program editor and the test editor differ only in their syntax extensions and a
 * key binding or two; everything else — the palette-coloured theme, undo history, Ctrl+S,
 * and mirroring the document out into the buffer — is the same, so it lives here.
 */

export interface CodeEditorHandle {
  /** Replace the document, without the change counting as the player's edit. */
  load: (content: string) => void;
}

export interface CodeEditorOptions {
  buffer: FileBuffer;
  /** Syntax-specific extensions: language, highlight style, linter. */
  extensions: Extension[];
  /** Ctrl/Cmd-S. Read through a ref, so it is always the current render's. */
  onSave: () => void;
  /** Runs before the document exists, to settle what it starts as. */
  initialise: () => void;
  /** Extra key bindings, e.g. Escape to close the window. */
  keys?: KeyBinding[];
}

/** Returns the ref for the element the editor should be mounted into. */
export function useCodeEditor(
  handleRef: RefObject<CodeEditorHandle | null>,
  options: CodeEditorOptions,
): RefObject<HTMLDivElement> {
  const containerRef = useRef<HTMLDivElement>(null);
  const saveRef = useRef(options.onSave);
  saveRef.current = options.onSave;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { buffer, extensions, initialise, keys = [] } = options;
    initialise();

    // Set while the code swaps files, so that edit is not counted as the player's.
    let loading = false;

    const view = new EditorView({
      state: EditorState.create({
        doc: buffer.source.peek(),
        extensions: [
          ...extensions,
          ...EDITOR_THEME,
          history(),
          keymap.of([
            ...keys,
            { key: 'Mod-s', run: () => { saveRef.current(); return true; } },
            // Tab indents instead of leaving the editor. CodeMirror leaves it unbound by
            // default so keyboard users can tab past a read-only view; here the editor is
            // the thing being used, and losing the caret mid-line is the worse surprise.
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of(update => {
            if (!update.docChanged || loading) return;
            buffer.source.value = update.state.doc.toString();
            buffer.dirty.value = true;
          }),
        ],
      }),
      parent: container,
    });

    handleRef.current = {
      load(content: string) {
        loading = true;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
        loading = false;
      },
    };

    view.focus();
    return () => {
      view.destroy();
      handleRef.current = null;
    };
  }, []);

  return containerRef;
}

/**
 * Drawn from the palette's CSS variables rather than fixed hexes — the editor sits on
 * `--bg`, and a dark-theme colour is unreadable on a light board.
 */
const EDITOR_THEME: Extension[] = [
  EditorView.theme({
    '&': { height: '100%', fontSize: '13px', backgroundColor: 'var(--bg)' },
    '.cm-content': {
      fontFamily: 'monospace', padding: '8px 0', color: 'var(--text)', caretColor: 'var(--text)',
    },
    '.cm-gutters': { backgroundColor: 'var(--bg)', color: 'var(--text-dim2)', border: 'none' },
    '.cm-scroller': { overflow: 'auto' },
    '.cm-focused': { outline: 'none' },
    '.cm-cursor': { borderLeftColor: 'var(--text)' },
    '.cm-selectionBackground': { backgroundColor: 'rgba(100, 150, 255, 0.2) !important' },
    '.cm-activeLine': { backgroundColor: 'var(--label-bg)' },
    '.cm-tooltip': {
      backgroundColor: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)',
    },
    '.cm-tooltip-lint': { backgroundColor: 'var(--surface)' },
    '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy var(--fail)' },
  }),
];
