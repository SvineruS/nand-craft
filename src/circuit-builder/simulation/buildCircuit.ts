import { Circuit } from './circuit.ts';
import type { GateId, Net, NetId, PinRef, WireNodeId, WireSegmentId, } from '../editor/types.ts';
import { generateId, pinRefKey } from '../editor/types.ts';
import { type GateType, isInputGate, isOutputGate, isSequentialGate } from "./gateTypes.ts";
import type { BuildResult } from './types.ts';
import { getPinBitWidth, getPinCounts } from '../editor/gates.ts';

/** Derived: anything not sequential, not a pure IO gate, and not 'level'. */
function isCombinational(type: GateType): boolean {
  if (type === 'level') return false;
  if (isSequentialGate(type)) return false;
  // Plain IO gates are sources/sinks; switch variants have both inputs and outputs
  if (isInputGate(type)) return getPinCounts(type).inputs > 0;
  if (isOutputGate(type)) return getPinCounts(type).outputs > 0;
  return true;
}

// --- Union-Find for building nets ---

class UnionFind<T> {
  private parent = new Map<T, T>();
  private rank = new Map<T, number>();

  makeSet(x: T): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
  }

  find(x: T): T {
    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    let current = x;
    while (current !== root) {
      const next = this.parent.get(current)!;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(a: T, b: T): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;

    const rankA = this.rank.get(rootA)!;
    const rankB = this.rank.get(rootB)!;
    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA);
    } else {
      this.parent.set(rootB, rootA);
      this.rank.set(rootA, rankA + 1);
    }
  }

  groups(): Map<T, T[]> {
    const result = new Map<T, T[]>();
    for (const x of this.parent.keys()) {
      const root = this.find(x);
      if (!result.has(root)) {
        result.set(root, []);
      }
      result.get(root)!.push(x);
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Build: structural analysis cached until topology changes
// ---------------------------------------------------------------------------



/** Build cached structural analysis from circuit topology. */
export function build(circuit: Circuit): BuildResult {
  const nets = buildNets(circuit);
  const pinToNet = buildPinToNet(circuit, nets);
  const { netDrivers, netReceivers, netBitWidths } =
    classifyNetPins(circuit, nets);
  const evaluationOrder = topologicalSort(circuit, nets, pinToNet);
  const shortCircuitGates = detectCycles(circuit, nets, pinToNet).flat();

  return {
    nets,
    evaluationOrder,
    pinToNet,
    netDrivers,
    netReceivers,
    netBitWidths,
    shortCircuitGates,
  };
}



/** Rebuild all nets from wire connectivity using union-find. */
function buildNets(circuit: Circuit): Map<NetId, Net> {
  const uf = new UnionFind<WireNodeId>();

  for (const nodeId of circuit.wireNodes.keys()) {
    uf.makeSet(nodeId);
  }
  for (const segment of circuit.wireSegments.values()) {
    uf.union(segment.from, segment.to);
  }

  const nodeToSegments = new Map<WireNodeId, WireSegmentId[]>();
  for (const segment of circuit.wireSegments.values()) {
    for (const nid of [segment.from, segment.to]) {
      if (!nodeToSegments.has(nid)) {
        nodeToSegments.set(nid, []);
      }
      nodeToSegments.get(nid)!.push(segment.id);
    }
  }

  const nets = new Map<NetId, Net>();
  const groups = uf.groups();
  for (const [_root, nodeIds] of groups) {
    const netId = generateId('net') as NetId;
    const segmentIdSet = new Set<WireSegmentId>();
    for (const nid of nodeIds) {
      const segs = nodeToSegments.get(nid);
      if (segs) {
        for (const sid of segs) segmentIdSet.add(sid);
      }
    }
    nets.set(netId, { id: netId, nodeIds, segmentIds: [...segmentIdSet] });
  }
  return nets;
}

/** Build pin-to-net lookup from nets. Key is pinRefKey(). */
function buildPinToNet(
  circuit: Circuit,
  nets: Map<NetId, Net>,
): Map<string, NetId> {
  const pinToNet = new Map<string, NetId>();
  for (const net of nets.values()) {
    for (const nodeId of net.nodeIds) {
      const node = circuit.getWireNode(nodeId);
      if (node.pin) {
        pinToNet.set(pinRefKey(node.pin), net.id);
      }
    }
  }
  return pinToNet;
}

/** Classify pins per net into drivers (output) and receivers (input). */
function classifyNetPins(
  circuit: Circuit,
  nets: Map<NetId, Net>,
): {
  netDrivers: Map<NetId, PinRef[]>;
  netReceivers: Map<NetId, PinRef[]>;
  netBitWidths: Map<NetId, number>;
} {
  const netDrivers = new Map<NetId, PinRef[]>();
  const netReceivers = new Map<NetId, PinRef[]>();
  const netBitWidths = new Map<NetId, number>();

  for (const netId of nets.keys()) {
    netDrivers.set(netId, []);
    netReceivers.set(netId, []);
    netBitWidths.set(netId, 1);
  }

  // Iterate wire nodes to collect PinRefs for each net
  for (const net of nets.values()) {
    for (const nodeId of net.nodeIds) {
      const node = circuit.getWireNode(nodeId);
      if (!node.pin) continue;
      const ref = node.pin;
      const gate = circuit.getGate(ref.gateId);
      const bitWidth = getPinBitWidth(gate.type, ref.kind, ref.index);

      if (ref.kind === 'output') {
        netDrivers.get(net.id)!.push(ref);
      } else {
        netReceivers.get(net.id)!.push(ref);
      }
      // TODO: detect bitWidth mismatch across pins in a net
      netBitWidths.set(net.id, bitWidth);
    }
  }

  return { netDrivers, netReceivers, netBitWidths };
}

/**
 * Topological sort of combinational subgraph only.
 * Treats delay gate outputs and input-type gates as fixed sources.
 */
function topologicalSort(
  circuit: Circuit,
  nets: Map<NetId, Net>,
  pinToNet: Map<string, NetId>,
): GateId[] {
  const combGateIds = new Set<GateId>();
  for (const gate of circuit.gates.values()) {
    if (isCombinational(gate.type)) {
      combGateIds.add(gate.id);
    }
  }

  const adj = new Map<GateId, GateId[]>();
  const inDegree = new Map<GateId, number>();
  for (const gateId of combGateIds) {
    adj.set(gateId, []);
    inDegree.set(gateId, 0);
  }

  for (const gateId of combGateIds) {
    const gate = circuit.getGate(gateId);
    const inputCount = getPinCounts(gate.type).inputs;
    for (let i = 0; i < inputCount; i++) {
      const key = pinRefKey({ gateId, kind: 'input', index: i });
      const netId = pinToNet.get(key);
      if (!netId) continue;
      const net = nets.get(netId)!;

      for (const nodeId of net.nodeIds) {
        const node = circuit.getWireNode(nodeId);
        if (!node.pin) continue;
        if (node.pin.kind !== 'output') continue;

        const driverGateId = node.pin.gateId;
        if (combGateIds.has(driverGateId) && driverGateId !== gateId) {
          adj.get(driverGateId)!.push(gateId);
          inDegree.set(gateId, (inDegree.get(gateId) ?? 0) + 1);
        }
      }
    }
  }

  // Kahn's algorithm
  const queue: GateId[] = [];
  for (const [gateId, deg] of inDegree) {
    if (deg === 0) queue.push(gateId);
  }

  const sorted: GateId[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const neighbor of adj.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return sorted;
}

/**
 * Find feedback loops in the combinational subgraph (no delay gate
 * breaking the loop). Returns arrays of gate IDs forming cycles.
 */
function detectCycles(
  circuit: Circuit,
  nets: Map<NetId, Net>,
  pinToNet: Map<string, NetId>,
): GateId[][] {
  const combGateIds = new Set<GateId>();
  for (const gate of circuit.gates.values()) {
    if (isCombinational(gate.type)) {
      combGateIds.add(gate.id);
    }
  }

  const adj = new Map<GateId, Set<GateId>>();
  for (const gateId of combGateIds) {
    adj.set(gateId, new Set());
  }

  for (const gateId of combGateIds) {
    const gate = circuit.getGate(gateId);
    const outputCount = getPinCounts(gate.type).outputs;
    for (let i = 0; i < outputCount; i++) {
      const key = pinRefKey({ gateId, kind: 'output', index: i });
      const netId = pinToNet.get(key);
      if (!netId) continue;
      const net = nets.get(netId)!;

      for (const nodeId of net.nodeIds) {
        const node = circuit.getWireNode(nodeId);
        if (!node.pin) continue;
        if (node.pin.kind !== 'input') continue;

        const targetGateId = node.pin.gateId;
        if (combGateIds.has(targetGateId)) {
          adj.get(gateId)!.add(targetGateId);
        }
      }
    }
  }

  // Self-loops
  const selfLoops: GateId[][] = [];
  for (const [gateId, neighbors] of adj) {
    if (neighbors.has(gateId)) {
      selfLoops.push([gateId]);
      neighbors.delete(gateId);
    }
  }

  // Tarjan's SCC
  const cycles: GateId[][] = [...selfLoops];
  let index = 0;
  const nodeIndex = new Map<GateId, number>();
  const lowLink = new Map<GateId, number>();
  const onStack = new Set<GateId>();
  const stack: GateId[] = [];

  function strongConnect(v: GateId): void {
    nodeIndex.set(v, index);
    lowLink.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!nodeIndex.has(w)) {
        strongConnect(w);
        lowLink.set(v, Math.min(lowLink.get(v)!, lowLink.get(w)!));
      } else if (onStack.has(w)) {
        lowLink.set(v, Math.min(lowLink.get(v)!, nodeIndex.get(w)!));
      }
    }

    if (lowLink.get(v) === nodeIndex.get(v)) {
      const scc: GateId[] = [];
      let w: GateId;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1) cycles.push(scc);
    }
  }

  for (const gateId of combGateIds) {
    if (!nodeIndex.has(gateId)) strongConnect(gateId);
  }

  return cycles;
}
