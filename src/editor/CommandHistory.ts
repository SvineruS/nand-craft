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
import { GRID_SIZE, GATE_DEFS, getGateDims, getPinPositions, findNodeForPin, getAnchoredNodeIds, rotateBy } from './geometry.ts';

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
  onChange: (() => void) | null = null;

  execute(cmd: Command): void {
    cmd.execute();
    this.undoStack.push(cmd);
    this.redoStack = [];
    this.onChange?.();
  }

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
    this.onChange?.();
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.execute();
    this.undoStack.push(cmd);
    this.onChange?.();
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
    this.state.dirty = true;
  }

  undo(): void {
    const { circuit } = this.state;
    for (const pin of this.pins) {
      circuit.pins.delete(pin.id);
    }
    circuit.gates.delete(this.gateId);
    this.state.dirty = true;
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
    for (const pinId of [...gate.inputPins, ...gate.outputPins]) {
      const pin = circuit.pins.get(pinId);
      if (pin) this.pins.push({ ...pin });
    }

    // Find wire nodes anchored to this gate's pins
    const pinIdSet = new Set<string>(
      [...gate.inputPins, ...gate.outputPins] as string[],
    );
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
    this.state.dirty = true;
  }

  undo(): void {
    const { circuit } = this.state;
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
    this.state.dirty = true;
  }
}

export class MoveGatesCommand implements Command {
  readonly description = 'Move gates';
  private state: EditorState;
  private gateIds: GateId[];
  private extraNodeIds: WireNodeId[];
  private dx: number;
  private dy: number;

  /** Wire nodes that moved along with the gates (anchored to pins + extra). */
  private movedNodeIds: WireNodeId[] = [];

  constructor(state: EditorState, gateIds: GateId[], dx: number, dy: number, extraNodeIds: WireNodeId[] = []) {
    this.state = state;
    this.gateIds = gateIds;
    this.extraNodeIds = extraNodeIds;
    this.dx = dx;
    this.dy = dy;
  }

  execute(): void {
    const { circuit } = this.state;

    for (const gateId of this.gateIds) {
      const gate = circuit.gates.get(gateId);
      if (!gate) continue;
      gate.x += this.dx;
      gate.y += this.dy;
    }

    // Anchored nodes + explicitly selected free nodes (deduplicated)
    const anchored = getAnchoredNodeIds(circuit, this.gateIds);
    const allIds = new Set<WireNodeId>([...anchored, ...this.extraNodeIds]);
    this.movedNodeIds = [...allIds];
    for (const nodeId of this.movedNodeIds) {
      const node = circuit.wireNodes.get(nodeId);
      if (node) { node.x += this.dx; node.y += this.dy; }
    }

    this.state.dirty = true;
  }

  undo(): void {
    const { circuit } = this.state;

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

    this.state.dirty = true;
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
    this.rotateGroup(RotateGatesCommand.ROTATION_STEP);
  }

  undo(): void {
    // Restore saved positions
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
    // Update anchored wire nodes to match gate positions
    for (const gateId of this.gateIds) {
      const gate = circuit.gates.get(gateId);
      if (!gate) continue;
      const positions = getPinPositions(gate);
      for (const [pinId, pos] of positions) {
        for (const node of circuit.wireNodes.values()) {
          if (node.pinId === (pinId as unknown as PinId)) {
            node.x = pos.x; node.y = pos.y;
          }
        }
      }
    }
    this.state.dirty = true;
  }

