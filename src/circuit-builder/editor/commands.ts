import type {
  GateId,
  PinRef,
  Rotation,
  WireNodeId,
  WireSegmentId,
} from './types.ts';
import { generateId } from './types.ts';
import type { EditorState } from './EditorState.ts';
import { type Gate, type GateType } from './gates.ts';
import type { ReconnectedNode } from './utils/geometry.ts';
import {
  reconnectPinNodes,
  rotateGroup,
  undoReconnectPinNodes,
  updateAnchoredNodes
} from './utils/geometry.ts';
import { Vec2 } from './utils/vec2.ts';
import {
  addWireNode,
  addWireSegment,
  removeWireNodeCascade,
  removeWireSegmentCascade,
  restoreRemovedNode,
  restoreRemovedSegment,
  setWireNodePos,
  type RemovedNode,
  type RemovedSegment,
} from './circuitMutations.ts';

// ---------------------------------------------------------------------------
// Command interface & history stack
// ---------------------------------------------------------------------------

/**
 * What running (or undoing) a command makes stale: the circuit's topology, or only the values
 * on its wires. Names the matching EditorState dirty flag — see the frame loop.
 */
export type CommandEffect = 'circuit' | 'value';

export interface Command {
  execute(): void;
  undo(): void;
  description: string;
  /**
   * Declared once per command instead of set by each execute()/undo() pair. Twenty-five
   * `state.circuitDirty = true` statements used to state this, and forgetting one in either
   * direction left the frame showing the state before the edit.
   */
  readonly effect: CommandEffect;
}

class BatchCommand implements Command {
  readonly description: string;
  private commands: Command[] = [];

  constructor(description: string) {
    this.description = description;
  }

  /** The strongest effect in the batch: one topology change makes the whole batch one. */
  get effect(): CommandEffect {
    return this.commands.some(cmd => cmd.effect === 'circuit') ? 'circuit' : 'value';
  }

  add(cmd: Command): void {
    cmd.execute();
    this.commands.push(cmd);
  }

  execute(): void {
    for (const cmd of this.commands)
      cmd.execute();
  }

  undo(): void {
    for (let i = this.commands.length - 1; i >= 0; i--)
      this.commands[i].undo();
  }
}

export class CommandHistory {
  private readonly state: EditorState;
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private batch: BatchCommand | null = null;

  constructor(state: EditorState) {
    this.state = state;
  }

  execute(cmd: Command): void {
    if (this.batch) {
      // The batch is marked once, in endBatch. Nothing reads the flags before then: they are
      // consumed by the next frame, and a batch is always opened and closed within one event.
      this.batch.add(cmd);
      return;
    }
    cmd.execute();
    this.markDirty(cmd);
    this.undoStack.push(cmd);
    this.redoStack = [];
  }

  beginBatch(description: string): void {
    this.batch = new BatchCommand(description);
  }

  endBatch(): void {
    if (!this.batch) return;
    const batch = this.batch;
    this.batch = null;
    this.markDirty(batch);
    this.undoStack.push(batch);
    this.redoStack = [];
  }

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.markDirty(cmd);
    this.redoStack.push(cmd);
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.execute();
    this.markDirty(cmd);
    this.undoStack.push(cmd);
  }

  private markDirty(cmd: Command): void {
    if (cmd.effect === 'circuit') this.state.circuitDirty = true;
    else this.state.valueDirty = true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}

// ---------------------------------------------------------------------------
// Concrete commands
// ---------------------------------------------------------------------------

export class AddGateCommand implements Command {
  readonly effect: CommandEffect = 'circuit';
  readonly description: string;
  private state: EditorState;
  private gateId: GateId;
  private gate: Gate;
  private reconnectedNodes: ReconnectedNode[] = [];

  constructor(
    state: EditorState,
    gateType: GateType,
    pos: Vec2,
    rotation: Rotation = 0
  ) {
    this.state = state;
    this.description = `Add ${gateType} gate`;
    this.gateId = generateId('gate') as GateId;

    this.gate = {
      id: this.gateId,
      type: gateType,
      pos,
      rotation,
    };
  }

