import type { GateId, Net, NetId, PinRef } from '../editor/types.ts';
export { pinRefKey } from '../editor/types.ts';

/** Cached structural analysis — recomputed only when circuit topology changes. */
export interface BuildResult {
  nets: Map<NetId, Net>;
  evaluationOrder: GateId[];
  pinToNet: Map<string, NetId>;  // key is pinRefKey(PinRef)
  netDrivers: Map<NetId, PinRef[]>;
  netReceivers: Map<NetId, PinRef[]>;
  netBitWidths: Map<NetId, number>;
  shortCircuitGates: GateId[];
}

/** Per-tick simulation output — everything the renderer and UI need. */
export interface TickResult {
  outputs: Map<GateId, number | null>;
  contentionNets: string[];
  errorSegmentIds: Set<string>;
  nodeValues: Map<string, number | null>;
  nodeBitWidths: Map<string, number>;
}
