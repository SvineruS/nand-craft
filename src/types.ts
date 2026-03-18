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

// Gate types
export type GateType =
  | 'nand'
  | 'delay'
  | 'tristate'
  | 'splitter'
  | 'joiner'
  | 'input'
  | 'output'
  | 'component';

export interface Gate {
  id: GateId;
  type: GateType;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  inputPins: PinId[];
  outputPins: PinId[];
  componentId?: ComponentId;
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
  x: number;
  y: number;
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

export interface Circuit {
  gates: Map<GateId, Gate>;
  pins: Map<PinId, Pin>;
  wireNodes: Map<WireNodeId, WireNode>;
  wireSegments: Map<WireSegmentId, WireSegment>;
  nets: Map<NetId, Net>;
  delayState: Map<GateId, number | null>;
}

export function createCircuit(): Circuit {
  return {
    gates: new Map(),
    pins: new Map(),
    wireNodes: new Map(),
    wireSegments: new Map(),
    nets: new Map(),
    delayState: new Map(),
  };
}

export interface Component {
  id: ComponentId;
  name: string;
  circuit: Circuit;
  isBuiltin: boolean;
  icon?: string;
  evaluateFn?: (inputs: (number | null)[]) => (number | null)[];
}

export type ComponentLibrary = Map<ComponentId, Component>;

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
}

// Level definition
export interface Level {
  id: LevelId;
  name: string;
  description: string;
  inputs: { name: string; bitWidth: number }[];
  outputs: { name: string; bitWidth: number }[];
  mode: 'combinational' | 'sequential';
  test: TestDefinition;
}
