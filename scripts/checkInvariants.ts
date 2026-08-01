/**
 * Randomized consistency check for Circuit's adjacency indexes.
 *
 * Circuit maintains segments-per-node and node-per-pin indexes beside its maps. Those
 * indexes are only trustworthy if every mutation path maintains them, including undo/redo
 * and pin detach/reattach. This drives a pseudo-random command stream and re-derives both
 * indexes by brute force after every step, so a missed path fails here rather than as a
 * wrong wire on screen.
 *
 * Run with `npm run check:invariants`. The seed is fixed, so failures reproduce.
 */
import './localStorageShim.ts';
import { createEditorState } from '../src/circuit-builder/editor/EditorState.ts';
import { Circuit } from '../src/circuit-builder/simulation/circuit.ts';
import {
  generateId, pinRefKey,
  type GateId, type PinRef, type WireNodeId, type WireSegmentId,
} from '../src/circuit-builder/editor/types.ts';
import {
  AddGateCommand, AddWireNodeCommand, AddWireSegmentCommand, CommandHistory,
  MoveGatesCommand, MoveWireNodeCommand, RemoveGateCommand, RemoveWireNodeCommand,
  RemoveWireSegmentCommand, RotateGatesCommand,
} from '../src/circuit-builder/editor/commands.ts';
import { buildScene } from '../src/circuit-builder/editor/render/buildScene.ts';
import { emptyDragPreview } from '../src/circuit-builder/editor/EditorState.ts';
import { getPinPositions } from '../src/circuit-builder/editor/utils/geometry.ts';
import { QueueTestRunner, type TestGateLabels } from '../src/circuit-builder/editor/QueueTestRunner.ts';
import type { TestCommand } from '../src/circuit-builder/testing/dslParser.ts';
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

  // findNodeForPin must name a node that really carries the pin. Where two nodes claim one
  // pin — malformed but reachable — either is acceptable, so only membership is asserted.
  const claimantsByPin = new Map<string, Set<WireNodeId>>();
  const byGate = new Map<GateId, Set<WireNodeId>>();
  for (const node of c.wireNodes.values()) {
    if (!node.pin) continue;
    const key = pinRefKey(node.pin);
    if (!claimantsByPin.has(key)) claimantsByPin.set(key, new Set());
    claimantsByPin.get(key)!.add(node.id);
    if (!byGate.has(node.pin.gateId)) byGate.set(node.pin.gateId, new Set());
    byGate.get(node.pin.gateId)!.add(node.id);
  }
  for (const [key, claimants] of claimantsByPin) {
    const [gateId, kind, index] = key.split(':');
    const got = c.findNodeForPin({ gateId: gateId as GateId, kind: kind as 'input' | 'output', index: +index });
    if (got === null || !claimants.has(got)) {
      throw new Error(`${step}: findNodeForPin(${key}) = ${got}, expected one of {${[...claimants]}}`);
    }
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
      if (claimantsByPin.has(key)) continue;
      const got = c.findNodeForPin({ gateId: gate.id, kind, index: 99 });
      if (got !== null) throw new Error(`${step}: findNodeForPin(${key}) = ${got}, expected null`);
    }
  }
}

