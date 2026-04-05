import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('8bit-subtractor'),
  name: '8-bit Subtractor',
  description: 'Build an 8-bit subtractor.\n\nCompute A - B (mod 256). Output the 8-bit result.',
  hints: ['A - B = A + (-B)', 'Negate B first, then add to A.'],
  inputs: [
    { name: 'A' },
    { name: 'B' },
  ],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'input-8bit', pos: { x: 2, y: 3 }, label: 'A', canRemove: false },
    { type: 'input-8bit', pos: { x: 2, y: 7 }, label: 'B', canRemove: false },
    { type: 'output-8bit', pos: { x: 29, y: 5 }, label: 'Out', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'xor', '8bit-not', '8bit-negative', '2bit-adder', '3bit-adder', 'constant', 'constant-8bit', 'splitter', 'joiner'] },
  test: {
    name: '8-bit Subtractor',
    description: 'Subtract two 8-bit numbers',
    cases: [
      { inputs: { A: 10, B: 3 }, expected: { Out: 7 } },
      { inputs: { A: 0, B: 0 }, expected: { Out: 0 } },
      { inputs: { A: 255, B: 255 }, expected: { Out: 0 } },
      { inputs: { A: 100, B: 50 }, expected: { Out: 50 } },
      { inputs: { A: 0, B: 1 }, expected: { Out: 255 } },
      { inputs: { A: 50, B: 100 }, expected: { Out: 206 } },
    ],
  },
  prerequisites: [lid('8bit-negative')],
  mapPosition: { x: 52, y: -1 },
};
export default level;
