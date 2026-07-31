import { Circuit } from '../../simulation/circuit.ts';
import type { GateId, PinRef, Rotation, WireNode, WireNodeId } from '../types.ts';
import { componentDefVersion, type Gate, getGateDefinition, getPinCounts } from '../gates.ts';
import { Vec2 } from './vec2.ts';
import { GRID_SIZE } from "../consts.ts";


export function cameraBoundingBox(camera: { pos: Vec2; zoom: number }, canvasSize: Vec2) {
  const vw = canvasSize.x / camera.zoom;
  const vh = canvasSize.y / camera.zoom;
  const left = camera.pos.x - vw / 2;
  const top = camera.pos.y - vh / 2;
  const right = camera.pos.x + vw / 2;
  const bottom = camera.pos.y + vh / 2;
  return { left, top, right, bottom };
}

// ---------------------------------------------------------------------------
// Gate geometry helpers
// ---------------------------------------------------------------------------

/** All PinRefs for a gate (inputs then outputs). */
export function getPinRefs(gate: Gate): PinRef[] {
  const { inputs, outputs } = getPinCounts(gate.type);
  const refs: PinRef[] = [];
  for (let i = 0; i < inputs; i++)
    refs.push({ gateId: gate.id, kind: 'input', index: i });
  for (let i = 0; i < outputs; i++)
    refs.push({ gateId: gate.id, kind: 'output', index: i });
  return refs;
}

/** Check if two PinRefs refer to the same pin. */
export function pinRefsEqual(a: PinRef, b: PinRef): boolean {
  return a.gateId === b.gateId && a.kind === b.kind && a.index === b.index;
}

/** Get gate pixel dimensions from definition. */
export function getGateDims(gate: Gate): { w: number; h: number } {
  const def = getGateDefinition(gate.type);
  return { w: def.width * GRID_SIZE, h: def.height * GRID_SIZE };
}

/** Gate center in world coordinates. */
export function gateCenter(gate: Gate): Vec2 {
  const { w, h } = getGateDims(gate);
  return { x: gate.pos.x + w / 2, y: gate.pos.y + h / 2 };
}

export interface PinPositions {
  readonly inputs: readonly Vec2[];
  readonly outputs: readonly Vec2[];
}

interface CachedPinPositions extends PinPositions {
  /** Everything the result depends on, so a stale entry is detectable without events. */
  posX: number;
  posY: number;
  rotation: Rotation;
  type: string;
  defVersion: number;
}

/**
 * Per-gate pin position cache.
 *
 * This is the hottest geometry call in the app: hit-testing walks every pin of every gate
 * on each mouse move, and buildScene does the same on every dirty frame. Recomputing meant
 * two Vec2 allocations per pin per call. Keyed by gate identity and invalidated by
 * comparing the inputs it was derived from — gates are mutated in place, so there is no
 * change event to hang this off.
 */
const pinPositionCache = new WeakMap<Gate, CachedPinPositions>();

/**
 * Pin positions for a gate — reads from definition, applies gate position + rotation.
 * Indexed by pin index within each kind.
 *
 * The returned arrays are cached and shared: treat them as immutable, and copy any Vec2
 * that is going to be stored elsewhere.
 */
export function getPinPositions(gate: Gate): PinPositions {
  const cached = pinPositionCache.get(gate);
  if (cached
    && cached.posX === gate.pos.x
    && cached.posY === gate.pos.y
    && cached.rotation === gate.rotation
    && cached.type === gate.type
    && cached.defVersion === componentDefVersion) {
    return cached;
  }

  const center = gateCenter(gate);
  const def = getGateDefinition(gate.type);

  const inputs: Vec2[] = [];
  const outputs: Vec2[] = [];

  for (const pinDef of def.pins) {
    const pinWorld = Vec2.add(gate.pos, Vec2.scale(pinDef, GRID_SIZE));
    const rotated = rotatePoint(pinWorld, center, gate.rotation);
    if (pinDef.kind === 'input') inputs.push(rotated);
    else outputs.push(rotated);
  }

  const entry: CachedPinPositions = {
    inputs, outputs,
    posX: gate.pos.x,
    posY: gate.pos.y,
    rotation: gate.rotation,
    type: gate.type,
    defVersion: componentDefVersion,
  };
  pinPositionCache.set(gate, entry);
  return entry;
}

/**
 * Iterate all pin positions as (PinRef, Vec2) pairs.
 * Convenience for code that needs to check every pin of a gate.
 */
export function* iteratePinPositions(gate: Gate): Generator<[PinRef, Vec2]> {
  const positions = getPinPositions(gate);
  for (let i = 0; i < positions.inputs.length; i++)
    yield [{ gateId: gate.id, kind: 'input', index: i }, positions.inputs[i]];
  for (let i = 0; i < positions.outputs.length; i++)
    yield [{ gateId: gate.id, kind: 'output', index: i }, positions.outputs[i]];
}

// ---------------------------------------------------------------------------
// Rotation + grid helpers
// ---------------------------------------------------------------------------

function rotatePoint(
  p: Vec2, c: Vec2,
  rotation: Rotation,
): Vec2 {
  const d = Vec2.sub(p, c);
  switch (rotation) {
    case 0  :
      return { x: p.x, y: p.y };
    case 90 :
      return { x: c.x - d.y, y: c.y + d.x };
    case 180:
      return { x: c.x - d.x, y: c.y - d.y };
    case 270:
      return { x: c.x + d.y, y: c.y - d.x };
    default:
      return { x: p.x, y: p.y };
  }
}

