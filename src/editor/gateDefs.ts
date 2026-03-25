import type { GateType } from '../types.ts';

// ---------------------------------------------------------------------------
// Gate Definition Interfaces
// ---------------------------------------------------------------------------

export interface PinDef {
  kind: 'input' | 'output';
  x: number;  // grid units relative to gate origin
  y: number;  // grid units relative to gate origin
  label?: string;
  bitWidth?: number;  // override per-pin (e.g. tristate enable is always 1-bit)
}

export interface GateDefinition {
  label: string;
  description: string;
  width: number;   // grid units
  height: number;  // grid units
  pins: PinDef[];
  svg?: string;    // SVG path data scaled to width×height grid units
  placeable?: boolean; // show in sidebar (default false)
  color?: string;  // fill color for the gate body
  stroke?: string; // stroke color for the gate outline
  labelX?: number; // label x offset in grid units from center (default 0)
  labelY?: number; // label y offset in grid units from center (default 0)
}

// ---------------------------------------------------------------------------
// Gate Definition Registry
// ---------------------------------------------------------------------------

// SVG paths are in grid-unit coordinates (0,0 to width,height)
// They get scaled by GRID_SIZE at render time

export const GATE_DEFS: Record<GateType, GateDefinition> = {
  nand: {
    label: 'NAND', description: 'Bitwise NAND gate', width: 3, height: 2, placeable: true,
    color: '#3b2d50', stroke: '#7c5aad',
    pins: [
      { kind: 'input', x: 0, y: 0 },
      { kind: 'input', x: 0, y: 2 },
      { kind: 'output', x: 3, y: 1 },
    ],
    svg: 'M 0.2,0.1 L 0.2,1.9 L 1.5,1.9 A 0.9,0.9 0 0,0 1.5,0.1 Z M 2.6,1 m -0.15,0 a 0.15,0.15 0 1,0 0.3,0 a 0.15,0.15 0 1,0 -0.3,0',
  },
  and: {
    label: 'AND', description: 'Bitwise AND gate', width: 3, height: 2, placeable: true,
    color: '#2d3a50', stroke: '#5a8aad',
    pins: [
      { kind: 'input', x: 0, y: 0 },
      { kind: 'input', x: 0, y: 2 },
      { kind: 'output', x: 3, y: 1 },
    ],
    svg: 'M 0.2,0.1 L 0.2,1.9 L 1.5,1.9 A 0.9,0.9 0 0,0 1.5,0.1 Z',
  },
  or: {
    label: 'OR', description: 'Bitwise OR gate', width: 3, height: 2, placeable: true,
    color: '#2d4a3a', stroke: '#5aad7c',
    pins: [
      { kind: 'input', x: 0, y: 0 },
      { kind: 'input', x: 0, y: 2 },
      { kind: 'output', x: 3, y: 1 },
    ],
    svg: 'M 0.2,0.1 Q 0.8,1 0.2,1.9 L 1.2,1.9 Q 2.3,1.9 2.8,1 Q 2.3,0.1 1.2,0.1 Z',
  },
  nor: {
    label: 'NOR', description: 'Bitwise NOR gate', width: 3, height: 2, placeable: true,
    color: '#3a2d4a', stroke: '#8a5aad',
    pins: [
      { kind: 'input', x: 0, y: 0 },
      { kind: 'input', x: 0, y: 2 },
      { kind: 'output', x: 3, y: 1 },
    ],
    svg: 'M 0.2,0.1 Q 0.8,1 0.2,1.9 L 1.2,1.9 Q 2.1,1.9 2.5,1 Q 2.1,0.1 1.2,0.1 Z M 2.6,1 m -0.15,0 a 0.15,0.15 0 1,0 0.3,0 a 0.15,0.15 0 1,0 -0.3,0',
  },
  not: {
    label: 'NOT', description: 'Inverter', width: 2, height: 2, placeable: true,
    color: '#4a2d3a', stroke: '#ad5a7c', labelX: -0.3,
    pins: [
      { kind: 'input', x: 0, y: 1 },
      { kind: 'output', x: 2, y: 1 },
    ],
    svg: 'M 0.2,0.3 L 0.2,1.7 L 1.5,1 Z M 1.65,1 m -0.18,0 a 0.18,0.18 0 1,0 0.36,0 a 0.18,0.18 0 1,0 -0.36,0',
  },
  delay: {
    label: 'DLY', description: '1-tick delay', width: 3, height: 2, placeable: true,
    color: '#4a3a2d', stroke: '#ad8a5a',
    pins: [
      { kind: 'input', x: 0, y: 1 },
      { kind: 'output', x: 3, y: 1 },
    ],
    svg: 'M 0.3,0.3 L 2.7,0.3 L 2.7,1.7 L 0.3,1.7 Z M 1.0,1.3 L 1.5,0.5 L 2.0,1.3 Z',
  },
  tristate: {
    label: 'TRI', description: 'Tri-state buffer', width: 2, height: 2, placeable: true,
    color: '#2d4a4a', stroke: '#5aadad', labelX: -0.3,
    pins: [
      { kind: 'input', x: 0, y: 1, label: 'in' },
      { kind: 'input', x: 1, y: 0, label: 'en', bitWidth: 1 },
      { kind: 'output', x: 2, y: 1 },
    ],
    svg: 'M 0.15,0.1 L 0.15,1.9 L 1.7,1 Z',
  },
  constant: {
    label: 'C', description: 'Constant value', width: 2, height: 2, placeable: true,
    color: '#3a3a2d', stroke: '#8a8a5a',
    pins: [
      { kind: 'output', x: 2, y: 1 },
    ],
    svg: 'M 0.3,0.3 L 1.7,0.3 L 1.7,1.7 L 0.3,1.7 Z',
  },
  input: {
    label: 'IN', description: 'Level input', width: 2, height: 2,
    color: '#2d3d50', stroke: '#5a8abd', labelX: -0.1,
    pins: [
      { kind: 'output', x: 2, y: 1 },
    ],
    svg: 'M 0.2,0.3 L 1.3,0.3 L 1.8,1 L 1.3,1.7 L 0.2,1.7 Z',
  },
  output: {
    label: 'OUT', description: 'Level output', width: 2, height: 2,
    color: '#3d2d50', stroke: '#8a5abd', labelX: 0.1,
    pins: [
      { kind: 'input', x: 0, y: 1 },
    ],
    svg: 'M 1.8,0.3 L 0.7,0.3 L 0.2,1 L 0.7,1.7 L 1.8,1.7 Z',
  },
  splitter: {
    label: 'SPL', description: '8-bit bus splitter', width: 2, height: 7, placeable: true,
    color: '#2d4040', stroke: '#5a9090',
    pins: [
      { kind: 'input', x: 0, y: 3, bitWidth: 8 },
      { kind: 'output', x: 2, y: 0, bitWidth: 1 },
      { kind: 'output', x: 2, y: 1, bitWidth: 1 },
      { kind: 'output', x: 2, y: 2, bitWidth: 1 },
      { kind: 'output', x: 2, y: 3, bitWidth: 1 },
      { kind: 'output', x: 2, y: 4, bitWidth: 1 },
      { kind: 'output', x: 2, y: 5, bitWidth: 1 },
      { kind: 'output', x: 2, y: 6, bitWidth: 1 },
      { kind: 'output', x: 2, y: 7, bitWidth: 1 },
    ],
  },
  joiner: {
    label: 'JON', description: '8-bit bus joiner', width: 2, height: 7, placeable: true,
    color: '#40402d', stroke: '#90905a',
    pins: [
      { kind: 'input', x: 0, y: 0, bitWidth: 1 },
      { kind: 'input', x: 0, y: 1, bitWidth: 1 },
      { kind: 'input', x: 0, y: 2, bitWidth: 1 },
      { kind: 'input', x: 0, y: 3, bitWidth: 1 },
      { kind: 'input', x: 0, y: 4, bitWidth: 1 },
      { kind: 'input', x: 0, y: 5, bitWidth: 1 },
      { kind: 'input', x: 0, y: 6, bitWidth: 1 },
      { kind: 'input', x: 0, y: 7, bitWidth: 1 },
      { kind: 'output', x: 2, y: 3, bitWidth: 8 },
    ],
  },
  component: {
    label: 'CMP', description: 'Component', width: 3, height: 3,
    pins: [
      { kind: 'input', x: 0, y: 1 },
      { kind: 'output', x: 3, y: 1 },
    ],
  },
  level: {
    label: '', description: 'Level node', width: 4, height: 2,
    color: '#2d4d2d', stroke: '#5a8a5a',
    pins: [
      { kind: 'input', x: 0, y: 1 },
      { kind: 'output', x: 4, y: 1 },
    ],
  },
};
