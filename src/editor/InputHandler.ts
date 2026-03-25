import type { GateId, PinId, WireNodeId, WireSegmentId, Gate } from '../types.ts';
import { getGate, getPin, getWireNode, getWireSegment } from '../circuit.ts';
import type { EditorState, PlaceableType, ClipboardGate, ClipboardNode, ClipboardWire } from './EditorState.ts';
import { WIRE_COLORS } from './EditorState.ts';
import type { Renderer } from './Renderer.ts';
import type { WireEndpoint } from './geometry.ts';
import { GATE_DEFS } from './gateDefs.ts';
import { GRID_SIZE, getGateDims, getPinPositions, snapToGrid, findNodeForPin, getAnchoredNodeIds, getAllPinIds, gateGridOffset, gateCenter } from './geometry.ts';
import { Vec2 } from './vec2.ts';
import {
  CommandHistory,
  AddGateCommand,
  RemoveGateCommand,
  MoveGatesCommand,
  RotateGatesCommand,
  RemoveWireSegmentCommand,
  RemoveWireNodeCommand,
  AddWireNodeCommand,
  AddWireSegmentCommand,
} from './CommandHistory.ts';

// Interaction thresholds (pixels in world space)
const HIT_RADIUS = 10;       // pin / wire node click target
const WIRE_HIT_DIST = 8;     // wire segment click target
const MIN_WIRE_DRAG = 5;     // minimum drag to create wire (prevents accidental wires on dblclick)

// ---------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------

function getSelectedGateIds(state: EditorState): GateId[] {
  return state.selection
    .filter((s): s is { type: 'gate'; id: GateId } => s.type === 'gate')
    .map(s => s.id);
}

function getSelectedNodeIds(state: EditorState): WireNodeId[] {
  return state.selection
    .filter((s): s is { type: 'wireNode'; id: WireNodeId } => s.type === 'wireNode')
    .map(s => s.id);
}

function getSelectedSegmentIds(state: EditorState): WireSegmentId[] {
  return state.selection
    .filter((s): s is { type: 'wireSegment'; id: WireSegmentId } => s.type === 'wireSegment')
    .map(s => s.id);
}

function snapGateCenter(pos: Vec2, width: number, height: number): Vec2 {
  return {
    x: snapToGrid(pos.x - width * GRID_SIZE / 2),
    y: snapToGrid(pos.y - height * GRID_SIZE / 2),
  };
}

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

function hitTestGate(pos: Vec2, state: EditorState): GateId | null {
  for (const gate of state.circuit.gates.values()) {
    const { w, h } = getGateDims(gate);
    if (pos.x >= gate.pos.x && pos.x <= gate.pos.x + w && pos.y >= gate.pos.y && pos.y <= gate.pos.y + h) {
      return gate.id;
    }
  }
  return null;
}

/** Unified hit test — finds the closest pin or free wire node within radius. */
function hitTestEndpoint(pos: Vec2, state: EditorState, excludeNode?: WireNodeId): WireEndpoint | null {
  let best: WireEndpoint | null = null;
  let bestDist = HIT_RADIUS;

  // Check free wire nodes
  for (const node of state.circuit.wireNodes.values()) {
    if (node.pinId) continue; // anchored nodes are hit via their pin
    if (excludeNode && node.id === excludeNode) continue;
    const d = Vec2.dist(pos, node.pos);
    if (d < bestDist) {
      bestDist = d;
      best = { kind: 'node', nodeId: node.id, pos: node.pos };
    }
  }

  // Check pins (computed positions)
  for (const gate of state.circuit.gates.values()) {
    const positions = getPinPositions(gate);
    for (const [pinId, pinPos] of positions) {
      const d = Vec2.dist(pos, pinPos);
      if (d < bestDist) {
        bestDist = d;
        best = { kind: 'pin', pinId, pos: Vec2.copy(pinPos) };
      }
    }
  }

  return best;
}

function hitTestWireSegment(pos: Vec2, state: EditorState): WireSegmentId | null {
  let closest: WireSegmentId | null = null;
  let closestDist = WIRE_HIT_DIST;
  for (const seg of state.circuit.wireSegments.values()) {
    const a = getWireNode(state.circuit, seg.from);
    const b = getWireNode(state.circuit, seg.to);
    const dist = distToRoutedPath(pos, a.pos, b.pos);
    if (dist < closestDist) {
      closestDist = dist;
      closest = seg.id;
    }
  }
  return closest;
}

function pointToSegmentDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Vec2.dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distance from point to routed path (H/V + diagonal). */
function distToRoutedPath(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  if (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) {
    return pointToSegmentDist(p, a, b);
  }

  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const mid: Vec2 = adx > ady
    ? { x: a.x + (adx - ady) * Math.sign(dx), y: a.y }
    : { x: a.x, y: a.y + (ady - adx) * Math.sign(dy) };

  return Math.min(
    pointToSegmentDist(p, a, mid),
    pointToSegmentDist(p, mid, b),
  );
}

function rectContainsGate(
  rectPos: Vec2, rw: number, rh: number, gate: Gate,
): boolean {
  const { w, h } = getGateDims(gate);
  const left = rw >= 0 ? rectPos.x : rectPos.x + rw;
  const top = rh >= 0 ? rectPos.y : rectPos.y + rh;
  const right = left + Math.abs(rw);
  const bottom = top + Math.abs(rh);
  return gate.pos.x >= left && gate.pos.y >= top && gate.pos.x + w <= right && gate.pos.y + h <= bottom;
}

// ---------------------------------------------------------------------------
// InputHandler
// ---------------------------------------------------------------------------

export class InputHandler {
  private canvas: HTMLCanvasElement;
  private getState: () => EditorState;
  private getHistory: () => CommandHistory;
  private renderer: Renderer;

  private dragAcc: Vec2 = { x: 0, y: 0 };
  private isDraggingGates = false;
  private isDraggingDisconnected = false;
  private _lastDetachedPins: { nodeId: WireNodeId; pinId: PinId }[] = [];
  private didDragMove = false;
  private nodeFromSplit = false;

  private wireStartWorld: Vec2 = { x: 0, y: 0 };
  private isDraggingNode: WireNodeId | null = null;
  private lastWorld: Vec2 = { x: 0, y: 0 };

