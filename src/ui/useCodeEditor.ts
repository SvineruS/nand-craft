import type { RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Decoration, EditorView, keymap, lineNumbers, type DecorationSet, type KeyBinding } from '@codemirror/view';
import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import type { FileBuffer } from './fileBuffers.ts';

/**
 * A CodeMirror document bound to a FileBuffer.
 *
 * The RAM program editor and the test editor differ only in their syntax extensions, their
 * gutter and a key binding or two; everything else — the palette-coloured theme, line
 * numbers, undo history, Ctrl+S, the marked line and mirroring the document out into the
 * buffer — is the same, so it lives here.
 */

export interface CodeEditorHandle {
  /** Replace the document, without the change counting as the player's edit. */
  load: (content: string) => void;
  /**
   * Mark the line the machine is on — the address the CPU is reading, the test statement
   * being awaited — or null for none. Repeats are ignored, so calling it every tick is free.
   */
  markLine: (line: number | null) => void;
  /** The editor's own state, for a caller that keeps data in it (see `asmDocument`). */
  readonly state: EditorState;
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
  /** The left gutter. Plain line numbers unless the caller has something to add. */
  gutter?: Extension;
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

    const { buffer, extensions, initialise, keys = [], gutter = lineNumbers() } = options;
    initialise();

    // Set while the code swaps files, so that edit is not counted as the player's.
    let loading = false;
    // Last line handed to markLine, so a tick that changes nothing dispatches nothing.
    let markedLine: number | null = null;

    const view = new EditorView({
      state: EditorState.create({
        doc: buffer.source.peek(),
        extensions: [
          ...extensions,
          gutter,
          markedLineField,
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
      markLine(line: number | null) {
        if (line === markedLine) return;
        markedLine = line;
        view.dispatch({ effects: setMarkedLine.of(line) });
      },
      get state() {
        return view.state;
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

// ---------------------------------------------------------------------------
// The marked line — where the running machine is in this document
// ---------------------------------------------------------------------------

const setMarkedLine = StateEffect.define<number | null>();

const MARKED_LINE = Decoration.line({ class: 'cm-markedLine' });

/**
 * The one line the caller marked, as a decoration.
 *
 * A decoration rather than a scroll or a selection: the player is usually typing while the
 * circuit runs, and moving their caret or their viewport out from under them for that would
 * be unusable. Between marks the range is mapped through edits, so the highlight stays on the
 * same text while a line is typed above it.
 */
const markedLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setMarkedLine)) return decorateLine(tr.state, effect.value);
    }
    return tr.docChanged ? value.map(tr.changes) : value;
  },
  provide: field => EditorView.decorations.from(field),
});

function decorateLine(state: EditorState, line: number | null): DecorationSet {
  if (line === null || line < 1 || line > state.doc.lines) return Decoration.none;
  return Decoration.set(MARKED_LINE.range(state.doc.line(line).from));
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
    // After .cm-activeLine, so the running machine's line wins where the caret also sits —
    // both are single-class line decorations, and the later rule is the one that applies.
    '.cm-markedLine': {
      backgroundColor: 'var(--current-bg)',
      boxShadow: 'inset 2px 0 0 var(--current-border)',
    },
    // Byte offsets sit in a second gutter the program editor's toolbar shows one of.
    '.cm-byteOffsets .cm-gutterElement': {
      padding: '0 3px 0 5px', minWidth: '20px', textAlign: 'right', whiteSpace: 'nowrap',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)',
    },
    '.cm-tooltip-lint': { backgroundColor: 'var(--surface)' },
    '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy var(--fail)' },
  }),
];
