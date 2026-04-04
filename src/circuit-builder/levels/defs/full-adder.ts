import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('3bit-adder'),
  name: 'Full Adder',
  description: 'Build a full adder.\n\nAdd three 1-bit numbers A, B, and Cin (carry in). Output the sum S and carry Cout.\n\nHint: Use two half adders and an OR gate for the carry.',
  inputs: [
    { name: 'A' },
    { name: 'B' },
    { name: 'Cin' },
  ],
  outputs: [
    { name: 'S' },
    { name: 'Cout' },
  ],
  predefinedGates: [
    { type: 'input', pos: { x: 2, y: 2 }, label: 'A', canRemove: false },
    { type: 'input', pos: { x: 2, y: 5 }, label: 'B', canRemove: false },
    { type: 'input', pos: { x: 2, y: 8 }, label: 'Cin', canRemove: false },
    { type: 'output', pos: { x: 23, y: 3 }, label: 'S', canRemove: false },
    { type: 'output', pos: { x: 23, y: 6 }, label: 'Cout', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'xor', '2bit-adder'] },
  mode: 'combinational',
  test: {
    name: 'Full Adder',
    description: 'Add three 1-bit numbers',
    mode: 'combinational',
    cases: [
      { inputs: { A: 0, B: 0, Cin: 0 }, expected: { S: 0, Cout: 0 } },
      { inputs: { A: 0, B: 0, Cin: 1 }, expected: { S: 1, Cout: 0 } },
      { inputs: { A: 0, B: 1, Cin: 0 }, expected: { S: 1, Cout: 0 } },
      { inputs: { A: 0, B: 1, Cin: 1 }, expected: { S: 0, Cout: 1 } },
      { inputs: { A: 1, B: 0, Cin: 0 }, expected: { S: 1, Cout: 0 } },
      { inputs: { A: 1, B: 0, Cin: 1 }, expected: { S: 0, Cout: 1 } },
      { inputs: { A: 1, B: 1, Cin: 0 }, expected: { S: 0, Cout: 1 } },
      { inputs: { A: 1, B: 1, Cin: 1 }, expected: { S: 1, Cout: 1 } },
    ],
  },
  prerequisites: [lid('2bit-adder')],
  mapPosition: { x: 52, y: 3 },
};
export default level;
