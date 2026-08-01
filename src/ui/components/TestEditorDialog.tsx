import { useRef, useState } from 'preact/hooks';
import { testEditorVisible } from '../editorStore.ts';
import { linter, type Diagnostic } from '@codemirror/lint';
import { dslLanguage } from '../../circuit-builder/testing/dslHighlight.ts';
import { parseDsl, convertToTestCases } from '../../circuit-builder/testing/dslParser.ts';
import { compileTestFunction, enumerateInputs } from '../../circuit-builder/testing/codeSandbox.ts';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { testFiles } from '../../circuit-builder/persistence/userFiles.ts';
import { useEditor } from '../editorContext.ts';
import { testBuffer } from '../fileBuffers.ts';
import { useCodeEditor, type CodeEditorHandle } from '../useCodeEditor.ts';
import { useFileEditor, type FileEditorStatus } from '../useFileEditor.ts';
import { FloatingWindow } from './FloatingWindow.tsx';
import { FileEditorPane, HelpToggle } from './FileEditorPane.tsx';
import type { Circuit } from '../../circuit-builder/simulation/circuit.ts';
import { notifyStateChange } from '../editorStore.ts';
import { isInputGate, isOutputGate } from '../../circuit-builder/simulation/gateTypes.ts';
import { getPinBitWidth } from '../../circuit-builder/editor/gates.ts';
import type { TestCase } from '../../circuit-builder/levels/levelTypes.ts';

const PLACEHOLDER = `# Press ? for help
@mode table
@inputs A B
@outputs Out

0 0 | 0
0 1 | 1
1 0 | 1
1 1 | 0
`;

function collectGateLabels(circuit: Circuit): { inputs: Set<string>; outputs: Set<string> } {
  const inputs = new Set<string>();
  const outputs = new Set<string>();
  for (const gate of circuit.gates.values()) {
    if (!gate.label) continue;
    if (isInputGate(gate.type)) inputs.add(gate.label);
    if (isOutputGate(gate.type)) outputs.add(gate.label);
  }
  return { inputs, outputs };
}

/**
 * Syntax colours, drawn from the palette's CSS variables rather than fixed hexes — the
 * editor sits on `--bg`, and a dark-theme pastel is unreadable on a light board.
 */
const dslHighlightStyle = HighlightStyle.define([
  { tag: tags.meta, color: 'var(--orange)' },
  { tag: tags.labelName, color: 'var(--text-dim)' },
  { tag: tags.keyword, color: 'var(--col-expected)' },
  { tag: tags.number, color: 'var(--col-actual)' },
  { tag: tags.comment, color: 'var(--text-dim2)', fontStyle: 'italic' },
  { tag: tags.variableName, color: 'var(--col-input)' },
  { tag: tags.punctuation, color: 'var(--text-dim)' },
]);

/**
 * Built per editor rather than once at module scope: the linter checks DSL labels against
 * the circuit's gates, and the circuit belongs to whichever editor is open.
 */
