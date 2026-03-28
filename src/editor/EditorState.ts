import { Circuit } from './circuit.ts';
import type { GateId, GateType, Rotation, WireNodeId, WireSegmentId } from '../types.ts';
import type { Vec2 } from './utils/vec2.ts';
import type { WireEndpoint } from './utils/geometry.ts';

export type PlaceableType = GateType;

export type InteractionMode =
  | { kind: 'normal' }
  | { kind: 'stamping'; gateType: GateType }
  | { kind: 'wiring'; start: WireEndpoint }
  | { kind: 'pasting'; cursor: Vec2 | null };

export interface Camera {
  pos: Vec2;
  zoom: number;
}

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
  pinBitWidths: number[];
  pinValues: (number | null)[];
}
export interface ClipboardNode {
  delta: Vec2;
  gateIdx?: number; pinIdx?: number;
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
  isDragging: boolean;
  dragStart: Vec2 | null;
  selectionRect: { pos: Vec2; w: number; h: number } | null;
  dropPreview: { type: PlaceableType; pos: Vec2 } | null;
  clipboard: ClipboardData | null;
  simulationRunning: boolean;
  shortCircuitGates: GateId[];
  contentionNets: string[];
  wireColor: string;
  renderDirty: boolean;
  circuitDirty: boolean;
}

export const WIRE_COLORS = [
  '#4a4a7a', // default (no override)
  '#fb923c', // orange
  '#facc15', // yellow
  '#60a5fa', // blue
  '#c084fc', // purple
  '#f472b6', // pink
  '#8b5cf6', // violet
  '#14b8a6', // teal
  '#ffffff', // white
];

export function createEditorState(): EditorState {
  return {
    circuit: new Circuit(),
    camera: { pos: { x: 0, y: 0 }, zoom: 1 },
    selection: [],
    hoveredGate: null,
    hoveredEndpoint: null,
    mode: { kind: 'normal' },
    isDragging: false,
    dragStart: null,
    selectionRect: null,
    dropPreview: null,
    clipboard: null,
    simulationRunning: false,
    shortCircuitGates: [],
    contentionNets: [],
    wireColor: WIRE_COLORS[0],
    renderDirty: true,
    circuitDirty: true,
  };
}
