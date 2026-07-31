export interface Vec2 { x: number; y: number }

// Branded types for type-safe IDs
export type GateId = string & { __brand: 'GateId' };
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
/** Only increase the ID counter, never decrease. Safe for component deserialization. */
export function bumpNextId(value: number): void {
  if (value > nextId) nextId = value;
}

export type Rotation = 0 | 90 | 180 | 270;

export interface PinRef {
  gateId: GateId;
  kind: 'input' | 'output';
  index: number;
}

/** String key for PinRef comparison and Map keys: "gateId:kind:index" */
export function pinRefKey(ref: PinRef): string {
  return `${ref.gateId}:${ref.kind}:${ref.index}`;
}

export interface WireNode {
  id: WireNodeId;
  pos: Vec2;
  /**
   * Pin this node is anchored to, if any.
   *
   * Readonly after construction: Circuit indexes nodes by pin, so reassignment has to go
   * through Circuit.setWireNodePin (or setWireNodePin in circuitMutations) to keep the
   * index in step. Writing it directly used to be possible and silently invisible.
   */
  readonly pin?: PinRef;
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
