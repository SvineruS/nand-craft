
import type { GateId } from "../editor/types.ts";
import type { BuildResult, TickResult } from "./types.ts";
import { computeDerivedState, propagate } from "./buildCircuit.ts";
import type { Circuit } from "./circuit.ts";
import { isInputGate, isOutputGate } from "./gateTypes.ts";


/**
 * Execute one simulation tick:
 * 1. Save constant gate output values, reset all gate values
 * 2. Set input gate outputValues from inputs map
 * 3. Restore constant gate values
 * 4. Propagate combinational logic using cached build
 * 5. Advance sequential gates (delay, rs-latch, memory, counters)
 * 6. Collect outputs from output gates
 */
export function tick(
  circuit: Circuit,
  buildResult: BuildResult,
  inputs: Map<GateId, number>,
): TickResult {

  // 1. Save constant gate output values, then reset all gate values
  const constantValues = saveConstantValues(circuit);
  resetAllGateValues(circuit);

  // 2. Set input gate outputValues from inputs map
  applyInputValues(circuit, inputs);

  // 3. Restore constant gate values
  restoreConstantValues(circuit, constantValues);

  // 4. Propagate combinational logic
  const contentionNets = propagate(circuit, buildResult);

  // 5. Advance sequential gates
  advanceSequentialGates(circuit);

  // 6. Collect outputs and compute derived state
  const outputs = collectOutputs(circuit);
  const derived = computeDerivedState(circuit, buildResult, contentionNets);

  return {
    outputs,
    contentionNets: contentionNets.map(id => id as string),
    errorSegmentIds: derived.errorSegmentIds,
    nodeValues: derived.nodeValues,
    nodeBitWidths: derived.nodeBitWidths,
  };
}

function saveConstantValues(circuit: Circuit): Map<GateId, number> {
  const constantValues = new Map<GateId, number>();
  for (const gate of circuit.gates.values()) {
    if (gate.type === 'constant') {
      constantValues.set(gate.id, gate.outputValues[0] ?? 0);
    }
  }
  return constantValues;
}

function resetAllGateValues(circuit: Circuit): void {
  for (const gate of circuit.gates.values()) {
    gate.inputValues.fill(null);
    gate.outputValues.fill(null);
  }
}

function applyInputValues(
  circuit: Circuit,
  inputs: Map<GateId, number>,
): void {
  for (const [gateId, value] of inputs) {
    const gate = circuit.getGate(gateId);
    if (!isInputGate(gate.type) && gate.type !== 'level') continue;
    for (let i = 0; i < gate.outputValues.length; i++) {
      gate.outputValues[i] = value;
    }
  }
}

function restoreConstantValues(
  circuit: Circuit,
  constantValues: Map<GateId, number>,
): void {
  for (const [gateId, value] of constantValues) {
    const gate = circuit.getGate(gateId);
    gate.outputValues[0] = value;
  }
}

function advanceSequentialGates(circuit: Circuit): void {
  for (const gate of circuit.gates.values()) {
    switch (gate.type) {
      case 'delay': {
        const prev = (gate.state as number | null) ?? null;
        gate.state = gate.inputValues[0] ?? null;
        gate.outputValues[0] = prev;
        break;
      }
      case 'rs-latch': {
        const s = gate.inputValues[0] ?? 0;
        const r = gate.inputValues[1] ?? 0;
        let q = (gate.state as number | null) ?? 0;
        if (s && !r) q = 1;
        else if (r && !s) q = 0;
        gate.state = q;
        gate.outputValues[0] = q;
        break;
      }
      case '8bit-memory': {
        const d = gate.inputValues[0] ?? 0;
        const w = gate.inputValues[1] ?? 0;
        let stored = (gate.state as number | null) ?? 0;
        if (w) stored = d;
        gate.state = stored;
        gate.outputValues[0] = stored;
        break;
      }
      case '8bit-counter': {
        const prev = (gate.state as number | null) ?? 0;
        const next = (prev + 1) & 0xFF;
        gate.state = next;
        gate.outputValues[0] = next;
        break;
      }
      case '8bit-counter-reset': {
        const r = gate.inputValues[0] ?? 0;
        const prev = (gate.state as number | null) ?? 0;
        const next = r ? 0 : (prev + 1) & 0xFF;
        gate.state = next;
        gate.outputValues[0] = next;
        break;
      }
    }
  }
}

function collectOutputs(circuit: Circuit): Map<GateId, number | null> {
  const outputs = new Map<GateId, number | null>();
  for (const gate of circuit.gates.values()) {
    if (!isOutputGate(gate.type)) continue;
    outputs.set(gate.id, gate.inputValues[0] ?? null);
  }
  return outputs;
}
