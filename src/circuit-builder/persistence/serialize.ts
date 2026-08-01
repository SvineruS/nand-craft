import { Circuit } from '../simulation/circuit.ts';
import {
  bumpNextId,
  type GateId,
  type Rotation,
  type WireNode,
  type WireNodeId,
  type WireSegment,
  type WireSegmentId,
} from '../editor/types.ts';
import type { Gate } from "../editor/gates.ts";
import { updateAnchoredNodes } from '../editor/utils/geometry.ts';
import { RAM_SIZE } from '../simulation/gateTypes.ts';

/** A gate as stored on disk. Rotation is optional — the level map data omits the default. */
type SerializedGate = Omit<Gate, 'id' | 'rotation'> & { rotation?: Rotation };

export interface SerializedCircuit {
  version: 1;
  gates: [string, SerializedGate][];
  wireNodes: [string, Omit<WireNode, 'id'>][];
  wireSegments: [string, Omit<WireSegment, 'id'>][];
}

/**
 * Persisted gate fields, listed explicitly rather than spread.
 *
 * A spread would also capture runtime-only values that happen to live on the gate, and
 * would silently start persisting anything added later. Component instances are the reason
 * this matters: they used to sit on the gate and went into the save file as kilobytes of
 * unrecoverable noise each. They now live on Circuit.componentInstances.
 */
function serializeGate(gate: Gate): SerializedGate {
  const out: SerializedGate = {
    type: gate.type,
    pos: { x: gate.pos.x, y: gate.pos.y },
    rotation: gate.rotation,
  };
  if (gate.value !== undefined) out.value = gate.value;
  if (gate.register !== undefined) out.register = gate.register;
  if (gate.cells !== undefined) out.cells = trimTrailingZeros(gate.cells);
  if (gate.label !== undefined) out.label = gate.label;
  if (gate.canRemove !== undefined) out.canRemove = gate.canRemove;
  if (gate.canMove !== undefined) out.canMove = gate.canMove;
  return out;
}

/**
 * RAM contents round-trip trimmed, because a mostly-empty 256-byte store would otherwise
 * add a wall of zeros to every save. padCells restores the dense array the tick loop indexes.
 */
function trimTrailingZeros(cells: number[]): number[] {
  let end = cells.length;
  while (end > 0 && cells[end - 1] === 0) end--;
  return cells.slice(0, end);
}

function padCells(stored: number[]): number[] {
  const cells = new Array<number>(RAM_SIZE).fill(0);
  const count = Math.min(stored.length, RAM_SIZE);
  for (let i = 0; i < count; i++) cells[i] = stored[i] & 0xFF;
  return cells;
}

/**
 * Rebuild a gate from stored fields, listed explicitly for the same reason as
 * serializeGate: unknown keys in the stored JSON must not ride along onto the model.
 */
function deserializeGate(id: GateId, stored: SerializedGate): Gate {
  const gate: Gate = {
    id,
    type: stored.type,
    pos: stored.pos,
    rotation: stored.rotation ?? 0,
  };
  if (stored.value !== undefined) gate.value = stored.value;
  if (stored.register !== undefined) gate.register = stored.register;
  if (stored.cells !== undefined) gate.cells = padCells(stored.cells);
  if (stored.label !== undefined) gate.label = stored.label;
  if (stored.canRemove !== undefined) gate.canRemove = stored.canRemove;
  if (stored.canMove !== undefined) gate.canMove = stored.canMove;
  return gate;
}

export function serializeCircuit(circuit: Circuit): string {
  const data: SerializedCircuit = {
    version: 1,
    gates: [...circuit.gates.entries()].map(([id, g]) => [id as string, serializeGate(g)]),
    wireNodes: [...circuit.wireNodes.entries()].map(([id, n]) => {
      const { id: _, ...rest } = n;
      return [id as string, rest];
    }),
    wireSegments: [...circuit.wireSegments.entries()].map(([id, s]) => {
      const { id: _, ...rest } = s;
      return [id as string, rest];
    }),
  };
  return JSON.stringify(data);
}

export function deserializeCircuitFromJson(json: string): Circuit {
  const data: SerializedCircuit = JSON.parse(json);
  return deserializeCircuit(data);
}

export function deserializeCircuit(data: SerializedCircuit): Circuit {
  const circuit = new Circuit();

  for (const [id, gate] of data.gates) {
    circuit.addGate(deserializeGate(id as GateId, gate));
  }
  for (const [id, node] of data.wireNodes) {
    circuit.addWireNode({ ...node, id: id as WireNodeId });
  }
  for (const [id, seg] of data.wireSegments) {
    circuit.addWireSegment({ ...seg, id: id as WireSegmentId });
  }

  // An anchored node's position *is* its pin's position — every move and rotation re-syncs
  // it. Saved positions are therefore redundant, and stale whenever a gate definition's pin
  // layout changes: a save written when the splitter was two columns wide would draw its
  // wires one cell clear of the gate. Re-deriving on load keeps old saves correct instead of
  // needing a migration per layout change.
  for (const gate of circuit.gates.values()) {
    updateAnchoredNodes(gate, circuit);
  }

  // Ensure ID counter is past the highest used ID (use max to never decrease it,
  // because component inner circuits may be deserialized during simulation)
  let maxId = 0;
  const allIds = [
    ...data.gates.map(e => e[0]),
    ...data.wireNodes.map(e => e[0]),
    ...data.wireSegments.map(e => e[0]),
  ];
  for (const id of allIds) {
    const match = id.match(/_(\d+)$/);
    if (match) {
      maxId = Math.max(maxId, parseInt(match[1], 10));
    }
  }
  bumpNextId(maxId + 1);

  return circuit;
}