const TYPES: GateType[] = ['nand', 'not', 'and', 'constant', 'delay', '8bit-memory', 'splitter', 'ram'];
const ops = { addGate: 0, addNode: 0, addSeg: 0, rmGate: 0, rmNode: 0, rmSeg: 0, move: 0, rotate: 0, disconnect: 0, undo: 0, redo: 0 };

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
    // Disconnect drag: MoveGatesCommand detaches the gate's pins, undo restores them
    const id = pick(gateIds);
    if (id) {
      history.execute(new MoveGatesCommand(state, [id], { x: 20, y: 20 }, [], true));
      verify(`step ${i} post-disconnect`);
      ops.disconnect++;
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

// ---------------------------------------------------------------------------
// Drag preview equivalence
//
// Drags are drawn from EditorState.dragPreview while the circuit stays untouched, then
// committed as a command at mouseup. Those two paths must agree, or a drag would visibly
// jump at the moment the mouse is released. Each case below renders the preview, commits
// the same movement, renders again, and compares.
// ---------------------------------------------------------------------------

function positionsOf(scene: ReturnType<typeof buildScene>): string {
  const round = (v: number) => Math.round(v * 100) / 100;
  const gates = scene.gates.map(g => `G${round(g.center.x)},${round(g.center.y)}`).sort();
  const nodes = scene.wireNodes.map(n => `N${round(n.pos.x)},${round(n.pos.y)}`).sort();
  const segs = scene.wireSegments
    .map(s => `S${round(s.from.x)},${round(s.from.y)}->${round(s.to.x)},${round(s.to.y)}`).sort();
  const pins = scene.pins.map(p => `P${round(p.pos.x)},${round(p.pos.y)}`).sort();
  return JSON.stringify({ gates, nodes, segs, pins });
}

function freshScene(): { state: ReturnType<typeof createEditorState>; history: CommandHistory;
    gateA: GateId; gateB: GateId; nodeA: WireNodeId; nodeB: WireNodeId; segment: WireSegmentId } {
  const st = createEditorState();
  st.circuit = new Circuit();
  const hist = new CommandHistory();

  const addA = new AddGateCommand(st, 'nand', { x: 100, y: 100 });
  hist.execute(addA);
  const addB = new AddGateCommand(st, 'not', { x: 300, y: 100 });
  hist.execute(addB);
  const gateA = addA.getGateId(), gateB = addB.getGateId();

  // Wire gateA's output pin to gateB's input pin through their anchored nodes
  const outPos = getPinPositions(st.circuit.getGate(gateA)).outputs[0];
  const inPos = getPinPositions(st.circuit.getGate(gateB)).inputs[0];
  const nA = new AddWireNodeCommand(st, { x: outPos.x, y: outPos.y },
    { gateId: gateA, kind: 'output', index: 0 });
  hist.execute(nA);
  const nB = new AddWireNodeCommand(st, { x: inPos.x, y: inPos.y },
    { gateId: gateB, kind: 'input', index: 0 });
  hist.execute(nB);
  const seg = new AddWireSegmentCommand(st, nA.getNodeId(), nB.getNodeId());
  hist.execute(seg);

  st.circuit.tick(new Map());
  return { state: st, history: hist, gateA, gateB,
    nodeA: nA.getNodeId(), nodeB: nB.getNodeId(), segment: seg.getSegmentId() };
}

function expectEqual(label: string, previewed: string, committed: string): void {
  if (previewed !== committed) {
    throw new Error(`${label}: preview and commit disagree\n  preview:   ${previewed}\n  committed: ${committed}`);
  }
  console.log('ok   ' + label);
}

// 1. Gate drag — gate, its pins, its anchored node and the wire all follow the offset.
{
  const offset = { x: 40, y: -20 };
  const a = freshScene();
  const before = positionsOf(buildScene(a.state));
  a.state.dragPreview = { ...emptyDragPreview(), gateIds: [a.gateA], offset };
  const previewed = positionsOf(buildScene(a.state));
  if (previewed === before) throw new Error('gate drag: preview changed nothing');
  // ...and the circuit itself must be untouched while dragging
  a.state.dragPreview = null;
  if (positionsOf(buildScene(a.state)) !== before) {
    throw new Error('gate drag: preview mutated the circuit');
  }

  const b = freshScene();
  b.history.execute(new MoveGatesCommand(b.state, [b.gateA], offset, [], false));
  b.state.circuit.tick(new Map());
  expectEqual('gate drag preview == MoveGatesCommand', previewed, positionsOf(buildScene(b.state)));
}

// 2. Wire node drag — a free node moved to an absolute snapped position.
{
  const a = freshScene();
  const free = new AddWireNodeCommand(a.state, { x: 500, y: 500 });
  a.history.execute(free);
  a.history.execute(new AddWireSegmentCommand(a.state, free.getNodeId(), a.nodeB));
  a.state.circuit.tick(new Map());

  const target = { x: 560, y: 440 };
  const start = a.state.circuit.getWireNode(free.getNodeId()).pos;
  a.state.dragPreview = { ...emptyDragPreview(), nodeIds: [free.getNodeId()],
    offset: { x: target.x - start.x, y: target.y - start.y } };
  const previewed = positionsOf(buildScene(a.state));

  a.state.dragPreview = null;
  a.history.execute(new MoveWireNodeCommand(a.state, free.getNodeId(), target));
  a.state.circuit.tick(new Map());
  expectEqual('node drag preview == MoveWireNodeCommand', previewed, positionsOf(buildScene(a.state)));
}

// 3. Split drag — one segment shown as two halves through the dragged point.
{
  const a = freshScene();
  const splitAt = { x: 220, y: 160 };
  a.state.dragPreview = { ...emptyDragPreview(), split: { segmentId: a.segment, pos: splitAt } };
  const preview = buildScene(a.state);
  const base = buildScene(freshScene().state);
  if (preview.wireSegments.length !== base.wireSegments.length + 1) {
    throw new Error(`split preview: expected ${base.wireSegments.length + 1} segments, got ${preview.wireSegments.length}`);
  }
  if (preview.wireNodes.length !== base.wireNodes.length + 1) {
    throw new Error(`split preview: expected one extra node, got ${preview.wireNodes.length - base.wireNodes.length}`);
  }
  const previewed = positionsOf(preview);

  // Commit the same split: remove the segment, add a node, add two segments.
  const b = freshScene();
  const seg = b.state.circuit.getWireSegment(b.segment);
  const from = seg.from, to = seg.to;
  b.history.beginBatch('split');
  b.history.execute(new RemoveWireSegmentCommand(b.state, b.segment, false));
  const mid = new AddWireNodeCommand(b.state, splitAt);
  b.history.execute(mid);
  b.history.execute(new AddWireSegmentCommand(b.state, from, mid.getNodeId()));
  b.history.execute(new AddWireSegmentCommand(b.state, mid.getNodeId(), to));
  b.history.endBatch();
  b.state.circuit.tick(new Map());
  expectEqual('split drag preview == committed split', previewed, positionsOf(buildScene(b.state)));
}

// 4. Disconnect drag — the gate moves, its wires and their nodes stay behind.
{
  const offset = { x: 60, y: 60 };
  const a = freshScene();
  a.state.dragPreview = { ...emptyDragPreview(), gateIds: [a.gateA], offset,
    detachedNodeIds: a.state.circuit.anchoredNodesOf([a.gateA]) };
  const previewed = positionsOf(buildScene(a.state));

  const b = freshScene();
  b.history.execute(new MoveGatesCommand(b.state, [b.gateA], offset, [], true));
  b.state.circuit.tick(new Map());
  const committed = positionsOf(buildScene(b.state));
  expectEqual('disconnect drag preview == MoveGatesCommand(disconnected)', previewed, committed);

  if (b.state.circuit.getWireNode(b.nodeA).pin !== undefined) {
    throw new Error('disconnect commit: node is still anchored to the gate pin');
  }
  b.history.undo();
  if (b.state.circuit.getWireNode(b.nodeA).pin === undefined) {
    throw new Error('disconnect undo: pin was not reattached');
  }
  console.log('ok   disconnect detaches on execute and reattaches on undo');
}

console.log('drag preview equivalence OK');

// ---------------------------------------------------------------------------
// Queue test runner
//
// The sequential engine is driven by the circuit's enable pins, not by a fixed schedule,
// so it needs a real handshake circuit to exercise. This builds an echo: a switch input
// feeding a switch output, both permanently enabled, then runs write/read pairs through it.
// ---------------------------------------------------------------------------

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) throw new Error(`${label} FAILED${detail ? ': ' + detail : ''}`);
  console.log('ok   ' + label);
}