  execute(): void {
    const { circuit } = this.state;
    circuit.addGate(this.gate);
    this.reconnectedNodes = reconnectPinNodes(circuit, [this.gateId]);
  }

  undo(): void {
    const { circuit } = this.state;
    undoReconnectPinNodes(circuit, this.reconnectedNodes);
    circuit.removeGate(this.gateId);
  }

  getGateId(): GateId {
    return this.gateId;
  }
}

export class RemoveGateCommand implements Command {
  readonly effect: CommandEffect = 'circuit';
  readonly description: string;
  private state: EditorState;
  private gateId: GateId;
  private gate: Gate | null = null;
  /**
   * One record per anchored node, in removal order. Undo replays them in reverse: a segment
   * between two pins of this gate is recorded under whichever node went first, so its other
   * endpoint has to be back before that record is restored.
   */
  private removedNodes: RemovedNode[] = [];

  constructor(state: EditorState, gateId: GateId) {
    this.state = state;
    this.gateId = gateId;
    this.description = `Remove gate ${gateId}`;
  }

  execute(): void {
    const { circuit } = this.state;
    const gate = circuit.gates.get(this.gateId);
    if (!gate) return;

    this.gate = { ...gate };

    // Each anchored node takes its own segments and any neighbour they orphaned with it —
    // the same cascade RemoveWireNodeCommand uses, rather than a second copy of it here.
    this.removedNodes = [];
    for (const nodeId of circuit.anchoredNodesOf([this.gateId])) {
      const removed = removeWireNodeCascade(circuit, nodeId);
      // Already gone: an earlier node's cascade cleaned it up as an orphaned neighbour.
      if (removed) this.removedNodes.push(removed);
    }
    circuit.removeGate(this.gateId);

  }

  undo(): void {
    const { circuit } = this.state;
    if (this.gate) circuit.addGate(this.gate);
    for (let i = this.removedNodes.length - 1; i >= 0; i--) {
      restoreRemovedNode(circuit, this.removedNodes[i]);
    }
  }
}

export class MoveGatesCommand implements Command {
  readonly effect: CommandEffect = 'circuit';
  readonly description = 'Move gates';
  private state: EditorState;
  private gateIds: GateId[];
  private extraNodeIds: WireNodeId[];
  private delta: Vec2;
  private disconnected: boolean;

  /** Wire nodes that moved along with the gates (anchored to pins + extra). */
  private movedNodeIds: WireNodeId[] = [];
  /** Pins detached by a disconnect drag, restored on undo. */
  private detachedPins: { nodeId: WireNodeId; pin: PinRef }[] = [];
  /** Wire nodes reconnected to pins after move. */
  private reconnectedNodes: ReconnectedNode[] = [];

  constructor(state: EditorState, gateIds: GateId[], delta: Vec2, extraNodeIds: WireNodeId[] = [], disconnected = false) {
    this.state = state;
    this.gateIds = gateIds;
    this.extraNodeIds = extraNodeIds;
    this.delta = delta;
    this.disconnected = disconnected;
  }

  execute(): void {
    const { circuit } = this.state;

    // A disconnect drag cuts the gate loose from its wires, which stay put. The detaching
    // happens here rather than in the drag: the drag is only a visual preview, so execute()
    // has to be able to produce this state on its own (including on redo).
    this.detachedPins = [];
    if (this.disconnected) {
      for (const nodeId of circuit.anchoredNodesOf(this.gateIds)) {
        const pin = circuit.getWireNode(nodeId).pin;
        if (!pin) continue;
        this.detachedPins.push({ nodeId, pin });
        circuit.setWireNodePin(nodeId, undefined);
      }
    }

    for (const gateId of this.gateIds) {
      const gate = circuit.getGate(gateId);
      gate.pos = Vec2.add(gate.pos, this.delta);
    }

    const anchored = this.disconnected ? [] : circuit.anchoredNodesOf(this.gateIds);
    const allIds = new Set<WireNodeId>([...anchored, ...this.extraNodeIds]);
    this.movedNodeIds = [...allIds];
    for (const nodeId of this.movedNodeIds) {
      const node = circuit.getWireNode(nodeId);
      node.pos = Vec2.add(node.pos, this.delta);
    }

    this.reconnectedNodes = reconnectPinNodes(circuit, this.gateIds);
  }

