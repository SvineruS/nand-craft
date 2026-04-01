import type { PinId, WireNodeId } from './types.ts';
import type { ClipboardGate, ClipboardNode, ClipboardWire, EditorState } from './EditorState.ts';
import { getSelectedIds } from './EditorState.ts';
import { getGateDefinition } from './gates.ts';
import {
  AddGateCommand,
  AddWireNodeCommand,
  AddWireSegmentCommand,
  type CommandHistory,
} from './commands.ts';
import { getAllPinIds, gateCenter, gateGridOffset } from './utils/geometry.ts';
import { snapGateCenter } from './utils/hitTests.ts';
import { Vec2 } from './utils/vec2.ts';
import { GRID_SIZE } from "./consts.ts";

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
    const allPids = getAllPinIds(g);
    const pinBitWidths = allPids.map(pid => state.circuit.getPin(pid).bitWidth);
    const pinValues = allPids.map(pid => state.circuit.getPin(pid).value);
    gates.push({ type: g.type, delta: Vec2.sub(c, center), rotation: g.rotation, pinBitWidths, pinValues });
  }

  // Collect relevant wire nodes (anchored to selected gates or explicitly selected free nodes)
  // Also collect nodes referenced by selected wire segments
  const relevantNodeIds = new Set<string>(selectedNodeIds);
  for (const node of state.circuit.wireNodes.values()) {
    if (node.pinId) {
      const pin = state.circuit.getPin(node.pinId);
      if (gateIdxMap.has(pin.gateId as string)) {
        relevantNodeIds.add(node.id as string);
      }
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
    let pinIdx: number | undefined;
    if (n.pinId) {
      const pin = state.circuit.getPin(n.pinId);
      if (gateIdxMap.has(pin.gateId as string)) {
        gateIdx = gateIdxMap.get(pin.gateId as string);
        const allPins = getAllPinIds(state.circuit.getGate(pin.gateId));
        pinIdx = allPins.indexOf(n.pinId);
      }
    }
    nodes.push({ delta: Vec2.sub(n.pos, center), gateIdx, pinIdx });
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
}

export function pasteClipboard(state: EditorState, pos: Vec2, history: CommandHistory): void {
  const clip = state.clipboard;
  if (!clip) return;

  const center = Vec2.snap(pos);
  history.beginBatch('Paste');

  // Create gates and collect new pin IDs
  const newAllPinIds: PinId[][] = [];
  for (const cg of clip.gates) {
    const def = getGateDefinition(cg.type);
    const gc = Vec2.add(center, cg.delta);
    const offset = gateGridOffset(cg.rotation, def.width * GRID_SIZE, def.height * GRID_SIZE);
    const gatePos = snapGateCenter(gc, def.width, def.height, offset);
    const cmd = new AddGateCommand(state, cg.type, gatePos, cg.rotation, cg.pinBitWidths[0] ?? 1);
    history.execute(cmd);

    // Collect pin IDs and restore properties
    const gate = state.circuit.getGate(cmd.getGateId());
    const allPins = getAllPinIds(gate);
    newAllPinIds.push(allPins);
    for (let p = 0; p < allPins.length; p++) {
      const pin = state.circuit.getPin(allPins[p]);
      if (cg.pinBitWidths[p] !== undefined) pin.bitWidth = cg.pinBitWidths[p];
      if (cg.pinValues[p] !== undefined) pin.value = cg.pinValues[p];
    }
  }

  // Create wire nodes
  const newNodeIds: WireNodeId[] = [];
  for (const cn of clip.nodes) {
    const nodePos = Vec2.snap(Vec2.add(center, cn.delta));

    // If anchored to a gate pin, find the new pin ID
    let pinId: PinId | undefined;
    if (cn.gateIdx !== undefined && cn.pinIdx !== undefined) {
      pinId = newAllPinIds[cn.gateIdx]?.[cn.pinIdx];
    }

    const cmd = new AddWireNodeCommand(state, nodePos, pinId);
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
