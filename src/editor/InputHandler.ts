import type { GateId, PinId, WireNodeId, WireSegmentId } from './types.ts';
import type { EditorState, PlaceableType } from './EditorState.ts';
import { WIRE_COLORS, getSelectedIds } from './EditorState.ts';
import type { Renderer } from './Renderer.ts';
import { rotateBy, type WireEndpoint } from './utils/geometry.ts';
import {
  findNodeForPin,
  getAllPinIds,
  getAnchoredNodeIds,
} from './utils/geometry.ts';
import { Vec2 } from './utils/vec2.ts';
import { getGateDefinition } from './gates.ts';
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
import { copySelection, pasteClipboard } from './clipboard.ts';
import { CanvasInput, type PointerEvent, type DragDropEvent } from '../engine/input.ts';
import { KeyMap } from '../engine/keymap.ts';

const MIN_WIRE_DRAG = 5;




// ---------------------------------------------------------------------------
// InputHandler
// ---------------------------------------------------------------------------

type DragState =
  | { kind: 'none' }
  | { kind: 'gates'; disconnected: boolean; detachedPins: { nodeId: WireNodeId; pinId: PinId }[] }
  | { kind: 'wireNode'; nodeId: WireNodeId; fromSplit: boolean; detachPinId?: PinId; moved: boolean };

export class InputHandler {
  private input: CanvasInput;
  private keys: KeyMap;
  private getState: () => EditorState;
  private getHistory: () => CommandHistory;
  private renderer: Renderer;

  private dragAcc: Vec2 = { x: 0, y: 0 };
  private drag: DragState = { kind: 'none' };
  private wireStartWorld: Vec2 = { x: 0, y: 0 };
  private lastWorld: Vec2 = { x: 0, y: 0 };

  // ---------------------------------------------------------------------------
  // Public interface
  // ---------------------------------------------------------------------------

  constructor(
    canvas: HTMLCanvasElement,
    getState: () => EditorState,
    getHistory: () => CommandHistory,
    renderer: Renderer,
  ) {
    this.getState = getState;
    this.getHistory = getHistory;
    this.renderer = renderer;

    this.keys = new KeyMap();
    this.setupKeyBindings();

    this.input = new CanvasInput(canvas, {
      onPointerDown: (e) => this.handleMouseDown(e),
      onPointerMove: (e) => this.handleMouseMove(e),
      onPointerUp: (e) => this.handleMouseUp(e),
      onKeyDown: (e) => this.keys.handle(e),
      onContextMenu: (e) => this.handleContextMenu(e),
      onDragOver: (e) => this.handleDragOver(e),
      onDrop: (e) => this.handleDrop(e),
      onDragLeave: (e) => this.handleDragLeave(e),
    }, {
      getCamera: () => getState().camera,
      shouldPan: (e) => {
        if (e.button === 1) {
          const state = getState();
          return !hitTestGate(e.world, state) && !hitTestEndpoint(e.world, state) && !hitTestWireSegment(e.world, state);
        }
        return false;
      },
      onCameraChange: () => { getState().renderDirty = true; },
    });
  }

  attach(): void { this.input.attach(); }
  detach(): void { this.input.detach(); }

  // ---------------------------------------------------------------------------
  // Keyboard setup
  // ---------------------------------------------------------------------------

  private setupKeyBindings(): void {
    this.keys.on('ctrl+z', () => {
      this.getHistory().undo();
      this.getState().renderDirty = true;
    });
    this.keys.on('ctrl+shift+z', () => {
      this.getHistory().redo();
      this.getState().renderDirty = true;
    });
    this.keys.on('ctrl+y', () => {
      this.getHistory().redo();
      this.getState().renderDirty = true;
    });
    this.keys.on('delete', () => this.deleteSelected(this.getState()));
    this.keys.on('backspace', () => this.deleteSelected(this.getState()));
    this.keys.on('r', () => this.handleRotate());
    this.keys.on('e', () => this.applyWireColor(false));
    this.keys.on('shift+e', () => this.applyWireColor(true));
    this.keys.on('ctrl+e', () => this.applyWireColor(true));
    this.keys.on('ctrl+c', () => copySelection(this.getState()));
    this.keys.on('ctrl+x', () => {
      const state = this.getState();
      copySelection(state);
      this.deleteSelected(state);
    });
    this.keys.on('ctrl+v', () => {
      const state = this.getState();
      if (state.clipboard) {
        state.mode = { kind: 'pasting', cursor: null };
        state.renderDirty = true;
      }
    });
    this.keys.on('q', () => this.eyedrop());
    this.keys.on('escape', () => {
      this.drag = { kind: 'none' };
      const state = this.getState();
      state.selection = [];
      state.mode = { kind: 'normal' };
      state.selectionRect = null;
      state.dropPreview = null;
      state.renderDirty = true;
    });
  }

