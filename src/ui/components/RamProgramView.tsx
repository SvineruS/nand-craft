import { useEffect, useRef, useState } from 'preact/hooks';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState as CodeMirrorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { linter, type Diagnostic } from '@codemirror/lint';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { asmLanguage } from '../../circuit-builder/asm/asmHighlight.ts';
import { assembleProgram } from '../../circuit-builder/asm/assembleProgram.ts';
import type { ProgramFile } from '../../circuit-builder/persistence/programFs.ts';
import {
  deleteProgram, listPrograms, pathProblem, readProgram, renameProgram,
  withProgramExtension, writeProgram,
} from '../../circuit-builder/persistence/programFs.ts';
import type { Gate } from '../../circuit-builder/simulation/gateTypes.ts';
import { padRamCells } from '../../circuit-builder/simulation/gateTypes.ts';
import type { EditorState } from '../../circuit-builder/editor/EditorState.ts';
import type { Command } from '../../circuit-builder/editor/commands.ts';
import { WriteRamCommand } from '../../circuit-builder/editor/commands.ts';
import {
  explorerVisible, openProgramBuffer, openProgramPath, programDirty, programSource,
} from '../programStore.ts';
import { ProgramExplorer } from './ProgramExplorer.tsx';

/**
 * Write a program, assemble it, flash it into the chip.
 *
 * The buffer lives in programStore rather than here — see the note there — so this
 * component is only the wiring between the file list, the text editor and the RAM gate.
 */

const NEW_FILE_TEMPLATE = `; A program is just bytes. What they mean is up to your CPU.
; Press ? for the syntax.

#define NOP 0x00

start:
  NOP
`;

interface Status {
  kind: 'info' | 'error';
  text: string;
}

interface RamProgramViewProps {
  gate: Gate;
  state: EditorState;
  onExecute: (cmd: Command) => void;
}

