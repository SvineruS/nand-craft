import type { GateId, PinId, WireNodeId, WireSegmentId } from '../types.ts';
import type { ClipboardGate, ClipboardNode, ClipboardWire, EditorState, PlaceableType } from './EditorState.ts';
import { WIRE_COLORS } from './EditorState.ts';
import type { Renderer } from './Renderer.ts';
import { rotateBy, type WireEndpoint } from './utils/geometry.ts';
import {
  findNodeForPin,
  gateCenter,
  gateGridOffset,
  getAllPinIds,
  getAnchoredNodeIds,
  GRID_SIZE,
} from './utils/geometry.ts';
import { Vec2 } from './utils/vec2.ts';
import { getGateDefinition } from '../levels/gates.ts';
import {
  AddGateCommand,
  AddWireNodeCommand,
  AddWireSegmentCommand,
  ChangePinCommand,
  ChangeWireCommand,
  CommandHistory,
  MoveGatesCommand,
  MoveWireNodeCommand,
  RemoveGateCommand,
  RemoveWireNodeCommand,
  RemoveWireSegmentCommand,
  RotateGatesCommand,
} from './CommandHistory.ts';
import {
  hitTestEndpoint,
  hitTestGate,
  hitTestWireSegment,
  normalizeRect,
  posInRect,
  rectContainsGate,
  snapGateCenter
} from "./utils/hitTests.ts";

// Interaction thresholds (pixels in world space)

const MIN_WIRE_DRAG = 5;     // minimum drag to create wire (prevents accidental wires on dblclick)





function getSelectedGateIds(state: EditorState): GateId[] {
  return state.selection
    .filter((s) => s.type === 'gate')
    .map(s => s.id);
}

function getSelectedNodeIds(state: EditorState): WireNodeId[] {
  return state.selection
    .filter((s) => s.type === 'wireNode')
    .map(s => s.id);
}

