import type { Circuit, Gate, GateId, PinId, WireNode, WireNodeId } from '../types.ts';
import { GATE_DEFS } from './gateDefs.ts';

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

/**
 * Pin positions for a gate — reads from definition, applies gate position + rotation.
 */
export function getPinPositions(
  gate: Gate,
): Map<PinId, { x: number; y: number }> {
  const result = new Map<PinId, { x: number; y: number }>();
  const { w, h } = getGateDims(gate);
  const cx = gate.x + w / 2;
  const cy = gate.y + h / 2;

  const def = GATE_DEFS[gate.type];
  const allPinIds = getAllPinIds(gate);
  const defPins = def.pins;

  // Guard: iterate only up to the lesser count in case the gate instance has
  // fewer runtime pins than the definition declares (e.g. dynamically configured components).
  for (let i = 0; i < Math.min(allPinIds.length, defPins.length); i++) {
    const pinDef = defPins[i];
    const pinWorldX = gate.x + pinDef.x * GRID_SIZE;
    const pinWorldY = gate.y + pinDef.y * GRID_SIZE;
    const rotated = rotatePoint(pinWorldX, pinWorldY, cx, cy, gate.rotation);
    result.set(allPinIds[i], rotated);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Rotation + grid helpers
// ---------------------------------------------------------------------------

function rotatePoint(
  px: number, py: number, cx: number, cy: number,
  rotation: 0 | 90 | 180 | 270,
): { x: number; y: number } {
  const dx = px - cx;
  const dy = py - cy;
  switch (rotation) {
    case 0: return { x: px, y: py };
    case 90: return { x: cx - dy, y: cy + dx };
    case 180: return { x: cx - dx, y: cy - dy };
    case 270: return { x: cx + dy, y: cy - dx };
    default: return { x: px, y: py };
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
  | { kind: 'pin'; pinId: PinId; x: number; y: number }
  | { kind: 'node'; nodeId: WireNodeId; x: number; y: number };

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
        node.x = pos.x; node.y = pos.y;
      }
    }
  }
}

export interface ReconnectedNode { nodeId: WireNodeId; pinId: PinId; prevX: number; prevY: number }

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
        if (Math.abs(node.x - pos.x) < 2 && Math.abs(node.y - pos.y) < 2) {
          result.push({ nodeId: node.id, pinId, prevX: node.x, prevY: node.y });
          node.pinId = pinId;
          node.x = pos.x;
          node.y = pos.y;
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
    node.x = r.prevX;
    node.y = r.prevY;
  }
}

/** Rotate gates + free wire nodes around group center by `degrees`. Returns saved positions for undo. */
export function rotateGroup(
  circuit: Circuit,
  gateIds: GateId[],
  extraNodeIds: WireNodeId[],
  degrees: number,
): {
  gates: { id: GateId; x: number; y: number; rotation: number }[];
  nodes: { id: WireNodeId; x: number; y: number }[];
} {
  const savedGates: { id: GateId; x: number; y: number; rotation: number }[] = [];
  const savedNodes: { id: WireNodeId; x: number; y: number }[] = [];

  // Single gate, no extra nodes: just rotate in place
  if (gateIds.length <= 1 && extraNodeIds.length === 0) {
    for (const gateId of gateIds) {
      const gate = circuit.gates.get(gateId);
      if (!gate) continue;
      savedGates.push({ id: gateId, x: gate.x, y: gate.y, rotation: gate.rotation });
      const { w, h } = getGateDims(gate);
      const oldOffset = gateGridOffset(gate.rotation, w, h);
      gate.rotation = rotateBy(gate.rotation, degrees);
      const newOffset = gateGridOffset(gate.rotation, w, h);
      const delta = newOffset - oldOffset;
      gate.x += delta;
      gate.y += delta;
      updateAnchoredNodes(gate, circuit);
    }
    return { gates: savedGates, nodes: savedNodes };
  }

  // Multiple items: compute group center, rotate positions around it
  let cx = 0, cy = 0, count = 0;
  for (const gateId of gateIds) {
    const gate = circuit.gates.get(gateId);
    if (!gate) continue;
    const dims = getGateDims(gate);
    cx += gate.x + dims.w / 2; cy += gate.y + dims.h / 2; count++;
  }
  for (const nodeId of extraNodeIds) {
    const node = circuit.wireNodes.get(nodeId);
    if (node) { cx += node.x; cy += node.y; count++; }
  }
  if (count === 0) return { gates: savedGates, nodes: savedNodes };
  cx /= count; cy /= count;

  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  for (const gateId of gateIds) {
    const gate = circuit.gates.get(gateId);
    if (!gate) continue;
    savedGates.push({ id: gateId, x: gate.x, y: gate.y, rotation: gate.rotation });
    const dims = getGateDims(gate);
    const dx = gate.x + dims.w / 2 - cx;
    const dy = gate.y + dims.h / 2 - cy;
    const newCx = cx + dx * cos - dy * sin;
    const newCy = cy + dx * sin + dy * cos;
    gate.rotation = rotateBy(gate.rotation, degrees);
    const offset = gateGridOffset(gate.rotation, dims.w, dims.h);
    gate.x = snapToGrid(newCx - dims.w / 2, offset);
    gate.y = snapToGrid(newCy - dims.h / 2, offset);
    updateAnchoredNodes(gate, circuit);
  }

  for (const nodeId of extraNodeIds) {
    const node = circuit.wireNodes.get(nodeId);
    if (!node) continue;
    savedNodes.push({ id: nodeId, x: node.x, y: node.y });
    const dx = node.x - cx;
    const dy = node.y - cy;
    node.x = snapToGrid(cx + dx * cos - dy * sin);
    node.y = snapToGrid(cy + dx * sin + dy * cos);
  }

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
      removed.push({ ...node });
      circuit.wireNodes.delete(nid);
    }
  }
  return removed;
}
