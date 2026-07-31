import type { PinRef, WireNodeId } from './types.ts';
import type {
  ClipboardData, ClipboardGate, ClipboardNode, ClipboardWire, EditorState,
} from './EditorState.ts';
import { setSharedClipboard } from './EditorState.ts';
import { getSelectedIds } from './EditorState.ts';
import { getGateDefinition } from './gates.ts';
import {
  AddGateCommand,
  AddWireNodeCommand,
  AddWireSegmentCommand,
  type CommandHistory,
} from './commands.ts';
import { gateCenter, gateGridOffset } from './utils/geometry.ts';
import { snapGateCenter } from './utils/hitTests.ts';
import { Vec2 } from './utils/vec2.ts';
import { GRID_SIZE } from "./consts.ts";
import { clampGroupOffset, type MapRect } from './utils/mapBounds.ts';

export function copySelection(state: EditorState): void {
  const selectedGateIds = getSelectedIds(state, 'gate');
  const selectedSegIds = new Set(getSelectedIds(state, 'wireSegment'));
  const selectedNodeIds = new Set<string>(getSelectedIds(state, 'wireNode'));

  if (selectedGateIds.length === 0 && selectedSegIds.size === 0 && selectedNodeIds.size === 0) return;

  // Compute center of selected items
  const points: Vec2[] = [];
  for (const gid of selectedGateIds) {
    points.push(gateCenter(state.circuit.getGate(gid)));
  }
  for (const nid of selectedNodeIds) {
    points.push(state.circuit.getWireNode(nid as WireNodeId).pos);
  }
  const center = points.length > 0 ? Vec2.avg(points) : { x: 0, y: 0 };

  // Build gate index map
  const gateIdxMap = new Map<string, number>();
  const gates: ClipboardGate[] = [];
  for (const gid of selectedGateIds) {
    const g = state.circuit.getGate(gid);
    gateIdxMap.set(gid as string, gates.length);
    const c = gateCenter(g);
    gates.push({ type: g.type, delta: Vec2.sub(c, center), rotation: g.rotation, value: g.value });
  }

  // Collect relevant wire nodes (anchored to selected gates or explicitly selected free nodes)
  // Also collect nodes referenced by selected wire segments
  const relevantNodeIds = new Set<string>(selectedNodeIds);
  for (const node of state.circuit.wireNodes.values()) {
    if (node.pin && gateIdxMap.has(node.pin.gateId as string)) {
      relevantNodeIds.add(node.id as string);
    }
  }
  for (const seg of state.circuit.wireSegments.values()) {
    if (selectedSegIds.has(seg.id)) {
      relevantNodeIds.add(seg.from as string);
      relevantNodeIds.add(seg.to as string);
    }
  }

  // Build node index map
  const nodeIdxMap = new Map<string, number>();
  const nodes: ClipboardNode[] = [];
  for (const nid of relevantNodeIds) {
    const n = state.circuit.getWireNode(nid as WireNodeId);
    nodeIdxMap.set(nid, nodes.length);
    let gateIdx: number | undefined;
    let pinKind: 'input' | 'output' | undefined;
    let pinIndex: number | undefined;
    if (n.pin && gateIdxMap.has(n.pin.gateId as string)) {
      gateIdx = gateIdxMap.get(n.pin.gateId as string);
      pinKind = n.pin.kind;
      pinIndex = n.pin.index;
    }
    nodes.push({ delta: Vec2.sub(n.pos, center), gateIdx, pinKind, pinIndex });
  }

  // Collect wire segments between relevant nodes (or explicitly selected)
  const wires: ClipboardWire[] = [];
  for (const seg of state.circuit.wireSegments.values()) {
    const fromIdx = nodeIdxMap.get(seg.from as string);
    const toIdx = nodeIdxMap.get(seg.to as string);
    if (fromIdx !== undefined && toIdx !== undefined) {
      // Include if both nodes are in clipboard AND (segment is selected OR both nodes belong to selected gates)
      if (selectedSegIds.has(seg.id) || (relevantNodeIds.has(seg.from as string) && relevantNodeIds.has(seg.to as string))) {
        wires.push({ fromNodeIdx: fromIdx, toNodeIdx: toIdx, color: seg.color, label: seg.label });
      }
    }
  }

  state.clipboard = { gates, nodes, wires };
  setSharedClipboard(state.clipboard); // Persist across level switches
}

