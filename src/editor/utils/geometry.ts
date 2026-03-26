import type { Circuit } from '../circuit.ts';
import type { Gate, GateId, PinId, Rotation, WireNode, WireNodeId } from '../../types.ts';
import { getGateDefinition } from '../../levels/gates.ts';
import { Vec2 } from './vec2.ts';

export const GRID_SIZE = 20;

// ---------------------------------------------------------------------------
// Gate geometry helpers
// ---------------------------------------------------------------------------

/** All pin IDs for a gate (inputs then outputs). */
export function getAllPinIds(gate: Gate): PinId[] {
  return [...gate.inputPins, ...gate.outputPins];
}

/** Get gate pixel dimensions from definition. */
export function getGateDims(gate: Gate): { w: number; h: number } {
  const def = getGateDefinition(gate.type);
  return { w: def.width * GRID_SIZE, h: def.height * GRID_SIZE };
}

/** Gate center in world coordinates. */
export function gateCenter(gate: Gate): Vec2 {
  const { w, h } = getGateDims(gate);
  return { x: gate.pos.x + w / 2, y: gate.pos.y + h / 2 };
}

/**
 * Pin positions for a gate — reads from definition, applies gate position + rotation.
 */
export function getPinPositions(gate: Gate): Map<PinId, Vec2> {
  const center = gateCenter(gate);
  const allPinIds = getAllPinIds(gate);
  const defPins = getGateDefinition(gate.type).pins;

  const pinPositions = new Map<PinId, Vec2>();

  for (let i = 0; i < Math.min(allPinIds.length, defPins.length); i++) {
    const pinWorld = Vec2.add(gate.pos, Vec2.scale(defPins[i], GRID_SIZE));
    const rotated = rotatePoint(pinWorld, center, gate.rotation);
    pinPositions.set(allPinIds[i], rotated);
  }

  return pinPositions;
}

// ---------------------------------------------------------------------------
// Rotation + grid helpers
// ---------------------------------------------------------------------------

function rotatePoint(
  p: Vec2, c: Vec2,
  rotation: Rotation,
): Vec2 {
  const d = Vec2.sub(p, c);
  switch (rotation) {
    case 0  :
      return { x: p.x, y: p.y };
    case 90 :
      return { x: c.x - d.y, y: c.y + d.x };
    case 180:
      return { x: c.x - d.x, y: c.y - d.y };
    case 270:
      return { x: c.x + d.y, y: c.y - d.x };
    default:
      return { x: p.x, y: p.y };
  }
}

export function rotateBy(current: Rotation, degrees: number): Rotation {
  return (((current + degrees) % 360 + 360) % 360) as Rotation;
}

export function snapToGrid(v: number, offset = 0): number {
  return Math.round((v - offset) / GRID_SIZE) * GRID_SIZE + offset;
}

/**
 * Grid offset needed for a gate at the given rotation.
 * Non-square gates with odd (width+height) need a half-grid offset at 90°/270°
 * so that rotated pin positions land on grid lines.
 */
