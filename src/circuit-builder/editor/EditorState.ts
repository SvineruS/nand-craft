import { Circuit } from '../simulation/circuit.ts';
import type { GateId, Rotation, WireNodeId, WireSegmentId } from './types.ts';
import type { Vec2 } from './utils/vec2.ts';
import type { WireEndpoint } from './utils/geometry.ts';
import type { Camera } from '../../engine/camera.ts';
import type { GateType } from "./gates.ts";
import { WIRE_COLORS } from "./consts.ts";
import { DEFAULT_MAP_SIZE, type MapSize } from "./utils/mapBounds.ts";

export type { Camera };

export type PlaceableType = GateType;

export type InteractionMode =
  | { kind: 'normal' }
  | { kind: 'stamping'; gateType: GateType }
  | { kind: 'wiring'; start: WireEndpoint }
  | { kind: 'pasting'; cursor: Vec2 | null };

/**
 * Display status of a level-map node. Lives on EditorState rather than on the Gate: the
 * level map borrows the circuit editor to draw itself, but a gate has no business knowing
 * about level progression.
 */
export type LevelNodeStatus = 'locked' | 'available' | 'solved';

export type SelectionItem =
  | { type: 'gate'; id: GateId }
  | { type: 'wireNode'; id: WireNodeId }
  | { type: 'wireSegment'; id: WireSegmentId };

export function getSelectedIds(state: EditorState, type: 'gate'): GateId[];
export function getSelectedIds(state: EditorState, type: 'wireNode'): WireNodeId[];
export function getSelectedIds(state: EditorState, type: 'wireSegment'): WireSegmentId[];
export function getSelectedIds(state: EditorState, type: SelectionItem['type']): string[] {
  return state.selection.filter(s => s.type === type).map(s => s.id as string);
}

export interface ClipboardGate {
  type: GateType;
  delta: Vec2;
  rotation: Rotation;
  /** Constant gates only — the player's chosen value travels with the copy. */
  value?: number;
}
export interface ClipboardNode {
  delta: Vec2;
  gateIdx?: number;
  pinKind?: 'input' | 'output';
  pinIndex?: number;
}
export interface ClipboardWire {
  fromNodeIdx: number;
  toNodeIdx: number;
  color?: string; label?: string;
}
export interface ClipboardData {
  gates: ClipboardGate[];
  nodes: ClipboardNode[];
  wires: ClipboardWire[];
}

/**
 * In-flight drag, expressed as a visual overlay instead of a mutation.
 *
 * Drags used to edit the Circuit live and then undo themselves at mouseup so the real
 * command batch could apply to a pristine state. That rollback had to restore ids exactly,
 * and CommandHistory needed a runtime guard to catch commands executed mid-drag. Now the
 * circuit is untouched until the drag commits: buildScene applies this overlay, and
 * mouseup executes one command with the final offset.
 */
export interface DragPreview {
  /** Snapped world-space offset applied to the gates and nodes below. */
  offset: Vec2;
  gateIds: readonly GateId[];
  nodeIds: readonly WireNodeId[];
  /** Nodes drawn as if unanchored — a disconnect drag leaves their wires behind. */
  detachedNodeIds: readonly WireNodeId[];
  /**
   * Segment shown split by a node being dragged out of it. The segment is replaced by two
   * running through `pos`; nothing is split for real until mouseup.
   */
  split: { segmentId: WireSegmentId; pos: Vec2 } | null;
}

export function emptyDragPreview(): DragPreview {
  return { offset: { x: 0, y: 0 }, gateIds: [], nodeIds: [], detachedNodeIds: [], split: null };
}

export interface EditorState {
  circuit: Circuit;
  camera: Camera;
  /** Buildable area. Gates are clamped into it and the camera can't stray far past it. */
  mapSize: MapSize;
  selection: SelectionItem[];
  hoveredGate: GateId | null;
  hoveredEndpoint: WireEndpoint | null;
  /** Gate whose on-body button the cursor is over — see gateButtonPos. */
  hoveredGateButton: GateId | null;
  /** Cursor position in world space. Input writes it; the scene builder reads it. */
  mouseWorld: Vec2;
  mode: InteractionMode;
  selectionRect: { pos: Vec2; w: number; h: number } | null;
  dropPreview: { type: PlaceableType; pos: Vec2 } | null;
  clipboard: ClipboardData | null;
  wireColor: string;
  /** Set only by the level map; null in the circuit editor. */
  gateStatuses: Map<GateId, LevelNodeStatus> | null;
  /** Non-null only while a drag is in flight. Purely visual — see DragPreview. */
  dragPreview: DragPreview | null;
  renderDirty: boolean;
  circuitDirty: boolean;
  valueDirty: boolean;
  recentGateTypes: GateType[];
}

/** Shared clipboard that persists across level switches. */
let sharedClipboard: ClipboardData | null = null;

export function getSharedClipboard(): ClipboardData | null { return sharedClipboard; }
export function setSharedClipboard(data: ClipboardData | null): void { sharedClipboard = data; }

export function createEditorState(mapSize: MapSize = DEFAULT_MAP_SIZE): EditorState {
  return {
    circuit: new Circuit(),
    camera: { pos: { x: 0, y: 0 }, zoom: 1 },
    mapSize,
    selection: [],
    hoveredGate: null,
    hoveredEndpoint: null,
    hoveredGateButton: null,
    mouseWorld: { x: 0, y: 0 },
    mode: { kind: 'normal' },
    selectionRect: null,
    dropPreview: null,
    clipboard: sharedClipboard,
    wireColor: WIRE_COLORS[0],
    gateStatuses: null,
    dragPreview: null,
    renderDirty: true,
    circuitDirty: true,
    valueDirty: false,
    recentGateTypes: [],
  };
}
