import type { Circuit, Gate, GateId, Pin, PinId, WireNode, WireNodeId, WireSegment, WireSegmentId } from './types.ts';

// Strict accessors — throw on missing ID (use only for internal state lookups)

export function getGate(circuit: Circuit, id: GateId): Gate {
  const gate = circuit.gates.get(id);
  if (!gate) throw new Error(`Gate ${id} not found`);
  return gate;
}

export function getPin(circuit: Circuit, id: PinId): Pin {
  const pin = circuit.pins.get(id);
  if (!pin) throw new Error(`Pin ${id} not found`);
  return pin;
}

export function getWireNode(circuit: Circuit, id: WireNodeId): WireNode {
  const node = circuit.wireNodes.get(id);
  if (!node) throw new Error(`WireNode ${id} not found`);
  return node;
}

export function getWireSegment(circuit: Circuit, id: WireSegmentId): WireSegment {
  const seg = circuit.wireSegments.get(id);
  if (!seg) throw new Error(`WireSegment ${id} not found`);
  return seg;
}
