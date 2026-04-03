import { Circuit } from '../simulation/circuit.ts';
import {
  setNextId,
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

export function serializeCircuit(circuit: Circuit): string {
  const data: SerializedCircuit = {
    version: 1,
    gates: [...circuit.gates.entries()].map(([id, g]) => {
      const { id: _, ...rest } = g;
      return [id as string, rest];
    }),
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

  // Restore ID counter past the highest used ID
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
  setNextId(maxId + 1);

  return circuit;
}
