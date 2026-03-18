import type { Circuit, Level, TestResult, GateId } from '../types.ts';
import { runTests } from '../testing/interpreter.ts';

export function runLevel(circuit: Circuit, level: Level): TestResult[] {
  // Find input and output gates in the circuit by type, matched by order
  const inputGates: GateId[] = [];
  const outputGates: GateId[] = [];

  for (const [id, gate] of circuit.gates) {
    if (gate.type === 'input') inputGates.push(id);
    if (gate.type === 'output') outputGates.push(id);
  }

  return runTests(
    circuit,
    level.test,
    inputGates,
    outputGates,
    level.inputs.map((i) => i.name),
    level.outputs.map((o) => o.name)
  );
}

export function formatResults(results: TestResult[], level: Level): string {
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  let text = `${level.name}: ${passed}/${total} tests passed\n\n`;
  for (const r of results) {
    text += `${r.passed ? '\u2713' : '\u2717'} Case ${r.caseIndex + 1}: ${r.message}\n`;
  }
  return text;
}
