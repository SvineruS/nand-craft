import type { Circuit, GateId } from '../types.ts';
import { buildNets, detectCycles, propagate } from './evaluate.ts';

export interface ISimulationEngine {
  tick(circuit: Circuit, inputs: Map<GateId, number>): Map<GateId, number | null>;
  run(circuit: Circuit, inputs: Map<GateId, number>, ticks: number): Map<GateId, number | null>;
  detectShortCircuits(circuit: Circuit): GateId[][];
}

export class SimulationEngine implements ISimulationEngine {
  /**
   * Execute one simulation tick:
   * 1. Set input gate pin values from the inputs map
   * 2. Build nets and propagate combinational logic
   * 3. Advance delay gates (output = previous state, store current input)
   * 4. Return output gate values
   */
  tick(circuit: Circuit, inputs: Map<GateId, number>): Map<GateId, number | null> {
    // 1. Set input gate pin values
    for (const [gateId, value] of inputs) {
      const gate = circuit.gates.get(gateId);
      if (!gate || gate.type !== 'input') continue;

      for (const outputPinId of gate.outputPins) {
        const pin = circuit.pins.get(outputPinId);
        if (pin) {
          pin.value = value;
        }
      }
    }

    // 2. Build nets and propagate combinational logic
    buildNets(circuit);
    propagate(circuit);

    // 3. Advance delay gates
    for (const gate of circuit.gates.values()) {
      if (gate.type !== 'delay') continue;

      const outputPin = gate.outputPins[0] ? circuit.pins.get(gate.outputPins[0]) : undefined;
      const inputPin = gate.inputPins[0] ? circuit.pins.get(gate.inputPins[0]) : undefined;

      // Output gets the previously stored state
      if (outputPin) {
        outputPin.value = circuit.delayState.get(gate.id) ?? null;
      }

      // Store current input value for next tick
      circuit.delayState.set(gate.id, inputPin?.value ?? null);
    }

    // 4. Collect and return output gate values
    const outputs = new Map<GateId, number | null>();
    for (const gate of circuit.gates.values()) {
      if (gate.type !== 'output') continue;

      const inputPin = gate.inputPins[0] ? circuit.pins.get(gate.inputPins[0]) : undefined;
      outputs.set(gate.id, inputPin?.value ?? null);
    }

    return outputs;
  }

  /**
   * Run the simulation for N ticks, returning the final output values.
   */
  run(circuit: Circuit, inputs: Map<GateId, number>, ticks: number): Map<GateId, number | null> {
    let outputs = new Map<GateId, number | null>();
    for (let i = 0; i < ticks; i++) {
      outputs = this.tick(circuit, inputs);
    }
    return outputs;
  }

  /**
   * Detect combinational feedback loops (cycles with no delay gate).
   * Delegates to detectCycles from evaluate.ts.
   */
  detectShortCircuits(circuit: Circuit): GateId[][] {
    return detectCycles(circuit);
  }
}
