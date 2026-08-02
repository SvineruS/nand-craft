import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('3bit-decoder'),
  name: '3-bit Decoder',
  description: 'Build a 3-to-8 decoder.\n\nGiven 3-bit input (A, B, C), set exactly one of 8 outputs (O0–O7) to 1.\n\nO0=1 when ABC=000, O1=1 when ABC=001, ..., O7=1 when ABC=111.\n\nD (disable) overrides all of it: while D=1 every output is 0.',
  hints: [
    'AND3 gates are useful here',
    'Each output is an AND of three signals (each input or its inverse).',
    "O3 active only when A=0, B=1, C=1, so it's ((NOT A AND B) AND C).",
    'For D, AND every output with NOT D — one more gate per line.',
  ],
  inputs: [
    { name: 'A' },
    { name: 'B' },
    { name: 'C' },
    { name: 'D' },
  ],
  outputs: [
    { name: 'O0' },
    { name: 'O1' },
    { name: 'O2' },
    { name: 'O3' },
    { name: 'O4' },
    { name: 'O5' },
    { name: 'O6' },
    { name: 'O7' },
  ],
  predefinedGates: [
    { type: 'input', pos: { x: -14, y: -10 }, label: 'A', canRemove: false },
    { type: 'input', pos: { x: -14, y: -7 }, label: 'B', canRemove: false },
    { type: 'input', pos: { x: -14, y: -4 }, label: 'C', canRemove: false },
    { type: 'input', pos: { x: -14, y: -1 }, label: 'D', canRemove: false },
    { type: 'output', pos: { x: 11, y: -12 }, label: 'O0', canRemove: false },
    { type: 'output', pos: { x: 11, y: -9 }, label: 'O1', canRemove: false },
    { type: 'output', pos: { x: 11, y: -6 }, label: 'O2', canRemove: false },
    { type: 'output', pos: { x: 11, y: -3 }, label: 'O3', canRemove: false },
    { type: 'output', pos: { x: 11, y: 0 }, label: 'O4', canRemove: false },
    { type: 'output', pos: { x: 11, y: 3 }, label: 'O5', canRemove: false },
    { type: 'output', pos: { x: 11, y: 6 }, label: 'O6', canRemove: false },
    { type: 'output', pos: { x: 11, y: 9 }, label: 'O7', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', '3bit-and'] },
  test: {
    name: '3-bit Decoder',
    description: 'Decode 3 bits to 8 one-hot outputs',
    // Every address twice: decoding once with D=0, then all-low with D=1. Interleaved
    // rather than run in two blocks, so a circuit that latches instead of decoding cannot
    // pass by holding the last value.
    cases: (() => {
      const cases = [];
      for (let i = 0; i < 8; i++) {
        const address = { A: (i >> 2) & 1, B: (i >> 1) & 1, C: i & 1 };
        const decoded: Record<string, number> = {};
        const allLow: Record<string, number> = {};
        for (let j = 0; j < 8; j++) {
          decoded[`O${j}`] = j === i ? 1 : 0;
          allLow[`O${j}`] = 0;
        }
        cases.push({ inputs: { ...address, D: 0 }, expected: decoded });
        cases.push({ inputs: { ...address, D: 1 }, expected: allLow });
      }
      return cases;
    })(),
  },
  prerequisites: [lid('1bit-decoder')],
  mapPosition: { x: 52, y: 7 },
};
export default level;