const createDslLinter = (circuit: Circuit) => linter((view) => {
  const doc = view.state.doc;
  const { mode, cases, errors, inputLabels, outputLabels } = parseDsl(doc.toString());
  const diagnostics: Diagnostic[] = [];

  for (const err of errors) {
    const line = doc.line(err.line);
    diagnostics.push({ from: line.from, to: line.to, severity: 'error', message: err.message });
  }

  const labels = collectGateLabels(circuit);
  const lines = doc.toString().split('\n');

  // Check @inputs/@outputs labels against circuit
  if (inputLabels) {
    for (const label of inputLabels) {
      if (!labels.inputs.has(label)) {
        const lineIdx = lines.findIndex(l => l.replace(/#.*$/, '').includes('@inputs'));
        if (lineIdx >= 0) {
          const line = doc.line(lineIdx + 1);
          diagnostics.push({ from: line.from, to: line.to, severity: 'warning', message: `No input gate labeled "${label}"` });
        }
      }
    }
  }
  if (outputLabels) {
    for (const label of outputLabels) {
      if (!labels.outputs.has(label)) {
        const lineIdx = lines.findIndex(l => l.replace(/#.*$/, '').includes('@outputs'));
        if (lineIdx >= 0) {
          const line = doc.line(lineIdx + 1);
          diagnostics.push({ from: line.from, to: line.to, severity: 'warning', message: `No output gate labeled "${label}"` });
        }
      }
    }
  }

  // Per-command label check (only for queue — table/code already checked via @inputs/@outputs)
  if (mode === 'queue') {
    let cmdLine = 0;
    const allCommands = cases.flatMap(c => c.commands);
    for (const cmd of allCommands) {
      if (cmd.type === 'set' || cmd.type === 'write') {
        const lineIdx = findCommandLine(lines, cmd.label, cmdLine);
        if (lineIdx !== null && !labels.inputs.has(cmd.label)) {
          const line = doc.line(lineIdx + 1);
          diagnostics.push({ from: line.from, to: line.to, severity: 'warning', message: `No input gate labeled "${cmd.label}"` });
        }
        cmdLine = lineIdx ?? cmdLine;
      } else if (cmd.type === 'expect' || cmd.type === 'read') {
        const lineIdx = findCommandLine(lines, cmd.label, cmdLine);
        if (lineIdx !== null && !labels.outputs.has(cmd.label)) {
          const line = doc.line(lineIdx + 1);
          diagnostics.push({ from: line.from, to: line.to, severity: 'warning', message: `No output gate labeled "${cmd.label}"` });
        }
        cmdLine = lineIdx ?? cmdLine;
      }
    }
  }

  return diagnostics;
});

function findCommandLine(lines: string[], label: string, startFrom: number): number | null {
  for (let i = startFrom; i < lines.length; i++) {
    if (lines[i].includes(label)) return i;
  }
  return null;
}

export function TestEditorDialog() {
  if (!testEditorVisible.value) return null;
  return <TestEditor />;
}

/**
 * Inner component so the editor and its file list are built only while the window is open,
 * and torn down with it — the buffer itself lives on in `testBuffer`.
 */
function TestEditor() {
  const editor = useEditor();
  const [status, setStatus] = useState<FileEditorStatus | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const handleRef = useRef<CodeEditorHandle | null>(null);

  const files = useFileEditor({
    store: testFiles,
    buffer: testBuffer,
    loadDocument: content => handleRef.current?.load(content),
    template: PLACEHOLDER,
    namePrefix: 'suite',
    onStatus: setStatus,
  });

  const containerRef = useCodeEditor(handleRef, {
    buffer: testBuffer,
    extensions: [
      dslLanguage,
      syntaxHighlighting(dslHighlightStyle),
      createDslLinter(editor.getCircuit()),
    ],
    onSave: files.save,
    initialise: files.initialise,
    keys: [{ key: 'Escape', run: () => { testEditorVisible.value = false; return true; } }],
  });

  const handleApply = () => {
    const doc = testBuffer.source.peek();
    if (!doc) return;

    const result = parseDsl(doc);
    if (result.errors.length > 0) {
      setStatus({ kind: 'error', text: `Line ${result.errors[0].line}: ${result.errors[0].message}` });
      return;
    }

    if (result.mode === 'queue') {
      // Queue mode: flatten commands with case boundary markers
      const allCommands = result.cases.flatMap(c => c.commands);
      const caseBoundaries: { index: number; name?: string }[] = [];
      let idx = 0;
      for (const c of result.cases) {
        if (c.commands.length > 0) {
          caseBoundaries.push({ index: idx, name: c.description });
        }
        idx += c.commands.length;
      }
      // Clear old table test data so summary doesn't show stale counts
      editor.tests.suite = { cases: [], inputNames: [], outputNames: [] };
      editor.tests.mode = 'queue';
      editor.tests.startQueue(allCommands, caseBoundaries);
      notifyStateChange();
      setStatus({ kind: 'info', text: `Applied ${allCommands.length} queue commands` });
      return;
    }

    let cases: TestCase[];
    try {
      if (result.mode === 'code') {
        cases = generateCodeTestCases(result, editor.getCircuit());
      } else {
        cases = convertToTestCases(result);
      }
    } catch (e) {
      setStatus({ kind: 'error', text: `Could not generate cases: ${(e as Error).message}` });
      return;
    }

    // Extract input/output names from parse result or test cases
    let inputNames: string[];
    let outputNames: string[];
    if (result.inputLabels && result.outputLabels) {
      inputNames = result.inputLabels;
      outputNames = result.outputLabels;
    } else {
      const inSet = new Set<string>();
      const outSet = new Set<string>();
      for (const tc of cases) {
        for (const k of Object.keys(tc.inputs)) inSet.add(k);
        for (const k of Object.keys(tc.expected)) outSet.add(k);
      }
      inputNames = [...inSet];
      outputNames = [...outSet];
    }

    editor.tests.setSuite({ cases, inputNames, outputNames });
    notifyStateChange();
    setStatus({ kind: 'info', text: `Applied ${cases.length} test cases` });
  };

  const actions = (
    <>
      <button class="window-btn is-primary" onClick={handleApply}>Apply</button>
      <HelpToggle open={showHelp} onToggle={() => setShowHelp(!showHelp)} />
    </>
  );

  return (
    <FloatingWindow
      id="tests"
      class="window-tests"
      title="Test Editor"
      onClose={() => { testEditorVisible.value = false; }}
    >
      <FileEditorPane editor={files} status={status} actions={actions}>
        <div class="window-editor" ref={containerRef} style={{ display: showHelp ? 'none' : '' }} />
        {showHelp && <HelpPanel />}
      </FileEditorPane>
    </FloatingWindow>
  );
}

function generateCodeTestCases(result: ReturnType<typeof parseDsl>, circuit: Circuit): TestCase[] {
  const { inputLabels, outputLabels, codeBody } = result;
  if (!inputLabels || !outputLabels || !codeBody) return [];

  // Get bit widths from circuit
  const bitWidths = inputLabels.map(label => {
    for (const gate of circuit.gates.values()) {
      if (gate.label === label && isInputGate(gate.type)) {
        return getPinBitWidth(gate.type, 'output', 0);
      }
    }
    return 1;
  });

  const fn = compileTestFunction(codeBody, inputLabels.length);
  const combos = enumerateInputs(bitWidths);

  return combos.map(inputs => {
    const outputs = fn(...inputs);
    const inputRecord: Record<string, number> = {};
    const expectedRecord: Record<string, number> = {};
    for (let i = 0; i < inputLabels.length; i++) {
      inputRecord[inputLabels[i]] = inputs[i];
    }
    for (let i = 0; i < outputLabels.length; i++) {
      expectedRecord[outputLabels[i]] = outputs[i];
    }
    return { inputs: inputRecord, expected: expectedRecord };
  });
}

function HelpPanel() {
  return (
    <div class="window-help">
      <h4>I/O Gates</h4>
      <p>Tests reference I/O gates by their <b>label</b>. Place IN/OUT gates on the canvas
      and rename them in the Properties panel (select gate, edit "Label" field).
      Available types:</p>
      <p>
        <b>IN / IN8 / IN16</b> — input gates (1, 8, 16-bit). Test sets their value.<br/>
        <b>OUT / OUT8 / OUT16</b> — output gates. Test checks their value.<br/>
        <b>Switch variants</b> — I/O gates with enable pin for sequential (queue) tests.
      </p>

      <h4>How testing works</h4>
      <p>Write tests below, click <b>Apply</b> to generate the truth table.
      Then use <b>Step</b> or <b>Run All</b> in the test panel to execute.
      Each test case sets inputs, ticks the circuit once, and checks outputs.</p>

      <h4>@mode table</h4>
      <p>Declare inputs/outputs, then list values. Each row is a test case.</p>
      <pre>{`@mode table
@inputs A B
@outputs Out

0 0 | 0
0 1 | 1
1 0 | 1
1 1 | 0`}</pre>

      <h4>@mode code</h4>
      <p>JS function that computes expected outputs. Inputs are auto-enumerated.
      Only <code>Math</code> is accessible. For wide inputs, random samples are used.</p>
      <pre>{`@mode code
@inputs A B
@outputs Out

(a, b) => [a ^ b]`}</pre>

      <h4>@mode queue</h4>
      <p>For switch I/O gates (IN/OUT with enable pin at bottom).
      The test runner ticks the circuit continuously. Your circuit controls
      the handshake via enable pins.</p>

      <p><b>Commands:</b></p>
      <p>
        <code>write &lt;label&gt; &lt;value&gt;</code> — queues a value on a switch input gate.
        The value appears on the gate's output when your circuit asserts enable=1.
        After one tick with enable=1, the value is consumed and output returns to null.<br/>
        <code>read &lt;label&gt; &lt;value&gt;</code> — waits for your circuit to assert enable=1
        on a switch output gate, then checks the data value.
      </p>

      <pre>{`@mode queue

@case write and read back
write D 42
read Q 42

@case multiple values
write D 10
write D 20
read Q 10
read Q 20`}</pre>

      <p><b>How it executes:</b></p>
      <p>
        The test runner ticks the circuit repeatedly. On each tick, it checks
        which switch gates have enable=1 and tries to satisfy pending commands.
        Multiple commands can be satisfied in a single tick if the circuit
        asserts enable on multiple gates simultaneously.
      </p>

      <p><b>Edge cases:</b></p>
      <p>
        If your circuit asserts enable on an input gate with no queued value,
        the gate outputs null (high-Z) — this is not an error.<br/>
        If a read command gets the wrong value, the test fails immediately.<br/>
        Use <code>@case</code> to group related write/read sequences.
      </p>

      <h4>Syntax</h4>
      <p>Numbers: <code>42</code> decimal, <code>0xFF</code> hex, <code>0b101</code> binary.<br/>
      Comments: <code># text</code><br/>
      Labels are case-sensitive and must match gate labels exactly.</p>
    </div>
  );
}
