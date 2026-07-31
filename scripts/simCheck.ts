import './localStorageShim.ts';

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { Circuit } from '../src/circuit-builder/simulation/circuit.ts';
import type { GateId, WireNodeId } from '../src/circuit-builder/editor/types.ts';
import { getPinCounts } from '../src/circuit-builder/editor/gates.ts';
import { BENCH_FIXTURE, FIXTURES, type FixtureInstance } from './simFixtures.ts';

const SNAPSHOT_PATH = 'scripts/__snapshots__/sim.json';

// ---------------------------------------------------------------------------
// Engine adapter
//
// The three reads below are the only places this harness touches the simulation's
// internal value representation. They are expected to change when simState moves to
// typed arrays; the *snapshot values* they produce must not.
// ---------------------------------------------------------------------------

function readPin(circuit: Circuit, gateId: GateId, kind: 'input' | 'output', index: number): number | null {
  return circuit.getPinValue(gateId, kind, index);
}

function readNodeValue(circuit: Circuit, nodeId: WireNodeId): number | null {
  return circuit.getNetValue(nodeId);
}

function readNodeBitWidth(circuit: Circuit, nodeId: WireNodeId): number {
  return circuit.getNetBitWidth(nodeId);
}

// ---------------------------------------------------------------------------
// Snapshotting
// ---------------------------------------------------------------------------

interface TickSnapshot {
  outputs: Record<string, number | null>;
  /** Each contention net as its sorted stable node names; outer list sorted too. */
  contentionNets: string[];
  errorSegments: string[];
  shortCircuitGates: string[];
  pins?: Record<string, number | null>;
  nodes?: Record<string, string>;
}

type Snapshot = Record<string, TickSnapshot[]>;

function snapshotTick(instance: FixtureInstance): TickSnapshot {
  const { circuit, gateLabels, nodeNames, segmentNames, fullState } = instance;

  const outputs: Record<string, number | null> = {};
  for (const [gateId, value] of circuit.tickResult.outputs) {
    outputs[gateLabels.get(gateId) ?? String(gateId)] = value;
  }

  // Net IDs are generated per build and unstable — identify nets by their node names
  const netNodeNames = new Map<string, string>();
  for (const net of circuit.getBuild()?.nets.values() ?? []) {
    const names = net.nodeIds
      .map(id => nodeNames.get(id) ?? String(id))
      .sort();
    netNodeNames.set(net.id as string, names.join('+'));
  }
  const contentionNets = circuit.tickResult.contentionNets
    .map(id => netNodeNames.get(id) ?? id)
    .sort();

  const errorSegments = [...circuit.tickResult.errorSegmentIds]
    .map(id => segmentNames.get(id as never) ?? id)
    .sort();

  const shortCircuitGates = (circuit.getBuild()?.shortCircuitGates ?? [])
    .map(id => gateLabels.get(id) ?? String(id))
    .sort();

  const snapshot: TickSnapshot = { outputs, contentionNets, errorSegments, shortCircuitGates };
  if (!fullState) return snapshot;

  const pins: Record<string, number | null> = {};
  for (const gate of circuit.gates.values()) {
    const label = gateLabels.get(gate.id) ?? String(gate.id);
    const { inputs, outputs: outCount } = getPinCounts(gate.type);
    for (let i = 0; i < inputs; i++) {
      pins[`${label}:in:${i}`] = readPin(circuit, gate.id, 'input', i);
    }
    for (let i = 0; i < outCount; i++) {
      pins[`${label}:out:${i}`] = readPin(circuit, gate.id, 'output', i);
    }
  }

  const nodes: Record<string, string> = {};
  for (const nodeId of circuit.wireNodes.keys()) {
    const name = nodeNames.get(nodeId) ?? String(nodeId);
    const value = readNodeValue(circuit, nodeId);
    nodes[name] = `${value ?? 'Z'}/${readNodeBitWidth(circuit, nodeId)}`;
  }

  return { ...snapshot, pins, nodes };
}

/**
 * The level map is the only circuit that ships in the repo, it contains a tri-state, and
 * its resolved values decide which levels unlock — so a regression there breaks
 * progression for every player. Keyed by the committed JSON's gate IDs (stable); gates
 * that addMissingLevels synthesises get generated IDs and are skipped.
 */
