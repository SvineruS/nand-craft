import type { EditorState } from '../EditorState.ts';
import type { RenderScene, RenderWireSegment, RenderWireNode, RenderGate, RenderPin, RenderErrorSegment, RenderSelectionItem, RenderPastePreview } from './renderScene.ts';
import { getGateDefinition, getPinBitWidth } from '../gates.ts';
import { type Gate, isConstantGate, isInputGate } from '../../simulation/gateTypes.ts';
import type { Circuit } from '../../simulation/circuit.ts';
import type { PinRef } from '../types.ts';
import { isComponentType } from '../../components/componentRegistry.ts';
import { gateCenter, gateGridOffset, getGateDims, getPinPositions } from '../utils/geometry.ts';
import { routeLength, routePointAt, Vec2 } from '../utils/vec2.ts';
import { COLORS, GRID_SIZE, WIRE_COLORS, WIRE_LABEL_MIN_LENGTH, WIRE_LABEL_SPACING } from '../consts.ts';

/**
 * World-space rectangle the scene is being built for. Anything fully outside is skipped.
 * Pass null to build the whole circuit (the regression harness does, so it can compare
 * scene entries index-for-index against the circuit).
 */
export interface Viewport {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Grow the viewport before culling so items whose drawn extent reaches past their
 * geometric bounds — stroke width, hover rings, selection outlines, value labels — do not
 * pop in at the edge of the screen.
 */
const CULL_MARGIN = 2 * GRID_SIZE;

export function buildScene(
  state: EditorState,
  mouseWorld: Vec2,
  viewport: Viewport | null = null,
): RenderScene {
  const bounds = viewport && {
    left: viewport.left - CULL_MARGIN,
    top: viewport.top - CULL_MARGIN,
    right: viewport.right + CULL_MARGIN,
    bottom: viewport.bottom + CULL_MARGIN,
  };

  return {
    wireSegments: buildWireSegments(state, bounds),
    wireNodes: buildWireNodes(state, bounds),
    gates: buildGates(state, bounds),
    pins: buildPins(state, bounds),
    errorSegments: buildErrorSegments(state, bounds),
    selection: buildSelection(state),
    selectionRect: state.selectionRect,
    wireInProgress: buildWireInProgress(state, mouseWorld),
    dropPreview: buildDropPreview(state),
    pastePreview: buildPastePreview(state),
  };
}

// ---------------------------------------------------------------------------
// Culling helpers
// ---------------------------------------------------------------------------

function pointVisible(bounds: Viewport | null, p: Vec2): boolean {
  if (!bounds) return true;
  return p.x >= bounds.left && p.x <= bounds.right && p.y >= bounds.top && p.y <= bounds.bottom;
}

/** Axis-aligned overlap test against the box spanned by two points. */
function spanVisible(bounds: Viewport | null, a: Vec2, b: Vec2): boolean {
  if (!bounds) return true;
  return Math.min(a.x, b.x) <= bounds.right
    && Math.max(a.x, b.x) >= bounds.left
    && Math.min(a.y, b.y) <= bounds.bottom
    && Math.max(a.y, b.y) >= bounds.top;
}

/**
 * Gate visibility from its center and a square half-extent of max(w, h) / 2 — large enough
 * to cover every rotation, so the test needs no rotation-specific bounds.
 */
function gateVisible(bounds: Viewport | null, center: Vec2, w: number, h: number): boolean {
  if (!bounds) return true;
  const half = Math.max(w, h) / 2;
  return center.x + half >= bounds.left
    && center.x - half <= bounds.right
    && center.y + half >= bounds.top
    && center.y - half <= bounds.bottom;
}

// ---------------------------------------------------------------------------
// Wire segments
// ---------------------------------------------------------------------------

function buildWireSegments(state: EditorState, bounds: Viewport | null): RenderWireSegment[] {
  const { circuit } = state;
  const result: RenderWireSegment[] = [];

  for (const segment of circuit.wireSegments.values()) {
    const fromNode = circuit.getWireNode(segment.from);
    const toNode = circuit.getWireNode(segment.to);
    const from = fromNode.pos;
    const to = toNode.pos;
    if (!spanVisible(bounds, from, to)) continue;

    // Both endpoints of a segment are always in the same net, so either one will do
    const bitWidth = circuit.getNetBitWidth(segment.from);
    const thickness = 6;
    const bodyColor = segment.color ?? COLORS.wireDefault;

    // Signal
    const value = circuit.getNetValue(segment.from);
    const sc = value !== null ? signalColor(value, bitWidth) : null;

    // Value labels (only for segments with signal and sufficient length)
    const valueLabels: RenderWireSegment['valueLabels'] = [];
    if (value !== null) {
      const segLen = Vec2.dist(from, to);
      if (segLen > WIRE_LABEL_MIN_LENGTH) {
        const text = formatWireValue(value, bitWidth);
        const pathLen = routeLength(from, to);
        const labelCount = Math.max(1, Math.floor(pathLen / WIRE_LABEL_SPACING));
        for (let li = 0; li < labelCount; li++) {
          const t = labelCount === 1 ? 0.5 : (li + 0.5) / labelCount;
          valueLabels.push({ text, color: sc!, pos: routePointAt(from, to, t) });
        }
      }
    }

    // Name label
    let nameLabel: RenderWireSegment['nameLabel'] = null;
    if (segment.label) {
      const mid = routePointAt(from, to, 0.5);
      nameLabel = { text: segment.label, color: segment.color ?? '#9ca3af', pos: mid };
    }

    result.push({ from, to, bodyColor, thickness, multibit: bitWidth > 1, signalColor: sc, valueLabels, nameLabel });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Wire nodes
// ---------------------------------------------------------------------------

function buildWireNodes(state: EditorState, bounds: Viewport | null): RenderWireNode[] {
  const { circuit } = state;
  const result: RenderWireNode[] = [];

  // Count segments per node + find first connected segment color
  const segmentCount = new Map<string, number>();
  const nodeColor = new Map<string, string>();
  for (const seg of circuit.wireSegments.values()) {
    segmentCount.set(seg.from, (segmentCount.get(seg.from) ?? 0) + 1);
    segmentCount.set(seg.to, (segmentCount.get(seg.to) ?? 0) + 1);
    if (seg.color) {
      if (!nodeColor.has(seg.from)) nodeColor.set(seg.from, seg.color);
      if (!nodeColor.has(seg.to)) nodeColor.set(seg.to, seg.color);
    }
  }

  for (const node of circuit.wireNodes.values()) {
    const count = segmentCount.get(node.id) ?? 0;
    if (count === 0 && !node.pin) continue;
    if (!pointVisible(bounds, node.pos)) continue;

    let nodePinValue: number | null = null;
    let pinBitWidth: number | undefined;
    if (node.pin) {
      const gate = circuit.gates.get(node.pin.gateId);
      if (gate) {
        nodePinValue = circuit.getPinValue(node.pin.gateId, node.pin.kind, node.pin.index);
        pinBitWidth = getPinBitWidth(gate.type, node.pin.kind, node.pin.index);
      }
    }
    const value = nodePinValue ?? circuit.getNetValue(node.id);
    const customColor = nodeColor.get(node.id);
    const isHovered = state.hoveredEndpoint?.kind === 'node' && state.hoveredEndpoint.nodeId === node.id;

    const radius = isHovered ? 7 : 5;
    const strokeColor = isHovered ? COLORS.selection : (customColor ?? COLORS.wireDefault);
    const strokeWidth = isHovered ? 3 : 2.5;

    let sc: string | null = null;
    if (value !== null) {
      const bw = pinBitWidth ?? circuit.getNetBitWidth(node.id);
      sc = signalColor(value, bw);
    }

    result.push({ pos: node.pos, strokeColor, signalColor: sc, radius, strokeWidth });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

function buildGates(state: EditorState, bounds: Viewport | null): RenderGate[] {
  const { circuit } = state;
  const result: RenderGate[] = [];

  for (const gate of circuit.gates.values()) {
    const { w, h } = getGateDims(gate);
    const center = gateCenter(gate);
    if (!gateVisible(bounds, center, w, h)) continue;
    const def = getGateDefinition(gate.type);

    let fillColor = def.color ?? COLORS.gateFill;
    let strokeColor = def.stroke ?? COLORS.gateStroke;
    const status = state.gateStatuses?.get(gate.id);
    if (status === 'locked') {
      fillColor = '#333345'; strokeColor = '#555568';
    } else if (status === 'available') {
      fillColor = '#2d3d5d'; strokeColor = '#6cb4ff';
    } else if (status === 'solved') {
      fillColor = '#2d4d2d'; strokeColor = '#5a8a5a';
    }

    const labelX = (def.labelX ?? 0) * GRID_SIZE;
    const labelY = (def.labelY ?? 0) * GRID_SIZE;

    let label: string;
    let labelFont: string;
    let labelColor: string;
    let labelPos: Vec2;
    let valueLabel: RenderGate['valueLabel'] = null;

    if (isInputGate(gate.type) || isConstantGate(gate.type)) {
      label = gate.label ?? '';
      labelFont = 'bold 10px monospace';
      labelColor = COLORS.gateText;
      labelPos = { x: labelX, y: labelY - 0.6 * GRID_SIZE };

      const val = circuit.getPinValue(gate.id, 'output', 0);
      const valText = val !== null ? String(val) : '?';
      const valColor = val !== null ? signalColor(val) : COLORS.gateText;
      valueLabel = { text: valText, color: valColor, pos: { x: labelX, y: labelY } };
    } else {
      label = gate.label ?? def.label;
      labelFont = 'bold 11px monospace';
      labelColor = COLORS.gateText;
      labelPos = { x: labelX, y: labelY };
    }

    // Auto-wrap label if too wide for gate (monospace ~7px per char at 11px font)
    const charWidth = 7;
    const maxChars = Math.floor((w * 0.9) / charWidth);
    if (label.length > maxChars && maxChars > 1) {
      label = wrapText(label, maxChars);
    }

    const errorGlow = circuit.getBuild()?.shortCircuitGates.includes(gate.id) ?? false;

    result.push({
      type: gate.type,
      center, w, h,
      rotation: gate.rotation,
      fillColor, strokeColor,
      hasSvg: !!def.svg,
      svgLayers: getSvgLayers(gate, circuit),
      label, labelPos, labelFont, labelColor,
      valueLabel,
      errorGlow,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Pins
// ---------------------------------------------------------------------------

function buildPins(state: EditorState, bounds: Viewport | null): RenderPin[] {
  const { circuit } = state;
  const result: RenderPin[] = [];
  const hoveredPin = state.hoveredEndpoint?.kind === 'pin' ? state.hoveredEndpoint.pin : null;

  for (const gate of circuit.gates.values()) {
    const { w, h } = getGateDims(gate);
    if (!gateVisible(bounds, gateCenter(gate), w, h)) continue;

    // Indexed loops rather than iteratePinPositions: this runs for every gate on every
    // dirty frame, and the generator allocates a PinRef and a tuple per pin.
    const { inputs, outputs } = getPinPositions(gate);
    for (let i = 0; i < inputs.length; i++) {
      result.push(buildPin(circuit, gate, 'input', i, inputs[i], hoveredPin));
    }
    for (let i = 0; i < outputs.length; i++) {
      result.push(buildPin(circuit, gate, 'output', i, outputs[i], hoveredPin));
    }
  }

  return result;
}

function buildPin(
  circuit: Circuit,
  gate: Gate,
  kind: 'input' | 'output',
  index: number,
  pos: Vec2,
  hoveredPin: PinRef | null,
): RenderPin {
  const value = circuit.getPinValue(gate.id, kind, index);
  const bitWidth = getPinBitWidth(gate.type, kind, index);
  const isHovered = hoveredPin !== null
    && hoveredPin.gateId === gate.id
    && hoveredPin.kind === kind
    && hoveredPin.index === index;

  return {
    pos,
    fillColor: pinColorForValue(value),
    strokeColor: isHovered ? COLORS.selection : pinStrokeForWidth(bitWidth),
    radius: isHovered ? 5 : 3.5,
    strokeWidth: isHovered ? 1.5 : 1,
  };
}

// ---------------------------------------------------------------------------
// Error segments
// ---------------------------------------------------------------------------

function buildErrorSegments(state: EditorState, bounds: Viewport | null): RenderErrorSegment[] {
  const { circuit } = state;
  const {errorSegmentIds} = circuit.tickResult;
  if (errorSegmentIds.size === 0) return [];

  const result: RenderErrorSegment[] = [];
  for (const seg of circuit.wireSegments.values()) {
    if (!errorSegmentIds.has(seg.id as string)) continue;
    const from = circuit.getWireNode(seg.from).pos;
    const to = circuit.getWireNode(seg.to).pos;
    if (!spanVisible(bounds, from, to)) continue;
    const segLen = Vec2.dist(from, to);
    const labelPos = segLen >= 20 ? routePointAt(from, to, 0.5) : null;
    result.push({ from, to, labelPos });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

function buildSelection(state: EditorState): RenderSelectionItem[] {
  const { circuit, selection } = state;
  const result: RenderSelectionItem[] = [];

  for (const item of selection) {
    if (item.type === 'gate') {
      const gate = circuit.gates.get(item.id);
      if (!gate) continue;
      const { w, h } = getGateDims(gate);
      const center = gateCenter(gate);
      result.push({ kind: 'gate', center, w, h, rotation: gate.rotation });
    } else if (item.type === 'wireNode') {
      const node = circuit.wireNodes.get(item.id);
      if (!node) continue;
      result.push({ kind: 'wireNode', pos: node.pos });
    } else if (item.type === 'wireSegment') {
      const seg = circuit.wireSegments.get(item.id);
      if (!seg) continue;
      const from = circuit.getWireNode(seg.from).pos;
      const to = circuit.getWireNode(seg.to).pos;
      result.push({ kind: 'wireSegment', from, to });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

function buildWireInProgress(state: EditorState, mouseWorld: Vec2): RenderScene['wireInProgress'] {
  if (state.mode.kind !== 'wiring') return null;
  const from = state.mode.start.pos;
  const to = Vec2.snap(mouseWorld);
  const color = state.wireColor === WIRE_COLORS[0] ? COLORS.wireDefault : state.wireColor;
  return { from, to, color };
}

function buildPreviewGate(
  def: ReturnType<typeof getGateDefinition>,
  center: Vec2,
  rotation: number,
  type: import('../../simulation/gateTypes.ts').GateType,
): RenderGate {
  const w = def.width * GRID_SIZE;
  const h = def.height * GRID_SIZE;
  const labelX = (def.labelX ?? 0) * GRID_SIZE;
  const labelY = (def.labelY ?? 0) * GRID_SIZE;

  let label = def.label;
  const charWidth = 7;
  const maxChars = Math.floor((w * 0.9) / charWidth);
  if (label.length > maxChars && maxChars > 1) {
    label = wrapText(label, maxChars);
  }

  // Pin positions relative to center
  const previewPins = def.pins.map(pin => ({
    x: pin.x * GRID_SIZE - w / 2,
    y: pin.y * GRID_SIZE - h / 2,
  }));

  return {
    type, center, w, h, rotation,
    fillColor: def.color ?? COLORS.gateFill,
    strokeColor: def.stroke ?? COLORS.selection,
    hasSvg: !!def.svg,
    svgLayers: [0],
    label,
    labelPos: { x: labelX, y: labelY },
    labelFont: 'bold 11px monospace',
    labelColor: COLORS.gateText,
    valueLabel: null,
    errorGlow: false,
    previewPins,
  };
}

function buildDropPreview(state: EditorState): RenderGate | null {
  if (!state.dropPreview) return null;
  const { type, pos } = state.dropPreview;
  const def = getGateDefinition(type);
  const w = def.width * GRID_SIZE;
  const h = def.height * GRID_SIZE;
  const center = { x: pos.x + w / 2, y: pos.y + h / 2 };
  return buildPreviewGate(def, center, 0, type);
}

function buildPastePreview(state: EditorState): RenderPastePreview | null {
  if (state.mode.kind !== 'pasting' || !state.clipboard || !state.mode.cursor) return null;
  const cursor = state.mode.cursor;
  const clip = state.clipboard;

  const gates = clip.gates.map(cg => {
    const def = getGateDefinition(cg.type);
    const gw = def.width * GRID_SIZE;
    const gh = def.height * GRID_SIZE;
    const offset = gateGridOffset(cg.rotation, gw, gh);
    const gatePos = Vec2.snap({ x: cursor.x + cg.delta.x - gw / 2, y: cursor.y + cg.delta.y - gh / 2 }, offset);
    const center = { x: gatePos.x + gw / 2, y: gatePos.y + gh / 2 };
    return buildPreviewGate(def, center, cg.rotation, cg.type);
  });

  const wires = clip.wires
    .filter(cw => clip.nodes[cw.fromNodeIdx] && clip.nodes[cw.toNodeIdx])
    .map(cw => ({
      from: Vec2.snap(Vec2.add(cursor, clip.nodes[cw.fromNodeIdx].delta)),
      to: Vec2.snap(Vec2.add(cursor, clip.nodes[cw.toNodeIdx].delta)),
    }));

  const nodes = clip.nodes
    .filter(cn => cn.gateIdx === undefined)
    .map(cn => Vec2.snap(Vec2.add(cursor, cn.delta)));

  return { gates, wires, nodes };
}

// ---------------------------------------------------------------------------
// Color / formatting helpers
// ---------------------------------------------------------------------------

function signalColor(value: number | null, bitWidth = 1): string {
  if (value === null) return COLORS.wireHighZ;
  if (bitWidth <= 1) return value === 0 ? COLORS.wireZero : COLORS.wireActive;
  const max = ((1 << bitWidth) >>> 0) - 1;
  const t = max > 0 ? value / max : 0;
  return multibitGradient(t);
}

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

function pinStrokeForWidth(bitWidth: number): string {
  if (bitWidth >= 16) return '#f472b6';
  if (bitWidth >= 8) return '#60a5fa';
  return '#fb923c';
}

/** Pick which SVG layer indices to draw. Variants pick one, components draw all. */
function getSvgLayers(gate: Gate, circuit: Circuit): number[] {
  const def = getGateDefinition(gate.type);
  if (!Array.isArray(def.svg)) return [0];

  // Component gates: draw all layers (border + squares)
  if (isComponentType(gate.type)) {
    return def.svg.map((_, i) => i);
  }

  // MUX/decoder variants: pick one based on input value
  if (gate.type === 'mux' || gate.type === '8bit-mux') {
    const sValue = circuit.getPinValue(gate.id, 'input', 0);
    return [sValue ? 1 : 0];
  }
  if (gate.type === '1bit-decoder') {
    const aValue = circuit.getPinValue(gate.id, 'input', 0);
    return [aValue ? 1 : 0];
  }
  return [0];
}

function formatWireValue(value: number, bitWidth: number): string {
  if (bitWidth >= 16) return '0x' + value.toString(16).toUpperCase();
  if (bitWidth >= 8) return String(value);
  return value ? 'T' : 'F';
}

/** Wrap text to fit within maxChars per line, breaking at spaces or by character. */
function wrapText(text: string, maxChars: number): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current && (current.length + 1 + word.length) > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines.join('\n');
}
