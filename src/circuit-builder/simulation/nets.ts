import type { Circuit } from './circuit.ts';
import type { Net, NetId, WireNodeId, WireSegmentId } from '../editor/types.ts';
import { pinRefKey } from '../editor/types.ts';

/**
 * Net derivation, shared by the circuit build (buildCircuit.ts) and the per-component
 * input timing analysis (registeredInputs.ts) — which has to derive the nets of an inner
 * circuit that is never built or ticked on its own.
 */

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

/** Rebuild all nets from wire connectivity using union-find. */
export function buildNets(circuit: Circuit): Map<NetId, Net> {
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
export function buildPinToNet(
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