  undo(): void {
    const { circuit } = this.state;

    undoReconnectPinNodes(circuit, this.reconnectedNodes);

    for (const gateId of this.gateIds) {
      const gate = circuit.getGate(gateId);
      gate.pos = Vec2.sub(gate.pos, this.delta);
    }

    for (const nodeId of this.movedNodeIds) {
      const node = circuit.getWireNode(nodeId);
      node.pos = Vec2.sub(node.pos, this.delta);
    }

    // Restore detached pin connections
    for (const { nodeId, pin } of this.detachedPins) {
      circuit.setWireNodePin(nodeId, pin);
    }

  }
}

export class RotateGatesCommand implements Command {
  readonly effect: CommandEffect = 'circuit';
  readonly description = 'Rotate selection';
  private state: EditorState;
  private gateIds: GateId[];
  private extraNodeIds: WireNodeId[];
  private static readonly ROTATION_STEP = 90;

  /** Stored positions for undo. */
  private savedGatePositions: { id: GateId; pos: Vec2; rotation: number }[] = [];
  private savedNodePositions: { id: WireNodeId; pos: Vec2 }[] = [];

  constructor(state: EditorState, gateIds: GateId[], extraNodeIds: WireNodeId[] = []) {
    this.state = state;
    this.gateIds = gateIds;
    this.extraNodeIds = extraNodeIds;
  }

  execute(): void {
    const gates = this.gateIds.map(id => this.state.circuit.getGate(id));
    const nodes = this.extraNodeIds.map(id => this.state.circuit.getWireNode(id));

    this.savedGatePositions = gates.map(gate => ({ id: gate.id, pos: Vec2.copy(gate.pos), rotation: gate.rotation }));
    this.savedNodePositions = nodes.map(node => ({ id: node.id, pos: Vec2.copy(node.pos) }));

    rotateGroup(this.state.circuit, gates, nodes, RotateGatesCommand.ROTATION_STEP);

  }

  undo(): void {
    const { circuit } = this.state;
    for (const saved of this.savedGatePositions) {
      const gate = circuit.getGate(saved.id);
      gate.pos = saved.pos;
      gate.rotation = saved.rotation as Rotation;
    }
    for (const saved of this.savedNodePositions) {
      circuit.getWireNode(saved.id).pos = saved.pos;
    }
    for (const gateId of this.gateIds) {
      updateAnchoredNodes(circuit.getGate(gateId), circuit);
    }
  }
}

export class AddWireNodeCommand implements Command {
  readonly effect: CommandEffect = 'circuit';
  readonly description = 'Add wire node';
  private state: EditorState;
  private nodeId: WireNodeId;
  private pos: Vec2;
  private pin: PinRef | undefined;

  constructor(state: EditorState, pos: Vec2, pin?: PinRef) {
    this.state = state;
    this.pos = pos;
    this.pin = pin;
    this.nodeId = generateId('wn') as WireNodeId;
  }

  execute(): void {
    addWireNode(this.state.circuit, this.nodeId, this.pos, this.pin);
  }

  undo(): void {
    this.state.circuit.removeWireNode(this.nodeId);
  }

  getNodeId(): WireNodeId {
    return this.nodeId;
  }
}

export class RemoveWireNodeCommand implements Command {
  readonly effect: CommandEffect = 'circuit';
  readonly description = 'Remove wire node';
  private state: EditorState;
  private nodeId: WireNodeId;
  private removed: RemovedNode | null = null;

