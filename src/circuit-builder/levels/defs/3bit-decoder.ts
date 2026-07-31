import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('3bit-decoder'),
  name: '3-bit Decoder',
  description: 'Build a 3-to-8 decoder.\n\nGiven 3-bit input (A, B, C), set exactly one of 8 outputs (O0–O7) to 1.\n\nO0=1 when ABC=000, O1=1 when ABC=001, ..., O7=1 when ABC=111.',
  hints: ['AND3 gates are useful here', 'Each output is an AND of three signals (each input or its inverse).', "O3 active only when A=0, B=1, C=1, so it's ((NOT A AND B) AND C)."],
  inputs: [
    { name: 'A' },
    { name: 'B' },
    { name: 'C' },
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
  prerequisites: [lid('1bit-decoder')],
  mapPosition: { x: 52, y: 7 },
};
export default level;
