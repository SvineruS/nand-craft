import { Circuit } from '../simulation/circuit.ts';
import type { GateId } from '../editor/types.ts';
import type { TestDefinition, TestResult } from "../levels/levelTypes.ts";

export function runTests(
  circuit: Circuit,
  test: TestDefinition,
  inputGateIds: GateId[],
  outputGateIds: GateId[],
  inputNames: string[],
  outputNames: string[]
): TestResult[] {
  const results: TestResult[] = [];

  if (test.cases) {
    for (let i = 0; i < test.cases.length; i++) {
      const testCase = test.cases[i];

      // Map named inputs to gate IDs
      const inputs = new Map<GateId, number>();
      for (let j = 0; j < inputNames.length; j++) {
        const name = inputNames[j];
        if (name in testCase.inputs) {
          inputs.set(inputGateIds[j], testCase.inputs[name]);
        }
      }

      // Run one tick
      circuit.tick(inputs);
      const result = circuit.tickResult;

      // Compare outputs with expected values
      let passed = true;
      const mismatches: string[] = [];
      const actuals: Record<string, number | null> = {};

      for (let j = 0; j < outputNames.length; j++) {
        const name = outputNames[j];
        const actual = result.outputs.get(outputGateIds[j]) ?? null;
        actuals[name] = actual;

        if (name in testCase.expected) {
          const expected = testCase.expected[name];
          if (actual !== expected) {
            passed = false;
            mismatches.push(`${name}: expected ${expected}, got ${actual}`);
          }
        }
      }

      const inputDesc = Object.entries(testCase.inputs)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');

      results.push({
        passed,
        caseIndex: i,
        actuals,
        message: passed
          ? `Inputs(${inputDesc}) — all outputs correct`
          : `Inputs(${inputDesc}) — ${mismatches.join('; ')}`,
      });
    }
  }

  return results;
}
