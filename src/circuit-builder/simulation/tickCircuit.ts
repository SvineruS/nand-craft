
import type { GateId } from "../editor/types.ts";
import { pinRefKey } from "../editor/types.ts";
import type { BuildResult, SimulationState, TickResult } from "./types.ts";
import { computeDerivedState, propagate } from "./buildCircuit.ts";
import type { Circuit } from "./circuit.ts";
import { isConstantGate, isInputGate, isOutputGate } from "./gateTypes.ts";


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
        const rKey = pinRefKey({ gateId: gate.id, kind: 'input', index: 0 });
        const r = simState.get(rKey) ?? 0;
        gate.state = r ? 0 : (((gate.state as number) ?? 0) + 1) & 0xFF;
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
