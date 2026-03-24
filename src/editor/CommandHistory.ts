import type {
  Gate,
  GateId,
  GateType,
  PinId,
  WireNodeId,
  WireSegmentId,
  Pin,
  WireNode,
  WireSegment,
} from '../types.ts';
import { generateId } from '../types.ts';
import type { EditorState } from './EditorState.ts';
import { GATE_DEFS } from './gateDefs.ts';
import { getAnchoredNodeIds, getAllPinIds, cleanupOrphanNodes, rotateGroup, updateAnchoredNodes, reconnectPinNodes, undoReconnectPinNodes } from './geometry.ts';
import type { ReconnectedNode } from './geometry.ts';

// ---------------------------------------------------------------------------
// Command interface & history stack
// ---------------------------------------------------------------------------

export interface Command {
  execute(): void;
  undo(): void;
  description: string;
}

export class CommandHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  execute(cmd: Command): void {
    cmd.execute();
    this.undoStack.push(cmd);
    this.redoStack = [];
  }

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
  }

  redo(): void {
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
  private pins: Pin[] = [];
  private reconnectedNodes: ReconnectedNode[] = [];

  constructor(
    state: EditorState,
    gateType: GateType,
    x: number,
    y: number,
    rotation: 0 | 90 | 180 | 270 = 0,
    bitWidth: number = 1,
  ) {
    this.state = state;
    this.description = `Add ${gateType} gate`;
    this.gateId = generateId('gate') as GateId;

    const def = GATE_DEFS[gateType];
    let inputIdx = 0;
    let outputIdx = 0;
    for (const p of def.pins) {
      const pinId = generateId('pin') as PinId;
      this.pins.push({
        id: pinId,
        gateId: this.gateId,
        kind: p.kind,
        index: p.kind === 'input' ? inputIdx++ : outputIdx++,
        bitWidth: p.bitWidth ?? bitWidth,
        value: null,
      });
    }

    const inputPins = this.pins.filter((p) => p.kind === 'input').map((p) => p.id);
    const outputPins = this.pins.filter((p) => p.kind === 'output').map((p) => p.id);

    this.gate = {
      id: this.gateId,
      type: gateType,
      x,
      y,
      rotation,
      inputPins,
      outputPins,
    };
  }

  execute(): void {
    const { circuit } = this.state;
    circuit.gates.set(this.gateId, this.gate);
    for (const pin of this.pins) {
      circuit.pins.set(pin.id, pin);
    }
    this.reconnectedNodes = reconnectPinNodes(circuit, [this.gateId]);
    this.state.circuitDirty = true;
  }

  undo(): void {
    const { circuit } = this.state;
    undoReconnectPinNodes(circuit, this.reconnectedNodes);
    for (const pin of this.pins) {
      circuit.pins.delete(pin.id);
    }
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
  private pins: Pin[] = [];
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

    // Store gate and pins for undo
    this.gate = { ...gate };
    this.pins = [];
    for (const pinId of getAllPinIds(gate)) {
      const pin = circuit.pins.get(pinId);
      if (pin) this.pins.push({ ...pin });
    }

    // Find wire nodes anchored to this gate's pins
    const pinIdSet = new Set<string>(getAllPinIds(gate) as string[]);
    this.removedNodes = [];
    this.removedSegments = [];

    const nodeIdsToRemove = new Set<string>();
    for (const node of circuit.wireNodes.values()) {
      if (node.pinId && pinIdSet.has(node.pinId as string)) {
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

    // Delete in order: segments, nodes, pins, gate
    for (const seg of this.removedSegments) {
      circuit.wireSegments.delete(seg.id);
    }
    for (const node of this.removedNodes) {
      circuit.wireNodes.delete(node.id);
    }
    for (const pin of this.pins) {
      circuit.pins.delete(pin.id);
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
    for (const pin of this.pins) {
      circuit.pins.set(pin.id, pin);
    }
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
  private dx: number;
  private dy: number;
  private disconnected: boolean;

  /** Wire nodes that moved along with the gates (anchored to pins + extra). */
  private movedNodeIds: WireNodeId[] = [];
  /** Saved pinId mappings for disconnect drag undo. */
  private detachedPins: { nodeId: WireNodeId; pinId: PinId }[] = [];
  /** Wire nodes reconnected to pins after move. */
  private reconnectedNodes: ReconnectedNode[] = [];

  constructor(state: EditorState, gateIds: GateId[], dx: number, dy: number, extraNodeIds: WireNodeId[] = [], disconnected = false) {
    this.state = state;
    this.gateIds = gateIds;
    this.extraNodeIds = extraNodeIds;
    this.dx = dx;
    this.dy = dy;
    this.disconnected = disconnected;
  }

  /** Store detached pin mappings (set by InputHandler before execute, for undo support). */
  saveDetachedPins(detached: { nodeId: WireNodeId; pinId: PinId }[]): void {
    this.detachedPins = detached;
  }

  execute(): void {
    const { circuit } = this.state;

    for (const gateId of this.gateIds) {
      const gate = circuit.gates.get(gateId);
      if (!gate) continue;
      gate.x += this.dx;
      gate.y += this.dy;
    }

    const anchored = this.disconnected ? [] : getAnchoredNodeIds(circuit, this.gateIds);
    const allIds = new Set<WireNodeId>([...anchored, ...this.extraNodeIds]);
    this.movedNodeIds = [...allIds];
    for (const nodeId of this.movedNodeIds) {
      const node = circuit.wireNodes.get(nodeId);
      if (node) { node.x += this.dx; node.y += this.dy; }
    }

    this.reconnectedNodes = reconnectPinNodes(circuit, this.gateIds);
    this.state.circuitDirty = true;
  }

  undo(): void {
    const { circuit } = this.state;

    undoReconnectPinNodes(circuit, this.reconnectedNodes);

    for (const gateId of this.gateIds) {
      const gate = circuit.gates.get(gateId);
      if (!gate) continue;
      gate.x -= this.dx;
      gate.y -= this.dy;
    }

    for (const nodeId of this.movedNodeIds) {
      const node = circuit.wireNodes.get(nodeId);
      if (node) {
        node.x -= this.dx;
        node.y -= this.dy;
      }
    }

    // Restore detached pin connections
    for (const { nodeId, pinId } of this.detachedPins) {
      const node = circuit.wireNodes.get(nodeId);
      if (node) node.pinId = pinId;
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
  private savedGatePositions: { id: GateId; x: number; y: number; rotation: number }[] = [];
  private savedNodePositions: { id: WireNodeId; x: number; y: number }[] = [];

  constructor(state: EditorState, gateIds: GateId[], extraNodeIds: WireNodeId[] = []) {
    this.state = state;
    this.gateIds = gateIds;
    this.extraNodeIds = extraNodeIds;
  }

  execute(): void {
    const saved = rotateGroup(this.state.circuit, this.gateIds, this.extraNodeIds, RotateGatesCommand.ROTATION_STEP);
    this.savedGatePositions = saved.gates;
    this.savedNodePositions = saved.nodes;
    this.state.circuitDirty = true;
  }

  undo(): void {
    const { circuit } = this.state;
    for (const saved of this.savedGatePositions) {
      const gate = circuit.gates.get(saved.id);
      if (gate) {
        gate.x = saved.x;
        gate.y = saved.y;
        gate.rotation = saved.rotation as 0 | 90 | 180 | 270;
      }
    }
    for (const saved of this.savedNodePositions) {
      const node = circuit.wireNodes.get(saved.id);
      if (node) { node.x = saved.x; node.y = saved.y; }
    }
    for (const gateId of this.gateIds) {
      const gate = circuit.gates.get(gateId);
      if (gate) updateAnchoredNodes(gate, circuit);
    }
    this.state.circuitDirty = true;
  }
}

export class AddWireNodeCommand implements Command {
  readonly description = 'Add wire node';
  private state: EditorState;
  private nodeId: WireNodeId;
  private x: number;
  private y: number;
  private pinId: PinId | undefined;

  constructor(state: EditorState, x: number, y: number, pinId?: PinId) {
    this.state = state;
    this.x = x;
    this.y = y;
    this.pinId = pinId;
    this.nodeId = generateId('wn') as WireNodeId;
  }

  execute(): void {
    const node: WireNode = { id: this.nodeId, x: this.x, y: this.y };
    if (this.pinId) node.pinId = this.pinId;
    this.state.circuit.wireNodes.set(this.nodeId, node);
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
  private node: WireNode | null = null;
  private removedSegments: WireSegment[] = [];
  private removedOrphanNodes: WireNode[] = [];

  constructor(state: EditorState, nodeId: WireNodeId) {
    this.state = state;
    this.nodeId = nodeId;
  }

  execute(): void {
    const { circuit } = this.state;
    const node = circuit.wireNodes.get(this.nodeId);
    if (!node) return;
    this.node = { ...node };

    // Remove all connected segments
    this.removedSegments = [];
    const neighborNodeIds = new Set<string>();
    for (const seg of circuit.wireSegments.values()) {
      if (seg.from === this.nodeId || seg.to === this.nodeId) {
        this.removedSegments.push({ ...seg });
        // Track the other endpoint
        const otherId = seg.from === this.nodeId ? seg.to : seg.from;
        if (otherId !== this.nodeId) neighborNodeIds.add(otherId as string);
      }
    }
    for (const seg of this.removedSegments) {
      circuit.wireSegments.delete(seg.id);
    }

    circuit.wireNodes.delete(this.nodeId);

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
    if (this.node) circuit.wireNodes.set(this.nodeId, this.node);
    for (const seg of this.removedSegments) {
      circuit.wireSegments.set(seg.id, seg);
    }
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

  constructor(state: EditorState, from: WireNodeId, to: WireNodeId, color?: string) {
    this.state = state;
    this.from = from;
    this.to = to;
    this.color = color;
    this.segmentId = generateId('ws') as WireSegmentId;
  }

  execute(): void {
    const seg: WireSegment = { id: this.segmentId, from: this.from, to: this.to };
    if (this.color) seg.color = this.color;
    this.state.circuit.wireSegments.set(this.segmentId, seg);
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
  private segment: WireSegment | null = null;
  private removedOrphanNodes: WireNode[] = [];

  constructor(state: EditorState, segmentId: WireSegmentId, cleanOrphans = true) {
    this.state = state;
    this.segmentId = segmentId;
    this.cleanOrphans = cleanOrphans;
  }

  execute(): void {
    const { circuit } = this.state;
    const seg = circuit.wireSegments.get(this.segmentId);
    if (!seg) return;
    this.segment = { ...seg };
    circuit.wireSegments.delete(this.segmentId);

    // Clean up orphaned free nodes (no remaining segments, not anchored to a pin)
    if (!this.cleanOrphans) { this.removedOrphanNodes = []; this.state.circuitDirty = true; return; }
    this.removedOrphanNodes = cleanupOrphanNodes(circuit, [seg.from, seg.to]);

    this.state.circuitDirty = true;
  }

  undo(): void {
    // Restore orphaned nodes first, then the segment
    for (const node of this.removedOrphanNodes) {
      this.state.circuit.wireNodes.set(node.id, node);
    }
    if (this.segment) {
      this.state.circuit.wireSegments.set(this.segmentId, this.segment);
    }
    this.state.circuitDirty = true;
  }
}
