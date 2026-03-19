import type { GateId, PinId, WireNodeId, WireSegmentId, Gate } from '../types.ts';
import type { EditorState, PlaceableType, ClipboardGate, ClipboardNode, ClipboardWire } from './EditorState.ts';
import { WIRE_COLORS } from './EditorState.ts';
import type { Renderer } from './Renderer.ts';
import type { WireEndpoint } from './geometry.ts';
import { GRID_SIZE, GATE_DEFS, getGateDims, getPinPositions, snapToGrid, findNodeForPin, getAnchoredNodeIds } from './geometry.ts';
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
// Hit testing
// ---------------------------------------------------------------------------

function hitTestGate(wx: number, wy: number, state: EditorState): GateId | null {
  for (const gate of state.circuit.gates.values()) {
    const { w, h } = getGateDims(gate);
    if (wx >= gate.x && wx <= gate.x + w && wy >= gate.y && wy <= gate.y + h) {
      return gate.id;
    }
  }
  return null;
}

/** Unified hit test — finds the closest pin or free wire node within radius. */
function hitTestEndpoint(wx: number, wy: number, state: EditorState, excludeNode?: WireNodeId): WireEndpoint | null {
  let best: WireEndpoint | null = null;
  let bestDist = HIT_RADIUS;

  // Check free wire nodes
  for (const node of state.circuit.wireNodes.values()) {
    if (node.pinId) continue; // anchored nodes are hit via their pin
    if (excludeNode && node.id === excludeNode) continue;
    const dist = Math.hypot(wx - node.x, wy - node.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = { kind: 'node', nodeId: node.id, x: node.x, y: node.y };
    }
  }

  // Check pins (computed positions)
  for (const gate of state.circuit.gates.values()) {
    const positions = getPinPositions(gate);
    for (const [pinId, pos] of positions) {
      const dist = Math.hypot(wx - pos.x, wy - pos.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = { kind: 'pin', pinId, x: pos.x, y: pos.y };
      }
    }
  }

  return best;
}

function hitTestWireSegment(wx: number, wy: number, state: EditorState): WireSegmentId | null {
  let closest: WireSegmentId | null = null;
  let closestDist = WIRE_HIT_DIST;
  for (const seg of state.circuit.wireSegments.values()) {
    const a = state.circuit.wireNodes.get(seg.from);
    const b = state.circuit.wireNodes.get(seg.to);
    if (!a || !b) continue;
    const dist = distToRoutedPath(wx, wy, a.x, a.y, b.x, b.y);
    if (dist < closestDist) {
      closestDist = dist;
      closest = seg.id;
    }
  }
  return closest;
}

function pointToSegmentDist(
  px: number, py: number, ax: number, ay: number, bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Distance from point to routed path (H/V + diagonal). */
function distToRoutedPath(
  px: number, py: number, ax: number, ay: number, bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;

  if (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) {
    return pointToSegmentDist(px, py, ax, ay, bx, by);
  }

  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);

  let midX: number, midY: number;
  if (adx > ady) {
    midX = ax + (adx - ady) * sx;
    midY = ay;
  } else {
    midX = ax;
    midY = ay + (ady - adx) * sy;
  }

  return Math.min(
    pointToSegmentDist(px, py, ax, ay, midX, midY),
    pointToSegmentDist(px, py, midX, midY, bx, by),
  );
}

function rectContainsGate(
  rx: number, ry: number, rw: number, rh: number, gate: Gate,
): boolean {
  const { w, h } = getGateDims(gate);
  const left = rw >= 0 ? rx : rx + rw;
  const top = rh >= 0 ? ry : ry + rh;
  const right = left + Math.abs(rw);
  const bottom = top + Math.abs(rh);
  return gate.x >= left && gate.y >= top && gate.x + w <= right && gate.y + h <= bottom;
}

// ---------------------------------------------------------------------------
// InputHandler
// ---------------------------------------------------------------------------

export class InputHandler {
  private canvas: HTMLCanvasElement;
  private getState: () => EditorState;
  private setState: (fn: (s: EditorState) => void) => void;
  private history: CommandHistory;
  private renderer: Renderer;

