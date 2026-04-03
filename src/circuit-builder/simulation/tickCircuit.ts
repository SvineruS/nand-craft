
import type { GateId } from "../editor/types.ts";
import type { BuildResult, TickResult } from "./types.ts";
import { computeDerivedState, propagate } from "./buildCircuit.ts";
import type { Circuit } from "./circuit.ts";


/**
 * Execute one simulation tick:
 * 1. Rebuild if needed, save constant values, reset all pins
 * 2. Set input gate pin values from inputs map
 * 3. Restore constant gate values
 * 4. Propagate combinational logic using cached build
 * 5. Advance delay gates
 * 6. Compute derived state and return TickResult
 */
export function tick(circuit: Circuit, buildResult: BuildResult,  inputs: Map<GateId, number>): TickResult {

  // 1. Save constant gate values, then reset all pins to null
  const constantValues = new Map<string, number>();
  for (const gate of circuit.gates.values()) {
    if (gate.type !== 'constant') continue;
    const outPin = circuit.getPin(gate.outputPins[0]);
    constantValues.set(outPin.id as string, outPin.value ?? 0);
  }
  for (const pin of circuit.pins.values()) {
    pin.value = null;
  }

  // 2. Set input gate pin values
  for (const [gateId, value] of inputs) {
    const gate = circuit.getGate(gateId);
    if (gate.type !== 'input' && gate.type !== "level") continue;

    for (const outputPinId of gate.outputPins) {
      circuit.getPin(outputPinId).value = value;
    }
  }

  // 3. Restore constant gate values
  for (const pin of circuit.pins.values()) {
    const saved = constantValues.get(pin.id as string);
    if (saved !== undefined) pin.value = saved;
  }

  // 4. Propagate combinational logic
  const contentionNets = propagate(circuit, buildResult);

  // 5. Advance sequential gates (delay, rs-latch, memory, counters)
  for (const gate of circuit.gates.values()) {
    switch (gate.type) {
      case 'delay': {
        const outputPin = circuit.getPin(gate.outputPins[0]);
        const inputPin = circuit.getPin(gate.inputPins[0]);
        outputPin.value = circuit.delayState.get(gate.id) ?? null;
        circuit.delayState.set(gate.id, inputPin.value ?? null);
        break;
      }
      case 'rs-latch': {
        const s = circuit.getPin(gate.inputPins[0]).value ?? 0;
        const r = circuit.getPin(gate.inputPins[1]).value ?? 0;
        let q = circuit.delayState.get(gate.id) ?? 0;
        if (s && !r) q = 1;
        else if (r && !s) q = 0;
        circuit.delayState.set(gate.id, q);
        circuit.getPin(gate.outputPins[0]).value = q;
        break;
      }
      case '8bit-memory': {
        const d = circuit.getPin(gate.inputPins[0]).value ?? 0;
        const w = circuit.getPin(gate.inputPins[1]).value ?? 0;
        let stored = circuit.delayState.get(gate.id) ?? 0;
        if (w) stored = d;
        circuit.delayState.set(gate.id, stored);
        circuit.getPin(gate.outputPins[0]).value = stored;
        break;
      }
      case '8bit-counter': {
        const prev = circuit.delayState.get(gate.id) ?? 0;
        const next = (prev + 1) & 0xFF;
        circuit.delayState.set(gate.id, next);
        circuit.getPin(gate.outputPins[0]).value = next;
        break;
      }
      case '8bit-counter-reset': {
        const r = circuit.getPin(gate.inputPins[0]).value ?? 0;
        const prev = circuit.delayState.get(gate.id) ?? 0;
        const next = r ? 0 : (prev + 1) & 0xFF;
        circuit.delayState.set(gate.id, next);
        circuit.getPin(gate.outputPins[0]).value = next;
        break;
      }
    }
  }

  // 6. Collect outputs and compute derived state
  const outputs = new Map<GateId, number | null>();
  for (const gate of circuit.gates.values()) {
    if (gate.type !== 'output') continue;
    outputs.set(gate.id, circuit.getPin(gate.inputPins[0]).value ?? null);
  }

  const derived = computeDerivedState(circuit, buildResult, contentionNets);

  return {
    outputs,
    contentionNets: contentionNets.map(id => id as string),
    errorSegmentIds: derived.errorSegmentIds,
    nodeValues: derived.nodeValues,
    nodeBitWidths: derived.nodeBitWidths,
  };
}