export function RamProgramView({ gate, state, onExecute }: RamProgramViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  /** Set while the code loads a different file, so that edit is not counted as the player's. */
  const loadingRef = useRef(false);
  const [files, setFiles] = useState<ProgramFile[]>(() => listPrograms());
  const [status, setStatus] = useState<Status | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const path = openProgramPath.value;
  const dirty = programDirty.value;
  const showFiles = explorerVisible.value;

  // The CodeMirror instance is built once, so anything it calls back into reads the
  // current render's values through refs instead of closing over the first render's.
  const pathRef = useRef(path);
  pathRef.current = path;
  const saveRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!containerRef.current) return;
    openInitialBuffer();

    const view = new EditorView({
      state: CodeMirrorState.create({
        doc: programSource.peek(),
        extensions: [
          asmLanguage,
          syntaxHighlighting(asmHighlightStyle),
          linter(view => lintProgram(view, pathRef.current)),
          ...editorTheme,
          history(),
          keymap.of([
            { key: 'Mod-s', run: () => { saveRef.current(); return true; } },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of(update => {
            if (!update.docChanged || loadingRef.current) return;
            programSource.value = update.state.doc.toString();
            programDirty.value = true;
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    view.focus();
    return () => { view.destroy(); viewRef.current = null; };
  }, []);

  const loadIntoEditor = (content: string) => {
    const view = viewRef.current;
    if (!view) return;
    loadingRef.current = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
    loadingRef.current = false;
  };

  /** Store the buffer. Returns false when it could not be saved, having said why. */
  const saveBuffer = (targetPath: string | null): boolean => {
    if (targetPath === null) return createFile();
    const error = writeProgram(targetPath, programSource.peek());
    if (error) {
      setStatus({ kind: 'error', text: error });
      return false;
    }
    programDirty.value = false;
    setFiles(listPrograms());
    setStatus({ kind: 'info', text: `Saved ${targetPath}` });
    return true;
  };

  saveRef.current = () => { saveBuffer(openProgramPath.peek()); };

  // An unsaved buffer would otherwise be lost when the window closes.
  useEffect(() => () => {
    if (programDirty.peek() && openProgramPath.peek()) {
      writeProgram(openProgramPath.peek() as string, programSource.peek());
      programDirty.value = false;
    }
  }, []);

  const createFile = (): boolean => {
    const name = askForPath('New program', suggestFileName(files));
    if (!name) return false;
    if (readProgram(name)) {
      setStatus({ kind: 'error', text: `"${name}" already exists` });
      return false;
    }

    // An untitled buffer is being named; a saved one is being left behind for a fresh file.
    const untitled = openProgramPath.peek() === null;
    if (!untitled && programDirty.peek()) saveBuffer(openProgramPath.peek());
    const buffer = programSource.peek();
    const content = untitled && buffer.trim() !== '' ? buffer : NEW_FILE_TEMPLATE;
    const error = writeProgram(name, content);
    if (error) {
      setStatus({ kind: 'error', text: error });
      return false;
    }
    openProgramBuffer(name, content);
    loadIntoEditor(content);
    setFiles(listPrograms());
    setStatus({ kind: 'info', text: `Created ${name}` });
    return true;
  };

  const openFile = (next: string) => {
    if (next === openProgramPath.peek()) return;
    if (programDirty.peek() && openProgramPath.peek()) saveBuffer(openProgramPath.peek());

    const file = readProgram(next);
    if (!file) {
      setFiles(listPrograms());
      return;
    }
    openProgramBuffer(file.path, file.content);
    loadIntoEditor(file.content);
    setStatus(null);
  };

  const renameFile = (from: string) => {
    const to = askForPath(`Rename "${from}" to`, from);
    if (!to || to === from) return;
    const error = renameProgram(from, to);
    if (error) {
      setStatus({ kind: 'error', text: error });
      return;
    }
    if (openProgramPath.peek() === from) openProgramPath.value = to;
    setFiles(listPrograms());
    setStatus({ kind: 'info', text: `Renamed to ${to}` });
  };

  const deleteFile = (target: string) => {
    if (!confirm(`Delete "${target}"? This cannot be undone.`)) return;
    const error = deleteProgram(target);
    if (error) {
      setStatus({ kind: 'error', text: error });
      return;
    }
    if (openProgramPath.peek() === target) {
      // The text stays in the buffer — deleting a file should not eat what is on screen.
      openProgramPath.value = null;
      programDirty.value = true;
    }
    setFiles(listPrograms());
    setStatus({ kind: 'info', text: `Deleted ${target}` });
  };

  const assemble = () => assembleProgram(programSource.peek(), path ?? '');

  const handleAssemble = () => {
    const result = assemble();
    setStatus(assembleStatus(result.errors, `Assembled ${result.bytes.length} bytes`
      + (result.symbols.length > 0 ? `, ${result.symbols.length} symbols` : '')));
  };

  const handleFlash = () => {
    const result = assemble();
    if (result.errors.length > 0) {
      setStatus(assembleStatus(result.errors, ''));
      return;
    }
    const rom = result.bytes.length > 0 ? result.bytes : undefined;
    onExecute(new WriteRamCommand(state, gate.id, { cells: padRamCells(result.bytes), rom }));
    setStatus({ kind: 'info', text: `Flashed ${result.bytes.length} bytes into ${gate.label ?? 'RAM'}` });
  };

  return (
    <div class="ram-program">
      {showFiles && (
        <ProgramExplorer
          files={files}
          openPath={path}
          dirty={dirty}
          onOpen={openFile}
          onCreate={createFile}
          onRename={renameFile}
          onDelete={deleteFile}
        />
      )}

      <div class="ram-program-main">
        <div class="ram-toolbar">
          <button
            class={`window-tab is-icon${showFiles ? ' is-active' : ''}`}
            title={showFiles ? 'Hide the file list' : 'Show the file list'}
            onClick={() => { explorerVisible.value = !showFiles; }}
          >{'☰'}</button>
          <span class="ram-program-path">{path ?? 'untitled'}{dirty ? ' •' : ''}</span>
          <div class="ram-toolbar-spacer" />
          <button class="window-btn" onClick={() => saveBuffer(path)}>Save</button>
          <button class="window-btn" onClick={handleAssemble}>Assemble</button>
          <button class="window-btn is-primary" onClick={handleFlash}>Flash</button>
          <button class="window-btn" title="Syntax help" onClick={() => setShowHelp(!showHelp)}>?</button>
        </div>

        <div class="ram-editor" ref={containerRef} style={{ display: showHelp ? 'none' : '' }} />
        {showHelp && <ProgramHelp />}

        {status && <div class={`ram-status-line${status.kind === 'error' ? ' is-error' : ''}`}>{status.text}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editing helpers
// ---------------------------------------------------------------------------

/**
 * Ask for a path, validating it here so the file system never sees a bad one.
 *
 * The extension is applied to whatever is typed rather than left to the player: a name
 * without one, or with the wrong one, is a file that reads as a different kind of thing in
 * the list and in an `#include`. The prompt says nothing about it — it is not something the
 * player has to think about, which is the point of enforcing it.
 */
function askForPath(title: string, suggestion: string): string | null {
  const raw = prompt(`${title} (folders allowed: cpu/ops)`, suggestion);
  if (raw === null) return null;

  const problem = pathProblem(raw.trim());
  if (problem) {
    alert(problem);
    return null;
  }
  return withProgramExtension(raw);
}

/**
 * What the editor shows the first time it is opened in a session: the file edited most
 * recently, or a template when there are no files yet.
 */
function openInitialBuffer(): void {
  if (openProgramPath.peek() !== null || programSource.peek() !== '') return;

  const recent = listPrograms().sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (recent) openProgramBuffer(recent.path, recent.content);
  else openProgramBuffer(null, NEW_FILE_TEMPLATE);
}

function suggestFileName(files: ProgramFile[]): string {
  const taken = new Set(files.map(file => file.path));
  for (let i = 1; ; i++) {
    const name = withProgramExtension(`program${i > 1 ? i : ''}`);
    if (!taken.has(name)) return name;
  }
}

function assembleStatus(errors: { line: number; file: string; message: string }[], okText: string): Status {
  if (errors.length === 0) return { kind: 'info', text: okText };
  const first = errors[0];
  const more = errors.length > 1 ? ` (+${errors.length - 1} more)` : '';
  return { kind: 'error', text: `Line ${first.line}: ${first.message}${more}` };
}

/**
 * Underline assembly errors in the editor.
 *
 * Only errors from the file being edited get a marker — one raised inside an `#include`
 * has no line here to point at, so it is reported with its file name in the message.
 */
function lintProgram(view: EditorView, openPath: string | null): Diagnostic[] {
  const doc = view.state.doc;
  const path = openPath ?? '';
  const result = assembleProgram(doc.toString(), path);
  const ownFile = path === '' ? '(unsaved)' : path;

  return result.errors.map(error => {
    const inThisFile = error.file === ownFile;
    const lineNumber = inThisFile ? Math.min(Math.max(error.line, 1), doc.lines) : 1;
    const line = doc.line(lineNumber);
    return {
      from: line.from,
      to: line.to,
      severity: 'error' as const,
      message: inThisFile ? error.message : `${error.file}:${error.line} — ${error.message}`,
    };
  });
}

// ---------------------------------------------------------------------------
// Look
// ---------------------------------------------------------------------------

/** Same approach as the test editor's: palette variables, not fixed hexes. */
const asmHighlightStyle = HighlightStyle.define([
  { tag: tags.meta, color: 'var(--orange)' },
  { tag: tags.macroName, color: 'var(--col-expected)' },
  { tag: tags.labelName, color: 'var(--col-input)' },
  { tag: tags.number, color: 'var(--col-actual)' },
  { tag: tags.string, color: 'var(--col-actual)' },
  { tag: tags.comment, color: 'var(--text-dim2)', fontStyle: 'italic' },
  { tag: tags.variableName, color: 'var(--text)' },
  { tag: tags.punctuation, color: 'var(--text-dim)' },
]);

const editorTheme = [
  EditorView.theme({
    '&': { height: '100%', fontSize: '13px', backgroundColor: 'var(--bg)' },
    '.cm-content': { fontFamily: 'monospace', padding: '8px 0', color: 'var(--text)', caretColor: 'var(--text)' },
    '.cm-gutters': { backgroundColor: 'var(--bg)', color: 'var(--text-dim2)', border: 'none' },
    '.cm-scroller': { overflow: 'auto' },
    '.cm-focused': { outline: 'none' },
    '.cm-cursor': { borderLeftColor: 'var(--text)' },
    '.cm-selectionBackground': { backgroundColor: 'rgba(100, 150, 255, 0.2) !important' },
    '.cm-activeLine': { backgroundColor: 'var(--label-bg)' },
    '.cm-tooltip': { backgroundColor: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' },
    '.cm-tooltip-lint': { backgroundColor: 'var(--surface)' },
    '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy var(--fail)' },
  }),
];

function ProgramHelp() {
  return (
    <div class="window-help">
      <h4>What a program is</h4>
      <p>A sequence of bytes written into the chip's cells, starting at address 0.
      The game has no instruction set — <b>your</b> CPU decides what a byte means, so you
      define the opcodes yourself with <code>#define</code>.</p>

      <h4>Values</h4>
      <p><code>42</code> decimal, <code>0xFF</code> hex, <code>0b1010_0001</code> binary,
      <code>0o17</code> octal, <code>'A'</code> a character, <code>"text"</code> a run of
      characters. Digits may be grouped with <code>_</code>.</p>
      <p>Values may be separated by spaces or commas, and combined with
      <code>+ - * / % &amp; | ^ ~ &lt;&lt; &gt;&gt;</code> and parentheses:</p>
      <pre>{`0x10 | 3, 0b0000_0001
1 + 2      ; one byte: 3
1 2        ; two bytes`}</pre>
      <p>An operator always continues the value before it, so <code>1 -2</code> is the single
      byte <code>-1</code>. Write <code>1, -2</code> when you mean two.</p>

      <h4>Comments</h4>
      <p><code>; text</code> or <code>// text</code> to the end of the line.
      (<code>#</code> starts a directive, not a comment.)</p>

      <h4>#define — constants and macros</h4>
      <p>An object-like define pastes its body wherever the name appears. A function-like
      one takes arguments and pastes them into the body — a copy-paste "function", not a
      call.</p>
      <pre>{`#define ADD  0b0000_0001
#define HALT 0xFF
#define LOADI(reg, value) 0x10 | reg, value

LOADI(1, 42)   ; three bytes: 0x11 42
ADD
HALT`}</pre>
      <p>A body can span lines by ending each one with <code>\\</code>. <code>#undef NAME</code>
      forgets a define.</p>

      <h4>Labels</h4>
      <p><code>name:</code> binds the address of the next byte, usable anywhere as a value —
      including above its own definition.</p>
      <pre>{`  JMP loop
loop:
  NOP
  JMP loop`}</pre>

      <h4>#org — place bytes at an address</h4>
      <pre>{`#org 0x80
  0xDE 0xAD`}</pre>

      <h4>#include — reuse another file</h4>
      <p>Pastes the whole file in. The path is resolved next to the including file first,
      then from the root. Every program file ends in <code>.asm</code>, and the include may
      leave it off.</p>
      <pre>{`#include "cpu/opcodes.asm"
#include "cpu/opcodes"      ; the same file`}</pre>

      <h4>Flashing</h4>
      <p><b>Assemble</b> checks the program; <b>Flash</b> writes it into the chip and keeps
      it as the boot image, so it is reloaded whenever a test run resets memory. Editing a
      byte by hand in the memory window changes the live cells only, and flashing an empty
      program zeroes the chip and forgets its boot image.</p>
    </div>
  );
}