  constructor(state: EditorState, nodeId: WireNodeId) {
    this.state = state;
    this.nodeId = nodeId;
  }

  execute(): void {
    this.removed = removeWireNodeCascade(this.state.circuit, this.nodeId);
  }

  undo(): void {
    if (this.removed) restoreRemovedNode(this.state.circuit, this.removed);
  }
}

export class AddWireSegmentCommand implements Command {
  readonly effect: CommandEffect = 'circuit';
  readonly description = 'Add wire segment';
  private state: EditorState;
  private from: WireNodeId;
  private to: WireNodeId;
  private segmentId: WireSegmentId;

  private color: string | undefined;
  private label: string | undefined;

  constructor(state: EditorState, from: WireNodeId, to: WireNodeId, color?: string, label?: string) {
    this.state = state;
    this.from = from;
    this.to = to;
    this.color = color;
    this.label = label;
    this.segmentId = generateId('ws') as WireSegmentId;
  }

  execute(): void {
    addWireSegment(this.state.circuit, this.segmentId, this.from, this.to, this.color, this.label);
  }

  undo(): void {
    this.state.circuit.removeWireSegment(this.segmentId);
  }

  getSegmentId(): WireSegmentId {
    return this.segmentId;
  }
}

export class RemoveWireSegmentCommand implements Command {
  readonly effect: CommandEffect = 'circuit';
  readonly description = 'Remove wire segment';
  private state: EditorState;
  private segmentId: WireSegmentId;
  private cleanOrphans: boolean;
  private removed: RemovedSegment | null = null;

  constructor(state: EditorState, segmentId: WireSegmentId, cleanOrphans = true) {
    this.state = state;
    this.segmentId = segmentId;
    this.cleanOrphans = cleanOrphans;
  }

  execute(): void {
    this.removed = removeWireSegmentCascade(this.state.circuit, this.segmentId, this.cleanOrphans);
  }

  undo(): void {
    if (this.removed) restoreRemovedSegment(this.state.circuit, this.removed);
  }
}

export class MoveWireNodeCommand implements Command {
  readonly effect: CommandEffect = 'circuit';
  readonly description = 'Move wire node';
  private state: EditorState;
  private nodeId: WireNodeId;
  private newPos: Vec2;
  private detachPin: PinRef | undefined;

  private oldPos: Vec2 = { x: 0, y: 0 };

  constructor(state: EditorState, nodeId: WireNodeId, newPos: Vec2, detachPin?: PinRef) {
    this.state = state;
    this.nodeId = nodeId;
    this.newPos = newPos;
    this.detachPin = detachPin;
  }

  execute(): void {
    this.oldPos = setWireNodePos(this.state.circuit, this.nodeId, this.newPos);
    if (this.detachPin) this.state.circuit.setWireNodePin(this.nodeId, undefined);
  }

  undo(): void {
    setWireNodePos(this.state.circuit, this.nodeId, this.oldPos);
    if (this.detachPin) this.state.circuit.setWireNodePin(this.nodeId, this.detachPin);
  }
}

/** Set the output value of constant gates. */
export class ChangeGateValueCommand implements Command {
  readonly effect: CommandEffect = 'value';
  readonly description = 'Change gate value';
  private state: EditorState;
  private gateIds: GateId[];
  private newValue: number | undefined;
  private oldValues: (number | undefined)[];

  constructor(state: EditorState, gateIds: GateId[], newValue: number | undefined) {
    this.state = state;
    this.gateIds = gateIds;
    this.newValue = newValue;
    this.oldValues = gateIds.map(id => state.circuit.getGate(id).value);
  }

  execute(): void {
    for (const id of this.gateIds) {
      this.state.circuit.getGate(id).value = this.newValue;
    }
  }

  undo(): void {
    for (let i = 0; i < this.gateIds.length; i++) {
      this.state.circuit.getGate(this.gateIds[i]).value = this.oldValues[i];
    }
  }
}

