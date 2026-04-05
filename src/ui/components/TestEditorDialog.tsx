import { useEffect, useRef, useState } from 'preact/hooks';
import { testEditorVisible } from '../editorStore.ts';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { linter, type Diagnostic } from '@codemirror/lint';
import { dslLanguage } from '../../circuit-builder/testing/dslHighlight.ts';
import { parseDsl, convertToTestCases } from '../../circuit-builder/testing/dslParser.ts';
import { compileTestFunction, enumerateInputs } from '../../circuit-builder/testing/codeSandbox.ts';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { getEditor } from '../../circuit-builder/editorInstance.ts';
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

function collectGateLabels(): { inputs: Set<string>; outputs: Set<string> } {
  const inputs = new Set<string>();
  const outputs = new Set<string>();
  for (const gate of getEditor().getState().circuit.gates.values()) {
    if (!gate.label) continue;
    if (isInputGate(gate.type)) inputs.add(gate.label);
    if (isOutputGate(gate.type)) outputs.add(gate.label);
  }
  return { inputs, outputs };
}

const dslHighlightStyle = HighlightStyle.define([
  { tag: tags.meta, color: '#e5c07b' },
  { tag: tags.labelName, color: '#7f8c8d' },
  { tag: tags.keyword, color: '#c678dd' },
  { tag: tags.number, color: '#d19a66' },
  { tag: tags.comment, color: '#5c6370', fontStyle: 'italic' },
  { tag: tags.variableName, color: '#61afef' },
  { tag: tags.punctuation, color: '#888' },
]);

const dslLinter = linter((view) => {
  const doc = view.state.doc;
  const { mode, cases, errors, inputLabels, outputLabels } = parseDsl(doc.toString());
  const diagnostics: Diagnostic[] = [];

  for (const err of errors) {
    const line = doc.line(err.line);
    diagnostics.push({ from: line.from, to: line.to, severity: 'error', message: err.message });
  }

  const labels = collectGateLabels();
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

  // Per-command label check (only for basic/queue — table/code already checked via @inputs/@outputs)
  if (mode === 'basic' || mode === 'queue') {
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
  const visible = testEditorVisible.value;
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [showHelp, setShowHelp] = useState(false);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    if (!visible || !containerRef.current) return;

    const state = EditorState.create({
      doc: viewRef.current?.state.doc.toString() ?? PLACEHOLDER,
      extensions: [
        dslLanguage,
        syntaxHighlighting(dslHighlightStyle),
        dslLinter,
        EditorView.theme({
          '&': { height: '100%', fontSize: '13px' },
          '.cm-content': { fontFamily: 'monospace', padding: '8px 0' },
          '.cm-gutters': { display: 'none' },
          '.cm-scroller': { overflow: 'auto' },
          '.cm-focused': { outline: 'none' },
        }),
        EditorView.theme({
          '&': { backgroundColor: 'var(--bg)' },
          '.cm-content': { color: 'var(--text)', caretColor: 'var(--text)' },
          '.cm-cursor': { borderLeftColor: 'var(--text)' },
          '.cm-selectionBackground': { backgroundColor: 'rgba(100, 150, 255, 0.2) !important' },
          '.cm-activeLine': { backgroundColor: 'rgba(255, 255, 255, 0.03)' },
          '.cm-tooltip': { backgroundColor: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' },
          '.cm-tooltip-lint': { backgroundColor: 'var(--surface)' },
          '.cm-lint-marker-error': { content: '"!"' },
          '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy #ef4444' },
        }),
        history(),
        keymap.of([
          { key: 'Escape', run: () => { testEditorVisible.value = false; return true; } },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    view.focus();

    return () => view.destroy();
  }, [visible]);

  if (!visible) return null;

  const handleApply = () => {
    const doc = viewRef.current?.state.doc.toString();
    if (!doc) return;

    const result = parseDsl(doc);
    if (result.errors.length > 0) return;
    if (result.mode === 'queue') return; // skip queue for now

    let cases: TestCase[];
    try {
      if (result.mode === 'code') {
        cases = generateCodeTestCases(result);
      } else {
        cases = convertToTestCases(result);
      }
    } catch (e) {
      console.error('Failed to generate test cases:', e);
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

    const editor = getEditor();
    editor.level.inputs = inputNames.map(name => ({ name }));
    editor.level.outputs = outputNames.map(name => ({ name }));
    editor.level.test.cases = cases;
    editor.tests.rebuild();
    notifyStateChange();
  };

  const handleHeaderMouseDown = (e: MouseEvent) => {
    // Don't drag when clicking buttons
    if ((e.target as HTMLElement).closest('button')) return;
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };

    const handleMouseMove = (e: MouseEvent) => {
      const ds = dragState.current;
      if (!ds || !card) return;
      const dx = e.clientX - ds.startX;
      const dy = e.clientY - ds.startY;
      card.style.left = `${ds.origX + dx}px`;
      card.style.top = `${ds.origY + dy}px`;
    };
    const handleMouseUp = () => {
      dragState.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div class="test-editor-card" ref={cardRef}>
      <div class="test-editor-header" onMouseDown={handleHeaderMouseDown}>
        <span class="test-editor-title">Test Editor</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button class="test-editor-apply" onClick={handleApply}>Apply</button>
          <button class="test-editor-close" onClick={() => setShowHelp(!showHelp)}>?</button>
          <button class="test-editor-close" onClick={() => { testEditorVisible.value = false; }}>✕</button>
        </div>
      </div>
      <div class="test-editor-body" ref={containerRef} style={{ display: showHelp ? 'none' : '' }} />
      {showHelp && <HelpPanel />}
    </div>
  );
}

function generateCodeTestCases(result: ReturnType<typeof parseDsl>): TestCase[] {
  const { inputLabels, outputLabels, codeBody } = result;
  if (!inputLabels || !outputLabels || !codeBody) return [];

  // Get bit widths from circuit
  const editor = getEditor();
  const circuit = editor.getState().circuit;
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
    <div class="test-editor-help">
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

      <h4>@mode basic</h4>
      <p>Explicit commands per test case. Use <code>@case</code> to separate cases.</p>
      <pre>{`@mode basic

@case both zero
set A 0
set B 0
expect Out 0

@case one high
set A 1
set B 0
expect Out 1`}</pre>

      <h4>@mode code</h4>
      <p>JS function that computes expected outputs. Inputs are auto-enumerated.
      Only <code>Math</code> is accessible. For wide inputs, random samples are used.</p>
      <pre>{`@mode code
@inputs A B
@outputs Out

(a, b) => [a ^ b]`}</pre>

      <h4>@mode queue</h4>
      <p>For switch I/O gates with enable pins. The circuit controls when to
      read/write via the enable signal.</p>
      <pre>{`@mode queue

@case
write D 42
read Q 42`}</pre>

      <h4>Syntax</h4>
      <p>Numbers: <code>42</code> decimal, <code>0xFF</code> hex, <code>0b101</code> binary.<br/>
      Comments: <code># text</code><br/>
      Labels are case-sensitive and must match gate labels exactly.</p>
    </div>
  );
}
