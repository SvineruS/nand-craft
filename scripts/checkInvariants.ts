/**
 * Randomized consistency check for Circuit's adjacency indexes.
 *
 * Circuit maintains segments-per-node and node-per-pin indexes beside its maps. Those
 * indexes are only trustworthy if every mutation path maintains them, including undo/redo
 * and the live drag mutations that deliberately bypass CommandHistory. This drives a
 * pseudo-random command stream and re-derives both indexes by brute force after every
 * step, so a missed path fails here rather than as a wrong wire on screen.
 *
 * Run with `npm run check:invariants`. The seed is fixed, so failures reproduce.
 */
import './localStorageShim.ts';
import { createEditorState } from '../src/circuit-builder/editor/EditorState.ts';
import { Circuit } from '../src/circuit-builder/simulation/circuit.ts';
import { pinRefKey, type GateId, type WireNodeId, type WireSegmentId } from '../src/circuit-builder/editor/types.ts';
import {
  AddGateCommand, AddWireNodeCommand, AddWireSegmentCommand, CommandHistory,
  MoveGatesCommand, RemoveGateCommand, RemoveWireNodeCommand, RemoveWireSegmentCommand,
  RotateGatesCommand,
} from '../src/circuit-builder/editor/commands.ts';
import { splitSegmentInPlace, rollbackSplit } from '../src/circuit-builder/editor/dragMutations.ts';
import type { GateType } from '../src/circuit-builder/simulation/gateTypes.ts';

// Deterministic PRNG so a failure is reproducible.
let seed = 12345;
const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = <T>(xs: T[]): T | undefined => xs.length ? xs[Math.floor(rand() * xs.length)] : undefined;

const state = createEditorState();
state.circuit = new Circuit();
const history = new CommandHistory();

/** Recompute both indexes by brute force and compare with what Circuit reports. */
function verify(step: string): void {
  const c = state.circuit;

  for (const node of c.wireNodes.values()) {
    const expected = new Set<WireSegmentId>();
    for (const seg of c.wireSegments.values()) {
      if (seg.from === node.id || seg.to === node.id) expected.add(seg.id);
    }
    const actual = new Set(c.segmentsOf(node.id));
    if (expected.size !== actual.size || [...expected].some(id => !actual.has(id))) {
      throw new Error(`${step}: segmentsOf(${node.id}) = {${[...actual]}}, expected {${[...expected]}}`);
    }
    if (c.degreeOf(node.id) !== expected.size) {
      throw new Error(`${step}: degreeOf(${node.id}) = ${c.degreeOf(node.id)}, expected ${expected.size}`);
    }
  }
  // segmentsOf must not report segments for nodes that no longer exist
  for (const seg of c.wireSegments.values()) {
    for (const end of [seg.from, seg.to]) {
      if (!c.wireNodes.has(end)) throw new Error(`${step}: segment ${seg.id} references missing node ${end}`);
    }
  }

  const firstByPin = new Map<string, WireNodeId>();
  const byGate = new Map<GateId, Set<WireNodeId>>();
  for (const node of c.wireNodes.values()) {
    if (!node.pin) continue;
    const key = pinRefKey(node.pin);
    if (!firstByPin.has(key)) firstByPin.set(key, node.id);
    if (!byGate.has(node.pin.gateId)) byGate.set(node.pin.gateId, new Set());
    byGate.get(node.pin.gateId)!.add(node.id);
  }
  for (const [key, nodeId] of firstByPin) {
    const [gateId, kind, index] = key.split(':');
    const got = c.findNodeForPin({ gateId: gateId as GateId, kind: kind as 'input' | 'output', index: +index });
    if (got !== nodeId) throw new Error(`${step}: findNodeForPin(${key}) = ${got}, expected ${nodeId}`);
  }
  for (const gate of c.gates.values()) {
    const expected = byGate.get(gate.id) ?? new Set();
    const actual = new Set(c.anchoredNodesOf([gate.id]));
    if (expected.size !== actual.size || [...expected].some(id => !actual.has(id))) {
      throw new Error(`${step}: anchoredNodesOf(${gate.id}) = {${[...actual]}}, expected {${[...expected]}}`);
    }
  }
  // A pin with no node must report null
  for (const gate of c.gates.values()) {
    for (const kind of ['input', 'output'] as const) {
      const key = pinRefKey({ gateId: gate.id, kind, index: 99 });
      if (firstByPin.has(key)) continue;
      const got = c.findNodeForPin({ gateId: gate.id, kind, index: 99 });
      if (got !== null) throw new Error(`${step}: findNodeForPin(${key}) = ${got}, expected null`);
    }
  }
}

