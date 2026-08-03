import type { Editor } from './Editor.ts';
import type { GateId } from './types.ts';
import type { TestCase, TestResult } from '../levels/levelTypes.ts';
import type { TestRunner } from './testRunner.ts';

/** A step every 120ms: slow enough to read a row light up, fast enough not to feel stalled. */
const TABLE_STEP_MS = 120;

/**
 * The test definition currently in force: the level's cases, or whatever the test editor
 * last applied.
 *
 * This used to be read and written straight through `editor.level.test.cases`, which meant
 * the test editor mutated the imported level definition — a module-level object shared by
 * every editor for the rest of the session, including the level-less component editor.
 */
export interface TestSuite {
  cases: TestCase[];
  inputNames: string[];
  outputNames: string[];
}

/**
 * Truth-table testing: apply a case's inputs, tick, compare the outputs.
 *
 * Split out of LevelTests so it and QueueTestRunner are the same kind of thing — two
 * TestRunners, picked once by mode — rather than one class holding a table engine plus five
 * getters forwarding to the other engine.
 */
export class TableTestRunner implements TestRunner {
  readonly stepIntervalMs = TABLE_STEP_MS;

  /** Index of the case last run; -1 before the first step. */
  caseIndex = -1;
  results: TestResult[] = [];
  tickCount = 0;

  private editor: Editor;
  private getSuite: () => TestSuite;
  private inputs: ReadonlyMap<string, GateId>;
  private outputs: ReadonlyMap<string, GateId>;

  constructor(
    editor: Editor,
    getSuite: () => TestSuite,
    labels: { inputs: ReadonlyMap<string, GateId>; outputs: ReadonlyMap<string, GateId> },
  ) {
    this.editor = editor;
    this.getSuite = getSuite;
    this.inputs = labels.inputs;
    this.outputs = labels.outputs;
  }

  /** Point the runner at freshly built label maps (after a circuit edit). */
  setLabels(labels: { inputs: ReadonlyMap<string, GateId>; outputs: ReadonlyMap<string, GateId> }): void {
    this.inputs = labels.inputs;
    this.outputs = labels.outputs;
  }

  get caseCount(): number {
    return this.getSuite().cases.length;
  }

  /** Whether every case has been stepped through. */
  get finished(): boolean {
    return this.caseCount > 0 && this.caseIndex >= this.caseCount - 1;
  }

  get canResume(): boolean {
    return this.caseIndex >= 0 && !this.finished;
  }

  get allPassed(): boolean {
    return this.results.length === this.caseCount && this.results.every(r => r.passed);
  }

  step(): boolean {
    if (this.caseCount === 0) return false;
    if (this.finished) return false;

    const index = this.caseIndex + 1;
    this.caseIndex = index;
    // Only the first case resets stored state: a run is one pass down the table, and a
    // sequential circuit's later rows may depend on what the earlier ones latched.
    const result = this.runCase(index, index === 0);
    this.results[index] = result;
    // A failure stops the run where it happened, so the offending row stays on screen.
    return result.passed && !this.finished;
  }

  restart(): void {
    this.caseIndex = -1;
    this.results = [];
    this.tickCount = 0;
  }

  reset(): void {
    this.restart();
    this.applyInputs(0);
    this.tickCount = 0; // applyInputs increments it
  }

  retick(): void {
    this.applyInputs(Math.max(0, this.caseIndex), false);
  }

  /** Apply a case's inputs and tick, without evaluating outputs. */
  applyInputs(index: number, resetDelay = true): void {
    this.editor.applyInputs(this.buildInputs(index), resetDelay);
    this.tickCount++;
  }

  /** Apply a case by index and evaluate its outputs. */
  runCase(index: number, resetDelay = false): TestResult {
    const testCase = this.getSuite().cases[index];
    if (!testCase) {
      return { passed: false, caseIndex: index, message: 'Case not found' };
    }

    this.applyInputs(index, resetDelay);

    const actuals: Record<string, number | null> = {};
    const { circuit } = this.editor.getState();
    for (const [name, gateId] of this.outputs) {
      actuals[name] = circuit.tickResult.outputs.get(gateId) ?? null;
    }

    let passed = true;
    const mismatches: string[] = [];
    for (const [name, expected] of Object.entries(testCase.expected)) {
      const actual = actuals[name] ?? null;
      if (actual !== expected) {
        passed = false;
        mismatches.push(`${name}: expected ${expected ?? 'null'}, got ${actual ?? 'null'}`);
      }
    }

    return {
      passed,
      caseIndex: index,
      actuals,
      message: passed ? 'All outputs correct' : mismatches.join('; '),
    };
  }

  private buildInputs(index: number): Map<GateId, number> {
    const inputs = new Map<GateId, number>();
    const testCase = this.getSuite().cases[index];
    if (!testCase) return inputs;
    for (const [name, gateId] of this.inputs) {
      if (name in testCase.inputs) inputs.set(gateId, testCase.inputs[name]);
    }
    return inputs;
  }
}
