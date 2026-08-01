import type { Vec2 } from '../utils/vec2.ts';
import type { GateType } from '../../simulation/gateTypes.ts';
import type { GateButtonKind } from '../gates.ts';
import type { MapRect } from '../utils/mapBounds.ts';

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

/**
 * One of a gate's on-body buttons — the RAM chip's memory and program window openers.
 *
 * Positioned in world space and drawn upright, so the icon stays readable on a gate that
 * has been rotated. `icon` is what the button opens; the painter has a glyph per kind.
 */
export interface RenderGateButton {
  pos: Vec2;
  radius: number;
  icon: GateButtonKind;
  hovered: boolean;
}

export interface RenderPin {
  pos: Vec2;
  fillColor: string;
  strokeColor: string;
  radius: number;
  strokeWidth: number;
}

/**
 * A pin's name, placed just outside the pin it belongs to. `align` is how the text sits
 * against `pos` — it grows away from the pin, so a long name never covers it.
 */
export interface RenderPinLabel {
  text: string;
  pos: Vec2;
  align: 'left' | 'right' | 'center';
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
  /** Buildable area. The painter dims the background outside it and outlines the edge. */
  map: MapRect;
  wireSegments: RenderWireSegment[];
  wireNodes: RenderWireNode[];
  gates: RenderGate[];
  /** Buttons drawn on top of the gates that have one. */
  gateButtons: RenderGateButton[];
  pins: RenderPin[];
  /** Pin names for the single selected gate. Empty the rest of the time. */
  pinLabels: RenderPinLabel[];
  errorSegments: RenderErrorSegment[];
  selection: RenderSelectionItem[];
  selectionRect: { pos: Vec2; w: number; h: number } | null;
  wireInProgress: { from: Vec2; to: Vec2; color: string } | null;
  dropPreview: RenderGate | null;
  pastePreview: RenderPastePreview | null;
}
