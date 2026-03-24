import type { GateType, PinId } from '../types.ts';
import type { EditorState, Camera } from './EditorState.ts';
import { WIRE_COLORS } from './EditorState.ts';
import { GATE_DEFS } from './gateDefs.ts';
import { GRID_SIZE, getGateDims, getPinPositions, snapToGrid, getAllPinIds } from './geometry.ts';

// --- Colors (dark theme) ---
const COLORS = {
  background: '#181825',
  gridDot: '#313150',
  gateFill: '#2d2d4d',
  gateStroke: '#5a5a8a',
  gateText: '#e8e8f0',
  wireDefault: '#555580',
  wireActive: '#4ade80',
  wireZero: '#f87171',
  wireHighZ: '#45456a',
  pinActive: '#5eebb0',
  pinZero: '#f87171',
  pinHighZ: '#7a7a90',
  selection: '#6cb4ff',
  error: '#ef4444',
  selectionRectFill: 'rgba(108, 180, 255, 0.15)',
  selectionRectStroke: '#6cb4ff',
  wireNodeFill: '#3e3e60',
  wireNodeStroke: '#8888bb',
} as const;

interface Point {
  x: number;
  y: number;
}

function signalColor(value: number | null, bitWidth = 1): string {
  if (value === null) return COLORS.wireHighZ;
  if (bitWidth <= 1) {
    return value === 0 ? COLORS.wireZero : COLORS.wireActive;
  }
  // Multi-bit: gradient from blue (0) through cyan/green/yellow to magenta (max)
  const max = ((1 << bitWidth) >>> 0) - 1;
  const t = max > 0 ? value / max : 0;
  return multibitGradient(t);
}

/**
 * Map 0..1 to a rainbow-ish gradient: blue → cyan → green → yellow → orange → magenta.
 *
 * Color stops:
 *  - t=0.0: blue  (60, 130, 255) — represents the minimum multi-bit value (0)
 *  - t=0.5: cyan/green (250, 220, 80) — midpoint of the value range
 *  - t=1.0: magenta (255, 100, 220) — represents the maximum multi-bit value
 */
function multibitGradient(t: number): string {
  const r = Math.round(lerp3(60, 250, 255, t));
  const g = Math.round(lerp3(130, 220, 100, t));
  const b = Math.round(lerp3(255, 80, 220, t));
  return `rgb(${r},${g},${b})`;
}

function lerp3(a: number, b: number, c: number, t: number): number {
  if (t < 0.5) return a + (b - a) * (t * 2);
  return b + (c - b) * ((t - 0.5) * 2);
}

function pinColorForValue(value: number | null): string {
  if (value === null) return COLORS.pinHighZ;
  if (value === 0) return COLORS.pinZero;
  return COLORS.pinActive;
}

/** Stroke color for pins based on bit width. */
function pinStrokeForWidth(bitWidth: number): string {
  if (bitWidth >= 16) return '#f472b6'; // pink
  if (bitWidth >= 8) return '#60a5fa';  // blue
  return '#fb923c';                      // orange (1-bit)
}