async function snapshotLevelMap(): Promise<TickSnapshot> {
  const { buildLevelMapCircuit } = await import('../src/circuit-builder/levels/levelMap.ts');
  const { LEVELS } = await import('../src/circuit-builder/levels/registry.ts');
  const { LEVEL_MAP_CIRCUIT } = await import('../src/circuit-builder/levels/levelMapData.ts');

  // Fixed solved-set so unlock state — and therefore level gate outputs — is deterministic
  const solved = new Set(LEVELS.slice(0, 6).map(level => level.id));
  const { circuit } = buildLevelMapCircuit(LEVELS, solved);

  const stableIds = new Set(LEVEL_MAP_CIRCUIT.gates.map(([id]: [string, unknown]) => id));
  const pins: Record<string, number | null> = {};
  for (const gate of circuit.gates.values()) {
    if (!stableIds.has(gate.id as string)) continue;
    const { inputs, outputs } = getPinCounts(gate.type);
    for (let i = 0; i < inputs; i++) pins[`${gate.id}:in:${i}`] = circuit.getPinValue(gate.id, 'input', i);
    for (let i = 0; i < outputs; i++) pins[`${gate.id}:out:${i}`] = circuit.getPinValue(gate.id, 'output', i);
  }

  return {
    outputs: {},
    contentionNets: [circuit.tickResult.contentionNets.length ? 'some' : 'none'],
    errorSegments: [String(circuit.tickResult.errorSegmentIds.size)],
    shortCircuitGates: (circuit.getBuild()?.shortCircuitGates ?? []).map(String).sort(),
    pins,
  };
}

function runFixtures(): Snapshot {
  const snapshot: Snapshot = {};
  for (const fixture of FIXTURES) {
    const instance = fixture.create();
    const labelToGate = new Map<string, GateId>();
    for (const [gateId, label] of instance.gateLabels) labelToGate.set(label, gateId);

    const ticks: TickSnapshot[] = [];
    for (const driven of instance.ticks) {
      const inputs = new Map<GateId, number>();
      for (const [label, value] of Object.entries(driven)) {
        const gateId = labelToGate.get(label);
        if (!gateId) throw new Error(`${fixture.name}: no gate labelled "${label}"`);
        inputs.set(gateId, value);
      }
      instance.circuit.tick(inputs);
      ticks.push(snapshotTick(instance));
    }
    snapshot[fixture.name] = ticks;
  }
  return snapshot;
}

// ---------------------------------------------------------------------------
// Diffing
// ---------------------------------------------------------------------------

const MAX_REPORTED_DIFFS = 40;

function collectDiffs(expected: unknown, actual: unknown, path: string, out: string[]): void {
  if (out.length >= MAX_REPORTED_DIFFS) return;

  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      out.push(`${path}: shape changed`);
      return;
    }
    if (expected.length !== actual.length) {
      out.push(`${path}: length ${expected.length} -> ${actual.length}`);
    }
    for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
      collectDiffs(expected[i], actual[i], `${path}[${i}]`, out);
    }
    return;
  }

  if (isRecord(expected) && isRecord(actual)) {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      collectDiffs(expected[key], actual[key], path ? `${path}.${key}` : key, out);
    }
    return;
  }

  if (expected !== actual) {
    out.push(`${path}: ${JSON.stringify(expected)} -> ${JSON.stringify(actual)}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// ---------------------------------------------------------------------------
// Scene check
//
// The snapshot already pins getPinValue/getNetValue against the pre-rewrite engine.
// What it cannot see is whether buildScene plumbs them to the right segment, node or
// gate. So render each fixture's final tick and cross-check the value-bearing parts of
// the scene against the baseline's independently-captured node data.
// ---------------------------------------------------------------------------

async function checkScenes(baseline: Snapshot): Promise<string[]> {
  const { createEditorState } = await import('../src/circuit-builder/editor/EditorState.ts');
  const { buildScene } = await import('../src/circuit-builder/editor/render/buildScene.ts');
  const problems: string[] = [];
  let checkedSegments = 0;
  let litSegments = 0;

  for (const fixture of FIXTURES) {
    const instance = fixture.create();
    const labelToGate = new Map<string, GateId>();
    for (const [gateId, label] of instance.gateLabels) labelToGate.set(label, gateId);

    for (const driven of instance.ticks) {
      const inputs = new Map<GateId, number>();
      for (const [label, value] of Object.entries(driven)) {
        inputs.set(labelToGate.get(label)!, value);
      }
      instance.circuit.tick(inputs);
    }

    const state = createEditorState();
    state.circuit = instance.circuit;
    const scene = buildScene(state, { x: 0, y: 0 });

    const ticks = baseline[fixture.name];
    const finalTick = ticks?.[ticks.length - 1];
    if (!finalTick?.nodes) continue; // wide-adder records outputs only

    const segmentIds = [...instance.circuit.wireSegments.keys()];
    if (scene.wireSegments.length !== segmentIds.length) {
      problems.push(`${fixture.name}: scene has ${scene.wireSegments.length} segments, circuit has ${segmentIds.length}`);
      continue;
    }

    for (let i = 0; i < segmentIds.length; i++) {
      const segment = instance.circuit.getWireSegment(segmentIds[i]);
      const nodeName = instance.nodeNames.get(segment.from)!;
      const [baseValue, baseBitWidth] = finalTick.nodes[nodeName].split('/');
      const rendered = scene.wireSegments[i];
      checkedSegments++;

      const expectLit = baseValue !== 'Z';
      if (expectLit) litSegments++;
      if ((rendered.signalColor !== null) !== expectLit) {
        problems.push(`${fixture.name} seg#${i}: baseline value ${baseValue}, rendered signalColor ${rendered.signalColor}`);
      }
      if (rendered.multibit !== (Number(baseBitWidth) > 1)) {
        problems.push(`${fixture.name} seg#${i}: baseline width ${baseBitWidth}, rendered multibit ${rendered.multibit}`);
      }
    }

    const expectedErrors = new Set(finalTick.errorSegments);
    if (scene.errorSegments.length !== expectedErrors.size) {
      problems.push(`${fixture.name}: ${expectedErrors.size} baseline error segments, ${scene.errorSegments.length} rendered`);
    }
  }

  console.log(`scene: ${checkedSegments} segments checked (${litSegments} carrying a signal)`);
  if (litSegments === 0) problems.push('no segment rendered a signal — value plumbing is dead');
  return problems;
}

