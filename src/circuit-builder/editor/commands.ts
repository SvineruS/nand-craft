import type {
  GateId,
  PinRef,
  Rotation,
  WireNode,
  WireNodeId,
  WireSegment,
  WireSegmentId,
} from './types.ts';
import { generateId } from './types.ts';
import type { EditorState } from './EditorState.ts';
import { type Gate, type GateType } from './gates.ts';
import type { ReconnectedNode } from './utils/geometry.ts';
import {
  cleanupOrphanNodes,
  getAnchoredNodeIds,
  reconnectPinNodes,
  rotateGroup,
  undoReconnectPinNodes,
  updateAnchoredNodes
} from './utils/geometry.ts';
import { Vec2 } from './utils/vec2.ts';
import {
  addWireNodeWithId,
  addWireSegmentWithId,
  removeWireNode as removeWireNodePrim,
  removeWireSegment as removeWireSegmentPrim,
  restoreRemovedNode,
  restoreRemovedSegment,
  setWireNodePin,
  setWireNodePos,
  type RemovedNode,
  type RemovedSegment,
} from './circuitMutations.ts';

// ---------------------------------------------------------------------------
// Command interface & history stack
// ---------------------------------------------------------------------------

export interface Command {
  execute(): void;
  undo(): void;
  description: string;
}

class BatchCommand implements Command {
  readonly description: string;
  private commands: Command[] = [];

  constructor(description: string) {
    this.description = description;
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
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private batch: BatchCommand | null = null;
  private dragInProgress = false;

  /**
   * Set by InputHandler while an interactive drag is live. When true, any
   * execute/undo/redo call is a bug — drags must mutate state directly via
   * dragMutations and commit one atomic batch at mouseup.
   */
  setDragInProgress(v: boolean): void {
    this.dragInProgress = v;
  }

  execute(cmd: Command): void {
    if (this.dragInProgress) throw new Error('CommandHistory.execute() called during drag');
    if (this.batch) {
      this.batch.add(cmd);
      return;
    }
    cmd.execute();
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
    this.undoStack.push(batch);
    this.redoStack = [];
  }

  undo(): void {
    if (this.dragInProgress) return;
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
  }

  redo(): void {
    if (this.dragInProgress) return;
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.execute();
    this.undoStack.push(cmd);
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
    circuit.gates.set(this.gateId, this.gate);
    this.reconnectedNodes = reconnectPinNodes(circuit, [this.gateId]);
    this.state.circuitDirty = true;
  }

  undo(): void {
    const { circuit } = this.state;
    undoReconnectPinNodes(circuit, this.reconnectedNodes);
    circuit.gates.delete(this.gateId);
    this.state.circuitDirty = true;
  }

  getGateId(): GateId {
    return this.gateId;
  }
}

export class RemoveGateCommand implements Command {
  readonly description: string;
  private state: EditorState;
  private gateId: GateId;
  private gate: Gate | null = null;
  private removedNodes: WireNode[] = [];
  private removedSegments: WireSegment[] = [];
  private removedOrphanNodes: WireNode[] = [];

  constructor(state: EditorState, gateId: GateId) {
    this.state = state;
    this.gateId = gateId;
    this.description = `Remove gate ${gateId}`;
  }

  execute(): void {
    const { circuit } = this.state;
    const gate = circuit.gates.get(this.gateId);
    if (!gate) return;

    // Store gate for undo
    this.gate = { ...gate };

    // Find wire nodes anchored to this gate's pins
    this.removedNodes = [];
    this.removedSegments = [];

    const nodeIdsToRemove = new Set<string>();
    for (const node of circuit.wireNodes.values()) {
      if (node.pin && node.pin.gateId === this.gateId) {
        this.removedNodes.push({ ...node });
        nodeIdsToRemove.add(node.id as string);
      }
    }

    // Find wire segments connected to those nodes
    for (const seg of circuit.wireSegments.values()) {
      if (
        nodeIdsToRemove.has(seg.from as string) ||
        nodeIdsToRemove.has(seg.to as string)
      ) {
        this.removedSegments.push({ ...seg });
      }
    }

    // Collect neighbor node IDs (other endpoints of removed segments)
    const neighborNodeIds = new Set<string>();
    for (const seg of this.removedSegments) {
      if (!nodeIdsToRemove.has(seg.from as string)) neighborNodeIds.add(seg.from as string);
      if (!nodeIdsToRemove.has(seg.to as string)) neighborNodeIds.add(seg.to as string);
    }

    // Delete in order: segments, nodes, gate
    for (const seg of this.removedSegments) {
      circuit.wireSegments.delete(seg.id);
    }
    for (const node of this.removedNodes) {
      circuit.wireNodes.delete(node.id);
    }
    circuit.gates.delete(this.gateId);

    // Clean up orphaned free neighbor nodes
    this.removedOrphanNodes = cleanupOrphanNodes(circuit, neighborNodeIds as Iterable<WireNodeId>);

    this.state.circuitDirty = true;
  }