/**
 * Paste anchor pulled back so the whole clipboard lands inside the map.
 *
 * The paste preview and the paste itself both go through this, so what you see under the
 * cursor is what gets created.
 */
export function clampPasteCenter(state: EditorState, center: Vec2): Vec2 {
  const clip = state.clipboard;
  if (!clip) return center;
  return clampGroupOffset(center, clipboardBounds(clip), state.mapSize);
}

export function pasteClipboard(state: EditorState, pos: Vec2, history: CommandHistory): void {
  const clip = state.clipboard;
  if (!clip) return;

  const center = clampPasteCenter(state, Vec2.snap(pos));
  history.beginBatch('Paste');

  // Create gates and collect new gate IDs for pin reconstruction
  const newGateIds: string[] = [];
  for (const cg of clip.gates) {
    const def = getGateDefinition(cg.type);
    const gc = Vec2.add(center, cg.delta);
    const offset = gateGridOffset(cg.rotation, def.width * GRID_SIZE, def.height * GRID_SIZE);
    const gatePos = snapGateCenter(gc, def.width, def.height, offset);
    const cmd = new AddGateCommand(state, cg.type, gatePos, cg.rotation);
    history.execute(cmd);
    newGateIds.push(cmd.getGateId() as string);

    // Carry the constant's value over; registers deliberately start cleared.
    if (cg.value !== undefined) {
      state.circuit.getGate(cmd.getGateId()).value = cg.value;
    }
  }

  // Create wire nodes
  const newNodeIds: WireNodeId[] = [];
  for (const cn of clip.nodes) {
    const nodePos = Vec2.snap(Vec2.add(center, cn.delta));

    // If anchored to a gate pin, build PinRef from clipboard data
    let pin: PinRef | undefined;
    if (cn.gateIdx !== undefined && cn.pinKind !== undefined && cn.pinIndex !== undefined) {
      const gateId = newGateIds[cn.gateIdx];
      if (gateId) {
        pin = { gateId: gateId as any, kind: cn.pinKind, index: cn.pinIndex };
      }
    }

    const cmd = new AddWireNodeCommand(state, nodePos, pin);
    history.execute(cmd);
    newNodeIds.push(cmd.getNodeId());
  }

  // Create wire segments
  for (const cw of clip.wires) {
    const fromId = newNodeIds[cw.fromNodeIdx];
    const toId = newNodeIds[cw.toNodeIdx];
    if (fromId && toId) {
      const cmd = new AddWireSegmentCommand(state, fromId, toId, cw.color, cw.label);
      history.execute(cmd);
    }
  }

  history.endBatch();
  state.renderDirty = true;
}

/** Extent of the clipboard's contents, relative to the paste anchor. */
function clipboardBounds(clip: ClipboardData): MapRect {
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  const grow = (x1: number, y1: number, x2: number, y2: number) => {
    bounds.left = Math.min(bounds.left, x1);
    bounds.top = Math.min(bounds.top, y1);
    bounds.right = Math.max(bounds.right, x2);
    bounds.bottom = Math.max(bounds.bottom, y2);
  };

  for (const cg of clip.gates) {
    // Deltas point at gate centres, so half the body sticks out either side.
    const def = getGateDefinition(cg.type);
    const halfW = def.width * GRID_SIZE / 2;
    const halfH = def.height * GRID_SIZE / 2;
    grow(cg.delta.x - halfW, cg.delta.y - halfH, cg.delta.x + halfW, cg.delta.y + halfH);
  }
  for (const cn of clip.nodes) {
    grow(cn.delta.x, cn.delta.y, cn.delta.x, cn.delta.y);
  }
  return bounds;
}
