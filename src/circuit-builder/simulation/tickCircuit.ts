
import type { GateId } from "../editor/types.ts";
import type { BuildResult, TickResult } from "./types.ts";
import { computeDerivedState, propagate } from "./buildCircuit.ts";
import type { Circuit } from "./circuit.ts";
import { isInputGate, isOutputGate } from "./gateTypes.ts";


/**
 * Execute one simulation tick:
 * 1. Reset all gate values
 * 2. Set source gate outputs (inputs, constants, sequential)
 * 3. Propagate combinational logic
 * 4. Advance sequential gate state from new inputs
 * 5. Collect outputs
 */
export function tick(
  circuit: Circuit,
  buildResult: BuildResult,
  inputs: Map<GateId, number>,
): TickResult {
  resetGateValues(circuit);
  setSourceOutputs(circuit, inputs);
  const contentionNets = propagate(circuit, buildResult);
  advanceSequentialState(circuit);
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

function resetGateValues(circuit: Circuit): void {
  for (const gate of circuit.gates.values()) {
    gate.inputValues.fill(null);
    gate.outputValues.fill(null);
  }
}

/** Set outputValues for all source gates (inputs, constants, sequential). */
function setSourceOutputs(circuit: Circuit, inputs: Map<GateId, number>): void {
  for (const gate of circuit.gates.values()) {
    if (isInputGate(gate.type) || gate.type === 'level') {
      const value = inputs.get(gate.id);
      if (value !== undefined) {
        for (let i = 0; i < gate.outputValues.length; i++) {
          gate.outputValues[i] = value;
        }
      }
      continue;
    }

    if (gate.type === 'constant') {
      gate.outputValues[0] = (gate.state as number) ?? 0;
      continue;
    }

    switch (gate.type) {
      case 'delay':
      case 'rs-latch':
      case '8bit-memory':
      case '8bit-counter':
      case '8bit-counter-reset':
        gate.outputValues[0] = (gate.state as number) ?? 0;
        break;
    }
  }
}

/** Update sequential gate state from current inputValues (delivered by propagation). */
function advanceSequentialState(circuit: Circuit): void {
  for (const gate of circuit.gates.values()) {
    switch (gate.type) {
      case 'delay':
        gate.state = gate.inputValues[0] ?? 0;
        break;
      case 'rs-latch': {
        const s = gate.inputValues[0] ?? 0;
        const r = gate.inputValues[1] ?? 0;
        let q = (gate.state as number) ?? 0;
        if (s && !r) q = 1;
        else if (r && !s) q = 0;
        gate.state = q;
        break;
      }
      case '8bit-memory': {
        const d = gate.inputValues[0] ?? 0;
        const w = gate.inputValues[1] ?? 0;
        if (w) gate.state = d;
        break;
      }
      case '8bit-counter':
        gate.state = (((gate.state as number) ?? 0) + 1) & 0xFF;
        break;
      case '8bit-counter-reset': {
        const r = gate.inputValues[0] ?? 0;
        gate.state = r ? 0 : (((gate.state as number) ?? 0) + 1) & 0xFF;
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
