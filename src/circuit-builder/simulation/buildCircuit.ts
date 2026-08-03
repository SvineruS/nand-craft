import { Circuit } from './circuit.ts';
import type { GateId, Net, NetId } from '../editor/types.ts';
import { pinRefKey } from '../editor/types.ts';
import type { BuildResult } from './types.ts';
import { getGatePinMeta } from '../editor/gates.ts';
import { compileProgram, isEvaluated } from './program.ts';
import { buildNets, buildPinToNet } from './nets.ts';
import { getRegisteredInputs } from './registeredInputs.ts';

// ---------------------------------------------------------------------------
// Build: structural analysis cached until topology changes
// ---------------------------------------------------------------------------



/** Build cached structural analysis from circuit topology. */
export function build(circuit: Circuit): BuildResult {
  const nets = buildNets(circuit);
  const pinToNet = buildPinToNet(circuit, nets);
  const graph = buildDependencyGraph(circuit, nets, pinToNet);
  const evaluationOrder = topologicalSort(graph);
  const shortCircuitGates = detectCycles(graph).flat();

  return {
    nets,
    shortCircuitGates,
    program: compileProgram(circuit, nets, evaluationOrder, shortCircuitGates),
  };
}

/**
 * Driver -> receiver edges over the evaluated gates, built once and shared by
 * topologicalSort and detectCycles (which previously each walked every net themselves).
 *
 * An edge exists only for a pin the receiver reads *during* propagation. A registered pin
 * belongs to the latch phase instead, so it carries no edge — which is what makes a
 * register a natural in-degree-zero root rather than a gate the graph has to exclude, and
 * what makes an output wired back to one a one-tick loop rather than a cycle.
 *
 * Edges are a multiset: one per (receiver input pin, driver output node) pair, kept
 * parallel because Kahn's algorithm decrements `inDegree` once per edge it follows.
 * Tarjan's SCC is indifferent to duplicates. Self-edges are excluded here and reported
 * as `selfLoops` — a gate feeding itself can never reach in-degree zero, and it is a
 * cycle of length 1 that SCC detection would otherwise miss.
 */
interface DependencyGraph {
  gateIds: GateId[];
  successors: Map<GateId, GateId[]>;
  inDegree: Map<GateId, number>;
  selfLoops: GateId[];
}

function buildDependencyGraph(
  circuit: Circuit,
  nets: Map<NetId, Net>,
  pinToNet: Map<string, NetId>,
): DependencyGraph {
  const gateIds: GateId[] = [];
  const evaluatedGateIds = new Set<GateId>();
  for (const gate of circuit.gates.values()) {
    if (isEvaluated(gate.type)) {
      evaluatedGateIds.add(gate.id);
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
    const type = circuit.getGate(gateId).type;
    const inputCount = getGatePinMeta(type).inputCount;
    const registered = getRegisteredInputs(type);

    for (let i = 0; i < inputCount; i++) {
      if (registered[i]) continue;

      const netId = pinToNet.get(pinRefKey({ gateId, kind: 'input', index: i }));
      if (!netId) continue;

      for (const nodeId of nets.get(netId)!.nodeIds) {
        const pin = circuit.getWireNode(nodeId).pin;
        if (!pin || pin.kind !== 'output') continue;
        if (!evaluatedGateIds.has(pin.gateId)) continue;

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



/**
 * Topological sort of the dependency graph. Registers land at the front for free, having
 * no incoming edges, and externally driven inputs are absent from the graph entirely.
 *
 * Gates left with non-zero in-degree are inside a feedback cycle; they are omitted from
 * the result, which is what tells buildSchedule to give their nets a final sweep.
 */
function topologicalSort(graph: DependencyGraph): GateId[] {
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
 * Find feedback loops with no registered pin anywhere in them to break the loop — those
 * are the real short circuits. Returns arrays of gate IDs forming cycles.
 *
 * Iterative Tarjan: the recursive form overflowed the stack on deep chains, and circuits
 * here are deliberately deep (the bench fixture alone has a 128-level carry chain).
 */
function detectCycles(graph: DependencyGraph): GateId[][] {
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
