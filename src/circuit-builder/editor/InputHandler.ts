import type { GateId, PinRef, Vec2 as Vec2Type, WireNodeId, WireSegmentId } from './types.ts';
import type { EditorState, PlaceableType } from './EditorState.ts';
import { emptyDragPreview, getSelectedIds } from './EditorState.ts';
import { rotateBy, type WireEndpoint } from './utils/geometry.ts';
import { findNodeForPin, getAnchoredNodeIds } from './utils/geometry.ts';
import { Vec2 } from './utils/vec2.ts';
import { getGateDefinition, getPinBitWidth } from './gates.ts';
import { isConstantGate } from '../simulation/gateTypes.ts';
import {
  AddGateCommand,
  AddWireNodeCommand,
  AddWireSegmentCommand,
  ChangeWireCommand,
  CommandHistory,
  MoveGatesCommand,
  MoveWireNodeCommand,
  RemoveGateCommand,
  RemoveWireNodeCommand,
  RemoveWireSegmentCommand,
  RotateGatesCommand,
} from './commands.ts';
import {
  hitTestEndpoint,
  hitTestGate,
  hitTestWireSegment,
  normalizeRect,
  posInRect,
  rectContainsGate,
  snapGateCenter
} from "./utils/hitTests.ts";
import { clampPasteCenter, copySelection, pasteClipboard } from './clipboard.ts';
import { CanvasInput, type PointerEvent, type DragDropEvent } from '../../engine/input.ts';
import { KeyMap } from '../../engine/keymap.ts';
import { GRID_SIZE, WIRE_COLORS } from "./consts.ts";
import {
  clampCamera, clampGatePos, clampGroupOffset, clampPoint, type MapRect,
} from './utils/mapBounds.ts';
import { getGateDims } from './utils/geometry.ts';

const MIN_WIRE_DRAG = 5;




// ---------------------------------------------------------------------------
// InputHandler
// ---------------------------------------------------------------------------

/**
 * In-flight drag. Drags never touch the circuit: each mousemove refreshes
 * EditorState.dragPreview, and mouseup turns the final position into one command.
 */
type DragState =
  | { kind: 'none' }
  | {
      kind: 'gates';
      /** Gates that will actually move — immovable ones are filtered out up front. */
      gateIds: GateId[];
      nodeIds: WireNodeId[];
      /** Shift/middle drag: wires stay behind and the gate's pins detach on commit. */
      disconnected: boolean;
      /** World position where the drag started, for the offset. */
      startWorld: Vec2Type;
    }
  | {
      kind: 'wireNode';
      nodeId: WireNodeId;
      startPos: Vec2Type;
      /**
       * Set once the pointer leaves the node's start cell. A bare click merges the node
       * away, so a drag that happens to end back on the start cell must not look like one.
       */
      dragged: boolean;
      /** Present iff the drag pulls the node off a pin. */
      detachPin?: PinRef;
    }
  | {
      kind: 'splitNode';
      /** Segment the new node will be cut out of, once the drag commits. */
      segmentId: WireSegmentId;
      splitPos: Vec2Type;
    };

export class InputHandler {
  private input: CanvasInput;
  private keys: KeyMap;
  private getState: () => EditorState;
  private getHistory: () => CommandHistory;

  private drag: DragState = { kind: 'none' };
  private wireStartWorld: Vec2 = { x: 0, y: 0 };

  // ---------------------------------------------------------------------------
  // Public interface
  // ---------------------------------------------------------------------------

  constructor(
    canvas: HTMLCanvasElement,
    getState: () => EditorState,
    getHistory: () => CommandHistory,
  ) {
    this.getState = getState;
    this.getHistory = getHistory;

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
      clampCamera: (camera, viewport) => clampCamera(camera, getState().mapSize, viewport),
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
      state.dragPreview = null;
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
    const { gateType } = state.mode;
    state.dropPreview = { type: gateType, pos: placementPos(state, gateType, e.world) };
    state.renderDirty = true;
  }