function buildEchoCircuit(): { circuit: Circuit; labels: TestGateLabels } {
  const circuit = new Circuit();
  const mk = (type: GateType, label: string, x: number) => {
    const id = generateId('q') as GateId;
    circuit.addGate({ id, type, pos: { x, y: 0 }, rotation: 0, label });
    return id;
  };
  const wire = (from: PinRef, to: PinRef) => {
    const a = generateId('qn') as WireNodeId;
    const b = generateId('qn') as WireNodeId;
    circuit.addWireNode({ id: a, pos: { x: 0, y: 0 }, pin: from });
    circuit.addWireNode({ id: b, pos: { x: 0, y: 0 }, pin: to });
    circuit.addWireSegment({ id: generateId('qs') as WireSegmentId, from: a, to: b });
  };

  const input = mk('input-sw', 'A', 0);
  const output = mk('output-sw', 'B', 200);
  const one = mk('constant', 'one', 100);
  circuit.getGate(one).value = 1;

  wire({ gateId: input, kind: 'output', index: 0 }, { gateId: output, kind: 'input', index: 0 });
  // Enables held high, so every tick is a valid handshake window
  wire({ gateId: one, kind: 'output', index: 0 }, { gateId: input, kind: 'input', index: 0 });
  wire({ gateId: one, kind: 'output', index: 0 }, { gateId: output, kind: 'input', index: 1 });

  return {
    circuit,
    labels: { inputs: new Map([['A', input]]), outputs: new Map([['B', output]]) },
  };
}

function runQueue(commands: TestCommand[], maxTicks = 50): QueueTestRunner {
  const { circuit, labels } = buildEchoCircuit();
  const runner = new QueueTestRunner(labels);
  runner.start(circuit, commands, []);
  for (let i = 0; i < maxTicks && !runner.tick(circuit); i++) { /* keep ticking */ }
  return runner;
}

{
  const w = (label: string, value: number): TestCommand => ({ type: 'write', label, value });
  const r = (label: string, value: number): TestCommand => ({ type: 'read', label, value });

  const passing = runQueue([w('A', 1), r('B', 1), w('A', 0), r('B', 0)]);
  check('queue run completes', passing.done);
  check('queue run passes', !passing.failed,
    passing.results.filter(x => x.status === 'failed').map(x => x.error).join('; '));
  check('every command passed', passing.results.every(x => x.status === 'passed'),
    passing.results.map(x => x.status).join(','));

  const failing = runQueue([w('A', 1), r('B', 0)]);
  check('wrong expected value fails', failing.failed);
  check('failure records the actual value',
    failing.results[1].actual === 1 && (failing.results[1].error ?? '').includes('got 1'),
    JSON.stringify(failing.results[1]));

  const missing = runQueue([w('nope', 1)]);
  check('unknown label fails', missing.failed);
  check('unknown label is named', (missing.results[0].error ?? '').includes('nope'),
    missing.results[0].error);

  const grouped = runQueue([w('A', 1), r('B', 1)]);
  check('results carry case boundaries', grouped.results.every(x => x.caseStart === false));
}

console.log('queue test runner OK');
