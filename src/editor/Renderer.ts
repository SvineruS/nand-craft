import type { GateType } from '../types.ts';
import type { EditorState, Camera } from './EditorState.ts';
import { WIRE_COLORS } from './EditorState.ts';
import { getGateDefinition } from '../levels/gates.ts';
import { GRID_SIZE, getGateDims, getPinPositions, getAllPinIds, gateGridOffset, gateCenter } from './utils/geometry.ts';
import { Vec2, routeCorner, routePointAt, routeLength } from './utils/vec2.ts';
import { screenToWorld as stw, worldToScreen as wts } from '../engine/camera.ts';

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

const GRID_DOT_RADIUS = 1;
const WIRE_DASH_SIZE = 3;
const WIRE_LABEL_SPACING = 80;
const WIRE_LABEL_MIN_LENGTH = 30;

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
  private mouseWorld: Vec2 = { x: 0, y: 0 };

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
      this.canvas.clientWidth / 2 - camera.pos.x * camera.zoom,
      this.canvas.clientHeight / 2 - camera.pos.y * camera.zoom,
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

  startLoop(getState: () => EditorState, onCircuitDirty?: () => void): void {
    this.lastTime = performance.now();
    const tick = (time: number) => {
      const dt = (time - this.lastTime) / 1000;
      this.lastTime = time;
      this.wireAnimProgress = (this.wireAnimProgress + dt * 0.5) % 1;

      const state = getState();
      this.handleResize();
      if (state.circuitDirty) {
        onCircuitDirty?.();
      }
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

  screenToWorld(screen: Vec2, camera: Camera): Vec2 {
    return stw(screen, camera, this.canvas.clientWidth, this.canvas.clientHeight);
  }

  worldToScreen(world: Vec2, camera: Camera): Vec2 {
    return wts(world, camera, this.canvas.clientWidth, this.canvas.clientHeight);
  }

  setMouseWorld(p: Vec2): void {
    this.mouseWorld = p;
  }

  getMouseWorld(): Vec2 {
    return this.mouseWorld;
  }

  // --- Private helpers ---

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

  /** Get or create cached Path2D for a gate type's SVG shape. */
  private gatePaths = new Map<GateType, Path2D>();
  private getGatePath(type: GateType): Path2D {
    let path = this.gatePaths.get(type);
    if (!path) {
      const def = getGateDefinition(type);
      path = new Path2D(def.svg ?? '');
      this.gatePaths.set(type, path);
    }
    return path;
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
  private traceRoutedPath(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2): void {
    ctx.moveTo(a.x, a.y);
    const c = routeCorner(a, b);
    if (c) ctx.lineTo(c.x, c.y);
    ctx.lineTo(b.x, b.y);
  }

  // --- Draw methods (in render() call order) ---

  private drawGrid(state: EditorState): void {
    const { ctx } = this;
    const { camera } = state;
    const vw = this.canvas.clientWidth / camera.zoom;
    const vh = this.canvas.clientHeight / camera.zoom;
    const left = camera.pos.x - vw / 2;
    const top = camera.pos.y - vh / 2;
    const right = camera.pos.x + vw / 2;
    const bottom = camera.pos.y + vh / 2;

    const startX = Math.floor(left / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor(top / GRID_SIZE) * GRID_SIZE;

    ctx.fillStyle = COLORS.gridDot;
    for (let gx = startX; gx <= right; gx += GRID_SIZE) {
      for (let gy = startY; gy <= bottom; gy += GRID_SIZE) {
        ctx.beginPath();
        ctx.arc(gx, gy, GRID_DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
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
        const node = circuit.getWireNode(nodeId);
        if (node.pinId) {
          const pin = circuit.getPin(node.pinId);
          if (pin.value !== null) netValue = pin.value;
          netBitWidth = pin.bitWidth;
        }
      }
      for (const nodeId of net.nodeIds) {
        nodeValue.set(nodeId as string, netValue);
        nodeBitWidth.set(nodeId as string, netBitWidth);
      }
    }

    // Pass 1: draw wire bodies (custom color or neutral default)
    for (const segment of circuit.wireSegments.values()) {
      const fromNode = circuit.getWireNode(segment.from);
      const toNode = circuit.getWireNode(segment.to);

      const bitWidth = nodeBitWidth.get(segment.from as string) ?? nodeBitWidth.get(segment.to as string) ?? 1;
      const thickness = bitWidth > 1 ? 8 : 6;

      ctx.strokeStyle = segment.color ?? COLORS.wireDefault;
      ctx.lineWidth = thickness;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);
      ctx.beginPath();
      this.traceRoutedPath(ctx, fromNode.pos, toNode.pos);
      ctx.stroke();
    }

    // Pass 2: draw animated signal overlay (dashed colored line on top)
    for (const segment of circuit.wireSegments.values()) {
      const fromNode = circuit.getWireNode(segment.from);
      const toNode = circuit.getWireNode(segment.to);

      const value = nodeValue.get(segment.from as string) ?? nodeValue.get(segment.to as string) ?? null;
      if (value === null) continue;

      const bitWidth = nodeBitWidth.get(segment.from as string) ?? nodeBitWidth.get(segment.to as string) ?? 1;
      const color = signalColor(value, bitWidth);
      // Animated dash offset creates flowing motion
      const segLen = Vec2.dist(fromNode.pos, toNode.pos);
      const dashOffset = this.wireAnimProgress * WIRE_DASH_SIZE * 4;

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([WIRE_DASH_SIZE, WIRE_DASH_SIZE]);
      ctx.lineDashOffset = -dashOffset;
      ctx.beginPath();
      this.traceRoutedPath(ctx, fromNode.pos, toNode.pos);
      ctx.stroke();

      // Value labels spaced along the routed path
      if (segLen > WIRE_LABEL_MIN_LENGTH) {
        const bw = nodeBitWidth.get(segment.from as string) ?? nodeBitWidth.get(segment.to as string) ?? 1;
        const text = formatWireValue(value, bw);
        ctx.setLineDash([]);
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(text).width + 6;

        // Compute routed path total length and place labels every ~80px
        const pathLen = routeLength(fromNode.pos, toNode.pos);
        const labelCount = Math.max(1, Math.floor(pathLen / WIRE_LABEL_SPACING));
        for (let li = 0; li < labelCount; li++) {
          const t = labelCount === 1 ? 0.5 : (li + 0.5) / labelCount;
          const pt = routePointAt(fromNode.pos, toNode.pos, t);

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
      const fromNode = circuit.getWireNode(segment.from);
      const toNode = circuit.getWireNode(segment.to);

      // Position label slightly above midpoint of routed path
      const mid = routePointAt(fromNode.pos, toNode.pos, 0.5);
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
        const n = circuit.getWireNode(nid);
        if (n.pinId) {
          const p = circuit.getPin(n.pinId);
          if (p.value !== null) netValue = p.value;
          netBw = p.bitWidth;
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

      const pin = node.pinId ? circuit.getPin(node.pinId) : null;
      const value = pin?.value ?? nodeNetValue.get(node.id as string) ?? null;
      const customColor = nodeColor.get(node.id as string);
      const isHovered = state.hoveredEndpoint?.kind === 'node' && state.hoveredEndpoint.nodeId === node.id;

      // Wire node: filled circle with stroke
      const radius = isHovered ? 7 : 5;
      ctx.fillStyle = COLORS.wireNodeFill;
      ctx.strokeStyle = isHovered ? COLORS.selection : (customColor ?? COLORS.wireDefault);
      ctx.lineWidth = isHovered ? 3 : 2.5;
      ctx.beginPath();
      ctx.arc(node.pos.x, node.pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Signal indicator dot inside
      if (value !== null) {
        const bw = pin?.bitWidth ?? nodeNetBitWidth.get(node.id as string) ?? 1;
        ctx.fillStyle = signalColor(value, bw);
        ctx.beginPath();
        ctx.arc(node.pos.x, node.pos.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawGates(state: EditorState): void {
    const { ctx } = this;
    const { circuit, shortCircuitGates } = state;

    for (const gate of circuit.gates.values()) {
      const { w, h } = getGateDims(gate);
      const def = getGateDefinition(gate.type);
      const center = gateCenter(gate);

      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate((gate.rotation * Math.PI) / 180);

      let gateFill = def.color ?? COLORS.gateFill;
      let gateStroke = def.stroke ?? COLORS.gateStroke;
      if (gate.status === 'locked') { gateFill = '#333345'; gateStroke = '#555568'; }
      else if (gate.status === 'available') { gateFill = '#2d3d5d'; gateStroke = '#6cb4ff'; }
      else if (gate.status === 'solved') { gateFill = '#2d4d2d'; gateStroke = '#5a8a5a'; }

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
        const outPin = circuit.getPin(gate.outputPins[0]);
        const val = outPin.value;
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
        ctx.translate(center.x, center.y);
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

  private drawPins(state: EditorState): void {
    const { ctx } = this;
    const { circuit } = state;

    for (const gate of circuit.gates.values()) {
      const positions = getPinPositions(gate);
      for (const [pinId, pos] of positions) {
        const pin = circuit.getPin(pinId);
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
        const gate = circuit.getGate(gateId);
        for (const p of getAllPinIds(gate)) errorPinIds.add(p as string);
      }
      for (const net of circuit.nets.values()) {
        let touchesErrorGate = false;
        for (const nid of net.nodeIds) {
          const node = circuit.getWireNode(nid);
          if (node.pinId && errorPinIds.has(node.pinId as string)) {
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
      const from = circuit.getWireNode(seg.from);
      const to = circuit.getWireNode(seg.to);
      ctx.beginPath();
      this.traceRoutedPath(ctx, from.pos, to.pos);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    // Draw ! label at midpoint of error segments (same style as wire value labels)
    for (const seg of circuit.wireSegments.values()) {
      if (!errorSegments.has(seg.id as string)) continue;
      const from = circuit.getWireNode(seg.from);
      const to = circuit.getWireNode(seg.to);
      const segLen = Vec2.dist(from.pos, to.pos);
      if (segLen < 20) continue;

      const mid = routePointAt(from.pos, to.pos, 0.5);
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
          const center = gateCenter(gate);
          ctx.save();
          ctx.translate(center.x, center.y);
          ctx.rotate((gate.rotation * Math.PI) / 180);
          ctx.strokeRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
          ctx.restore();
          break;
        }
        case 'wireNode': {
          const node = circuit.wireNodes.get(item.id);
          if (!node) break;
          ctx.beginPath();
          ctx.arc(node.pos.x, node.pos.y, 8, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'wireSegment': {
          const seg = circuit.wireSegments.get(item.id);
          if (!seg) break;
          const from = circuit.getWireNode(seg.from);
          const to = circuit.getWireNode(seg.to);
          ctx.beginPath();
          this.traceRoutedPath(ctx, from.pos, to.pos);
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
    const { pos, w, h } = state.selectionRect;

    ctx.fillStyle = COLORS.selectionRectFill;
    ctx.fillRect(pos.x, pos.y, w, h);
    ctx.strokeStyle = COLORS.selectionRectStroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(pos.x, pos.y, w, h);
  }

  private drawWireInProgress(state: EditorState): void {
    if (state.mode.kind !== 'wiring') return;

    const { ctx } = this;
    const wireStart = state.mode.start;
    const wireColor = state.wireColor === WIRE_COLORS[0] ? COLORS.wireDefault : state.wireColor;
    const target = Vec2.snap(this.mouseWorld);

    ctx.strokeStyle = wireColor;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    this.traceRoutedPath(ctx, wireStart.pos, target);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawDropPreview(state: EditorState): void {
    if (!state.dropPreview) return;

    const { ctx } = this;
    const { type, pos: { x, y } } = state.dropPreview;
    const def = getGateDefinition(type);
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
    if (state.mode.kind !== 'pasting' || !state.clipboard || !state.mode.cursor) return;

    const { ctx } = this;
    const cursor = state.mode.cursor;
    const clip = state.clipboard;

    ctx.globalAlpha = 0.4;

    // Draw ghost gates (matches drawGates transform pattern)
    for (const cg of clip.gates) {
      const def = getGateDefinition(cg.type);
      const gw = def.width * GRID_SIZE;
      const gh = def.height * GRID_SIZE;
      const offset = gateGridOffset(cg.rotation, gw, gh);
      const gatePos = Vec2.snap({ x: cursor.x + cg.delta.x - gw / 2, y: cursor.y + cg.delta.y - gh / 2 }, offset);
      const gcx = gatePos.x + gw / 2;
      const gcy = gatePos.y + gh / 2;

      ctx.save();
      ctx.translate(gcx, gcy);
      ctx.rotate((cg.rotation * Math.PI) / 180);

      if (def.svg) {
        const path = this.getGatePath(cg.type);
        ctx.save();
        ctx.translate(-gw / 2, -gh / 2);
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
        ctx.fillRect(-gw / 2, -gh / 2, gw, gh);
        ctx.strokeRect(-gw / 2, -gh / 2, gw, gh);
      }

      // Label
      ctx.fillStyle = COLORS.gateText;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.label, (def.labelX ?? 0) * GRID_SIZE, (def.labelY ?? 0) * GRID_SIZE);

      // Pins (drawn relative to center, inside rotation transform)
      for (const pin of def.pins) {
        ctx.fillStyle = COLORS.pinHighZ;
        ctx.beginPath();
        ctx.arc(pin.x * GRID_SIZE - gw / 2, pin.y * GRID_SIZE - gh / 2, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    // Draw ghost wire segments
    ctx.strokeStyle = COLORS.selection;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const cw of clip.wires) {
      const fromNode = clip.nodes[cw.fromNodeIdx];
      const toNode = clip.nodes[cw.toNodeIdx];
      if (!fromNode || !toNode) continue;
      const from = Vec2.snap(Vec2.add(cursor, fromNode.delta));
      const to = Vec2.snap(Vec2.add(cursor, toNode.delta));
      ctx.beginPath();
      this.traceRoutedPath(ctx, from, to);
      ctx.stroke();
    }

    // Draw ghost wire nodes (free only)
    for (const cn of clip.nodes) {
      if (cn.gateIdx !== undefined) continue; // anchored nodes shown via gate pins
      const nodePos = Vec2.snap(Vec2.add(cursor, cn.delta));
      ctx.fillStyle = COLORS.wireNodeFill;
      ctx.strokeStyle = COLORS.selection;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(nodePos.x, nodePos.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }
}
