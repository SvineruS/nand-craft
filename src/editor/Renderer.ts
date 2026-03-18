import type { GateType, PinId } from '../types.ts';
import type { EditorState, Camera } from './EditorState.ts';
import { GRID_SIZE, GATE_DEFS, getGateDims, getPinPositions } from './geometry.ts';

// --- Colors (dark theme) ---
const COLORS = {
  background: '#1a1a2e',
  gridDot: '#2a2a4e',
  gateFill: '#2d2d4d',
  gateStroke: '#4a4a7a',
  gateText: '#e0e0e0',
  wireDefault: '#4a4a7a',
  wireActive: '#4ade80',
  wireZero: '#f87171',
  wireHighZ: '#4a4a6a',
  pinActive: '#4ade80',
  pinZero: '#f87171',
  pinHighZ: '#6b7280',
  selection: '#60a5fa',
  error: '#ef4444',
  selectionRectFill: 'rgba(96, 165, 250, 0.2)',
  selectionRectStroke: '#60a5fa',
  wireNodeFill: '#3a3a5a',
  wireNodeStroke: '#7a7aaa',
} as const;

interface Point {
  x: number;
  y: number;
}

function signalColor(value: number | null): string {
  if (value === null) return COLORS.wireHighZ;
  if (value === 0) return COLORS.wireZero;
  return COLORS.wireActive;
}

