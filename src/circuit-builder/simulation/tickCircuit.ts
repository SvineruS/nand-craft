import { type ComponentId, type GateId, type NetId, pinRefKey } from "../editor/types.ts";
import type { BuildResult, SimulationState, TickResult } from "./types.ts";
import { Circuit } from "./circuit.ts";
import { type Gate, isConstantGate, isInputGate, isOutputGate, pinValue, writePinValue } from "./gateTypes.ts";
import { getPinBitWidth, getPinCounts } from "../editor/gates.ts";
import { getComponent } from "../components/componentRegistry.ts";
import { deserializeCircuit } from "../persistence/serialize.ts";




/**
 * Execute one simulation tick:
 * 1. Set source gate outputs (inputs, constants, sequential)
 * 2. Propagate combinational logic
 * 3. Advance sequential gate state from new inputs
 * 4. Collect outputs
 */
export function tick(
  circuit: Circuit,
  simState: SimulationState,
  buildResult: BuildResult,
  inputs: Map<GateId, number>,
): TickResult {
  setSourceOutputs(circuit, simState, inputs);
  const contentionNets = propagate(circuit, simState, buildResult);
  advanceSequentialState(circuit, simState);
  const outputs = collectOutputs(circuit, simState);
  const derived = computeDerivedState(circuit, simState, buildResult, contentionNets);

  return {
    outputs,
    contentionNets: contentionNets.map(id => id as string),
    errorSegmentIds: derived.errorSegmentIds,
    nodeValues: derived.nodeValues,
    nodeBitWidths: derived.nodeBitWidths,
  };
}

/** Set outputValues for all source gates (inputs, constants, sequential). */
function setSourceOutputs(circuit: Circuit, simState: SimulationState, inputs: Map<GateId, number>): void {
  for (const gate of circuit.gates.values()) {
    if (isInputGate(gate.type) || gate.type === 'level') {
      const value = inputs.get(gate.id);
      if (value !== undefined) {
        const key = pinRefKey({ gateId: gate.id, kind: 'output', index: 0 });
        simState.set(key, value);
      }
      continue;
    }

    if (isConstantGate(gate.type)) {
      const key = pinRefKey({ gateId: gate.id, kind: 'output', index: 0 });
      simState.set(key, (gate.state as number) ?? 0);
      continue;
    }

    switch (gate.type) {
      case 'delay':
      case 'rs-latch':
      case '1bit-memory':
      case '8bit-memory':
      case '8bit-counter':
      case '8bit-counter-reset': {
        const key = pinRefKey({ gateId: gate.id, kind: 'output', index: 0 });
        simState.set(key, (gate.state as number) ?? 0);
        break;
      }
    }
  }
}

/** Update sequential gate state from current inputValues (delivered by propagation). */
function advanceSequentialState(circuit: Circuit, simState: SimulationState): void {
  for (const gate of circuit.gates.values()) {
    switch (gate.type) {
      case 'delay': {
        const key = pinRefKey({ gateId: gate.id, kind: 'input', index: 0 });
        gate.state = simState.get(key) ?? 0;
        break;
      }
      case 'rs-latch': {
        const sKey = pinRefKey({ gateId: gate.id, kind: 'input', index: 0 });
        const rKey = pinRefKey({ gateId: gate.id, kind: 'input', index: 1 });
        const s = simState.get(sKey) ?? 0;
        const r = simState.get(rKey) ?? 0;
        let q = (gate.state as number) ?? 0;
        if (s && !r) q = 1;
        else if (r && !s) q = 0;
        gate.state = q;
        break;
      }
      case '1bit-memory':
      case '8bit-memory': {
        const dKey = pinRefKey({ gateId: gate.id, kind: 'input', index: 0 });
        const wKey = pinRefKey({ gateId: gate.id, kind: 'input', index: 1 });
        const d = simState.get(dKey) ?? 0;
        const w = simState.get(wKey) ?? 0;
        if (w) gate.state = d;
        break;
      }
      case '8bit-counter': {
        gate.state = (((gate.state as number) ?? 0) + 1) & 0xFF;
        break;
      }
      case '8bit-counter-reset': {
        const vKey = pinRefKey({ gateId: gate.id, kind: 'input', index: 0 });
        const oKey = pinRefKey({ gateId: gate.id, kind: 'input', index: 1 });
        const v = simState.get(vKey) ?? 0;
        const o = simState.get(oKey) ?? 0;
        // O=1 → override with V, O=0 → increment by 1
        gate.state = o ? v : (((gate.state as number) ?? 0) + 1) & 0xFF;
        break;
      }
    }
  }
}

function collectOutputs(circuit: Circuit, simState: SimulationState): Map<GateId, number | null> {
  const outputs = new Map<GateId, number | null>();
  for (const gate of circuit.gates.values()) {
    if (!isOutputGate(gate.type)) continue;
    const key = pinRefKey({ gateId: gate.id, kind: 'input', index: 0 });
    outputs.set(gate.id, simState.get(key) ?? null);
  }
  return outputs;
}



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
 * Compute derived rendering data from tick results.
 */
function computeDerivedState(
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

/**
 * One tick of combinational propagation using cached build data.
 * Returns contention net IDs from the final resolution.
 */
function propagate(
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
      const idx = (c << 2) | (b << 1) | a;
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
    case 'tristate':
    case '8bit-tristate': {
      const input = readInputNullable(simState, gate, 0);
      const enable = readInputNullable(simState, gate, 1);
      writeOutput(simState, gate, 0, (enable !== 0) ? input : null);
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
      // Component gates — type is the component ID
      evaluateComponent(simState, gate);
      break;
  }
}

/** Track component evaluation chain to detect circular references. */
const evaluatingComponents = new Set<string>();

function evaluateComponent(simState: SimulationState, gate: Gate): void {
  const compId = gate.type as ComponentId;
  const def = getComponent(compId);
  if (!def) return; // Not a component gate — unknown type, silently skip

  // Circular reference check
  if (evaluatingComponents.has(compId)) return;
  evaluatingComponents.add(compId);

  try {
    // Get or create inner circuit instance from gate.state
    // Check instanceof because gate.state may be stale data after deserialization
    let innerCircuit = gate.state instanceof Circuit ? gate.state : undefined;
    if (!innerCircuit) {
      innerCircuit = deserializeCircuit(def.circuit);
      gate.state = innerCircuit;
    }

    // Collect inner IO gates in iteration order (same order as buildComponentDefinition)
    const innerInputIds: GateId[] = [];
    const innerOutputIds: GateId[] = [];
    for (const innerGate of innerCircuit.gates.values()) {
      if (isInputGate(innerGate.type)) innerInputIds.push(innerGate.id);
      else if (isOutputGate(innerGate.type)) innerOutputIds.push(innerGate.id);
    }

    // Map component input pins → inner circuit input gate values
    const inputs = new Map<GateId, number>();
    for (let i = 0; i < def.inputs.length && i < innerInputIds.length; i++) {
      inputs.set(innerInputIds[i], readInput(simState, gate, i));
    }

    // Tick the inner circuit
    innerCircuit.tick(inputs);

    // Read inner circuit output gate values → component output pins
    for (let i = 0; i < def.outputs.length && i < innerOutputIds.length; i++) {
      const val = innerCircuit.tickResult.outputs.get(innerOutputIds[i]) ?? null;
      writeOutput(simState, gate, i, val);
    }
  } finally {
    evaluatingComponents.delete(compId);
  }
}


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
