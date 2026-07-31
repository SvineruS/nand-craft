import type { EditorState } from "../EditorState.ts";
import type { GateId, WireNodeId, WireSegmentId } from "../types.ts";
import { Vec2, routeCorner } from "./vec2.ts";
import { getGateDims, getPinPositions, snapToGrid, type WireEndpoint } from "./geometry.ts";
import type { Gate } from "../gates.ts";
import { GRID_SIZE } from "../consts.ts";


const HIT_RADIUS = 10;       // pin / wire node click target
const WIRE_HIT_DIST = 8;     // wire segment click target

// ---------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------

export function snapGateCenter(pos: Vec2, width: number, height: number, offset = 0): Vec2 {
  return {
    x: snapToGrid(pos.x - width * GRID_SIZE / 2, offset),
    y: snapToGrid(pos.y - height * GRID_SIZE / 2, offset),
  };
}

// ---------------------------------------------------------------------------
// Rect utilities
// ---------------------------------------------------------------------------

export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function normalizeRect(rectPos: Vec2, rw: number, rh: number): Rect {
  // Convert from drag rect (which can have negative width/height) to normalized rect with positive width/height and top-left corner
  const x = rw >= 0 ? rectPos.x : rectPos.x + rw;
  const y = rh >= 0 ? rectPos.y : rectPos.y + rh;
  const w = Math.abs(rw);
  const h = Math.abs(rh);
  return { x1: x, y1: y, x2: x + w, y2: y + h };
}

export function rectContainsGate(
  gate: Gate, normRect: Rect,
): boolean {
  const { w, h } = getGateDims(gate);
  const { x1, y1, x2, y2 } = normRect;
  return gate.pos.x >= x1 && gate.pos.y >= y1 && gate.pos.x + w <= x2 && gate.pos.y + h <= y2;
}

export function posInRect(pos: Vec2, rect: Rect): boolean {
  return pos.x >= rect.x1 && pos.x <= rect.x2 && pos.y >= rect.y1 && pos.y <= rect.y2
}

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

const GATE_HIT_PADDING = 4;

export function hitTestGate_(pos: Vec2, gate: Gate): boolean {
  const { w, h } = getGateDims(gate);
  const p = GATE_HIT_PADDING;
  return posInRect(pos, { x1: gate.pos.x - p, y1: gate.pos.y - p, x2: gate.pos.x + w + p, y2: gate.pos.y + h + p });
}


export function hitTestGate(pos: Vec2, state: EditorState): GateId | null {
  for (const gate of state.circuit.gates.values())
    if (hitTestGate_(pos, gate))
      return gate.id;
  return null;
}

/** Unified hit test — finds the closest pin or free wire node within radius. */
export function hitTestEndpoint(pos: Vec2, state: EditorState, excludeNode?: WireNodeId): WireEndpoint | null {
  let best: WireEndpoint | null = null;
  let bestDist = HIT_RADIUS;

  // Check free wire nodes
  for (const node of state.circuit.wireNodes.values()) {
    if (node.pin) continue; // anchored nodes are hit via their pin
    if (excludeNode && node.id === excludeNode) continue;
    const d = Vec2.dist(pos, node.pos);
    if (d < bestDist) {
      bestDist = d;
      best = { kind: 'node', nodeId: node.id, pos: node.pos };
    }
  }

  // Check pins (computed positions). Indexed loops rather than iteratePinPositions: this
  // runs for every gate on every mouse move, and the generator allocates a PinRef and a
  // tuple per pin just to throw them away.
  for (const gate of state.circuit.gates.values()) {
    const { inputs, outputs } = getPinPositions(gate);
    for (let i = 0; i < inputs.length; i++) {
      const d = Vec2.dist(pos, inputs[i]);
      if (d < bestDist) {
        bestDist = d;
        best = { kind: 'pin', pin: { gateId: gate.id, kind: 'input', index: i }, pos: Vec2.copy(inputs[i]) };
      }
    }
    for (let i = 0; i < outputs.length; i++) {
      const d = Vec2.dist(pos, outputs[i]);
      if (d < bestDist) {
        bestDist = d;
        best = { kind: 'pin', pin: { gateId: gate.id, kind: 'output', index: i }, pos: Vec2.copy(outputs[i]) };
      }
    }
  }

  return best;
}

export function hitTestWireSegment(pos: Vec2, state: EditorState): WireSegmentId | null {
  let closest: WireSegmentId | null = null;
  let closestDist = WIRE_HIT_DIST;
  for (const seg of state.circuit.wireSegments.values()) {
    const a = state.circuit.getWireNode(seg.from);
    const b = state.circuit.getWireNode(seg.to);
    const dist = distToRoutedPath(pos, a.pos, b.pos);
    if (dist < closestDist) {
      closestDist = dist;
      closest = seg.id;
    }
  }
  return closest;
}

// ---------------------------------------------------------------------------
// Distance helpers (private)
// ---------------------------------------------------------------------------

function pointToSegmentDist(p: Vec2, a: Vec2, b: Vec2): number {
  const d = Vec2.sub(b, a);
  const lenSq = d.x * d.x + d.y * d.y;

  if (lenSq === 0)
    return Vec2.dist(p, a);

  let t = ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / lenSq;
  t = Math.max(0, Math.min(1, t));

  return Math.hypot(p.x - (a.x + t * d.x), p.y - (a.y + t * d.y));
}

/** Distance from point to routed path (H/V + diagonal). */
function distToRoutedPath(p: Vec2, a: Vec2, b: Vec2): number {
  const c = routeCorner(a, b);
  if (!c) return pointToSegmentDist(p, a, b);
  return Math.min(pointToSegmentDist(p, a, c), pointToSegmentDist(p, c, b));
}
