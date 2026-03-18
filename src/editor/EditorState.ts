import type { Circuit, GateId, GateType, WireNodeId, WireSegmentId, PinId } from '../types.ts';
import { createCircuit } from '../types.ts';

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

export interface EditorState {
  circuit: Circuit;
  camera: Camera;
  selection: SelectionItem[];
  hoveredGate: GateId | null;
  hoveredPin: PinId | null;
  hoveredNode: WireNodeId | null;
  wireStartPin: PinId | null;
  wireStartNode: WireNodeId | null;
  isDragging: boolean;
  dragStart: { x: number; y: number } | null;
  selectionRect: { x: number; y: number; w: number; h: number } | null;
  dropPreview: { type: PlaceableType; x: number; y: number } | null;
  simulationRunning: boolean;
  shortCircuitGates: GateId[];
  contentionNets: string[];
  dirty: boolean;
}

export function createEditorState(): EditorState {
  return {
    circuit: createCircuit(),
    camera: { x: 0, y: 0, zoom: 1 },
    selection: [],
    hoveredGate: null,
    hoveredPin: null,
    hoveredNode: null,
    wireStartPin: null,
    wireStartNode: null,
    isDragging: false,
    dragStart: null,
    selectionRect: null,
    dropPreview: null,
    simulationRunning: false,
    shortCircuitGates: [],
    contentionNets: [],
    dirty: true,
  };
}
