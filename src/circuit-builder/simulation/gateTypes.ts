import type { ComponentId, GateId, PinId, Rotation, Vec2 } from "../editor/types.ts";

export interface Gate {
  id: GateId;
  type: GateType;
  pos: Vec2;
  rotation: Rotation;
  inputPins: PinId[];
  outputPins: PinId[];
  componentId?: ComponentId;
  label?: string;
  canRemove?: boolean;
  canMove?: boolean;
  status?: 'locked' | 'available' | 'solved';
}

export interface Pin {
  id: PinId;
  gateId: GateId;
  kind: 'input' | 'output';
  index: number;
  bitWidth: number;
  value: number | null;
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
  | 'output'
  | 'component'
  | 'level';
