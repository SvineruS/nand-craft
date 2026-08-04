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
import { existsSync } from 'node:fs';
import { createEditorState } from '../src/circuit-builder/editor/EditorState.ts';
import { Circuit } from '../src/circuit-builder/simulation/circuit.ts';
import {
  generateId, pinRefKey,
  type GateId, type PinRef, type Rotation, type WireNodeId, type WireSegmentId,
} from '../src/circuit-builder/editor/types.ts';
import {
  AddGateCommand, AddWireNodeCommand, AddWireSegmentCommand, CommandHistory,
  MoveGatesCommand, MoveWireNodeCommand, RemoveGateCommand, RemoveWireNodeCommand,
  RemoveWireSegmentCommand, RotateGatesCommand, WriteRamCommand,
} from '../src/circuit-builder/editor/commands.ts';
import { clearGateState, padRamCells, RAM_SIZE } from '../src/circuit-builder/simulation/gateTypes.ts';
import { buildScene } from '../src/circuit-builder/editor/render/buildScene.ts';
import { emptyDragPreview } from '../src/circuit-builder/editor/EditorState.ts';
import {
  gateButtonPositions, gateCenter, getDrawnGateDims, getPinPositions,
} from '../src/circuit-builder/editor/utils/geometry.ts';
import { gateBounds, hitTestGate, hitTestGateButton } from '../src/circuit-builder/editor/utils/hitTests.ts';
import { BUILT_IN_GATE_TYPES } from '../src/circuit-builder/editor/gates.ts';
import { QueueTestRunner, type TestGateLabels } from '../src/circuit-builder/editor/QueueTestRunner.ts';
import {
  raiseWindow, registerWindow, unregisterWindow, WINDOW_Z_BASE,
} from '../src/ui/windowStacking.ts';
import { CanvasInput } from '../src/engine/input.ts';
import type { TestCommand } from '../src/circuit-builder/testing/dslParser.ts';
import { defaultPreprocessor } from '../src/circuit-builder/asm/defaultPreprocessor.ts';
import type { GateType } from '../src/circuit-builder/simulation/gateTypes.ts';

// Deterministic PRNG so a failure is reproducible.
let seed = 12345;
const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = <T>(xs: T[]): T | undefined => xs.length ? xs[Math.floor(rand() * xs.length)] : undefined;

const state = createEditorState();
state.circuit = new Circuit();
const history = new CommandHistory(state);

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
  const hist = new CommandHistory(st);

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
// Gate hit box vs drawn body
//
// A gate is drawn by rotating the canvas about its centre, so at 90°/270° a non-square body
// covers h × w — while `gate.pos` plus the definition still says w × h. Hit testing, rubber-
// band selection and drag clamping all compare world points against that box, and using the
// unrotated one made long rotated gates (SPL, DEC3) unclickable over most of their body.
//
// Pin positions come from an independent path (rotatePoint), so they anchor this: every pin
// sits on or inside the body, whatever the rotation.
// ---------------------------------------------------------------------------

{
  const rotations: Rotation[] = [0, 90, 180, 270];
  let cases = 0;

  for (const type of BUILT_IN_GATE_TYPES) {
    for (const rotation of rotations) {
      const st = createEditorState();
      st.circuit = new Circuit();
      const gateId = generateId('hb') as GateId;
      st.circuit.addGate({ id: gateId, type, pos: { x: 100, y: 100 }, rotation });
      const gate = st.circuit.getGate(gateId);
      const body = gateBounds(gate);
      const { inputs, outputs } = getPinPositions(gate);
      const where = `${type}@${rotation}°`;

      for (const pin of [...inputs, ...outputs]) {
        if (pin.x < body.x1 || pin.x > body.x2 || pin.y < body.y1 || pin.y > body.y2) {
          throw new Error(`${where}: pin ${pin.x},${pin.y} is outside the hit box `
            + `${body.x1},${body.y1}..${body.x2},${body.y2}`);
        }
        if (hitTestGate({ x: pin.x, y: pin.y }, st) !== gateId) {
          throw new Error(`${where}: clicking pin ${pin.x},${pin.y} misses the gate`);
        }
      }

      // ...and the box is not wildly oversized either: well past the body is not a hit
      const center = gateCenter(gate);
      const { w, h } = getDrawnGateDims(gate);
      for (const outside of [
        { x: center.x + w, y: center.y },
        { x: center.x, y: center.y + h },
      ]) {
        if (hitTestGate(outside, st) === gateId) {
          throw new Error(`${where}: ${outside.x},${outside.y} is outside the body but still hits`);
        }
      }
      cases++;
    }
  }
  console.log(`ok   hit box matches drawn body for ${cases} type/rotation pairs`);
}

