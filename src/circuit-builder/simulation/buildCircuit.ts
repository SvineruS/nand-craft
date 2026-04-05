import type { Circuit } from './circuit.ts';
import type {
  GateId,
  Net,
  NetId,
  PinRef,
  WireNodeId,
  WireSegmentId,
} from '../editor/types.ts';
import { generateId, pinRefKey } from '../editor/types.ts';
import { isInputGate, pinValue, writePinValue, type Gate } from "./gateTypes.ts";
import type { BuildResult, SimulationState } from './types.ts';
import { getPinBitWidth, getPinCounts } from '../editor/gates.ts';

/** Gate types that are part of the combinational subgraph. */
const COMBINATIONAL_TYPES = new Set([
  'nand', 'and', 'or', 'nor', 'xor', 'xnor', 'not',
  '8bit-or', '8bit-nor', '8bit-not',
  '3bit-or', '3bit-and',
  '2bit-adder', '3bit-adder',
  '1bit-decoder', '3bit-decoder',
  '8bit-adder', '8bit-negative', '8bit-subtractor',
  'mux', '8bit-mux', 'constant', 'constant-8bit', 'constant-16bit', 'tristate', 'splitter', 'joiner',
  // Switch IO gates need evaluation to check enable pin after net resolution
  'input-sw', 'input-8bit-sw', 'input-16bit-sw',
  'output-sw', 'output-8bit-sw', 'output-16bit-sw',
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
    if (COMBINATIONAL_TYPES.has(gate.type)) {
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
    if (COMBINATIONAL_TYPES.has(gate.type)) {
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

// ---------------------------------------------------------------------------
// Tick: value propagation using cached BuildResult
// ---------------------------------------------------------------------------

/**
 * Resolve net values from driver pins. Sets receiver pins.
 * Returns net IDs with bus contention.
 */
function resolveNets(circuit: Circuit, simState: SimulationState, buildResult: BuildResult): NetId[] {
  const contentionNets: NetId[] = [];

  for (const [netId, net] of buildResult.nets) {
    const driverRefs = buildResult.netDrivers.get(netId) ?? [];
    const receiverRefs = buildResult.netReceivers.get(netId) ?? [];

    // Check bit width consistency
    const allRefs = [...driverRefs, ...receiverRefs];
    let widthMismatch = false;
    if (allRefs.length > 1) {
      const firstGate = circuit.getGate(allRefs[0].gateId);
      const bw = getPinBitWidth(firstGate.type, allRefs[0].kind, allRefs[0].index);
      for (let i = 1; i < allRefs.length; i++) {
        const g = circuit.getGate(allRefs[i].gateId);
        if (getPinBitWidth(g.type, allRefs[i].kind, allRefs[i].index) !== bw) {
          widthMismatch = true;
          break;
        }
      }
    }

    // Resolve value from drivers
    const activeDriverValues: (number | null)[] = [];
    for (const ref of driverRefs) {
      const val = pinValue(simState, ref.gateId, ref.kind, ref.index);
      if (val !== null) activeDriverValues.push(val);
    }

    let netValue: number | null;
    if (widthMismatch || activeDriverValues.length > 1) {
      contentionNets.push(net.id);
      netValue = null;
    } else if (activeDriverValues.length === 1) {
      netValue = activeDriverValues[0];
    } else {
      netValue = null;
    }

    for (const ref of receiverRefs) {
      writePinValue(simState, ref, netValue);
    }
  }

  return contentionNets;
}

/**
 * One tick of combinational propagation using cached build data.
 * Returns contention net IDs from the final resolution.
 */
export function propagate(
  circuit: Circuit,
  simState: SimulationState,
  buildResult: BuildResult,
): NetId[] {
  // Initial net resolution to propagate input gate values
  let contentionNets = resolveNets(circuit, simState, buildResult);

  for (const gateId of buildResult.evaluationOrder) {
    const gate = circuit.getGate(gateId);
    evaluateGate(simState, gate);
    contentionNets = resolveNets(circuit, simState, buildResult);
  }

  return contentionNets;
}

/**
 * Compute derived rendering data from tick results.
 */
export function computeDerivedState(
  circuit: Circuit,
  simState: SimulationState,
  buildResult: BuildResult,
  contentionNets: NetId[],
): {
  errorSegmentIds: Set<string>;
  nodeValues: Map<string, number | null>;
  nodeBitWidths: Map<string, number>;
} {
  // Error segments
  const errorSegments = new Set<string>();

  if (buildResult.shortCircuitGates.length > 0) {
    const errorGateIds = new Set<string>(
      buildResult.shortCircuitGates.map(id => id as string),
    );
    for (const net of buildResult.nets.values()) {
      let touches = false;
      for (const nid of net.nodeIds) {
        const node = circuit.getWireNode(nid);
        if (node.pin && errorGateIds.has(node.pin.gateId as string)) {
          touches = true;
          break;
        }
      }
      if (touches) {
        for (const sid of net.segmentIds)
          errorSegments.add(sid as string);
      }
    }
  }

  if (contentionNets.length > 0) {
    const contentionSet = new Set(
      contentionNets.map(id => id as string),
    );
    for (const net of buildResult.nets.values()) {
      if (contentionSet.has(net.id as string)) {
        for (const sid of net.segmentIds)
          errorSegments.add(sid as string);
      }
    }
  }

  // Node values & bit widths
  const nodeValues = new Map<string, number | null>();
  const nodeBitWidths = new Map<string, number>();
  for (const net of buildResult.nets.values()) {
    let netValue: number | null = null;
    let netBitWidth = 1;
    for (const nodeId of net.nodeIds) {
      const node = circuit.getWireNode(nodeId);
      if (node.pin) {
        const val = pinValue(simState, node.pin.gateId, node.pin.kind, node.pin.index);
        if (val !== null) netValue = val;
        const gate = circuit.getGate(node.pin.gateId);
        netBitWidth = getPinBitWidth(
          gate.type,
          node.pin.kind,
          node.pin.index,
        );
      }
    }
    for (const nodeId of net.nodeIds) {
      nodeValues.set(nodeId as string, netValue);
      nodeBitWidths.set(nodeId as string, netBitWidth);
    }
  }

  return { errorSegmentIds: errorSegments, nodeValues, nodeBitWidths };
}

// ---------------------------------------------------------------------------
// Gate evaluation
// ---------------------------------------------------------------------------

function readInput(simState: SimulationState, gate: Gate, index: number): number {
  return simState.get(pinRefKey({ gateId: gate.id, kind: 'input', index })) ?? 0;
}

function readInputNullable(simState: SimulationState, gate: Gate, index: number): number | null {
  return simState.get(pinRefKey({ gateId: gate.id, kind: 'input', index })) ?? null;
}

function writeOutput(simState: SimulationState, gate: Gate, index: number, value: number | null): void {
  simState.set(pinRefKey({ gateId: gate.id, kind: 'output', index }), value);
}

function evaluateBinaryGate(
  simState: SimulationState,
  gate: Gate,
  op: (a: number, b: number, mask: number) => number,
): void {
  const inA = readInput(simState, gate, 0);
  const inB = readInput(simState, gate, 1);
  const bitWidth = getPinBitWidth(gate.type, 'output', 0);
  const mask = ((1 << bitWidth) >>> 0) - 1;
  writeOutput(simState, gate, 0, op(inA, inB, mask));
}

function evaluateUnaryGate(
  simState: SimulationState,
  gate: Gate,
  op: (a: number, mask: number) => number,
): void {
  const input = readInput(simState, gate, 0);
  const bitWidth = getPinBitWidth(gate.type, 'output', 0);
  const mask = ((1 << bitWidth) >>> 0) - 1;
  writeOutput(simState, gate, 0, op(input, mask));
}

function evaluateGate(simState: SimulationState, gate: Gate): void {
  switch (gate.type) {
    case 'nand':
      evaluateBinaryGate(simState, gate, (a, b, mask) => (~(a & b) & mask) >>> 0);
      break;
    case 'and':
      evaluateBinaryGate(simState, gate, (a, b) => a & b);
      break;
    case 'or':
      evaluateBinaryGate(simState, gate, (a, b) => a | b);
      break;
    case 'nor':
      evaluateBinaryGate(simState, gate, (a, b, mask) => (~(a | b) & mask) >>> 0);
      break;
    case 'xor':
      evaluateBinaryGate(simState, gate, (a, b) => a ^ b);
      break;
    case 'xnor':
      evaluateBinaryGate(simState, gate, (a, b, mask) => (~(a ^ b) & mask) >>> 0);
      break;
    case 'not':
    case '8bit-not':
      evaluateUnaryGate(simState, gate, (a, mask) => (~a & mask) >>> 0);
      break;
    case '8bit-or':
      evaluateBinaryGate(simState, gate, (a, b) => a | b);
      break;
    case '8bit-nor':
      evaluateBinaryGate(simState, gate, (a, b, mask) => (~(a | b) & mask) >>> 0);
      break;
    case '3bit-or': {
      const a = readInput(simState, gate, 0);
      const b = readInput(simState, gate, 1);
      const c = readInput(simState, gate, 2);
      writeOutput(simState, gate, 0, a | b | c);
      break;
    }
    case '3bit-and': {
      const a = readInput(simState, gate, 0);
      const b = readInput(simState, gate, 1);
      const c = readInput(simState, gate, 2);
      writeOutput(simState, gate, 0, a & b & c);
      break;
    }
    case '2bit-adder': {
      const a = readInput(simState, gate, 0);
      const b = readInput(simState, gate, 1);
      const sum = a + b;
      writeOutput(simState, gate, 0, sum & 1);        // S
      writeOutput(simState, gate, 1, (sum >> 1) & 1);  // C
      break;
    }
    case '3bit-adder': {
      const a = readInput(simState, gate, 0);
      const b = readInput(simState, gate, 1);
      const cin = readInput(simState, gate, 2);
      const sum = a + b + cin;
      writeOutput(simState, gate, 0, sum & 1);        // S
      writeOutput(simState, gate, 1, (sum >> 1) & 1);  // Cout
      break;
    }
    case '1bit-decoder': {
      const a = readInput(simState, gate, 0);
      writeOutput(simState, gate, 0, a === 0 ? 1 : 0);
      writeOutput(simState, gate, 1, a === 0 ? 0 : 1);
      break;
    }
    case '3bit-decoder': {
      const a = readInput(simState, gate, 0);
      const b = readInput(simState, gate, 1);
      const c = readInput(simState, gate, 2);
      const idx = (a << 2) | (b << 1) | c;
      const outputCount = getPinCounts(gate.type).outputs;
      for (let i = 0; i < outputCount; i++) {
        writeOutput(simState, gate, i, i === idx ? 1 : 0);
      }
      break;
    }
    case '8bit-adder': {
      const ci = readInput(simState, gate, 0);
      const a = readInput(simState, gate, 1);
      const b = readInput(simState, gate, 2);
      const sum = a + b + ci;
      writeOutput(simState, gate, 0, sum & 0xFF);
      writeOutput(simState, gate, 1, (sum >> 8) & 1);
      break;
    }
    case '8bit-negative': {
      const a = readInput(simState, gate, 0);
      writeOutput(simState, gate, 0, (-a & 0xFF) >>> 0);
      break;
    }
    case '8bit-subtractor': {
      const a = readInput(simState, gate, 0);
      const b = readInput(simState, gate, 1);
      writeOutput(simState, gate, 0, ((a - b) & 0xFF) >>> 0);
      break;
    }
    case 'constant':
    case 'constant-8bit':
    case 'constant-16bit': {
      const current = simState.get(pinRefKey({ gateId: gate.id, kind: 'output', index: 0 }));
      if (current === null || current === undefined) {
        writeOutput(simState, gate, 0, 0);
      }
      break;
    }
    case 'mux':
    case '8bit-mux': {
      const sel = readInputNullable(simState, gate, 0);
      const inA = readInput(simState, gate, 1);
      const inB = readInput(simState, gate, 2);
      writeOutput(simState, gate, 0, (sel !== null && sel !== 0) ? inB : inA);
      break;
    }
    case 'tristate': {
      const input = readInputNullable(simState, gate, 0);
      const enable = readInputNullable(simState, gate, 1);
      writeOutput(simState, gate, 0, (enable !== null && enable !== 0) ? input : null);
      break;
    }
    case 'splitter': {
      const inputVal = readInput(simState, gate, 0);
      const outputCount = getPinCounts(gate.type).outputs;
      for (let i = 0; i < outputCount; i++) {
        writeOutput(simState, gate, i, (inputVal >>> i) & 1);
      }
      break;
    }
    case 'joiner': {
      let result = 0;
      const inputCount = getPinCounts(gate.type).inputs;
      for (let i = 0; i < inputCount; i++) {
        result |= (readInput(simState, gate, i) & 1) << i;
      }
      writeOutput(simState, gate, 0, result);
      break;
    }
    case 'input':
    case 'input-8bit':
    case 'input-16bit':
    case 'input-sw':
    case 'input-8bit-sw':
    case 'input-16bit-sw':
    case 'output':
    case 'output-8bit':
    case 'output-16bit':
    case 'output-sw':
    case 'output-8bit-sw':
    case 'output-16bit-sw': {
      if (isInputGate(gate.type)) {
        const inputCount = getPinCounts(gate.type).inputs;
        if (inputCount > 0) {
          // Enable pin: null (unconnected) or 0 → output null (high-Z)
          const enableValue = readInputNullable(simState, gate, 0);
          if (!enableValue) {
            writeOutput(simState, gate, 0, null);
            return;
          }
        }
      } else {
        // output gate - enable is input[1] if present
        const inputCount = getPinCounts(gate.type).inputs;
        if (inputCount > 1) {
          const enableValue = readInputNullable(simState, gate, 1);
          if (!enableValue) return;
        }
      }
      break;
    }
    default:
      break;
  }
}