  // Bound listeners
  private onMouseDown: (e: MouseEvent) => void;
  private onMouseMove: (e: MouseEvent) => void;
  private onMouseUp: (e: MouseEvent) => void;
  private onWheel: (e: WheelEvent) => void;
  private onKeyDown: (e: KeyboardEvent) => void;
  private onContextMenu: (e: MouseEvent) => void;
  private onDragOver: (e: DragEvent) => void;
  private onDrop: (e: DragEvent) => void;
  private onDragLeave: (e: DragEvent) => void;

  constructor(
    canvas: HTMLCanvasElement,
    getState: () => EditorState,
    getHistory: () => CommandHistory,
    renderer: Renderer,
  ) {
    this.canvas = canvas;
    this.getState = getState;
    this.getHistory = getHistory;
    this.renderer = renderer;

    this.onMouseDown = this.handleMouseDown.bind(this);
    this.onMouseMove = this.handleMouseMove.bind(this);
    this.onMouseUp = this.handleMouseUp.bind(this);
    this.onWheel = this.handleWheel.bind(this);
    this.onKeyDown = this.handleKeyDown.bind(this);
    this.onContextMenu = this.handleContextMenu.bind(this);
    this.onDragOver = this.handleDragOver.bind(this);
    this.onDrop = this.handleDrop.bind(this);
    this.onDragLeave = this.handleDragLeave.bind(this);
  }

  attach(): void {
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.canvas.addEventListener('dragover', this.onDragOver);
    this.canvas.addEventListener('drop', this.onDrop);
    this.canvas.addEventListener('dragleave', this.onDragLeave);
  }

  detach(): void {
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('dragover', this.onDragOver);
    this.canvas.removeEventListener('drop', this.onDrop);
    this.canvas.removeEventListener('dragleave', this.onDragLeave);
  }

  // ---------------------------------------------------------------------------
  // Drag-and-drop from sidebar (gate placement)
  // ---------------------------------------------------------------------------

  private handleDragOver(e: DragEvent): void {
    e.preventDefault();
    if (!e.dataTransfer) return;
    e.dataTransfer.dropEffect = 'copy';
    const state = this.getState();
    const world = this.renderer.screenToWorld({ x: e.offsetX, y: e.offsetY }, state.camera);
    const previewType = (state.mode.kind === 'stamping' ? state.mode.gateType : 'nand') as PlaceableType;
    const def = GATE_DEFS[previewType];
    state.dropPreview = { type: previewType, pos: snapGateCenter(world, def.width, def.height) };
    state.renderDirty = true;
  }

  private handleDrop(e: DragEvent): void {
    e.preventDefault();
    if (!e.dataTransfer) return;
    const gateType = e.dataTransfer.getData('text/plain') as PlaceableType;
    if (!gateType || !GATE_DEFS[gateType]) return;
    const state = this.getState();
    const world = this.renderer.screenToWorld({ x: e.offsetX, y: e.offsetY }, state.camera);
    const def = GATE_DEFS[gateType];
    const cmd = new AddGateCommand(state, gateType, snapGateCenter(world, def.width, def.height));
    this.getHistory().execute(cmd);
    state.dropPreview = null; state.renderDirty = true;
  }

  private handleDragLeave(_e: DragEvent): void {
    const state = this.getState();
    state.dropPreview = null; state.renderDirty = true;
  }

  // ---------------------------------------------------------------------------
  // Right-click — select + delete element under cursor, or clear selection
  // ---------------------------------------------------------------------------

  private handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const state = this.getState();
    const world = this.renderer.screenToWorld({ x: e.offsetX, y: e.offsetY }, state.camera);

    // Cancel stamp/paste mode
    if (state.mode.kind !== 'normal') {
      state.mode = { kind: 'normal' }; state.dropPreview = null; state.renderDirty = true;
      return;
    }

    // Wire node?
    const ep = hitTestEndpoint(world, state);
    if (ep && ep.kind === 'node') {
      this.getHistory().execute(new RemoveWireNodeCommand(state, ep.nodeId));
      state.renderDirty = true;
      return;
    }

    // Gate?
    const gateHit = hitTestGate(world, state);
    if (gateHit) {
      const gateObj = state.circuit.gates.get(gateHit);
      if (gateObj?.canRemove === false) return;
      state.selection = [{ type: 'gate', id: gateHit }];
      this.deleteSelected(state);
      return;
    }

    // Wire segment?
    const segHit = hitTestWireSegment(world, state);
    if (segHit) {
      if (e.shiftKey) {
        // Shift+right-click: delete all connected wires
        const allSegs = this.getConnectedSegments(state, [segHit]);
        // Collect free nodes that will become orphaned
        const nodeIds = new Set<string>();
        for (const sid of allSegs) {
          const seg = state.circuit.wireSegments.get(sid);
          if (seg) { nodeIds.add(seg.from as string); nodeIds.add(seg.to as string); }
        }
        for (const sid of allSegs) {
          this.getHistory().execute(new RemoveWireSegmentCommand(state, sid));
        }
        // Remove orphaned free nodes (no remaining segments, not anchored)
        for (const nid of nodeIds) {
          const node = state.circuit.wireNodes.get(nid as WireNodeId);
          if (!node || node.pinId) continue;
          let hasSegs = false;
          for (const seg of state.circuit.wireSegments.values()) {
            if (seg.from === nid || seg.to === nid) { hasSegs = true; break; }
          }
          if (!hasSegs) state.circuit.wireNodes.delete(nid as WireNodeId);
        }
        state.circuitDirty = true;
      } else {
        state.selection = [{ type: 'wireSegment', id: segHit }];
        this.deleteSelected(state);
      }
      return;
    }