export function gateGridOffset(rotation: Rotation, w: number, h: number): number {
  if ((rotation === 90 || rotation === 270) && ((w + h) / GRID_SIZE) % 2 !== 0) {
    return GRID_SIZE / 2;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// WireEndpoint — unified abstraction for pins and wire nodes as wiring targets
// ---------------------------------------------------------------------------

export type WireEndpoint =
  | { kind: 'pin'; pinId: PinId; pos: Vec2 }
  | { kind: 'node'; nodeId: WireNodeId; pos: Vec2 };

export function findNodeForPin(circuit: Circuit, pinId: PinId): WireNodeId | null {
  for (const node of circuit.wireNodes.values()) {
    if (node.pinId === pinId)
      return node.id;
  }
  return null;
}

/** Sync anchored wire-node positions to their gate's current pin positions. */
export function updateAnchoredNodes(gate: Gate, circuit: Circuit): void {
  const positions = getPinPositions(gate);

  for (const [pinId, pos] of positions) {
    for (const node of circuit.wireNodes.values()) {

      if (node.pinId === pinId)
        node.pos = pos;

    }
  }
}

export interface ReconnectedNode {
  nodeId: WireNodeId;
  pinId: PinId;
  prevPos: Vec2
}

/** Anchor free wire nodes that are near gate pins. Returns what changed (for undo). */
export function reconnectPinNodes(circuit: Circuit, gateIds: GateId[]): ReconnectedNode[] {
  const result: ReconnectedNode[] = [];
  for (const gateId of gateIds) {
    const gate = circuit.getGate(gateId);
    const positions = getPinPositions(gate);

    for (const [pinId, pos] of positions) {
      for (const node of circuit.wireNodes.values()) {
        if (node.pinId) continue;
        if (Vec2.near(node.pos, pos, 2)) {
          result.push({ nodeId: node.id, pinId, prevPos: Vec2.copy(node.pos) });
          node.pinId = pinId;
          node.pos = pos;
          break;
        }
      }
    }

  }
  return result;
}

/** Undo reconnectPinNodes: clear pinId and restore original positions. */
export function undoReconnectPinNodes(circuit: Circuit, reconnected: ReconnectedNode[]): void {
  for (const r of reconnected) {
    const node = circuit.getWireNode(r.nodeId);
    node.pinId = undefined;
    node.pos = Vec2.copy(r.prevPos);
  }
}

/** Compute gate top-left position from a desired center position. */
function gatePosFromCenter(gate: Gate, center: Vec2): Vec2 {
  const { w, h } = getGateDims(gate);
  return Vec2.sub(center, { x: w / 2, y: h / 2 });
}

/** Rotate gates + free wire nodes around group center by `degrees`. Returns saved positions for undo. */
export function rotateGroup(
  circuit: Circuit,
  gates: Gate[],
  nodes: WireNode[],
  degrees: number,
) {
  if (gates.length === 0 && nodes.length === 0)
    return;

  const points: Vec2[] = [...gates.map(g => gateCenter(g)), ...nodes.map(n => n.pos)];
  const center = Vec2.avg(points);

  gates.map(gate => {
    const newCenter = Vec2.rotateAround(gateCenter(gate), center, degrees);
    gate.rotation = rotateBy(gate.rotation, degrees);
    const { w, h } = getGateDims(gate);
    const offset = gateGridOffset(gate.rotation, w, h);
    gate.pos = Vec2.snap(gatePosFromCenter(gate, newCenter), offset);
    updateAnchoredNodes(gate, circuit);
  });

  nodes.map(node => {
    node.pos = Vec2.snap(Vec2.rotateAround(node.pos, center, degrees));
  });

}

export function getAnchoredNodeIds(circuit: Circuit, gateIds: GateId[]): WireNodeId[] {
  const pinIdSet = new Set<string>();
  for (const gateId of gateIds) {
    for (const p of getAllPinIds(circuit.getGate(gateId)))
      pinIdSet.add(p);
  }
  const result: WireNodeId[] = [];
  for (const node of circuit.wireNodes.values()) {
    if (node.pinId && pinIdSet.has(node.pinId)) {
      result.push(node.id);
    }
  }
  return result;
}

/** Remove wire nodes that have no remaining segments and aren't anchored to a pin. */
export function cleanupOrphanNodes(circuit: Circuit, nodeIds: Iterable<WireNodeId>): WireNode[] {
  const removed: WireNode[] = [];
  for (const nid of nodeIds) {
    const node = circuit.wireNodes.get(nid);
    if (!node || node.pinId) continue;
    let hasSegments = false;
    for (const s of circuit.wireSegments.values()) {
      if (s.from === nid || s.to === nid) {
        hasSegments = true;
        break;
      }
    }
    if (!hasSegments) {
      removed.push({ ...node, pos: Vec2.copy(node.pos) });
      circuit.wireNodes.delete(nid);
    }
  }
  return removed;
}
