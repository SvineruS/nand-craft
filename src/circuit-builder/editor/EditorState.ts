import { Circuit } from '../simulation/circuit.ts';
import type { GateId, Rotation, WireNodeId, WireSegmentId } from './types.ts';
import type { Vec2 } from './utils/vec2.ts';
import type { WireEndpoint } from './utils/geometry.ts';
import type { Camera } from '../../engine/camera.ts';
import type { GateType } from "./gates.ts";
import { WIRE_COLORS } from "./consts.ts";

export type { Camera };

export type PlaceableType = GateType;

export type InteractionMode =
  | { kind: 'normal' }
  | { kind: 'stamping'; gateType: GateType }
  | { kind: 'wiring'; start: WireEndpoint }
  | { kind: 'pasting'; cursor: Vec2 | null };

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
  state?: unknown;
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

export interface EditorState {
  circuit: Circuit;
  camera: Camera;
  selection: SelectionItem[];
  hoveredGate: GateId | null;
  hoveredEndpoint: WireEndpoint | null;
  mode: InteractionMode;
  selectionRect: { pos: Vec2; w: number; h: number } | null;
  dropPreview: { type: PlaceableType; pos: Vec2 } | null;
  clipboard: ClipboardData | null;
  wireColor: string;
  renderDirty: boolean;
  circuitDirty: boolean;
  valueDirty: boolean;
  recentGateTypes: GateType[];
}

export function createEditorState(): EditorState {
  return {
    circuit: new Circuit(),
    camera: { pos: { x: 0, y: 0 }, zoom: 1 },
    selection: [],
    hoveredGate: null,
    hoveredEndpoint: null,
    mode: { kind: 'normal' },
    selectionRect: null,
    dropPreview: null,
    clipboard: null,
    wireColor: WIRE_COLORS[0],
    renderDirty: true,
    circuitDirty: true,
    valueDirty: false,
    recentGateTypes: [],
  };
}
