import type { Camera, EditorState } from '../EditorState.ts';
import type { GateType } from '../../simulation/gateTypes.ts';
import { getGateDefinition } from '../gates.ts';
import { cameraBoundingBox } from '../utils/geometry.ts';
import { routeCorner, Vec2 } from '../utils/vec2.ts';
import { screenToWorld as stw, worldToScreen as wts } from '../../engine/camera.ts';
import { COLORS, GRID_DOT_RADIUS, GRID_SIZE, WIRE_DASH_SIZE } from "../consts.ts";
import type {
  RenderScene, RenderWireSegment, RenderWireNode, RenderGate, RenderPin,
  RenderErrorSegment, RenderSelectionItem, RenderDropPreview, RenderPastePreview,
} from './renderScene.ts';
import { buildScene } from './buildScene.ts';

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

    this.drawGrid(camera);
    this.drawWireSegments(scene.wireSegments);
    this.drawWireNodes(scene.wireNodes);
    this.drawGates(scene.gates);
    this.drawPins(scene.pins);
    this.drawErrorSegments(scene.errorSegments);
    this.drawSelection(scene.selection);
    this.drawSelectionRect(scene.selectionRect);
    this.drawWireInProgress(scene.wireInProgress);
    this.drawDropPreview(scene.dropPreview);
    this.drawPastePreview(scene.pastePreview);

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
        const scene = buildScene(state, this.mouseWorld);
        this.render(scene, state.camera);
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

  private traceRoutedPath(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2): void {
    ctx.moveTo(a.x, a.y);
    const c = routeCorner(a, b);
    if (c) ctx.lineTo(c.x, c.y);
    ctx.lineTo(b.x, b.y);
  }

  // --- Draw methods ---

  private drawGrid(camera: Camera): void {
    const { ctx } = this;
    const { left, top, right, bottom } = cameraBoundingBox(camera, {
      x: this.canvas.clientWidth,
      y: this.canvas.clientHeight,
    });

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

  private drawGates(gates: RenderGate[]): void {
    const { ctx } = this;

    for (const gate of gates) {
      ctx.save();
      ctx.translate(gate.center.x, gate.center.y);
      ctx.rotate((gate.rotation * Math.PI) / 180);

      if (gate.hasSvg) {
        const path = this.getGatePath(gate.type);
        ctx.save();
        ctx.translate(-gate.w / 2, -gate.h / 2);
        ctx.scale(GRID_SIZE, GRID_SIZE);
        ctx.fillStyle = gate.fillColor;
        ctx.fill(path);
        ctx.strokeStyle = gate.strokeColor;
        ctx.lineWidth = 1.5 / GRID_SIZE;
        ctx.stroke(path);
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
        ctx.fillText(gate.label, gate.labelPos.x, gate.labelPos.y);
      }

      // Value label (input/constant gates)
      if (gate.valueLabel) {
        ctx.fillStyle = gate.valueLabel.color;
        ctx.font = 'bold 13px monospace';
        ctx.fillText(gate.valueLabel.text, gate.valueLabel.pos.x, gate.valueLabel.pos.y);
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

  private drawDropPreview(preview: RenderDropPreview | null): void {
    if (!preview) return;
    const { ctx } = this;

    ctx.globalAlpha = 0.5;

    if (preview.hasSvg) {
      const path = this.getGatePath(preview.type);
      ctx.save();
      ctx.translate(preview.pos.x, preview.pos.y);
      ctx.scale(GRID_SIZE, GRID_SIZE);
      ctx.fillStyle = preview.fillColor;
      ctx.fill(path);
      ctx.strokeStyle = preview.strokeColor;
      ctx.lineWidth = 1.5 / GRID_SIZE;
      ctx.stroke(path);
      ctx.restore();
    } else {
      ctx.fillStyle = preview.fillColor;
      ctx.strokeStyle = preview.strokeColor;
      ctx.lineWidth = 1.5;
      ctx.fillRect(preview.pos.x, preview.pos.y, preview.w, preview.h);
      ctx.strokeRect(preview.pos.x, preview.pos.y, preview.w, preview.h);
    }

    ctx.fillStyle = COLORS.gateText;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(preview.label, preview.labelPos.x, preview.labelPos.y);

    for (const pin of preview.pins) {
      ctx.fillStyle = COLORS.pinHighZ;
      ctx.beginPath();
      ctx.arc(pin.x, pin.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  private drawPastePreview(preview: RenderPastePreview | null): void {
    if (!preview) return;
    const { ctx } = this;

    ctx.globalAlpha = 0.4;

    // Ghost gates
    for (const gate of preview.gates) {
      ctx.save();
      ctx.translate(gate.center.x, gate.center.y);
      ctx.rotate((gate.rotation * Math.PI) / 180);

      if (gate.hasSvg) {
        const path = this.getGatePath(gate.type);
        ctx.save();
        ctx.translate(-gate.w / 2, -gate.h / 2);
        ctx.scale(GRID_SIZE, GRID_SIZE);
        ctx.fillStyle = gate.fillColor;
        ctx.fill(path);
        ctx.strokeStyle = gate.strokeColor;
        ctx.lineWidth = 1.5 / GRID_SIZE;
        ctx.stroke(path);
        ctx.restore();
      } else {
        ctx.fillStyle = gate.fillColor;
        ctx.strokeStyle = gate.strokeColor;
        ctx.lineWidth = 1.5;
        ctx.fillRect(-gate.w / 2, -gate.h / 2, gate.w, gate.h);
        ctx.strokeRect(-gate.w / 2, -gate.h / 2, gate.w, gate.h);
      }

      ctx.fillStyle = COLORS.gateText;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(gate.label, gate.labelPos.x, gate.labelPos.y);

      for (const pin of gate.pins) {
        ctx.fillStyle = COLORS.pinHighZ;
        ctx.beginPath();
        ctx.arc(pin.x, pin.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
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
