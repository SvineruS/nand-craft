export type { Gate, GateType } from '../simulation/gateTypes.ts';
import type { GateType } from '../simulation/gateTypes.ts';
import * as SVG from './gateSvg.ts';

export interface PinDef {
  kind: 'input' | 'output';
  x: number;  // grid units relative to gate origin
  y: number;  // grid units relative to gate origin
  label?: string;
  bitWidth?: number;  // override per-pin (e.g. tristate enable is always 1-bit)
}

export interface SvgLayer {
  path: string;
  fill?: boolean;    // default true
  stroke?: boolean;  // default true
  alpha?: number;    // default 1
}

export interface GateDefinition {
  label: string;
  description: string;
  width: number;   // grid units
  height: number;  // grid units
  pins: PinDef[];
  svg?: string | SvgLayer[];  // String = single path. Array = layers (variants or stacked)
  color?: string;  // fill color for the gate body
  stroke?: string; // stroke color for the gate outline
  labelX?: number; // label x offset in grid units from center (default 0)
  labelY?: number; // label y offset in grid units from center (default 0)
}


const GATE_DEFS: Record<GateType, GateDefinition> = {
  nand: {
    label: 'NAND', description: 'Bitwise NAND gate', width: 3, height: 2,    color: '#3b2d50', stroke: '#7c5aad',
    pins: [
      { kind: 'input', x: 0, y: 0 },
      { kind: 'input', x: 0, y: 2 },
      { kind: 'output', x: 3, y: 1 },
    ],
    svg: SVG.NAND,
  },
  and: {
    label: 'AND', description: 'Bitwise AND gate', width: 3, height: 2,    color: '#2d3a50', stroke: '#5a8aad',
    pins: [
      { kind: 'input', x: 0, y: 0 },
      { kind: 'input', x: 0, y: 2 },
      { kind: 'output', x: 3, y: 1 },
    ],
    svg: SVG.AND,
  },
  or: {
    label: 'OR', description: 'Bitwise OR gate', width: 3, height: 2,    color: '#2d4a3a', stroke: '#5aad7c',
    pins: [
      { kind: 'input', x: 0, y: 0 },
      { kind: 'input', x: 0, y: 2 },
      { kind: 'output', x: 3, y: 1 },
    ],
    svg: SVG.OR,
  },
  nor: {
    label: 'NOR', description: 'Bitwise NOR gate', width: 3, height: 2,    color: '#3a2d4a', stroke: '#8a5aad',
    pins: [
      { kind: 'input', x: 0, y: 0 },
      { kind: 'input', x: 0, y: 2 },
      { kind: 'output', x: 3, y: 1 },
    ],
    svg: SVG.NOR,
  },
  xor: {
    label: 'XOR', description: 'Bitwise XOR gate', width: 3, height: 2,    color: '#2d4a50', stroke: '#5aadbd',
    pins: [
      { kind: 'input', x: 0, y: 0 },
      { kind: 'input', x: 0, y: 2 },
      { kind: 'output', x: 3, y: 1 },
    ],
    svg: SVG.XOR,
  },
  xnor: {
    label: 'XNOR', description: 'Bitwise XNOR gate', width: 3, height: 2,    color: '#3a4a2d', stroke: '#8aad5a',
    pins: [
      { kind: 'input', x: 0, y: 0 },
      { kind: 'input', x: 0, y: 2 },
      { kind: 'output', x: 3, y: 1 },
    ],
    svg: SVG.XNOR,
  },
  not: {
    label: 'NOT', description: 'Inverter', width: 2, height: 2,    color: '#4a2d3a', stroke: '#ad5a7c', labelX: -0.3,
    pins: [
      { kind: 'input', x: 0, y: 1 },
      { kind: 'output', x: 2, y: 1 },
    ],
    svg: SVG.NOT,
  },
  '8bit-or': {
    label: 'OR8', description: '8-bit OR gate', width: 3, height: 2,    color: '#2d4a3a', stroke: '#5aad7c',
    pins: [
      { kind: 'input', x: 0, y: 0, bitWidth: 8 },
      { kind: 'input', x: 0, y: 2, bitWidth: 8 },
      { kind: 'output', x: 3, y: 1, bitWidth: 8 },
    ],
    svg: SVG.OR,
  },
  '8bit-nor': {
    label: 'NOR8', description: '8-bit NOR gate', width: 3, height: 2,    color: '#3a2d4a', stroke: '#8a5aad',
    pins: [
      { kind: 'input', x: 0, y: 0, bitWidth: 8 },
      { kind: 'input', x: 0, y: 2, bitWidth: 8 },
      { kind: 'output', x: 3, y: 1, bitWidth: 8 },
    ],
    svg: SVG.NOR,
  },
  '8bit-not': {
    label: 'NOT8', description: '8-bit inverter', width: 2, height: 2,
    color: '#4a2d3a', stroke: '#ad5a7c', labelX: -0.3,
    pins: [
      { kind: 'input', x: 0, y: 1, bitWidth: 8 },
      { kind: 'output', x: 2, y: 1, bitWidth: 8 },
    ],
    svg: SVG.NOT_8BIT,
  },
  '3bit-or': {
    label: 'OR3', description: '3-input OR gate', width: 3, height: 2,    color: '#2d4a3a', stroke: '#5aad7c',
    pins: [
      { kind: 'input', x: 0, y: 0 },
      { kind: 'input', x: 0, y: 1 },
      { kind: 'input', x: 0, y: 2 },
      { kind: 'output', x: 3, y: 1 },
    ],
    svg: SVG.OR,
  },
  '3bit-and': {
    label: 'AND3', description: '3-input AND gate', width: 3, height: 2,    color: '#2d3a50', stroke: '#5a8aad',
    pins: [
      { kind: 'input', x: 0, y: 0 },
      { kind: 'input', x: 0, y: 1 },
      { kind: 'input', x: 0, y: 2 },
      { kind: 'output', x: 3, y: 1 },
    ],
    svg: SVG.AND,
  },
  '2bit-adder': {
    label: 'HA', description: 'Half adder', width: 2, height: 2,
    color: '#50402d', stroke: '#ad8a5a',
    pins: [
      { kind: 'input', x: 0, y: 0, label: 'A' },
      { kind: 'input', x: 0, y: 2, label: 'B' },
      { kind: 'output', x: 2, y: 0, label: 'S' },
      { kind: 'output', x: 2, y: 2, label: 'C' },
    ],
    svg: SVG.ADDER,
  },
  '3bit-adder': {
    label: 'FA', description: 'Full adder', width: 2, height: 2,
    color: '#50402d', stroke: '#ad8a5a',
    pins: [
      { kind: 'input', x: 0, y: 0, label: 'A' },
      { kind: 'input', x: 0, y: 1, label: 'B' },
      { kind: 'input', x: 0, y: 2, label: 'Ci' },
      { kind: 'output', x: 2, y: 0, label: 'S' },
      { kind: 'output', x: 2, y: 2, label: 'Co' },
    ],
    svg: SVG.ADDER,
  },
  '1bit-decoder': {
    label: 'DEC1', description: '1-to-2 decoder', width: 2, height: 2,    color: '#402d50', stroke: '#8a5aad',
    pins: [
      { kind: 'input', x: 0, y: 1 },
      { kind: 'output', x: 2, y: 0, label: '0' },
      { kind: 'output', x: 2, y: 2, label: '1' },
    ],
    svg: [{ path: SVG.DECODER_2_0 }, { path: SVG.DECODER_2_1 }],
  },
  '3bit-decoder': {
    label: 'DEC3', description: '3-to-8 decoder', width: 2, height: 8,    color: '#402d50', stroke: '#8a5aad',
    pins: [
      { kind: 'input', x: 0, y: 1, label: 'A' },
      { kind: 'input', x: 0, y: 2, label: 'B' },
      { kind: 'input', x: 0, y: 3, label: 'C' },
      { kind: 'output', x: 2, y: 0, label: '0' },
      { kind: 'output', x: 2, y: 1, label: '1' },
      { kind: 'output', x: 2, y: 2, label: '2' },
      { kind: 'output', x: 2, y: 3, label: '3' },
      { kind: 'output', x: 2, y: 4, label: '4' },
      { kind: 'output', x: 2, y: 5, label: '5' },
      { kind: 'output', x: 2, y: 6, label: '6' },
      { kind: 'output', x: 2, y: 7, label: '7' },
    ],
    svg: SVG.DECODER_8,
  },
  '8bit-adder': {
    label: 'ADD8', description: '8-bit adder', width: 2, height: 2,
    color: '#50402d', stroke: '#ad8a5a',
    pins: [
      { kind: 'input', x: 0, y: 0, label: 'Ci', bitWidth: 1 },
      { kind: 'input', x: 0, y: 1, label: 'A', bitWidth: 8 },
      { kind: 'input', x: 0, y: 2, label: 'B', bitWidth: 8 },
      { kind: 'output', x: 2, y: 0, label: 'S', bitWidth: 8 },
      { kind: 'output', x: 2, y: 2, label: 'Co', bitWidth: 1 },
    ],
    svg: SVG.ADDER,
  },
  '8bit-negative': {
    label: 'NEG8', description: '8-bit negate', width: 2, height: 2,    color: '#502d2d', stroke: '#ad5a5a',
    pins: [
      { kind: 'input', x: 0, y: 1, bitWidth: 8 },
      { kind: 'output', x: 2, y: 1, bitWidth: 8 },
    ],
    svg: SVG.NEGATE,
  },
  '8bit-subtractor': {
    label: 'SUB', description: '8-bit subtractor (A-B)', width: 2, height: 2,
    color: '#2d4a3a', stroke: '#5aad7a',
    pins: [
      { kind: 'input', x: 0, y: 0, label: 'A', bitWidth: 8 },
      { kind: 'input', x: 0, y: 2, label: 'B', bitWidth: 8 },
      { kind: 'output', x: 2, y: 1, bitWidth: 8 },
    ],
    svg: SVG.ADDER,
  },
  '8bit-mux': {
    label: 'MUX8', description: '8-bit 2-to-1 multiplexer', width: 2, height: 2,
    color: '#4a4a2d', stroke: '#adad5a',
    pins: [
      { kind: 'input', x: 1, y: 0, label: 'S', bitWidth: 1 },
      { kind: 'input', x: 0, y: 0, label: 'A', bitWidth: 8 },
      { kind: 'input', x: 0, y: 2, label: 'B', bitWidth: 8 },
      { kind: 'output', x: 2, y: 1, bitWidth: 8 },
    ],
    svg: [{ path: SVG.MUX_8BIT_A }, { path: SVG.MUX_8BIT_B }],
  },
  mux: {
    label: 'MUX', description: '2-to-1 multiplexer', width: 2, height: 2,
    color: '#4a4a2d', stroke: '#adad5a',
    pins: [
      { kind: 'input', x: 1, y: 0, label: 'S', bitWidth: 1 },
      { kind: 'input', x: 0, y: 0, label: 'A' },
      { kind: 'input', x: 0, y: 2, label: 'B' },
      { kind: 'output', x: 2, y: 1 },
    ],
    svg: [{ path: SVG.MUX_A }, { path: SVG.MUX_B }],
  },
  delay: {
    label: 'DLY', description: '1-tick delay', width: 3, height: 2,    color: '#4a3a2d', stroke: '#ad8a5a',
    pins: [
      { kind: 'input', x: 0, y: 1 },
      { kind: 'output', x: 3, y: 1 },
    ],
    svg: SVG.DELAY,
  },
  'rs-latch': {
    label: 'RS', description: 'RS latch', width: 2, height: 2,
    color: '#4a3a2d', stroke: '#ad8a5a',
    pins: [
      { kind: 'input', x: 0, y: 0, label: 'S' },
      { kind: 'input', x: 0, y: 2, label: 'R' },
      { kind: 'output', x: 2, y: 1, label: 'Q' },
    ],
    svg: SVG.BOX_2x2,
  },
  '1bit-memory': {
    label: 'MEM', description: '1-bit register', width: 2, height: 2,
    color: '#4a3a2d', stroke: '#ad8a5a',
    pins: [
      { kind: 'input', x: 0, y: 0, label: 'V' },
      { kind: 'input', x: 0, y: 2, label: 'S' },
      { kind: 'output', x: 2, y: 1, label: 'Q' },
    ],
    svg: SVG.BOX_2x2,
  },
  '8bit-memory': {
    label: 'MEM8', description: '8-bit register', width: 2, height: 2,
    color: '#3a4a3a', stroke: '#7aad7a',
    pins: [
      { kind: 'input', x: 0, y: 0, label: 'V', bitWidth: 8 },
      { kind: 'input', x: 0, y: 2, label: 'S', bitWidth: 1 },
      { kind: 'output', x: 2, y: 1, label: 'Q', bitWidth: 8 },
    ],
    svg: SVG.BOX_2x2,
  },
  '8bit-counter': {
    label: 'CTR', description: '8-bit counter', width: 3, height: 2,    color: '#3a3a4a', stroke: '#7a7aad',
    pins: [
      { kind: 'output', x: 3, y: 1, label: 'Q', bitWidth: 8 },
    ],
    svg: SVG.COUNTER,
  },
  '8bit-counter-reset': {
    label: 'CTRS', description: '8-bit counter with set', width: 2, height: 2,
    color: '#3a3a4a', stroke: '#7a7aad',
    pins: [
      { kind: 'input', x: 0, y: 0, label: 'V', bitWidth: 8 },
      { kind: 'input', x: 0, y: 2, label: 'O', bitWidth: 1 },
      { kind: 'output', x: 2, y: 1, label: 'Q', bitWidth: 8 },
    ],
    svg: SVG.COUNTER,
  },
  tristate: {
    label: 'TRI', description: 'Tri-state buffer', width: 2, height: 2,    color: '#2d4a4a', stroke: '#5aadad', labelX: -0.3,
    pins: [
      { kind: 'input', x: 0, y: 1, label: 'in' },
      { kind: 'input', x: 1, y: 0, label: 'en', bitWidth: 1 },
      { kind: 'output', x: 2, y: 1 },
    ],
    svg: SVG.TRISTATE,
  },
  '8bit-tristate': {
    label: 'TRI8', description: '8-bit tri-state buffer', width: 2, height: 2,    color: '#2d4a4a', stroke: '#5aadad', labelX: -0.3,
    pins: [
      { kind: 'input', x: 0, y: 1, label: 'in', bitWidth: 8 },
      { kind: 'input', x: 1, y: 0, label: 'en', bitWidth: 1 },
      { kind: 'output', x: 2, y: 1, bitWidth: 8 },
    ],
    svg: SVG.TRISTATE_8BIT,
  },
  constant: {
    label: 'C', description: 'Constant value', width: 2, height: 2,    color: '#3a3a2d', stroke: '#8a8a5a',
    pins: [
      { kind: 'output', x: 2, y: 1 },
    ],
    svg: SVG.BOX_2x2,
  },
  'constant-8bit': {
    label: 'C8', description: '8-bit constant value', width: 2, height: 2,    color: '#3a3a2d', stroke: '#8a8a5a',
    pins: [
      { kind: 'output', x: 2, y: 1, bitWidth: 8 },
    ],
    svg: SVG.CONSTANT_8BIT,
  },
  'constant-16bit': {
    label: 'C16', description: '16-bit constant value', width: 2, height: 2,    color: '#3a3a2d', stroke: '#8a8a5a',
    pins: [
      { kind: 'output', x: 2, y: 1, bitWidth: 16 },
    ],
    svg: SVG.CONSTANT_16BIT,
  },
  input: {
    label: 'IN', description: 'Level input', width: 2, height: 2,    color: '#2d3d50', stroke: '#5a8abd', labelX: -0.1,
    pins: [
      { kind: 'output', x: 2, y: 1 },
    ],
    svg: SVG.INPUT,
  },
  'input-8bit': {
    label: 'IN8', description: '8-bit level input', width: 2, height: 2,    color: '#2d3d50', stroke: '#5a8abd', labelX: -0.1,
    pins: [
      { kind: 'output', x: 2, y: 1, bitWidth: 8 },
    ],
    svg: SVG.INPUT_8BIT,
  },
  'input-16bit': {
    label: 'IN16', description: '16-bit level input', width: 2, height: 2,    color: '#2d3d50', stroke: '#5a8abd', labelX: -0.1,
    pins: [
      { kind: 'output', x: 2, y: 1, bitWidth: 16 },
    ],
    svg: SVG.INPUT_8BIT,
  },
  output: {
    label: 'OUT', description: 'Level output', width: 2, height: 2,    color: '#3d2d50', stroke: '#8a5abd', labelX: 0.1,
    pins: [
      { kind: 'input', x: 0, y: 1 },
    ],
    svg: SVG.OUTPUT,
  },
  'output-8bit': {
    label: 'OUT8', description: '8-bit level output', width: 2, height: 2,    color: '#3d2d50', stroke: '#8a5abd', labelX: 0.1,
    pins: [
      { kind: 'input', x: 0, y: 1, bitWidth: 8 },
    ],
    svg: SVG.OUTPUT_8BIT,
  },
  'output-16bit': {
    label: 'OUT16', description: '16-bit level output', width: 2, height: 2,    color: '#3d2d50', stroke: '#8a5abd', labelX: 0.1,
    pins: [
      { kind: 'input', x: 0, y: 1, bitWidth: 16 },
    ],
    svg: SVG.OUTPUT_8BIT,
  },
  'input-sw': {
    label: 'IN', description: 'Switch input', width: 2, height: 2,
    color: '#2d3d50', stroke: '#5a8abd', labelX: -0.1,
    pins: [
      { kind: 'input', x: 1, y: 2, label: 'en', bitWidth: 1 },
      { kind: 'output', x: 2, y: 1 },
    ],
    svg: SVG.INPUT_SW,
  },
  'input-8bit-sw': {
    label: 'IN8', description: '8-bit switch input', width: 2, height: 2,
    color: '#2d3d50', stroke: '#5a8abd', labelX: -0.1,
    pins: [
      { kind: 'input', x: 1, y: 2, label: 'en', bitWidth: 1 },
      { kind: 'output', x: 2, y: 1, bitWidth: 8 },
    ],
    svg: SVG.INPUT_8BIT_SW,
  },
  'input-16bit-sw': {
    label: 'IN16', description: '16-bit switch input', width: 2, height: 2,
    color: '#2d3d50', stroke: '#5a8abd', labelX: -0.1,
    pins: [
      { kind: 'input', x: 1, y: 2, label: 'en', bitWidth: 1 },
      { kind: 'output', x: 2, y: 1, bitWidth: 16 },
    ],
    svg: SVG.INPUT_8BIT_SW,
  },
  'output-sw': {
    label: 'OUT', description: 'Switch output', width: 2, height: 2,
    color: '#3d2d50', stroke: '#8a5abd', labelX: 0.1,
    pins: [
      { kind: 'input', x: 0, y: 1 },
      { kind: 'input', x: 1, y: 2, label: 'en', bitWidth: 1 },
    ],
    svg: SVG.OUTPUT_SW,
  },
  'output-8bit-sw': {
    label: 'OUT8', description: '8-bit switch output', width: 2, height: 2,
    color: '#3d2d50', stroke: '#8a5abd', labelX: 0.1,
    pins: [
      { kind: 'input', x: 0, y: 1, bitWidth: 8 },
      { kind: 'input', x: 1, y: 2, label: 'en', bitWidth: 1 },
    ],
    svg: SVG.OUTPUT_8BIT_SW,
  },
  'output-16bit-sw': {
    label: 'OUT16', description: '16-bit switch output', width: 2, height: 2,
    color: '#3d2d50', stroke: '#8a5abd', labelX: 0.1,
    pins: [
      { kind: 'input', x: 0, y: 1, bitWidth: 16 },
      { kind: 'input', x: 1, y: 2, label: 'en', bitWidth: 1 },
    ],
    svg: SVG.OUTPUT_8BIT_SW,
  },
  splitter: {
    label: 'SPL', description: '8-bit bus splitter', width: 2, height: 7,    color: '#2d4040', stroke: '#5a9090',
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
    svg: SVG.SPLITTER,
  },
  joiner: {
    label: 'JON', description: '8-bit bus joiner', width: 2, height: 7,    color: '#40402d', stroke: '#90905a',
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
    svg: SVG.JOINER,
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


import { getComponent } from '../components/componentRegistry.ts';
import type { ComponentId } from '../editor/types.ts';

/** Component definition cache. */
const componentDefCache = new Map<string, GateDefinition>();

/** Look up gate definition. For component gates, type IS the component ID. */
export function getGateDefinition(type: GateType): GateDefinition {
  // Built-in gate
  const builtIn = GATE_DEFS[type as keyof typeof GATE_DEFS];
  if (builtIn) return builtIn;

  // Component gate — type is the component ID
  const cached = componentDefCache.get(type);
  if (cached) return cached;

  const comp = getComponent(type as ComponentId);
  if (comp) {
    const def: GateDefinition = {
      label: comp.name,
      description: `Component: ${comp.name}`,
      width: comp.width,
      height: comp.height,
      pins: [
        ...comp.inputs.map(p => ({ kind: 'input' as const, x: p.gridPos.x, y: p.gridPos.y, label: p.name, bitWidth: p.bitWidth })),
        ...comp.outputs.map(p => ({ kind: 'output' as const, x: p.gridPos.x, y: p.gridPos.y, label: p.name, bitWidth: p.bitWidth })),
      ],
      svg: comp.svg,
      color: '#2d3d50',
      stroke: '#5a8abd',
    };
    componentDefCache.set(type, def);
    return def;
  }

  // Unknown type (deleted component, old save format) — return a fallback
  return {
    label: '?', description: `Unknown: ${type}`, width: 2, height: 2,
    color: '#4a2a2a', stroke: '#aa5555',
    pins: [],
  };
}

/** Bumped when component definitions change. Consumers compare to invalidate their caches. */
export let componentDefVersion = 0;

/** Clear component definition cache (call when components are saved/deleted). */
export function clearComponentDefCache(): void {
  componentDefCache.clear();
  pinMetaCache.clear();
  componentDefVersion++;
}

/** Pin counts and bit widths, split by kind and indexed by pin index. */
export interface GatePinMeta {
  inputBitWidths: readonly number[];
  outputBitWidths: readonly number[];
  inputCount: number;
  outputCount: number;
}

const pinMetaCache = new Map<GateType, GatePinMeta>();

/**
 * Cached per-type pin metadata. Hot: called per pin per gate during build and
 * rendering, so it must not allocate — derive everything from here rather than
 * filtering GateDefinition.pins at each call site.
 */
export function getGatePinMeta(gateType: GateType): GatePinMeta {
  const cached = pinMetaCache.get(gateType);
  if (cached) return cached;

  const inputBitWidths: number[] = [];
  const outputBitWidths: number[] = [];
  for (const pin of getGateDefinition(gateType).pins) {
    const widths = pin.kind === 'input' ? inputBitWidths : outputBitWidths;
    widths.push(pin.bitWidth ?? 1);
  }

  const meta: GatePinMeta = {
    inputBitWidths,
    outputBitWidths,
    inputCount: inputBitWidths.length,
    outputCount: outputBitWidths.length,
  };
  pinMetaCache.set(gateType, meta);
  return meta;
}

/** All built-in gate type entries for iteration (e.g. sidebar). */
export function getAllGateDefinitions(): [GateType, GateDefinition][] {
  return Object.entries(GATE_DEFS) as [GateType, GateDefinition][];
}

/** Get bitWidth for a specific pin from the gate definition. */
export function getPinBitWidth(gateType: GateType, kind: 'input' | 'output', index: number): number {
  const meta = getGatePinMeta(gateType);
  const widths = kind === 'input' ? meta.inputBitWidths : meta.outputBitWidths;
  return widths[index] ?? 1;
}

/** Count input/output pins from gate definition. */
export function getPinCounts(gateType: GateType): { inputs: number; outputs: number } {
  const meta = getGatePinMeta(gateType);
  return { inputs: meta.inputCount, outputs: meta.outputCount };
}