console.log('gate hit box OK');

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
  const runner = new QueueTestRunner(() => circuit, labels);
  runner.start(commands, []);
  for (let i = 0; i < maxTicks && !runner.tick(); i++) { /* keep ticking */ }
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

  // Applying a test document — and reopening a level that has one saved — loads the commands
  // without starting them. It has to stay that way: `start` clears every gate's stored state, and
  // doing that at load time would wipe a chip's bytes before the player ran anything.
  {
    const { circuit, labels } = buildEchoCircuit();
    // A chip holding bytes nothing has flashed: an unsaved boot image is exactly what a reset
    // has nothing to restore, so it is the state a premature clear would destroy.
    const chipId = generateId('q') as GateId;
    circuit.addGate({ id: chipId, type: 'ram', pos: { x: 400, y: 0 }, rotation: 0, cells: [1, 2, 3] });
    const chip = circuit.getGate(chipId);

    const runner = new QueueTestRunner(() => circuit, labels);
    runner.load([w('A', 1), r('B', 1)], []);
    check('a loaded queue has not started', !runner.canResume && runner.commandIndex === -1);
    check('a loaded queue lists its commands as pending',
      runner.results.length === 2 && runner.results.every(x => x.status === 'pending'),
      runner.results.map(x => x.status).join(','));
    check('loading leaves stored gate state alone', chip.cells?.[0] === 1);

    // What the first Step does, since a loaded run cannot be resumed.
    runner.restart();
    check('starting clears stored gate state', chip.cells === undefined);
    check('a started queue is on its first command', runner.commandIndex === 0);
  }
}

console.log('queue test runner OK');

// ---------------------------------------------------------------------------
// RAM chip: boot image and on-body button
//
// Two things the memory window depends on. A flashed program is stored as `rom` and is the
// one piece of gate state a test reset must *not* discard — clearGateState reloads the
// cells from it instead. And the button that opens that window is positioned by
// gateButtonPos, which both the painter and the hit test call, so it has to land inside the
// chip's body at every rotation and be clickable there.
// ---------------------------------------------------------------------------

{
  const st = createEditorState();
  st.circuit = new Circuit();
  const ramId = generateId('ram') as GateId;
  st.circuit.addGate({ id: ramId, type: 'ram', pos: { x: 100, y: 100 }, rotation: 0 });
  const ram = st.circuit.getGate(ramId);

  const program = [1, 2, 3];
  new WriteRamCommand(st, ramId, { cells: padRamCells(program), rom: program }).execute();
  check('flash fills the cells', ram.cells?.slice(0, 3).join(',') === '1,2,3');

  ram.cells![0] = 99;
  clearGateState(ram);
  check('reset reloads the boot image', ram.cells?.slice(0, 3).join(',') === '1,2,3');
  check('reset leaves the rest zeroed', ram.cells?.length === RAM_SIZE && ram.cells[3] === 0);

  new WriteRamCommand(st, ramId, { cells: undefined, rom: undefined }).execute();
  clearGateState(ram);
  check('a cleared chip resets to nothing', ram.cells === undefined);
}