function pinColorForValue(value: number | null): string {
  if (value === null) return COLORS.pinHighZ;
  if (value === 0) return COLORS.pinZero;
  return COLORS.pinActive;
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animationId: number | null = null;
  private lastTime = 0;
  private wireAnimProgress = 0;
  private dpr = 1;
  private mouseWorld: Point = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2d context');
    this.ctx = ctx;
    this.handleResize();
  }

  render(state: EditorState): void {
    const { ctx } = this;
    const { camera } = state;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);

    ctx.save();
    ctx.translate(
      this.canvas.clientWidth / 2 - camera.x * camera.zoom,
      this.canvas.clientHeight / 2 - camera.y * camera.zoom,
    );
    ctx.scale(camera.zoom, camera.zoom);

    this.drawGrid(state);
    this.drawWireSegments(state);
    this.drawWireNodes(state);
    this.drawGates(state);
    this.drawPins(state);
    this.drawShortCircuitHighlights(state);
    this.drawSelectionHighlights(state);
    this.drawSelectionRect(state);
    this.drawWireInProgress(state);
    this.drawDropPreview(state);

    ctx.restore();
    ctx.restore();
  }

  startLoop(getState: () => EditorState): void {
    this.lastTime = performance.now();
    const tick = (time: number) => {
      const dt = (time - this.lastTime) / 1000;
      this.lastTime = time;
      this.wireAnimProgress = (this.wireAnimProgress + dt * 0.5) % 1;

      const state = getState();
      this.handleResize();
      this.render(state);
      state.dirty = false;
      this.animationId = requestAnimationFrame(tick);
    };
    this.animationId = requestAnimationFrame(tick);
  }

  stopLoop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  screenToWorld(sx: number, sy: number, camera: Camera): Point {
    return {
      x: (sx - this.canvas.clientWidth / 2) / camera.zoom + camera.x,
      y: (sy - this.canvas.clientHeight / 2) / camera.zoom + camera.y,
    };
  }

  worldToScreen(wx: number, wy: number, camera: Camera): Point {
    return {
      x: (wx - camera.x) * camera.zoom + this.canvas.clientWidth / 2,
      y: (wy - camera.y) * camera.zoom + this.canvas.clientHeight / 2,
    };
  }

  setMouseWorld(p: Point): void {
    this.mouseWorld = p;
  }

  // --- Private rendering methods ---

  private handleResize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const needsResize =
      this.canvas.width !== Math.round(w * this.dpr) ||
      this.canvas.height !== Math.round(h * this.dpr);
    if (needsResize) {
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
    }
  }

  private drawGrid(state: EditorState): void {
    const { ctx } = this;
    const { camera } = state;
    const vw = this.canvas.clientWidth / camera.zoom;
    const vh = this.canvas.clientHeight / camera.zoom;
    const left = camera.x - vw / 2;
    const top = camera.y - vh / 2;
    const right = camera.x + vw / 2;
    const bottom = camera.y + vh / 2;

    const startX = Math.floor(left / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor(top / GRID_SIZE) * GRID_SIZE;

    ctx.fillStyle = COLORS.gridDot;
    const dotRadius = 1;

    for (let gx = startX; gx <= right; gx += GRID_SIZE) {
      for (let gy = startY; gy <= bottom; gy += GRID_SIZE) {
        ctx.beginPath();
        ctx.arc(gx, gy, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawWireSegments(state: EditorState): void {
    const { ctx } = this;
    const { circuit } = state;

    // Build node→net value lookup (find any pin value on the same net)
    const nodeValue = new Map<string, number | null>();
    const nodeBitWidth = new Map<string, number>();
    for (const net of circuit.nets.values()) {
      let netValue: number | null = null;
      let netBitWidth = 1;
      for (const nodeId of net.nodeIds) {
        const node = circuit.wireNodes.get(nodeId);
        if (node?.pinId) {
          const pin = circuit.pins.get(node.pinId as PinId);
          if (pin) {
            if (pin.value !== null) netValue = pin.value;
            netBitWidth = pin.bitWidth;
          }
        }
      }
      for (const nodeId of net.nodeIds) {
        nodeValue.set(nodeId as string, netValue);
        nodeBitWidth.set(nodeId as string, netBitWidth);
      }
    }

    // Pass 1: draw wire bodies (custom color or neutral default)
    for (const segment of circuit.wireSegments.values()) {
      const fromNode = circuit.wireNodes.get(segment.from);
      const toNode = circuit.wireNodes.get(segment.to);
      if (!fromNode || !toNode) continue;

      const bitWidth = nodeBitWidth.get(segment.from as string) ?? nodeBitWidth.get(segment.to as string) ?? 1;
      const thickness = bitWidth > 1 ? 8 : 6;

      ctx.strokeStyle = segment.color ?? COLORS.wireDefault;
      ctx.lineWidth = thickness;
      ctx.lineCap = 'round';
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(fromNode.x, fromNode.y);
      ctx.lineTo(toNode.x, toNode.y);
      ctx.stroke();
    }

    // Pass 2: draw animated signal overlay (dashed colored line on top)
    for (const segment of circuit.wireSegments.values()) {
      const fromNode = circuit.wireNodes.get(segment.from);
      const toNode = circuit.wireNodes.get(segment.to);
      if (!fromNode || !toNode) continue;

      const value = nodeValue.get(segment.from as string) ?? nodeValue.get(segment.to as string) ?? null;
      if (value === null) continue;

      const color = signalColor(value);
      // Animated dash offset creates flowing motion
      const segLen = Math.hypot(toNode.x - fromNode.x, toNode.y - fromNode.y);
      const dashSize = 3;
      const offset = this.wireAnimProgress * dashSize * 4;

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.setLineDash([dashSize, dashSize]);
      ctx.lineDashOffset = -offset;
      ctx.beginPath();
      ctx.moveTo(fromNode.x, fromNode.y);
      ctx.lineTo(toNode.x, toNode.y);
      ctx.stroke();

      // Value label at midpoint
      if (segLen > 30) {
        const mx = (fromNode.x + toNode.x) / 2;
        const my = (fromNode.y + toNode.y) / 2;
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Small background pill
        const text = String(value);
        const tw = ctx.measureText(text).width + 6;
        ctx.fillStyle = COLORS.background;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.roundRect(mx - tw / 2, my - 6, tw, 12, 3);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.fillStyle = color;
        ctx.fillText(text, mx, my);
      }
    }
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    // Pass 3: draw wire labels
    for (const segment of circuit.wireSegments.values()) {
      if (!segment.label) continue;
      const fromNode = circuit.wireNodes.get(segment.from);
      const toNode = circuit.wireNodes.get(segment.to);
      if (!fromNode || !toNode) continue;

      // Position label slightly above midpoint
      const mx = (fromNode.x + toNode.x) / 2;
      const my = (fromNode.y + toNode.y) / 2;

      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const tw = ctx.measureText(segment.label).width + 6;

      // Background pill
      ctx.fillStyle = COLORS.background;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.roundRect(mx - tw / 2, my - 16, tw, 12, 3);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = segment.color ?? '#9ca3af';
      ctx.fillText(segment.label, mx, my - 5);
    }
  }

  private drawWireNodes(state: EditorState): void {
    const { ctx } = this;
    const { circuit } = state;

    // Count segments per node + find first connected segment color
    const segmentCount = new Map<string, number>();
    const nodeColor = new Map<string, string>();
    for (const seg of circuit.wireSegments.values()) {
      segmentCount.set(seg.from as string, (segmentCount.get(seg.from as string) ?? 0) + 1);
      segmentCount.set(seg.to as string, (segmentCount.get(seg.to as string) ?? 0) + 1);
      if (seg.color) {
        if (!nodeColor.has(seg.from as string)) nodeColor.set(seg.from as string, seg.color);
        if (!nodeColor.has(seg.to as string)) nodeColor.set(seg.to as string, seg.color);
      }
    }

    // Build node→net value lookup for free nodes
    const nodeNetValue = new Map<string, number | null>();
    for (const net of circuit.nets.values()) {
      let netValue: number | null = null;
      for (const nid of net.nodeIds) {
        const n = circuit.wireNodes.get(nid);
        if (n?.pinId) {
          const p = circuit.pins.get(n.pinId as PinId);
          if (p && p.value !== null) netValue = p.value;
        }
      }
      for (const nid of net.nodeIds) nodeNetValue.set(nid as string, netValue);
    }

    for (const node of circuit.wireNodes.values()) {
      const count = segmentCount.get(node.id as string) ?? 0;
      if (count === 0 && !node.pinId) continue;

      const pin = node.pinId ? circuit.pins.get(node.pinId as PinId) : null;
      const value = pin?.value ?? nodeNetValue.get(node.id as string) ?? null;
      const customColor = nodeColor.get(node.id as string);
      const isHovered = state.hoveredEndpoint?.kind === 'node' && state.hoveredEndpoint.nodeId === node.id;

      // Wire node: filled circle with stroke
      const radius = isHovered ? 7 : 5;
      ctx.fillStyle = COLORS.wireNodeFill;
      ctx.strokeStyle = isHovered ? COLORS.selection : (customColor ?? COLORS.wireDefault);
      ctx.lineWidth = isHovered ? 3 : 2.5;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Signal indicator dot inside
      if (value !== null) {
        ctx.fillStyle = signalColor(value);
        ctx.beginPath();
        ctx.arc(node.x, node.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawGates(state: EditorState): void {
    const { ctx } = this;
    const { circuit, shortCircuitGates } = state;

    for (const gate of circuit.gates.values()) {
      const { w, h } = getGateDims(gate);
      const def = GATE_DEFS[gate.type];

      const cx = gate.x + w / 2;
      const cy = gate.y + h / 2;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((gate.rotation * Math.PI) / 180);

      if (def.svg) {
        // SVG shape rendering
        const path = this.getGatePath(gate.type);
        ctx.save();
        ctx.translate(-w / 2, -h / 2);
        ctx.scale(GRID_SIZE, GRID_SIZE);
        ctx.fillStyle = COLORS.gateFill;
        ctx.fill(path);
        ctx.restore();

        // Stroke at pixel scale (not scaled by GRID_SIZE)
        ctx.save();
        ctx.translate(-w / 2, -h / 2);
        ctx.scale(GRID_SIZE, GRID_SIZE);
        ctx.strokeStyle = COLORS.gateStroke;
        ctx.lineWidth = 1.5 / GRID_SIZE;
        ctx.stroke(path);
        ctx.restore();
      } else {
        // Fallback: plain rectangle
        ctx.fillStyle = COLORS.gateFill;
        ctx.strokeStyle = COLORS.gateStroke;
        ctx.lineWidth = 1.5;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.strokeRect(-w / 2, -h / 2, w, h);
      }

      // Label — show value for input/constant gates
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (gate.type === 'input' || gate.type === 'constant') {
        const outPin = gate.outputPins[0] ? circuit.pins.get(gate.outputPins[0]) : undefined;
        const val = outPin?.value;
        ctx.fillStyle = val !== null && val !== undefined ? signalColor(val) : COLORS.gateText;
        ctx.font = 'bold 13px monospace';
        ctx.fillText(val !== null && val !== undefined ? String(val) : '?', 0, 0);
      } else {
        ctx.fillStyle = COLORS.gateText;
        ctx.font = 'bold 11px monospace';
        ctx.fillText(def.label, 0, 0);
      }

      ctx.restore();

      // Short circuit: red glow border
      if (shortCircuitGates.includes(gate.id)) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((gate.rotation * Math.PI) / 180);
        ctx.strokeStyle = COLORS.error;
        ctx.lineWidth = 2;
        ctx.shadowColor = COLORS.error;
        ctx.shadowBlur = 8;
        ctx.strokeRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2);
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }
  }

  /** Get or create cached Path2D for a gate type's SVG shape. */
  private gatePaths = new Map<GateType, Path2D>();
  private getGatePath(type: GateType): Path2D {
    let path = this.gatePaths.get(type);
    if (!path) {
      const def = GATE_DEFS[type];
      path = new Path2D(def.svg ?? '');
      this.gatePaths.set(type, path);
    }
    return path;
  }

  private drawPins(state: EditorState): void {
    const { ctx } = this;
    const { circuit } = state;

    for (const gate of circuit.gates.values()) {
      const positions = getPinPositions(gate, circuit.pins);
      for (const [pinId, pos] of positions) {
        const pin = circuit.pins.get(pinId);
        if (!pin) continue;

        const isHovered = state.hoveredEndpoint?.kind === 'pin' && state.hoveredEndpoint.pinId === pin.id;
        const radius = isHovered ? 5 : 3.5;

        ctx.fillStyle = pinColorForValue(pin.value);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();

        if (isHovered) {
          ctx.strokeStyle = COLORS.selection;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }
  }

  private drawShortCircuitHighlights(state: EditorState): void {
    const { shortCircuitGates, contentionNets, circuit } = state;
    if (shortCircuitGates.length === 0 && contentionNets.length === 0) return;

    const { ctx } = this;

    const errorSegments = new Set<string>();

    // Short circuit: find segments on nets touching error gate pins
    if (shortCircuitGates.length > 0) {
      const errorPinIds = new Set<string>();
      for (const gateId of shortCircuitGates) {
        const gate = circuit.gates.get(gateId);
        if (!gate) continue;
        for (const p of [...gate.inputPins, ...gate.outputPins]) errorPinIds.add(p as string);
      }
      for (const net of circuit.nets.values()) {
        let touchesErrorGate = false;
        for (const nid of net.nodeIds) {
          const node = circuit.wireNodes.get(nid);
          if (node?.pinId && errorPinIds.has(node.pinId as string)) {
            touchesErrorGate = true;
            break;
          }
        }
        if (touchesErrorGate) {
          for (const sid of net.segmentIds) errorSegments.add(sid as string);
        }
      }
    }

    // Bus contention: find segments on contention nets
    if (contentionNets.length > 0) {
      const contentionSet = new Set(contentionNets);
      for (const net of circuit.nets.values()) {
        if (contentionSet.has(net.id as string)) {
          for (const sid of net.segmentIds) errorSegments.add(sid as string);
        }
      }
    }

    if (errorSegments.size === 0) return;

    // Draw red pulsing overlay on error segments
    ctx.strokeStyle = COLORS.error;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.lineDashOffset = -this.wireAnimProgress * 12;
    ctx.shadowColor = COLORS.error;
    ctx.shadowBlur = 6;
    ctx.lineCap = 'round';

    for (const seg of circuit.wireSegments.values()) {
      if (!errorSegments.has(seg.id as string)) continue;
      const from = circuit.wireNodes.get(seg.from);
      const to = circuit.wireNodes.get(seg.to);
      if (!from || !to) continue;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    // Draw ! label at midpoint of error segments (same style as wire value labels)
    for (const seg of circuit.wireSegments.values()) {
      if (!errorSegments.has(seg.id as string)) continue;
      const from = circuit.wireNodes.get(seg.from);
      const to = circuit.wireNodes.get(seg.to);
      if (!from || !to) continue;
      const segLen = Math.hypot(to.x - from.x, to.y - from.y);
      if (segLen < 20) continue;

      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2;

      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const tw = ctx.measureText('!').width + 6;
      ctx.fillStyle = COLORS.background;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.roundRect(mx - tw / 2, my - 6, tw, 12, 3);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = COLORS.error;
      ctx.fillText('!', mx, my);
    }
  }

  private drawSelectionHighlights(state: EditorState): void {
    const { ctx } = this;
    const { circuit, selection } = state;

    ctx.strokeStyle = COLORS.selection;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);

    for (const item of selection) {
      switch (item.type) {
        case 'gate': {
          const gate = circuit.gates.get(item.id);
          if (!gate) break;
          const { w, h } = getGateDims(gate);
          const cx = gate.x + w / 2;
          const cy = gate.y + h / 2;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate((gate.rotation * Math.PI) / 180);
          ctx.strokeRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
          ctx.restore();
          break;
        }
        case 'wireNode': {
          const node = circuit.wireNodes.get(item.id);
          if (!node) break;
          ctx.beginPath();
          ctx.arc(node.x, node.y, 8, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'wireSegment': {
          const seg = circuit.wireSegments.get(item.id);
          if (!seg) break;
          const from = circuit.wireNodes.get(seg.from);
          const to = circuit.wireNodes.get(seg.to);
          if (!from || !to) break;
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
          ctx.lineWidth = 2;
          break;
        }
      }
    }

    ctx.setLineDash([]);
  }

  private drawSelectionRect(state: EditorState): void {
    if (!state.selectionRect) return;
    const { ctx } = this;
    const { x, y, w, h } = state.selectionRect;

    ctx.fillStyle = COLORS.selectionRectFill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = COLORS.selectionRectStroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  }

  private drawWireInProgress(state: EditorState): void {
    if (!state.wireStart) return;

    const { ctx } = this;

    ctx.strokeStyle = COLORS.selection;
    ctx.lineWidth = 4;
    ctx.setLineDash([3, 3]);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(state.wireStart.x, state.wireStart.y);
    ctx.lineTo(this.mouseWorld.x, this.mouseWorld.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawDropPreview(state: EditorState): void {
    if (!state.dropPreview) return;

    const { ctx } = this;
    const { type, x, y } = state.dropPreview;
    const def = GATE_DEFS[type];
    const w = def.width * GRID_SIZE;
    const h = def.height * GRID_SIZE;

    ctx.globalAlpha = 0.4;
    ctx.fillStyle = COLORS.gateFill;
    ctx.strokeStyle = COLORS.selection;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = COLORS.gateText;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.label, x + w / 2, y + h / 2);
    ctx.globalAlpha = 1;
  }
}
