import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('8bit-adder'),
  name: '8-bit Adder',
  description: 'Build an 8-bit adder.\n\nAdd two 8-bit numbers A and B. Output the 8-bit sum S and 1-bit carry C.',
  hints: ['Chain 8 full adders, connecting each carry out to the next carry in.', 'Use splitters to break 8-bit inputs into individual bits, then a joiner to combine the sum bits.'],
  inputs: [
    { name: 'A' },
    { name: 'B' },
  ],
  outputs: [
    { name: 'S' },
    { name: 'C' },
  ],
  predefinedGates: [
    { type: 'input-8bit', pos: { x: 2, y: 3 }, label: 'A', canRemove: false },
    { type: 'input-8bit', pos: { x: 2, y: 7 }, label: 'B', canRemove: false },
    { type: 'output-8bit', pos: { x: 40, y: 3 }, label: 'S', canRemove: false },
    { type: 'output', pos: { x: 40, y: 7 }, label: 'C', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'xor', '2bit-adder', '3bit-adder', 'splitter', 'joiner', 'constant'] },
  test: {
    name: '8-bit Adder',
    description: 'Add two 8-bit numbers',
    cases: [
      { inputs: { A: 0, B: 0 }, expected: { S: 0, C: 0 } },
      { inputs: { A: 1, B: 1 }, expected: { S: 2, C: 0 } },
      { inputs: { A: 100, B: 55 }, expected: { S: 155, C: 0 } },
      { inputs: { A: 200, B: 100 }, expected: { S: 44, C: 1 } },
      { inputs: { A: 255, B: 1 }, expected: { S: 0, C: 1 } },
      { inputs: { A: 255, B: 255 }, expected: { S: 254, C: 1 } },
      { inputs: { A: 127, B: 128 }, expected: { S: 255, C: 0 } },
    ],
  },
  prerequisites: [lid('3bit-adder'), lid('8bit-constant')],
  mapPosition: { x: 52, y: 3 },
};
export default level;
