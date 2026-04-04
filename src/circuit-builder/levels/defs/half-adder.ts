import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('2bit-adder'),
  name: 'Half Adder',
  description: 'Build a half adder.\n\nAdd two 1-bit numbers A and B. Output the sum S and carry C.\n\nHint: S = A XOR B, C = A AND B.',
  inputs: [
    { name: 'A' },
    { name: 'B' },
  ],
  outputs: [
    { name: 'S' },
    { name: 'C' },
  ],
  predefinedGates: [
    { type: 'input', pos: { x: 2, y: 2 }, label: 'A', canRemove: false },
    { type: 'input', pos: { x: 2, y: 5 }, label: 'B', canRemove: false },
    { type: 'output', pos: { x: 19, y: 2 }, label: 'S', canRemove: false },
    { type: 'output', pos: { x: 19, y: 5 }, label: 'C', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'xor'] },
  test: {
    name: 'Half Adder',
    description: 'Add two 1-bit numbers',
    cases: [
      { inputs: { A: 0, B: 0 }, expected: { S: 0, C: 0 } },
      { inputs: { A: 0, B: 1 }, expected: { S: 1, C: 0 } },
      { inputs: { A: 1, B: 0 }, expected: { S: 1, C: 0 } },
      { inputs: { A: 1, B: 1 }, expected: { S: 0, C: 1 } },
    ],
  },
  prerequisites: [lid('xor'), lid('and'), lid('or')],
  mapPosition: { x: 44, y: 3 },
};
export default level;
