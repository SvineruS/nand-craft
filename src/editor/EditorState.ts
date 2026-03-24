import type { Circuit, GateId, GateType, WireNodeId, WireSegmentId } from '../types.ts';
import { createCircuit } from '../types.ts';
import type { WireEndpoint } from './geometry.ts';

export type PlaceableType = GateType;

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export type SelectionItem =
  | { type: 'gate'; id: GateId }
  | { type: 'wireNode'; id: WireNodeId }
  | { type: 'wireSegment'; id: WireSegmentId };

export interface ClipboardGate {
  type: GateType;
  dx: number; dy: number;
  rotation: 0 | 90 | 180 | 270;
  pinBitWidths: number[];
  pinValues: (number | null)[];
}
export interface ClipboardNode {
  dx: number; dy: number;
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
  wireStart: WireEndpoint | null;
  isDragging: boolean;
  dragStart: { x: number; y: number } | null;
  selectionRect: { x: number; y: number; w: number; h: number } | null;
  dropPreview: { type: PlaceableType; x: number; y: number } | null;
  stampGateType: GateType | null;
  clipboard: ClipboardData | null;
  pasteMode: boolean;
  pasteCursor: { x: number; y: number } | null;
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
    circuit: createCircuit(),
    camera: { x: 0, y: 0, zoom: 1 },
    selection: [],
    hoveredGate: null,
    hoveredEndpoint: null,
    wireStart: null,
    isDragging: false,
    dragStart: null,
    selectionRect: null,
    dropPreview: null,
    stampGateType: null,
    clipboard: null,
    pasteMode: false,
    pasteCursor: null,
    simulationRunning: false,
    shortCircuitGates: [],
    contentionNets: [],
    wireColor: WIRE_COLORS[0],
    renderDirty: true,
    circuitDirty: true,
  };
}