export function rotateBy(current: Rotation, degrees: number): Rotation {
  return (((current + degrees) % 360 + 360) % 360) as Rotation;
}

export function snapToGrid(v: number, offset = 0): number {
  return Math.round((v - offset) / GRID_SIZE) * GRID_SIZE + offset;
}

/**
 * Grid offset needed for a gate at the given rotation.
 * Non-square gates with odd (width+height) need a half-grid offset at 90°/270°
 * so that rotated pin positions land on grid lines.
 */
export function gateGridOffset(rotation: Rotation, w: number, h: number): number {
  if ((rotation === 90 || rotation === 270) && ((w + h) / GRID_SIZE) % 2 !== 0) {
    return GRID_SIZE / 2;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// WireEndpoint — unified abstraction for pins and wire nodes as wiring targets
// ---------------------------------------------------------------------------

export type WireEndpoint =
  | { kind: 'pin'; pin: PinRef; pos: Vec2 }
  | { kind: 'node'; nodeId: WireNodeId; pos: Vec2 };

export function findNodeForPin(circuit: Circuit, pin: PinRef): WireNodeId | null {
  return circuit.findNodeForPin(pin);
}

/** Sync anchored wire-node positions to their gate's current pin positions. */
export function updateAnchoredNodes(gate: Gate, circuit: Circuit): void {
  for (const [pinRef, pos] of iteratePinPositions(gate)) {
    const nodeId = circuit.findNodeForPin(pinRef);
    // Copy: pin positions come from a shared cache and must not be aliased into nodes.
    if (nodeId) circuit.getWireNode(nodeId).pos = Vec2.copy(pos);
  }
}

export interface ReconnectedNode {
  nodeId: WireNodeId;
  pin: PinRef;
  prevPos: Vec2;
}

/** Anchor free wire nodes that are near gate pins. Returns what changed (for undo). */
export function reconnectPinNodes(circuit: Circuit, gateIds: GateId[]): ReconnectedNode[] {
  const result: ReconnectedNode[] = [];
  for (const gateId of gateIds) {
    const gate = circuit.getGate(gateId);

    for (const [pinRef, pos] of iteratePinPositions(gate)) {
      // A pin that already has a node must not gain a second one
      if (circuit.findNodeForPin(pinRef)) continue;
      for (const node of circuit.wireNodes.values()) {
        if (node.pin) continue;
        if (Vec2.near(node.pos, pos, 2)) {
          result.push({ nodeId: node.id, pin: pinRef, prevPos: Vec2.copy(node.pos) });
          circuit.setWireNodePin(node.id, pinRef);
          node.pos = Vec2.copy(pos);
          break;
        }
      }
    }

  }
  return result;
}

/** Undo reconnectPinNodes: clear pin and restore original positions. */
export function undoReconnectPinNodes(circuit: Circuit, reconnected: ReconnectedNode[]): void {
  for (const r of reconnected) {
    circuit.setWireNodePin(r.nodeId, undefined);
    circuit.getWireNode(r.nodeId).pos = Vec2.copy(r.prevPos);
  }
}

/** Compute gate top-left position from a desired center position. */
function gatePosFromCenter(gate: Gate, center: Vec2): Vec2 {
  const { w, h } = getGateDims(gate);
  return Vec2.sub(center, { x: w / 2, y: h / 2 });
}

/** Rotate gates + free wire nodes around group center by `degrees`. Returns saved positions for undo. */
export function rotateGroup(
  circuit: Circuit,
  gates: Gate[],
  nodes: WireNode[],
  degrees: number,
) {
  if (gates.length === 0 && nodes.length === 0)
    return;

  const points: Vec2[] = [...gates.map(g => gateCenter(g)), ...nodes.map(n => n.pos)];
  const center = Vec2.avg(points);

  gates.map(gate => {
    const newCenter = Vec2.rotateAround(gateCenter(gate), center, degrees);
    gate.rotation = rotateBy(gate.rotation, degrees);
    const { w, h } = getGateDims(gate);
    const offset = gateGridOffset(gate.rotation, w, h);
    gate.pos = Vec2.snap(gatePosFromCenter(gate, newCenter), offset);
    updateAnchoredNodes(gate, circuit);
  });

  nodes.map(node => {
    node.pos = Vec2.snap(Vec2.rotateAround(node.pos, center, degrees));
  });

}

export function getAnchoredNodeIds(circuit: Circuit, gateIds: GateId[]): WireNodeId[] {
  return circuit.anchoredNodesOf(gateIds);
}

/** Remove wire nodes that have no remaining segments and aren't anchored to a pin. */
export function cleanupOrphanNodes(circuit: Circuit, nodeIds: Iterable<WireNodeId>): WireNode[] {
  const removed: WireNode[] = [];
  for (const nid of nodeIds) {
    const node = circuit.wireNodes.get(nid);
    if (!node || node.pin) continue;
    if (circuit.degreeOf(nid) === 0) {
      removed.push({ ...node, pos: Vec2.copy(node.pos) });
      circuit.removeWireNode(nid);
    }
  }
  return removed;
}
