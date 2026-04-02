import type { Editor } from './Editor.ts';
import type { GateId } from './types.ts';
import type { Level, TestResult } from '../levels/levelTypes.ts';

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
  }

  get caseCount(): number {
    return this.level.test.cases?.length ?? 0;
  }

  /** Apply a test case by index. Returns the result. */
  runCase(index: number, resetDelay = false): TestResult {
    const cases = this.level.test.cases;
    if (!cases?.[index]) {
      return { passed: false, caseIndex: index, message: 'Case not found' };
    }

    const testCase = cases[index];

    const inputs = new Map<GateId, number>();
    for (const [name, gateId] of this.inputMap) {
      if (name in testCase.inputs) {
        inputs.set(gateId, testCase.inputs[name]);
      }
    }

    this.editor.applyInputs(inputs, resetDelay);

    const actuals: Record<string, number | null> = {};
    for (const [name, gateId] of this.outputMap) {
      const gate = this.editor.getState().circuit.getGate(gateId);
      actuals[name] = this.editor.getState().circuit.getPin(gate.inputPins[0]).value ?? null;
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

  /** Run the first case (index 0) with delay reset. */
  reset(): void {
    this.cancelRunAll();
    if (this.caseCount === 0) return;
    this.caseIndex = 0;
    this.results = [this.runCase(0, true)];
  }

  /** Advance to next case. Wraps around and clears results. */
  step(): TestResult | null {
    this.cancelRunAll();
    if (this.caseCount === 0) return null;
    let idx = this.caseIndex + 1;
    if (idx >= this.caseCount) {
      idx = 0;
      this.results = [];
    }
    this.caseIndex = idx;
    const result = this.runCase(idx);
    this.results[idx] = result;
    return result;
  }

  /** Run all cases with animated stepping (200ms interval). Calls onStep after each case. */
  runAllAnimated(onStep: () => void, onComplete: () => void): void {
    this.cancelRunAll();
    if (this.caseCount === 0) return;

    this.reset();
    onStep();

    if (this.caseCount <= 1) {
      if (this.allPassed()) onComplete();
      return;
    }

    this.runAllInterval = setInterval(() => {
      const result = this.step();
      if (!result) { this.cancelRunAll(); return; }
      onStep();

      if (this.caseIndex === this.caseCount - 1 || this.caseIndex === 0) {
        this.cancelRunAll();
        if (this.allPassed()) onComplete();
      }
    }, 200);
  }

  /** Rebuild label→gateId maps after circuit reset. */
  rebuild(): void {
    this.cancelRunAll();
    this.inputMap = buildLabelMap(this.editor, 'input');
    this.outputMap = buildLabelMap(this.editor, 'output');
    this.caseIndex = -1;
    this.results = [];
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


}

function buildLabelMap(editor: Editor, type: 'input' | 'output'): Map<string, GateId> {
  const map = new Map<string, GateId>();
  for (const [id, gate] of editor.getState().circuit.gates) {
    if (gate.type === type && gate.label) {
      map.set(gate.label, id);
    }
  }
  return map;
}