{
  const rotations: Rotation[] = [0, 90, 180, 270];
  for (const rotation of rotations) {
    const st = createEditorState();
    st.circuit = new Circuit();
    const ramId = generateId('rb') as GateId;
    st.circuit.addGate({ id: ramId, type: 'ram', pos: { x: 100, y: 100 }, rotation });
    const gate = st.circuit.getGate(ramId);

    const buttons = gateButtonPositions(gate);
    const kinds = buttons.map(b => b.kind).join(',');
    if (kinds !== 'memory,program') throw new Error(`ram@${rotation}°: buttons are ${kinds}`);

    const body = gateBounds(gate);
    for (const button of buttons) {
      const { pos, kind } = button;
      const where = `ram@${rotation}° ${kind}`;
      if (pos.x < body.x1 || pos.x > body.x2 || pos.y < body.y1 || pos.y > body.y2) {
        throw new Error(`${where}: button at ${pos.x},${pos.y} is off the body`);
      }
      // Each button must answer for itself: overlapping targets would make one unclickable.
      const hit = hitTestGateButton(pos, st);
      if (hit?.gateId !== ramId || hit.kind !== kind) {
        throw new Error(`${where}: clicking the drawn button gives ${JSON.stringify(hit)}`);
      }
    }
    if (hitTestGateButton(gateCenter(gate), st) !== null) {
      throw new Error(`ram@${rotation}°: the whole body reads as a button`);
    }

    const drawn = buildScene(st).gateButtons;
    if (drawn.length !== buttons.length) {
      throw new Error(`ram@${rotation}°: drew ${drawn.length} buttons, placed ${buttons.length}`);
    }
    for (let i = 0; i < buttons.length; i++) {
      if (drawn[i].pos.x !== buttons[i].pos.x || drawn[i].pos.y !== buttons[i].pos.y
        || drawn[i].icon !== buttons[i].kind) {
        throw new Error(`ram@${rotation}°: drawn button ${i} is not where the hit test looks`);
      }
    }
  }
  console.log('ok   both RAM buttons are on the body and separately clickable at every rotation');
}

{
  const st = createEditorState();
  st.circuit = new Circuit();
  const nandId = generateId('nb') as GateId;
  st.circuit.addGate({ id: nandId, type: 'nand', pos: { x: 0, y: 0 }, rotation: 0 });
  check('gates without a window have no buttons',
    gateButtonPositions(st.circuit.getGate(nandId)).length === 0
    && buildScene(st).gateButtons.length === 0);
}

console.log('RAM chip OK');

// ---------------------------------------------------------------------------
// Floating window stacking
//
// Whichever window was touched last must be drawn over the others, and the numbers handed
// out must stay inside a known band however long a session runs — a modal sits above that
// band, so a scheme that kept incrementing would eventually surface a window over one.
// ---------------------------------------------------------------------------

{
  const cards = new Map<string, { style: { zIndex: string } }>();
  const open = (id: string) => {
    const card = { style: { zIndex: '' } };
    cards.set(id, card);
    registerWindow(id, card);
  };
  const z = (id: string) => Number(cards.get(id)!.style.zIndex);

  open('a');
  check('the first window is numbered', z('a') === WINDOW_Z_BASE);

  open('b');
  check('a newly opened window is on top', z('b') > z('a'));

  raiseWindow('a');
  check('touching a window raises it', z('a') > z('b'));

  raiseWindow('a');
  check('raising the top window is a no-op', z('a') === WINDOW_Z_BASE + 1 && z('b') === WINDOW_Z_BASE);

  open('c');
  check('order is a, b, c bottom to top',
    z('b') === WINDOW_Z_BASE && z('a') === WINDOW_Z_BASE + 1 && z('c') === WINDOW_Z_BASE + 2);

  unregisterWindow('a');
  check('closing a window renumbers the rest',
    z('b') === WINDOW_Z_BASE && z('c') === WINDOW_Z_BASE + 1);

  // The point of renumbering: a thousand clicks must not climb towards the modal band.
  for (let i = 0; i < 1000; i++) {
    raiseWindow('b');
    raiseWindow('c');
  }
  check('z stays inside the band', Math.max(z('b'), z('c')) <= WINDOW_Z_BASE + cards.size);

  unregisterWindow('b');
  unregisterWindow('c');
}

console.log('window stacking OK');

// ---------------------------------------------------------------------------
// Pointer drag lifecycle
//
// A press must be followed to wherever it is released — over the sidebar, or off the page
// entirely. The browser delivers no mouseup for a release outside itself, so the only sign
// is the next move reporting no button held; miss that and the canvas behaves as if the
// button were still down. Driven here against a stand-in EventTarget, since the rules are
// about listener bookkeeping rather than anything visual.
// ---------------------------------------------------------------------------

