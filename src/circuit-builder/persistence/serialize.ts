import { Circuit } from '../simulation/circuit.ts';
import {
  bumpNextId,
  type GateId,
  type WireNode,
  type WireNodeId,
  type WireSegment,
  type WireSegmentId,
} from '../editor/types.ts';
import type { Gate } from "../editor/gates.ts";

export interface SerializedCircuit {
  version: 1;
  gates: [string, Omit<Gate, 'id'>][];
  wireNodes: [string, Omit<WireNode, 'id'>][];
  wireSegments: [string, Omit<WireSegment, 'id'>][];
}

/**
 * Persisted gate fields, listed explicitly rather than spread.
 *
 * A spread would also capture runtime-only values living on the gate — most importantly
 * a component gate's `state`, which holds a live Circuit (with its compiled program and
 * typed arrays). JSON.stringify turns that into kilobytes of unrecoverable noise per
 * instance, because the inner Maps flatten to `{}`.
 */
function serializeGate(gate: Gate): Omit<Gate, 'id'> {
  const out: Omit<Gate, 'id'> = {
    type: gate.type,
    pos: { x: gate.pos.x, y: gate.pos.y },
    rotation: gate.rotation,
  };
  if (gate.label !== undefined) out.label = gate.label;
  if (gate.canRemove !== undefined) out.canRemove = gate.canRemove;
  if (gate.canMove !== undefined) out.canMove = gate.canMove;
  // Only primitive state round-trips: constant values, sequential registers, and the
  // level-map status string. Object state (a component's inner Circuit) is rebuilt on
  // demand by evaluateComponent, so it is deliberately dropped.
  if (isPersistableState(gate.state)) out.state = gate.state;
  return out;
}

function isPersistableState(state: unknown): boolean {
  return typeof state === 'number' || typeof state === 'string' || typeof state === 'boolean';
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
    circuit.gates.set(id as GateId, { id: id as GateId, ...gate });
  }
  for (const [id, node] of data.wireNodes) {
    circuit.wireNodes.set(id as WireNodeId, { id: id as WireNodeId, ...node });
  }
  for (const [id, seg] of data.wireSegments) {
    circuit.wireSegments.set(id as WireSegmentId, { id: id as WireSegmentId, ...seg });
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
