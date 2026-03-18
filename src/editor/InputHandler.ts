import type { GateId, PinId, WireNodeId, WireSegmentId, Gate } from '../types.ts';
import type { EditorState, PlaceableType } from './EditorState.ts';
import type { Renderer } from './Renderer.ts';
import { GATE_DIMS, getGateDims, getPinPositions, snapToGrid } from './geometry.ts';
import {
  CommandHistory,
  AddGateCommand,
  RemoveGateCommand,
  MoveGatesCommand,
  RotateGatesCommand,
  ConnectPinsCommand,
  RemoveWireSegmentCommand,
  RemoveWireNodeCommand,
  AddWireNodeCommand,
  AddWireSegmentCommand,
} from './CommandHistory.ts';

const PIN_HIT_RADIUS = 10;
const WIRE_HIT_DIST = 8;

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

function hitTestPin(wx: number, wy: number, state: EditorState): PinId | null {
  let closest: PinId | null = null;
  let closestDist = PIN_HIT_RADIUS;
  for (const gate of state.circuit.gates.values()) {
    const positions = getPinPositions(gate, state.circuit.pins);
    for (const [pinId, pos] of positions) {
      const dist = Math.hypot(wx - pos.x, wy - pos.y);
      if (dist < closestDist) {
        closestDist = dist;
        closest = pinId;
      }
    }
  }
  return closest;
}

function hitTestWireNode(wx: number, wy: number, state: EditorState): WireNodeId | null {
  let closest: WireNodeId | null = null;
  let closestDist = PIN_HIT_RADIUS;
  for (const node of state.circuit.wireNodes.values()) {
    const dist = Math.hypot(wx - node.x, wy - node.y);
    if (dist < closestDist) {
      closestDist = dist;
      closest = node.id;
    }
  }
  return closest;
}

