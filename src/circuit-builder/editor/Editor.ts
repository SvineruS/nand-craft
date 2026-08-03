import type { GateId } from './types.ts';
import { clearGateState } from '../simulation/gateTypes.ts';
import type { EditorState } from './EditorState.ts';
import { createEditorState } from './EditorState.ts';
import type { Command } from './commands.ts';
import { AddGateCommand, CommandHistory } from './commands.ts';
import { Vec2 } from './utils/vec2.ts';
import type { Level } from "../levels/levelTypes.ts";
import { LevelTests } from "./LevelTests.ts";
import { GRID_SIZE } from "./consts.ts";
import type { MapSize } from "./utils/mapBounds.ts";
import { Circuit } from "../simulation/circuit.ts";
import { loadAppliedTests, saveAppliedTests, saveCircuit } from "../persistence/storage.ts";
import { applyTestSource } from "../testing/applyTests.ts";

/**
 * Pure state + logic holder for the circuit editor.
 * Can be used with a level (puzzle mode) or without (level map editor, standalone).
 */
export class Editor {
  private state: EditorState;
  private history: CommandHistory;
  /** null when editing something that is not a level: a component, or the level map. */
  readonly level: Level | null;
  readonly tests: LevelTests;

  private constructor(circuit: Circuit, level: Level | null, mapSize?: MapSize) {
    this.state = createEditorState(mapSize);
    this.history = new CommandHistory(this.state);
    this.level = level;
    this.state.circuit = circuit;
    this.state.circuitDirty = true;
    this.tests = new LevelTests(this, level);
  }

  /** Create an editor for a level, using a saved circuit or building from the level definition. */
  static loadLevel(level: Level, savedCircuit?: Circuit): Editor {
    const circuit = savedCircuit ?? buildLevelCircuit(level);
    // A level can ask for a smaller (or larger) world than the default.
    const editor = new Editor(circuit, level, level.mapSize);

    // The tests the player last applied here, back in force without them pressing Apply again.
    // A stored document that no longer applies is dropped in silence: the level's own cases are
    // already loaded, and the text itself is still in the test editor to be fixed.
    const stored = loadAppliedTests(level.id);
    if (stored) applyTestSource(editor, stored);

    return editor;
  }

  /** Create an editor without a level (component editor, level map editor). */
  static create(circuit: Circuit, mapSize?: MapSize): Editor {
    return new Editor(circuit, null, mapSize);
  }

  /** Reset to the level's default circuit, discarding user changes. */
  resetLevel(): void {
    if (!this.level) return;
    this.history = new CommandHistory(this.state);
    this.state.circuit = buildLevelCircuit(this.level);
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
    return (this.getCircuit().getBuild()?.shortCircuitGates.length ?? 0) > 0;
  }

  hasContention(): boolean {
    return this.getCircuit().tickResult.contentionNets.length > 0;
  }

  onCircuitChanged() {
    this.getCircuit().invalidateBuild()
    this.tests.rebuild();
    this.state.renderDirty = true;
  }

  /** Re-tick the circuit without rebuilding topology. Used for value-only changes. */
  retick(): void {
    this.tests.retick();
    this.state.renderDirty = true;
  }

  /** Tick the live circuit with given input values. Updates pins, detects errors. */
  applyInputs(inputs: Map<GateId, number>, resetDelay = false): void {
    if (resetDelay) {
      // Stored state only (delay, latch, memory, counter, RAM) — gate.value holds the
      // player's constants and must survive.
      for (const gate of this.state.circuit.gates.values()) clearGateState(gate);
    }
    this.getCircuit().tick(inputs);
    this.state.renderDirty = true;
  }

  /**
   * Persist the circuit and the tests applied to it. Returns null on success, or a message
   * describing the failure.
   * Circuits without a level (components, the level map) are saved by their own screens.
   */
  save(): string | null {
    if (!this.level) return null;
    // Only when something is in force. A stored document that failed to re-apply on load leaves
    // `source` null, and that must not be read as "the player cleared their tests" — it would
    // erase the text that needs fixing.
    if (this.tests.source !== null) saveAppliedTests(this.level.id, this.tests.source);
    return saveCircuit(this.level.id, this.getCircuit());
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
    );
    cmd.execute();

    const gate = circuit.getGate(cmd.getGateId());
    if (pg.label !== undefined) gate.label = pg.label;
    if (pg.canRemove !== undefined) gate.canRemove = pg.canRemove;
    if (pg.canMove !== undefined) gate.canMove = pg.canMove;
  }

  return circuit;
}
