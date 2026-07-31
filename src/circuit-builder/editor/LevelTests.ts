import type { Editor } from './Editor.ts';
import type { GateId } from './types.ts';
import type { Level, QueueCommandResult, TestResult } from '../levels/levelTypes.ts';
import type { TestCommand } from '../testing/dslParser.ts';
import { isInputGate, isOutputGate, isSequentialGate } from '../simulation/gateTypes.ts';

export type TestMode = 'table' | 'queue';

export class LevelTests {
  readonly level: Level;
  private editor: Editor;
  private inputMap: Map<string, GateId>;
  private outputMap: Map<string, GateId>;
  private runAllInterval: ReturnType<typeof setInterval> | null = null;

  caseIndex = -1;
  results: TestResult[] = [];
  tickCount = 0;

  // Queue mode state
  mode: TestMode = 'table';
  queueCommands: TestCommand[] = [];
  queueResults: QueueCommandResult[] = [];
  queueCommandIndex = -1;
  private inputQueues = new Map<GateId, number[]>();

  constructor(editor: Editor, level: Level) {
    this.editor = editor;
    this.level = level;
    this.inputMap = buildLabelMap(editor, 'input');
    this.outputMap = buildLabelMap(editor, 'output');
    this.applyInputs(0);
  }

  get caseCount(): number {
    return this.level?.test.cases?.length ?? 0;
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
    this.tickCount = 0;
    // Reset queue execution state but keep queueCommands and boundaries
    const boundaryMap = new Map(this.caseBoundaries.map(b => [b.index, b.name]));
    this.queueResults = this.queueCommands.map((cmd, i) => ({
      type: cmd.type as 'write' | 'read',
      label: cmd.label,
      expected: cmd.value,
      status: 'pending' as const,
      caseStart: boundaryMap.has(i),
      caseName: boundaryMap.get(i),
    }));
    this.queueCommandIndex = -1;
    this.inputQueues.clear();

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
    }, 120);
  }

  // ---------------------------------------------------------------------------
  // Queue mode
  // ---------------------------------------------------------------------------

  private caseBoundaries: { index: number; name?: string }[] = [];

  /** Start queue test execution with the given commands. */
  startQueue(commands: TestCommand[], caseBoundaries?: { index: number; name?: string }[]): void {
    this.cancelRunAll();
    this.mode = 'queue';
    this.queueCommands = commands;
    // Only update boundaries if explicitly provided, otherwise keep existing
    if (caseBoundaries !== undefined) this.caseBoundaries = caseBoundaries;

    const boundaryMap = new Map(this.caseBoundaries.map(b => [b.index, b.name]));
    this.queueResults = commands.map((cmd, i) => ({
      type: cmd.type as 'write' | 'read',
      label: cmd.label,
      expected: cmd.value,
      status: 'pending' as const,
      caseStart: boundaryMap.has(i),
      caseName: boundaryMap.get(i),
    }));
    this.queueCommandIndex = 0;
    this.tickCount = 0;
    this.inputQueues.clear();


    // Pre-queue all write values
    for (const cmd of commands) {
      if (cmd.type === 'write') {
        const gateId = this.inputMap.get(cmd.label);
        if (!gateId) continue;
        if (!this.inputQueues.has(gateId)) this.inputQueues.set(gateId, []);
        this.inputQueues.get(gateId)!.push(cmd.value);
      }
    }

    // Reset only sequential gate state, not constants
    for (const gate of this.editor.getState().circuit.gates.values()) {
      if (isSequentialGate(gate.type)) gate.state = undefined;
    }

    if (this.queueCommandIndex < this.queueResults.length) {
      this.queueResults[this.queueCommandIndex].status = 'running';
    }
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
    }, 16); // ~60fps for smooth animation
  }

  /** Execute one tick of queue test. Returns true if done (all commands processed or failed). */
  /** Execute one tick of queue test. Returns true if done (all commands processed or failed). */
  tickQueue(): boolean {
    if (this.queueCommandIndex < 0 || this.queueCommandIndex >= this.queueCommands.length) {
      return true;
    }

    const circuit = this.editor.getState().circuit;

    // Build inputs: only output value when it's at the front of the queue.
    const inputs = new Map<GateId, number>();
    for (const [gateId, queue] of this.inputQueues) {
      if (queue.length > 0) {
        inputs.set(gateId, queue[0]);
      }
    }

    // Tick the circuit
    circuit.tick(inputs);
    this.tickCount++;
    this.editor.getState().renderDirty = true;

    // Collect which gates have enable asserted this tick
    const activeInputs = new Set<string>();  // labels of input-sw gates with enable=1
    const activeOutputs = new Set<string>(); // labels of output-sw gates with enable=1
    for (const [label, gateId] of this.inputMap) {
      const gate = circuit.gates.get(gateId);
      if (!gate || !gate.type.endsWith('-sw')) continue;
      const enable = circuit.getPinValue(gateId, 'input', 0) ?? 0;
      if (enable) activeInputs.add(label);
    }
    for (const [label, gateId] of this.outputMap) {
      const gate = circuit.gates.get(gateId);
      if (!gate || !gate.type.endsWith('-sw')) continue;
      const enable = circuit.getPinValue(gateId, 'input', 1) ?? 0;
      if (enable) activeOutputs.add(label);
    }

    // Try to satisfy as many consecutive pending commands as possible in this tick
    const satisfiedInputs = new Set<string>();
    const satisfiedOutputs = new Set<string>();
    let advanced = false;

    while (this.queueCommandIndex < this.queueCommands.length) {
      const cmd = this.queueCommands[this.queueCommandIndex];

      if (cmd.type === 'write') {
        const gateId = this.inputMap.get(cmd.label);
        if (!gateId) {
          this.queueResults[this.queueCommandIndex].status = 'failed';
          this.queueResults[this.queueCommandIndex].error = `No input gate "${cmd.label}"`;
          return true;
        }
        if (!activeInputs.has(cmd.label)) break; // Not ready yet
        if (satisfiedInputs.has(cmd.label)) break; // Already consumed this gate this tick

        // Value consumed — dequeue
        const queue = this.inputQueues.get(gateId);
        if (queue && queue.length > 0) queue.shift();
        satisfiedInputs.add(cmd.label);
        this.queueResults[this.queueCommandIndex].status = 'passed';

      } else if (cmd.type === 'read') {
        const gateId = this.outputMap.get(cmd.label);
        if (!gateId) {
          this.queueResults[this.queueCommandIndex].status = 'failed';
          this.queueResults[this.queueCommandIndex].error = `No output gate "${cmd.label}"`;
          return true;
        }
        if (!activeOutputs.has(cmd.label)) break; // Not ready yet
        if (satisfiedOutputs.has(cmd.label)) break; // Already read this gate this tick

        const actual = circuit.tickResult.outputs.get(gateId) ?? null;
        this.queueResults[this.queueCommandIndex].actual = actual;
        if (actual !== cmd.value) {
          this.queueResults[this.queueCommandIndex].status = 'failed';
          this.queueResults[this.queueCommandIndex].error = `expected ${cmd.value}, got ${actual ?? 'null'}`;
          return true;
        }
        satisfiedOutputs.add(cmd.label);
        this.queueResults[this.queueCommandIndex].status = 'passed';
      }

      this.queueCommandIndex++;
      advanced = true;

      // Mark next command as running
      if (this.queueCommandIndex < this.queueResults.length) {
        this.queueResults[this.queueCommandIndex].status = 'running';
      }
    }

    // Check if all done
    if (this.queueCommandIndex >= this.queueCommands.length) return true;

    // If nothing advanced, mark current as running
    if (!advanced && this.queueResults[this.queueCommandIndex].status === 'pending') {
      this.queueResults[this.queueCommandIndex].status = 'running';
    }

    return false;
  }

  get queueDone(): boolean {
    return this.queueCommandIndex >= this.queueCommands.length;
  }

  get queueFailed(): boolean {
    return this.queueResults.some(r => r.status === 'failed');
  }

  // ---------------------------------------------------------------------------
  // Common
  // ---------------------------------------------------------------------------

  /** Rebuild label→gateId maps after circuit reset. */
  rebuild(): void {
    this.inputMap = buildLabelMap(this.editor, 'input');
    this.outputMap = buildLabelMap(this.editor, 'output');
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
