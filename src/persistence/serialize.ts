import { Circuit } from '../editor/circuit.ts';
import {
  setNextId,
  type Gate,
  type GateId,
  type Pin,
  type PinId,
  type WireNode,
  type WireNodeId,
  type WireSegment,
  type WireSegmentId,
} from '../types.ts';
import { buildNets } from '../simulation/evaluate.ts';

interface SerializedCircuit {
  version: 1;
  gates: [string, Omit<Gate, 'id'>][];
  pins: [string, Omit<Pin, 'id' | 'value'>][];
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
    pins: [...circuit.pins.entries()].map(([id, p]) => {
      const { id: _, value: _v, ...rest } = p;
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

export function deserializeCircuit(json: string): Circuit {
  const data: SerializedCircuit = JSON.parse(json);
  const circuit = new Circuit();

  for (const [id, gate] of data.gates) {
    circuit.gates.set(id as GateId, { id: id as GateId, ...gate });
  }
  for (const [id, pin] of data.pins) {
    circuit.pins.set(id as PinId, { id: id as PinId, value: null, ...pin });
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
    ...data.pins.map(e => e[0]),
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

  buildNets(circuit);
  return circuit;
}
