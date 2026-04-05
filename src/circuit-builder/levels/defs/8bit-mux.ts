import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('8bit-mux'),
  name: '8-bit MUX',
  description: 'Build an 8-bit 2-to-1 multiplexer.\n\nWhen S=0, output A. When S=1, output B. All data is 8-bit.',
  hints: ['Split A and B into individual bits, mux each pair, then join the results.', 'Or use tri-state buffers with enable and NOT enable.'],
  inputs: [
    { name: 'S' },
    { name: 'A' },
    { name: 'B' },
  ],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'input', pos: { x: 2, y: 2 }, label: 'S', canRemove: false },
    { type: 'input-8bit', pos: { x: 2, y: 5 }, label: 'A', canRemove: false },
    { type: 'input-8bit', pos: { x: 2, y: 9 }, label: 'B', canRemove: false },
    { type: 'output-8bit', pos: { x: 29, y: 5 }, label: 'Out', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'mux', 'tristate', 'splitter', 'joiner'] },
  test: {
    name: '8-bit MUX',
    description: 'Select between two 8-bit values',
    cases: [
      { inputs: { S: 0, A: 42, B: 99 }, expected: { Out: 42 } },
      { inputs: { S: 1, A: 42, B: 99 }, expected: { Out: 99 } },
      { inputs: { S: 0, A: 0, B: 255 }, expected: { Out: 0 } },
      { inputs: { S: 1, A: 0, B: 255 }, expected: { Out: 255 } },
      { inputs: { S: 0, A: 200, B: 100 }, expected: { Out: 200 } },
      { inputs: { S: 1, A: 200, B: 100 }, expected: { Out: 100 } },
    ],
  },
  prerequisites: [lid('switch'), lid('8bit-constant')],
  mapPosition: { x: 36, y: -3 },
};
export default level;