/** Live contents and boot image of a RAM gate. Both are always stated, never merged. */
export interface RamContents {
  cells: number[] | undefined;
  rom: number[] | undefined;
}

/**
 * Set what a RAM gate holds — flashing an assembled program, editing one byte in the
 * memory view, or clearing it.
 *
 * Both halves travel together because they are edited together: flashing sets the boot
 * image and the live cells to the same bytes, while a hand-edited byte changes only the
 * cells and has to say so by repeating the boot image unchanged.
 */
export class WriteRamCommand implements Command {
  readonly effect: CommandEffect = 'value';
  readonly description = 'Write RAM';
  private state: EditorState;
  private gateId: GateId;
  private next: RamContents;
  private previous: RamContents;

  constructor(state: EditorState, gateId: GateId, next: RamContents) {
    this.state = state;
    this.gateId = gateId;
    this.next = copyContents(next);
    const gate = state.circuit.getGate(gateId);
    this.previous = copyContents({ cells: gate.cells, rom: gate.rom });
  }

  execute(): void {
    this.apply(this.next);
  }

  undo(): void {
    this.apply(this.previous);
  }

  private apply(contents: RamContents): void {
    const gate = this.state.circuit.getGate(this.gateId);
    const copy = copyContents(contents);
    gate.cells = copy.cells;
    gate.rom = copy.rom;
  }
}

/** Snapshot both arrays — the gate is mutated in place, so a shared reference would alias. */
function copyContents(contents: RamContents): RamContents {
  return {
    cells: contents.cells ? [...contents.cells] : undefined,
    rom: contents.rom ? [...contents.rom] : undefined,
  };
}

export class ChangeGateLabelCommand implements Command {
  // 'circuit' rather than 'value': the tests' label→gate maps are rebuilt by onCircuitChanged.
  readonly effect: CommandEffect = 'circuit';
  readonly description = 'Change gate label';
  private state: EditorState;
  private gateId: GateId;
  private newLabel: string | undefined;
  private oldLabel: string | undefined;

  constructor(state: EditorState, gateId: GateId, newLabel: string | undefined) {
    this.state = state;
    this.gateId = gateId;
    this.newLabel = newLabel;
    this.oldLabel = state.circuit.getGate(gateId).label;
  }

  execute(): void {
    this.state.circuit.getGate(this.gateId).label = this.newLabel;
  }

  undo(): void {
    this.state.circuit.getGate(this.gateId).label = this.oldLabel;
  }
}

export interface WireChanges {
  label?: string | undefined;
  color?: string | undefined;
}

export class ChangeWireCommand implements Command {
  readonly effect: CommandEffect = 'circuit';
  readonly description = 'Change wire property';
  private state: EditorState;
  private segmentIds: WireSegmentId[];
  private changes: WireChanges;
  private changeLabel: boolean;
  private changeColor: boolean;
  private oldValues: WireChanges[];

  constructor(state: EditorState, segmentIds: WireSegmentId[], changes: WireChanges) {
    this.state = state;
    this.segmentIds = segmentIds;
    this.changes = changes;
    this.changeLabel = 'label' in changes;
    this.changeColor = 'color' in changes;
    this.oldValues = segmentIds.map(id => {
      const seg = state.circuit.getWireSegment(id);
      const old: WireChanges = {};
      if (this.changeLabel) old.label = seg.label;
      if (this.changeColor) old.color = seg.color;
      return old;
    });
  }

  execute(): void {
    for (const id of this.segmentIds) {
      const seg = this.state.circuit.getWireSegment(id);
      if (this.changeLabel) seg.label = this.changes.label;
      if (this.changeColor) seg.color = this.changes.color;
    }
  }

  undo(): void {
    for (let i = 0; i < this.segmentIds.length; i++) {
      const seg = this.state.circuit.getWireSegment(this.segmentIds[i]);
      const old = this.oldValues[i];
      if (this.changeLabel) seg.label = old.label;
      if (this.changeColor) seg.color = old.color;
    }
  }
}