  private rotateGroup(degrees: number): void {
    const { circuit } = this.state;

    this.savedGatePositions = [];
    this.savedNodePositions = [];

    // Single gate, no extra nodes: just rotate in place
    if (this.gateIds.length <= 1 && this.extraNodeIds.length === 0) {
      for (const gateId of this.gateIds) {
        const gate = circuit.gates.get(gateId);
        if (!gate) continue;
        this.savedGatePositions.push({ id: gateId, x: gate.x, y: gate.y, rotation: gate.rotation });
        gate.rotation = rotateBy(gate.rotation, degrees);
        const positions = getPinPositions(gate);
        for (const [pinId, pos] of positions) {
          for (const node of circuit.wireNodes.values()) {
            if (node.pinId === (pinId as unknown as PinId)) {
              node.x = pos.x; node.y = pos.y;
            }
          }
        }
      }
      this.state.dirty = true;
      return;
    }

    // Multiple items: compute group center, rotate positions around it
    let cx = 0, cy = 0, count = 0;
    for (const gateId of this.gateIds) {
      const gate = circuit.gates.get(gateId);
      if (!gate) continue;
      const dims = getGateDims(gate);
      cx += gate.x + dims.w / 2; cy += gate.y + dims.h / 2; count++;
    }
    for (const nodeId of this.extraNodeIds) {
      const node = circuit.wireNodes.get(nodeId);
      if (node) { cx += node.x; cy += node.y; count++; }
    }
    if (count === 0) return;
    cx /= count; cy /= count;

    const rad = (degrees * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const snap = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE;

    // Rotate gates
    for (const gateId of this.gateIds) {
      const gate = circuit.gates.get(gateId);
      if (!gate) continue;
      this.savedGatePositions.push({ id: gateId, x: gate.x, y: gate.y, rotation: gate.rotation });

      const dims = getGateDims(gate);
      const dx = gate.x + dims.w / 2 - cx;
      const dy = gate.y + dims.h / 2 - cy;
      const newCx = cx + dx * cos - dy * sin;
      const newCy = cy + dx * sin + dy * cos;
      gate.x = snap(newCx - dims.w / 2);
      gate.y = snap(newCy - dims.h / 2);
      gate.rotation = rotateBy(gate.rotation, degrees);

      const positions = getPinPositions(gate);
      for (const [pinId, pos] of positions) {
        for (const node of circuit.wireNodes.values()) {
          if (node.pinId === (pinId as unknown as PinId)) {
            node.x = pos.x; node.y = pos.y;
          }
        }
      }
    }

    // Rotate free wire nodes
    for (const nodeId of this.extraNodeIds) {
      const node = circuit.wireNodes.get(nodeId);
      if (!node) continue;
      this.savedNodePositions.push({ id: nodeId, x: node.x, y: node.y });
      const dx = node.x - cx;
      const dy = node.y - cy;
      node.x = snap(cx + dx * cos - dy * sin);
      node.y = snap(cy + dx * sin + dy * cos);
    }

    this.state.dirty = true;
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
    this.state.dirty = true;
  }

  undo(): void {
    this.state.circuit.wireNodes.delete(this.nodeId);
    this.state.dirty = true;
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
    for (const seg of circuit.wireSegments.values()) {
      if (seg.from === this.nodeId || seg.to === this.nodeId) {
        this.removedSegments.push({ ...seg });
      }
    }
    for (const seg of this.removedSegments) {
      circuit.wireSegments.delete(seg.id);
    }

    circuit.wireNodes.delete(this.nodeId);
    this.state.dirty = true;
  }

  undo(): void {
    const { circuit } = this.state;
    if (this.node) circuit.wireNodes.set(this.nodeId, this.node);
    for (const seg of this.removedSegments) {
      circuit.wireSegments.set(seg.id, seg);
    }
    this.state.dirty = true;
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
    this.state.dirty = true;
  }

  undo(): void {
    this.state.circuit.wireSegments.delete(this.segmentId);
    this.state.dirty = true;
  }

  getSegmentId(): WireSegmentId {
    return this.segmentId;
  }
}

export class RemoveWireSegmentCommand implements Command {
  readonly description = 'Remove wire segment';
  private state: EditorState;
  private segmentId: WireSegmentId;
  private segment: WireSegment | null = null;

  constructor(state: EditorState, segmentId: WireSegmentId) {
    this.state = state;
    this.segmentId = segmentId;
  }

  execute(): void {
    const seg = this.state.circuit.wireSegments.get(this.segmentId);
    if (!seg) return;
    this.segment = { ...seg };
    this.state.circuit.wireSegments.delete(this.segmentId);
    this.state.dirty = true;
  }

  undo(): void {
    if (this.segment) {
      this.state.circuit.wireSegments.set(this.segmentId, this.segment);
    }
    this.state.dirty = true;
  }
}

export class ConnectPinsCommand implements Command {
  readonly description = 'Connect pins';
  private state: EditorState;
  private pinA: PinId;
  private pinB: PinId;

  private createdNodeA: WireNodeId | null = null;
  private createdNodeB: WireNodeId | null = null;
  private createdSegmentId: WireSegmentId | null = null;

  constructor(state: EditorState, pinA: PinId, pinB: PinId) {
    this.state = state;
    this.pinA = pinA;
    this.pinB = pinB;
  }

  execute(): void {
    const { circuit } = this.state;

    // Find or create wire node for pinA
    const nodeA = this.findOrCreateNodeForPin(this.pinA, 'a');
    // Find or create wire node for pinB
    const nodeB = this.findOrCreateNodeForPin(this.pinB, 'b');

    if (!nodeA || !nodeB) return;

    // Check for duplicate segment
    for (const seg of circuit.wireSegments.values()) {
      if ((seg.from === nodeA && seg.to === nodeB) || (seg.from === nodeB && seg.to === nodeA)) {
        return;
      }
    }

    // Create segment between the two nodes
    this.createdSegmentId = generateId('ws') as WireSegmentId;
    const seg: WireSegment = {
      id: this.createdSegmentId,
      from: nodeA,
      to: nodeB,
    };
    circuit.wireSegments.set(this.createdSegmentId, seg);
    this.state.dirty = true;
  }

  undo(): void {
    const { circuit } = this.state;

    if (this.createdSegmentId) {
      circuit.wireSegments.delete(this.createdSegmentId);
      this.createdSegmentId = null;
    }
    if (this.createdNodeA) {
      circuit.wireNodes.delete(this.createdNodeA);
      this.createdNodeA = null;
    }
    if (this.createdNodeB) {
      circuit.wireNodes.delete(this.createdNodeB);
      this.createdNodeB = null;
    }
    this.state.dirty = true;
  }

  private findOrCreateNodeForPin(pinId: PinId, which: 'a' | 'b'): WireNodeId | null {
    const { circuit } = this.state;

    const existing = findNodeForPin(circuit, pinId);
    if (existing) return existing;

    // Need to create one -- find pin position from its gate
    const pin = circuit.pins.get(pinId);
    if (!pin) return null;
    const gate = circuit.gates.get(pin.gateId);
    if (!gate) return null;

    const positions = getPinPositions(gate);
    const pos = positions.get(pinId);
    if (!pos) return null;

    const nodeId = generateId('wn') as WireNodeId;
    const node: WireNode = { id: nodeId, x: pos.x, y: pos.y, pinId };
    circuit.wireNodes.set(nodeId, node);

    if (which === 'a') {
      this.createdNodeA = nodeId;
    } else {
      this.createdNodeB = nodeId;
    }
    return nodeId;
  }
}
