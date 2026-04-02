import type { GateId } from './types.ts';
import type { EditorState } from './EditorState.ts';
import { createEditorState } from './EditorState.ts';
import type { Command } from './commands.ts';
import { AddGateCommand, CommandHistory } from './commands.ts';
import { SimulationEngine } from '../simulation/engine.ts';
import type { TickResult } from '../simulation/types.ts';
import { Vec2 } from './utils/vec2.ts';
import type { Level } from "../levels/levelTypes.ts";
import { GRID_SIZE } from "./consts.ts";
import { Circuit } from "../simulation/circuit.ts";

/**
 * Pure state + logic holder for the circuit editor.
 * No DOM, canvas, or rendering dependencies — screen components handle those.
 */
export class Editor {
  private state: EditorState;
  private history: CommandHistory;
  private engine: SimulationEngine;

  constructor() {
    this.state = createEditorState();
    this.history = new CommandHistory();
    this.engine = new SimulationEngine();
  }

  loadLevel(level: Level): void {
    this.resetEditor(new Circuit());

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

    // Reset history so predefined gate placements aren't undoable
    this.history = new CommandHistory();
  }

  loadCircuitFromSave(circuit: Circuit): void {
    this.resetEditor(circuit);
  }

  getCircuit(): Circuit {
    return this.state.circuit;
  }

  getState(): EditorState {
    return this.state;
  }

  getHistory(): CommandHistory {
    return this.history;
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

  /** Force a simulation tick with current input pin values. */
  resimulate(): void {
    const result = this.engine.tick(this.state.circuit, this.gatherInputs());
    this.applyTickResult(result);
    this.state.circuitDirty = true;
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  stepTick(): void {
    const result = this.engine.tick(this.state.circuit, this.gatherInputs());
    this.applyTickResult(result);
    this.state.circuitDirty = true;
  }

  hasShortCircuit(): boolean {
    return (this.engine.getBuild()?.shortCircuitGates.length ?? 0) > 0;
  }

  hasContention(): boolean {
    return this.state.tickResult.contentionNets.length > 0;
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
    const result = this.engine.tick(this.state.circuit, inputs);
    this.applyTickResult(result);
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

  invalidateBuild(): void {
    this.engine.invalidateBuild();
  }

  private gatherInputs(): Map<GateId, number> {
    const inputs = new Map<GateId, number>();
    for (const gate of this.state.circuit.gates.values()) {
      if (gate.type === 'input') {
        inputs.set(gate.id, this.state.circuit.getPin(gate.outputPins[0]).value ?? 0);
      }
    }
    return inputs;
  }

  private resetEditor(circuit: Circuit): void {
    this.state.circuit = circuit;
    this.history = new CommandHistory();
    this.engine.invalidateBuild();
    this.state.selection = [];
    this.state.mode = { kind: 'normal' };
    this.state.circuitDirty = true;
  }

  private applyTickResult(result: TickResult): void {
    this.state.shortCircuitGates = this.engine.getBuild()?.shortCircuitGates ?? [];
    this.state.tickResult = result;
  }
}
