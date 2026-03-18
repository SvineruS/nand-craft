import type { Circuit, Gate, GateId, GateType, PinId, WireNodeId, Pin } from '../types.ts';

export const GRID_SIZE = 20;

// ---------------------------------------------------------------------------
// Gate Definition Registry
// ---------------------------------------------------------------------------

export interface PinDef {
  kind: 'input' | 'output';
  x: number;  // grid units relative to gate origin
  y: number;  // grid units relative to gate origin
  label?: string;
  bitWidth?: number;  // override per-pin (e.g. tristate enable is always 1-bit)
}

export interface GateDefinition {
  label: string;
  description: string;
  width: number;   // grid units
  height: number;  // grid units
  pins: PinDef[];
  svg?: string;    // SVG path data scaled to width×height grid units
  placeable?: boolean; // show in sidebar (default false)
  color?: string;  // fill color for the gate body
  stroke?: string; // stroke color for the gate outline
}

// SVG paths are in grid-unit coordinates (0,0 to width,height)
// They get scaled by GRID_SIZE at render time

export const GATE_DEFS: Record<GateType, GateDefinition> = {
  nand: {
    label: 'NAND', description: 'Bitwise NAND gate', width: 3, height: 3, placeable: true,
    color: '#3b2d50', stroke: '#7c5aad',
    pins: [
      { kind: 'input', x: 0, y: 1 },
      { kind: 'input', x: 0, y: 2 },
      { kind: 'output', x: 3, y: 1.5 },
    ],
    svg: 'M 0.3,0.3 L 0.3,2.7 L 1.5,2.7 A 1.2,1.2 0 0,0 1.5,0.3 Z M 2.65,1.5 m -0.2,0 a 0.2,0.2 0 1,0 0.4,0 a 0.2,0.2 0 1,0 -0.4,0',
  },
  and: {
    label: 'AND', description: 'Bitwise AND gate', width: 3, height: 3, placeable: true,
    color: '#2d3a50', stroke: '#5a8aad',
    pins: [
      { kind: 'input', x: 0, y: 1 },
      { kind: 'input', x: 0, y: 2 },
      { kind: 'output', x: 3, y: 1.5 },
    ],
    svg: 'M 0.3,0.3 L 0.3,2.7 L 1.5,2.7 A 1.2,1.2 0 0,0 1.5,0.3 Z',
  },
  or: {
    label: 'OR', description: 'Bitwise OR gate', width: 3, height: 3, placeable: true,
    color: '#2d4a3a', stroke: '#5aad7c',
    pins: [
      { kind: 'input', x: 0, y: 1 },
      { kind: 'input', x: 0, y: 2 },
      { kind: 'output', x: 3, y: 1.5 },
    ],
    svg: 'M 0.3,0.3 Q 1.0,1.5 0.3,2.7 L 1.2,2.7 Q 2.4,2.7 2.7,1.5 Q 2.4,0.3 1.2,0.3 Z',
  },
  nor: {
    label: 'NOR', description: 'Bitwise NOR gate', width: 3, height: 3, placeable: true,
    color: '#3a2d4a', stroke: '#8a5aad',
    pins: [
      { kind: 'input', x: 0, y: 1 },
      { kind: 'input', x: 0, y: 2 },
      { kind: 'output', x: 3, y: 1.5 },
    ],
    svg: 'M 0.3,0.3 Q 1.0,1.5 0.3,2.7 L 1.2,2.7 Q 2.2,2.7 2.5,1.5 Q 2.2,0.3 1.2,0.3 Z M 2.65,1.5 m -0.2,0 a 0.2,0.2 0 1,0 0.4,0 a 0.2,0.2 0 1,0 -0.4,0',
  },
  not: {
    label: 'NOT', description: 'Inverter', width: 2, height: 2, placeable: true,
    color: '#4a2d3a', stroke: '#ad5a7c',
    pins: [
      { kind: 'input', x: 0, y: 1 },
      { kind: 'output', x: 2, y: 1 },
    ],
    svg: 'M 0.2,0.3 L 0.2,1.7 L 1.5,1 Z M 1.65,1 m -0.18,0 a 0.18,0.18 0 1,0 0.36,0 a 0.18,0.18 0 1,0 -0.36,0',
  },
  delay: {
    label: 'DLY', description: '1-tick delay', width: 3, height: 2, placeable: true,
    color: '#4a3a2d', stroke: '#ad8a5a',
    pins: [
      { kind: 'input', x: 0, y: 1 },
      { kind: 'output', x: 3, y: 1 },
    ],
    svg: 'M 0.3,0.3 L 2.7,0.3 L 2.7,1.7 L 0.3,1.7 Z M 1.0,1.3 L 1.5,0.5 L 2.0,1.3 Z',
  },
  tristate: {
    label: 'TRI', description: 'Tri-state buffer', width: 3, height: 3, placeable: true,
    color: '#2d4a4a', stroke: '#5aadad',
    pins: [
      { kind: 'input', x: 0, y: 1, label: 'in' },
      { kind: 'input', x: 1, y: 0, label: 'en', bitWidth: 1 },
      { kind: 'output', x: 3, y: 1.5 },
    ],
    svg: 'M 0.3,0.4 L 0.3,2.6 L 2.5,1.5 Z',
  },
  constant: {
    label: 'C', description: 'Constant value', width: 2, height: 2, placeable: true,
    color: '#3a3a2d', stroke: '#8a8a5a',
    pins: [
      { kind: 'output', x: 2, y: 1 },
    ],
    svg: 'M 0.3,0.3 L 1.7,0.3 L 1.7,1.7 L 0.3,1.7 Z',
  },
  input: {
    label: 'IN', description: 'Level input', width: 2, height: 2,
    color: '#2d3d50', stroke: '#5a8abd',
    pins: [
      { kind: 'output', x: 2, y: 1 },
    ],
    svg: 'M 0.2,0.3 L 1.3,0.3 L 1.8,1 L 1.3,1.7 L 0.2,1.7 Z',
  },
  output: {
    label: 'OUT', description: 'Level output', width: 2, height: 2,
    color: '#3d2d50', stroke: '#8a5abd',
    pins: [
      { kind: 'input', x: 0, y: 1 },
    ],
    svg: 'M 1.8,0.3 L 0.7,0.3 L 0.2,1 L 0.7,1.7 L 1.8,1.7 Z',
  },
  splitter: {
    label: 'SPL', description: 'Bus splitter', width: 2, height: 2,
    pins: [
      { kind: 'input', x: 0, y: 1 },
      { kind: 'output', x: 2, y: 1 },
    ],
  },
  joiner: {
    label: 'JON', description: 'Bus joiner', width: 2, height: 2,
    pins: [
      { kind: 'input', x: 0, y: 1 },
      { kind: 'output', x: 2, y: 1 },
    ],
  },
  component: {
    label: 'CMP', description: 'Component', width: 3, height: 3,
    pins: [
      { kind: 'input', x: 0, y: 1 },
      { kind: 'output', x: 3, y: 1 },
    ],
  },
};

