import type {
  Circuit,
  GateId,
  Level,
  TestResult,
} from '../types.ts';
import { createCircuit } from '../types.ts';
import { createEditorState } from './EditorState.ts';
import type { EditorState } from './EditorState.ts';
import { Renderer } from './Renderer.ts';
import { InputHandler } from './InputHandler.ts';
import { CommandHistory, AddGateCommand } from './CommandHistory.ts';
import { SimulationEngine } from '../simulation/engine.ts';
import { runLevel } from '../levels/runner.ts';
import { GRID_SIZE } from './geometry.ts';

export class Editor {
  private state: EditorState;
  private renderer: Renderer;
  private input: InputHandler;
  private history: CommandHistory;
  private engine: SimulationEngine;
  private canvas: HTMLCanvasElement;
  private simulationInterval: ReturnType<typeof setInterval> | null = null;
  private resizeHandler: () => void;
  onCircuitChange: (() => void) | null = null;

  constructor(container: HTMLElement) {
    // Create canvas filling the container
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, {
      width: '100%',
      height: '100%',
      display: 'block',
    });
    container.appendChild(this.canvas);

    // Initialize state
    this.state = createEditorState();
    this.history = this.createHistory();
    this.engine = new SimulationEngine();
    this.renderer = new Renderer(this.canvas);

    // InputHandler needs getState/setState callbacks
    this.input = new InputHandler(
      this.canvas,
      () => this.state,
      (fn) => { fn(this.state); },
      this.history,
      this.renderer,
    );
    this.input.attach();

    // Start render loop
    this.renderer.startLoop(() => this.state);