function getSelectedSegmentIds(state: EditorState): WireSegmentId[] {
  return state.selection
    .filter((s) => s.type === 'wireSegment')
    .map(s => s.id);
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
  private _detachPinId: PinId | undefined;

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
    if (state.mode.kind !== 'stamping') throw new Error('Drag without stamping mode');
    const previewType = state.mode.gateType;
    const def = getGateDefinition(previewType);
    state.dropPreview = { type: previewType, pos: snapGateCenter(world, def.width, def.height) };
    state.renderDirty = true;
  }

  private handleDrop(e: DragEvent): void {
    e.preventDefault();
    if (!e.dataTransfer) return;
    const gateType = e.dataTransfer.getData('text/plain') as PlaceableType;
    const def = getGateDefinition(gateType);
    const state = this.getState();
    const world = this.renderer.screenToWorld({ x: e.offsetX, y: e.offsetY }, state.camera);
    const cmd = new AddGateCommand(state, gateType, snapGateCenter(world, def.width, def.height));
    this.getHistory().execute(cmd);
    state.dropPreview = null;
    state.renderDirty = true;
  }

  private handleDragLeave(_e: DragEvent): void {
    const state = this.getState();
    state.dropPreview = null;
    state.renderDirty = true;
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
      state.mode = { kind: 'normal' };
      state.dropPreview = null;
      state.renderDirty = true;
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
      if (state.circuit.getGate(gateHit).canRemove === false) return;
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
        this.getHistory().beginBatch('Delete connected wires');
        for (const sid of allSegs)
          this.getHistory().execute(new RemoveWireSegmentCommand(state, sid));
        this.getHistory().endBatch();
      } else {
        state.selection = [{ type: 'wireSegment', id: segHit }];
        this.deleteSelected(state);
      }
      return;
    }

    // Empty space → clear selection
    state.selection = [];
    state.renderDirty = true;
  }

  // ---------------------------------------------------------------------------
  // Mouse down
  // ---------------------------------------------------------------------------

  private handleMouseDown(e: MouseEvent): void {
    const state = this.getState();
    const world = this.renderer.screenToWorld({ x: e.offsetX, y: e.offsetY }, state.camera);

    if (e.button === 1) {
      this.handleMiddleMouseDown(state, world, e);
      return;
    }
    if (e.button === 0 && e.shiftKey) {
      this.handleShiftMouseDown(state, world, e);
      return;
    }
    if (e.button !== 0) return;

    if (state.mode.kind === 'stamping') {
      this.handleStampClick(state, world);
      return;
    }
    if (state.mode.kind === 'pasting' && state.clipboard) {
      this.handlePasteClick(state, world);
      return;
    }

    const isDblClick = e.detail >= 2;

    const ep = hitTestEndpoint(world, state);
    if (ep) {
      this.handleEndpointMouseDown(state, world, ep, isDblClick);
      return;
    }

    const gateHit = hitTestGate(world, state);
    if (gateHit) {
      this.handleGateMouseDown(state, world, gateHit, isDblClick, e);
      return;
    }

    const segHit = hitTestWireSegment(world, state);
    if (segHit) {
      this.handleWireSegmentMouseDown(state, world, segHit, isDblClick, e);
      return;
    }

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
      if (this.startDetachDrag(state, world, ep)) return;
    }

    // Wire segment → split and drag new node
    const segHit = hitTestWireSegment(world, state);
    if (segHit) {
      this.getHistory().beginBatch('Split wire');
      const newNodeId = this.splitWireSegment(state, segHit, Vec2.snap(world));
      this.getHistory().endBatch();
      this.startNodeDrag(state, newNodeId, world, { fromSplit: true });
      return;
    }

    // Otherwise pan
    state.isDragging = true;
    state.dragStart = { x: e.offsetX, y: e.offsetY };
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

    state.isDragging = true;
    state.dragStart = { x: e.offsetX, y: e.offsetY };
  }

  private handleStampClick(state: EditorState, world: Vec2): void {
    if (state.mode.kind !== 'stamping') return;
    const def = getGateDefinition(state.mode.gateType);
    const cmd = new AddGateCommand(state, state.mode.gateType, snapGateCenter(world, def.width, def.height));
    this.getHistory().execute(cmd);
  }

  private handlePasteClick(state: EditorState, world: Vec2): void {
    this.pasteClipboard(state, world);
  }

  private handleEndpointMouseDown(state: EditorState, world: Vec2, ep: WireEndpoint, isDblClick: boolean): void {
    if (isDblClick) {
      this.startDetachDrag(state, world, ep);
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
    state.mode = { kind: 'wiring', start: ep };
    state.renderDirty = true;
  }

  /** Common setup for all node drag starts. Executes an initial MoveWireNodeCommand. */
  private startNodeDrag(state: EditorState, nodeId: WireNodeId, world: Vec2,
      opts: { detachPinId?: PinId; fromSplit?: boolean } = {}): void {
    this.isDraggingNode = nodeId;
    this._detachPinId = opts.detachPinId;
    this.nodeFromSplit = opts.fromSplit ?? false;
    this.lastWorld = Vec2.copy(world);
    const node = state.circuit.getWireNode(nodeId);
    this.getHistory().execute(new MoveWireNodeCommand(state, nodeId, node.pos, opts.detachPinId));
    state.renderDirty = true;
  }

  /** Start dragging a wire node or detach a pin's anchored node and drag it. */
  private startDetachDrag(state: EditorState, world: Vec2, ep: WireEndpoint): boolean {
    if (ep.kind === 'node') {
      this.startNodeDrag(state, ep.nodeId, world);
      state.mode = { kind: 'normal' };
      return true;
    }
    const anchoredNode = this.findAnchoredNode(ep.pinId, state);
    if (!anchoredNode) return false;
    this.startNodeDrag(state, anchoredNode, world, { detachPinId: ep.pinId });
    state.mode = { kind: 'normal' };
    return true;
  }

  private handleGateMouseDown(state: EditorState, world: Vec2, gateHit: GateId, isDblClick: boolean, e: MouseEvent): void {
    // Double-click constant gate → toggle value
    if (isDblClick) {
      const gate = state.circuit.getGate(gateHit);
      if (gate.type === 'constant') {
        const outPinId = gate.outputPins[0];
        if (!outPinId) return;
        const pin = state.circuit.getPin(outPinId);
        const mask = ((1 << pin.bitWidth) >>> 0) - 1;
        let newValue = pin.value === null ? 1 : ((pin.value + 1) & mask) >>> 0;
        if (newValue > mask) newValue = 0;
        this.getHistory().execute(new ChangePinCommand(state, [outPinId], { value: newValue }));
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
        return updatedState.circuit.getGate(s.id as GateId).canMove !== false;
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
      this.getHistory().beginBatch('Split wire');
      const newNodeId = this.splitWireSegment(state, segHit, Vec2.snap(world));
      this.getHistory().endBatch();
      this.startNodeDrag(state, newNodeId, world, { fromSplit: true });
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
      const def = getGateDefinition(state.mode.gateType);
      state.dropPreview = { type: state.mode.gateType, pos: snapGateCenter(world, def.width, def.height) };
      state.hoveredGate = hitTestGate(world, state);
      state.renderDirty = true;
    } else if (state.mode.kind === 'pasting') {
      state.mode = { kind: 'pasting', cursor: Vec2.snap(world) };
      state.renderDirty = true;
    }

    // Pan
    if (state.isDragging && state.dragStart) {
      const dragStart = { x: e.offsetX, y: e.offsetY };
      const d = Vec2.sub(dragStart, state.dragStart);
      state.camera.pos = Vec2.sub(state.camera.pos, Vec2.scale(d, 1 / state.camera.zoom));
      state.dragStart = dragStart;
      state.renderDirty = true;
      return;
    }

    // Wire node dragging (snapped to grid)
    if (this.isDraggingNode) {
      const dragId = this.isDraggingNode;
      const snapped = Vec2.snap(world);
      const node = state.circuit.getWireNode(dragId);
      if (!Vec2.equal(snapped, node.pos)) {
        this.didDragMove = true;
        this.getHistory().undo();
        this.getHistory().execute(new MoveWireNodeCommand(state, dragId, snapped, this._detachPinId));
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
      const delta = Vec2.sub(Vec2.snap(raw), Vec2.snap(this.dragAcc));
      this.dragAcc = raw;
      this.lastWorld = Vec2.copy(world);

      if (delta.x !== 0 || delta.y !== 0) {
        const gateIds = getSelectedGateIds(state);
        const selectedNodeIds = getSelectedNodeIds(state);

        for (const gateId of gateIds) {
          const gate = state.circuit.getGate(gateId);
          if (gate.canMove !== false)
            gate.pos = Vec2.add(gate.pos, delta);
        }
        // When disconnected, anchored nodes were detached — skip them
        const anchored = this.isDraggingDisconnected ? [] : getAnchoredNodeIds(state.circuit, gateIds);
        const allNodeIds = new Set<WireNodeId>([...anchored, ...selectedNodeIds]);
        for (const nid of allNodeIds) {
          const node = state.circuit.getWireNode(nid);
          node.pos = Vec2.add(node.pos, delta);
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

    if (this.isDraggingNode) {
      this.completeNodeDrag(state, e);
      return;
    }
    if (state.mode.kind === 'wiring') {
      this.completeWiring(state, e);
      return;
    }
    if (this.isDraggingGates) {
      this.completeGateDrag(state);
      return;
    }
    if (state.selectionRect) {
      this.completeSelectionRect(state);
      return;
    }

    // Clear pan
    state.isDragging = false;
    state.dragStart = null;
  }

  private completeNodeDrag(state: EditorState, e: MouseEvent): void {
    const world = this.renderer.screenToWorld({ x: e.offsetX, y: e.offsetY }, state.camera);
    const nodeId = this.isDraggingNode!;
    const didMove = this.didDragMove;
    const fromSplit = this.nodeFromSplit;
    const detachPinId = this._detachPinId;
    this.isDraggingNode = null;
    this.didDragMove = false;
    this.nodeFromSplit = false;
    this._detachPinId = undefined;

    // Click without movement on a free 2-segment node → merge it away
    if (!didMove && !fromSplit && !detachPinId) {
      this.getHistory().undo();
      if (this.tryMergeWireNode(state, nodeId)) {
        state.selection = [];
        state.renderDirty = true;
        return;
      }
      this.getHistory().execute(new MoveWireNodeCommand(state, nodeId,
        state.circuit.getWireNode(nodeId).pos));
    }

    const finalPos = Vec2.snap(world);
    const target = hitTestEndpoint(world, state, nodeId);

    if (fromSplit)
      this.finalizeSplitDrag(state, nodeId, finalPos, target, detachPinId);
    else if (target)
      this.finalizeMergeDrag(state, nodeId, target, detachPinId);
    else
      this.finalizeMoveDrag(state, nodeId, finalPos, detachPinId);

    state.selection = [];
    state.renderDirty = true;
  }

  /** Finalize a split-and-drag: undo split+move, replay as single batch. */
  private finalizeSplitDrag(state: EditorState, nodeId: WireNodeId, finalPos: Vec2,
      target: WireEndpoint | null, detachPinId?: PinId): void {
    this.getHistory().undo(); // undo move
    const splitPos = Vec2.copy(state.circuit.getWireNode(nodeId).pos);
    this.getHistory().undo(); // undo split
    const segId = hitTestWireSegment(splitPos, state);
    if (!segId) return;
    this.getHistory().beginBatch('Split and move wire');
    const newNodeId = this.splitWireSegment(state, segId, splitPos);
    if (target)
      this.mergeNodeOnto(state, newNodeId, target, detachPinId);
    else
      this.getHistory().execute(new MoveWireNodeCommand(state, newNodeId, finalPos, detachPinId));
    this.getHistory().endBatch();
  }

  /** Finalize a drag that merges the node onto another endpoint. */
  private finalizeMergeDrag(state: EditorState, nodeId: WireNodeId,
      target: WireEndpoint, detachPinId?: PinId): void {
    const targetNodeId = this.ensureWireNode(state, target);
    if (!targetNodeId || targetNodeId === nodeId) return;
    this.getHistory().undo(); // undo live move
    this.getHistory().beginBatch('Merge wire node');
    this.mergeNodeOnto(state, nodeId, target, detachPinId);
    this.getHistory().endBatch();
  }

  /** Finalize a simple move drag (snap to grid). */
  private finalizeMoveDrag(state: EditorState, nodeId: WireNodeId,
      finalPos: Vec2, detachPinId?: PinId): void {
    const node = state.circuit.getWireNode(nodeId);
    if (!Vec2.equal(finalPos, node.pos)) {
      this.getHistory().undo();
      this.getHistory().execute(new MoveWireNodeCommand(state, nodeId, finalPos, detachPinId));
    }
  }

  /** Merge a node onto a target endpoint: move, repoint segments, delete source. */
  private mergeNodeOnto(state: EditorState, nodeId: WireNodeId,
      target: WireEndpoint, detachPinId?: PinId): void {
    const targetNodeId = this.ensureWireNode(state, target);
    if (!targetNodeId || targetNodeId === nodeId) return;
    const targetNode = state.circuit.getWireNode(targetNodeId);
    this.getHistory().execute(new MoveWireNodeCommand(state, nodeId, targetNode.pos, detachPinId));
    // Repoint segments: remove old, add new (skip self-loops and duplicates)
    const segments = [...state.circuit.wireSegments.values()];
    const seen = new Set<string>();
    for (const seg of segments) {
      if (seg.from !== nodeId && seg.to !== nodeId) continue;
      const newFrom = seg.from === nodeId ? targetNodeId : seg.from;
      const newTo = seg.to === nodeId ? targetNodeId : seg.to;
      this.getHistory().execute(new RemoveWireSegmentCommand(state, seg.id, false));
      if (newFrom === newTo) continue;
      const key = [newFrom, newTo].sort().join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      this.getHistory().execute(new AddWireSegmentCommand(state, newFrom, newTo, seg.color, seg.label));
    }
    this.getHistory().execute(new RemoveWireNodeCommand(state, nodeId));
  }

  private completeWiring(state: EditorState, e: MouseEvent): void {
    if (state.mode.kind !== 'wiring') return;
    const wireStart = state.mode.start;
    const world = this.renderer.screenToWorld({ x: e.offsetX, y: e.offsetY }, state.camera);

    // No drag? Cancel (allows double-click to work)
    const dragDist = Vec2.dist(world, this.wireStartWorld);
    if (dragDist < MIN_WIRE_DRAG) {
      state.mode = { kind: 'normal' };
      state.renderDirty = true;
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
        const fromNode = this.ensureWireNode(state, wireStart);
        if (fromNode) this.addSegmentIfNew(state, fromNode, midId, wireColor);
      } else {
        // Endpoint → empty space: create free node and connect
        const snapPos = Vec2.snap(world);
        const nodeCmd = new AddWireNodeCommand(state, snapPos);
        this.getHistory().execute(nodeCmd);
        const fromNode = this.ensureWireNode(state, wireStart);
        if (fromNode) this.addSegmentIfNew(state, fromNode, nodeCmd.getNodeId(), wireColor);
      }
    }

    state.mode = { kind: 'normal' };
    state.renderDirty = true;
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
          const gate = state.circuit.getGate(gateId);
          gate.pos = Vec2.sub(gate.pos, snapDelta);
        }
        const anchored = isDisconnect ? [] : getAnchoredNodeIds(state.circuit, gateIds);
        const allNodeIds = new Set<WireNodeId>([...anchored, ...selectedNodeIds]);
        for (const nid of allNodeIds) {
          const node = state.circuit.getWireNode(nid);
          node.pos = Vec2.sub(node.pos, snapDelta);
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
    const normRect = normalizeRect(rect.pos, rect.w, rect.h);

    const selected: typeof state.selection = [];

    // Include gates in area selection
    for (const gate of state.circuit.gates.values()) {
      if (rectContainsGate(gate, normRect))
        selected.push({ type: 'gate', id: gate.id });
    }

    // Include free wire nodes in area selection
    for (const node of state.circuit.wireNodes.values()) {
      if (node.pinId) continue; // skip anchored nodes
      if (posInRect(node.pos, normRect))
        selected.push({ type: 'wireNode', id: node.id });
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
      .filter(gid => state.circuit.getGate(gid).canMove !== false);
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

    const segIds = (e.shiftKey || ctrl)
      ? this.getConnectedSegments(state, selectedSegs)
      : selectedSegs;
    this.getHistory().execute(new ChangeWireCommand(state, segIds, { color: colorValue }));
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
        state.mode = { kind: 'pasting', cursor: null };
        state.renderDirty = true;
      }
      return true;
    }
    return false;
  }

  private handleEyedropperKey(state: EditorState, e: KeyboardEvent): boolean {
    if (e.key !== 'q' && e.key !== 'Q') return false;

    if (state.hoveredGate) {
      const gate = state.circuit.getGate(state.hoveredGate);
      state.mode = { kind: 'stamping', gateType: gate.type };
      state.renderDirty = true;
      return true;
    }
    const mw = this.renderer.getMouseWorld();
    const segHit = hitTestWireSegment(mw, state);
    if (segHit) {
      const seg = state.circuit.getWireSegment(segHit);
      state.wireColor = seg.color ?? WIRE_COLORS[0];
      state.renderDirty = true;
      return true;
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
      if ((seg.from === a && seg.to === b) || (seg.from === b && seg.to === a))
        return true;
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
  private splitWireSegment(state: EditorState, segId: WireSegmentId, pos: Vec2): WireNodeId {
    const seg = state.circuit.getWireSegment(segId);
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
    this.getHistory().beginBatch('Delete selection');
    // Wire nodes first (cascades to attached segments)
    for (const nodeId of getSelectedNodeIds(state))
      this.getHistory().execute(new RemoveWireNodeCommand(state, nodeId));
    for (const segId of getSelectedSegmentIds(state))
      this.getHistory().execute(new RemoveWireSegmentCommand(state, segId));
    const gateIds = getSelectedGateIds(state)
      .filter(gid => state.circuit.getGate(gid).canRemove !== false);
    for (const gateId of gateIds)
      this.getHistory().execute(new RemoveGateCommand(state, gateId));
    this.getHistory().endBatch();

    state.selection = [];
    state.renderDirty = true;
  }

  /** Find a wire node anchored to this pin that has connected segments. */
  /** If a free wire node has exactly 2 segments, remove the node and join the segments. Returns true if merged. */
  private tryMergeWireNode(state: EditorState, nodeId: WireNodeId): boolean {
    const node = state.circuit.getWireNode(nodeId);
    if (node.pinId) return false; // only free nodes

    // Find connected segments
    const connected: { segId: WireSegmentId; otherId: WireNodeId }[] = [];
    for (const seg of state.circuit.wireSegments.values()) {
      if (seg.from === nodeId) connected.push({ segId: seg.id, otherId: seg.to });
      else if (seg.to === nodeId) connected.push({ segId: seg.id, otherId: seg.from });
    }

    if (connected.length !== 2) return false;

    // Preserve color and label from the segments
    const seg0 = state.circuit.getWireSegment(connected[0].segId);
    const seg1 = state.circuit.getWireSegment(connected[1].segId);
    const color = seg0.color ?? seg1.color;
    const label = seg0.label ?? seg1.label;

    const otherId0 = connected[0].otherId;
    const otherId1 = connected[1].otherId;

    this.getHistory().beginBatch('Merge wire node');
    this.getHistory().execute(new RemoveWireSegmentCommand(state, connected[0].segId, false));
    this.getHistory().execute(new RemoveWireSegmentCommand(state, connected[1].segId, false));
    this.getHistory().execute(new RemoveWireNodeCommand(state, nodeId));
    this.getHistory().execute(new AddWireSegmentCommand(state, otherId0, otherId1, color, label));
    this.getHistory().endBatch();
    state.renderDirty = true;
    return true;
  }

  /** Start a disconnect drag: select gate, detach pin nodes, begin dragging. */
  private startDisconnectDrag(state: EditorState, gateId: GateId, pos: Vec2): void {
    if (state.circuit.getGate(gateId).canMove === false) return;
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
      for (const p of getAllPinIds(state.circuit.getGate(gateId))) pinIds.add(p as string);
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
      const seg = state.circuit.getWireSegment(segId);
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
      cg.rotation = rotateBy(cg.rotation, 90);
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
      if (selectedSegIds.has(seg.id as string)) {
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
      const def = getGateDefinition(cg.type);
      const gateCenter = Vec2.add(center, cg.delta);
      const offset = gateGridOffset(cg.rotation, def.width * GRID_SIZE, def.height * GRID_SIZE);
      const gatePos = snapGateCenter(gateCenter, def.width, def.height, offset);
      const cmd = new AddGateCommand(state, cg.type, gatePos, cg.rotation, cg.pinBitWidths[0] ?? 1);
      this.getHistory().execute(cmd);
      newGateIds.push(cmd.getGateId());

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
      this.getHistory().execute(cmd);
      newNodeIds.push(cmd.getNodeId());
    }

    // Create wire segments
    for (const cw of clip.wires) {
      const fromId = newNodeIds[cw.fromNodeIdx];
      const toId = newNodeIds[cw.toNodeIdx];
      if (fromId && toId) {
        const cmd = new AddWireSegmentCommand(state, fromId, toId, cw.color, cw.label);
        this.getHistory().execute(cmd);
      }
    }

    this.getHistory().endBatch();
    state.renderDirty = true;
  }
}
