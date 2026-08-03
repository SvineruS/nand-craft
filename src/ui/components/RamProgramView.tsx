import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { lineNumbers, type EditorView } from '@codemirror/view';
import { linter, type Diagnostic } from '@codemirror/lint';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { asmLanguage } from '../../circuit-builder/asm/asmHighlight.ts';
import { assembleProgram } from '../../circuit-builder/asm/assembleProgram.ts';
import type { AsmDiagnostic } from '../../circuit-builder/asm/types.ts';
import { programFiles } from '../../circuit-builder/persistence/userFiles.ts';
import type { Gate } from '../../circuit-builder/simulation/gateTypes.ts';
import { padRamCells } from '../../circuit-builder/simulation/gateTypes.ts';
import type { EditorState } from '../../circuit-builder/editor/EditorState.ts';
import type { Command } from '../../circuit-builder/editor/commands.ts';
import { WriteRamCommand } from '../../circuit-builder/editor/commands.ts';
import { RAM_PIN } from '../../circuit-builder/editor/gates.ts';
import { programBuffer } from '../fileBuffers.ts';
import { asmDocumentField, byteOffsetGutter, lineForAddress, type AsmDocument } from '../asmDocument.ts';
import { useCodeEditor, type CodeEditorHandle } from '../useCodeEditor.ts';
import { useFileEditor, type FileEditorStatus } from '../useFileEditor.ts';
import { FileEditorPane, HelpToggle } from './FileEditorPane.tsx';

/**
 * Write a program, assemble it, flash it into the chip.
 *
 * The files, the buffer and the text editor are the shared machinery (`useFileEditor`,
 * `useCodeEditor`, `FileEditorPane`); what belongs to this view is the assembly syntax, the
 * two buttons that turn source into bytes, and what the addresses those bytes land at are
 * good for — the gutter's byte offsets and the line the chip's address pin is pointing at.
 */

/**
 * Whether the gutter counts bytes instead of lines. Outside the component tree, like the
 * buffers, because this window unmounts every time it is closed and a notation the player
 * chose should not be forgotten by that.
 */
const byteOffsetsVisible = signal(false);

const NEW_FILE_TEMPLATE = `; A program is just bytes. What they mean is up to your CPU.
; Press ? for the syntax.

#define NOP 0x00

start:
  NOP
`;

interface RamProgramViewProps {
  gate: Gate;
  state: EditorState;
  onExecute: (cmd: Command) => void;
}

export function RamProgramView({ gate, state, onExecute }: RamProgramViewProps) {
  const [status, setStatus] = useState<FileEditorStatus | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const handleRef = useRef<CodeEditorHandle | null>(null);

  const files = useFileEditor({
    store: programFiles,
    buffer: programBuffer,
    loadDocument: content => handleRef.current?.load(content),
    template: NEW_FILE_TEMPLATE,
    namePrefix: 'program',
    onStatus: setStatus,
  });

  // The document is assembled on every keystroke, against the file the buffer is saved as —
  // read through a ref, because the editor is built once.
  const pathRef = useRef(files.path);
  pathRef.current = files.path;

  const asmDoc = useMemo(() => asmDocumentField(() => pathRef.current ?? ''), []);

  const containerRef = useCodeEditor(handleRef, {
    buffer: programBuffer,
    extensions: [
      asmLanguage,
      syntaxHighlighting(asmHighlightStyle),
      asmDoc,
      linter(view => lintProgram(view, view.state.field(asmDoc), pathRef.current)),
    ],
    gutter: [lineNumbers(), byteOffsetGutter(asmDoc)],
    onSave: files.save,
    initialise: files.initialise,
  });

  // Subscribed to on purpose: inserting a line moves the bytes below it, so the marked line
  // has to follow the text being typed and not only the circuit ticking.
  const source = programBuffer.source.value;
  const liveAddress = state.circuit.getPinValue(gate.id, 'input', RAM_PIN.address);

  // From an effect rather than in render, because the editor exists only once mounted — and
  // the window re-renders on every tick, which is when the address it reads can have moved.
  useEffect(() => {
    const handle = handleRef.current;
    if (handle) handle.markLine(lineForAddress(handle.state.field(asmDoc), liveAddress));
  }, [liveAddress, source, asmDoc]);

  const assemble = () => assembleProgram(programBuffer.source.peek(), files.path ?? '');

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

  const showOffsets = byteOffsetsVisible.value;

  const actions = (
    <>
      <button class="window-btn" onClick={handleAssemble}>Assemble</button>
      <button class="window-btn is-primary" onClick={handleFlash}>Flash</button>
      <button
        class={`window-tab is-icon${showOffsets ? ' is-active' : ''}`}
        title={showOffsets ? 'Number lines' : 'Number bytes: show each line’s address'}
        onClick={() => { byteOffsetsVisible.value = !showOffsets; }}
      >0x</button>
      <HelpToggle open={showHelp} onToggle={() => setShowHelp(!showHelp)} />
    </>
  );

  return (
    <FileEditorPane editor={files} status={status} actions={actions}>
      <div
        class={`window-editor${showOffsets ? ' is-offsets' : ''}`}
        ref={containerRef}
        style={{ display: showHelp ? 'none' : '' }}
      />
      {showHelp && <ProgramHelp />}
    </FileEditorPane>
  );
}

function assembleStatus(errors: AsmDiagnostic[], okText: string): FileEditorStatus {
  if (errors.length === 0) return { kind: 'info', text: okText };
  const first = errors[0];
  const more = errors.length > 1 ? ` (+${errors.length - 1} more)` : '';
  return { kind: 'error', text: `Line ${first.line}: ${first.message}${more}` };
}

/**
 * Underline assembly errors in the editor.
 *
 * Reads the assembly the document already holds, so the underlining, the offsets in the
 * gutter and the marked line are three readings of one result rather than three assemblies.
 * Only errors from the file being edited get a marker — one raised inside an `#include` has
 * no line here to point at, so it is reported with its file name in the message.
 */
function lintProgram(view: EditorView, asm: AsmDocument, openPath: string | null): Diagnostic[] {
  const doc = view.state.doc;
  const ownFile = openPath === null || openPath === '' ? '(unsaved)' : openPath;

  return asm.result.errors.map(error => {
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

/** Syntax colours, from the palette's CSS variables — see the note in useCodeEditor. */
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
