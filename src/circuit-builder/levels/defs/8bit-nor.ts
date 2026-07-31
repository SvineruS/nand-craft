import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('8bit-nor'),
  name: '8-bit NOR',
  description: 'Build an 8-bit NOR gate.\n\nPerform bitwise NOR on two 8-bit inputs.',
  hints: ['Just like before'],
  inputs: [
    { name: 'A' },
    { name: 'B' },
  ],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'input-8bit', pos: { x: -9, y: -3 }, label: 'A', canRemove: false },
    { type: 'input-8bit', pos: { x: -9, y: 0 }, label: 'B', canRemove: false },
    { type: 'output-8bit', pos: { x: 6, y: -2 }, label: 'Out', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'or', 'nor', 'splitter', 'joiner'] },
  test: {
    name: '8-bit NOR',
    description: 'Bitwise NOR on two 8-bit values',
    cases: [
      { inputs: { A: 0b00000000, B: 0b00000000 }, expected: { Out: 0b11111111 } },
      { inputs: { A: 0b11111111, B: 0b00000000 }, expected: { Out: 0b00000000 } },
      { inputs: { A: 0b10101010, B: 0b01010101 }, expected: { Out: 0b00000000 } },
      { inputs: { A: 0b11000000, B: 0b00001111 }, expected: { Out: 0b00110000 } },
    ],
  },
  prerequisites: [lid('nor')],
  mapPosition: { x: 36, y: 5 },
};
export default level;