  private handleDrop(e: DragDropEvent): void {
    if (!e.dataTransfer) return;
    const state = this.getState();
    const gateType = e.dataTransfer.getData('text/plain') as PlaceableType;
    const cmd = new AddGateCommand(state, gateType, placementPos(state, gateType, e.world));
    this.getHistory().execute(cmd);
    trackRecentGate(state, gateType);
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
    // Wire node or pin → start dragging (merge on mouseup if no movement).
    // Checked before gates so a pin sitting on a gate body is still grabbable.
    const ep = hitTestEndpoint(world, state);
    if (ep) {
      if (this.startDetachDrag(state, world, ep)) return;
    }

    // Disconnect drag if over gate
    const gateHit = hitTestGate(world, state);
    if (gateHit) {
      this.startDisconnectDrag(state, gateHit, world);
      return;
    }

    // Wire segment → drag a new node out of it (nothing is split until mouseup)
    const segHit = hitTestWireSegment(world, state);
    if (segHit) {
      this.startSplitDrag(state, segHit, world);
    }
  }

  private handleShiftMouseDown(state: EditorState, world: Vec2): void {
    const ep = hitTestEndpoint(world, state);
    if (ep && ep.kind === 'node') {
      this.startNodeDrag(state, ep.nodeId, world);
      return;
    }

    const gateHit = hitTestGate(world, state);
    if (gateHit) {
      this.startDisconnectDrag(state, gateHit, world);
    }
  }