    // Empty space → clear selection
    state.selection = []; state.renderDirty = true;
  }

  // ---------------------------------------------------------------------------
  // Mouse down
  // ---------------------------------------------------------------------------

  private handleMouseDown(e: MouseEvent): void {
    const state = this.getState();
    const world = this.renderer.screenToWorld({ x: e.offsetX, y: e.offsetY }, state.camera);

    if (e.button === 1) { this.handleMiddleMouseDown(state, world, e); return; }
    if (e.button === 0 && e.shiftKey) { this.handleShiftMouseDown(state, world, e); return; }
    if (e.button !== 0) return;

    if (state.mode.kind === 'stamping') { this.handleStampClick(state, world); return; }
    if (state.mode.kind === 'pasting' && state.clipboard) { this.handlePasteClick(state, world); return; }

    const isDblClick = e.detail >= 2;

    const ep = hitTestEndpoint(world, state);
    if (ep) { this.handleEndpointMouseDown(state, world, ep, isDblClick); return; }

    const gateHit = hitTestGate(world, state);
    if (gateHit) { this.handleGateMouseDown(state, world, gateHit, isDblClick, e); return; }

    const segHit = hitTestWireSegment(world, state);
    if (segHit) { this.handleWireSegmentMouseDown(state, world, segHit, isDblClick, e); return; }

    this.handleEmptyMouseDown(state, world, isDblClick, e);
  }

  private handleMiddleMouseDown(state: EditorState, world: Vec2, e: MouseEvent): void {
    // Disconnect drag if over gate
    const gateHit = hitTestGate(world, state);
    if (gateHit) {
      this.startDisconnectDrag(state, gateHit, world);
      return;
    }

    // Wire node or pin → start dragging (merge on mouseup if no movement)
    const ep = hitTestEndpoint(world, state);
    if (ep) {
      if (ep.kind === 'node') {
        this.isDraggingNode = ep.nodeId;
        this.lastWorld = Vec2.copy(world);
        this.dragAcc = { x: 0, y: 0 };
        state.renderDirty = true;
        return;
      }
      // Pin: detach anchored wire node and drag it
      const anchoredNode = this.findAnchoredNode(ep.pinId, state);
      if (!anchoredNode) return;
      const node = state.circuit.wireNodes.get(anchoredNode);
      if (!node) return;
      const pin = state.circuit.pins.get(ep.pinId);
      if (pin) pin.value = null;
      node.pinId = undefined;
      this.isDraggingNode = anchoredNode;
      this.lastWorld = Vec2.copy(world);
      state.mode = { kind: 'normal' }; state.renderDirty = true;
      return;
    }

    // Wire segment → split and drag new node
    const segHit = hitTestWireSegment(world, state);
    if (segHit) {
      const newNodeId = this.splitWireSegment(state, segHit, Vec2.snap(world));
      if (newNodeId) {
        this.isDraggingNode = newNodeId;
        this.nodeFromSplit = true;
        this.lastWorld = Vec2.copy(world);
      }
      return;
    }

    // Otherwise pan
    state.isDragging = true; state.dragStart = { x: e.offsetX, y: e.offsetY };
  }

  private handleShiftMouseDown(state: EditorState, world: Vec2, e: MouseEvent): void {
    const ep = hitTestEndpoint(world, state);
    if (ep && ep.kind === 'node') {
      this.isDraggingNode = ep.nodeId;
      this.lastWorld = Vec2.copy(world);
      this.dragAcc = { x: 0, y: 0 };
      state.renderDirty = true;
      return;
    }

    const gateHit = hitTestGate(world, state);
    if (gateHit) {
      this.startDisconnectDrag(state, gateHit, world);
      return;
    }

    state.isDragging = true; state.dragStart = { x: e.offsetX, y: e.offsetY };
  }

  private handleStampClick(state: EditorState, world: Vec2): void {
    if (state.mode.kind !== 'stamping') return;
    const def = GATE_DEFS[state.mode.gateType];
    const cmd = new AddGateCommand(state, state.mode.gateType, snapGateCenter(world, def.width, def.height));
    this.getHistory().execute(cmd);
  }

  private handlePasteClick(state: EditorState, world: Vec2): void {
    this.pasteClipboard(state, world);
  }

  private handleEndpointMouseDown(state: EditorState, world: Vec2, ep: WireEndpoint, isDblClick: boolean): void {
    if (isDblClick) {
      if (ep.kind === 'node') {
        this.isDraggingNode = ep.nodeId;
        this.lastWorld = Vec2.copy(world);
        state.mode = { kind: 'normal' }; state.renderDirty = true;
        return;
      }
      // Pin: detach anchored wire node and drag it
      const anchoredNode = this.findAnchoredNode(ep.pinId, state);
      if (!anchoredNode) return;
      const node = state.circuit.wireNodes.get(anchoredNode);
      if (!node) return;
      const pin = state.circuit.pins.get(ep.pinId);
      if (pin) pin.value = null;
      node.pinId = undefined;
      this.isDraggingNode = anchoredNode;
      this.lastWorld = Vec2.copy(world);
      state.mode = { kind: 'normal' }; state.renderDirty = true;
      return;
    }

    // Single click: if node is already selected (area select), start dragging selection
    if (ep.kind === 'node' && state.selection.some(s => s.type === 'wireNode' && s.id === ep.nodeId)) {
      this.isDraggingGates = true;
      this.dragAcc = { x: 0, y: 0 };
      this.lastWorld = Vec2.copy(world);
      return;
    }

    // Single click → start wiring
    this.wireStartWorld = Vec2.copy(world);
    state.mode = { kind: 'wiring', start: ep }; state.renderDirty = true;
  }

  private handleGateMouseDown(state: EditorState, world: Vec2, gateHit: GateId, isDblClick: boolean, e: MouseEvent): void {
    // Double-click constant gate → toggle value
    if (isDblClick) {
      const gate = state.circuit.gates.get(gateHit);
      if (gate && gate.type === 'constant') {
        const outPinId = gate.outputPins[0];
        if (!outPinId) return;
        const pin = state.circuit.pins.get(outPinId);
        if (!pin) return;
        const mask = ((1 << pin.bitWidth) >>> 0) - 1;
        pin.value = pin.value === null ? 1 : ((pin.value + 1) & mask) >>> 0;
        if (pin.value > mask) pin.value = 0;
        state.circuitDirty = true;
        return;
      }
    }

    const alreadySelected = state.selection.some(
      (s) => s.type === 'gate' && s.id === gateHit,
    );
    if (e.ctrlKey || e.metaKey) {
      if (alreadySelected) {
        state.selection = state.selection.filter(item => !(item.type === 'gate' && item.id === gateHit));
      } else {
        state.selection = [...state.selection, { type: 'gate', id: gateHit }];
      }
    } else if (!alreadySelected) {
      state.selection = [{ type: 'gate', id: gateHit }];
    }
    // Only start drag if at least one selected gate is movable
    const updatedState = this.getState();
    const hasMovable = updatedState.selection
      .filter(s => s.type === 'gate')
      .some(s => {
        const g = updatedState.circuit.gates.get(s.id as GateId);
        return g?.canMove !== false;
      });
    if (hasMovable) {
      this.isDraggingGates = true;
      this.dragAcc = { x: 0, y: 0 };
      this.lastWorld = Vec2.copy(world);
    }
  }

  private handleWireSegmentMouseDown(state: EditorState, world: Vec2, segHit: WireSegmentId, isDblClick: boolean, e: MouseEvent): void {
    if (isDblClick) {
      // Double-click wire → split and start dragging new node
      state.mode = { kind: 'normal' };
      const newNodeId = this.splitWireSegment(state, segHit, Vec2.snap(world));
      if (newNodeId) {
        this.isDraggingNode = newNodeId;
        this.nodeFromSplit = true;
        this.lastWorld = Vec2.copy(world);
      }
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      const alreadySel = state.selection.some(s => s.type === 'wireSegment' && s.id === segHit);
      if (alreadySel) {
        state.selection = state.selection.filter(item => !(item.type === 'wireSegment' && item.id === segHit));
      } else {
        state.selection = [...state.selection, { type: 'wireSegment', id: segHit }];
      }
    } else {
      state.selection = [{ type: 'wireSegment', id: segHit }];
    }
  }

  private handleEmptyMouseDown(state: EditorState, world: Vec2, isDblClick: boolean, e: MouseEvent): void {
    if (isDblClick) {
      // Double-click empty → create wire node and start wiring from it
      const snapPos = Vec2.snap(world);
      const cmd = new AddWireNodeCommand(state, snapPos);
      this.getHistory().execute(cmd);
      const newNodeId = cmd.getNodeId();
      this.wireStartWorld = Vec2.copy(world);
      state.mode = { kind: 'wiring', start: { kind: 'node', nodeId: newNodeId, pos: snapPos } };
      state.renderDirty = true;
      return;
    }

    // Single click empty → start selection rect
    if (!(e.ctrlKey || e.metaKey)) {
      state.selection = [];
    }
    state.selectionRect = { pos: Vec2.copy(world), w: 0, h: 0 };
    state.isDragging = false;
    state.dragStart = Vec2.copy(world);
  }

  // ---------------------------------------------------------------------------
  // Mouse move
  // ---------------------------------------------------------------------------

  private handleMouseMove(e: MouseEvent): void {
    const state = this.getState();
    const world = this.renderer.screenToWorld({ x: e.offsetX, y: e.offsetY }, state.camera);
    this.renderer.setMouseWorld(world);

    // Stamp/paste preview
    if (state.mode.kind === 'stamping') {
      const def = GATE_DEFS[state.mode.gateType];
      state.dropPreview = { type: state.mode.gateType, pos: snapGateCenter(world, def.width, def.height) };
      state.hoveredGate = hitTestGate(world, state);
      state.renderDirty = true;
    } else if (state.mode.kind === 'pasting') {
      state.mode = { kind: 'pasting', cursor: Vec2.snap(world) };
      state.renderDirty = true;
    }

    // Pan
    if (state.isDragging && state.dragStart) {
      const dx = e.offsetX - state.dragStart.x;
      const dy = e.offsetY - state.dragStart.y;
      state.camera.pos = Vec2.sub(state.camera.pos, Vec2.scale({ x: dx, y: dy }, 1 / state.camera.zoom));
      state.dragStart = { x: e.offsetX, y: e.offsetY };
      state.renderDirty = true;
      return;
    }

    // Wire node dragging (snapped to grid)
    if (this.isDraggingNode) {
      const dragId = this.isDraggingNode;
      const node = state.circuit.wireNodes.get(dragId);
      if (node) {
        const snapped = Vec2.snap(world);
        if (snapped.x !== node.pos.x || snapped.y !== node.pos.y) this.didDragMove = true;
        node.pos = snapped;
      }
      state.hoveredEndpoint = hitTestEndpoint(world, state, dragId);
      state.renderDirty = true;
      return;
    }

    // Wiring in progress
    if (state.mode.kind === 'wiring') {
      state.hoveredEndpoint = hitTestEndpoint(world, state);
      state.renderDirty = true;
      return;
    }

    // Gate + selected node dragging (snapped to grid)
    if (this.isDraggingGates) {
      // Compute snapped delta from drag start
      const raw = Vec2.add(Vec2.sub(world, this.lastWorld), this.dragAcc);
      const snappedDx = snapToGrid(raw.x) - snapToGrid(this.dragAcc.x);
      const snappedDy = snapToGrid(raw.y) - snapToGrid(this.dragAcc.y);
      this.dragAcc = raw;
      this.lastWorld = Vec2.copy(world);

      if (snappedDx !== 0 || snappedDy !== 0) {
        const gateIds = getSelectedGateIds(state);
        const selectedNodeIds = getSelectedNodeIds(state);

        for (const gateId of gateIds) {
          const gate = state.circuit.gates.get(gateId);
          if (gate && gate.canMove !== false) gate.pos = Vec2.add(gate.pos, { x: snappedDx, y: snappedDy });
        }
        // When disconnected, anchored nodes were detached — skip them
        const anchored = this.isDraggingDisconnected ? [] : getAnchoredNodeIds(state.circuit, gateIds);
        const allNodeIds = new Set<WireNodeId>([...anchored, ...selectedNodeIds]);
        for (const nid of allNodeIds) {
          const node = state.circuit.wireNodes.get(nid);
          if (node) node.pos = Vec2.add(node.pos, { x: snappedDx, y: snappedDy });
        }
      }
      state.renderDirty = true;
      return;
    }

    // Selection rect
    if (state.selectionRect && state.dragStart) {
      state.selectionRect.w = world.x - state.dragStart.x;
      state.selectionRect.h = world.y - state.dragStart.y;
      state.renderDirty = true;
      return;
    }

    // Hover
    state.hoveredEndpoint = hitTestEndpoint(world, state);
    state.hoveredGate = hitTestGate(world, state);
    state.renderDirty = true;
  }

  // ---------------------------------------------------------------------------
  // Mouse up
  // ---------------------------------------------------------------------------

  private handleMouseUp(e: MouseEvent): void {
    const state = this.getState();

    if (this.isDraggingNode) { this.completeNodeDrag(state, e); return; }
    if (state.mode.kind === 'wiring') { this.completeWiring(state, e); return; }
    if (this.isDraggingGates) { this.completeGateDrag(state); return; }
    if (state.selectionRect) { this.completeSelectionRect(state); return; }

    // Clear pan
    state.isDragging = false; state.dragStart = null;
  }

  private completeNodeDrag(state: EditorState, e: MouseEvent): void {
    const world = this.renderer.screenToWorld({ x: e.offsetX, y: e.offsetY }, state.camera);
    const draggedNodeId = this.isDraggingNode!;
    const didMove = this.didDragMove;
    const fromSplit = this.nodeFromSplit;
    this.isDraggingNode = null;
    this.didDragMove = false;
    this.nodeFromSplit = false;

    // No drag movement? Try merge (2-segment node removal) — but not if just created by split
    if (!didMove && !fromSplit && this.tryMergeWireNode(state, draggedNodeId)) return;

    const targetPin = hitTestEndpoint(world, state, draggedNodeId);

    if (targetPin) {
      // Dropped on pin or wire node → merge: repoint all segments, remove dragged node
      const targetNodeId = this.ensureWireNode(state, targetPin);
      if (targetNodeId && targetNodeId !== draggedNodeId) {
        const toRemove: WireSegmentId[] = [];
        for (const seg of state.circuit.wireSegments.values()) {
          if (seg.from === draggedNodeId) seg.from = targetNodeId;
          if (seg.to === draggedNodeId) seg.to = targetNodeId;
          if (seg.from === seg.to) toRemove.push(seg.id);
        }
        for (const id of toRemove) state.circuit.wireSegments.delete(id);
        const seen = new Set<string>();
        for (const seg of state.circuit.wireSegments.values()) {
          const key = [seg.from, seg.to].sort().join(':');
          if (seen.has(key)) { state.circuit.wireSegments.delete(seg.id); }
          else seen.add(key);
        }
        state.circuit.wireNodes.delete(draggedNodeId);
      }
    } else {
      const node = state.circuit.wireNodes.get(draggedNodeId);
      if (node) { node.pos = Vec2.snap(node.pos); }
    }
    state.selection = []; state.renderDirty = true;
  }

  private completeWiring(state: EditorState, e: MouseEvent): void {
    if (state.mode.kind !== 'wiring') return;
    const wireStart = state.mode.start;
    const world = this.renderer.screenToWorld({ x: e.offsetX, y: e.offsetY }, state.camera);

    // No drag? Cancel (allows double-click to work)
    const dragDist = Vec2.dist(world, this.wireStartWorld);
    if (dragDist < MIN_WIRE_DRAG) {
      state.mode = { kind: 'normal' }; state.renderDirty = true;
      return;
    }

    const target = hitTestEndpoint(world, state);
    const wireColor = this.getActiveWireColor(state);

    if (target) {
      // Endpoint → endpoint
      const fromNode = this.ensureWireNode(state, wireStart);
      const toNode = this.ensureWireNode(state, target);
      if (fromNode && toNode) this.addSegmentIfNew(state, fromNode, toNode, wireColor);
    } else {
      // Check if dropped on a wire segment → split it and connect
      const segHit = hitTestWireSegment(world, state);
      if (segHit) {
        const snapPos = Vec2.snap(world);
        const midId = this.splitWireSegment(state, segHit, snapPos);
        if (midId) {
          const fromNode = this.ensureWireNode(state, wireStart);
          if (fromNode) this.addSegmentIfNew(state, fromNode, midId, wireColor);
        }
      } else {
        // Endpoint → empty space: create free node and connect
        const snapPos = Vec2.snap(world);
        const nodeCmd = new AddWireNodeCommand(state, snapPos);
        this.getHistory().execute(nodeCmd);
        const fromNode = this.ensureWireNode(state, wireStart);
        if (fromNode) this.addSegmentIfNew(state, fromNode, nodeCmd.getNodeId(), wireColor);
      }
    }

    state.mode = { kind: 'normal' }; state.renderDirty = true;
  }

  private completeGateDrag(state: EditorState): void {
    this.isDraggingGates = false;
    const snapDelta = Vec2.snap(this.dragAcc);

    const gateIds = getSelectedGateIds(state);
    const selectedNodeIds = getSelectedNodeIds(state);
    const isDisconnect = this.isDraggingDisconnected;

    // Create command if moved, or if disconnect drag (to track detach for undo)
    if (snapDelta.x !== 0 || snapDelta.y !== 0 || isDisconnect) {
      // Undo live move before creating command
      if (snapDelta.x !== 0 || snapDelta.y !== 0) {
        for (const gateId of gateIds) {
          const gate = state.circuit.gates.get(gateId);
          if (gate) gate.pos = Vec2.sub(gate.pos, snapDelta);
        }
        const anchored = isDisconnect ? [] : getAnchoredNodeIds(state.circuit, gateIds);
        const allNodeIds = new Set<WireNodeId>([...anchored, ...selectedNodeIds]);
        for (const nid of allNodeIds) {
          const node = state.circuit.wireNodes.get(nid);
          if (node) node.pos = Vec2.sub(node.pos, snapDelta);
        }
      }

      const cmd = new MoveGatesCommand(state, gateIds, snapDelta, selectedNodeIds, isDisconnect);
      if (isDisconnect) {
        cmd.saveDetachedPins(this._lastDetachedPins);
      }
      this.getHistory().execute(cmd);
    }

    this.isDraggingDisconnected = false;
    this._lastDetachedPins = [];
    this.dragAcc = { x: 0, y: 0 };
  }

  private completeSelectionRect(state: EditorState): void {
    const rect = state.selectionRect!;
    const selected: typeof state.selection = [];
    for (const gate of state.circuit.gates.values()) {
      if (rectContainsGate(rect.pos, rect.w, rect.h, gate)) {
        selected.push({ type: 'gate', id: gate.id });
      }
    }
    // Include free wire nodes in area selection
    const left = rect.w >= 0 ? rect.pos.x : rect.pos.x + rect.w;
    const top = rect.h >= 0 ? rect.pos.y : rect.pos.y + rect.h;
    const right = left + Math.abs(rect.w);
    const bottom = top + Math.abs(rect.h);
    for (const node of state.circuit.wireNodes.values()) {
      if (node.pinId) continue; // skip anchored nodes
      if (node.pos.x >= left && node.pos.x <= right && node.pos.y >= top && node.pos.y <= bottom) {
        selected.push({ type: 'wireNode', id: node.id });
      }
    }
    state.selection = selected;
    state.selectionRect = null;
    state.renderDirty = true;
  }

  // ---------------------------------------------------------------------------
  // Wheel (zoom)
  // ---------------------------------------------------------------------------

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const state = this.getState();
    const worldBefore = this.renderer.screenToWorld({ x: e.offsetX, y: e.offsetY }, state.camera);
    const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    state.camera.zoom = Math.min(4, Math.max(0.25, state.camera.zoom * zoomFactor));
    const worldAfter = this.renderer.screenToWorld({ x: e.offsetX, y: e.offsetY }, state.camera);
    state.camera.pos = Vec2.add(state.camera.pos, Vec2.sub(worldBefore, worldAfter));
    state.renderDirty = true;
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const state = this.getState();
    const ctrl = e.ctrlKey || e.metaKey;

    if (this.handleUndoRedo(state, e, ctrl)) return;
    if (this.handleDeleteKey(state, e)) return;
    if (this.handleRotateKey(state, e)) return;
    if (this.handleWireColorKey(state, e, ctrl)) return;
    if (this.handleClipboardKeys(state, e, ctrl)) return;
    if (this.handleEyedropperKey(state, e)) return;
    if (this.handleEscapeKey(state, e)) return;
  }

  private handleUndoRedo(state: EditorState, e: KeyboardEvent, ctrl: boolean): boolean {
    if (ctrl && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.getHistory().undo();
      state.renderDirty = true;
      return true;
    }
    if (ctrl && (e.key === 'Z' || e.key === 'y')) {
      e.preventDefault();
      this.getHistory().redo();
      state.renderDirty = true;
      return true;
    }
    return false;
  }

  private handleDeleteKey(state: EditorState, e: KeyboardEvent): boolean {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return false;
    e.preventDefault();
    this.deleteSelected(state);
    return true;
  }

  private handleRotateKey(state: EditorState, e: KeyboardEvent): boolean {
    if (e.key !== 'r' && e.key !== 'R') return false;

    // Rotate clipboard in paste mode
    if (state.mode.kind === 'pasting' && state.clipboard) {
      this.rotateClipboard(state);
      return true;
    }
    // Rotate selection (gates + free nodes around group center)
    const gateIds = getSelectedGateIds(state)
      .filter(gid => state.circuit.gates.get(gid)?.canMove !== false);
    const nodeIds = getSelectedNodeIds(state);
    if (gateIds.length > 0 || nodeIds.length > 0) {
      this.getHistory().execute(new RotateGatesCommand(state, gateIds, nodeIds));
    }
    return true;
  }

  private handleWireColorKey(state: EditorState, e: KeyboardEvent, ctrl: boolean): boolean {
    if (e.key !== 'e' && e.key !== 'E') return false;

    const selectedSegs = state.selection
      .filter((s): s is { type: 'wireSegment'; id: WireSegmentId } => s.type === 'wireSegment')
      .map((s) => s.id);
    if (selectedSegs.length === 0) return true;

    const color = state.wireColor;
    const colorValue = color === WIRE_COLORS[0] ? undefined : color;

    if (e.shiftKey || ctrl) {
      const allSegs = this.getConnectedSegments(state, selectedSegs);
      for (const segId of allSegs) {
        const seg = state.circuit.wireSegments.get(segId);
        if (seg) seg.color = colorValue;
      }
    } else {
      for (const segId of selectedSegs) {
        const seg = state.circuit.wireSegments.get(segId);
        if (seg) seg.color = colorValue;
      }
    }
    state.circuitDirty = true;
    return true;
  }

  private handleClipboardKeys(state: EditorState, e: KeyboardEvent, ctrl: boolean): boolean {
    if (!ctrl) return false;

    // Copy
    if ((e.key === 'c' || e.key === 'C') && !e.shiftKey) {
      e.preventDefault();
      this.copySelection(state);
      return true;
    }
    // Cut
    if (e.key === 'x' || e.key === 'X') {
      e.preventDefault();
      this.copySelection(state);
      this.deleteSelected(state);
      return true;
    }
    // Paste
    if (e.key === 'v' || e.key === 'V') {
      e.preventDefault();
      if (state.clipboard) {
        state.mode = { kind: 'pasting', cursor: null }; state.renderDirty = true;
      }
      return true;
    }
    return false;
  }

  private handleEyedropperKey(state: EditorState, e: KeyboardEvent): boolean {
    if (e.key !== 'q' && e.key !== 'Q') return false;

    if (state.hoveredGate) {
      const gate = state.circuit.gates.get(state.hoveredGate);
      if (gate) {
        state.mode = { kind: 'stamping', gateType: gate.type }; state.renderDirty = true;
        return true;
      }
    }
    const mw = this.renderer.getMouseWorld();
    const segHit = hitTestWireSegment(mw, state);
    if (segHit) {
      const seg = state.circuit.wireSegments.get(segHit);
      if (seg) {
        state.wireColor = seg.color ?? WIRE_COLORS[0]; state.renderDirty = true;
        return true;
      }
    }
    return true;
  }

  private handleEscapeKey(state: EditorState, e: KeyboardEvent): boolean {
    if (e.key !== 'Escape') return false;
    this.isDraggingNode = null;
    this.isDraggingDisconnected = false;
    state.selection = [];
    state.mode = { kind: 'normal' };
    state.selectionRect = null;
    state.dropPreview = null;
    state.renderDirty = true;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Ensure the endpoint has a wire node, returning its ID. Creates one for pins if needed. */
  private ensureWireNode(state: EditorState, ep: WireEndpoint): WireNodeId | null {
    if (ep.kind === 'node') return ep.nodeId;
    // Pin: find existing or create
    const existing = findNodeForPin(state.circuit, ep.pinId);
    if (existing) return existing;

    const cmd = new AddWireNodeCommand(state, ep.pos, ep.pinId);
    this.getHistory().execute(cmd);
    return cmd.getNodeId();
  }

  /** Check if a segment already exists between two nodes (either direction). */
  private segmentExists(state: EditorState, a: WireNodeId, b: WireNodeId): boolean {
    for (const seg of state.circuit.wireSegments.values()) {
      if ((seg.from === a && seg.to === b) || (seg.from === b && seg.to === a)) return true;
    }
    return false;
  }

  /** Add a wire segment between two nodes unless one already exists. */
  private addSegmentIfNew(state: EditorState, from: WireNodeId, to: WireNodeId, color?: string): void {
    if (from === to || this.segmentExists(state, from, to)) return;
    this.getHistory().execute(new AddWireSegmentCommand(state, from, to, color));
  }

  /** Get the active wire color, or undefined for default. */
  private getActiveWireColor(state: EditorState): string | undefined {
    return state.wireColor === WIRE_COLORS[0] ? undefined : state.wireColor;
  }

  /** Split a wire segment at pos. Returns the new node ID. */
  private splitWireSegment(state: EditorState, segId: WireSegmentId, pos: Vec2): WireNodeId | null {
    const seg = state.circuit.wireSegments.get(segId);
    if (!seg) return null;
    const fromId = seg.from;
    const toId = seg.to;
    const color = seg.color;

    this.getHistory().execute(new RemoveWireSegmentCommand(state, segId, false));
    const addNode = new AddWireNodeCommand(state, pos);
    this.getHistory().execute(addNode);
    const midId = addNode.getNodeId();
    this.getHistory().execute(new AddWireSegmentCommand(state, fromId, midId, color));
    this.getHistory().execute(new AddWireSegmentCommand(state, midId, toId, color));
    state.renderDirty = true;
    return midId;
  }

  /** Delete all selected gates and wire segments. */
  private deleteSelected(state: EditorState): void {
    // Wire nodes first (cascades to attached segments)
    for (const nodeId of getSelectedNodeIds(state)) this.getHistory().execute(new RemoveWireNodeCommand(state, nodeId));
    for (const segId of getSelectedSegmentIds(state)) this.getHistory().execute(new RemoveWireSegmentCommand(state, segId));
    const gateIds = getSelectedGateIds(state)
      .filter(gid => state.circuit.gates.get(gid)?.canRemove !== false);
    for (const gateId of gateIds) this.getHistory().execute(new RemoveGateCommand(state, gateId));

    state.selection = []; state.renderDirty = true;
  }

  /** Find a wire node anchored to this pin that has connected segments. */
  /** If a free wire node has exactly 2 segments, remove the node and join the segments. Returns true if merged. */
  private tryMergeWireNode(state: EditorState, nodeId: WireNodeId): boolean {
    const node = state.circuit.wireNodes.get(nodeId);
    if (!node || node.pinId) return false; // only free nodes

    // Find connected segments
    const connected: { segId: WireSegmentId; otherId: WireNodeId }[] = [];
    for (const seg of state.circuit.wireSegments.values()) {
      if (seg.from === nodeId) connected.push({ segId: seg.id, otherId: seg.to });
      else if (seg.to === nodeId) connected.push({ segId: seg.id, otherId: seg.from });
    }

    if (connected.length !== 2) return false;

    // Preserve color and label from the segments
    const seg0 = state.circuit.wireSegments.get(connected[0].segId);
    const seg1 = state.circuit.wireSegments.get(connected[1].segId);
    const color = seg0?.color ?? seg1?.color;
    const label = seg0?.label ?? seg1?.label;

    const otherId0 = connected[0].otherId;
    const otherId1 = connected[1].otherId;

    // Remove segments directly (NOT via RemoveWireSegmentCommand to avoid orphan cleanup
    // deleting the endpoints we need for the new segment)
    state.circuit.wireSegments.delete(connected[0].segId);
    state.circuit.wireSegments.delete(connected[1].segId);
    state.circuit.wireNodes.delete(nodeId);

    // Create a new segment connecting the two remaining endpoints
    const cmd = new AddWireSegmentCommand(state, otherId0, otherId1, color);
    this.getHistory().execute(cmd);
    if (label) {
      getWireSegment(state.circuit, cmd.getSegmentId()).label = label;
    }
    state.renderDirty = true;
    return true;
  }

  /** Start a disconnect drag: select gate, detach pin nodes, begin dragging. */
  private startDisconnectDrag(state: EditorState, gateId: GateId, pos: Vec2): void {
    const gate = state.circuit.gates.get(gateId);
    if (gate?.canMove === false) return;
    state.selection = [{ type: 'gate', id: gateId }];
    // Detach pins for visual feedback; save mappings for command undo
    this._lastDetachedPins = this.detachPinNodes(state, [gateId]);
    this.isDraggingGates = true;
    this.isDraggingDisconnected = true;
    this.dragAcc = { x: 0, y: 0 };
    this.lastWorld = Vec2.copy(pos);
  }

  /** Detach all wire nodes anchored to pins of the given gates. Returns detached mappings for undo. */
  private detachPinNodes(state: EditorState, gateIds: GateId[]): { nodeId: WireNodeId; pinId: PinId }[] {
    const pinIds = new Set<string>();
    for (const gateId of gateIds) {
      const gate = state.circuit.gates.get(gateId);
      if (!gate) continue;
      for (const p of getAllPinIds(gate)) pinIds.add(p as string);
    }
    const detached: { nodeId: WireNodeId; pinId: PinId }[] = [];
    for (const node of state.circuit.wireNodes.values()) {
      if (node.pinId && pinIds.has(node.pinId as string)) {
        detached.push({ nodeId: node.id, pinId: node.pinId });
        node.pinId = undefined;
      }
    }
    // Clear pin values so disconnected wires don't show stale signals
    for (const pin of state.circuit.pins.values()) {
      if (pinIds.has(pin.id as string)) {
        pin.value = null;
      }
    }
    return detached;
  }

  private findAnchoredNode(pinId: PinId, state: EditorState): WireNodeId | null {
    for (const node of state.circuit.wireNodes.values()) {
      if (node.pinId === pinId) {
        for (const seg of state.circuit.wireSegments.values()) {
          if (seg.from === node.id || seg.to === node.id) return node.id;
        }
      }
    }
    return null;
  }

  /** Flood-fill from selected segments to find all connected segments. */
  private getConnectedSegments(state: EditorState, startSegIds: WireSegmentId[]): WireSegmentId[] {
    // Build node→segments adjacency
    const nodeToSegs = new Map<string, WireSegmentId[]>();
    for (const seg of state.circuit.wireSegments.values()) {
      const fromKey = seg.from as string;
      const toKey = seg.to as string;
      if (!nodeToSegs.has(fromKey)) nodeToSegs.set(fromKey, []);
      if (!nodeToSegs.has(toKey)) nodeToSegs.set(toKey, []);
      nodeToSegs.get(fromKey)!.push(seg.id);
      nodeToSegs.get(toKey)!.push(seg.id);
    }

    const visited = new Set<string>();
    const queue = [...startSegIds];
    for (const id of queue) visited.add(id as string);

    while (queue.length > 0) {
      const segId = queue.pop()!;
      const seg = state.circuit.wireSegments.get(segId);
      if (!seg) continue;

      for (const nodeKey of [seg.from as string, seg.to as string]) {
        for (const neighborId of nodeToSegs.get(nodeKey) ?? []) {
          if (!visited.has(neighborId as string)) {
            visited.add(neighborId as string);
            queue.push(neighborId);
          }
        }
      }
    }

    return [...visited] as WireSegmentId[];
  }

  // ---------------------------------------------------------------------------
  // Clipboard rotation
  // ---------------------------------------------------------------------------

  private rotateClipboard(state: EditorState): void {
    const clip = state.clipboard;
    if (!clip) return;

    // Rotate all deltas by 90° CW around origin (0,0)
    for (const cg of clip.gates) {
      cg.delta = Vec2.rotateCW(cg.delta);
      cg.rotation = (((cg.rotation + 90) % 360) as 0 | 90 | 180 | 270);
    }
    for (const cn of clip.nodes) {
      cn.delta = Vec2.rotateCW(cn.delta);
    }

    state.renderDirty = true;
  }

  // ---------------------------------------------------------------------------
  // Copy / Paste
  // ---------------------------------------------------------------------------

  private copySelection(state: EditorState): void {
    const selectedGateIds = getSelectedGateIds(state);
    const selectedSegIds = new Set(getSelectedSegmentIds(state) as string[]);
    const selectedNodeIds = new Set(getSelectedNodeIds(state) as string[]);

    if (selectedGateIds.length === 0 && selectedSegIds.size === 0 && selectedNodeIds.size === 0) return;

    // Compute center of selected items
    const points: Vec2[] = [];
    for (const gid of selectedGateIds) {
      const g = state.circuit.gates.get(gid);
      if (g) points.push(gateCenter(g));
    }
    for (const nid of selectedNodeIds) {
      const n = state.circuit.wireNodes.get(nid as WireNodeId);
      if (n) points.push(n.pos);
    }
    const center = points.length > 0 ? Vec2.avg(points) : { x: 0, y: 0 };

    // Build gate index map
    const gateIdxMap = new Map<string, number>();
    const gates: ClipboardGate[] = [];
    for (const gid of selectedGateIds) {
      const g = state.circuit.gates.get(gid);
      if (!g) continue;
      gateIdxMap.set(gid as string, gates.length);
      const c = gateCenter(g);
      const allPids = getAllPinIds(g);
      const pinBitWidths = allPids.map(pid => getPin(state.circuit, pid).bitWidth);
      const pinValues = allPids.map(pid => getPin(state.circuit, pid).value);
      gates.push({ type: g.type, delta: Vec2.sub(c, center), rotation: g.rotation, pinBitWidths, pinValues });
    }

    // Collect relevant wire nodes (anchored to selected gates or explicitly selected free nodes)
    // Also collect nodes referenced by selected wire segments
    const relevantNodeIds = new Set<string>(selectedNodeIds);
    for (const node of state.circuit.wireNodes.values()) {
      if (node.pinId) {
        const pin = getPin(state.circuit, node.pinId);
        if (gateIdxMap.has(pin.gateId as string)) {
          relevantNodeIds.add(node.id as string);
        }
      }
    }
    for (const seg of state.circuit.wireSegments.values()) {
      if (selectedSegIds.has(seg.id as string)) {
        relevantNodeIds.add(seg.from as string);
        relevantNodeIds.add(seg.to as string);
      }
    }

    // Build node index map
    const nodeIdxMap = new Map<string, number>();
    const nodes: ClipboardNode[] = [];
    for (const nid of relevantNodeIds) {
      const n = getWireNode(state.circuit, nid as WireNodeId);
      nodeIdxMap.set(nid, nodes.length);
      let gateIdx: number | undefined;
      let pinIdx: number | undefined;
      if (n.pinId) {
        const pin = getPin(state.circuit, n.pinId);
        if (gateIdxMap.has(pin.gateId as string)) {
          gateIdx = gateIdxMap.get(pin.gateId as string);
          const gate = getGate(state.circuit, pin.gateId);
          const allPins = getAllPinIds(gate);
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
        if (selectedSegIds.has(seg.id as string) || (relevantNodeIds.has(seg.from as string) && relevantNodeIds.has(seg.to as string))) {
          wires.push({ fromNodeIdx: fromIdx, toNodeIdx: toIdx, color: seg.color, label: seg.label });
        }
      }
    }

    state.clipboard = { gates, nodes, wires };
  }

  private pasteClipboard(state: EditorState, pos: Vec2): void {
    const clip = state.clipboard;
    if (!clip) return;

    const center = Vec2.snap(pos);
    this.getHistory().beginBatch('Paste');

    // Create gates and collect new pin IDs
    const newGateIds: GateId[] = [];
    const newAllPinIds: PinId[][] = []; // per gate, all pin IDs in order
    for (const cg of clip.gates) {
      const def = GATE_DEFS[cg.type];
      const gw = def.width * GRID_SIZE;
      const gh = def.height * GRID_SIZE;
      const offset = gateGridOffset(cg.rotation, gw, gh);
      const gatePos = Vec2.snap({ x: center.x + cg.delta.x - gw / 2, y: center.y + cg.delta.y - gh / 2 }, offset);
      const cmd = new AddGateCommand(state, cg.type, gatePos, cg.rotation, cg.pinBitWidths[0] ?? 1);
      this.getHistory().execute(cmd);
      newGateIds.push(cmd.getGateId());

      // Collect pin IDs and restore properties
      const gate = getGate(state.circuit, cmd.getGateId());
      const allPins = getAllPinIds(gate);
      newAllPinIds.push(allPins);
      for (let p = 0; p < allPins.length; p++) {
        const pin = getPin(state.circuit, allPins[p]);
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
      this.getHistory().execute(cmd);
      newNodeIds.push(cmd.getNodeId());
    }

    // Create wire segments
    for (const cw of clip.wires) {
      const fromId = newNodeIds[cw.fromNodeIdx];
      const toId = newNodeIds[cw.toNodeIdx];
      if (fromId && toId) {
        const cmd = new AddWireSegmentCommand(state, fromId, toId, cw.color);
        this.getHistory().execute(cmd);
        // Apply label
        if (cw.label) {
          getWireSegment(state.circuit, cmd.getSegmentId()).label = cw.label;
        }
      }
    }

    this.getHistory().endBatch();
    state.renderDirty = true;
  }
}
