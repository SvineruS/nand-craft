import type { Vec2 } from '../utils/vec2.ts';
import type { GateType } from '../../simulation/gateTypes.ts';

export interface RenderWireSegment {
  from: Vec2;
  to: Vec2;
  bodyColor: string;
  thickness: number;
  multibit: boolean;
  signalColor: string | null;
  valueLabels: { text: string; color: string; pos: Vec2 }[];
  nameLabel: { text: string; color: string; pos: Vec2 } | null;
}

export interface RenderWireNode {
  pos: Vec2;
  strokeColor: string;
  signalColor: string | null;
  radius: number;
  strokeWidth: number;
}

export interface RenderGate {
  type: GateType;
  center: Vec2;
  w: number;
  h: number;
  rotation: number;
  fillColor: string;
  strokeColor: string;
  hasSvg: boolean;
  svgLayers: number[]; // Which svg layer indices to draw
  label: string;
  labelPos: Vec2;
  labelFont: string;
  labelColor: string;
  valueLabel: { text: string; color: string; pos: Vec2 } | null;
  errorGlow: boolean;
  /** Preview pin dots (relative to center). Only set for drop/paste previews. */
  previewPins?: Vec2[];
}

export interface RenderPin {
  pos: Vec2;
  fillColor: string;
  strokeColor: string;
  radius: number;
  strokeWidth: number;
}

export interface RenderErrorSegment {
  from: Vec2;
  to: Vec2;
  labelPos: Vec2 | null;
}

export type RenderSelectionItem =
  | { kind: 'gate'; center: Vec2; w: number; h: number; rotation: number }
  | { kind: 'wireNode'; pos: Vec2 }
  | { kind: 'wireSegment'; from: Vec2; to: Vec2 };

export interface RenderPastePreview {
  gates: RenderGate[];
  wires: { from: Vec2; to: Vec2 }[];
  nodes: Vec2[];
}

export interface RenderScene {
  wireSegments: RenderWireSegment[];
  wireNodes: RenderWireNode[];
  gates: RenderGate[];
  pins: RenderPin[];
  errorSegments: RenderErrorSegment[];
  selection: RenderSelectionItem[];
  selectionRect: { pos: Vec2; w: number; h: number } | null;
  wireInProgress: { from: Vec2; to: Vec2; color: string } | null;
  dropPreview: RenderGate | null;
  pastePreview: RenderPastePreview | null;
}
