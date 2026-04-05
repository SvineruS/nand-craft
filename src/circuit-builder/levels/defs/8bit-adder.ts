import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('8bit-adder'),
  name: '8-bit Adder',
  description: 'Build an 8-bit adder with carry input.\n\nAdd two 8-bit numbers A and B plus a 1-bit carry input Cin. Output the 8-bit sum S and 1-bit carry output Cout.',
  hints: ['Chain 8 full adders, connecting each carry out to the next carry in.', 'Use splitters to break 8-bit inputs into individual bits, then a joiner to combine the sum bits.', 'Feed Cin into the first full adder as the initial carry.'],
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
    { type: 'input', pos: { x: 2, y: 0 }, label: 'Cin', canRemove: false },
    { type: 'input-8bit', pos: { x: 2, y: 4 }, label: 'A', canRemove: false },
    { type: 'input-8bit', pos: { x: 2, y: 8 }, label: 'B', canRemove: false },
    { type: 'output-8bit', pos: { x: 40, y: 3 }, label: 'S', canRemove: false },
    { type: 'output', pos: { x: 40, y: 7 }, label: 'Cout', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'xor', '2bit-adder', '3bit-adder', 'splitter', 'joiner', 'constant'] },
  test: {
    name: '8-bit Adder',
    description: 'Add two 8-bit numbers with carry',
    cases: [
      { inputs: { A: 0, B: 0, Cin: 0 }, expected: { S: 0, Cout: 0 } },
      { inputs: { A: 0, B: 0, Cin: 1 }, expected: { S: 1, Cout: 0 } },
      { inputs: { A: 1, B: 1, Cin: 0 }, expected: { S: 2, Cout: 0 } },
      { inputs: { A: 1, B: 1, Cin: 1 }, expected: { S: 3, Cout: 0 } },
      { inputs: { A: 100, B: 55, Cin: 0 }, expected: { S: 155, Cout: 0 } },
      { inputs: { A: 200, B: 100, Cin: 0 }, expected: { S: 44, Cout: 1 } },
      { inputs: { A: 255, B: 0, Cin: 1 }, expected: { S: 0, Cout: 1 } },
      { inputs: { A: 255, B: 255, Cin: 0 }, expected: { S: 254, Cout: 1 } },
      { inputs: { A: 255, B: 255, Cin: 1 }, expected: { S: 255, Cout: 1 } },
      { inputs: { A: 127, B: 128, Cin: 0 }, expected: { S: 255, Cout: 0 } },
    ],
  },
  prerequisites: [lid('3bit-adder'), lid('8bit-constant')],
  mapPosition: { x: 52, y: 3 },
};
export default level;
