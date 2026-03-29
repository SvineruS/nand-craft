import type { Circuit } from '../editor/circuit.ts';
import type { GateId } from '../editor/types.ts';
import { buildNets, detectCycles, propagate } from './evaluate.ts';

export class SimulationEngine {
  /**
   * Execute one simulation tick:
   * 1. Save constant gate values, then reset all pins to null
   * 2. Set input gate pin values from the inputs map
   * 3. Restore constant gate values
   * 4. Build nets and propagate combinational logic
   * 5. Advance delay gates (output = previous state, store current input)
   * 6. Collect and return output gate values
   */
  tick(circuit: Circuit, inputs: Map<GateId, number>): Map<GateId, number | null> {
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
      const gate = circuit.gates.get(gateId);
      if (!gate || gate.type !== 'input') continue;

      for (const outputPinId of gate.outputPins) {
        circuit.getPin(outputPinId).value = value;
      }
    }

    // 3. Restore constant gate values
    for (const pin of circuit.pins.values()) {
      const saved = constantValues.get(pin.id as string);
      if (saved !== undefined) pin.value = saved;
    }

    // 4. Build nets and propagate combinational logic
    buildNets(circuit);
    propagate(circuit);

    // 5. Advance delay gates
    for (const gate of circuit.gates.values()) {
      if (gate.type !== 'delay') continue;

      const outputPin = circuit.getPin(gate.outputPins[0]);
      const inputPin = circuit.getPin(gate.inputPins[0]);

      // Output gets the previously stored state
      outputPin.value = circuit.delayState.get(gate.id) ?? null;

      // Store current input value for next tick
      circuit.delayState.set(gate.id, inputPin.value ?? null);
    }

    // 6. Collect and return output gate values
    const outputs = new Map<GateId, number | null>();
    for (const gate of circuit.gates.values()) {
      if (gate.type !== 'output') continue;
      outputs.set(gate.id, circuit.getPin(gate.inputPins[0]).value ?? null);
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
