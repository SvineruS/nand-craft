import type { Editor } from '../editor/Editor.ts';
import type { CaseBoundary } from '../editor/QueueTestRunner.ts';
import type { Circuit } from '../simulation/circuit.ts';
import type { TestCase } from '../levels/levelTypes.ts';
import { isInputGate } from '../simulation/gateTypes.ts';
import { getPinBitWidth } from '../editor/gates.ts';
import { convertToTestCases, parseDsl, type ParseResult } from './dslParser.ts';
import { compileTestFunction, enumerateInputs } from './codeSandbox.ts';

/**
 * Turning a `.test` document into the editor's test definition.
 *
 * One path for both the Apply button and the restore that happens when a level or a component is
 * reopened — what is stored is the text that was applied, so re-applying it *is* loading it, and
 * a mode, a case list and a set of labels never have to be persisted separately from the source
 * they came from.
 */

/** What applying did, for the test editor's status line. */
export interface ApplyTestsResult {
  ok: boolean;
  message: string;
}

export function applyTestSource(editor: Editor, source: string): ApplyTestsResult {
  const parsed = parseDsl(source);
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    return { ok: false, message: `Line ${first.line}: ${first.message}` };
  }

  return parsed.mode === 'queue'
    ? applyQueue(editor, source, parsed)
    : applyTable(editor, source, parsed);
}

// ---------------------------------------------------------------------------
// The two engines
// ---------------------------------------------------------------------------

function applyQueue(editor: Editor, source: string, parsed: ParseResult): ApplyTestsResult {
  const commands = parsed.cases.flatMap(c => c.commands);

  // Where each @case begins, for grouping the log.
  const boundaries: CaseBoundary[] = [];
  let index = 0;
  for (const testCase of parsed.cases) {
    if (testCase.commands.length > 0) boundaries.push({ index, name: testCase.description });
    index += testCase.commands.length;
  }

  // Clear the old table definition, or the test panel's summary keeps counting cases that are
  // no longer in force.
  editor.tests.suite = { cases: [], inputNames: [], outputNames: [] };
  editor.tests.setQueue(commands, boundaries);
  editor.tests.source = source;
  return { ok: true, message: `Applied ${commands.length} queue commands` };
}

function applyTable(editor: Editor, source: string, parsed: ParseResult): ApplyTestsResult {
  let cases: TestCase[];
  // Code mode enumerates its cases rather than writing them out, so there is no row per case
  // for the test editor to mark; table rows map one to one.
  let caseLines: number[] | undefined;

  try {
    if (parsed.mode === 'code') {
      cases = generateCodeTestCases(parsed, editor.getCircuit());
    } else {
      cases = convertToTestCases(parsed);
      caseLines = parsed.cases.map(c => c.line);
    }
  } catch (e) {
    return { ok: false, message: `Could not generate cases: ${(e as Error).message}` };
  }

  const { inputNames, outputNames } = labelsOf(parsed, cases);
  editor.tests.setSuite({ cases, inputNames, outputNames, caseLines });
  editor.tests.source = source;
  return { ok: true, message: `Applied ${cases.length} test cases` };
}

/**
 * Column names for the truth table: the declared ones when the document declares them, or
 * whatever the generated cases turned out to mention.
 */
function labelsOf(
  parsed: ParseResult, cases: TestCase[],
): { inputNames: string[]; outputNames: string[] } {
  if (parsed.inputLabels && parsed.outputLabels) {
    return { inputNames: parsed.inputLabels, outputNames: parsed.outputLabels };
  }

  const inputs = new Set<string>();
  const outputs = new Set<string>();
  for (const testCase of cases) {
    for (const name of Object.keys(testCase.inputs)) inputs.add(name);
    for (const name of Object.keys(testCase.expected)) outputs.add(name);
  }
  return { inputNames: [...inputs], outputNames: [...outputs] };
}

/** Run the document's function over every input combination to get the expected outputs. */
function generateCodeTestCases(parsed: ParseResult, circuit: Circuit): TestCase[] {
  const { inputLabels, outputLabels, codeBody } = parsed;
  if (!inputLabels || !outputLabels || !codeBody) return [];

  const bitWidths = inputLabels.map(label => bitWidthOfInput(circuit, label));
  const compute = compileTestFunction(codeBody, inputLabels.length);

  return enumerateInputs(bitWidths).map(values => {
    const outputs = compute(...values);
    const inputs: Record<string, number> = {};
    const expected: Record<string, number> = {};
    inputLabels.forEach((label, i) => { inputs[label] = values[i]; });
    outputLabels.forEach((label, i) => { expected[label] = outputs[i]; });
    return { inputs, expected };
  });
}

/** How wide the input gate carrying a label is, so enumeration covers its whole range. */
function bitWidthOfInput(circuit: Circuit, label: string): number {
  for (const gate of circuit.gates.values()) {
    if (gate.label === label && isInputGate(gate.type)) {
      return getPinBitWidth(gate.type, 'output', 0);
    }
  }
  return 1;
}
