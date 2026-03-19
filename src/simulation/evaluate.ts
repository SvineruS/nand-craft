import type {
  Circuit,
  Gate,
  GateId,
  Net,
  NetId,
  Pin,
  PinId,
  WireNodeId,
  WireSegmentId,
} from '../types.ts';
import { generateId } from '../types.ts';

/** Gate types that are part of the combinational subgraph. */
const COMBINATIONAL_TYPES = new Set([
  'nand', 'and', 'or', 'nor', 'not', 'constant', 'tristate', 'splitter', 'joiner',
]);

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
    // Path compression
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

/**
 * Rebuild all nets from wire connectivity using union-find on wire nodes/segments.
 * Updates circuit.nets in place.
 */
export function buildNets(circuit: Circuit): void {
  const uf = new UnionFind<WireNodeId>();

  // Create a set for each wire node
  for (const nodeId of circuit.wireNodes.keys()) {
    uf.makeSet(nodeId);
  }

  // Union nodes that share a wire segment
  for (const segment of circuit.wireSegments.values()) {
    uf.union(segment.from, segment.to);
  }

  // Build nets from union-find groups
  circuit.nets.clear();

  // Build a lookup: nodeId -> segmentIds it belongs to
  const nodeToSegments = new Map<WireNodeId, WireSegmentId[]>();
  for (const segment of circuit.wireSegments.values()) {
    for (const nid of [segment.from, segment.to]) {
      if (!nodeToSegments.has(nid)) {
        nodeToSegments.set(nid, []);
      }
      nodeToSegments.get(nid)!.push(segment.id);
    }
  }

  const groups = uf.groups();
  for (const [_root, nodeIds] of groups) {
    const netId = generateId('net') as NetId;

    // Collect unique segment IDs for this group
    const segmentIdSet = new Set<WireSegmentId>();
    for (const nid of nodeIds) {
      const segs = nodeToSegments.get(nid);
      if (segs) {
        for (const sid of segs) {
          segmentIdSet.add(sid);
        }
      }
    }

    const net: Net = {
      id: netId,
      nodeIds,
      segmentIds: [...segmentIdSet],
    };
    circuit.nets.set(netId, net);
  }
}

/**
 * For each net, resolve the driven value from output pins.
 * Multiple non-null drivers = bus contention error.
 * All null = high-Z (null). One active = net value.
 * Sets all connected input pins to the resolved value.
 */
export function resolveNets(circuit: Circuit): NetId[] {
  const contentionNets: NetId[] = [];

  for (const net of circuit.nets.values()) {
    // Find all pins connected to this net via wire nodes
    const connectedPinIds: PinId[] = [];
    for (const nodeId of net.nodeIds) {
      const node = circuit.wireNodes.get(nodeId);
      if (node?.pinId) {
        connectedPinIds.push(node.pinId);
      }
    }

    // Separate output pins (drivers) and input pins (receivers)
    const drivers: Pin[] = [];
    const receivers: Pin[] = [];
    let widthMismatch = false;

    for (const pinId of connectedPinIds) {
      const pin = circuit.pins.get(pinId);
      if (!pin) continue;

      if (pin.kind === 'output') {
        drivers.push(pin);
      } else {
        receivers.push(pin);
      }
    }

    // Check bit width consistency
    const allPins = [...drivers, ...receivers];
    if (allPins.length > 1) {
      const bw = allPins[0].bitWidth;
      for (let i = 1; i < allPins.length; i++) {
        if (allPins[i].bitWidth !== bw) { widthMismatch = true; break; }
      }
    }

    // Resolve net value from drivers
    const activeDrivers = drivers.filter((p) => p.value !== null);

    let netValue: number | null;
    if (widthMismatch || activeDrivers.length > 1) {
      // Bus contention or width mismatch — record and set null
      contentionNets.push(net.id);
      netValue = null;
    } else if (activeDrivers.length === 1) {
      netValue = activeDrivers[0].value;
    } else {
      netValue = null; // high-Z
    }

    // Set all receiver (input) pins to the resolved value
    for (const receiver of receivers) {
      receiver.value = netValue;
    }
  }

  return contentionNets;
}

/**
 * Topological sort of combinational subgraph only.
 * Treats delay gate outputs and input-type gates as fixed sources.
 * Returns sorted gate IDs.
 */
