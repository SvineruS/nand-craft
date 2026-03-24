import type {
  Circuit,
  GateId,
  Level,
} from '../types.ts';
import { createCircuit } from '../types.ts';
import { createEditorState } from './EditorState.ts';
import type { EditorState } from './EditorState.ts';
import { Renderer } from './Renderer.ts';
import { InputHandler } from './InputHandler.ts';
import { CommandHistory, AddGateCommand } from './CommandHistory.ts';
import { SimulationEngine } from '../simulation/engine.ts';
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

    // InputHandler uses getters so it always sees current state/history
  this.input = new InputHandler(
      this.canvas,
      () => this.state,
      () => this.history,
      this.renderer,
    );
    this.input.attach();

    // Start render loop — onCircuitDirty triggers simulation + UI updates
    this.renderer.startLoop(() => this.state, () => this.onCircuitChange?.());

    // Handle resize
    this.resizeHandler = () => {
      this.state.renderDirty = true;
    };
    window.addEventListener('resize', this.resizeHandler);
  }

  loadLevel(level: Level): void {
    // Reset circuit
    this.state.circuit = createCircuit();

    // Reset history by creating a new one
    this.history = this.createHistory();

    // Stop simulation if running
    if (this.simulationInterval !== null) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
      this.state.simulationRunning = false;
    }

    // Clear selection and mode state
    this.state.selection = [];
    this.state.wireStart = null;

    // Create predefined gates from level spec
    if (level.predefinedGates) {
      for (const pg of level.predefinedGates) {
        const cmd = new AddGateCommand(
          this.state,
          pg.type,
          pg.x * GRID_SIZE,
          pg.y * GRID_SIZE,
          pg.rotation ?? 0,
          pg.bitWidth ?? 1,
        );
        cmd.execute();

        const gate = this.state.circuit.gates.get(cmd.getGateId());
        if (gate) {
          if (pg.label !== undefined) gate.label = pg.label;
          if (pg.canRemove !== undefined) gate.canRemove = pg.canRemove;
          if (pg.canMove !== undefined) gate.canMove = pg.canMove;
        }
      }
    }

    // Reset history again so the input/output gate placements aren't undoable
    this.history = this.createHistory();

    this.state.circuitDirty = true;
  }

  getCircuit(): Circuit {
    return this.state.circuit;
  }

  getState(): EditorState {
    return this.state;
  }

  undo(): void {
    this.history.undo();
  }

  redo(): void {
    this.history.redo();
  }

  /** Force a simulation tick with current input pin values (useful after state mutations that bypass commands). */
  resimulate(): void {
    this.stepTick();
    const cycles = this.engine.detectShortCircuits(this.state.circuit);
    this.state.shortCircuitGates = cycles.flat();
    this.state.contentionNets = this.detectContention();
    this.state.circuitDirty = true;
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
    this.state.circuitDirty = true;
  }


  hasShortCircuit(): boolean {
    return this.state.shortCircuitGates.length > 0;
  }

  hasContention(): boolean {
    return this.state.contentionNets.length > 0;
  }

  private detectContention(): string[] {
    const result: string[] = [];
    for (const net of this.state.circuit.nets.values()) {
      const drivers: { value: number | null }[] = [];
      for (const nodeId of net.nodeIds) {
        const node = this.state.circuit.wireNodes.get(nodeId);
        if (node?.pinId) {
          const pin = this.state.circuit.pins.get(node.pinId);
          if (pin && pin.kind === 'output' && pin.value !== null) {
            drivers.push(pin);
          }
        }
      }
      if (drivers.length > 1) {
        result.push(net.id as string);
      }
    }
    return result;
  }

  /** Clear all pin values and delay state (reset simulation visuals). */
  resetSimulation(): void {
    for (const pin of this.state.circuit.pins.values()) {
      pin.value = null;
    }
    this.state.circuit.delayState.clear();
    this.state.circuitDirty = true;
  }

  /** Tick the live circuit with given input values. Updates pins, detects errors. */
  applyInputs(inputs: Map<GateId, number>, resetDelay = false): void {
    if (resetDelay) {
      this.state.circuit.delayState.clear();
    }
    this.engine.tick(this.state.circuit, inputs);
    const cycles = this.engine.detectShortCircuits(this.state.circuit);
    this.state.shortCircuitGates = cycles.flat();
    this.state.contentionNets = this.detectContention();
    this.state.circuitDirty = true;
  }

  /** Get ordered input gate IDs (matched by insertion order). */
  getInputGateIds(): GateId[] {
    const ids: GateId[] = [];
    for (const [id, gate] of this.state.circuit.gates) {
      if (gate.type === 'input') ids.push(id);
    }
    return ids;
  }

  /** Get ordered output gate IDs (matched by insertion order). */
  getOutputGateIds(): GateId[] {
    const ids: GateId[] = [];
    for (const [id, gate] of this.state.circuit.gates) {
      if (gate.type === 'output') ids.push(id);
    }
    return ids;
  }

  /** Read current output pin values by name. */
  readOutputs(outputGateIds: GateId[], outputNames: string[]): Record<string, number | null> {
    const actuals: Record<string, number | null> = {};
    for (let j = 0; j < outputNames.length; j++) {
      const gate = this.state.circuit.gates.get(outputGateIds[j]);
      const pin = gate?.inputPins[0] ? this.state.circuit.pins.get(gate.inputPins[0]) : undefined;
      actuals[outputNames[j]] = pin?.value ?? null;
    }
    return actuals;
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
    return new CommandHistory();
  }

}