{
  class FakeTarget {
    listeners = new Map<string, Set<(e: unknown) => void>>();
    addEventListener(type: string, fn: (e: unknown) => void) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type)!.add(fn);
    }
    removeEventListener(type: string, fn: (e: unknown) => void) {
      this.listeners.get(type)?.delete(fn);
    }
    dispatch(type: string, e: unknown) {
      for (const fn of [...(this.listeners.get(type) ?? [])]) fn(e);
    }
    count(type: string) { return this.listeners.get(type)?.size ?? 0; }
  }

  const canvas = Object.assign(new FakeTarget(), {
    clientWidth: 800, clientHeight: 600,
    getBoundingClientRect: () => ({ left: 100, top: 50 }),
  });
  const fakeWindow = new FakeTarget();
  const globals = globalThis as Record<string, unknown>;
  const hadWindow = 'window' in globals;
  globals.window = fakeWindow;

  const log: string[] = [];
  const input = new CanvasInput(canvas as never, {
    onPointerDown: e => log.push(`down ${e.screen.x},${e.screen.y}`),
    onPointerMove: e => log.push(`move ${e.screen.x},${e.screen.y}`),
    onPointerUp: e => log.push(`up ${e.screen.x},${e.screen.y}`),
  }, { getCamera: () => ({ pos: { x: 0, y: 0 }, zoom: 1 }) });
  input.attach();

  const ev = (x: number, y: number, buttons = 1) =>
    ({ clientX: x, clientY: y, buttons, button: 0, ctrlKey: false, shiftKey: false, altKey: false });

  canvas.dispatch('mousedown', ev(200, 150));
  check('a press follows the pointer on window',
    fakeWindow.count('mousemove') === 1 && fakeWindow.count('mouseup') === 1
    && canvas.count('mousemove') === 0);

  fakeWindow.dispatch('mousemove', ev(300, 250));
  check('a move while pressed is delivered once', log.filter(l => l.startsWith('move')).length === 1,
    log.join(' | '));

  // Released outside the browser, then the pointer comes back over the page.
  fakeWindow.dispatch('mousemove', ev(700, 500, 0));
  check('a release outside the browser ends the drag', log.filter(l => l.startsWith('up')).length === 1,
    log.join(' | '));
  check('...at the position it was last drawn, not where the pointer returned',
    log[log.length - 1] === 'up 200,200', log[log.length - 1]);
  check('...and the listeners go back to the canvas',
    canvas.count('mousemove') === 1 && fakeWindow.count('mousemove') === 0
    && fakeWindow.count('mouseup') === 0);

  log.length = 0;
  canvas.dispatch('mousedown', ev(200, 150));
  fakeWindow.dispatch('mouseup', ev(900, 700));
  check('a release off the canvas still ends the drag',
    log.join('|') === 'down 100,100|up 800,650', log.join('|'));

  input.detach();
  check('detach leaves no listeners behind',
    canvas.count('mousemove') === 0 && fakeWindow.count('mousemove') === 0
    && fakeWindow.count('mouseup') === 0 && fakeWindow.count('keydown') === 0);

  if (!hadWindow) delete globals.window;
}

console.log('pointer drag lifecycle OK');

// ---------------------------------------------------------------------------
// Which line put which bytes where
//
// `AssembleResult.lineBytes` is the one fact behind two things in the program editor: the byte
// offset shown in place of a line number, and the highlight that follows the chip's address pin
// back to the line that wrote the byte being read. Both are wrong together if it is, and both
// are wrong quietly — an offset column that is off by a line still looks like a column. So the
// addresses and lengths are checked against where the bytes actually landed.
// ---------------------------------------------------------------------------

