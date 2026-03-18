import type { Gate, GateType, PinId, Pin } from '../types.ts';

export const GRID_SIZE = 20;

/**
 * Gate dimensions in grid units: [width, height].
 * Heights are computed so that pins always land on grid intersections.
 * Height = max(inputCount, outputCount) + 1 for standard gates.
 */
export const GATE_DIMS: Record<GateType, [number, number]> = {
  nand: [3, 3],       // 2 inputs, 1 output
  delay: [3, 2],      // 1 input, 1 output
  tristate: [3, 3],   // 2 inputs (value+enable), 1 output
  input: [2, 2],      // 1 output
  output: [2, 2],     // 1 input
  splitter: [2, 2],   // variable height (recalculated)
  joiner: [2, 2],     // variable height (recalculated)
  component: [3, 3],
};

export const GATE_LABELS: Record<GateType, string> = {
  nand: 'NAND',
  delay: 'DLY',
  tristate: 'TRI',
  input: 'IN',
  output: 'OUT',
  splitter: 'SPL',
  joiner: 'JON',
  component: 'CMP',
};

export function getGateDims(gate: Gate): { w: number; h: number } {
  const maxPins = Math.max(gate.inputPins.length, gate.outputPins.length, 1);

  if (gate.type === 'splitter' || gate.type === 'joiner') {
    return {
      w: 2 * GRID_SIZE,
      h: (maxPins + 1) * GRID_SIZE,
    };
  }

  const [baseW, baseH] = GATE_DIMS[gate.type] ?? [3, 3];
  // Ensure height accommodates all pins on grid
  const neededH = maxPins + 1;
  const h = Math.max(baseH, neededH) * GRID_SIZE;
  const w = baseW * GRID_SIZE;
  return { w, h };
}

/**
 * Pin positions for a gate — all pins land on grid intersections.
 *
 * For K pins on a side of height H grid cells:
 *   startOffset = floor((H - 1 - K) / 2) + 1
 *   pin_i at gate.y + (startOffset + i) * GRID_SIZE
 *
 * Inputs on left edge (x = gate.x), outputs on right edge (x = gate.x + w).
 * Rotation is applied around the gate center.
 */
export function getPinPositions(
  gate: Gate,
  _pins: Map<PinId, Pin>,
): Map<PinId, { x: number; y: number }> {
  const result = new Map<PinId, { x: number; y: number }>();
  const { w, h } = getGateDims(gate);
  const cx = gate.x + w / 2;
  const cy = gate.y + h / 2;
  const hUnits = h / GRID_SIZE;

  const place = (pinIds: PinId[], side: 'left' | 'right') => {
    const K = pinIds.length;
    if (K === 0) return;
    const startOffset = Math.floor((hUnits - 1 - K) / 2) + 1;

    for (let i = 0; i < K; i++) {
      const lx = side === 'left' ? gate.x : gate.x + w;
      const ly = gate.y + (startOffset + i) * GRID_SIZE;
      const { x: rx, y: ry } = rotatePoint(lx, ly, cx, cy, gate.rotation);
      result.set(pinIds[i], { x: rx, y: ry });
    }
  };

  place(gate.inputPins, 'left');
  place(gate.outputPins, 'right');
  return result;
}

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