  private handleStampClick(state: EditorState, world: Vec2): void {
    if (state.mode.kind !== 'stamping') return;
    const { gateType } = state.mode;
    const cmd = new AddGateCommand(state, gateType, placementPos(state, gateType, world));
    this.getHistory().execute(cmd);
    trackRecentGate(state, gateType);
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
      this.startGatesDrag(state, world, false);
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
      if (isConstantGate(gate.type)) {
        const bitWidth = getPinBitWidth(gate.type, 'output', 0);
        const mask = ((1 << bitWidth) >>> 0) - 1;
        gate.value = (((gate.value ?? 0) + 1) & mask) >>> 0;
        state.valueDirty = true;
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
    this.startGatesDrag(state, world, false);
  }

  private handleWireSegmentMouseDown(state: EditorState, world: Vec2, segHit: WireSegmentId, isDblClick: boolean, e: PointerEvent): void {
    if (isDblClick) {
      // Double-click wire → drag a new node out of it
      state.mode = { kind: 'normal' };
      this.startSplitDrag(state, segHit, world);
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
      const snapPos = clampPoint(Vec2.snap(world), state.mapSize);
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
    state.mouseWorld = world;

    // Stamp/paste preview
    if (state.mode.kind === 'stamping') {
      const { gateType } = state.mode;
      state.dropPreview = { type: gateType, pos: placementPos(state, gateType, world) };
      state.hoveredGate = hitTestGate(world, state);
      state.renderDirty = true;
    } else if (state.mode.kind === 'pasting') {
      state.mode = { kind: 'pasting', cursor: clampPasteCenter(state, Vec2.snap(world)) };
      state.renderDirty = true;
    }

    // Wire node dragging — preview only; the circuit is untouched until mouseup
    if (this.drag.kind === 'wireNode') {
      const { nodeId, startPos, detachPin } = this.drag;
      const nodePos = clampPoint(Vec2.snap(world), state.mapSize);
      if (!Vec2.equal(nodePos, startPos)) this.drag.dragged = true;
      state.dragPreview = {
        ...emptyDragPreview(),
        offset: Vec2.sub(nodePos, startPos),
        nodeIds: [nodeId],
        detachedNodeIds: detachPin ? [nodeId] : [],
      };
      state.hoveredEndpoint = hitTestEndpoint(world, state, nodeId);
      state.renderDirty = true;
      return;
    }

    // Dragging a new node out of a segment — also preview only
    if (this.drag.kind === 'splitNode') {
      state.dragPreview = {
        ...emptyDragPreview(),
        split: { segmentId: this.drag.segmentId, pos: clampPoint(Vec2.snap(world), state.mapSize) },
      };
      state.hoveredEndpoint = hitTestEndpoint(world, state);
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
      const { gateIds, nodeIds, disconnected, startWorld } = this.drag;
      const wanted = Vec2.snap(Vec2.sub(world, startWorld));
      state.dragPreview = {
        // The group is held inside the map as one body, so the layout survives the clamp.
        offset: clampGroupOffset(wanted, draggedBounds(state, gateIds, nodeIds), state.mapSize),
        gateIds,
        nodeIds,
        // A disconnect drag leaves the wires where they are, so the anchored nodes
        // must not follow the gate.
        detachedNodeIds: disconnected ? getAnchoredNodeIds(state.circuit, gateIds) : [],
        split: null,
      };
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

    // Hover — endpoints (pins/nodes) take priority over gates so a pin on a
    // gate edge is highlighted as the grabbable thing, not the gate body.
    const hoveredEp = hitTestEndpoint(world, state);
    state.hoveredEndpoint = hoveredEp;
    state.hoveredGate = hoveredEp ? null : hitTestGate(world, state);
    state.renderDirty = true;
  }

  // ---------------------------------------------------------------------------
  // Mouse up (dispatcher + completers)
  // ---------------------------------------------------------------------------

  private handleMouseUp(e: PointerEvent): void {
    const state = this.getState();

    if (this.drag.kind === 'wireNode' || this.drag.kind === 'splitNode') {
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

  /**
   * Commit a node drag (or a drag that pulls a new node out of a segment) as one history
   * entry. Nothing has to be rolled back first: the drag only ever wrote a preview.
   */
  private completeNodeDrag(state: EditorState, e: PointerEvent): void {
    const drag = this.drag;
    if (drag.kind !== 'wireNode' && drag.kind !== 'splitNode') return;
    this.drag = { kind: 'none' };
    state.dragPreview = null;

    const world = e.world;
    const finalPos = Vec2.snap(world);

    if (drag.kind === 'splitNode') {
      const target = hitTestEndpoint(world, state);
      this.getHistory().beginBatch('Split and move wire');
      const newNodeId = this.splitWireSegment(state, drag.segmentId, drag.splitPos);
      if (target) {
        this.mergeNodeOnto(state, newNodeId, target);
      } else if (!Vec2.equal(finalPos, drag.splitPos)) {
        this.getHistory().execute(new MoveWireNodeCommand(state, newNodeId, finalPos));
      }
      this.getHistory().endBatch();
      state.selection = [];
      state.renderDirty = true;
      return;
    }

    const { nodeId, startPos, detachPin, dragged } = drag;
    const target = hitTestEndpoint(world, state, nodeId);
    const moved = !Vec2.equal(finalPos, startPos);

    if (!moved && !detachPin) {
      // Click without movement on a free 2-segment node → merge it away. A drag that came
      // back to the start cell is a cancelled move, not a click, so it must not merge.
      if (!dragged && this.tryMergeWireNode(state, nodeId)) {
        state.selection = [];
        state.renderDirty = true;
        return;
      }
      // Pure click on a pinned/multi-segment node, or a move back to the start: no-op
    } else if (target) {
      this.getHistory().beginBatch('Merge wire node');
      this.mergeNodeOnto(state, nodeId, target, detachPin);
      this.getHistory().endBatch();
    } else {
      this.getHistory().execute(new MoveWireNodeCommand(state, nodeId, finalPos, detachPin));
    }

    state.selection = [];
    state.renderDirty = true;
  }

  /** Merge a node onto a target endpoint: move, repoint segments, delete source. */
  private mergeNodeOnto(state: EditorState, nodeId: WireNodeId,
      target: WireEndpoint, detachPin?: PinRef): void {
    const targetNodeId = this.ensureWireNode(state, target);
    if (!targetNodeId || targetNodeId === nodeId) return;
    const targetNode = state.circuit.getWireNode(targetNodeId);
    this.getHistory().execute(new MoveWireNodeCommand(state, nodeId, targetNode.pos, detachPin));
    // Repoint segments: remove old, add new (skip self-loops and duplicates)
    const segments = [...state.circuit.segmentsOf(nodeId)]
      .map(id => state.circuit.getWireSegment(id));
    const seen = new Set<string>();
    for (const seg of segments) {
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
        const snapPos = clampPoint(Vec2.snap(world), state.mapSize);
        const snappedTarget = hitTestEndpoint(snapPos, state);
        if (snappedTarget) {
          // Snapped position lands on a pin/node — connect to it
          const fromNode = this.ensureWireNode(state, wireStart);
          const toNode = this.ensureWireNode(state, snappedTarget);
          if (fromNode && toNode) this.addSegmentIfNew(state, fromNode, toNode, wireColor);
        } else {
          // Empty space: create free node and connect
          const nodeCmd = new AddWireNodeCommand(state, snapPos);
          this.getHistory().execute(nodeCmd);
          const fromNode = this.ensureWireNode(state, wireStart);
          if (fromNode) this.addSegmentIfNew(state, fromNode, nodeCmd.getNodeId(), wireColor);
        }
      }
    }

    state.mode = { kind: 'normal' };
    state.renderDirty = true;
  }

  private completeGateDrag(state: EditorState): void {
    const drag = this.drag;
    if (drag.kind !== 'gates') return;
    this.drag = { kind: 'none' };

    const offset = state.dragPreview?.offset ?? { x: 0, y: 0 };
    state.dragPreview = null;
    state.renderDirty = true;

    // A disconnect drag is worth recording even at zero offset: it detaches the pins.
    const moved = offset.x !== 0 || offset.y !== 0;
    if (!moved && !drag.disconnected) return;

    this.getHistory().execute(new MoveGatesCommand(
      state, drag.gateIds, offset, drag.nodeIds, drag.disconnected,
    ));
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
      if (node.pin) continue; // skip anchored nodes
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
    const segHit = hitTestWireSegment(state.mouseWorld, state);
    if (segHit) {
      const seg = state.circuit.getWireSegment(segHit);
      state.wireColor = seg.color ?? WIRE_COLORS[0];
      state.renderDirty = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Drag start helpers
  // ---------------------------------------------------------------------------

  /**
   * Begin dragging an existing wire node. Nothing is mutated — startNodeDrag only records
   * what is being dragged, and each mousemove refreshes the visual preview.
   */
  private startNodeDrag(state: EditorState, nodeId: WireNodeId, _world: Vec2,
      opts: { detachPin?: PinRef } = {}): void {
    this.drag = {
      kind: 'wireNode',
      nodeId,
      startPos: Vec2.copy(state.circuit.getWireNode(nodeId).pos),
      dragged: false,
      detachPin: opts.detachPin,
    };
    state.dragPreview = { ...emptyDragPreview(), nodeIds: [nodeId] };
    state.renderDirty = true;
  }

  /** Begin dragging a new node out of a segment. The split happens on mouseup. */
  private startSplitDrag(state: EditorState, segmentId: WireSegmentId, world: Vec2): void {
    const splitPos = Vec2.snap(world);
    this.drag = { kind: 'splitNode', segmentId, splitPos };
    state.dragPreview = { ...emptyDragPreview(), split: { segmentId, pos: splitPos } };
    state.renderDirty = true;
  }

  /**
   * Begin dragging the current selection. Immovable gates are filtered out here so the
   * preview, the commit, and the "is anything actually draggable" test all agree.
   */
  private startGatesDrag(state: EditorState, world: Vec2, disconnected: boolean): void {
    const gateIds = getSelectedIds(state, 'gate')
      .filter(id => state.circuit.getGate(id).canMove !== false);
    const nodeIds = getSelectedIds(state, 'wireNode');
    if (gateIds.length === 0 && nodeIds.length === 0) return;

    this.drag = { kind: 'gates', gateIds, nodeIds, disconnected, startWorld: Vec2.copy(world) };
    state.dragPreview = { ...emptyDragPreview(), gateIds, nodeIds };
    state.renderDirty = true;
  }

  /** Start dragging a wire node or detach a pin's anchored node and drag it. */
  private startDetachDrag(state: EditorState, world: Vec2, ep: WireEndpoint): boolean {
    if (ep.kind === 'node') {
      this.startNodeDrag(state, ep.nodeId, world);
      state.mode = { kind: 'normal' };
      return true;
    }
    const anchoredNode = this.findAnchoredNode(ep.pin, state);
    if (!anchoredNode) return false;
    this.startNodeDrag(state, anchoredNode, world, { detachPin: ep.pin });
    state.mode = { kind: 'normal' };
    return true;
  }

  /** Start a disconnect drag: select the gate, then drag it away leaving its wires. */
  private startDisconnectDrag(state: EditorState, gateId: GateId, pos: Vec2): void {
    if (state.circuit.getGate(gateId).canMove === false) return;
    state.selection = [{ type: 'gate', id: gateId }];
    this.startGatesDrag(state, pos, true);
  }

  /** The node on this pin, but only if a wire actually reaches it. */
  private findAnchoredNode(pin: PinRef, state: EditorState): WireNodeId | null {
    const nodeId = state.circuit.findNodeForPin(pin);
    if (nodeId === null) return null;
    return state.circuit.degreeOf(nodeId) > 0 ? nodeId : null;
  }

  // ---------------------------------------------------------------------------
  // Wire helpers
  // ---------------------------------------------------------------------------

  /** Ensure the endpoint has a wire node, returning its ID. Creates one for pins if needed. */
  private ensureWireNode(state: EditorState, ep: WireEndpoint): WireNodeId | null {
    if (ep.kind === 'node') return ep.nodeId;
    // Pin: find existing or create
    const existing = findNodeForPin(state.circuit, ep.pin);
    if (existing) return existing;

    const cmd = new AddWireNodeCommand(state, ep.pos, ep.pin);
    this.getHistory().execute(cmd);
    return cmd.getNodeId();
  }

  /** Check if a segment already exists between two nodes (either direction). */
  private segmentExists(state: EditorState, a: WireNodeId, b: WireNodeId): boolean {
    for (const segId of state.circuit.segmentsOf(a)) {
      const seg = state.circuit.getWireSegment(segId);
      if (seg.from === b || seg.to === b) return true;
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
    if (node.pin) return false; // only free nodes

    // Find connected segments
    if (state.circuit.degreeOf(nodeId) !== 2) return false;
    const connected: { segId: WireSegmentId; otherId: WireNodeId }[] = [];
    for (const segId of state.circuit.segmentsOf(nodeId)) {
      const seg = state.circuit.getWireSegment(segId);
      connected.push({ segId, otherId: seg.from === nodeId ? seg.to : seg.from });
    }

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
    const { circuit } = state;
    const visited = new Set<WireSegmentId>(startSegIds);
    const queue = [...startSegIds];

    while (queue.length > 0) {
      const seg = circuit.getWireSegment(queue.pop()!);
      for (const nodeId of [seg.from, seg.to]) {
        for (const neighborId of circuit.segmentsOf(nodeId)) {
          if (visited.has(neighborId)) continue;
          visited.add(neighborId);
          queue.push(neighborId);
        }
      }
    }

    return [...visited];
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

/** Where a gate of this type lands if placed at `world`: snapped, then held inside the map. */
function placementPos(state: EditorState, gateType: PlaceableType, world: Vec2): Vec2 {
  const def = getGateDefinition(gateType);
  const snapped = snapGateCenter(world, def.width, def.height);
  const dims = { w: def.width * GRID_SIZE, h: def.height * GRID_SIZE };
  return clampGatePos(snapped, dims, state.mapSize);
}

/** World bounds of everything a gate drag carries, used to clamp the drag offset. */
function draggedBounds(
  state: EditorState,
  gateIds: readonly GateId[],
  nodeIds: readonly WireNodeId[],
): MapRect {
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  const grow = (x1: number, y1: number, x2: number, y2: number) => {
    bounds.left = Math.min(bounds.left, x1);
    bounds.top = Math.min(bounds.top, y1);
    bounds.right = Math.max(bounds.right, x2);
    bounds.bottom = Math.max(bounds.bottom, y2);
  };

  for (const id of gateIds) {
    const gate = state.circuit.getGate(id);
    const { w, h } = getGateDims(gate);
    grow(gate.pos.x, gate.pos.y, gate.pos.x + w, gate.pos.y + h);
  }
  for (const id of nodeIds) {
    const node = state.circuit.wireNodes.get(id);
    if (node) grow(node.pos.x, node.pos.y, node.pos.x, node.pos.y);
  }
  return bounds;
}

const MAX_RECENT = 10;

function trackRecentGate(state: EditorState, type: PlaceableType): void {
  const recent = state.recentGateTypes.filter(t => t !== type);
  recent.unshift(type);
  if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;
  state.recentGateTypes = recent;
}
