import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('3bit-decoder'),
  name: '3-bit Decoder',
  description: 'Build a 3-to-8 decoder.\n\nGiven 3-bit input (A, B, C), set exactly one of 8 outputs (O0–O7) to 1.\n\nO0=1 when ABC=000, O1=1 when ABC=001, ..., O7=1 when ABC=111.\n\nHint: Each output is an AND of three signals (each input or its inverse).',
  inputs: [
    { name: 'A', bitWidth: 1 },
    { name: 'B', bitWidth: 1 },
    { name: 'C', bitWidth: 1 },
  ],
  outputs: [
    { name: 'O0', bitWidth: 1 },
    { name: 'O1', bitWidth: 1 },
    { name: 'O2', bitWidth: 1 },
    { name: 'O3', bitWidth: 1 },
    { name: 'O4', bitWidth: 1 },
    { name: 'O5', bitWidth: 1 },
    { name: 'O6', bitWidth: 1 },
    { name: 'O7', bitWidth: 1 },
  ],
  predefinedGates: [
    { type: 'input', pos: { x: 2, y: 3 }, label: 'A', canRemove: false, canMove: false },
    { type: 'input', pos: { x: 2, y: 6 }, label: 'B', canRemove: false, canMove: false },
    { type: 'input', pos: { x: 2, y: 9 }, label: 'C', canRemove: false, canMove: false },
    { type: 'output', pos: { x: 22, y: 1 }, label: 'O0', canRemove: false, canMove: false },
    { type: 'output', pos: { x: 22, y: 4 }, label: 'O1', canRemove: false, canMove: false },
    { type: 'output', pos: { x: 22, y: 7 }, label: 'O2', canRemove: false, canMove: false },
    { type: 'output', pos: { x: 22, y: 10 }, label: 'O3', canRemove: false, canMove: false },
    { type: 'output', pos: { x: 22, y: 13 }, label: 'O4', canRemove: false, canMove: false },
    { type: 'output', pos: { x: 22, y: 16 }, label: 'O5', canRemove: false, canMove: false },
    { type: 'output', pos: { x: 22, y: 19 }, label: 'O6', canRemove: false, canMove: false },
    { type: 'output', pos: { x: 22, y: 22 }, label: 'O7', canRemove: false, canMove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', '3bit-and'] },
  mode: 'combinational',
  test: {
    name: '3-bit Decoder',
    description: 'Decode 3 bits to 8 one-hot outputs',
    mode: 'combinational',
    cases: (() => {
      const cases = [];
      for (let i = 0; i < 8; i++) {
        const expected: Record<string, number> = {};
        for (let j = 0; j < 8; j++) expected[`O${j}`] = j === i ? 1 : 0;
        cases.push({
          inputs: { A: (i >> 2) & 1, B: (i >> 1) & 1, C: i & 1 },
          expected,
        });
      }
      return cases;
    })(),
  },
  prerequisites: [lid('1bit-decoder'), lid('and')],
  mapPosition: { x: 52, y: 7 },
};
export default level;
