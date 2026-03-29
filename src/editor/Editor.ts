import { Circuit } from './circuit.ts';
import type { GateId } from './types.ts';
import { createEditorState } from './EditorState.ts';
import type { EditorState } from './EditorState.ts';
import { Renderer } from './Renderer.ts';
import { InputHandler } from './InputHandler.ts';
import { CommandHistory, AddGateCommand } from './commands.ts';
import type { Command } from './commands.ts';
import { SimulationEngine } from '../simulation/engine.ts';
import { Vec2 } from './utils/vec2.ts';
import type { Level } from "../levels/levelTypes.ts";
import { GRID_SIZE } from "./consts.ts";

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
  private stateOverride: EditorState | null = null;

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
    this.renderer.startLoop(
      () => this.stateOverride ?? this.state,
      () => { if (!this.stateOverride) this.onCircuitChange?.(); },
    );

    // Handle resize
    this.resizeHandler = () => {
      (this.stateOverride ?? this.state).renderDirty = true;
    };
    window.addEventListener('resize', this.resizeHandler);
  }

  loadLevel(level: Level): void {
    // Reset circuit
    this.state.circuit = new Circuit();

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
    this.state.mode = { kind: 'normal' };

    // Create predefined gates from level spec
    if (level.predefinedGates) {
      for (const pg of level.predefinedGates) {
        const cmd = new AddGateCommand(
          this.state,
          pg.type,
          Vec2.scale(pg.pos, GRID_SIZE),
          pg.rotation ?? 0,
          pg.bitWidth ?? 1,
        );
        cmd.execute();

        const gate = this.state.circuit.getGate(cmd.getGateId());
        if (pg.label !== undefined) gate.label = pg.label;
        if (pg.canRemove !== undefined) gate.canRemove = pg.canRemove;
        if (pg.canMove !== undefined) gate.canMove = pg.canMove;
      }
    }

    // Reset history again so the input/output gate placements aren't undoable
    this.history = this.createHistory();

    this.state.circuitDirty = true;
  }

  loadCircuitFromSave(circuit: Circuit): void {
    this.state.circuit = circuit;
    this.history = this.createHistory();
    if (this.simulationInterval !== null) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
      this.state.simulationRunning = false;
    }
    this.state.selection = [];
    this.state.mode = { kind: 'normal' };
    this.state.circuitDirty = true;
  }

  setStateOverride(state: EditorState | null): void {
    this.stateOverride = state;
    if (state) state.renderDirty = true;
    else this.state.renderDirty = true;
  }

  detachInput(): void {
    this.input.detach();
  }

  attachInput(): void {
    this.input.attach();
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
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

  executeCommand(cmd: Command): void {
    this.history.execute(cmd);
  }

  /** Force a simulation tick with current input pin values (useful after state mutations that bypass commands). */
  resimulate(): void {
    this.stepTick();
    this.updateErrorState();
    this.updateDerivedState();
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
        inputs.set(gate.id, this.state.circuit.getPin(gate.outputPins[0]).value ?? 0);
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
        const node = this.state.circuit.getWireNode(nodeId);
        if (node.pinId) {
          const pin = this.state.circuit.getPin(node.pinId);
          if (pin.kind === 'output' && pin.value !== null) {
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

  /** Detect short circuits and contention, store in state. */
  private updateErrorState(): void {
    const cycles = this.engine.detectShortCircuits(this.state.circuit);
    this.state.shortCircuitGates = cycles.flat();
    this.state.contentionNets = this.detectContention();
  }

  /** Compute derived rendering data: error segments, node values/bit widths. */
  private updateDerivedState(): void {
    const { circuit, shortCircuitGates, contentionNets } = this.state;

    // Error segments
    const errorSegments = new Set<string>();
    if (shortCircuitGates.length > 0) {
      const errorPinIds = new Set<string>();
      for (const gateId of shortCircuitGates) {
        const gate = circuit.getGate(gateId);
        for (const p of [...gate.inputPins, ...gate.outputPins])
          errorPinIds.add(p as string);
      }
      for (const net of circuit.nets.values()) {
        let touches = false;
        for (const nid of net.nodeIds) {
          const node = circuit.getWireNode(nid);
          if (node.pinId && errorPinIds.has(node.pinId as string)) { touches = true; break; }
        }
        if (touches) {
          for (const sid of net.segmentIds) errorSegments.add(sid as string);
        }
      }
    }
    if (contentionNets.length > 0) {
      const contentionSet = new Set(contentionNets);
      for (const net of circuit.nets.values()) {
        if (contentionSet.has(net.id as string)) {
          for (const sid of net.segmentIds) errorSegments.add(sid as string);
        }
      }
    }
    this.state.errorSegmentIds = errorSegments;

    // Node values & bit widths
    const nodeValues = new Map<string, number | null>();
    const nodeBitWidths = new Map<string, number>();
    for (const net of circuit.nets.values()) {
      let netValue: number | null = null;
      let netBitWidth = 1;
      for (const nodeId of net.nodeIds) {
        const node = circuit.getWireNode(nodeId);
        if (node.pinId) {
          const pin = circuit.getPin(node.pinId);
          if (pin.value !== null) netValue = pin.value;
          netBitWidth = pin.bitWidth;
        }
      }
      for (const nodeId of net.nodeIds) {
        nodeValues.set(nodeId as string, netValue);
        nodeBitWidths.set(nodeId as string, netBitWidth);
      }
    }
    this.state.nodeValues = nodeValues;
    this.state.nodeBitWidths = nodeBitWidths;
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
    this.updateErrorState();
    this.updateDerivedState();
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
      const gate = this.state.circuit.getGate(outputGateIds[j]);
      actuals[outputNames[j]] = this.state.circuit.getPin(gate.inputPins[0]).value ?? null;
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
