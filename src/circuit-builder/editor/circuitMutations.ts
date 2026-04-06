/**
 * Pure mutation primitives for Circuit. Single source of truth for Map edits.
 *
 * Callers (Command classes, drag helpers) own EditorState, history, and
 * circuitDirty flag management — these functions only touch circuit.wireNodes
 * and circuit.wireSegments.
 */
import type { Circuit } from '../simulation/circuit.ts';
import {
  generateId,
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
// ---------------------------------------------------------------------------

export function addWireNode(circuit: Circuit, pos: Vec2, pin?: PinRef): WireNodeId {
  const id = generateId('wn') as WireNodeId;
  addWireNodeWithId(circuit, id, pos, pin);
  return id;
}

export function addWireNodeWithId(circuit: Circuit, id: WireNodeId, pos: Vec2, pin?: PinRef): void {
  const node: WireNode = { id, pos: V.copy(pos) };
  if (pin) node.pin = pin;
  circuit.wireNodes.set(id, node);
}

export function addWireSegment(
  circuit: Circuit, from: WireNodeId, to: WireNodeId, color?: string, label?: string,
): WireSegmentId {
  const id = generateId('ws') as WireSegmentId;
  addWireSegmentWithId(circuit, id, from, to, color, label);
  return id;
}

export function addWireSegmentWithId(
  circuit: Circuit, id: WireSegmentId, from: WireNodeId, to: WireNodeId, color?: string, label?: string,
): void {
  const seg: WireSegment = { id, from, to };
  if (color) seg.color = color;
  if (label) seg.label = label;
  circuit.wireSegments.set(id, seg);
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
export function removeWireNode(circuit: Circuit, nodeId: WireNodeId): RemovedNode | null {
  const node = circuit.wireNodes.get(nodeId);
  if (!node) return null;
  const nodeCopy: WireNode = { ...node, pos: V.copy(node.pos) };

  const segments: WireSegment[] = [];
  const neighborIds = new Set<WireNodeId>();
  for (const seg of circuit.wireSegments.values()) {
    if (seg.from === nodeId || seg.to === nodeId) {
      segments.push({ ...seg });
      const other = seg.from === nodeId ? seg.to : seg.from;
      if (other !== nodeId) neighborIds.add(other);
    }
  }
  for (const seg of segments) circuit.wireSegments.delete(seg.id);
  circuit.wireNodes.delete(nodeId);

  const orphans = cleanupOrphanNodes(circuit, neighborIds);
  return { node: nodeCopy, segments, orphans };
}

export interface RemovedSegment {
  segment: WireSegment;
  orphans: WireNode[];
}

/** Remove a wire segment. Optionally cleans up orphaned endpoint nodes. */
export function removeWireSegment(
  circuit: Circuit, segId: WireSegmentId, cleanOrphans: boolean,
): RemovedSegment | null {
  const seg = circuit.wireSegments.get(segId);
  if (!seg) return null;
  const segCopy: WireSegment = { ...seg };
  circuit.wireSegments.delete(segId);
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

/** Set or clear a wire node's pin anchor. Returns the previous pin (or undefined). */
export function setWireNodePin(
  circuit: Circuit, nodeId: WireNodeId, pin: PinRef | undefined,
): PinRef | undefined {
  const node = circuit.getWireNode(nodeId);
  const old = node.pin;
  if (pin) node.pin = pin;
  else node.pin = undefined;
  return old;
}

// ---------------------------------------------------------------------------
// Restore helpers (used by Command.undo and drag rollback)
// ---------------------------------------------------------------------------

/** Re-insert a previously removed node + its segments + its orphaned neighbors. */
export function restoreRemovedNode(circuit: Circuit, removed: RemovedNode): void {
  for (const orphan of removed.orphans) {
    circuit.wireNodes.set(orphan.id, { ...orphan, pos: V.copy(orphan.pos) });
  }
  circuit.wireNodes.set(removed.node.id, { ...removed.node, pos: V.copy(removed.node.pos) });
  for (const seg of removed.segments) {
    circuit.wireSegments.set(seg.id, { ...seg });
  }
}

/** Re-insert a previously removed segment + its orphaned endpoint nodes. */
export function restoreRemovedSegment(circuit: Circuit, removed: RemovedSegment): void {
  for (const orphan of removed.orphans) {
    circuit.wireNodes.set(orphan.id, { ...orphan, pos: V.copy(orphan.pos) });
  }
  circuit.wireSegments.set(removed.segment.id, { ...removed.segment });
}
