import type { Circuit, TestDefinition, TestResult, GateId } from '../types.ts';
import { SimulationEngine } from '../simulation/engine.ts';

export function runTests(
  circuit: Circuit,
  test: TestDefinition,
  inputGateIds: GateId[],
  outputGateIds: GateId[],
  inputNames: string[],
  outputNames: string[]
): TestResult[] {
  const engine = new SimulationEngine();
  const results: TestResult[] = [];

  if (test.mode === 'combinational' && test.cases) {
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
      const outputs = engine.tick(circuit, inputs);

      // Compare outputs with expected values
      let passed = true;
      const mismatches: string[] = [];

      for (let j = 0; j < outputNames.length; j++) {
        const name = outputNames[j];
        if (!(name in testCase.expected)) continue;

        const actual = outputs.get(outputGateIds[j]) ?? null;
        const expected = testCase.expected[name];

        if (actual !== expected) {
          passed = false;
          mismatches.push(`${name}: expected ${expected}, got ${actual}`);
        }
      }

      const inputDesc = Object.entries(testCase.inputs)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');

      results.push({
        passed,
        caseIndex: i,
        message: passed
          ? `Inputs(${inputDesc}) — all outputs correct`
          : `Inputs(${inputDesc}) — ${mismatches.join('; ')}`,
      });
    }
  }

  if (test.mode === 'sequential' && test.steps) {
    const MAX_TICKS = 1000;
    const currentInputs = new Map<GateId, number>();
    let tickCount = 0;
    let stepIndex = 0;

    for (const step of test.steps) {
      const stepsToProcess = Array.isArray(step) ? step : [step];

      // Separate writes and reads
      const writes = stepsToProcess.filter(
        (s): s is Extract<typeof s, { type: 'write' }> => s.type === 'write'
      );
      const reads = stepsToProcess.filter(
        (s): s is Extract<typeof s, { type: 'read' }> => s.type === 'read'
      );

      // Apply all writes
      for (const w of writes) {
        const idx = inputNames.indexOf(w.pin);
        if (idx !== -1) {
          currentInputs.set(inputGateIds[idx], w.value);
        }
      }

      // Tick once after writes
      if (writes.length > 0) {
        engine.tick(circuit, currentInputs);
        tickCount++;
      }

      // Process reads: tick until output matches or max ticks
      for (const r of reads) {
        const outputIdx = outputNames.indexOf(r.pin);
        if (outputIdx === -1) {
          results.push({
            passed: false,
            caseIndex: stepIndex,
            message: `Unknown output pin: ${r.pin}`,
          });
          stepIndex++;
          continue;
        }

        let matched = false;
        let actual: number | null = null;

        // Check current outputs first, then tick up to MAX_TICKS
        for (let t = 0; t < MAX_TICKS && !matched; t++) {
          const outputs = engine.tick(circuit, currentInputs);
          tickCount++;
          actual = outputs.get(outputGateIds[outputIdx]) ?? null;
          if (actual === r.expected) {
            matched = true;
          }
        }

        results.push({
          passed: matched,
          caseIndex: stepIndex,
          message: matched
            ? `${r.pin} = ${r.expected} (after ${tickCount} ticks)`
            : `${r.pin}: expected ${r.expected}, got ${actual} (after ${tickCount} ticks)`,
        });
        stepIndex++;
      }
    }
  }

  return results;
}