  private dragAccDx = 0;
  private dragAccDy = 0;
  private isDraggingGates = false;
  private isDraggingDisconnected = false;
  private didDragMove = false;
  private nodeFromSplit = false;
  private isWiring = false;
  private wireStartWorldX = 0;
  private wireStartWorldY = 0;
  private isDraggingNode: WireNodeId | null = null;
  private lastWorldX = 0;
  private lastWorldY = 0;

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
    setState: (fn: (s: EditorState) => void) => void,
    history: CommandHistory,
    renderer: Renderer,
  ) {
    this.canvas = canvas;
    this.getState = getState;
    this.setState = setState;
    this.history = history;
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
    const world = this.renderer.screenToWorld(e.offsetX, e.offsetY, state.camera);
    const previewType = (state.stampGateType ?? 'nand') as PlaceableType;
    const def = GATE_DEFS[previewType];
    const cx = snapToGrid(world.x - def.width * GRID_SIZE / 2);
    const cy = snapToGrid(world.y - def.height * GRID_SIZE / 2);
    this.setState((s) => {
      s.dropPreview = { type: previewType, x: cx, y: cy };
      s.dirty = true;
    });
  }

  private handleDrop(e: DragEvent): void {
    e.preventDefault();
    if (!e.dataTransfer) return;
    const gateType = e.dataTransfer.getData('text/plain') as PlaceableType;
    if (!gateType || !GATE_DEFS[gateType]) return;
    const state = this.getState();
    const world = this.renderer.screenToWorld(e.offsetX, e.offsetY, state.camera);
    const def = GATE_DEFS[gateType];
    const cx = snapToGrid(world.x - def.width * GRID_SIZE / 2);
    const cy = snapToGrid(world.y - def.height * GRID_SIZE / 2);
    const cmd = new AddGateCommand(state, gateType, cx, cy);
    this.history.execute(cmd);
    this.reconnectPinNodes(state, [cmd.getGateId()]);
    this.setState((s) => { s.dropPreview = null; s.dirty = true; });
  }

  private handleDragLeave(_e: DragEvent): void {
    this.setState((s) => { s.dropPreview = null; s.dirty = true; });
  }

  // ---------------------------------------------------------------------------
  // Right-click — select + delete element under cursor, or clear selection
  // ---------------------------------------------------------------------------

  private handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const state = this.getState();
    const world = this.renderer.screenToWorld(e.offsetX, e.offsetY, state.camera);

    // Cancel stamp/paste mode
    if (state.stampGateType || state.pasteMode) {
      this.setState((s) => { s.stampGateType = null; s.pasteMode = false; s.dropPreview = null; s.dirty = true; });
      return;
    }

    // Wire node?
    const ep = hitTestEndpoint(world.x, world.y, state);
    if (ep && ep.kind === 'node') {
      this.history.execute(new RemoveWireNodeCommand(state, ep.nodeId));
      this.setState((s) => { s.dirty = true; });
      return;
    }

    // Gate?
    const gateHit = hitTestGate(world.x, world.y, state);
    if (gateHit) {
      this.setState((s) => { s.selection = [{ type: 'gate', id: gateHit }]; });
      this.deleteSelected(state);
      return;
    }

    // Wire segment?
    const segHit = hitTestWireSegment(world.x, world.y, state);
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
          this.history.execute(new RemoveWireSegmentCommand(state, sid));
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
        this.setState((s) => { s.dirty = true; });
      } else {
        this.setState((s) => { s.selection = [{ type: 'wireSegment', id: segHit }]; });
        this.deleteSelected(state);
      }
      return;
    }

    // Empty space → clear selection
    this.setState((s) => { s.selection = []; s.dirty = true; });
  }

  // ---------------------------------------------------------------------------
  // Mouse down
  // ---------------------------------------------------------------------------

  private handleMouseDown(e: MouseEvent): void {
    const state = this.getState();
    const world = this.renderer.screenToWorld(e.offsetX, e.offsetY, state.camera);

    // Middle click: disconnect drag if over gate, else move wire node/split/pan
    if (e.button === 1) {
      const gateHit = hitTestGate(world.x, world.y, state);
      if (gateHit) {
        this.startDisconnectDrag(state, gateHit, world.x, world.y);
        return;
      }
      // Wire node or pin → start dragging (merge on mouseup if no movement)
      const ep = hitTestEndpoint(world.x, world.y, state);
      if (ep) {
        if (ep.kind === 'node') {
          this.isDraggingNode = ep.nodeId;
          this.lastWorldX = world.x;
          this.lastWorldY = world.y;
          this.dragAccDx = 0;
          this.dragAccDy = 0;
          this.setState((s) => { s.dirty = true; });
          return;
        }
        // Pin: detach anchored wire node and drag it
        const anchoredNode = this.findAnchoredNode(ep.pinId, state);
        if (anchoredNode) {
          const node = state.circuit.wireNodes.get(anchoredNode);
          if (node) {
            // Clear pin value to prevent stale signal display
            const pin = state.circuit.pins.get(ep.pinId);
            if (pin) pin.value = null;
            node.pinId = undefined;
            this.isDraggingNode = anchoredNode;
            this.lastWorldX = world.x;
            this.lastWorldY = world.y;
            this.setState((s) => { s.wireStart = null; s.dirty = true; });
            return;
          }
        }
      }
      // Wire segment → split and drag new node
      const segHit = hitTestWireSegment(world.x, world.y, state);
      if (segHit) {
        const newNodeId = this.splitWireSegment(state, segHit, snapToGrid(world.x), snapToGrid(world.y));
        if (newNodeId) {
          this.isDraggingNode = newNodeId;
          this.nodeFromSplit = true;
          this.lastWorldX = world.x;
          this.lastWorldY = world.y;
        }
        return;
      }
      // Otherwise pan
      this.setState((s) => { s.isDragging = true; s.dragStart = { x: e.offsetX, y: e.offsetY }; });
      return;
    }

    // Shift+left: drag wire node (merge on release) / disconnect drag gate / pan
    if (e.button === 0 && e.shiftKey) {
      const ep = hitTestEndpoint(world.x, world.y, state);
      if (ep && ep.kind === 'node') {
        this.isDraggingNode = ep.nodeId;
        this.lastWorldX = world.x;
        this.lastWorldY = world.y;
        this.dragAccDx = 0;
        this.dragAccDy = 0;
        this.setState((s) => { s.dirty = true; });
        return;
      }

      const gateHit = hitTestGate(world.x, world.y, state);
      if (gateHit) {
        this.startDisconnectDrag(state, gateHit, world.x, world.y);
        return;
      }
      this.setState((s) => { s.isDragging = true; s.dragStart = { x: e.offsetX, y: e.offsetY }; });
      return;
    }

    if (e.button !== 0) return;

    // Stamp mode: place gate on each click
    if (state.stampGateType && !state.pasteMode) {
      const def = GATE_DEFS[state.stampGateType];
      const sx = snapToGrid(world.x - def.width * GRID_SIZE / 2);
      const sy = snapToGrid(world.y - def.height * GRID_SIZE / 2);
      const cmd = new AddGateCommand(state, state.stampGateType, sx, sy);
      this.history.execute(cmd);
      this.reconnectPinNodes(state, [cmd.getGateId()]);
      return;
    }

    // Paste mode: paste clipboard contents on each click
    if (state.pasteMode && state.clipboard) {
      this.pasteClipboard(state, world.x, world.y);
      return;
    }

    const isDblClick = e.detail >= 2;

    // 1) Endpoint hit (pin or free wire node)
    const ep = hitTestEndpoint(world.x, world.y, state);
    if (ep) {
      if (isDblClick) {
        // Double-click → drag
        this.isWiring = false;
        if (ep.kind === 'node') {
          // Drag the free node
          this.isDraggingNode = ep.nodeId;
          this.lastWorldX = world.x;
          this.lastWorldY = world.y;
          this.setState((s) => { s.wireStart = null; s.dirty = true; });
        } else {
          // Pin: detach anchored wire node and drag it
          const anchoredNode = this.findAnchoredNode(ep.pinId, state);
          if (anchoredNode) {
            const node = state.circuit.wireNodes.get(anchoredNode);
            if (node) {
              const pin = state.circuit.pins.get(ep.pinId);
              if (pin) pin.value = null;
              node.pinId = undefined;
              this.isDraggingNode = anchoredNode;
              this.lastWorldX = world.x;
              this.lastWorldY = world.y;
              this.setState((s) => { s.wireStart = null; s.dirty = true; });
            }
          }
        }
        return;
      }

      // Single click: if node is already selected (area select), start dragging selection
      if (ep.kind === 'node' && state.selection.some(s => s.type === 'wireNode' && s.id === ep.nodeId)) {
        this.isDraggingGates = true;
        this.dragAccDx = 0;
        this.dragAccDy = 0;
        this.lastWorldX = world.x;
        this.lastWorldY = world.y;
        return;
      }

      // Single click → start wiring
      this.isWiring = true;
      this.wireStartWorldX = world.x;
      this.wireStartWorldY = world.y;
      this.setState((s) => { s.wireStart = ep; s.dirty = true; });
      return;
    }

    // 2) Gate hit
    const gateHit = hitTestGate(world.x, world.y, state);
    if (gateHit) {
      // Double-click constant gate → toggle value
      if (isDblClick) {
        const gate = state.circuit.gates.get(gateHit);
        if (gate && gate.type === 'constant') {
          const outPinId = gate.outputPins[0];
          if (outPinId) {
            const pin = state.circuit.pins.get(outPinId);
            if (pin) {
              const mask = ((1 << pin.bitWidth) >>> 0) - 1;
              pin.value = pin.value === null ? 1 : ((pin.value + 1) & mask) >>> 0;
              if (pin.value > mask) pin.value = 0;
              this.history.onChange?.();
              this.setState((s) => { s.dirty = true; });
              return;
            }
          }
        }
      }

      const alreadySelected = state.selection.some(
        (s) => s.type === 'gate' && s.id === gateHit,
      );
      if (e.ctrlKey || e.metaKey) {
        this.setState((s) => {
          if (alreadySelected) {
            s.selection = s.selection.filter(item => !(item.type === 'gate' && item.id === gateHit));
          } else {
            s.selection = [...s.selection, { type: 'gate', id: gateHit }];
          }
        });
      } else if (!alreadySelected) {
        this.setState((s) => { s.selection = [{ type: 'gate', id: gateHit }]; });
      }
      this.isDraggingGates = true;
      this.dragAccDx = 0;
      this.dragAccDy = 0;
      this.lastWorldX = world.x;
      this.lastWorldY = world.y;
      return;
    }

    // 3) Wire segment hit
    const segHit = hitTestWireSegment(world.x, world.y, state);
    if (segHit) {
      if (isDblClick) {
        // Double-click wire → split and start dragging new node
        this.isWiring = false;
        const newNodeId = this.splitWireSegment(state, segHit, snapToGrid(world.x), snapToGrid(world.y));
        if (newNodeId) {
          this.isDraggingNode = newNodeId;
          this.nodeFromSplit = true;
          this.lastWorldX = world.x;
          this.lastWorldY = world.y;
        }
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        const alreadySel = state.selection.some(s => s.type === 'wireSegment' && s.id === segHit);
        this.setState((s) => {
          if (alreadySel) {
            s.selection = s.selection.filter(item => !(item.type === 'wireSegment' && item.id === segHit));
          } else {
            s.selection = [...s.selection, { type: 'wireSegment', id: segHit }];
          }
        });
      } else {
        this.setState((s) => { s.selection = [{ type: 'wireSegment', id: segHit }]; });
      }
      return;
    }

    // 4) Empty space
    if (isDblClick) {
      // Double-click empty → create wire node and start wiring from it
      this.isWiring = false;
      const sx = snapToGrid(world.x);
      const sy = snapToGrid(world.y);
      const cmd = new AddWireNodeCommand(state, sx, sy);
      this.history.execute(cmd);
      const newNodeId = cmd.getNodeId();
      this.isWiring = true;
      this.wireStartWorldX = world.x;
      this.wireStartWorldY = world.y;
      this.setState((s) => {
        s.wireStart = { kind: 'node', nodeId: newNodeId, x: sx, y: sy };
        s.dirty = true;
      });
      return;
    }

    // Single click empty → start selection rect
    if (!(e.ctrlKey || e.metaKey)) {
      this.setState((s) => { s.selection = []; });
    }
    this.setState((s) => {
      s.selectionRect = { x: world.x, y: world.y, w: 0, h: 0 };
      s.isDragging = false;
      s.dragStart = { x: world.x, y: world.y };
    });
  }

  // ---------------------------------------------------------------------------
  // Mouse move
  // ---------------------------------------------------------------------------

  private handleMouseMove(e: MouseEvent): void {
    const state = this.getState();
    const world = this.renderer.screenToWorld(e.offsetX, e.offsetY, state.camera);
    this.renderer.setMouseWorld(world);

    // Stamp/paste preview
    if (state.stampGateType && !state.pasteMode) {
      const def = GATE_DEFS[state.stampGateType];
      this.setState((s) => {
        s.dropPreview = {
          type: state.stampGateType!,
          x: snapToGrid(world.x - def.width * GRID_SIZE / 2),
          y: snapToGrid(world.y - def.height * GRID_SIZE / 2),
        };
        s.hoveredGate = hitTestGate(world.x, world.y, s);
        s.dirty = true;
      });
    } else if (state.pasteMode) {
      this.setState((s) => {
        s.pasteCursor = { x: snapToGrid(world.x), y: snapToGrid(world.y) };
        s.dirty = true;
      });
    }

    // Pan
    if (state.isDragging && state.dragStart) {
      const dx = e.offsetX - state.dragStart.x;
      const dy = e.offsetY - state.dragStart.y;
      this.setState((s) => {
        s.camera.x -= dx / s.camera.zoom;
        s.camera.y -= dy / s.camera.zoom;
        s.dragStart = { x: e.offsetX, y: e.offsetY };
        s.dirty = true;
      });
      return;
    }

    // Wire node dragging (snapped to grid)
    if (this.isDraggingNode) {
      const dragId = this.isDraggingNode;
      const node = state.circuit.wireNodes.get(dragId);
      if (node) {
        const newX = snapToGrid(world.x);
        const newY = snapToGrid(world.y);
        if (newX !== node.x || newY !== node.y) this.didDragMove = true;
        node.x = newX;
        node.y = newY;
      }
      this.setState((s) => {
        s.hoveredEndpoint = hitTestEndpoint(world.x, world.y, s, dragId);
        s.dirty = true;
      });
      return;
    }

    // Wiring in progress
    if (this.isWiring) {
      this.setState((s) => {
        s.hoveredEndpoint = hitTestEndpoint(world.x, world.y, s);
        s.dirty = true;
      });
      return;
    }

    // Gate + selected node dragging (snapped to grid)
    if (this.isDraggingGates) {
      // Compute snapped delta from drag start
      const rawDx = world.x - this.lastWorldX + this.dragAccDx;
      const rawDy = world.y - this.lastWorldY + this.dragAccDy;
      const snappedDx = snapToGrid(rawDx) - snapToGrid(this.dragAccDx);
      const snappedDy = snapToGrid(rawDy) - snapToGrid(this.dragAccDy);
      this.dragAccDx = rawDx;
      this.dragAccDy = rawDy;
      this.lastWorldX = world.x;
      this.lastWorldY = world.y;

      if (snappedDx !== 0 || snappedDy !== 0) {
        const gateIds = state.selection
          .filter((s): s is { type: 'gate'; id: GateId } => s.type === 'gate')
          .map((s) => s.id);
        const selectedNodeIds = state.selection
          .filter((s): s is { type: 'wireNode'; id: WireNodeId } => s.type === 'wireNode')
          .map((s) => s.id);

        for (const gateId of gateIds) {
          const gate = state.circuit.gates.get(gateId);
          if (gate) { gate.x += snappedDx; gate.y += snappedDy; }
        }
        // When disconnected, anchored nodes were detached — skip them
        const anchored = this.isDraggingDisconnected ? [] : getAnchoredNodeIds(state.circuit, gateIds);
        const allNodeIds = new Set<WireNodeId>([...anchored, ...selectedNodeIds]);
        for (const nid of allNodeIds) {
          const node = state.circuit.wireNodes.get(nid);
          if (node) { node.x += snappedDx; node.y += snappedDy; }
        }
      }
      this.setState((s) => { s.dirty = true; });
      return;
    }

    // Selection rect
    if (state.selectionRect && state.dragStart) {
      this.setState((s) => {
        if (s.selectionRect && s.dragStart) {
          s.selectionRect.w = world.x - s.dragStart.x;
          s.selectionRect.h = world.y - s.dragStart.y;
          s.dirty = true;
        }
      });
      return;
    }

    // Hover
    this.setState((s) => {
      s.hoveredEndpoint = hitTestEndpoint(world.x, world.y, s);
      s.hoveredGate = hitTestGate(world.x, world.y, s);
      s.dirty = true;
    });
  }

  // ---------------------------------------------------------------------------
  // Mouse up
  // ---------------------------------------------------------------------------

  private handleMouseUp(e: MouseEvent): void {
    const state = this.getState();

    // Complete node drag — if no movement, try merge
    if (this.isDraggingNode) {
      const world = this.renderer.screenToWorld(e.offsetX, e.offsetY, state.camera);
      const draggedNodeId = this.isDraggingNode;
      const didMove = this.didDragMove;
      const fromSplit = this.nodeFromSplit;
      this.isDraggingNode = null;
      this.didDragMove = false;
      this.nodeFromSplit = false;

      // No drag movement? Try merge (2-segment node removal) — but not if just created by split
      if (!didMove && !fromSplit && this.tryMergeWireNode(state, draggedNodeId)) return;

      const targetPin = hitTestEndpoint(world.x, world.y, state, draggedNodeId);

      if (targetPin) {
        // Dropped on pin or wire node → merge: repoint all segments, remove dragged node
        const targetNodeId = this.ensureWireNode(state, targetPin);
        if (targetNodeId && targetNodeId !== draggedNodeId) {
          // Remove duplicate segments that would result from merge
          const toRemove: WireSegmentId[] = [];
          for (const seg of state.circuit.wireSegments.values()) {
            if (seg.from === draggedNodeId) seg.from = targetNodeId;
            if (seg.to === draggedNodeId) seg.to = targetNodeId;
            // Self-loop or duplicate after repoint
            if (seg.from === seg.to) toRemove.push(seg.id);
          }
          for (const id of toRemove) state.circuit.wireSegments.delete(id);
          // Remove duplicates (same from+to pair)
          const seen = new Set<string>();
          for (const seg of state.circuit.wireSegments.values()) {
            const key = [seg.from, seg.to].sort().join(':');
            if (seen.has(key)) { state.circuit.wireSegments.delete(seg.id); }
            else seen.add(key);
          }
          state.circuit.wireNodes.delete(draggedNodeId);
        }
      } else {
        // Snap to grid
        const node = state.circuit.wireNodes.get(draggedNodeId);
        if (node) { node.x = snapToGrid(node.x); node.y = snapToGrid(node.y); }
      }
      this.setState((s) => { s.selection = []; s.dirty = true; });
      return;
    }

    // Complete wiring
    if (this.isWiring) {
      this.isWiring = false;
      const world = this.renderer.screenToWorld(e.offsetX, e.offsetY, state.camera);

      // No drag? Cancel (allows double-click to work)
      const dragDist = Math.hypot(world.x - this.wireStartWorldX, world.y - this.wireStartWorldY);
      if (dragDist < MIN_WIRE_DRAG) {
        this.setState((s) => { s.wireStart = null; s.dirty = true; });
        return;
      }

      const wireStart = state.wireStart;
      const target = hitTestEndpoint(world.x, world.y, state);

      const wireColor = this.getActiveWireColor(state);

      if (wireStart && target) {
        // Endpoint → endpoint
        const fromNode = this.ensureWireNode(state, wireStart);
        const toNode = this.ensureWireNode(state, target);
        if (fromNode && toNode) this.addSegmentIfNew(state, fromNode, toNode, wireColor);
      } else if (wireStart) {
        // Check if dropped on a wire segment → split it and connect
        const segHit = hitTestWireSegment(world.x, world.y, state);
        if (segHit) {
          const sx = snapToGrid(world.x);
          const sy = snapToGrid(world.y);
          const midId = this.splitWireSegment(state, segHit, sx, sy);
          if (midId) {
            const fromNode = this.ensureWireNode(state, wireStart);
            if (fromNode) this.addSegmentIfNew(state, fromNode, midId, wireColor);
          }
        } else {
          // Endpoint → empty space: create free node and connect
          const sx = snapToGrid(world.x);
          const sy = snapToGrid(world.y);
          const nodeCmd = new AddWireNodeCommand(state, sx, sy);
          this.history.execute(nodeCmd);
          const fromNode = this.ensureWireNode(state, wireStart);
          if (fromNode) this.addSegmentIfNew(state, fromNode, nodeCmd.getNodeId(), wireColor);
        }
      }

      this.setState((s) => { s.wireStart = null; s.dirty = true; });
      return;
    }

    // Finalise gate + node drag (already snapped during drag)
    if (this.isDraggingGates) {
      this.isDraggingGates = false;
      const snapDx = snapToGrid(this.dragAccDx);
      const snapDy = snapToGrid(this.dragAccDy);

      if (snapDx !== 0 || snapDy !== 0) {
        const gateIds = state.selection
          .filter((s): s is { type: 'gate'; id: GateId } => s.type === 'gate')
          .map((s) => s.id);
        const selectedNodeIds = state.selection
          .filter((s): s is { type: 'wireNode'; id: WireNodeId } => s.type === 'wireNode')
          .map((s) => s.id);

        // Undo live move
        for (const gateId of gateIds) {
          const gate = state.circuit.gates.get(gateId);
          if (gate) { gate.x -= snapDx; gate.y -= snapDy; }
        }
        const anchored = getAnchoredNodeIds(state.circuit, gateIds);
        const allNodeIds = new Set<WireNodeId>([...anchored, ...selectedNodeIds]);
        for (const nid of allNodeIds) {
          const node = state.circuit.wireNodes.get(nid);
          if (node) { node.x -= snapDx; node.y -= snapDy; }
        }

        this.history.execute(new MoveGatesCommand(state, gateIds, snapDx, snapDy, selectedNodeIds));
      }

      // Always try to reconnect pins to nearby wire nodes after move
      {
        const gateIds = state.selection
          .filter((s): s is { type: 'gate'; id: GateId } => s.type === 'gate')
          .map((s) => s.id);
        this.reconnectPinNodes(state, gateIds);
      }
      this.isDraggingDisconnected = false;

      this.dragAccDx = 0;
      this.dragAccDy = 0;
      return;
    }

    // Finalise selection rect
    if (state.selectionRect) {
      const rect = state.selectionRect;
      this.setState((s) => {
        const selected: typeof s.selection = [];
        for (const gate of s.circuit.gates.values()) {
          if (rectContainsGate(rect.x, rect.y, rect.w, rect.h, gate)) {
            selected.push({ type: 'gate', id: gate.id });
          }
        }
        // Include free wire nodes in area selection
        const left = rect.w >= 0 ? rect.x : rect.x + rect.w;
        const top = rect.h >= 0 ? rect.y : rect.y + rect.h;
        const right = left + Math.abs(rect.w);
        const bottom = top + Math.abs(rect.h);
        for (const node of s.circuit.wireNodes.values()) {
          if (node.pinId) continue; // skip anchored nodes
          if (node.x >= left && node.x <= right && node.y >= top && node.y <= bottom) {
            selected.push({ type: 'wireNode', id: node.id });
          }
        }
        s.selection = selected;
        s.selectionRect = null;
        s.dirty = true;
      });
      return;
    }

    // Clear pan
    this.setState((s) => { s.isDragging = false; s.dragStart = null; });
  }

  // ---------------------------------------------------------------------------
  // Wheel (zoom)
  // ---------------------------------------------------------------------------

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const state = this.getState();
    const worldBefore = this.renderer.screenToWorld(e.offsetX, e.offsetY, state.camera);
    const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.setState((s) => {
      s.camera.zoom = Math.min(4, Math.max(0.25, s.camera.zoom * zoomFactor));
      const worldAfter = this.renderer.screenToWorld(e.offsetX, e.offsetY, s.camera);
      s.camera.x += worldBefore.x - worldAfter.x;
      s.camera.y += worldBefore.y - worldAfter.y;
      s.dirty = true;
    });
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const state = this.getState();
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.history.undo();
      this.setState((s) => { s.dirty = true; });
      return;
    }
    if (ctrl && (e.key === 'Z' || e.key === 'y')) {
      e.preventDefault();
      this.history.redo();
      this.setState((s) => { s.dirty = true; });
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.deleteSelected(state);
      return;
    }

    if (e.key === 'r' || e.key === 'R') {
      // Rotate clipboard in paste mode
      if (state.pasteMode && state.clipboard) {
        this.rotateClipboard(state);
        return;
      }
      // Rotate selection (gates + free nodes around group center)
      const gateIds = state.selection
        .filter((s): s is { type: 'gate'; id: GateId } => s.type === 'gate')
        .map((s) => s.id);
      const nodeIds = state.selection
        .filter((s): s is { type: 'wireNode'; id: WireNodeId } => s.type === 'wireNode')
        .map((s) => s.id);
      if (gateIds.length > 0 || nodeIds.length > 0) {
        this.history.execute(new RotateGatesCommand(state, gateIds, nodeIds));
      }
      return;
    }

    // Apply wire color
    if (e.key === 'e' || e.key === 'E') {
      const selectedSegs = state.selection
        .filter((s): s is { type: 'wireSegment'; id: WireSegmentId } => s.type === 'wireSegment')
        .map((s) => s.id);
      if (selectedSegs.length === 0) return;

      const color = state.wireColor;
      // Default color (first in palette) means remove override
      const colorValue = color === WIRE_COLORS[0] ? undefined : color;

      if (e.shiftKey || ctrl) {
        // Apply to all connected segments (flood fill from selected)
        const allSegs = this.getConnectedSegments(state, selectedSegs);
        for (const segId of allSegs) {
          const seg = state.circuit.wireSegments.get(segId);
          if (seg) seg.color = colorValue;
        }
      } else {
        // Apply to selected segments only
        for (const segId of selectedSegs) {
          const seg = state.circuit.wireSegments.get(segId);
          if (seg) seg.color = colorValue;
        }
      }
      this.setState((s) => { s.dirty = true; });
      return;
    }

    // Copy
    if (ctrl && (e.key === 'c' || e.key === 'C') && !e.shiftKey) {
      e.preventDefault();
      this.copySelection(state);
      return;
    }

    // Cut
    if (ctrl && (e.key === 'x' || e.key === 'X')) {
      e.preventDefault();
      this.copySelection(state);
      this.deleteSelected(state);
      return;
    }

    // Paste
    if (ctrl && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault();
      if (state.clipboard) {
        this.setState((s) => { s.pasteMode = true; s.stampGateType = null; s.dirty = true; });
      }
      return;
    }

    // Q — eyedropper: gate → stamp, wire → pick color
    if (e.key === 'q' || e.key === 'Q') {
      if (state.hoveredGate) {
        const gate = state.circuit.gates.get(state.hoveredGate);
        if (gate) {
          this.setState((s) => { s.stampGateType = gate.type; s.pasteMode = false; s.dirty = true; });
          return;
        }
      }
      // Check wire under cursor via hoveredEndpoint is not applicable, check segments
      // Use last known mouse world position
      const mw = this.renderer.getMouseWorld();
      const segHit = hitTestWireSegment(mw.x, mw.y, state);
      if (segHit) {
        const seg = state.circuit.wireSegments.get(segHit);
        if (seg) {
          this.setState((s) => { s.wireColor = seg.color ?? WIRE_COLORS[0]; s.dirty = true; });
          return;
        }
      }
      return;
    }

    if (e.key === 'Escape') {
      this.isWiring = false;
      this.isDraggingNode = null;
      this.isDraggingDisconnected = false;
      this.setState((s) => {
        s.selection = [];
        s.wireStart = null;
        s.selectionRect = null;
        s.stampGateType = null;
        s.pasteMode = false;
        s.dropPreview = null;
        s.dirty = true;
      });
      return;
    }
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

    const cmd = new AddWireNodeCommand(state, ep.x, ep.y, ep.pinId);
    this.history.execute(cmd);
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
    this.history.execute(new AddWireSegmentCommand(state, from, to, color));
  }

  /** Get the active wire color, or undefined for default. */
  private getActiveWireColor(state: EditorState): string | undefined {
    return state.wireColor === WIRE_COLORS[0] ? undefined : state.wireColor;
  }

  /** Split a wire segment at (x,y). Returns the new node ID. */
  private splitWireSegment(state: EditorState, segId: WireSegmentId, x: number, y: number): WireNodeId | null {
    const seg = state.circuit.wireSegments.get(segId);
    if (!seg) return null;
    const fromId = seg.from;
    const toId = seg.to;
    const color = seg.color;

    this.history.execute(new RemoveWireSegmentCommand(state, segId, false));
    const addNode = new AddWireNodeCommand(state, x, y);
    this.history.execute(addNode);
    const midId = addNode.getNodeId();
    this.history.execute(new AddWireSegmentCommand(state, fromId, midId, color));
    this.history.execute(new AddWireSegmentCommand(state, midId, toId, color));
    this.setState((s) => { s.dirty = true; });
    return midId;
  }

  /** Delete all selected gates and wire segments. */
  private deleteSelected(state: EditorState): void {
    // Wire nodes first (cascades to attached segments)
    const nodeIds = state.selection
      .filter((s): s is { type: 'wireNode'; id: WireNodeId } => s.type === 'wireNode')
      .map((s) => s.id);
    for (const nodeId of nodeIds) this.history.execute(new RemoveWireNodeCommand(state, nodeId));

    const segIds = state.selection
      .filter((s): s is { type: 'wireSegment'; id: WireSegmentId } => s.type === 'wireSegment')
      .map((s) => s.id);
    for (const segId of segIds) this.history.execute(new RemoveWireSegmentCommand(state, segId));

    const gateIds = state.selection
      .filter((s): s is { type: 'gate'; id: GateId } => s.type === 'gate')
      .map((s) => s.id);
    for (const gateId of gateIds) this.history.execute(new RemoveGateCommand(state, gateId));

    this.setState((s) => { s.selection = []; s.dirty = true; });
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
    this.history.execute(cmd);
    if (label) {
      const newSeg = state.circuit.wireSegments.get(cmd.getSegmentId());
      if (newSeg) newSeg.label = label;
    }
    this.setState((s) => { s.dirty = true; });
    return true;
  }

  /** Start a disconnect drag: select gate, detach pin nodes, begin dragging. */
  private startDisconnectDrag(state: EditorState, gateId: GateId, wx: number, wy: number): void {
    this.setState((s) => { s.selection = [{ type: 'gate', id: gateId }]; });
    this.detachPinNodes(state, [gateId]);
    this.isDraggingGates = true;
    this.isDraggingDisconnected = true;
    this.dragAccDx = 0;
    this.dragAccDy = 0;
    this.lastWorldX = wx;
    this.lastWorldY = wy;
  }

  /** Detach all wire nodes anchored to pins of the given gates. Also clears pin values to prevent stale display. */
  private detachPinNodes(state: EditorState, gateIds: GateId[]): void {
    const pinIds = new Set<string>();
    for (const gateId of gateIds) {
      const gate = state.circuit.gates.get(gateId);
      if (!gate) continue;
      for (const p of [...gate.inputPins, ...gate.outputPins]) pinIds.add(p as string);
    }
    for (const node of state.circuit.wireNodes.values()) {
      if (node.pinId && pinIds.has(node.pinId as string)) {
        node.pinId = undefined;
      }
    }
    // Clear pin values so disconnected wires don't show stale signals
    for (const pin of state.circuit.pins.values()) {
      if (pinIds.has(pin.id as string)) {
        pin.value = null;
      }
    }
  }

  /** Reconnect: for each pin of the given gates, find a wire node at the pin position and anchor it. */
  private reconnectPinNodes(state: EditorState, gateIds: GateId[]): void {
    for (const gateId of gateIds) {
      const gate = state.circuit.gates.get(gateId);
      if (!gate) continue;
      const positions = getPinPositions(gate);
      for (const [pinId, pos] of positions) {
        // Find a free wire node at this position (within 1px tolerance)
        for (const node of state.circuit.wireNodes.values()) {
          if (node.pinId) continue; // already anchored
          if (Math.abs(node.x - pos.x) < 2 && Math.abs(node.y - pos.y) < 2) {
            node.pinId = pinId;
            node.x = pos.x;
            node.y = pos.y;
            break;
          }
        }
      }
    }
    this.setState((s) => { s.dirty = true; });
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

    // Rotate all dx/dy by 90° CW around origin (0,0)
    for (const cg of clip.gates) {
      const dx = cg.dx;
      const dy = cg.dy;
      cg.dx = -dy;
      cg.dy = dx;
      cg.rotation = (((cg.rotation + 90) % 360) as 0 | 90 | 180 | 270);
    }
    for (const cn of clip.nodes) {
      const dx = cn.dx;
      const dy = cn.dy;
      cn.dx = -dy;
      cn.dy = dx;
    }

    this.setState((s) => { s.dirty = true; });
  }

  // ---------------------------------------------------------------------------
  // Copy / Paste
  // ---------------------------------------------------------------------------

  private copySelection(state: EditorState): void {
    const selectedGateIds = state.selection
      .filter((s): s is { type: 'gate'; id: GateId } => s.type === 'gate')
      .map(s => s.id);
    const selectedSegIds = new Set(
      state.selection
        .filter((s): s is { type: 'wireSegment'; id: WireSegmentId } => s.type === 'wireSegment')
        .map(s => s.id as string),
    );
    const selectedNodeIds = new Set(
      state.selection
        .filter((s): s is { type: 'wireNode'; id: WireNodeId } => s.type === 'wireNode')
        .map(s => s.id as string),
    );

    if (selectedGateIds.length === 0 && selectedSegIds.size === 0 && selectedNodeIds.size === 0) return;

    // Compute center of selected items
    let cx = 0, cy = 0, count = 0;
    for (const gid of selectedGateIds) {
      const g = state.circuit.gates.get(gid);
      if (g) { const d = getGateDims(g); cx += g.x + d.w / 2; cy += g.y + d.h / 2; count++; }
    }
    for (const nid of selectedNodeIds) {
      const n = state.circuit.wireNodes.get(nid as WireNodeId);
      if (n) { cx += n.x; cy += n.y; count++; }
    }
    if (count > 0) { cx /= count; cy /= count; }

    // Build gate index map
    const gateIdxMap = new Map<string, number>();
    const gates: ClipboardGate[] = [];
    for (const gid of selectedGateIds) {
      const g = state.circuit.gates.get(gid);
      if (!g) continue;
      const d = getGateDims(g);
      gateIdxMap.set(gid as string, gates.length);
      const allPids = [...g.inputPins, ...g.outputPins];
      const pinBitWidths = allPids.map(pid => state.circuit.pins.get(pid)?.bitWidth ?? 1);
      const pinValues = allPids.map(pid => state.circuit.pins.get(pid)?.value ?? null);
      gates.push({ type: g.type, dx: g.x + d.w / 2 - cx, dy: g.y + d.h / 2 - cy, rotation: g.rotation, pinBitWidths, pinValues });
    }

    // Collect relevant wire nodes (anchored to selected gates or explicitly selected free nodes)
    // Also collect nodes referenced by selected wire segments
    const relevantNodeIds = new Set<string>(selectedNodeIds);
    for (const node of state.circuit.wireNodes.values()) {
      if (node.pinId) {
        const pin = state.circuit.pins.get(node.pinId);
        if (pin && gateIdxMap.has(pin.gateId as string)) {
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
      const n = state.circuit.wireNodes.get(nid as WireNodeId);
      if (!n) continue;
      nodeIdxMap.set(nid, nodes.length);
      let gateIdx: number | undefined;
      let pinIdx: number | undefined;
      if (n.pinId) {
        const pin = state.circuit.pins.get(n.pinId);
        if (pin && gateIdxMap.has(pin.gateId as string)) {
          gateIdx = gateIdxMap.get(pin.gateId as string);
          const gate = state.circuit.gates.get(pin.gateId);
          if (gate) {
            const allPins = [...gate.inputPins, ...gate.outputPins];
            pinIdx = allPins.indexOf(n.pinId);
          }
        }
      }
      nodes.push({ dx: n.x - cx, dy: n.y - cy, gateIdx, pinIdx });
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

    this.setState((s) => {
      s.clipboard = { gates, nodes, wires };
    });
  }

  private pasteClipboard(state: EditorState, wx: number, wy: number): void {
    const clip = state.clipboard;
    if (!clip) return;

    const cx = snapToGrid(wx);
    const cy = snapToGrid(wy);

    // Create gates and collect new pin IDs
    const newGateIds: GateId[] = [];
    const newAllPinIds: PinId[][] = []; // per gate, all pin IDs in order
    for (const cg of clip.gates) {
      const def = GATE_DEFS[cg.type];
      const gx = snapToGrid(cx + cg.dx - def.width * GRID_SIZE / 2);
      const gy = snapToGrid(cy + cg.dy - def.height * GRID_SIZE / 2);
      const cmd = new AddGateCommand(state, cg.type, gx, gy, cg.rotation, cg.pinBitWidths[0] ?? 1);
      this.history.execute(cmd);
      newGateIds.push(cmd.getGateId());

      // Collect pin IDs and restore properties
      const gate = state.circuit.gates.get(cmd.getGateId());
      const allPins = gate ? [...gate.inputPins, ...gate.outputPins] : [];
      newAllPinIds.push(allPins);
      for (let p = 0; p < allPins.length; p++) {
        const pin = state.circuit.pins.get(allPins[p]);
        if (pin) {
          if (cg.pinBitWidths[p] !== undefined) pin.bitWidth = cg.pinBitWidths[p];
          if (cg.pinValues[p] !== undefined) pin.value = cg.pinValues[p];
        }
      }
    }

    // Create wire nodes
    const newNodeIds: WireNodeId[] = [];
    for (const cn of clip.nodes) {
      const nx = snapToGrid(cx + cn.dx);
      const ny = snapToGrid(cy + cn.dy);

      // If anchored to a gate pin, find the new pin ID
      let pinId: PinId | undefined;
      if (cn.gateIdx !== undefined && cn.pinIdx !== undefined) {
        pinId = newAllPinIds[cn.gateIdx]?.[cn.pinIdx];
      }

      const cmd = new AddWireNodeCommand(state, nx, ny, pinId);
      this.history.execute(cmd);
      newNodeIds.push(cmd.getNodeId());
    }

    // Create wire segments
    for (const cw of clip.wires) {
      const fromId = newNodeIds[cw.fromNodeIdx];
      const toId = newNodeIds[cw.toNodeIdx];
      if (fromId && toId) {
        const cmd = new AddWireSegmentCommand(state, fromId, toId, cw.color);
        this.history.execute(cmd);
        // Apply label
        if (cw.label) {
          const seg = state.circuit.wireSegments.get(cmd.getSegmentId());
          if (seg) seg.label = cw.label;
        }
      }
    }

    this.setState((s) => { s.dirty = true; });
  }
}