{
  /** An include that always resolves, so a line from another file can be told apart. */
  const included = { path: 'inc.asm', content: '  7 8\n' };
  const assemble = (source: string, memorySize = 256) => defaultPreprocessor.assemble({
    source, path: 'main.asm', readFile: () => included, memorySize,
  });
  /** The recorded lines as "file:line address +length", which is every field at once. */
  const recorded = (source: string, memorySize = 256) => assemble(source, memorySize).lineBytes
    .map(span => `${span.file}:${span.line} ${span.address} +${span.length}`)
    .join(' / ');

  check('a line is recorded at the address its bytes landed at',
    recorded('  1 + 2\n') === 'main.asm:1 0 +1', recorded('  1 + 2\n'));

  // The gutter shows one offset per line, so a line's values have to come back as one range —
  // `LOADI(1, 42)` is two chunks in the assembler and one line to the player.
  check('several values on one line are one range',
    recorded('#define LOADI(r, v) 0x10 | r, v\n  LOADI(1, 42)\n') === 'main.asm:2 0 +2',
    recorded('#define LOADI(r, v) 0x10 | r, v\n  LOADI(1, 42)\n'));

  check('a string is recorded as its own bytes',
    recorded('  "hi"\n') === 'main.asm:1 0 +2', recorded('  "hi"\n'));

  check('lines that emit nothing are left out',
    recorded('#define A 1\n; a comment\n\nlabel:\n') === '',
    recorded('#define A 1\n; a comment\n\nlabel:\n'));

  check('#org moves where the next line is recorded',
    recorded('#define TOP 0x10\n#org TOP\n  0\n') === 'main.asm:3 16 +1',
    recorded('#define TOP 0x10\n#org TOP\n  0\n'));

  // The editor keeps only its own file's lines, since an included line's number belongs to a
  // document it is not showing — so the file has to travel with the range.
  check('an included line is recorded against the file it was written in',
    recorded('  1\n#include "inc.asm"\n  2\n')
      === 'main.asm:1 0 +1 / inc.asm:1 1 +2 / main.asm:3 3 +1',
    recorded('  1\n#include "inc.asm"\n  2\n'));

  // A length that overreaches would point the highlight at a byte the line never wrote.
  check('only the bytes that fit are recorded',
    recorded('#org 6\n  1 2 3 4\n', 8) === 'main.asm:2 6 +2', recorded('#org 6\n  1 2 3 4\n', 8));

  // Every recorded range, walked against the image: what the lines claim between them must be
  // exactly the addresses the program wrote, each claimed once.
  const program = '#define NOP 0\n#define PAIR(a, b) a, b\nstart:\n  NOP\n  PAIR(3, 4)\n'
    + '  "ok"\n#org 0x20\nend:\n  start, end\n';
  const result = assemble(program);
  const claimed: number[] = [];
  for (const span of result.lineBytes) {
    for (let i = 0; i < span.length; i++) claimed.push(span.address + i);
  }
  check('the ranges claim exactly the addresses the program wrote',
    claimed.sort((a, b) => a - b).join(',') === '0,1,2,3,4,32,33', claimed.join(','));
  check('no range reaches past the image',
    claimed.every(address => address < result.bytes.length));
}

console.log('assembled line ranges OK');

// ---------------------------------------------------------------------------
// Every sound the game names has a file behind it
//
// `playSfx('gatePlace')` fails by going quiet: the load errors into the console and the
// interaction carries on, which is right at runtime and useless as a warning. A renamed or
// deleted file is caught here instead.
// ---------------------------------------------------------------------------

{
  const { SOUND_NAMES, soundFile } = await import('../src/circuit-builder/sfx.ts');

  check('the game names some sounds', SOUND_NAMES.length > 0);
  for (const name of SOUND_NAMES) {
    check(`${name} has a file`, existsSync(soundFile(name)), soundFile(name));
  }
}

console.log('sound files OK');

// ---------------------------------------------------------------------------
// The music renders, deterministically, in time, and at a sane level
//
// Generative music has no golden output to diff, so what gets pinned is everything around the
// notes: one seed is one piece, the clock does not drift, and no theme renders silence, a NaN or
// a clip. Failures a listener notices and a diff does not.
// ---------------------------------------------------------------------------

