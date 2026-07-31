import type { Editor } from './Editor.ts';
import type { GateId } from './types.ts';
import type { Level, QueueCommandResult, TestCase, TestResult } from '../levels/levelTypes.ts';
import type { TestCommand } from '../testing/dslParser.ts';
import { isInputGate, isOutputGate } from '../simulation/gateTypes.ts';
import { type CaseBoundary, QueueTestRunner } from './QueueTestRunner.ts';

export type TestMode = 'table' | 'queue';

/** Table mode steps one case per interval; queue mode ticks at roughly frame rate. */
const TABLE_STEP_MS = 120;
const QUEUE_TICK_MS = 16;

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
 * Test execution for the open circuit.
 *
 * Table mode lives here: apply a case's inputs, tick, compare outputs. Queue mode — the
 * handshake-driven sequential engine — lives in QueueTestRunner, which this delegates to;
 * the two share only the label maps.
 */
export class LevelTests {
  readonly level: Level | null;
  suite: TestSuite;
  mode: TestMode = 'table';

  private editor: Editor;
  private inputMap: Map<string, GateId>;
  private outputMap: Map<string, GateId>;
  private runAllInterval: ReturnType<typeof setInterval> | null = null;
  private queue: QueueTestRunner;

  caseIndex = -1;
  results: TestResult[] = [];
  tickCount = 0;

  constructor(editor: Editor, level: Level | null) {
    this.editor = editor;
    this.level = level;
    this.suite = suiteFromLevel(level);
    this.inputMap = buildLabelMap(editor, 'input');
    this.outputMap = buildLabelMap(editor, 'output');
    this.queue = new QueueTestRunner({ inputs: this.inputMap, outputs: this.outputMap });
    this.applyInputs(0);
  }

  // --- Queue mode, delegated to QueueTestRunner ---

  get queueCommands(): TestCommand[] { return this.queue.commands; }
  get queueResults(): QueueCommandResult[] { return this.queue.results; }
  get queueCommandIndex(): number { return this.queue.commandIndex; }
  get queueDone(): boolean { return this.queue.done; }
  get queueFailed(): boolean { return this.queue.failed; }

  /** Start queue test execution with the given commands. */
  startQueue(commands: TestCommand[], caseBoundaries?: CaseBoundary[]): void {
    this.cancelRunAll();
    this.mode = 'queue';
    this.queue.start(this.editor.getCircuit(), commands, caseBoundaries);
    this.tickCount = 0;
  }

  /** Execute one tick of queue test. Returns true if done (all commands processed or failed). */
  tickQueue(): boolean {
    const done = this.queue.tick(this.editor.getCircuit());
    this.tickCount = this.queue.tickCount;
    this.editor.getState().renderDirty = true;
    return done;
  }

  /** Run queue tests with animated ticking. Calls onComplete when all pass. */
  runQueueAnimated(onTick: () => void, onComplete?: () => void): void {
    this.cancelRunAll();
    // Re-init if done or not started
    if (this.queueCommandIndex < 0 || this.queueDone || this.queueFailed) {
      this.startQueue(this.queueCommands);
    }

    this.runAllInterval = setInterval(() => {
      const done = this.tickQueue();
      onTick();
      if (done) {
        this.cancelRunAll();
        if (this.allPassed()) onComplete?.();
      }
    }, QUEUE_TICK_MS);
  }

  /**
   * Replace the test definition (used by the test editor) and restart execution against
   * the circuit's current labels.
   */
  setSuite(suite: TestSuite): void {
    this.suite = suite;
    this.mode = 'table';
    this.rebuild();
  }

  get caseCount(): number {
    return this.suite.cases.length;
  }

  /** Re-tick with current test case inputs (no delay reset). */
  retick(): void {
    const index = Math.max(0, this.caseIndex);
    this.editor.applyInputs(this.buildInputs(index), false);
  }

  /** Apply inputs from a test case without evaluating outputs. */
  applyInputs(index: number, resetDelay = true): void {
    this.editor.applyInputs(this.buildInputs(index), resetDelay);
    this.tickCount++;
  }

  private buildInputs(index: number): Map<GateId, number> {
    const inputs = new Map<GateId, number>();
    const testCase = this.suite.cases[index];
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
    const testCase = this.suite.cases[index];
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

  /** Reset test execution state, keeping test definition (cases/commands). */
  reset(): void {
    this.cancelRunAll();
    this.caseIndex = -1;
    this.results = [];
    this.queue.reset();

    this.applyInputs(0);
    this.tickCount = 0; // Reset after applyInputs (which increments it)
  }

  /** Run next test case. Returns null if already finished. */
  step(): TestResult | null {
    if (this.caseCount === 0) return null;
    if (this.caseIndex >= this.caseCount - 1) return null;

    const idx = this.caseIndex + 1;
    this.caseIndex = idx;
    const result = this.runCase(idx, idx === 0);
    this.results[idx] = result;
    return result;
  }

  /** Run all cases with animated stepping. Stops on first failure. Resumes if paused. */
  runAllAnimated(onStep: () => void, onComplete: () => void): void {
    this.cancelRunAll();
    if (this.caseCount === 0) return;

    // Only reset if starting fresh (not resuming from pause)
    const resuming = this.caseIndex >= 0 && !this.finished;
    if (!resuming) {
      this.caseIndex = -1;
      this.results = [];
      this.tickCount = 0;
    }
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
    }, TABLE_STEP_MS);
  }

  // ---------------------------------------------------------------------------
  // Common
  // ---------------------------------------------------------------------------

  /** Rebuild label→gateId maps after circuit reset. */
  rebuild(): void {
    this.inputMap = buildLabelMap(this.editor, 'input');
    this.outputMap = buildLabelMap(this.editor, 'output');
    this.queue.setLabels({ inputs: this.inputMap, outputs: this.outputMap });
    this.reset();
  }

  get running(): boolean {
    return this.runAllInterval !== null;
  }

  cancelRunAll(): void {
    if (this.runAllInterval !== null) {
      clearInterval(this.runAllInterval);
      this.runAllInterval = null;
    }
  }

  allPassed(): boolean {
    if (this.mode === 'queue') {
      return this.queueDone && !this.queueFailed;
    }
    return this.results.length === this.caseCount && this.results.every(r => r.passed);
  }

  /** Whether all cases have been stepped through. */
  get finished(): boolean {
    if (this.mode === 'queue') return this.queueDone;
    return this.caseCount > 0 && this.caseIndex >= this.caseCount - 1;
  }
}

function suiteFromLevel(level: Level | null): TestSuite {
  return {
    cases: level?.test.cases ? [...level.test.cases] : [],
    inputNames: level?.inputs.map(i => i.name) ?? [],
    outputNames: level?.outputs.map(o => o.name) ?? [],
  };
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
