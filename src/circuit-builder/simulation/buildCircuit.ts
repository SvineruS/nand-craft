import { Circuit } from './circuit.ts';
import type { GateId, Net, NetId, WireNodeId, WireSegmentId, } from '../editor/types.ts';
import { pinRefKey } from '../editor/types.ts';
import type { BuildResult } from './types.ts';
import { getPinCounts } from '../editor/gates.ts';
import { compileProgram, isCombinational } from './program.ts';

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
  const graph = buildCombinationalGraph(circuit, nets, pinToNet);
  const evaluationOrder = topologicalSort(graph);
  const shortCircuitGates = detectCycles(graph).flat();

  return {
    nets,
    shortCircuitGates,
    program: compileProgram(circuit, nets, evaluationOrder, shortCircuitGates),
  };
}

/**
 * Driver -> receiver edges over the combinational subgraph, built once and shared by
 * topologicalSort and detectCycles (which previously each walked every net themselves).
 *
 * Edges are a multiset: one per (receiver input pin, driver output node) pair, kept
 * parallel because Kahn's algorithm decrements `inDegree` once per edge it follows.
 * Tarjan's SCC is indifferent to duplicates. Self-edges are excluded here and reported
 * as `selfLoops` — a gate feeding itself can never reach in-degree zero, and it is a
 * cycle of length 1 that SCC detection would otherwise miss.
 */
interface CombinationalGraph {
  gateIds: GateId[];
  successors: Map<GateId, GateId[]>;
  inDegree: Map<GateId, number>;
  selfLoops: GateId[];
}

function buildCombinationalGraph(
  circuit: Circuit,
  nets: Map<NetId, Net>,
  pinToNet: Map<string, NetId>,
): CombinationalGraph {
  const gateIds: GateId[] = [];
  const combGateIds = new Set<GateId>();
  for (const gate of circuit.gates.values()) {
    if (isCombinational(gate.type)) {
      combGateIds.add(gate.id);
      gateIds.push(gate.id);
    }
  }

  const successors = new Map<GateId, GateId[]>();
  const inDegree = new Map<GateId, number>();
  for (const gateId of gateIds) {
    successors.set(gateId, []);
    inDegree.set(gateId, 0);
  }

  const selfLoopSet = new Set<GateId>();
  for (const gateId of gateIds) {
    const inputCount = getPinCounts(circuit.getGate(gateId).type).inputs;

    for (let i = 0; i < inputCount; i++) {
      const netId = pinToNet.get(pinRefKey({ gateId, kind: 'input', index: i }));
      if (!netId) continue;

      for (const nodeId of nets.get(netId)!.nodeIds) {
        const pin = circuit.getWireNode(nodeId).pin;
        if (!pin || pin.kind !== 'output') continue;
        if (!combGateIds.has(pin.gateId)) continue;

        if (pin.gateId === gateId) {
          selfLoopSet.add(gateId);
          continue;
        }
        successors.get(pin.gateId)!.push(gateId);
        inDegree.set(gateId, inDegree.get(gateId)! + 1);
      }
    }
  }

  return { gateIds, successors, inDegree, selfLoops: [...selfLoopSet] };
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

  const nets = new Map<NetId, Net>();
  const groups = uf.groups();
  // Net ids are rebuilt from scratch on every topology change and never persisted, so
  // they use a build-local counter. Drawing from generateId() would inflate the shared
  // counter that gate/node/segment ids are restored against on load.
  let nextNetIndex = 0;
  for (const [_root, nodeIds] of groups) {
    const netId = `net_${nextNetIndex++}` as NetId;
    const segmentIdSet = new Set<WireSegmentId>();
    for (const nid of nodeIds) {
      for (const sid of circuit.segmentsOf(nid)) segmentIdSet.add(sid);
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

/**
 * Topological sort of the combinational subgraph only. Sequential gates and input-type
 * gates are absent from the graph, so they act as fixed sources.
 *
 * Gates left with non-zero in-degree are inside a feedback cycle; they are omitted from
 * the result, which is what tells buildSchedule to give their nets a final sweep.
 */
function topologicalSort(graph: CombinationalGraph): GateId[] {
  const { successors, gateIds } = graph;
  const inDegree = new Map(graph.inDegree);

  // Index cursor rather than shift(): shift() is O(n) per call on large arrays.
  const queue: GateId[] = [];
  for (const gateId of gateIds) {
    if (inDegree.get(gateId) === 0) queue.push(gateId);
  }

  const sorted: GateId[] = [];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    sorted.push(current);
    for (const neighbor of successors.get(current)!) {
      const remaining = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, remaining);
      if (remaining === 0) queue.push(neighbor);
    }
  }

  return sorted;
}

/**
 * Find feedback loops in the combinational subgraph (no sequential gate breaking the
 * loop). Returns arrays of gate IDs forming cycles.
 *
 * Iterative Tarjan: the recursive form overflowed the stack on deep chains, and circuits
 * here are deliberately deep (the bench fixture alone has a 128-level carry chain).
 */
function detectCycles(graph: CombinationalGraph): GateId[][] {
  const { gateIds, successors, selfLoops } = graph;
  const cycles: GateId[][] = selfLoops.map(id => [id]);

  let index = 0;
  const nodeIndex = new Map<GateId, number>();
  const lowLink = new Map<GateId, number>();
  const onStack = new Set<GateId>();
  const sccStack: GateId[] = [];

  /** Explicit call stack: the gate being visited plus how far into its successors we are. */
  const callStack: { gate: GateId; nextEdge: number }[] = [];

  for (const root of gateIds) {
    if (nodeIndex.has(root)) continue;

    nodeIndex.set(root, index);
    lowLink.set(root, index);
    index++;
    sccStack.push(root);
    onStack.add(root);
    callStack.push({ gate: root, nextEdge: 0 });

    while (callStack.length > 0) {
      const frame = callStack[callStack.length - 1];
      const edges = successors.get(frame.gate)!;

      if (frame.nextEdge < edges.length) {
        const next = edges[frame.nextEdge++];
        if (!nodeIndex.has(next)) {
          // Descend — the post-visit lowLink merge happens when this frame pops.
          nodeIndex.set(next, index);
          lowLink.set(next, index);
          index++;
          sccStack.push(next);
          onStack.add(next);
          callStack.push({ gate: next, nextEdge: 0 });
        } else if (onStack.has(next)) {
          lowLink.set(frame.gate, Math.min(lowLink.get(frame.gate)!, nodeIndex.get(next)!));
        }
        continue;
      }

      // All edges walked — close this gate out.
      callStack.pop();
      const parent = callStack[callStack.length - 1];
      if (parent) {
        lowLink.set(parent.gate, Math.min(lowLink.get(parent.gate)!, lowLink.get(frame.gate)!));
      }

      if (lowLink.get(frame.gate) === nodeIndex.get(frame.gate)) {
        const scc: GateId[] = [];
        let popped: GateId;
        do {
          popped = sccStack.pop()!;
          onStack.delete(popped);
          scc.push(popped);
        } while (popped !== frame.gate);
        if (scc.length > 1) cycles.push(scc);
      }
    }
  }

  return cycles;
}
