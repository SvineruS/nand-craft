import type { GateId, PinRef, Rotation, Vec2 } from "../editor/types.ts";
import { pinRefKey } from "../editor/types.ts";
import type { SimulationState } from "./types.ts";

export interface Gate {
  id: GateId;
  type: GateType;
  pos: Vec2;
  rotation: Rotation;
  state?: unknown;
  label?: string;
  canRemove?: boolean;
  canMove?: boolean;
}

const INPUT_TYPES = new Set<GateType>(['input', 'input-8bit', 'input-16bit', 'input-sw', 'input-8bit-sw', 'input-16bit-sw']);
const OUTPUT_TYPES = new Set<GateType>(['output', 'output-8bit', 'output-16bit', 'output-sw', 'output-8bit-sw', 'output-16bit-sw']);

const CONSTANT_TYPES = new Set<GateType>(['constant', 'constant-8bit', 'constant-16bit']);

const SEQUENTIAL_TYPES = new Set<GateType>(['delay', 'rs-latch', '1bit-memory', '8bit-memory', '8bit-counter', '8bit-counter-reset']);

export function isInputGate(type: GateType): boolean { return INPUT_TYPES.has(type); }
export function isOutputGate(type: GateType): boolean { return OUTPUT_TYPES.has(type); }
export function isConstantGate(type: GateType): boolean { return CONSTANT_TYPES.has(type); }
export function isSequentialGate(type: GateType): boolean { return SEQUENTIAL_TYPES.has(type); }

/** Read a pin value from simulation state. Absent = null (high-Z). */
export function pinValue(simState: SimulationState, gateId: GateId, kind: 'input' | 'output', index: number): number | null {
  return simState.get(pinRefKey({ gateId, kind, index })) ?? null;
}

/** Write a pin value to simulation state. */
export function writePinValue(simState: SimulationState, ref: PinRef, value: number | null): void {
  simState.set(pinRefKey(ref), value);
}

export type GateType =
  | 'nand'
  | 'and'
  | 'or'
  | 'nor'
  | 'xor'
  | 'xnor'
  | 'not'
  | '8bit-or'
  | '8bit-nor'
  | '8bit-not'
  | '3bit-or'
  | '3bit-and'
  | '2bit-adder'
  | '3bit-adder'
  | '1bit-decoder'
  | '3bit-decoder'
  | '8bit-negative'
  | '8bit-adder'
  | '8bit-subtractor'
  | '8bit-mux'
  | 'mux'
  | 'delay'
  | 'rs-latch'
  | '1bit-memory'
  | '8bit-memory'
  | '8bit-counter'
  | '8bit-counter-reset'
  | 'tristate'
  | 'constant'
  | 'constant-8bit'
  | 'constant-16bit'
  | 'splitter'
  | 'joiner'
  | 'input'
  | 'input-8bit'
  | 'input-16bit'
  | 'input-sw'
  | 'input-8bit-sw'
  | 'input-16bit-sw'
  | 'output'
  | 'output-8bit'
  | 'output-16bit'
  | 'output-sw'
  | 'output-8bit-sw'
  | 'output-16bit-sw'
  | 'level'
  | (string & {}); // Component IDs (e.g. 'cmp_123')