export function topologicalSort(circuit: Circuit): GateId[] {
  // Build adjacency: for combinational gates, find which gates feed into which
  // A gate A feeds gate B if A has an output pin connected (via net) to an input pin of B
  const combGateIds = new Set<GateId>();
  for (const gate of circuit.gates.values()) {
    if (COMBINATIONAL_TYPES.has(gate.type)) {
      combGateIds.add(gate.id);
    }
  }

  // Build pin-to-net lookup
  const pinToNet = new Map<PinId, Net>();
  for (const net of circuit.nets.values()) {
    for (const nodeId of net.nodeIds) {
      const node = circuit.wireNodes.get(nodeId);
      if (node?.pinId) {
        pinToNet.set(node.pinId, net);
      }
    }
  }

  // Build adjacency and in-degree for combinational gates
  const adj = new Map<GateId, GateId[]>();
  const inDegree = new Map<GateId, number>();

  for (const gateId of combGateIds) {
    adj.set(gateId, []);
    inDegree.set(gateId, 0);
  }

  // For each combinational gate, look at its input pins.
  // Find which output pin drives that net; if it belongs to another combinational gate, add edge.
  for (const gateId of combGateIds) {
    const gate = circuit.gates.get(gateId)!;
    for (const inputPinId of gate.inputPins) {
      const net = pinToNet.get(inputPinId);
      if (!net) continue;

      // Find the driver (output pin) on this net
      for (const nodeId of net.nodeIds) {
        const node = circuit.wireNodes.get(nodeId);
        if (!node?.pinId) continue;
        const pin = circuit.pins.get(node.pinId);
        if (!pin || pin.kind !== 'output') continue;

        const driverGateId = pin.gateId;
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
    if (deg === 0) {
      queue.push(gateId);
    }
  }

  const sorted: GateId[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const neighbor of adj.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) {
        queue.push(neighbor);
      }
    }
  }

  return sorted;
}

/**
 * Find feedback loops in the combinational subgraph (no delay gate breaking the loop).
 * Returns arrays of gate IDs forming cycles.
 */
export function detectCycles(circuit: Circuit): GateId[][] {
  const combGateIds = new Set<GateId>();
  for (const gate of circuit.gates.values()) {
    if (COMBINATIONAL_TYPES.has(gate.type)) {
      combGateIds.add(gate.id);
    }
  }

  // Build pin-to-net lookup
  const pinToNet = new Map<PinId, Net>();
  for (const net of circuit.nets.values()) {
    for (const nodeId of net.nodeIds) {
      const node = circuit.wireNodes.get(nodeId);
      if (node?.pinId) {
        pinToNet.set(node.pinId, net);
      }
    }
  }

  // Build adjacency for combinational gates
  const adj = new Map<GateId, Set<GateId>>();
  for (const gateId of combGateIds) {
    adj.set(gateId, new Set());
  }

  for (const gateId of combGateIds) {
    const gate = circuit.gates.get(gateId)!;
    for (const outputPinId of gate.outputPins) {
      const net = pinToNet.get(outputPinId);
      if (!net) continue;

      for (const nodeId of net.nodeIds) {
        const node = circuit.wireNodes.get(nodeId);
        if (!node?.pinId) continue;
        const pin = circuit.pins.get(node.pinId);
        if (!pin || pin.kind !== 'input') continue;

        const targetGateId = pin.gateId;
        if (combGateIds.has(targetGateId)) {
          adj.get(gateId)!.add(targetGateId);
        }
      }
    }
  }

  // Check for self-loops
  const selfLoops: GateId[][] = [];
  for (const [gateId, neighbors] of adj) {
    if (neighbors.has(gateId)) {
      selfLoops.push([gateId]);
      neighbors.delete(gateId); // remove to avoid confusing Tarjan's
    }
  }

  // Find all SCCs using Tarjan's algorithm
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

      if (scc.length > 1) {
        cycles.push(scc);
      }
    }
  }

  for (const gateId of combGateIds) {
    if (!nodeIndex.has(gateId)) {
      strongConnect(gateId);
    }
  }

  return cycles;
}

/**
 * Evaluate a binary gate (2 inputs, 1 output) with the given operation.
 * If either input is null, the output is null.
 */
function evaluateBinaryGate(
  gate: Gate,
  pins: Map<PinId, Pin>,
  op: (a: number, b: number, mask: number) => number,
): void {
  const inA = pins.get(gate.inputPins[0]);
  const inB = pins.get(gate.inputPins[1]);
  const out = pins.get(gate.outputPins[0]);
  if (!inA || !inB || !out) return;

  if (inA.value === null || inB.value === null) {
    out.value = null;
  } else {
    const mask = ((1 << out.bitWidth) >>> 0) - 1;
    out.value = op(inA.value, inB.value, mask);
  }
}

