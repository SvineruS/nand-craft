import type { GateId } from './types.ts';
import type { EditorState } from './EditorState.ts';
import { createEditorState } from './EditorState.ts';
import type { Command } from './commands.ts';
import { AddGateCommand, CommandHistory } from './commands.ts';
import { SimulationEngine } from '../simulation/engine.ts';
import type { TickResult } from '../simulation/types.ts';
import { Vec2 } from './utils/vec2.ts';
import type { Level } from "../levels/levelTypes.ts";
import { LevelTests } from "./LevelTests.ts";
import { GRID_SIZE } from "./consts.ts";
import { Circuit } from "../simulation/circuit.ts";
import { saveCircuit } from "../persistence/storage.ts";

/**
 * Pure state + logic holder for the circuit editor.
 * Always associated with a level. Create via Editor.loadLevel().
 */
export class Editor {
  private state: EditorState;
  private history: CommandHistory;
  private engine: SimulationEngine;
  readonly level: Level;
  readonly tests: LevelTests;

  private constructor(level: Level, circuit: Circuit) {
    this.state = createEditorState();
    this.history = new CommandHistory();
    this.engine = new SimulationEngine();
    this.level = level;
    this.state.circuit = circuit;
    this.state.circuitDirty = true;
    this.tests = new LevelTests(this, level);
  }

  /** Create an editor for a level, using a saved circuit or building from the level definition. */
  static loadLevel(level: Level, savedCircuit?: Circuit): Editor {
    const circuit = savedCircuit ?? buildLevelCircuit(level);
    return new Editor(level, circuit);
  }

  /** Reset to the level's default circuit, discarding user changes. */
  resetLevel(): void {
    const circuit = buildLevelCircuit(this.level);
    this.state.circuit = circuit;
    this.history = new CommandHistory();
    this.engine.invalidateBuild();
    this.state.selection = [];
    this.state.mode = { kind: 'normal' };
    this.state.circuitDirty = true;
    this.tests.rebuild();
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

  hasShortCircuit(): boolean {
    return (this.engine.getBuild()?.shortCircuitGates.length ?? 0) > 0;
  }

  hasContention(): boolean {
    return this.state.tickResult.contentionNets.length > 0;
  }

  /** Clear all pin values and delay state (reset simulation visuals). */
  resetSimulation(): void {
    for (const pin of this.state.circuit.pins.values()) {
      pin.value = 0;
    }
    this.state.circuit.delayState.clear();
    this.state.renderDirty = true;
  }

  /** Tick the live circuit with given input values. Updates pins, detects errors. */
  applyInputs(inputs: Map<GateId, number>, resetDelay = false): void {
    if (resetDelay) {
      this.state.circuit.delayState.clear();
    }
    const result = this.engine.tick(this.state.circuit, inputs);
    this.applyTickResult(result);
    this.state.renderDirty = true;
  }

  invalidateBuild(): void {
    this.engine.invalidateBuild();
  }

  save() {
    saveCircuit(this.level.id, this.getCircuit());
  }


  private applyTickResult(result: TickResult): void {
    this.state.shortCircuitGates = this.engine.getBuild()?.shortCircuitGates ?? [];
    this.state.tickResult = result;
  }
}

/** Build a circuit from a level definition's predefined gates. */
function buildLevelCircuit(level: Level): Circuit {
  const circuit = new Circuit();
  if (!level.predefinedGates) return circuit;

  const state = createEditorState();
  state.circuit = circuit;

  for (const pg of level.predefinedGates) {
    const cmd = new AddGateCommand(
      state,
      pg.type,
      Vec2.scale(pg.pos, GRID_SIZE),
      pg.rotation ?? 0,
      pg.bitWidth ?? 1,
    );
    cmd.execute();

    const gate = circuit.getGate(cmd.getGateId());
    if (pg.label !== undefined) gate.label = pg.label;
    if (pg.canRemove !== undefined) gate.canRemove = pg.canRemove;
    if (pg.canMove !== undefined) gate.canMove = pg.canMove;
  }

  return circuit;
}