  undo(): void {
    const { circuit } = this.state;
    // Restore orphaned nodes first
    for (const node of this.removedOrphanNodes) {
      circuit.wireNodes.set(node.id, node);
    }
    if (this.gate) circuit.gates.set(this.gateId, this.gate);
    for (const node of this.removedNodes) {
      circuit.wireNodes.set(node.id, node);
    }
    for (const seg of this.removedSegments) {
      circuit.wireSegments.set(seg.id, seg);
    }
    this.state.circuitDirty = true;
  }
}

export class MoveGatesCommand implements Command {
  readonly description = 'Move gates';
  private state: EditorState;
  private gateIds: GateId[];
  private extraNodeIds: WireNodeId[];
  private delta: Vec2;
  private disconnected: boolean;

  /** Wire nodes that moved along with the gates (anchored to pins + extra). */
  private movedNodeIds: WireNodeId[] = [];
  /** Saved pin mappings for disconnect drag undo. */
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

  /** Store detached pin mappings (set by InputHandler before execute, for undo support). */
  saveDetachedPins(detached: { nodeId: WireNodeId; pin: PinRef }[]): void {
    this.detachedPins = detached;
  }

  execute(): void {
    const { circuit } = this.state;

    for (const gateId of this.gateIds) {
      const gate = circuit.getGate(gateId);
      gate.pos = Vec2.add(gate.pos, this.delta);
    }

    const anchored = this.disconnected ? [] : getAnchoredNodeIds(circuit, this.gateIds);
    const allIds = new Set<WireNodeId>([...anchored, ...this.extraNodeIds]);
    this.movedNodeIds = [...allIds];
    for (const nodeId of this.movedNodeIds) {
      const node = circuit.getWireNode(nodeId);
      node.pos = Vec2.add(node.pos, this.delta);
    }

    this.reconnectedNodes = reconnectPinNodes(circuit, this.gateIds);
    this.state.circuitDirty = true;
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
      circuit.getWireNode(nodeId).pin = pin;
    }

    this.state.circuitDirty = true;
  }
}

export class RotateGatesCommand implements Command {
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

    this.state.circuitDirty = true;
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
    this.state.circuitDirty = true;
  }
}

export class AddWireNodeCommand implements Command {
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
    addWireNodeWithId(this.state.circuit, this.nodeId, this.pos, this.pin);
    this.state.circuitDirty = true;
  }

  undo(): void {
    this.state.circuit.wireNodes.delete(this.nodeId);
    this.state.circuitDirty = true;
  }

  getNodeId(): WireNodeId {
    return this.nodeId;
  }
}

export class RemoveWireNodeCommand implements Command {
  readonly description = 'Remove wire node';
  private state: EditorState;
  private nodeId: WireNodeId;
  private removed: RemovedNode | null = null;

  constructor(state: EditorState, nodeId: WireNodeId) {
    this.state = state;
    this.nodeId = nodeId;
  }

  execute(): void {
    this.removed = removeWireNodePrim(this.state.circuit, this.nodeId);
    this.state.circuitDirty = true;
  }

  undo(): void {
    if (this.removed) restoreRemovedNode(this.state.circuit, this.removed);
    this.state.circuitDirty = true;
  }
}

export class AddWireSegmentCommand implements Command {
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
    addWireSegmentWithId(this.state.circuit, this.segmentId, this.from, this.to, this.color, this.label);
    this.state.circuitDirty = true;
  }

  undo(): void {
    this.state.circuit.wireSegments.delete(this.segmentId);
    this.state.circuitDirty = true;
  }

  getSegmentId(): WireSegmentId {
    return this.segmentId;
  }
}

export class RemoveWireSegmentCommand implements Command {
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
    this.removed = removeWireSegmentPrim(this.state.circuit, this.segmentId, this.cleanOrphans);
    this.state.circuitDirty = true;
  }

  undo(): void {
    if (this.removed) restoreRemovedSegment(this.state.circuit, this.removed);
    this.state.circuitDirty = true;
  }
}

export class MoveWireNodeCommand implements Command {
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
    if (this.detachPin) setWireNodePin(this.state.circuit, this.nodeId, undefined);
    this.state.circuitDirty = true;
  }

  undo(): void {
    setWireNodePos(this.state.circuit, this.nodeId, this.oldPos);
    if (this.detachPin) setWireNodePin(this.state.circuit, this.nodeId, this.detachPin);
    this.state.circuitDirty = true;
  }
}

/** Set the output value of constant gates. */
export class ChangeGateValueCommand implements Command {
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
    this.state.valueDirty = true;
  }

  undo(): void {
    for (let i = 0; i < this.gateIds.length; i++) {
      this.state.circuit.getGate(this.gateIds[i]).value = this.oldValues[i];
    }
    this.state.valueDirty = true;
  }
}

export class ChangeGateLabelCommand implements Command {
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
    // circuitDirty (not renderDirty) to rebuild test label→gate maps via onCircuitChanged
    this.state.circuitDirty = true;
  }

  undo(): void {
    this.state.circuit.getGate(this.gateId).label = this.oldLabel;
    this.state.circuitDirty = true;
  }
}

export interface WireChanges {
  label?: string | undefined;
  color?: string | undefined;
}

export class ChangeWireCommand implements Command {
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
    this.state.circuitDirty = true;
  }

  undo(): void {
    for (let i = 0; i < this.segmentIds.length; i++) {
      const seg = this.state.circuit.getWireSegment(this.segmentIds[i]);
      const old = this.oldValues[i];
      if (this.changeLabel) seg.label = old.label;
      if (this.changeColor) seg.color = old.color;
    }
    this.state.circuitDirty = true;
  }
}