/**
 * Evaluate a unary gate (1 input, 1 output) with the given operation.
 * If the input is null, the output is null.
 */
function evaluateUnaryGate(
  gate: Gate,
  pins: Map<PinId, Pin>,
  op: (a: number, mask: number) => number,
): void {
  const input = pins.get(gate.inputPins[0]);
  const out = pins.get(gate.outputPins[0]);
  if (!input || !out) return;

  if (input.value === null) {
    out.value = null;
  } else {
    const mask = ((1 << out.bitWidth) >>> 0) - 1;
    out.value = op(input.value, mask);
  }
}

/**
 * Evaluate a single gate based on its type.
 */
export function evaluateGate(gate: Gate, pins: Map<PinId, Pin>): void {
  switch (gate.type) {
    case 'nand':
      evaluateBinaryGate(gate, pins, (a, b, mask) => (~(a & b) & mask) >>> 0);
      break;

    case 'and':
      evaluateBinaryGate(gate, pins, (a, b) => a & b);
      break;

    case 'or':
      evaluateBinaryGate(gate, pins, (a, b) => a | b);
      break;

    case 'nor':
      evaluateBinaryGate(gate, pins, (a, b, mask) => (~(a | b) & mask) >>> 0);
      break;

    case 'not':
      evaluateUnaryGate(gate, pins, (a, mask) => (~a & mask) >>> 0);
      break;

    case 'constant': {
      // Constant gate always outputs its stored value (default 0)
      const out = pins.get(gate.outputPins[0]);
      if (!out) return;
      if (out.value === null) out.value = 0;
      break;
    }

    case 'tristate': {
      const input = pins.get(gate.inputPins[0]);
      const enable = pins.get(gate.inputPins[1]);
      const out = pins.get(gate.outputPins[0]);
      if (!input || !enable || !out) return;

      if (enable.value !== null && enable.value !== 0) {
        out.value = input.value;
      } else {
        out.value = null; // high-Z when disabled
      }
      break;
    }

    case 'splitter': {
      const input = pins.get(gate.inputPins[0]);
      if (!input) return;

      for (let i = 0; i < gate.outputPins.length; i++) {
        const out = pins.get(gate.outputPins[i]);
        if (!out) continue;

        if (input.value === null) {
          out.value = null;
        } else {
          out.value = (input.value >>> i) & 1;
        }
      }
      break;
    }

    case 'joiner': {
      const out = pins.get(gate.outputPins[0]);
      if (!out) return;

      let result = 0;
      let hasNull = false;

      for (let i = 0; i < gate.inputPins.length; i++) {
        const input = pins.get(gate.inputPins[i]);
        if (!input) continue;

        if (input.value === null) {
          hasNull = true;
          break;
        }
        result |= (input.value & 1) << i;
      }

      out.value = hasNull ? null : result;
      break;
    }

    case 'input':
    case 'output': {
      // Pass through: value pin
      // If the gate has an enable pin (inputPins[1]) and enable=0, output=null
      const valuePin = gate.type === 'input'
        ? pins.get(gate.outputPins[0])
        : pins.get(gate.inputPins[0]);

      if (!valuePin) return;

      // Check for enable pin
      const enablePinId = gate.type === 'input' ? gate.inputPins[0] : gate.inputPins[1];
      if (enablePinId) {
        const enablePin = pins.get(enablePinId);
        if (enablePin && enablePin.value === 0) {
          if (gate.type === 'input' && gate.outputPins[0]) {
            const out = pins.get(gate.outputPins[0]);
            if (out) out.value = null;
          }
          return;
        }
      }

      // For input gates, the output pin value is already set externally
      // For output gates, the input pin value is already set via net resolution
      break;
    }

    default:
      break;
  }
}

/**
 * One tick of combinational propagation:
 * topological sort -> evaluate each gate in order -> resolve nets.
 */
export function propagate(circuit: Circuit): void {
  // Initial net resolution to propagate input gate values to connected pins
  resolveNets(circuit);

  const sorted = topologicalSort(circuit);

  for (const gateId of sorted) {
    const gate = circuit.gates.get(gateId);
    if (!gate) continue;

    evaluateGate(gate, circuit.pins);
    resolveNets(circuit);
  }
}
