import type { Circuit, Gate, GateId, PinId, WireNodeId } from '../types.ts';
import { GATE_DEFS } from './gateDefs.ts';

export const GRID_SIZE = 20;

// ---------------------------------------------------------------------------
// Gate geometry helpers
// ---------------------------------------------------------------------------

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
  const allPinIds = [...gate.inputPins, ...gate.outputPins];
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

export function rotatePoint(
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

export function rotateBy(current: 0|90|180|270, degrees: number): 0|90|180|270 {
  return (((current + degrees) % 360 + 360) % 360) as 0|90|180|270;
}

export function snapToGrid(v: number): number {
  return Math.round(v / GRID_SIZE) * GRID_SIZE;
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

export function getAnchoredNodeIds(circuit: Circuit, gateIds: GateId[]): WireNodeId[] {
  const pinIdSet = new Set<string>();
  for (const gateId of gateIds) {
    const gate = circuit.gates.get(gateId);
    if (gate) {
      for (const p of [...gate.inputPins, ...gate.outputPins]) pinIdSet.add(p as string);
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
