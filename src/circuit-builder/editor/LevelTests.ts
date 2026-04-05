import type { Editor } from './Editor.ts';
import type { GateId } from './types.ts';
import type { Level, TestResult } from '../levels/levelTypes.ts';
import { isInputGate, isOutputGate } from '../simulation/gateTypes.ts';

export class LevelTests {
  readonly level: Level;
  private editor: Editor;
  private inputMap: Map<string, GateId>;
  private outputMap: Map<string, GateId>;
  private runAllInterval: ReturnType<typeof setInterval> | null = null;

  caseIndex = -1;
  results: TestResult[] = [];

  constructor(editor: Editor, level: Level) {
    this.editor = editor;
    this.level = level;
    this.inputMap = buildLabelMap(editor, 'input');
    this.outputMap = buildLabelMap(editor, 'output');
    this.applyInputs(0);
  }

  get caseCount(): number {
    return this.level.test.cases?.length ?? 0;
  }

  /** Re-tick with current test case inputs (no delay reset). */
  retick(): void {
    const index = Math.max(0, this.caseIndex);
    this.editor.applyInputs(this.buildInputs(index), false);
  }

  /** Apply inputs from a test case without evaluating outputs. */
  applyInputs(index: number, resetDelay = true): void {
    this.editor.applyInputs(this.buildInputs(index), resetDelay);
  }

  private buildInputs(index: number): Map<GateId, number> {
    const inputs = new Map<GateId, number>();
    const testCase = this.level.test.cases?.[index];
    if (!testCase) return inputs;
    for (const [name, gateId] of this.inputMap) {
      if (name in testCase.inputs) {
        inputs.set(gateId, testCase.inputs[name]);
      }
    }
    return inputs;
  }

  /** Apply a test case by index and evaluate outputs. Returns the result. */
  runCase(index: number, resetDelay = false): TestResult {
    const testCase = this.level.test.cases?.[index];
    if (!testCase) {
      return { passed: false, caseIndex: index, message: 'Case not found' };
    }

    this.applyInputs(index, resetDelay);

    const actuals: Record<string, number | null> = {};
    const circuit = this.editor.getState().circuit;
    for (const [name, gateId] of this.outputMap) {
      actuals[name] = circuit.tickResult.outputs.get(gateId) ?? null;
    }

    let passed = true;
    const mismatches: string[] = [];
    for (const name of this.outputMap.keys()) {
      if (!(name in testCase.expected)) continue;
      if (actuals[name] !== testCase.expected[name]) {
        passed = false;
        mismatches.push(`${name}: expected ${testCase.expected[name]}, got ${actuals[name]}`);
      }
    }

    return {
      passed,
      caseIndex: index,
      actuals,
      message: passed ? 'All outputs correct' : mismatches.join('; '),
    };
  }

  /** Reset tests to initial state (no active case). */
  reset(): void {
    this.cancelRunAll();
    this.caseIndex = -1;
    this.results = [];
    this.applyInputs(0);
  }

  /** Run next test case. Returns null if already finished. */
  step(): TestResult | null {
    if (this.caseCount === 0) return null;

    // Already ran all cases
    if (this.caseIndex >= this.caseCount - 1) return null;

    const idx = this.caseIndex + 1;
    this.caseIndex = idx;
    const result = this.runCase(idx, idx === 0);
    this.results[idx] = result;
    return result;
  }

  /** Run all cases with animated stepping. Stops on first failure. */
  runAllAnimated(onStep: () => void, onComplete: () => void): void {
    this.cancelRunAll();
    if (this.caseCount === 0) return;

    // Reset to beginning
    this.caseIndex = -1;
    this.results = [];
    let stopping = false;

    this.runAllInterval = setInterval(() => {
      if (stopping) {
        this.cancelRunAll();
        if (this.allPassed()) onComplete();
        return;
      }

      const result = this.step();
      onStep();

      if (!result || !result.passed || this.caseIndex >= this.caseCount - 1) {
        stopping = true;
      }
    }, 120);
  }

  /** Rebuild label→gateId maps after circuit reset. */
  rebuild(): void {
    this.inputMap = buildLabelMap(this.editor, 'input');
    this.outputMap = buildLabelMap(this.editor, 'output');
    this.reset();
  }

  cancelRunAll(): void {
    if (this.runAllInterval !== null) {
      clearInterval(this.runAllInterval);
      this.runAllInterval = null;
    }
  }

  allPassed(): boolean {
    return this.results.length === this.caseCount && this.results.every(r => r.passed);
  }

  /** Whether all cases have been stepped through. */
  get finished(): boolean {
    return this.caseCount > 0 && this.caseIndex >= this.caseCount - 1;
  }
}

function buildLabelMap(editor: Editor, type: 'input' | 'output'): Map<string, GateId> {
  const check = type === 'input' ? isInputGate : isOutputGate;
  const map = new Map<string, GateId>();
  for (const [id, gate] of editor.getState().circuit.gates) {
    if (check(gate.type) && gate.label) {
      map.set(gate.label, id);
    }
  }
  return map;
}
