import type { Circuit } from './circuit.ts';

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

export type Rotation = 0 | 90 | 180 | 270;

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

// user defined components (sub-circuits)
export interface Component {
  id: ComponentId;
  name: string;
  circuit: Circuit;
  isBuiltin: boolean;
  icon?: string;
  evaluateFn?: (inputs: (number | null)[]) => (number | null)[];
}
