import type { GateId, Net, NetId, PinId, WireNode, WireNodeId, WireSegment, WireSegmentId } from './types.ts';
import type { Gate, Pin } from "./gates.ts";

export class Circuit {
  gates = new Map<GateId, Gate>();
  pins = new Map<PinId, Pin>();
  wireNodes = new Map<WireNodeId, WireNode>();
  wireSegments = new Map<WireSegmentId, WireSegment>();
  nets = new Map<NetId, Net>();
  delayState = new Map<GateId, number | null>();

  getGate(id: GateId): Gate {
    const gate = this.gates.get(id);
    if (!gate) throw new Error(`Gate ${id} not found`);
    return gate;
  }

  getPin(id: PinId): Pin {
    const pin = this.pins.get(id);
    if (!pin) throw new Error(`Pin ${id} not found`);
    return pin;
  }

  getWireNode(id: WireNodeId): WireNode {
    const node = this.wireNodes.get(id);
    if (!node) throw new Error(`WireNode ${id} not found`);
    return node;
  }

  getWireSegment(id: WireSegmentId): WireSegment {
    const seg = this.wireSegments.get(id);
    if (!seg) throw new Error(`WireSegment ${id} not found`);
    return seg;
  }
}