// ---------------------------------------------------------------------------
// Gate geometry helpers
// ---------------------------------------------------------------------------

export function getGateDef(type: GateType): GateDefinition {
  return GATE_DEFS[type];
}

/** Get gate pixel dimensions. For splitter/joiner, adjusts for actual pin count. */
export function getGateDims(gate: Gate): { w: number; h: number } {
  const def = GATE_DEFS[gate.type];
  if (gate.type === 'splitter' || gate.type === 'joiner') {
    const maxPins = Math.max(gate.inputPins.length, gate.outputPins.length, 1);
    return { w: def.width * GRID_SIZE, h: (maxPins + 1) * GRID_SIZE };
  }
  return { w: def.width * GRID_SIZE, h: def.height * GRID_SIZE };
}

/**
 * Pin positions for a gate — reads from definition, applies gate position + rotation.
 * For splitter/joiner, generates dynamic pin positions based on actual pin count.
 */
export function getPinPositions(
  gate: Gate,
  _pins: Map<PinId, Pin>,
): Map<PinId, { x: number; y: number }> {
  const result = new Map<PinId, { x: number; y: number }>();
  const { w, h } = getGateDims(gate);
  const cx = gate.x + w / 2;
  const cy = gate.y + h / 2;

  if (gate.type === 'splitter' || gate.type === 'joiner') {
    // Dynamic pin positions for variable-height gates
    const hUnits = h / GRID_SIZE;
    const inputPins = gate.inputPins;
    const outputPins = gate.outputPins;

    const placeSide = (pinIds: PinId[], side: 'left' | 'right') => {
      const K = pinIds.length;
      if (K === 0) return;
      const startOffset = Math.floor((hUnits - 1 - K) / 2) + 1;
      for (let i = 0; i < K; i++) {
        const lx = side === 'left' ? gate.x : gate.x + w;
        const ly = gate.y + (startOffset + i) * GRID_SIZE;
        const rotated = rotatePoint(lx, ly, cx, cy, gate.rotation);
        result.set(pinIds[i], rotated);
      }
    };

    placeSide(inputPins, 'left');
    placeSide(outputPins, 'right');
  } else {
    // Fixed pin positions from definition
    const def = GATE_DEFS[gate.type];
    const allPinIds = [...gate.inputPins, ...gate.outputPins];
    const defPins = def.pins;

    for (let i = 0; i < Math.min(allPinIds.length, defPins.length); i++) {
      const pinDef = defPins[i];
      const lx = gate.x + pinDef.x * GRID_SIZE;
      const ly = gate.y + pinDef.y * GRID_SIZE;
      const rotated = rotatePoint(lx, ly, cx, cy, gate.rotation);
      result.set(allPinIds[i], rotated);
    }
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
