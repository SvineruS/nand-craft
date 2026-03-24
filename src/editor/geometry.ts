import type { Circuit, Gate, GateId, PinId, WireNode, WireNodeId } from '../types.ts';
import { GATE_DEFS } from './gateDefs.ts';
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
  const def = GATE_DEFS[gate.type];
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
  const result = new Map<PinId, Vec2>();
  const center = gateCenter(gate);

  const def = GATE_DEFS[gate.type];
  const allPinIds = getAllPinIds(gate);
  const defPins = def.pins;

  for (let i = 0; i < Math.min(allPinIds.length, defPins.length); i++) {
    const pinWorld = Vec2.add(gate.pos, Vec2.scale(defPins[i], GRID_SIZE));
    const rotated = rotatePoint(pinWorld, center, gate.rotation);
    result.set(allPinIds[i], rotated);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Rotation + grid helpers
// ---------------------------------------------------------------------------

function rotatePoint(
  p: Vec2, c: Vec2,
  rotation: 0 | 90 | 180 | 270,
): Vec2 {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  switch (rotation) {
    case 0: return { x: p.x, y: p.y };
    case 90: return { x: c.x - dy, y: c.y + dx };
    case 180: return { x: c.x - dx, y: c.y - dy };
    case 270: return { x: c.x + dy, y: c.y - dx };
    default: return { x: p.x, y: p.y };
  }
}

function rotateBy(current: 0|90|180|270, degrees: number): 0|90|180|270 {
  return (((current + degrees) % 360 + 360) % 360) as 0|90|180|270;
}

export function snapToGrid(v: number, offset = 0): number {
  return Math.round((v - offset) / GRID_SIZE) * GRID_SIZE + offset;
}

/**
 * Grid offset needed for a gate at the given rotation.
 * Non-square gates with odd (width+height) need a half-grid offset at 90°/270°
 * so that rotated pin positions land on grid lines.
 */
export function gateGridOffset(rotation: 0 | 90 | 180 | 270, w: number, h: number): number {
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
    if (node.pinId === pinId) return node.id;
  }
  return null;
}

/** Sync anchored wire-node positions to their gate's current pin positions. */
export function updateAnchoredNodes(gate: Gate, circuit: Circuit): void {
  const positions = getPinPositions(gate);
  for (const [pinId, pos] of positions) {
    for (const node of circuit.wireNodes.values()) {
      if (node.pinId === (pinId as unknown as PinId)) {
        node.pos = pos;
      }
    }
  }
}

export interface ReconnectedNode { nodeId: WireNodeId; pinId: PinId; prevPos: Vec2 }

/** Anchor free wire nodes that are near gate pins. Returns what changed (for undo). */
export function reconnectPinNodes(circuit: Circuit, gateIds: GateId[]): ReconnectedNode[] {
  const result: ReconnectedNode[] = [];
  for (const gateId of gateIds) {
    const gate = circuit.gates.get(gateId);
    if (!gate) continue;
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
    const node = circuit.wireNodes.get(r.nodeId);
    if (!node) continue;
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
  gateIds: GateId[],
  extraNodeIds: WireNodeId[],
  degrees: number,
): {
  gates: { id: GateId; pos: Vec2; rotation: number }[];
  nodes: { id: WireNodeId; pos: Vec2 }[];
} {
  const gates = gateIds.map(id => circuit.gates.get(id)).filter(g => g != null);
  const nodes = extraNodeIds.map(id => circuit.wireNodes.get(id)).filter(n => n != null);
  if (gates.length === 0 && nodes.length === 0) return { gates: [], nodes: [] };

  const points: Vec2[] = [...gates.map(g => gateCenter(g)), ...nodes.map(n => n.pos)];
  const center = Vec2.avg(points);
  const rad = (degrees * Math.PI) / 180;

  const savedGates = gates.map(gate => {
    const saved = { id: gate.id, pos: Vec2.copy(gate.pos), rotation: gate.rotation };
    const newCenter = Vec2.rotateAround(gateCenter(gate), center, rad);
    gate.rotation = rotateBy(gate.rotation, degrees);
    const { w, h } = getGateDims(gate);
    const offset = gateGridOffset(gate.rotation, w, h);
    gate.pos = Vec2.snap(gatePosFromCenter(gate, newCenter), offset);
    updateAnchoredNodes(gate, circuit);
    return saved;
  });

  const savedNodes = nodes.map(node => {
    const saved = { id: node.id, pos: Vec2.copy(node.pos) };
    node.pos = Vec2.snap(Vec2.rotateAround(node.pos, center, rad));
    return saved;
  });

  return { gates: savedGates, nodes: savedNodes };
}

export function getAnchoredNodeIds(circuit: Circuit, gateIds: GateId[]): WireNodeId[] {
  const pinIdSet = new Set<string>();
  for (const gateId of gateIds) {
    const gate = circuit.gates.get(gateId);
    if (gate) {
      for (const p of getAllPinIds(gate)) pinIdSet.add(p as string);
    }
  }
  const result: WireNodeId[] = [];
  for (const node of circuit.wireNodes.values()) {
    if (node.pinId && pinIdSet.has(node.pinId as string)) {
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
      if (s.from === nid || s.to === nid) { hasSegments = true; break; }
    }
    if (!hasSegments) {
      removed.push({ ...node, pos: Vec2.copy(node.pos) });
      circuit.wireNodes.delete(nid);
    }
  }
  return removed;
}