    // Handle resize
    this.resizeHandler = () => {
      this.state.dirty = true;
    };
    window.addEventListener('resize', this.resizeHandler);
  }

  loadLevel(level: Level): void {
    // Reset circuit
    this.state.circuit = createCircuit();

    // Reset history by creating a new one
    this.history = this.createHistory();

    // Rebuild input handler with new history
    this.input.detach();
    this.input = new InputHandler(
      this.canvas,
      () => this.state,
      (fn) => { fn(this.state); },
      this.history,
      this.renderer,
    );
    this.input.attach();

    // Stop simulation if running
    if (this.simulationInterval !== null) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
      this.state.simulationRunning = false;
    }

    // Clear selection and mode state
    this.state.selection = [];
    this.state.wireStart = null;

    // Create input gates on left side (x=2 grid units)
    const inputX = 2 * GRID_SIZE;
    for (let i = 0; i < level.inputs.length; i++) {
      const inputY = (2 + i * 3) * GRID_SIZE;
      const cmd = new AddGateCommand(
        this.state,
        'input',
        inputX,
        inputY,
        0,
        level.inputs[i].bitWidth,
      );
      cmd.execute();
    }

    // Create output gates on right side (x=12 grid units)
    const outputX = 12 * GRID_SIZE;
    for (let i = 0; i < level.outputs.length; i++) {
      const outputY = (2 + i * 3) * GRID_SIZE;
      const cmd = new AddGateCommand(
        this.state,
        'output',
        outputX,
        outputY,
        0,
        level.outputs[i].bitWidth,
      );
      cmd.execute();
    }

    // Reset history again so the input/output gate placements aren't undoable
    this.history = this.createHistory();
    this.input.detach();
    this.input = new InputHandler(
      this.canvas,
      () => this.state,
      (fn) => { fn(this.state); },
      this.history,
      this.renderer,
    );
    this.input.attach();

    this.state.dirty = true;
  }

  getCircuit(): Circuit {
    return this.state.circuit;
  }

  getState(): EditorState {
    return this.state;
  }

  undo(): void {
    this.history.undo();
    this.state.dirty = true;
  }

  redo(): void {
    this.history.redo();
    this.state.dirty = true;
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  stepTick(): void {
    // Gather input gate values (default to 0)
    const inputs = new Map<GateId, number>();
    for (const gate of this.state.circuit.gates.values()) {
      if (gate.type === 'input') {
        // Use existing pin value or default to 0
        const outputPin = gate.outputPins[0]
          ? this.state.circuit.pins.get(gate.outputPins[0])
          : undefined;
        inputs.set(gate.id, outputPin?.value ?? 0);
      }
    }

    this.engine.tick(this.state.circuit, inputs);
    this.state.dirty = true;
  }

  toggleSimulation(): void {
    if (this.state.simulationRunning) {
      // Stop
      if (this.simulationInterval !== null) {
        clearInterval(this.simulationInterval);
        this.simulationInterval = null;
      }
      this.state.simulationRunning = false;
    } else {
      // Start
      this.state.simulationRunning = true;
      this.simulationInterval = setInterval(() => {
        this.stepTick();
      }, 100);
    }
    this.state.dirty = true;
  }

  /** Clear all pin values and delay state (reset simulation visuals). */
  resetSimulation(): void {
    for (const pin of this.state.circuit.pins.values()) {
      pin.value = null;
    }
    this.state.circuit.delayState.clear();
    this.state.dirty = true;
  }

  runTests(level: Level): TestResult[] {
    const cloned = this.cloneCircuit(this.state.circuit);
    return runLevel(cloned, level);
  }

  /** Run a single test case on the LIVE circuit so pin values are visible. */
  runSingleCase(level: Level, caseIndex: number): TestResult {
    const cases = level.test.cases;
    if (!cases || !cases[caseIndex]) {
      return { passed: false, caseIndex, message: 'Case not found' };
    }

    const testCase = cases[caseIndex];
    const inputNames = level.inputs.map(i => i.name);
    const outputNames = level.outputs.map(o => o.name);

    // Find input/output gates by type order
    const inputGateIds: GateId[] = [];
    const outputGateIds: GateId[] = [];
    for (const [id, gate] of this.state.circuit.gates) {
      if (gate.type === 'input') inputGateIds.push(id);
      if (gate.type === 'output') outputGateIds.push(id);
    }

    // Set input values on the live circuit
    const inputs = new Map<GateId, number>();
    for (let j = 0; j < inputNames.length; j++) {
      const name = inputNames[j];
      if (name in testCase.inputs) {
        inputs.set(inputGateIds[j], testCase.inputs[name]);
      }
    }

    // Tick the live circuit
    this.engine.tick(this.state.circuit, inputs);
    this.state.dirty = true;

    // Check outputs
    let passed = true;
    const mismatches: string[] = [];
    for (let j = 0; j < outputNames.length; j++) {
      const name = outputNames[j];
      if (!(name in testCase.expected)) continue;
      const outputGate = this.state.circuit.gates.get(outputGateIds[j]);
      const inputPin = outputGate?.inputPins[0]
        ? this.state.circuit.pins.get(outputGate.inputPins[0])
        : undefined;
      const actual = inputPin?.value ?? null;
      const expected = testCase.expected[name];
      if (actual !== expected) {
        passed = false;
        mismatches.push(`${name}: expected ${expected}, got ${actual}`);
      }
    }

    const inputDesc = Object.entries(testCase.inputs)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');

    return {
      passed,
      caseIndex,
      message: passed
        ? `Inputs(${inputDesc}) — all outputs correct`
        : `Inputs(${inputDesc}) — ${mismatches.join('; ')}`,
    };
  }

  destroy(): void {
    this.renderer.stopLoop();
    this.input.detach();
    window.removeEventListener('resize', this.resizeHandler);
    if (this.simulationInterval !== null) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
  }

  private createHistory(): CommandHistory {
    const h = new CommandHistory();
    h.onChange = () => this.onCircuitChange?.();
    return h;
  }

  private cloneCircuit(circuit: Circuit): Circuit {
    const cloned: Circuit = {
      gates: new Map(),
      pins: new Map(),
      wireNodes: new Map(),
      wireSegments: new Map(),
      nets: new Map(),
      delayState: new Map(),
    };

    for (const [id, gate] of circuit.gates) {
      cloned.gates.set(id, {
        ...gate,
        inputPins: [...gate.inputPins],
        outputPins: [...gate.outputPins],
      });
    }

    for (const [id, pin] of circuit.pins) {
      cloned.pins.set(id, { ...pin });
    }

    for (const [id, node] of circuit.wireNodes) {
      cloned.wireNodes.set(id, { ...node });
    }

    for (const [id, seg] of circuit.wireSegments) {
      cloned.wireSegments.set(id, { ...seg });
    }

    for (const [id, net] of circuit.nets) {
      cloned.nets.set(id, {
        ...net,
        nodeIds: [...net.nodeIds],
        segmentIds: [...net.segmentIds],
      });
    }

    for (const [id, val] of circuit.delayState) {
      cloned.delayState.set(id, val);
    }

    return cloned;
  }
}
