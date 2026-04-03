import type { Circuit } from './circuit.ts';
import type {
  GateId,
  Net,
  NetId,
  PinId,
  WireNodeId,
  WireSegmentId,
} from '../editor/types.ts';
import { generateId } from '../editor/types.ts';
import type { Gate, Pin } from "./gateTypes.ts";
import type { BuildResult } from './types.ts';

/** Gate types that are part of the combinational subgraph. */
const COMBINATIONAL_TYPES = new Set([
  'nand', 'and', 'or', 'nor', 'xor', 'xnor', 'not',
  '8bit-or', '8bit-nor', '8bit-not',
  '3bit-or', '3bit-and',
  '2bit-adder', '3bit-adder',
  '1bit-decoder', '3bit-decoder',
  '8bit-negative',
  'switch', 'constant', 'tristate', 'splitter', 'joiner',
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

/** Build pin-to-net lookup from nets. */
function buildPinToNet(circuit: Circuit, nets: Map<NetId, Net>): Map<PinId, NetId> {
  const pinToNet = new Map<PinId, NetId>();
  for (const net of nets.values()) {
    for (const nodeId of net.nodeIds) {
      const node = circuit.getWireNode(nodeId);
      if (node.pinId) {
        pinToNet.set(node.pinId, net.id);
      }
    }
  }
  return pinToNet;
}

/** Classify pins per net into drivers (output) and receivers (input). */
function classifyNetPins(
  circuit: Circuit,
  nets: Map<NetId, Net>,
  pinToNet: Map<PinId, NetId>,
): { netDrivers: Map<NetId, PinId[]>; netReceivers: Map<NetId, PinId[]>; netBitWidths: Map<NetId, number> } {
  const netDrivers = new Map<NetId, PinId[]>();
  const netReceivers = new Map<NetId, PinId[]>();
  const netBitWidths = new Map<NetId, number>();

  for (const netId of nets.keys()) {
    netDrivers.set(netId, []);
    netReceivers.set(netId, []);
    netBitWidths.set(netId, 1);
  }

  for (const [pinId, netId] of pinToNet) {
    const pin = circuit.getPin(pinId);
    if (pin.kind === 'output') {
      netDrivers.get(netId)!.push(pinId);
    } else {
      netReceivers.get(netId)!.push(pinId);
    }
    // TODO: if a net has pins with different bitWidths, this takes the last one — should detect mismatch
    netBitWidths.set(netId, pin.bitWidth);
  }

  return { netDrivers, netReceivers, netBitWidths };
}

/**
 * Topological sort of combinational subgraph only.
 * Treats delay gate outputs and input-type gates as fixed sources.
 */
function topologicalSort(circuit: Circuit, nets: Map<NetId, Net>, pinToNet: Map<PinId, NetId>): GateId[] {
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
    for (const inputPinId of gate.inputPins) {
      const netId = pinToNet.get(inputPinId);
      if (!netId) continue;
      const net = nets.get(netId)!;

      for (const nodeId of net.nodeIds) {
        const node = circuit.getWireNode(nodeId);
        if (!node.pinId) continue;
        const pin = circuit.getPin(node.pinId);
        if (pin.kind !== 'output') continue;

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
 * Find feedback loops in the combinational subgraph (no delay gate breaking the loop).
 * Returns arrays of gate IDs forming cycles.
 */
function detectCycles(circuit: Circuit, nets: Map<NetId, Net>, pinToNet: Map<PinId, NetId>): GateId[][] {
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
    for (const outputPinId of gate.outputPins) {
      const netId = pinToNet.get(outputPinId);
      if (!netId) continue;
      const net = nets.get(netId)!;

      for (const nodeId of net.nodeIds) {
        const node = circuit.getWireNode(nodeId);
        if (!node.pinId) continue;
        const pin = circuit.getPin(node.pinId);
        if (pin.kind !== 'input') continue;

        const targetGateId = pin.gateId;
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
  const { netDrivers, netReceivers, netBitWidths } = classifyNetPins(circuit, nets, pinToNet);
  const evaluationOrder = topologicalSort(circuit, nets, pinToNet);
  const shortCircuitGates = detectCycles(circuit, nets, pinToNet).flat();

  return { nets, evaluationOrder, pinToNet, netDrivers, netReceivers, netBitWidths, shortCircuitGates };
}

// ---------------------------------------------------------------------------
// Tick: value propagation using cached BuildResult
// ---------------------------------------------------------------------------

/**
 * Resolve net values from driver pins. Sets receiver pins.
 * Returns net IDs with bus contention.
 */
function resolveNets(circuit: Circuit, buildResult: BuildResult): NetId[] {
  const contentionNets: NetId[] = [];

  for (const [netId, net] of buildResult.nets) {
    const driverPinIds = buildResult.netDrivers.get(netId) ?? [];
    const receiverPinIds = buildResult.netReceivers.get(netId) ?? [];

    // Check bit width consistency
    const allPinIds = [...driverPinIds, ...receiverPinIds];
    let widthMismatch = false;
    if (allPinIds.length > 1) {
      const bw = circuit.getPin(allPinIds[0]).bitWidth;
      for (let i = 1; i < allPinIds.length; i++) {
        if (circuit.getPin(allPinIds[i]).bitWidth !== bw) { widthMismatch = true; break; }
      }
    }

    // Resolve value from drivers
    const activeDrivers: Pin[] = [];
    for (const pinId of driverPinIds) {
      const pin = circuit.getPin(pinId);
      if (pin.value !== null) activeDrivers.push(pin);
    }

    let netValue: number | null;
    if (widthMismatch || activeDrivers.length > 1) {
      contentionNets.push(net.id);
      netValue = null;
    } else if (activeDrivers.length === 1) {
      netValue = activeDrivers[0].value;
    } else {
      netValue = null;
    }

    for (const pinId of receiverPinIds) {
      circuit.getPin(pinId).value = netValue;
    }
  }

  return contentionNets;
}

/**
 * One tick of combinational propagation using cached build data.
 * Returns contention net IDs from the final resolution.
 */
export function propagate(circuit: Circuit, buildResult: BuildResult): NetId[] {
  // Initial net resolution to propagate input gate values
  let contentionNets = resolveNets(circuit, buildResult);

  for (const gateId of buildResult.evaluationOrder) {
    const gate = circuit.getGate(gateId);
    evaluateGate(gate, circuit);
    contentionNets = resolveNets(circuit, buildResult);
  }

  return contentionNets;
}

/**
 * Compute derived rendering data from tick results.
 * Moved from Editor.updateDerivedState().
 */
export function computeDerivedState(
  circuit: Circuit,
  buildResult: BuildResult,
  contentionNets: NetId[],
): { errorSegmentIds: Set<string>; nodeValues: Map<string, number | null>; nodeBitWidths: Map<string, number> } {
  // Error segments
  const errorSegments = new Set<string>();

  if (buildResult.shortCircuitGates.length > 0) {
    const errorPinIds = new Set<string>();
    for (const gateId of buildResult.shortCircuitGates) {
      const gate = circuit.getGate(gateId);
      for (const p of [...gate.inputPins, ...gate.outputPins])
        errorPinIds.add(p as string);
    }
    for (const net of buildResult.nets.values()) {
      let touches = false;
      for (const nid of net.nodeIds) {
        const node = circuit.getWireNode(nid);
        if (node.pinId && errorPinIds.has(node.pinId as string)) { touches = true; break; }
      }
      if (touches) {
        for (const sid of net.segmentIds) errorSegments.add(sid as string);
      }
    }
  }

  if (contentionNets.length > 0) {
    const contentionSet = new Set(contentionNets.map(id => id as string));
    for (const net of buildResult.nets.values()) {
      if (contentionSet.has(net.id as string)) {
        for (const sid of net.segmentIds) errorSegments.add(sid as string);
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
      if (node.pinId) {
        const pin = circuit.getPin(node.pinId);
        if (pin.value !== null) netValue = pin.value;
        netBitWidth = pin.bitWidth;
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

function evaluateBinaryGate(
  gate: Gate,
  circuit: Circuit,
  op: (a: number, b: number, mask: number) => number,
): void {
  const inA = circuit.getPin(gate.inputPins[0]);
  const inB = circuit.getPin(gate.inputPins[1]);
  const out = circuit.getPin(gate.outputPins[0]);
  const mask = ((1 << out.bitWidth) >>> 0) - 1;
  out.value = op(inA.value ?? 0, inB.value ?? 0, mask);
}

function evaluateUnaryGate(
  gate: Gate,
  circuit: Circuit,
  op: (a: number, mask: number) => number,
): void {
  const input = circuit.getPin(gate.inputPins[0]);
  const out = circuit.getPin(gate.outputPins[0]);
  const mask = ((1 << out.bitWidth) >>> 0) - 1;
  out.value = op(input.value ?? 0, mask);
}

function evaluateGate(gate: Gate, circuit: Circuit): void {
  switch (gate.type) {
    case 'nand':
      evaluateBinaryGate(gate, circuit, (a, b, mask) => (~(a & b) & mask) >>> 0);
      break;
    case 'and':
      evaluateBinaryGate(gate, circuit, (a, b) => a & b);
      break;
    case 'or':
      evaluateBinaryGate(gate, circuit, (a, b) => a | b);
      break;
    case 'nor':
      evaluateBinaryGate(gate, circuit, (a, b, mask) => (~(a | b) & mask) >>> 0);
      break;
    case 'xor':
      evaluateBinaryGate(gate, circuit, (a, b) => a ^ b);
      break;
    case 'xnor':
      evaluateBinaryGate(gate, circuit, (a, b, mask) => (~(a ^ b) & mask) >>> 0);
      break;
    case 'not':
    case '8bit-not':
      evaluateUnaryGate(gate, circuit, (a, mask) => (~a & mask) >>> 0);
      break;
    case '8bit-or':
      evaluateBinaryGate(gate, circuit, (a, b) => a | b);
      break;
    case '8bit-nor':
      evaluateBinaryGate(gate, circuit, (a, b, mask) => (~(a | b) & mask) >>> 0);
      break;
    case '3bit-or': {
      const inA = circuit.getPin(gate.inputPins[0]);
      const inB = circuit.getPin(gate.inputPins[1]);
      const inC = circuit.getPin(gate.inputPins[2]);
      circuit.getPin(gate.outputPins[0]).value = (inA.value ?? 0) | (inB.value ?? 0) | (inC.value ?? 0);
      break;
    }
    case '3bit-and': {
      const inA = circuit.getPin(gate.inputPins[0]);
      const inB = circuit.getPin(gate.inputPins[1]);
      const inC = circuit.getPin(gate.inputPins[2]);
      circuit.getPin(gate.outputPins[0]).value = (inA.value ?? 0) & (inB.value ?? 0) & (inC.value ?? 0);
      break;
    }
    case '2bit-adder': {
      const a = circuit.getPin(gate.inputPins[0]).value ?? 0;
      const b = circuit.getPin(gate.inputPins[1]).value ?? 0;
      const sum = a + b;
      circuit.getPin(gate.outputPins[0]).value = sum & 1;        // S
      circuit.getPin(gate.outputPins[1]).value = (sum >> 1) & 1; // C
      break;
    }
    case '3bit-adder': {
      const a = circuit.getPin(gate.inputPins[0]).value ?? 0;
      const b = circuit.getPin(gate.inputPins[1]).value ?? 0;
      const cin = circuit.getPin(gate.inputPins[2]).value ?? 0;
      const sum = a + b + cin;
      circuit.getPin(gate.outputPins[0]).value = sum & 1;        // S
      circuit.getPin(gate.outputPins[1]).value = (sum >> 1) & 1; // Cout
      break;
    }
    case '1bit-decoder': {
      const a = circuit.getPin(gate.inputPins[0]).value ?? 0;
      circuit.getPin(gate.outputPins[0]).value = a === 0 ? 1 : 0;
      circuit.getPin(gate.outputPins[1]).value = a === 0 ? 0 : 1;
      break;
    }
    case '3bit-decoder': {
      const a = circuit.getPin(gate.inputPins[0]).value ?? 0;
      const b = circuit.getPin(gate.inputPins[1]).value ?? 0;
      const c = circuit.getPin(gate.inputPins[2]).value ?? 0;
      const idx = (a << 2) | (b << 1) | c;
      for (let i = 0; i < 8; i++) {
        circuit.getPin(gate.outputPins[i]).value = i === idx ? 1 : 0;
      }
      break;
    }
    case '8bit-negative': {
      const a = circuit.getPin(gate.inputPins[0]).value ?? 0;
      circuit.getPin(gate.outputPins[0]).value = (-a & 0xFF) >>> 0;
      break;
    }
    case 'constant': {
      const out = circuit.getPin(gate.outputPins[0]);
      if (out.value === null) out.value = 0;
      break;
    }
    case 'switch': {
      const sel = circuit.getPin(gate.inputPins[0]);
      const inA = circuit.getPin(gate.inputPins[1]);
      const inB = circuit.getPin(gate.inputPins[2]);
      const out = circuit.getPin(gate.outputPins[0]);
      out.value = (sel.value !== null && sel.value !== 0) ? (inB.value ?? 0) : (inA.value ?? 0);
      break;
    }
    case 'tristate': {
      const input = circuit.getPin(gate.inputPins[0]);
      const enable = circuit.getPin(gate.inputPins[1]);
      const out = circuit.getPin(gate.outputPins[0]);
      out.value = (enable.value !== null && enable.value !== 0) ? input.value : null;
      break;
    }
    case 'splitter': {
      const input = circuit.getPin(gate.inputPins[0]);
      const inputVal = input.value ?? 0;
      for (let i = 0; i < gate.outputPins.length; i++) {
        circuit.getPin(gate.outputPins[i]).value = (inputVal >>> i) & 1;
      }
      break;
    }
    case 'joiner': {
      const out = circuit.getPin(gate.outputPins[0]);
      let result = 0;
      for (let i = 0; i < gate.inputPins.length; i++) {
        const input = circuit.getPin(gate.inputPins[i]);
        result |= ((input.value ?? 0) & 1) << i;
      }
      out.value = result;
      break;
    }
    case 'input':
    case 'output': {
      const valuePin = gate.type === 'input'
        ? circuit.getPin(gate.outputPins[0])
        : circuit.getPin(gate.inputPins[0]);

      const enablePinId = gate.type === 'input' ? gate.inputPins[0] : gate.inputPins[1];
      if (enablePinId) {
        const enablePin = circuit.getPin(enablePinId);
        if (enablePin.value === 0) {
          if (gate.type === 'input') {
            circuit.getPin(gate.outputPins[0]).value = null;
          }
          return;
        }
      }

      void valuePin;
      break;
    }
    default:
      break;
  }
}