// ---------------------------------------------------------------------------
// Bench
// ---------------------------------------------------------------------------

function bench(): void {
  const instance = BENCH_FIXTURE.create();
  const { circuit } = instance;
  const labelToGate = new Map<string, GateId>();
  for (const [gateId, label] of instance.gateLabels) labelToGate.set(label, gateId);

  const inputs = new Map<GateId, number>();
  for (const [label, value] of Object.entries(instance.ticks[0])) {
    inputs.set(labelToGate.get(label)!, value);
  }

  console.log(`fixture:  ${BENCH_FIXTURE.name}`);
  console.log(`gates:    ${circuit.gates.size}`);
  console.log(`nodes:    ${circuit.wireNodes.size}`);
  console.log(`segments: ${circuit.wireSegments.size}`);

  const BUILD_RUNS = 20;
  let buildMs = 0;
  for (let i = 0; i < BUILD_RUNS; i++) {
    circuit.invalidateBuild();
    const start = performance.now();
    circuit.buildCircuit(circuit);
    buildMs += performance.now() - start;
  }
  console.log(`nets:     ${circuit.getBuild()!.nets.size}`);
  console.log(`build:    ${(buildMs / BUILD_RUNS).toFixed(2)} ms`);

  // Warm up so we measure steady-state JIT, not first-run compilation
  for (let i = 0; i < 5; i++) circuit.tick(inputs);

  const TICK_BUDGET_MS = 2000;
  let ticks = 0;
  const start = performance.now();
  let elapsed = 0;
  while (elapsed < TICK_BUDGET_MS) {
    circuit.tick(inputs);
    ticks++;
    elapsed = performance.now() - start;
  }
  const perTick = elapsed / ticks;
  console.log(`tick:     ${perTick.toFixed(3)} ms  (${(1000 / perTick).toFixed(0)} ticks/sec, ${ticks} samples)`);
}

// ---------------------------------------------------------------------------

function loadBaseline(): Snapshot {
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
  } catch {
    console.error(`no baseline at ${SNAPSHOT_PATH} — run: npm run sim:snapshot`);
    process.exit(2);
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? '--check';

  if (mode === '--bench') {
    bench();
    return;
  }

  if (mode !== '--check' && mode !== '--scene' && mode !== '--snapshot') {
    console.error(`unknown mode "${mode}" — expected --snapshot, --check, --scene or --bench`);
    process.exit(2);
  }

  if (mode === '--scene') {
    const problems = await checkScenes(loadBaseline());
    if (problems.length === 0) {
      console.log('sim:scene OK — rendered values agree with the baseline');
      return;
    }
    console.error(`sim:scene FAILED — ${problems.length} problems:`);
    for (const problem of problems.slice(0, MAX_REPORTED_DIFFS)) console.error(`  ${problem}`);
    process.exit(1);
  }

  // Level map first: it must be built before fixtures touch the generateId counter
  const levelMap = await snapshotLevelMap();
  const snapshot = runFixtures();
  snapshot['@level-map'] = [levelMap];
  const fixtureCount = Object.keys(snapshot).length;
  const tickCount = Object.values(snapshot).reduce((sum, ticks) => sum + ticks.length, 0);

  if (mode === '--snapshot') {
    mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 1) + '\n');
    console.log(`wrote ${SNAPSHOT_PATH}: ${fixtureCount} fixtures, ${tickCount} ticks`);
    return;
  }

  const diffs: string[] = [];
  collectDiffs(loadBaseline(), snapshot, '', diffs);

  if (diffs.length === 0) {
    console.log(`sim:check OK — ${fixtureCount} fixtures, ${tickCount} ticks, no diffs`);
    return;
  }

  console.error(`sim:check FAILED — ${diffs.length}${diffs.length >= MAX_REPORTED_DIFFS ? '+' : ''} diffs:`);
  for (const diff of diffs) console.error(`  ${diff}`);
  process.exit(1);
}

main();
