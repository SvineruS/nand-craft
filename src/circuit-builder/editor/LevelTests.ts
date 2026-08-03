import type { Editor } from './Editor.ts';
import type { GateId } from './types.ts';
import type { Level } from '../levels/levelTypes.ts';
import type { TestCommand } from '../testing/dslParser.ts';
import { isInputGate, isOutputGate } from '../simulation/gateTypes.ts';
import { type CaseBoundary, QueueTestRunner } from './QueueTestRunner.ts';
import { TableTestRunner, type TestSuite } from './TableTestRunner.ts';
import type { TestRunner } from './testRunner.ts';

export type { TestSuite };

export type TestMode = 'table' | 'queue';

/**
 * Test execution for the open circuit: which mode is in force, the label maps both engines
 * need, and the one animated loop that drives whichever engine that is.
 *
 * The engines themselves are TableTestRunner and QueueTestRunner. Everything that used to
 * branch on `mode` — step, allPassed, finished, and two near-identical setInterval loops —
 * now goes through `this.runner`, chosen once.
 */
export class LevelTests {
  readonly level: Level | null;
  readonly table: TableTestRunner;
  readonly queue: QueueTestRunner;

  suite: TestSuite;
  mode: TestMode = 'table';

  /**
   * The `.test` document the player last applied, or null while the level's own cases are what
   * is in force. Persisted with the circuit — beside it for a level, inside the definition for a
   * component — so reopening does not mean applying again. See `applyTestSource`.
   */
  source: string | null = null;

  private editor: Editor;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(editor: Editor, level: Level | null) {
    this.editor = editor;
    this.level = level;
    this.suite = suiteFromLevel(level);

    const labels = this.buildLabels();
    this.table = new TableTestRunner(editor, () => this.suite, labels);
    this.queue = new QueueTestRunner(() => editor.getCircuit(), labels);
    this.table.applyInputs(0);
  }

  /** The engine for the current mode. Everything below drives this, not a mode branch. */
  get runner(): TestRunner {
    return this.mode === 'queue' ? this.queue : this.table;
  }

  // ---------------------------------------------------------------------------
  // Controls — the four buttons, and what the frame loop needs
  // ---------------------------------------------------------------------------

  /** Advance one unit, starting a fresh run first if there is nothing to resume. */
  step(): void {
    this.cancelRunAll();
    if (!this.runner.canResume) this.runner.restart();
    this.runner.step();
    this.editor.getState().renderDirty = true;
  }

  /**
   * Step on a timer until the run ends. Resumes a paused run rather than restarting it, so
   * Pause and then Run All continues from the same row.
   *
   * `onFinished` is told whether the run ended green, because both endings are worth reacting
   * to — one unlocks a level, and either one is worth a sound.
   */
  runAnimated(onStep: () => void, onFinished?: (passed: boolean) => void): void {
    this.cancelRunAll();
    const runner = this.runner;
    if (!runner.canResume) runner.restart();

    this.interval = setInterval(() => {
      const keepGoing = runner.step();
      this.editor.getState().renderDirty = true;
      onStep();
      if (!keepGoing) {
        this.cancelRunAll();
        onFinished?.(runner.allPassed);
      }
    }, runner.stepIntervalMs);
  }

  /** Reset execution state, keeping the test definition (cases / commands). */
  reset(): void {
    this.cancelRunAll();
    // Both engines are reset, not just the active one: switching mode must not surface the
    // other engine's leftover results.
    this.table.reset();
    this.queue.reset();
  }

  cancelRunAll(): void {
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  get running(): boolean {
    return this.interval !== null;
  }

  get tickCount(): number {
    return this.runner.tickCount;
  }

  /** Line of the test file the run is on, for the test editor's marked line. */
  get sourceLine(): number | null {
    return this.runner.sourceLine;
  }

  allPassed(): boolean {
    return this.runner.allPassed;
  }

  /** Whether the run stopped on a failure — the other way a run can be over. */
  get failed(): boolean {
    return this.runner.failed;
  }

  /** Re-apply the current position after a value-only edit. */
  retick(): void {
    this.runner.retick();
  }

  // ---------------------------------------------------------------------------
  // Test definition
  // ---------------------------------------------------------------------------

  /** Replace the table definition (used by the test editor) and restart execution. */
  setSuite(suite: TestSuite): void {
    this.suite = suite;
    this.mode = 'table';
    this.rebuild();
  }

  /**
   * Switch to queue mode with the given commands, without running them.
   *
   * Not started here: the first Step or Run All restarts a run that cannot be resumed anyway, and
   * starting clears every gate's stored state — which, done at apply or load time, would wipe a
   * chip's live bytes before the player asked for anything to run.
   */
  setQueue(commands: TestCommand[], caseBoundaries?: CaseBoundary[]): void {
    this.cancelRunAll();
    this.mode = 'queue';
    this.queue.load(commands, caseBoundaries);
  }

  /** Rebuild label→gateId maps after a circuit edit, then reset. */
  rebuild(): void {
    const labels = this.buildLabels();
    this.table.setLabels(labels);
    this.queue.setLabels(labels);
    this.reset();
  }

  private buildLabels() {
    return {
      inputs: buildLabelMap(this.editor, 'input'),
      outputs: buildLabelMap(this.editor, 'output'),
    };
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
