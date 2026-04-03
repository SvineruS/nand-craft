import type { ComponentId, GateId, Rotation, Vec2 } from "../editor/types.ts";

export interface Gate {
  id: GateId;
  type: GateType;
  pos: Vec2;
  rotation: Rotation;
  inputValues: (number | null)[];
  outputValues: (number | null)[];
  state?: unknown;
  componentId?: ComponentId;
  label?: string;
  canRemove?: boolean;
  canMove?: boolean;
  status?: 'locked' | 'available' | 'solved';
}

const INPUT_TYPES = new Set<GateType>(['input', 'input-8bit', 'input-16bit']);
const OUTPUT_TYPES = new Set<GateType>(['output', 'output-8bit', 'output-16bit']);

export function isInputGate(type: GateType): boolean { return INPUT_TYPES.has(type); }
export function isOutputGate(type: GateType): boolean { return OUTPUT_TYPES.has(type); }

/** Read a pin value from a gate by kind and index. */
export function pinValue(gate: Gate, kind: 'input' | 'output', index: number): number | null {
  return kind === 'output' ? gate.outputValues[index] : gate.inputValues[index];
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
  | 'switch'
  | 'delay'
  | 'rs-latch'
  | '8bit-memory'
  | '8bit-counter'
  | '8bit-counter-reset'
  | 'tristate'
  | 'constant'
  | 'splitter'
  | 'joiner'
  | 'input'
  | 'input-8bit'
  | 'input-16bit'
  | 'output'
  | 'output-8bit'
  | 'output-16bit'
  | 'component'
  | 'level';