/** Format value for wire label based on bit width. */
function formatWireValue(value: number, bitWidth: number): string {
  if (bitWidth >= 16) return '0x' + value.toString(16).toUpperCase();
  if (bitWidth >= 8) return String(value);
  return value ? 'T' : 'F';
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
    this.drawPastePreview(state);

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
      if (state.renderDirty || state.circuitDirty) {
        this.render(state);
        state.renderDirty = false;
        state.circuitDirty = false;
      }
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

  getMouseWorld(): Point {
    return this.mouseWorld;
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

  /**
   * Trace an L-shaped routed path from (ax,ay) to (bx,by) using only
   * horizontal, vertical, and 45° diagonal segments.
   *
   * Routing strategy:
   *  - If already axis-aligned or perfectly diagonal: draw a straight line.
   *  - If horizontal distance > vertical distance: go horizontal first to
   *    consume the excess, then diagonal to reach the target.
   *  - Otherwise: go vertical first, then diagonal.
   * This produces clean two-segment paths (cardinal + 45° diagonal).
   */
  private traceRoutedPath(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number): void {
    ctx.moveTo(ax, ay);

    const dx = bx - ax;
    const dy = by - ay;

    // Already aligned on one axis — straight line
    if (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) {
      ctx.lineTo(bx, by);
      return;
    }

    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);

    if (adx > ady) {
      // Go horizontal first, then diagonal
      const hLen = adx - ady;
      const midX = ax + hLen * sx;
      ctx.lineTo(midX, ay);
      ctx.lineTo(bx, by);
    } else {
      // Go vertical first, then diagonal
      const vLen = ady - adx;
      const midY = ay + vLen * sy;
      ctx.lineTo(ax, midY);
      ctx.lineTo(bx, by);
    }
  }

  /**
   * Find the midpoint along the actual routed path length (not the straight-line
   * midpoint). Computes the two-segment path from traceRoutedPath, measures each
   * segment's length, then walks exactly half the total distance to place labels
   * and markers at the visual center of the wire.
   */
  private routedMidpoint(ax: number, ay: number, bx: number, by: number): { x: number; y: number } {
    const dx = bx - ax;
    const dy = by - ay;

    if (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) {
      return { x: (ax + bx) / 2, y: (ay + by) / 2 };
    }

    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);

    // Build the 2 or 3 points of the routed path
    let midX: number, midY: number;
    if (adx > ady) {
      midX = ax + (adx - ady) * sx;
      midY = ay;
    } else {
      midX = ax;
      midY = ay + (ady - adx) * sy;
    }

    // Points: A → mid → B. Find midpoint along total path length.
    const seg1 = Math.hypot(midX - ax, midY - ay);
    const seg2 = Math.hypot(bx - midX, by - midY);
    const total = seg1 + seg2;
    const half = total / 2;

    if (half <= seg1) {
      const t = seg1 > 0 ? half / seg1 : 0;
      return { x: ax + (midX - ax) * t, y: ay + (midY - ay) * t };
    } else {
      const t = seg2 > 0 ? (half - seg1) / seg2 : 0;
      return { x: midX + (bx - midX) * t, y: midY + (by - midY) * t };
    }
  }

  /** Total length of the routed path from A to B. */
  private routedPathLength(ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    if (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) {
      return Math.hypot(dx, dy);
    }
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    let midX: number, midY: number;
    if (adx > ady) { midX = ax + (adx - ady) * sx; midY = ay; }
    else { midX = ax; midY = ay + (ady - adx) * sy; }
    return Math.hypot(midX - ax, midY - ay) + Math.hypot(bx - midX, by - midY);
  }

  /** Point at fraction t (0..1) along the routed path. */
  private routedPointAt(ax: number, ay: number, bx: number, by: number, t: number): { x: number; y: number } {
    const dx = bx - ax;
    const dy = by - ay;
    if (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) {
      return { x: ax + dx * t, y: ay + dy * t };
    }
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    let midX: number, midY: number;
    if (adx > ady) { midX = ax + (adx - ady) * sx; midY = ay; }
    else { midX = ax; midY = ay + (ady - adx) * sy; }
    const seg1 = Math.hypot(midX - ax, midY - ay);
    const seg2 = Math.hypot(bx - midX, by - midY);
    const total = seg1 + seg2;
    const dist = t * total;
    if (dist <= seg1) {
      const s = seg1 > 0 ? dist / seg1 : 0;
      return { x: ax + (midX - ax) * s, y: ay + (midY - ay) * s };
    } else {
      const s = seg2 > 0 ? (dist - seg1) / seg2 : 0;
      return { x: midX + (bx - midX) * s, y: midY + (by - midY) * s };
    }
  }

  private drawWireSegments(state: EditorState): void {
    const { ctx } = this;
    const { circuit } = state;

    // Build node→net value lookup.
    // Each "net" is a set of wire nodes electrically connected together.
    // We scan all nodes in each net to find one that is anchored to a gate pin,
    // then propagate that pin's value and bit width to every node on the same
    // net. This lets us color wire segments by their signal value even though
    // only pin-anchored nodes carry values directly.
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
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);
      ctx.beginPath();
      this.traceRoutedPath(ctx, fromNode.x, fromNode.y, toNode.x, toNode.y);
      ctx.stroke();
    }

    // Pass 2: draw animated signal overlay (dashed colored line on top)
    for (const segment of circuit.wireSegments.values()) {
      const fromNode = circuit.wireNodes.get(segment.from);
      const toNode = circuit.wireNodes.get(segment.to);
      if (!fromNode || !toNode) continue;

      const value = nodeValue.get(segment.from as string) ?? nodeValue.get(segment.to as string) ?? null;
      if (value === null) continue;

      const bitWidth = nodeBitWidth.get(segment.from as string) ?? nodeBitWidth.get(segment.to as string) ?? 1;
      const color = signalColor(value, bitWidth);
      // Animated dash offset creates flowing motion
      const segLen = Math.hypot(toNode.x - fromNode.x, toNode.y - fromNode.y);
      const dashSize = 3;
      const offset = this.wireAnimProgress * dashSize * 4;

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([dashSize, dashSize]);
      ctx.lineDashOffset = -offset;
      ctx.beginPath();
      this.traceRoutedPath(ctx, fromNode.x, fromNode.y, toNode.x, toNode.y);
      ctx.stroke();

      // Value labels spaced along the routed path
      if (segLen > 30) {
        const bw = nodeBitWidth.get(segment.from as string) ?? nodeBitWidth.get(segment.to as string) ?? 1;
        const text = formatWireValue(value, bw);
        ctx.setLineDash([]);
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(text).width + 6;

        // Compute routed path total length and place labels every ~80px
        const labelSpacing = 80;
        const pathLen = this.routedPathLength(fromNode.x, fromNode.y, toNode.x, toNode.y);
        const labelCount = Math.max(1, Math.floor(pathLen / labelSpacing));
        for (let li = 0; li < labelCount; li++) {
          const t = labelCount === 1 ? 0.5 : (li + 0.5) / labelCount;
          const pt = this.routedPointAt(fromNode.x, fromNode.y, toNode.x, toNode.y, t);

          ctx.fillStyle = COLORS.background;
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          ctx.roundRect(pt.x - tw / 2, pt.y - 6, tw, 12, 3);
          ctx.fill();
          ctx.globalAlpha = 1;

          ctx.fillStyle = color;
          ctx.fillText(text, pt.x, pt.y);
        }
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

      // Position label slightly above midpoint of routed path
      const mid = this.routedMidpoint(fromNode.x, fromNode.y, toNode.x, toNode.y);
      const mx = mid.x;
      const my = mid.y;

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

    // Build node→net value + bitWidth lookup for free nodes
    const nodeNetValue = new Map<string, number | null>();
    const nodeNetBitWidth = new Map<string, number>();
    for (const net of circuit.nets.values()) {
      let netValue: number | null = null;
      let netBw = 1;
      for (const nid of net.nodeIds) {
        const n = circuit.wireNodes.get(nid);
        if (n?.pinId) {
          const p = circuit.pins.get(n.pinId as PinId);
          if (p) {
            if (p.value !== null) netValue = p.value;
            netBw = p.bitWidth;
          }
        }
      }
      for (const nid of net.nodeIds) {
        nodeNetValue.set(nid as string, netValue);
        nodeNetBitWidth.set(nid as string, netBw);
      }
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
        const bw = pin?.bitWidth ?? nodeNetBitWidth.get(node.id as string) ?? 1;
        ctx.fillStyle = signalColor(value, bw);
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

      const gateFill = def.color ?? COLORS.gateFill;
      const gateStroke = def.stroke ?? COLORS.gateStroke;

      if (def.svg) {
        const path = this.getGatePath(gate.type);
        ctx.save();
        ctx.translate(-w / 2, -h / 2);
        ctx.scale(GRID_SIZE, GRID_SIZE);
        ctx.fillStyle = gateFill;
        ctx.fill(path);
        ctx.strokeStyle = gateStroke;
        ctx.lineWidth = 1.5 / GRID_SIZE;
        ctx.stroke(path);
        ctx.restore();
      } else {
        ctx.fillStyle = gateFill;
        ctx.strokeStyle = gateStroke;
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
        const labelX = (def.labelX ?? 0) * GRID_SIZE;
        const labelY = (def.labelY ?? 0) * GRID_SIZE;
        if (gate.label) {
          // Show custom label above the value
          ctx.fillStyle = COLORS.gateText;
          ctx.font = 'bold 10px monospace';
          ctx.fillText(gate.label, labelX, labelY - 0.6 * GRID_SIZE);
        }
        ctx.fillStyle = val !== null && val !== undefined ? signalColor(val) : COLORS.gateText;
        ctx.font = 'bold 13px monospace';
        ctx.fillText(val !== null && val !== undefined ? String(val) : '?', labelX, labelY);
      } else {
        ctx.fillStyle = COLORS.gateText;
        ctx.font = 'bold 11px monospace';
        ctx.fillText(gate.label ?? def.label, (def.labelX ?? 0) * GRID_SIZE, (def.labelY ?? 0) * GRID_SIZE);
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
      const positions = getPinPositions(gate);
      for (const [pinId, pos] of positions) {
        const pin = circuit.pins.get(pinId);
        if (!pin) continue;

        const isHovered = state.hoveredEndpoint?.kind === 'pin' && state.hoveredEndpoint.pinId === pin.id;
        const radius = isHovered ? 5 : 3.5;

        ctx.fillStyle = pinColorForValue(pin.value);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Stroke ring: color by bit width, highlight on hover
        ctx.strokeStyle = isHovered ? COLORS.selection : pinStrokeForWidth(pin.bitWidth);
        ctx.lineWidth = isHovered ? 1.5 : 1;
        ctx.stroke();
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
        for (const p of getAllPinIds(gate)) errorPinIds.add(p as string);
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
      this.traceRoutedPath(ctx, from.x, from.y, to.x, to.y);
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

      const mid = this.routedMidpoint(from.x, from.y, to.x, to.y);
      const mx = mid.x;
      const my = mid.y;

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
          ctx.beginPath();
          this.traceRoutedPath(ctx, from.x, from.y, to.x, to.y);
          ctx.stroke();
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
    const wireColor = state.wireColor === WIRE_COLORS[0] ? COLORS.wireDefault : state.wireColor;
    const tx = snapToGrid(this.mouseWorld.x);
    const ty = snapToGrid(this.mouseWorld.y);

    ctx.strokeStyle = wireColor;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    this.traceRoutedPath(ctx, state.wireStart.x, state.wireStart.y, tx, ty);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawDropPreview(state: EditorState): void {
    if (!state.dropPreview) return;

    const { ctx } = this;
    const { type, x, y } = state.dropPreview;
    const def = GATE_DEFS[type];
    const w = def.width * GRID_SIZE;
    const h = def.height * GRID_SIZE;

    ctx.globalAlpha = 0.5;

    if (def.svg) {
      const path = this.getGatePath(type);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(GRID_SIZE, GRID_SIZE);
      ctx.fillStyle = def.color ?? COLORS.gateFill;
      ctx.fill(path);
      ctx.strokeStyle = def.stroke ?? COLORS.selection;
      ctx.lineWidth = 1.5 / GRID_SIZE;
      ctx.stroke(path);
      ctx.restore();
    } else {
      ctx.fillStyle = def.color ?? COLORS.gateFill;
      ctx.strokeStyle = def.stroke ?? COLORS.selection;
      ctx.lineWidth = 1.5;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }

    // Label
    ctx.fillStyle = COLORS.gateText;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.label, x + w / 2 + (def.labelX ?? 0) * GRID_SIZE, y + h / 2 + (def.labelY ?? 0) * GRID_SIZE);

    // Pins
    for (const pin of def.pins) {
      const px = x + pin.x * GRID_SIZE;
      const py = y + pin.y * GRID_SIZE;
      ctx.fillStyle = COLORS.pinHighZ;
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  private drawPastePreview(state: EditorState): void {
    if (!state.pasteMode || !state.clipboard || !state.pasteCursor) return;

    const { ctx } = this;
    const { pasteCursor: cursor, clipboard: clip } = state;

    ctx.globalAlpha = 0.4;

    // Draw ghost gates
    for (const cg of clip.gates) {
      const def = GATE_DEFS[cg.type];
      const gw = def.width * GRID_SIZE;
      const gh = def.height * GRID_SIZE;
      const gx = snapToGrid(cursor.x + cg.dx - gw / 2);
      const gy = snapToGrid(cursor.y + cg.dy - gh / 2);

      if (def.svg) {
        const path = this.getGatePath(cg.type);
        ctx.save();
        ctx.translate(gx, gy);
        ctx.scale(GRID_SIZE, GRID_SIZE);
        ctx.fillStyle = def.color ?? COLORS.gateFill;
        ctx.fill(path);
        ctx.strokeStyle = def.stroke ?? COLORS.selection;
        ctx.lineWidth = 1.5 / GRID_SIZE;
        ctx.stroke(path);
        ctx.restore();
      } else {
        ctx.fillStyle = def.color ?? COLORS.gateFill;
        ctx.strokeStyle = def.stroke ?? COLORS.selection;
        ctx.lineWidth = 1.5;
        ctx.fillRect(gx, gy, gw, gh);
        ctx.strokeRect(gx, gy, gw, gh);
      }

      // Label
      ctx.fillStyle = COLORS.gateText;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.label, gx + gw / 2 + (def.labelX ?? 0) * GRID_SIZE, gy + gh / 2 + (def.labelY ?? 0) * GRID_SIZE);

      // Pins
      for (const pin of def.pins) {
        ctx.fillStyle = COLORS.pinHighZ;
        ctx.beginPath();
        ctx.arc(gx + pin.x * GRID_SIZE, gy + pin.y * GRID_SIZE, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw ghost wire segments
    ctx.strokeStyle = COLORS.selection;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const cw of clip.wires) {
      const fromNode = clip.nodes[cw.fromNodeIdx];
      const toNode = clip.nodes[cw.toNodeIdx];
      if (!fromNode || !toNode) continue;
      const fx = snapToGrid(cursor.x + fromNode.dx);
      const fy = snapToGrid(cursor.y + fromNode.dy);
      const tx = snapToGrid(cursor.x + toNode.dx);
      const ty = snapToGrid(cursor.y + toNode.dy);
      ctx.beginPath();
      this.traceRoutedPath(ctx, fx, fy, tx, ty);
      ctx.stroke();
    }

    // Draw ghost wire nodes (free only)
    for (const cn of clip.nodes) {
      if (cn.gateIdx !== undefined) continue; // anchored nodes shown via gate pins
      const nx = snapToGrid(cursor.x + cn.dx);
      const ny = snapToGrid(cursor.y + cn.dy);
      ctx.fillStyle = COLORS.wireNodeFill;
      ctx.strokeStyle = COLORS.selection;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(nx, ny, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }
}
