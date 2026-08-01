import type { Camera } from '../EditorState.ts';
import type { GateType } from '../../simulation/gateTypes.ts';
import { getGateDefinition, componentDefVersion } from '../gates.ts';
import { cameraBoundingBox } from '../utils/geometry.ts';
import { routeCorner, Vec2 } from '../utils/vec2.ts';
import { screenToWorld as stw, worldToScreen as wts } from '../../../engine/camera.ts';
import { COLORS, GRID_SIZE, WIRE_DASH_SIZE } from "../consts.ts";
import {
  type BackgroundStyle, DEFAULT_GRID_PATTERN, drawBackground,
} from './backgroundPattern.ts';
import type { MapRect } from '../utils/mapBounds.ts';
import type {
  RenderScene, RenderWireSegment, RenderWireNode, RenderGate, RenderGateButton, RenderPin,
  RenderPinLabel, RenderErrorSegment, RenderSelectionItem, RenderPastePreview,
} from './renderScene.ts';
import type { Viewport } from './buildScene.ts';

/**
 * Draws a RenderScene onto a canvas. Owns no time and no state beyond drawing concerns —
 * it used to own the frame loop as well, which put the decisions about when to rebuild
 * topology, when to re-tick, and when to re-render Preact inside the render layer. That
 * sequencing now lives in EditorFrameLoop.
 */
