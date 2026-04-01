import type { Circuit } from './circuit.ts';
import type { GateId } from '../editor/types.ts';
import { build, propagate, computeDerivedState } from './evaluate.ts';
import type { BuildResult, TickResult } from './types.ts';

export class SimulationEngine {
  private cachedBuild: BuildResult | null = null;

  /** Rebuild structural analysis. Called automatically by tick() if invalidated. */
  buildCircuit(circuit: Circuit): BuildResult {
    this.cachedBuild = build(circuit);
    return this.cachedBuild;
  }

  /** Invalidate cached build — call when circuit topology changes. */
  invalidateBuild(): void {
    this.cachedBuild = null;
  }

  /** Get the current cached build, or null if invalidated. */
  getBuild(): BuildResult | null {
    return this.cachedBuild;
  }

  /**
   * Execute one simulation tick:
   * 1. Rebuild if needed, save constant values, reset all pins
   * 2. Set input gate pin values from inputs map
   * 3. Restore constant gate values
   * 4. Propagate combinational logic using cached build
   * 5. Advance delay gates
   * 6. Compute derived state and return TickResult
   */
  tick(circuit: Circuit, inputs: Map<GateId, number>): TickResult {
    // Rebuild if invalidated
    if (!this.cachedBuild) this.buildCircuit(circuit);
    const buildResult = this.cachedBuild!;

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

    // 4. Propagate combinational logic
    const contentionNets = propagate(circuit, buildResult);

    // 5. Advance delay gates
    for (const gate of circuit.gates.values()) {
      if (gate.type !== 'delay') continue;
      const outputPin = circuit.getPin(gate.outputPins[0]);
      const inputPin = circuit.getPin(gate.inputPins[0]);
      outputPin.value = circuit.delayState.get(gate.id) ?? null;
      circuit.delayState.set(gate.id, inputPin.value ?? null);
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

  /**
   * Run the simulation for N ticks, returning the final TickResult.
   */
  run(circuit: Circuit, inputs: Map<GateId, number>, ticks: number): TickResult {
    let result: TickResult = { outputs: new Map(), contentionNets: [], errorSegmentIds: new Set(), nodeValues: new Map(), nodeBitWidths: new Map() };
    for (let i = 0; i < ticks; i++) {
      result = this.tick(circuit, inputs);
    }
    return result;
  }
}
