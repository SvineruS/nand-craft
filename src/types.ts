import type { Circuit } from './editor/circuit.ts';

export interface Vec2 { x: number; y: number }

// Branded types for type-safe IDs
export type GateId = string & { __brand: 'GateId' };
export type PinId = string & { __brand: 'PinId' };
export type WireNodeId = string & { __brand: 'WireNodeId' };
export type WireSegmentId = string & { __brand: 'WireSegmentId' };
export type NetId = string & { __brand: 'NetId' };
export type ComponentId = string & { __brand: 'ComponentId' };
export type LevelId = string & { __brand: 'LevelId' };

// ID generator
let nextId = 0;
export function generateId(prefix: string): string {
  return prefix + '_' + (nextId++);
}
export function setNextId(value: number): void {
  nextId = value;
}

// Gate types
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

export type Rotation = 0 | 90 | 180 | 270;

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

export interface WireNode {
  id: WireNodeId;
  pos: Vec2;
  pinId?: PinId;
}

export interface WireSegment {
  id: WireSegmentId;
  from: WireNodeId;
  to: WireNodeId;
  label?: string;
  color?: string;
}

export interface Net {
  id: NetId;
  nodeIds: WireNodeId[];
  segmentIds: WireSegmentId[];
}



export interface Component {
  id: ComponentId;
  name: string;
  circuit: Circuit;
  isBuiltin: boolean;
  icon?: string;
  evaluateFn?: (inputs: (number | null)[]) => (number | null)[];
}

// Testing types
export interface TestCase {
  inputs: Record<string, number>;
  expected: Record<string, number>;
}

export interface TestWrite {
  type: 'write';
  pin: string;
  value: number;
}

export interface TestRead {
  type: 'read';
  pin: string;
  expected: number;
}

export type TestSequentialStep = TestWrite | TestRead | (TestWrite | TestRead)[];

export interface TestDefinition {
  name: string;
  description: string;
  mode: 'combinational' | 'sequential';
  cases?: TestCase[];
  steps?: TestSequentialStep[];
}

export interface TestResult {
  passed: boolean;
  message: string;
  caseIndex: number;
  actuals?: Record<string, number | null>;
}

/** Gate spec in a level definition — same fields as Gate minus runtime-only ones (id, pins). */
export type LevelGate =
  Pick<Gate, 'type' | 'pos'> &
  Partial<Pick<Gate, 'rotation' | 'label' | 'canRemove' | 'canMove'>> &
  { bitWidth?: number };

// Level definition
export interface Level {
  id: LevelId;
  name: string;
  description: string;
  inputs: { name: string; bitWidth: number }[];
  outputs: { name: string; bitWidth: number }[];
  mode: 'combinational' | 'sequential';
  test: TestDefinition;
  predefinedGates?: LevelGate[];
  prerequisites: LevelId[];
  mapPosition: Vec2;
}