export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private wireAnimProgress = 0;
  private dpr = 1;
  // Replaced by the owning screen as soon as it knows what it is showing.
  private backgroundStyle: BackgroundStyle = { grid: DEFAULT_GRID_PATTERN, ornament: 'none' };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2d context');
    this.ctx = ctx;
    this.handleResize();
  }

  render(scene: RenderScene, camera: Camera): void {
    const { ctx } = this;

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

    this.drawBackground(camera, scene.map);
    this.drawWireSegments(scene.wireSegments);
    this.drawWireNodes(scene.wireNodes);
    this.drawGates(scene.gates);
    this.drawGateButtons(scene.gateButtons);
    this.drawPins(scene.pins);
    this.drawErrorSegments(scene.errorSegments);
    this.drawSelection(scene.selection);
    // After the selection outline: the labels belong to the selected gate and should sit
    // on top of it, its wires, and its outline.
    this.drawPinLabels(scene.pinLabels);
    this.drawSelectionRect(scene.selectionRect);
    this.drawWireInProgress(scene.wireInProgress);
    this.drawDropPreview(scene.dropPreview);
    this.drawPastePreview(scene.pastePreview);

    ctx.restore();
    ctx.restore();
  }

  /**
   * Pick the grid and ornament drawn behind the circuit. A style is passed in rather than
   * read from a global so a level could later ship its own look.
   */
  setBackgroundStyle(style: BackgroundStyle): void {
    this.backgroundStyle = style;
  }

  /** Advance time-based drawing effects (the dashes crawling along active wires). */
  advanceAnimation(dtSeconds: number): void {
    this.wireAnimProgress = (this.wireAnimProgress + dtSeconds * 0.5) % 1;
  }

  screenToWorld(screen: Vec2, camera: Camera): Vec2 {
    return stw(screen, camera, this.canvas.clientWidth, this.canvas.clientHeight);
  }

  worldToScreen(world: Vec2, camera: Camera): Vec2 {
    return wts(world, camera, this.canvas.clientWidth, this.canvas.clientHeight);
  }

  /** World-space rect currently on screen. The scene build culls against it. */
  viewport(camera: Camera): Viewport {
    return cameraBoundingBox(camera, {
      x: this.canvas.clientWidth,
      y: this.canvas.clientHeight,
    });
  }

  /** Match the backing store to the element's CSS size and device pixel ratio. */
  syncCanvasSize(): void {
    this.handleResize();
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

  private gatePaths = new Map<string, Path2D>();
  private lastComponentDefVersion = -1;

  private getGatePath(type: GateType, layerIndex = 0): Path2D {
    // Invalidate cache when component definitions change
    if (this.lastComponentDefVersion !== componentDefVersion) {
      this.gatePaths.clear();
      this.lastComponentDefVersion = componentDefVersion;
    }
    const key = layerIndex ? `${type}:${layerIndex}` : type;
    let path = this.gatePaths.get(key);
    if (!path) {
      const def = getGateDefinition(type);
      let svgStr: string;
      if (typeof def.svg === 'string') {
        svgStr = def.svg;
      } else if (Array.isArray(def.svg)) {
        const layer = def.svg[layerIndex] ?? def.svg[0];
        svgStr = typeof layer === 'string' ? layer : layer.path;
      } else {
        svgStr = '';
      }
      path = new Path2D(svgStr);
      this.gatePaths.set(key, path);
    }
    return path;
  }

  /** Get SvgLayer options for a specific layer index. */
  private getSvgLayerOptions(type: GateType, layerIndex: number): { fill: boolean; stroke: boolean; alpha: number } {
    const def = getGateDefinition(type);
    if (Array.isArray(def.svg)) {
      const layer = def.svg[layerIndex];
      if (layer && typeof layer !== 'string') {
        return {
          fill: layer.fill ?? true,
          stroke: layer.stroke ?? true,
          alpha: layer.alpha ?? 1,
        };
      }
    }
    return { fill: true, stroke: true, alpha: 1 };
  }

  private traceRoutedPath(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2): void {
    ctx.moveTo(a.x, a.y);
    const c = routeCorner(a, b);
    if (c) ctx.lineTo(c.x, c.y);
    ctx.lineTo(b.x, b.y);
  }

  /** Trace a routed path offset perpendicular to each segment direction. */
  private traceOffsetPath(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2, offset: number): void {
    const c = routeCorner(a, b);
    if (c) {
      const o1 = perpendicularOffset(a, c, offset);
      const o2 = perpendicularOffset(c, b, offset);
      ctx.moveTo(a.x + o1.x, a.y + o1.y);
      ctx.lineTo(c.x + o1.x, c.y + o1.y);
      ctx.lineTo(c.x + o2.x, c.y + o2.y);
      ctx.lineTo(b.x + o2.x, b.y + o2.y);
    } else {
      const o = perpendicularOffset(a, b, offset);
      ctx.moveTo(a.x + o.x, a.y + o.y);
      ctx.lineTo(b.x + o.x, b.y + o.y);
    }
  }

  // --- Draw methods ---

  private drawTextMultiline(text: string, x: number, y: number): void {
    const lines = text.split('\n');
    if (lines.length === 1) {
      this.ctx.fillText(text, x, y);
      return;
    }
    const lineHeight = 13;
    const startY = y - (lines.length - 1) * lineHeight / 2;
    for (let i = 0; i < lines.length; i++) {
      this.ctx.fillText(lines[i], x, startY + i * lineHeight);
    }
  }

  private drawBackground(camera: Camera, map: MapRect): void {
    drawBackground(this.ctx, {
      style: this.backgroundStyle,
      viewport: this.viewport(camera),
      map,
      zoom: camera.zoom,
    });
  }

  private drawWireSegments(segments: RenderWireSegment[]): void {
    const { ctx } = this;

    // Pass 1: wire bodies
    for (const seg of segments) {
      ctx.strokeStyle = seg.bodyColor;
      ctx.lineWidth = seg.thickness;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);
      ctx.beginPath();
      this.traceRoutedPath(ctx, seg.from, seg.to);
      ctx.stroke();
    }

    // Pass 1b: multibit parallel lines
    for (const seg of segments) {
      if (!seg.multibit) continue;
      ctx.strokeStyle = seg.bodyColor;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);
      for (const offset of [-5, 5]) {
        ctx.beginPath();
        this.traceOffsetPath(ctx, seg.from, seg.to, offset);
        ctx.stroke();
      }
    }

    // Pass 2: signal overlay (animated dashes)
    for (const seg of segments) {
      if (!seg.signalColor) continue;
      ctx.strokeStyle = seg.signalColor;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([WIRE_DASH_SIZE, WIRE_DASH_SIZE]);
      ctx.lineDashOffset = -(this.wireAnimProgress * WIRE_DASH_SIZE * 4);
      ctx.beginPath();
      this.traceRoutedPath(ctx, seg.from, seg.to);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    // Pass 3: value labels
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const seg of segments) {
      for (const lbl of seg.valueLabels) {
        const tw = ctx.measureText(lbl.text).width + 6;
        ctx.fillStyle = COLORS.background;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.roundRect(lbl.pos.x - tw / 2, lbl.pos.y - 6, tw, 12, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = lbl.color;
        ctx.fillText(lbl.text, lbl.pos.x, lbl.pos.y);
      }
    }

    // Pass 4: name labels
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const seg of segments) {
      if (!seg.nameLabel) continue;
      const { text, color, pos } = seg.nameLabel;
      const tw = ctx.measureText(text).width + 6;
      ctx.fillStyle = COLORS.background;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.roundRect(pos.x - tw / 2, pos.y - 16, tw, 12, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.fillText(text, pos.x, pos.y - 5);
    }
  }

  private drawWireNodes(nodes: RenderWireNode[]): void {
    const { ctx } = this;
    for (const node of nodes) {
      ctx.fillStyle = COLORS.wireNodeFill;
      ctx.strokeStyle = node.strokeColor;
      ctx.lineWidth = node.strokeWidth;
      ctx.beginPath();
      ctx.arc(node.pos.x, node.pos.y, node.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (node.signalColor) {
        ctx.fillStyle = node.signalColor;
        ctx.beginPath();
        ctx.arc(node.pos.x, node.pos.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Draw a single gate body: SVG or rect, label, value label, preview pins, error glow. */
  private drawGateBody(gate: RenderGate): void {
    const { ctx } = this;

    ctx.save();
    ctx.translate(gate.center.x, gate.center.y);
    ctx.rotate((gate.rotation * Math.PI) / 180);

    if (gate.hasSvg) {
      ctx.save();
      ctx.translate(-gate.w / 2, -gate.h / 2);
      ctx.scale(GRID_SIZE, GRID_SIZE);

      const prevAlpha = ctx.globalAlpha;
      for (const layerIdx of gate.svgLayers) {
        const path = this.getGatePath(gate.type, layerIdx);
        const opts = this.getSvgLayerOptions(gate.type, layerIdx);
        ctx.globalAlpha = prevAlpha * opts.alpha;
        if (opts.fill) { ctx.fillStyle = gate.fillColor; ctx.fill(path); }
        if (opts.stroke) { ctx.strokeStyle = gate.strokeColor; ctx.lineWidth = 1.5 / GRID_SIZE; ctx.stroke(path); }
      }
      ctx.globalAlpha = prevAlpha;

      ctx.restore();
    } else {
      ctx.fillStyle = gate.fillColor;
      ctx.strokeStyle = gate.strokeColor;
      ctx.lineWidth = 1.5;
      ctx.fillRect(-gate.w / 2, -gate.h / 2, gate.w, gate.h);
      ctx.strokeRect(-gate.w / 2, -gate.h / 2, gate.w, gate.h);
    }

    // Label
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (gate.label) {
      ctx.fillStyle = gate.labelColor;
      ctx.font = gate.labelFont;
      this.drawTextMultiline(gate.label, gate.labelPos.x, gate.labelPos.y);
    }

    // Value label (input/constant gates)
    if (gate.valueLabel) {
      ctx.fillStyle = gate.valueLabel.color;
      ctx.font = 'bold 13px monospace';
      ctx.fillText(gate.valueLabel.text, gate.valueLabel.pos.x, gate.valueLabel.pos.y);
    }

    // Preview pin dots (for drop/paste previews)
    if (gate.previewPins) {
      for (const pin of gate.previewPins) {
        ctx.fillStyle = COLORS.pinHighZ;
        ctx.beginPath();
        ctx.arc(pin.x, pin.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();

    // Error glow
    if (gate.errorGlow) {
      ctx.save();
      ctx.translate(gate.center.x, gate.center.y);
      ctx.rotate((gate.rotation * Math.PI) / 180);
      ctx.strokeStyle = COLORS.error;
      ctx.lineWidth = 2;
      ctx.shadowColor = COLORS.error;
      ctx.shadowBlur = 8;
      ctx.strokeRect(-gate.w / 2 - 1, -gate.h / 2 - 1, gate.w + 2, gate.h + 2);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  private drawGates(gates: RenderGate[]): void {
    for (const gate of gates) {
      this.drawGateBody(gate);
    }
  }

  /**
   * On-body buttons, drawn upright in world space so the icon reads the same on a rotated
   * gate. The glyph is three stacked bars — a stack of memory rows.
   */
  private drawGateButtons(buttons: RenderGateButton[]): void {
    const { ctx } = this;
    for (const button of buttons) {
      const { x, y } = button.pos;
      ctx.beginPath();
      ctx.arc(x, y, button.radius, 0, Math.PI * 2);
      ctx.fillStyle = button.hovered ? COLORS.selection : COLORS.background;
      ctx.fill();
      ctx.strokeStyle = button.hovered ? COLORS.selection : COLORS.boardLabel;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.strokeStyle = button.hovered ? COLORS.background : COLORS.boardLabel;
      ctx.lineWidth = 1;
      const barHalfWidth = button.radius * 0.45;
      for (let row = -1; row <= 1; row++) {
        const barY = y + row * button.radius * 0.4;
        ctx.beginPath();
        ctx.moveTo(x - barHalfWidth, barY);
        ctx.lineTo(x + barHalfWidth, barY);
        ctx.stroke();
      }
    }
  }

  private drawPins(pins: RenderPin[]): void {
    const { ctx } = this;
    for (const pin of pins) {
      ctx.fillStyle = pin.fillColor;
      ctx.beginPath();
      ctx.arc(pin.pos.x, pin.pos.y, pin.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = pin.strokeColor;
      ctx.lineWidth = pin.strokeWidth;
      ctx.stroke();
    }
  }

  /** Pin names, each on a chip of background so they stay readable over a wire. */
  private drawPinLabels(labels: RenderPinLabel[]): void {
    if (labels.length === 0) return;
    const { ctx } = this;

    ctx.font = '9px sans-serif';
    ctx.textBaseline = 'middle';
    for (const label of labels) {
      const textWidth = ctx.measureText(label.text).width;
      ctx.textAlign = label.align;
      ctx.fillStyle = COLORS.background;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.roundRect(chipLeft(label, textWidth), label.pos.y - 6, textWidth + 6, 12, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
      // boardLabel, not gateText: the chip is the board colour, and on a light-gate palette
      // gateText is dark enough to disappear into a dark board.
      ctx.fillStyle = COLORS.boardLabel;
      ctx.fillText(label.text, label.pos.x, label.pos.y);
    }
  }

  private drawErrorSegments(errors: RenderErrorSegment[]): void {
    if (errors.length === 0) return;
    const { ctx } = this;

    // Animated dashed overlay
    ctx.strokeStyle = COLORS.error;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.lineDashOffset = -this.wireAnimProgress * 12;
    ctx.shadowColor = COLORS.error;
    ctx.shadowBlur = 6;
    ctx.lineCap = 'round';

    for (const err of errors) {
      ctx.beginPath();
      this.traceRoutedPath(ctx, err.from, err.to);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    // Error labels
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const err of errors) {
      if (!err.labelPos) continue;
      const tw = ctx.measureText('!').width + 6;
      ctx.fillStyle = COLORS.background;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.roundRect(err.labelPos.x - tw / 2, err.labelPos.y - 6, tw, 12, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = COLORS.error;
      ctx.fillText('!', err.labelPos.x, err.labelPos.y);
    }
  }

  private drawSelection(items: RenderSelectionItem[]): void {
    if (items.length === 0) return;
    const { ctx } = this;

    ctx.strokeStyle = COLORS.selection;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);

    for (const item of items) {
      if (item.kind === 'gate') {
        ctx.save();
        ctx.translate(item.center.x, item.center.y);
        ctx.rotate((item.rotation * Math.PI) / 180);
        ctx.strokeRect(-item.w / 2 - 3, -item.h / 2 - 3, item.w + 6, item.h + 6);
        ctx.restore();
      } else if (item.kind === 'wireNode') {
        ctx.beginPath();
        ctx.arc(item.pos.x, item.pos.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      } else if (item.kind === 'wireSegment') {
        ctx.beginPath();
        this.traceRoutedPath(ctx, item.from, item.to);
        ctx.stroke();
      }
    }

    ctx.setLineDash([]);
  }

  private drawSelectionRect(rect: { pos: Vec2; w: number; h: number } | null): void {
    if (!rect) return;
    const { ctx } = this;
    ctx.fillStyle = COLORS.selectionRectFill;
    ctx.fillRect(rect.pos.x, rect.pos.y, rect.w, rect.h);
    ctx.strokeStyle = COLORS.selectionRectStroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.pos.x, rect.pos.y, rect.w, rect.h);
  }

  private drawWireInProgress(wire: RenderScene['wireInProgress']): void {
    if (!wire) return;
    const { ctx } = this;
    ctx.strokeStyle = wire.color;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    this.traceRoutedPath(ctx, wire.from, wire.to);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawDropPreview(preview: RenderGate | null): void {
    if (!preview) return;
    this.ctx.globalAlpha = 0.5;
    this.drawGateBody(preview);
    this.ctx.globalAlpha = 1;
  }

  private drawPastePreview(preview: RenderPastePreview | null): void {
    if (!preview) return;
    const { ctx } = this;

    ctx.globalAlpha = 0.4;

    for (const gate of preview.gates) {
      this.drawGateBody(gate);
    }

    // Ghost wires
    ctx.strokeStyle = COLORS.selection;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const wire of preview.wires) {
      ctx.beginPath();
      this.traceRoutedPath(ctx, wire.from, wire.to);
      ctx.stroke();
    }

    // Ghost free nodes
    for (const pos of preview.nodes) {
      ctx.fillStyle = COLORS.wireNodeFill;
      ctx.strokeStyle = COLORS.selection;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }
}

/** Left edge of a pin label's background chip, matching how its text is aligned. */
function chipLeft(label: RenderPinLabel, textWidth: number): number {
  if (label.align === 'left') return label.pos.x - 3;
  if (label.align === 'right') return label.pos.x - textWidth - 3;
  return label.pos.x - textWidth / 2 - 3;
}

function perpendicularOffset(a: Vec2, b: Vec2, offset: number): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { x: 0, y: 0 };
  return { x: (-dy / len) * offset, y: (dx / len) * offset };
}