{
  const { MusicPlayer } = await import('../src/engine/music/player.ts');
  const { MOOD_IDS, SOUNDTRACK_IDS, themeOf } = await import('../src/engine/music/themes.ts');
  type MusicTheme = ReturnType<typeof themeOf>;
  const { STEPS_PER_BAR } = await import('../src/engine/music/notes.ts');
  const { SCORES } = await import('../src/engine/music/scores.ts');
  const { PATCHES } = await import('../src/engine/music/instruments.ts');
  const { isSampleName } = await import('../src/engine/music/samples.ts');
  /** The drums, which are voices rather than patches and so are in neither table. */
  const DRUM_KINDS: string[] = ['kick', 'snare', 'hat'];

  const RATE = 48000;
  const SECONDS = 12;
  /** An awkward block size on purpose: chunk edges must not be where the music changes. */
  const BLOCK = 373;

  /** Every soundtrack in every mood — the whole matrix has to hold up, not just the default. */
  const tracks = SOUNDTRACK_IDS.flatMap(
    soundtrack => MOOD_IDS.map(mood => ({ soundtrack, mood, label: `${soundtrack}/${mood}` })),
  );

  /** Render `seconds` of a theme the way the worker does, in blocks. */
  const renderTheme = (theme: MusicTheme, seed: number, seconds: number) => {
    const player = new MusicPlayer(RATE, theme, seed);
    const frames = Math.round(seconds * RATE);
    const left = new Float32Array(frames);
    const right = new Float32Array(frames);
    const blockLeft = new Float32Array(BLOCK);
    const blockRight = new Float32Array(BLOCK);
    for (let offset = 0; offset < frames; offset += BLOCK) {
      const count = Math.min(BLOCK, frames - offset);
      player.render(blockLeft, blockRight, count);
      left.set(blockLeft.subarray(0, count), offset);
      right.set(blockRight.subarray(0, count), offset);
    }
    return { left, right };
  };

  for (const { soundtrack, mood, label } of tracks) {
    const theme = themeOf(soundtrack, mood);
    const { left, right } = renderTheme(theme, 1, SECONDS);

    let peak = 0;
    let sum = 0;
    let finite = true;
    for (let i = 0; i < left.length; i++) {
      if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) finite = false;
      peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
      sum += left[i] * left[i];
    }
    const rms = Math.sqrt(sum / left.length);

    check(`${label} renders finite samples`, finite);
    // The master softClip means a peak at 1 is not a clipped sample, but it is a mix pushed hard.
    check(`${label} is audible`, rms > 0.01, `rms ${rms.toFixed(4)}`);
    check(`${label} keeps headroom`, peak < 0.98, `peak ${peak.toFixed(3)}`);

    // A collapsed stereo image is invisible in every other measure here.
    let difference = 0;
    for (let i = 0; i < left.length; i += 64) difference += Math.abs(left[i] - right[i]);
    check(`${label} is in stereo`, difference > 0, `sum |L-R| ${difference.toFixed(2)}`);

    // A layer with a threshold but no rhythm never plays, and nothing else here would notice.
    // Only generated themes choose a rhythm; a score's layers are the module's own channels.
    if (theme.kind === 'generated') {
      for (const layer of Object.keys(theme.layers)) {
        if (layer === 'pad' || layer === 'bell') continue;
        const patterns = theme.patterns[layer as keyof typeof theme.patterns];
        check(`${label} gives ${layer} a rhythm`, (patterns?.length ?? 0) > 0);
      }
      continue;
    }

    // And a score's layers are only reachable if some instrument is actually assigned to them —
    // a threshold naming a layer nothing plays is a silence nothing else here would catch.
    const voices = Object.values(SCORES[theme.score].voices);
    // Every voice names something that exists. `EventKind` is a union of three key spaces told
    // apart by name alone, so a name in none of them is a silent silence rather than an error.
    for (const voice of voices) {
      const known = voice.kind in PATCHES || DRUM_KINDS.includes(voice.kind)
        || isSampleName(voice.kind);
      check(`${label} voice "${voice.kind}" names a real instrument`, known);
    }

    for (const layer of Object.keys(theme.layers)) {
      check(`${label} has an instrument for ${layer}`, voices.some(voice => voice.layer === layer));
    }
    check(`${label} loops a real stretch of the arrangement`,
      theme.from >= 0 && theme.to > theme.from
      && theme.to <= SCORES[theme.score].score.orders.length);
  }

  // Same seed, same samples — or `music:render` is not rendering what the game plays.
  const puzzle = themeOf('tea', 'puzzle');
  const first = renderTheme(puzzle, 7, 4);
  const second = renderTheme(puzzle, 7, 4);
  let identical = true;
  for (let i = 0; i < first.left.length; i++) {
    if (first.left[i] !== second.left[i] || first.right[i] !== second.right[i]) identical = false;
  }
  check('the same seed renders the same music', identical);

  const other = renderTheme(puzzle, 8, 4);
  let differs = false;
  for (let i = 0; i < first.left.length; i++) if (first.left[i] !== other.left[i]) differs = true;
  check('a different seed renders different music', differs);

  // Changing the music must not stop it — both mechanisms, since a fade to silence and back would
  // pass every other check in this phase.
  {
    const WINDOW = 0.1;
    const player = new MusicPlayer(RATE, puzzle, 1);
    const seconds = 24;
    const frames = Math.round(seconds * RATE);
    const mono = new Float32Array(frames);
    const blockLeft = new Float32Array(BLOCK);
    const blockRight = new Float32Array(BLOCK);

    for (let offset = 0; offset < frames; offset += BLOCK) {
      const at = offset / RATE;
      if (at >= 4 && at < 4 + BLOCK / RATE) player.setParams({ energy: -0.4, brightness: -1.2 });
      if (at >= 10 && at < 10 + BLOCK / RATE) player.setParams({ energy: 0.4, tempo: 1.15 });
      // Across soundtracks, which is the switch with the most to go wrong: different tempo, key,
      // layers and patches all at once.
      if (at >= 16 && at < 16 + BLOCK / RATE) {
        player.setTheme(themeOf('coffee', 'puzzle'), 3);
      }

      const count = Math.min(BLOCK, frames - offset);
      player.render(blockLeft, blockRight, count);
      for (let i = 0; i < count; i++) mono[offset + i] = blockLeft[i];
    }

    // The first window is skipped: a pad starts from silence and takes a second to arrive.
    const windowFrames = Math.round(WINDOW * RATE);
    let quietest = Infinity;
    let quietestAt = 0;
    for (let start = windowFrames * 20; start + windowFrames <= frames; start += windowFrames) {
      let sum = 0;
      for (let i = start; i < start + windowFrames; i++) sum += mono[i] * mono[i];
      const rms = Math.sqrt(sum / windowFrames);
      if (rms < quietest) {
        quietest = rms;
        quietestAt = start / RATE;
      }
    }
    check(
      'changing the music while it plays leaves no gap',
      quietest > 0.005,
      `quietest 100ms was ${(20 * Math.log10(quietest + 1e-9)).toFixed(0)}dB`
      + ` at ${quietestAt.toFixed(1)}s`,
    );

    // And the controls really are where they were put, rather than a message that went nowhere.
    const settled = player.currentParams;
    check(
      'the live controls arrive at what was asked for',
      Math.abs(settled.energy - 0.4) < 0.02 && Math.abs(settled.tempo - 1.15) < 0.01,
      `energy ${settled.energy.toFixed(3)}, tempo ${settled.tempo.toFixed(3)}`,
    );
  }

  // N bars of samples must be N bars of steps: no drift, and no dependence on the block size.
  for (const { soundtrack, mood, label } of tracks) {
    const theme = themeOf(soundtrack, mood);
    const bars = 8;
    const expected = bars * STEPS_PER_BAR;
    const player = new MusicPlayer(RATE, theme, 1);
    const frames = Math.round(expected * player.stepDuration * RATE);

    const blockLeft = new Float32Array(BLOCK);
    const blockRight = new Float32Array(BLOCK);
    for (let offset = 0; offset < frames; offset += BLOCK) {
      player.render(blockLeft, blockRight, Math.min(BLOCK, frames - offset));
    }
    // One either side: step 0 lands on sample 0, and the last boundary may fall in a part block.
    check(
      `${label} keeps time over ${bars} bars`,
      Math.abs(player.stepsPlayed - expected) <= 1,
      `${player.stepsPlayed} steps for ${expected} sixteenths`,
    );
  }
}

console.log('music OK');
