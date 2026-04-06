/**
 * Compound in-place mutations used by interactive drags. Composes
 * circuitMutations primitives — no direct Map edits here.
 *
 * The invariant enforced by InputHandler is: during a drag, mutations go
 * through these helpers (not through CommandHistory). On drag end, the live
 * mutation is rolled back and replayed via a single atomic command batch.
 */
import type { Circuit } from '../simulation/circuit.ts';
import type { Vec2, WireNodeId, WireSegmentId } from './types.ts';
import { Vec2 as V } from './utils/vec2.ts';
import {
  addWireNode,
  addWireSegment,
  addWireSegmentWithId,
  removeWireNode,
  removeWireSegment,
} from './circuitMutations.ts';

export interface SplitRecord {
  originalSegId: WireSegmentId;
  originalFrom: WireNodeId;
  originalTo: WireNodeId;
  originalColor?: string;
  originalLabel?: string;
  createdNodeId: WireNodeId;
  createdSegIdA: WireSegmentId;
  createdSegIdB: WireSegmentId;
  splitPos: Vec2;
}

/**
 * Split a wire segment in-place at `pos`, creating a new intermediate node.
 * Returns a record that can be passed to `rollbackSplit` to undo the mutation
 * without touching history.
 */
export function splitSegmentInPlace(circuit: Circuit, segId: WireSegmentId, pos: Vec2): SplitRecord {
  const seg = circuit.getWireSegment(segId);
  const originalFrom = seg.from;
  const originalTo = seg.to;
  const originalColor = seg.color;
  const originalLabel = seg.label;

  removeWireSegment(circuit, segId, /* cleanOrphans */ false);
  const createdNodeId = addWireNode(circuit, pos);
  const createdSegIdA = addWireSegment(circuit, originalFrom, createdNodeId, originalColor, originalLabel);
  const createdSegIdB = addWireSegment(circuit, createdNodeId, originalTo, originalColor, originalLabel);

  return {
    originalSegId: segId,
    originalFrom,
    originalTo,
    originalColor,
    originalLabel,
    createdNodeId,
    createdSegIdA,
    createdSegIdB,
    splitPos: V.copy(pos),
  };
}

/**
 * Reverse a `splitSegmentInPlace` mutation. Restores the original segment
 * with its original id, color, and label — so any external references to
 * the segment id still resolve after rollback.
 */
export function rollbackSplit(circuit: Circuit, rec: SplitRecord): void {
  removeWireSegment(circuit, rec.createdSegIdA, /* cleanOrphans */ false);
  removeWireSegment(circuit, rec.createdSegIdB, /* cleanOrphans */ false);
  removeWireNode(circuit, rec.createdNodeId);
  addWireSegmentWithId(
    circuit,
    rec.originalSegId,
    rec.originalFrom,
    rec.originalTo,
    rec.originalColor,
    rec.originalLabel,
  );
}
