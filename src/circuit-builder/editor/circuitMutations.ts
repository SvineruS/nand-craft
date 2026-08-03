/**
 * Mutation primitives for Circuit, plus the undo records the Command classes replay.
 *
 * Circuit owns the maps and their adjacency indexes; this module composes its methods
 * into the compound edits the editor needs (remove-with-cascade, restore-what-was-
 * removed). Callers own EditorState, history, and circuitDirty flag management.
 */
import type { Circuit } from '../simulation/circuit.ts';
import {
  type PinRef,
  type Vec2,
  type WireNode,
  type WireNodeId,
  type WireSegment,
  type WireSegmentId,
} from './types.ts';
import { Vec2 as V } from './utils/vec2.ts';
import { cleanupOrphanNodes } from './utils/geometry.ts';

// ---------------------------------------------------------------------------
// Add
//
// Ids come from the caller rather than being generated here: a command has to add the same
// node back under the same id on every redo.
// ---------------------------------------------------------------------------

/** Optional fields are omitted rather than set to undefined, so the saved shape stays clean. */
export function addWireNode(circuit: Circuit, id: WireNodeId, pos: Vec2, pin?: PinRef): void {
  const node: WireNode = pin
    ? { id, pos: V.copy(pos), pin }
    : { id, pos: V.copy(pos) };
  circuit.addWireNode(node);
}

export function addWireSegment(
  circuit: Circuit, id: WireSegmentId, from: WireNodeId, to: WireNodeId,
  color?: string, label?: string,
): void {
  const seg: WireSegment = { id, from, to };
  if (color) seg.color = color;
  if (label) seg.label = label;
  circuit.addWireSegment(seg);
}

// ---------------------------------------------------------------------------
// Remove
// ---------------------------------------------------------------------------

export interface RemovedNode {
  node: WireNode;
  segments: WireSegment[];
  orphans: WireNode[];
}

/** Remove a wire node and all its connected segments. Cleans up orphaned neighbors. */
export function removeWireNodeCascade(circuit: Circuit, nodeId: WireNodeId): RemovedNode | null {
  const node = circuit.wireNodes.get(nodeId);
  if (!node) return null;
  const nodeCopy: WireNode = { ...node, pos: V.copy(node.pos) };

  const segments: WireSegment[] = [];
  const neighborIds = new Set<WireNodeId>();
  for (const segId of circuit.segmentsOf(nodeId)) {
    const seg = circuit.getWireSegment(segId);
    segments.push({ ...seg });
    const other = seg.from === nodeId ? seg.to : seg.from;
    if (other !== nodeId) neighborIds.add(other);
  }
  for (const seg of segments) circuit.removeWireSegment(seg.id);
  circuit.removeWireNode(nodeId);

  const orphans = cleanupOrphanNodes(circuit, neighborIds);
  return { node: nodeCopy, segments, orphans };
}

export interface RemovedSegment {
  segment: WireSegment;
  orphans: WireNode[];
}

/** Remove a wire segment. Optionally cleans up orphaned endpoint nodes. */
export function removeWireSegmentCascade(
  circuit: Circuit, segId: WireSegmentId, cleanOrphans: boolean,
): RemovedSegment | null {
  const seg = circuit.wireSegments.get(segId);
  if (!seg) return null;
  const segCopy: WireSegment = { ...seg };
  circuit.removeWireSegment(segId);
  const orphans = cleanOrphans ? cleanupOrphanNodes(circuit, [seg.from, seg.to]) : [];
  return { segment: segCopy, orphans };
}

// ---------------------------------------------------------------------------
// Mutate
// ---------------------------------------------------------------------------

/** Set a wire node's position. Returns the previous position (copy). */
export function setWireNodePos(circuit: Circuit, nodeId: WireNodeId, pos: Vec2): Vec2 {
  const node = circuit.getWireNode(nodeId);
  const old = V.copy(node.pos);
  node.pos = V.copy(pos);
  return old;
}

// ---------------------------------------------------------------------------
// Restore helpers (used by Command.undo and drag rollback)
// ---------------------------------------------------------------------------

/** Re-insert a previously removed node + its segments + its orphaned neighbors. */
export function restoreRemovedNode(circuit: Circuit, removed: RemovedNode): void {
  for (const orphan of removed.orphans) {
    circuit.addWireNode({ ...orphan, pos: V.copy(orphan.pos) });
  }
  circuit.addWireNode({ ...removed.node, pos: V.copy(removed.node.pos) });
  for (const seg of removed.segments) {
    circuit.addWireSegment({ ...seg });
  }
}

/** Re-insert a previously removed segment + its orphaned endpoint nodes. */
export function restoreRemovedSegment(circuit: Circuit, removed: RemovedSegment): void {
  for (const orphan of removed.orphans) {
    circuit.addWireNode({ ...orphan, pos: V.copy(orphan.pos) });
  }
  circuit.addWireSegment({ ...removed.segment });
}
