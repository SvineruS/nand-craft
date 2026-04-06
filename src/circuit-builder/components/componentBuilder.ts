import type { ComponentId, Vec2 } from '../editor/types.ts';
import { generateId } from '../editor/types.ts';
import type { ComponentDefinition, ComponentPin } from './componentTypes.ts';
import type { Circuit } from '../simulation/circuit.ts';
import { serializeCircuit } from '../persistence/serialize.ts';
import { isInputGate, isOutputGate, type GateType } from '../simulation/gateTypes.ts';
import { getPinBitWidth } from '../editor/gates.ts';
import { GRID_SIZE, MAJOR_GRID_EVERY } from '../editor/consts.ts';

/** Grid shrink factor: 1 major cell in editor = 1 grid point in placed component */
const SHRINK = GRID_SIZE * MAJOR_GRID_EVERY;

/**
 * Build a ComponentDefinition from a circuit in the component editor.
 * Gates map to grid points. Size = span between outermost points.
 * SVG squares are centered on grid points.
 */
export function buildComponentDefinition(
  circuit: Circuit,
  name: string,
  existingId?: ComponentId,
): ComponentDefinition {
  const id = existingId ?? generateId('cmp') as ComponentId;

  // Find bounding box origin (min position) of all gates in grid points
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const gate of circuit.gates.values()) {
    const sp = shrinkPos(gate.pos);
    if (sp.x < minX) minX = sp.x;
    if (sp.y < minY) minY = sp.y;
    if (sp.x > maxX) maxX = sp.x;
    if (sp.y > maxY) maxY = sp.y;
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0; }

  // Width/height = span between outermost grid points
  const width = maxX - minX;
  const height = maxY - minY;

  // Collect IO gates → pins with positions relative to bounding box origin
  const inputs: ComponentPin[] = [];
  const outputs: ComponentPin[] = [];

  for (const gate of circuit.gates.values()) {
    const sp = shrinkPos(gate.pos);
    const relPos = { x: sp.x - minX, y: sp.y - minY };

    if (isInputGate(gate.type)) {
      inputs.push({
        name: gate.label ?? `in${inputs.length}`,
        bitWidth: getPinBitWidth(gate.type, 'output', 0),
        gridPos: relPos,
        kind: 'input',
      });
    } else if (isOutputGate(gate.type)) {
      outputs.push({
        name: gate.label ?? `out${outputs.length}`,
        bitWidth: getPinBitWidth(gate.type, 'input', 0),
        gridPos: relPos,
        kind: 'output',
      });
    }
  }

  // Validate: no two IO gates on the same grid point
  const allPins = [...inputs, ...outputs];
  const pointMap = new Map<string, string>();
  for (const pin of allPins) {
    const key = `${pin.gridPos.x},${pin.gridPos.y}`;
    if (pointMap.has(key)) {
      throw new Error(`IO gates "${pointMap.get(key)}" and "${pin.name}" overlap at grid point (${pin.gridPos.x}, ${pin.gridPos.y}). Move them to different major grid cells.`);
    }
    pointMap.set(key, pin.name);
  }

  // Non-IO gate positions relative to origin (IO gates shown as pins only, not squares)
  const relPositions = [...circuit.gates.values()]
    .filter(g => !isInputGate(g.type) && !isOutputGate(g.type))
    .map(g => {
      const sp = shrinkPos(g.pos);
      return { x: sp.x - minX, y: sp.y - minY };
    });

  // Generate SVG: squares centered on grid points
  const svg = generateSvgLayers(relPositions, width, height);

  const usedGateTypes = collectUsedGateTypes(circuit);

  return {
    id,
    name,
    circuit: JSON.parse(serializeCircuit(circuit)),
    inputs,
    outputs,
    width,
    height,
    svg,
    usedGateTypes,
  };
}

function shrinkPos(pos: Vec2): Vec2 {
  return {
    x: Math.round(pos.x / SHRINK),
    y: Math.round(pos.y / SHRINK),
  };
}

import type { SvgLayer } from '../editor/gates.ts';

/** Generate SVG layers: [0] = subtle border outline, [1] = solid inner squares. */
function generateSvgLayers(relPositions: Vec2[], width: number, height: number): SvgLayer[] {
  // Border just barely contains the squares (r=0.3) with a tiny gap
  const p = 0.35;
  const borderPath = `M ${-p},${-p} L ${width + p},${-p} L ${width + p},${height + p} L ${-p},${height + p} Z`;

  const occupied = new Set<string>();
  for (const pos of relPositions) {
    occupied.add(`${pos.x},${pos.y}`);
  }

  const r = 0.3;
  let squaresPath = '';
  for (let y = 0; y <= height; y++) {
    for (let x = 0; x <= width; x++) {
      if (occupied.has(`${x},${y}`)) {
        squaresPath += `M ${x - r},${y - r} L ${x + r},${y - r} L ${x + r},${y + r} L ${x - r},${y + r} Z `;
      }
    }
  }

  return [
    { path: borderPath, fill: true, stroke: true, alpha: 0.5 },
    { path: squaresPath.trim() },
  ];
}

function collectUsedGateTypes(circuit: Circuit): GateType[] {
  const types = new Set<GateType>();
  for (const gate of circuit.gates.values()) {
    types.add(gate.type);
  }
  return [...types];
}
