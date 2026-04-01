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
  | 'not'
  | 'delay'
  | 'tristate'
  | 'constant'
  | 'splitter'
  | 'joiner'
  | 'input'
  | 'output'
  | 'component'
  | 'level';