function hitTestWireSegment(wx: number, wy: number, state: EditorState): WireSegmentId | null {
  let closest: WireSegmentId | null = null;
  let closestDist = WIRE_HIT_DIST;
  for (const seg of state.circuit.wireSegments.values()) {
    const a = state.circuit.wireNodes.get(seg.from);
    const b = state.circuit.wireNodes.get(seg.to);
    if (!a || !b) continue;
    const dist = pointToSegmentDist(wx, wy, a.x, a.y, b.x, b.y);
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
// InputHandler — modeless: always select, drag-from-pin wires, drag-drop place
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

    this.setState((s) => {
      s.dropPreview = {
        type: 'nand' as PlaceableType,
        x: snapToGrid(world.x),
        y: snapToGrid(world.y),
      };
      s.dirty = true;
    });
  }

  private handleDrop(e: DragEvent): void {
    e.preventDefault();
    if (!e.dataTransfer) return;

    const gateType = e.dataTransfer.getData('text/plain') as PlaceableType;
    if (!gateType || !GATE_DIMS[gateType]) return;

    const state = this.getState();
    const world = this.renderer.screenToWorld(e.offsetX, e.offsetY, state.camera);

    const cmd = new AddGateCommand(state, gateType, snapToGrid(world.x), snapToGrid(world.y));
    this.history.execute(cmd);

    this.setState((s) => {
      s.dropPreview = null;
      s.dirty = true;
    });
  }

  private handleDragLeave(_e: DragEvent): void {
    this.setState((s) => {
      s.dropPreview = null;
      s.dirty = true;
    });
  }

  // ---------------------------------------------------------------------------
  // Right-click — delete selected elements
  // ---------------------------------------------------------------------------

  private handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const state = this.getState();
    const world = this.renderer.screenToWorld(e.offsetX, e.offsetY, state.camera);

    // Hit-test element under cursor and delete it directly
    const nodeHit = hitTestWireNode(world.x, world.y, state);
    if (nodeHit) {
      const node = state.circuit.wireNodes.get(nodeHit);
      if (node && !node.pinId) {
        this.history.execute(new RemoveWireNodeCommand(state, nodeHit));
        this.setState((s) => { s.dirty = true; });
        return;
      }
    }

    const gateHit = hitTestGate(world.x, world.y, state);
    if (gateHit) {
      this.setState((s) => { s.selection = [{ type: 'gate', id: gateHit }]; });
      this.deleteSelected(state);
      return;
    }

    const segHit = hitTestWireSegment(world.x, world.y, state);
    if (segHit) {
      this.setState((s) => { s.selection = [{ type: 'wireSegment', id: segHit }]; });
      this.deleteSelected(state);
      return;
    }

    // Empty space → just clear selection
    this.setState((s) => { s.selection = []; s.dirty = true; });
  }

  // ---------------------------------------------------------------------------
  // Double-click — start wiring from wire node
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Mouse down — unified: pin/node drag = wire, gate click = select+drag
  // ---------------------------------------------------------------------------

  private handleMouseDown(e: MouseEvent): void {
    const state = this.getState();
    const world = this.renderer.screenToWorld(e.offsetX, e.offsetY, state.camera);

    // Middle click or shift+left → pan
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      this.setState((s) => {
        s.isDragging = true;
        s.dragStart = { x: e.offsetX, y: e.offsetY };
      });
      return;
    }

    if (e.button !== 0) return;

    const isDblClick = e.detail >= 2;

    // 1) Wire node hit (free, not anchored to pin)
    const nodeHit = hitTestWireNode(world.x, world.y, state);
    if (nodeHit) {
      const node = state.circuit.wireNodes.get(nodeHit);
      if (node && !node.pinId) {
        if (isDblClick) {
          // Double-click → drag the node (cancel any wiring from first click)
          this.isWiring = false;
          this.isDraggingNode = nodeHit;
          this.lastWorldX = world.x;
          this.lastWorldY = world.y;
          this.setState((s) => {
            s.wireStartPin = null;
            s.wireStartNode = null;
            s.dirty = true;
          });
        } else {
          // Single click → start wiring from this node
          this.isWiring = true;
          this.wireStartWorldX = world.x;
          this.wireStartWorldY = world.y;
          this.setState((s) => {
            s.wireStartNode = nodeHit;
            s.dirty = true;
          });
        }
        return;
      }
    }

    // 2) Pin hit
    const pinHit = hitTestPin(world.x, world.y, state);
    if (pinHit) {
      if (isDblClick) {
        // Double-click pin → detach wire node from pin, start dragging it
        // Cancel any wiring from first click
        this.isWiring = false;
        const anchoredNode = this.findAnchoredNode(pinHit, state);
        if (anchoredNode) {
          const node = state.circuit.wireNodes.get(anchoredNode);
          if (node) {
            node.pinId = undefined;
            this.isDraggingNode = anchoredNode;
            this.lastWorldX = world.x;
            this.lastWorldY = world.y;
            this.setState((s) => {
              s.wireStartPin = null;
              s.wireStartNode = null;
              s.dirty = true;
            });
            return;
          }
        }
      }
      // Single click (or dblclick without anchored node) → start wiring
      this.isWiring = true;
      this.wireStartWorldX = world.x;
      this.wireStartWorldY = world.y;
      this.setState((s) => {
        s.wireStartPin = pinHit;
        s.dirty = true;
      });
      return;
    }

    // 3) Gate hit → select and start drag
    const gateHit = hitTestGate(world.x, world.y, state);
    if (gateHit) {
      const alreadySelected = state.selection.some(
        (s) => s.type === 'gate' && s.id === gateHit,
      );
      if (e.ctrlKey || e.metaKey) {
        this.setState((s) => {
          if (alreadySelected) {
            s.selection = s.selection.filter(
              (item) => !(item.type === 'gate' && item.id === gateHit),
            );
          } else {
            s.selection = [...s.selection, { type: 'gate', id: gateHit }];
          }
        });
      } else if (!alreadySelected) {
        this.setState((s) => {
          s.selection = [{ type: 'gate', id: gateHit }];
        });
      }
      this.isDraggingGates = true;
      this.dragAccDx = 0;
      this.dragAccDy = 0;
      this.lastWorldX = world.x;
      this.lastWorldY = world.y;
      return;
    }

    // 4) Wire segment hit
    const segHit = hitTestWireSegment(world.x, world.y, state);
    if (segHit) {
      if (isDblClick) {
        // Double-click wire → split and start dragging the new node
        this.isWiring = false;
        const newNodeId = this.splitWireSegment(state, segHit, snapToGrid(world.x), snapToGrid(world.y));
        if (newNodeId) {
          this.isDraggingNode = newNodeId;
          this.lastWorldX = world.x;
          this.lastWorldY = world.y;
        }
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        const alreadySel = state.selection.some(
          (s) => s.type === 'wireSegment' && s.id === segHit,
        );
        this.setState((s) => {
          if (alreadySel) {
            s.selection = s.selection.filter(
              (item) => !(item.type === 'wireSegment' && item.id === segHit),
            );
          } else {
            s.selection = [...s.selection, { type: 'wireSegment', id: segHit }];
          }
        });
      } else {
        this.setState((s) => {
          s.selection = [{ type: 'wireSegment', id: segHit }];
        });
      }
      return;
    }

    // 5) Empty space → start selection rect
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

    // Wire node dragging
    if (this.isDraggingNode) {
      const node = state.circuit.wireNodes.get(this.isDraggingNode);
      if (node) {
        node.x = world.x;
        node.y = world.y;
      }
      this.setState((s) => {
        s.hoveredPin = hitTestPin(world.x, world.y, s);
        s.dirty = true;
      });
      return;
    }

    // Wiring in progress
    if (this.isWiring) {
      this.setState((s) => {
        s.hoveredPin = hitTestPin(world.x, world.y, s);
        s.hoveredNode = hitTestWireNode(world.x, world.y, s);
        s.dirty = true;
      });
      return;
    }

    // Gate dragging
    if (this.isDraggingGates) {
      const dx = world.x - this.lastWorldX;
      const dy = world.y - this.lastWorldY;
      this.lastWorldX = world.x;
      this.lastWorldY = world.y;
      this.dragAccDx += dx;
      this.dragAccDy += dy;

      const gateIds = state.selection
        .filter((s): s is { type: 'gate'; id: GateId } => s.type === 'gate')
        .map((s) => s.id);

      for (const gateId of gateIds) {
        const gate = state.circuit.gates.get(gateId);
        if (gate) { gate.x += dx; gate.y += dy; }
      }
      const pinIdSet = new Set<string>();
      for (const gateId of gateIds) {
        const gate = state.circuit.gates.get(gateId);
        if (gate) {
          for (const p of [...gate.inputPins, ...gate.outputPins]) pinIdSet.add(p as string);
        }
      }
      for (const node of state.circuit.wireNodes.values()) {
        if (node.pinId && pinIdSet.has(node.pinId as string)) {
          node.x += dx; node.y += dy;
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
      s.hoveredNode = hitTestWireNode(world.x, world.y, s);
      s.hoveredGate = hitTestGate(world.x, world.y, s);
      s.hoveredPin = hitTestPin(world.x, world.y, s);
      s.dirty = true;
    });
  }

  // ---------------------------------------------------------------------------
  // Mouse up
  // ---------------------------------------------------------------------------

  private handleMouseUp(e: MouseEvent): void {
    const state = this.getState();

    // Complete node drag
    if (this.isDraggingNode) {
      const world = this.renderer.screenToWorld(e.offsetX, e.offsetY, state.camera);
      const targetPin = hitTestPin(world.x, world.y, state);
      const draggedNodeId = this.isDraggingNode;
      this.isDraggingNode = null;

      if (targetPin) {
        // Dropped on a pin → merge: reconnect all segments to pin's node, remove dragged node
        const pinNode = this.findOrCreatePinNode(state, targetPin);
        if (pinNode && pinNode !== draggedNodeId) {
          // Repoint all segments from draggedNode to pinNode
          for (const seg of state.circuit.wireSegments.values()) {
            if (seg.from === draggedNodeId) seg.from = pinNode;
            if (seg.to === draggedNodeId) seg.to = pinNode;
          }
          // Remove the dragged node
          state.circuit.wireNodes.delete(draggedNodeId);
        }
      } else {
        // Snap to grid
        const node = state.circuit.wireNodes.get(draggedNodeId);
        if (node) {
          node.x = snapToGrid(node.x);
          node.y = snapToGrid(node.y);
        }
      }

      this.setState((s) => { s.selection = []; s.dirty = true; });
      return;
    }

    // Complete wiring
    if (this.isWiring) {
      this.isWiring = false;
      const world = this.renderer.screenToWorld(e.offsetX, e.offsetY, state.camera);

      // If released at the same spot (no drag), just cancel — allows double-click to work
      const dragDist = Math.hypot(world.x - this.wireStartWorldX, world.y - this.wireStartWorldY);
      if (dragDist < 5) {
        this.setState((s) => {
          s.wireStartPin = null;
          s.wireStartNode = null;
          s.dirty = true;
        });
        return;
      }

      const targetPin = hitTestPin(world.x, world.y, state);
      const targetNode = hitTestWireNode(world.x, world.y, state);

      if (state.wireStartPin && targetPin && targetPin !== state.wireStartPin) {
        // Pin → Pin
        const cmd = new ConnectPinsCommand(state, state.wireStartPin, targetPin);
        this.history.execute(cmd);
      } else if (state.wireStartPin && targetNode) {
        // Pin → existing wire node: ensure pin has a wire node, then connect
        this.connectPinToNode(state, state.wireStartPin, targetNode);
      } else if (state.wireStartNode && targetPin) {
        // Wire node → Pin: ensure pin has a wire node, then connect
        this.connectNodeToPin(state, state.wireStartNode, targetPin);
      } else if (state.wireStartNode && targetNode && targetNode !== state.wireStartNode) {
        // Wire node → wire node
        const cmd = new AddWireSegmentCommand(state, state.wireStartNode, targetNode);
        this.history.execute(cmd);
      } else if (state.wireStartPin || state.wireStartNode) {
        // Dropped on empty space → create a new wire node and connect
        const sx = snapToGrid(world.x);
        const sy = snapToGrid(world.y);
        const nodeCmd = new AddWireNodeCommand(state, sx, sy);
        this.history.execute(nodeCmd);
        const newNodeId = nodeCmd.getNodeId();

        if (state.wireStartPin) {
          this.connectPinToNode(state, state.wireStartPin, newNodeId);
        } else if (state.wireStartNode) {
          const segCmd = new AddWireSegmentCommand(state, state.wireStartNode, newNodeId);
          this.history.execute(segCmd);
        }
      }

      this.setState((s) => {
        s.wireStartPin = null;
        s.wireStartNode = null;
        s.dirty = true;
      });
      return;
    }

    // Finalise gate drag — snap all moved gates to grid
    if (this.isDraggingGates) {
      const dx = this.dragAccDx;
      const dy = this.dragAccDy;
      this.isDraggingGates = false;

      if (dx !== 0 || dy !== 0) {
        const gateIds = state.selection
          .filter((s): s is { type: 'gate'; id: GateId } => s.type === 'gate')
          .map((s) => s.id);

        // Undo live move, then compute snapped delta and execute command
        for (const gateId of gateIds) {
          const gate = state.circuit.gates.get(gateId);
          if (gate) { gate.x -= dx; gate.y -= dy; }
        }
        const pinIdSet = new Set<string>();
        for (const gateId of gateIds) {
          const gate = state.circuit.gates.get(gateId);
          if (gate) {
            for (const p of [...gate.inputPins, ...gate.outputPins]) pinIdSet.add(p as string);
          }
        }
        for (const node of state.circuit.wireNodes.values()) {
          if (node.pinId && pinIdSet.has(node.pinId as string)) {
            node.x -= dx; node.y -= dy;
          }
        }

        // Snap: compute snapped delta from first gate's position
        const firstGate = gateIds.length > 0 ? state.circuit.gates.get(gateIds[0]) : null;
        let snapDx = dx;
        let snapDy = dy;
        if (firstGate) {
          const newX = snapToGrid(firstGate.x + dx);
          const newY = snapToGrid(firstGate.y + dy);
          snapDx = newX - firstGate.x;
          snapDy = newY - firstGate.y;
        }

        if (snapDx !== 0 || snapDy !== 0) {
          const cmd = new MoveGatesCommand(state, gateIds, snapDx, snapDy);
          this.history.execute(cmd);
        }
      }
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
        s.selection = selected;
        s.selectionRect = null;
        s.dirty = true;
      });
      return;
    }

    // Clear pan
    this.setState((s) => {
      s.isDragging = false;
      s.dragStart = null;
    });
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
      const gateIds = state.selection
        .filter((s): s is { type: 'gate'; id: GateId } => s.type === 'gate')
        .map((s) => s.id);
      if (gateIds.length > 0) this.history.execute(new RotateGatesCommand(state, gateIds));
      return;
    }

    if (e.key === 'Escape') {
      this.isWiring = false;
      this.isDraggingNode = null;
      this.setState((s) => {
        s.selection = [];
        s.wireStartPin = null;
        s.wireStartNode = null;
        s.selectionRect = null;
        s.dirty = true;
      });
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Ensure the pin has an anchored wire node, then add a segment to targetNode. */
  private connectPinToNode(state: EditorState, pinId: PinId, targetNode: WireNodeId): void {
    const existingNode = this.findOrCreatePinNode(state, pinId);
    if (existingNode && existingNode !== targetNode) {
      const cmd = new AddWireSegmentCommand(state, existingNode, targetNode);
      this.history.execute(cmd);
    }
  }

  /** Ensure the pin has an anchored wire node, then add a segment from sourceNode. */
  private connectNodeToPin(state: EditorState, sourceNode: WireNodeId, pinId: PinId): void {
    const existingNode = this.findOrCreatePinNode(state, pinId);
    if (existingNode && existingNode !== sourceNode) {
      const cmd = new AddWireSegmentCommand(state, sourceNode, existingNode);
      this.history.execute(cmd);
    }
  }

  /** Find existing wire node for pin, or create one at the pin's position. */
  private findOrCreatePinNode(state: EditorState, pinId: PinId): WireNodeId | null {
    // Check if a wire node already exists for this pin
    for (const node of state.circuit.wireNodes.values()) {
      if (node.pinId === pinId) return node.id;
    }
    // Create one at pin position
    const pin = state.circuit.pins.get(pinId);
    if (!pin) return null;
    const gate = state.circuit.gates.get(pin.gateId);
    if (!gate) return null;
    const positions = getPinPositions(gate, state.circuit.pins);
    const pos = positions.get(pinId);
    if (!pos) return null;

    const cmd = new AddWireNodeCommand(state, pos.x, pos.y, pinId);
    this.history.execute(cmd);
    return cmd.getNodeId();
  }

  /** Split a wire segment by inserting a node at (x,y). Removes the original segment,
   *  creates a new node, and two new segments connecting the original endpoints to it.
   *  Returns the new node ID. */
  private splitWireSegment(state: EditorState, segId: WireSegmentId, x: number, y: number): WireNodeId | null {
    const seg = state.circuit.wireSegments.get(segId);
    if (!seg) return null;

    const fromId = seg.from;
    const toId = seg.to;

    // Remove original segment
    const removeSeg = new RemoveWireSegmentCommand(state, segId);
    this.history.execute(removeSeg);

    // Create new node
    const addNode = new AddWireNodeCommand(state, x, y);
    this.history.execute(addNode);
    const midId = addNode.getNodeId();

    // Create two segments: from→mid, mid→to
    const seg1 = new AddWireSegmentCommand(state, fromId, midId);
    this.history.execute(seg1);
    const seg2 = new AddWireSegmentCommand(state, midId, toId);
    this.history.execute(seg2);

    this.setState((s) => {
      s.selection = [{ type: 'wireNode', id: midId }];
      s.dirty = true;
    });

    return midId;
  }

  /** Delete all selected gates, wire segments, and wire nodes. */
  private deleteSelected(state: EditorState): void {
    // Delete wire nodes first (removes attached segments via RemoveWireNodeCommand)
    const nodeIds = state.selection
      .filter((s): s is { type: 'wireNode'; id: WireNodeId } => s.type === 'wireNode')
      .map((s) => s.id);
    for (const nodeId of nodeIds) this.history.execute(new RemoveWireNodeCommand(state, nodeId));

    // Then segments (some may already be gone from node removal, command handles missing)
    const segIds = state.selection
      .filter((s): s is { type: 'wireSegment'; id: WireSegmentId } => s.type === 'wireSegment')
      .map((s) => s.id);
    for (const segId of segIds) this.history.execute(new RemoveWireSegmentCommand(state, segId));

    // Then gates
    const gateIds = state.selection
      .filter((s): s is { type: 'gate'; id: GateId } => s.type === 'gate')
      .map((s) => s.id);
    for (const gateId of gateIds) this.history.execute(new RemoveGateCommand(state, gateId));

    this.setState((s) => { s.selection = []; s.dirty = true; });
  }

  /** Find a wire node anchored to this pin that has connected segments. */
  private findAnchoredNode(pinId: PinId, state: EditorState): WireNodeId | null {
    for (const node of state.circuit.wireNodes.values()) {
      if (node.pinId === pinId) {
        for (const seg of state.circuit.wireSegments.values()) {
          if (seg.from === node.id || seg.to === node.id) {
            return node.id;
          }
        }
      }
    }
    return null;
  }
}