const TYPES: GateType[] = ['nand', 'not', 'and', 'constant', 'delay', '8bit-memory', 'splitter'];
const ops = { addGate: 0, addNode: 0, addSeg: 0, rmGate: 0, rmNode: 0, rmSeg: 0, move: 0, rotate: 0, split: 0, undo: 0, redo: 0 };

for (let i = 0; i < 4000; i++) {
  const c = state.circuit;
  const gateIds = [...c.gates.keys()];
  const nodeIds = [...c.wireNodes.keys()];
  const segIds = [...c.wireSegments.keys()];
  const roll = rand();

  if (roll < 0.18) {
    history.execute(new AddGateCommand(state, pick(TYPES)!,
      { x: Math.floor(rand() * 10) * 20, y: Math.floor(rand() * 10) * 20 }));
    ops.addGate++;
  } else if (roll < 0.34) {
    const gateId = pick(gateIds);
    // Half the new nodes anchor to a pin, half are free
    const pin = gateId && rand() < 0.6
      ? { gateId, kind: (rand() < 0.5 ? 'input' : 'output') as 'input' | 'output', index: Math.floor(rand() * 2) }
      : undefined;
    history.execute(new AddWireNodeCommand(state,
      { x: Math.floor(rand() * 10) * 20, y: Math.floor(rand() * 10) * 20 }, pin));
    ops.addNode++;
  } else if (roll < 0.50) {
    const a = pick(nodeIds), b = pick(nodeIds);
    if (a && b && a !== b) { history.execute(new AddWireSegmentCommand(state, a, b)); ops.addSeg++; }
  } else if (roll < 0.58) {
    const id = pick(gateIds);
    if (id) { history.execute(new RemoveGateCommand(state, id)); ops.rmGate++; }
  } else if (roll < 0.66) {
    const id = pick(nodeIds);
    if (id) { history.execute(new RemoveWireNodeCommand(state, id)); ops.rmNode++; }
  } else if (roll < 0.74) {
    const id = pick(segIds);
    if (id) { history.execute(new RemoveWireSegmentCommand(state, id)); ops.rmSeg++; }
  } else if (roll < 0.80) {
    const id = pick(gateIds);
    if (id) { history.execute(new MoveGatesCommand(state, [id], { x: 20, y: 0 })); ops.move++; }
  } else if (roll < 0.85) {
    const id = pick(gateIds);
    if (id) { history.execute(new RotateGatesCommand(state, [id])); ops.rotate++; }
  } else if (roll < 0.90) {
    // Live drag mutation + rollback, the path that bypasses history
    const id = pick(segIds);
    if (id) {
      const rec = splitSegmentInPlace(c, id, { x: 40, y: 40 });
      verify(`step ${i} mid-split`);
      rollbackSplit(c, rec);
      ops.split++;
    }
  } else if (roll < 0.95) {
    history.undo(); ops.undo++;
  } else {
    history.redo(); ops.redo++;
  }

  verify(`step ${i}`);
}

console.log('check:invariants OK — 4000 randomized operations, indexes consistent at every step');
console.log('op mix:', JSON.stringify(ops));
console.log(`final circuit: ${state.circuit.gates.size} gates, ${state.circuit.wireNodes.size} nodes, ${state.circuit.wireSegments.size} segments`);
state.circuit.tick(new Map());
console.log('final tick ok, nets:', state.circuit.getBuild()!.nets.size);