  // ---------------------------------------------------------------------------
  // Drag-and-drop from sidebar (gate placement)
  // ---------------------------------------------------------------------------

  private handleDragOver(e: DragDropEvent): void {
    const state = this.getState();
    if (state.mode.kind !== 'stamping') throw new Error('Drag without stamping mode');
    const previewType = state.mode.gateType;
    const def = getGateDefinition(previewType);
    state.dropPreview = { type: previewType, pos: snapGateCenter(e.world, def.width, def.height) };
    state.renderDirty = true;
  }

  private handleDrop(e: DragDropEvent): void {
    if (!e.dataTransfer) return;
    const gateType = e.dataTransfer.getData('text/plain') as PlaceableType;
    const def = getGateDefinition(gateType);
    const state = this.getState();
    const cmd = new AddGateCommand(state, gateType, snapGateCenter(e.world, def.width, def.height));
    this.getHistory().execute(cmd);
    state.dropPreview = null;
    state.renderDirty = true;
  }

  private handleDragLeave(_e: DragDropEvent): void {
    const state = this.getState();
    state.dropPreview = null;
    state.renderDirty = true;
  }

  // ---------------------------------------------------------------------------
  // Right-click — select + delete element under cursor, or clear selection
  // ---------------------------------------------------------------------------

  private handleContextMenu(e: PointerEvent): void {
    const state = this.getState();
    const world = e.world;

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
      if (e.shift) {
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
  // Mouse down (dispatcher + sub-handlers)
  // ---------------------------------------------------------------------------

  private handleMouseDown(e: PointerEvent): void {
    const state = this.getState();
    const world = e.world;

    if (e.button === 1) {
      this.handleMiddleMouseDown(state, world);
      return;
    }
    if (e.button === 0 && e.shift) {
      this.handleShiftMouseDown(state, world);
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

    const isDblClick = e.raw.detail >= 2;

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

  private handleMiddleMouseDown(state: EditorState, world: Vec2): void {
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
    }
  }

  private handleShiftMouseDown(state: EditorState, world: Vec2): void {
    const ep = hitTestEndpoint(world, state);
    if (ep && ep.kind === 'node') {
      this.drag = { kind: 'wireNode', nodeId: ep.nodeId, fromSplit: false, moved: false };
      this.lastWorld = Vec2.copy(world);
      this.dragAcc = { x: 0, y: 0 };
      state.renderDirty = true;
      return;
    }

    const gateHit = hitTestGate(world, state);
    if (gateHit) {
      this.startDisconnectDrag(state, gateHit, world);
    }
  }

  private handleStampClick(state: EditorState, world: Vec2): void {
    if (state.mode.kind !== 'stamping') return;
    const def = getGateDefinition(state.mode.gateType);
    const cmd = new AddGateCommand(state, state.mode.gateType, snapGateCenter(world, def.width, def.height));
    this.getHistory().execute(cmd);
  }

  private handlePasteClick(state: EditorState, world: Vec2): void {
    pasteClipboard(state, world, this.getHistory());
  }

  private handleEndpointMouseDown(state: EditorState, world: Vec2, ep: WireEndpoint, isDblClick: boolean): void {
    if (isDblClick) {
      this.startDetachDrag(state, world, ep);
      return;
    }

    // Single click: if node is already selected (area select), start dragging selection
    if (ep.kind === 'node' && state.selection.some(s => s.type === 'wireNode' && s.id === ep.nodeId)) {
      this.drag = { kind: 'gates', disconnected: false, detachedPins: [] };
      this.dragAcc = { x: 0, y: 0 };
      this.lastWorld = Vec2.copy(world);
      return;
    }

    // Single click → start wiring
    this.wireStartWorld = Vec2.copy(world);
    state.mode = { kind: 'wiring', start: ep };
    state.renderDirty = true;
  }

  private handleGateMouseDown(state: EditorState, world: Vec2, gateHit: GateId, isDblClick: boolean, e: PointerEvent): void {
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
    if (e.ctrl) {
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
      this.drag = { kind: 'gates', disconnected: false, detachedPins: [] };
      this.dragAcc = { x: 0, y: 0 };
      this.lastWorld = Vec2.copy(world);
    }
  }

  private handleWireSegmentMouseDown(state: EditorState, world: Vec2, segHit: WireSegmentId, isDblClick: boolean, e: PointerEvent): void {
    if (isDblClick) {
      // Double-click wire → split and start dragging new node
      state.mode = { kind: 'normal' };
      this.getHistory().beginBatch('Split wire');
      const newNodeId = this.splitWireSegment(state, segHit, Vec2.snap(world));
      this.getHistory().endBatch();
      this.startNodeDrag(state, newNodeId, world, { fromSplit: true });
      return;
    }
    if (e.ctrl) {
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

  private handleEmptyMouseDown(state: EditorState, world: Vec2, isDblClick: boolean, e: PointerEvent): void {
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
    if (!e.ctrl) {
      state.selection = [];
    }
    state.selectionRect = { pos: Vec2.copy(world), w: 0, h: 0 };
  }

  // ---------------------------------------------------------------------------
  // Mouse move
  // ---------------------------------------------------------------------------

  private handleMouseMove(e: PointerEvent): void {
    const state = this.getState();
    const world = e.world;
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

    // Wire node dragging (snapped to grid)
    if (this.drag.kind === 'wireNode') {
      const { nodeId: dragId, detachPinId } = this.drag;
      const snapped = Vec2.snap(world);
      const node = state.circuit.getWireNode(dragId);
      if (!Vec2.equal(snapped, node.pos)) {
        this.drag.moved = true;
        this.getHistory().undo();
        this.getHistory().execute(new MoveWireNodeCommand(state, dragId, snapped, detachPinId));
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
    if (this.drag.kind === 'gates') {
      // Compute snapped delta from drag start
      const raw = Vec2.add(Vec2.sub(world, this.lastWorld), this.dragAcc);
      const delta = Vec2.sub(Vec2.snap(raw), Vec2.snap(this.dragAcc));
      this.dragAcc = raw;
      this.lastWorld = Vec2.copy(world);

      if (delta.x !== 0 || delta.y !== 0) {
        const gateIds = getSelectedIds(state, 'gate');
        const selectedNodeIds = getSelectedIds(state, 'wireNode');

        for (const gateId of gateIds) {
          const gate = state.circuit.getGate(gateId);
          if (gate.canMove !== false)
            gate.pos = Vec2.add(gate.pos, delta);
        }
        // When disconnected, anchored nodes were detached — skip them
        const anchored = this.drag.disconnected ? [] : getAnchoredNodeIds(state.circuit, gateIds);
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
    if (state.selectionRect) {
      state.selectionRect.w = world.x - state.selectionRect.pos.x;
      state.selectionRect.h = world.y - state.selectionRect.pos.y;
      state.renderDirty = true;
      return;
    }

    // Hover
    state.hoveredEndpoint = hitTestEndpoint(world, state);
    state.hoveredGate = hitTestGate(world, state);
    state.renderDirty = true;
  }

  // ---------------------------------------------------------------------------
  // Mouse up (dispatcher + completers)
  // ---------------------------------------------------------------------------

  private handleMouseUp(e: PointerEvent): void {
    const state = this.getState();

    if (this.drag.kind === 'wireNode') {
      this.completeNodeDrag(state, e);
      return;
    }
    if (state.mode.kind === 'wiring') {
      this.completeWiring(state, e);
      return;
    }
    if (this.drag.kind === 'gates') {
      this.completeGateDrag(state);
      return;
    }
    if (state.selectionRect) {
      this.completeSelectionRect(state);
    }
  }

  private completeNodeDrag(state: EditorState, e: PointerEvent): void {
    if (this.drag.kind !== 'wireNode') return;
    const world = e.world;
    const { nodeId, moved: didMove, fromSplit, detachPinId } = this.drag;
    this.drag = { kind: 'none' };

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

  private completeWiring(state: EditorState, e: PointerEvent): void {
    if (state.mode.kind !== 'wiring') return;
    const wireStart = state.mode.start;
    const world = e.world;

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
    if (this.drag.kind !== 'gates') return;
    const { disconnected: isDisconnect, detachedPins } = this.drag;
    this.drag = { kind: 'none' };
    const snapDelta = Vec2.snap(this.dragAcc);

    const gateIds = getSelectedIds(state, 'gate');
    const selectedNodeIds = getSelectedIds(state, 'wireNode');

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
        cmd.saveDetachedPins(detachedPins);
      }
      this.getHistory().execute(cmd);
    }

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
  // Keyboard actions
  // ---------------------------------------------------------------------------

  private handleRotate(): void {
    const state = this.getState();
    if (state.mode.kind === 'pasting' && state.clipboard) {
      this.rotateClipboard(state);
      return;
    }
    const gateIds = getSelectedIds(state, 'gate')
      .filter(gid => state.circuit.getGate(gid).canMove !== false);
    const nodeIds = getSelectedIds(state, 'wireNode');
    if (gateIds.length > 0 || nodeIds.length > 0) {
      this.getHistory().execute(new RotateGatesCommand(state, gateIds, nodeIds));
    }
  }

  private applyWireColor(connected: boolean): void {
    const state = this.getState();
    const selectedSegs = state.selection
      .filter((s): s is { type: 'wireSegment'; id: WireSegmentId } => s.type === 'wireSegment')
      .map((s) => s.id);
    if (selectedSegs.length === 0) return;

    const color = state.wireColor;
    const colorValue = color === WIRE_COLORS[0] ? undefined : color;
    const segIds = connected ? this.getConnectedSegments(state, selectedSegs) : selectedSegs;
    this.getHistory().execute(new ChangeWireCommand(state, segIds, { color: colorValue }));
  }

  private eyedrop(): void {
    const state = this.getState();
    if (state.hoveredGate) {
      const gate = state.circuit.getGate(state.hoveredGate);
      state.mode = { kind: 'stamping', gateType: gate.type };
      state.renderDirty = true;
      return;
    }
    const mw = this.renderer.getMouseWorld();
    const segHit = hitTestWireSegment(mw, state);
    if (segHit) {
      const seg = state.circuit.getWireSegment(segHit);
      state.wireColor = seg.color ?? WIRE_COLORS[0];
      state.renderDirty = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Drag start helpers
  // ---------------------------------------------------------------------------

  /** Common setup for all node drag starts. Executes an initial MoveWireNodeCommand. */
  private startNodeDrag(state: EditorState, nodeId: WireNodeId, world: Vec2,
      opts: { detachPinId?: PinId; fromSplit?: boolean } = {}): void {
    this.drag = { kind: 'wireNode', nodeId, fromSplit: opts.fromSplit ?? false, detachPinId: opts.detachPinId, moved: false };
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

  /** Start a disconnect drag: select gate, detach pin nodes, begin dragging. */
  private startDisconnectDrag(state: EditorState, gateId: GateId, pos: Vec2): void {
    if (state.circuit.getGate(gateId).canMove === false) return;
    state.selection = [{ type: 'gate', id: gateId }];
    // Detach pins for visual feedback; save mappings for command undo
    const detachedPins = this.detachPinNodes(state, [gateId]);
    this.drag = { kind: 'gates', disconnected: true, detachedPins };
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

  // ---------------------------------------------------------------------------
  // Wire helpers
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
  // Other helpers
  // ---------------------------------------------------------------------------

  /** Delete all selected gates and wire segments. */
  private deleteSelected(state: EditorState): void {
    this.getHistory().beginBatch('Delete selection');
    // Wire nodes first (cascades to attached segments)
    for (const nodeId of getSelectedIds(state, 'wireNode'))
      this.getHistory().execute(new RemoveWireNodeCommand(state, nodeId));
    for (const segId of getSelectedIds(state, 'wireSegment'))
      this.getHistory().execute(new RemoveWireSegmentCommand(state, segId));
    const gateIds = getSelectedIds(state, 'gate')
      .filter(gid => state.circuit.getGate(gid).canRemove !== false);
    for (const gateId of gateIds)
      this.getHistory().execute(new RemoveGateCommand(state, gateId));
    this.getHistory().endBatch();

    state.selection = [];
    state.renderDirty = true;
  }

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

}
