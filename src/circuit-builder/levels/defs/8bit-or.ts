import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('8bit-or'),
  name: '8-bit OR',
  description: 'Build an 8-bit OR gate.\n\nPerform bitwise OR on two 8-bit inputs.\n\nHint: OR gates work on any bit width.',
  inputs: [
    { name: 'A' },
    { name: 'B' },
  ],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'input-8bit', pos: { x: 2, y: 2 }, label: 'A', canRemove: false },
    { type: 'input-8bit', pos: { x: 2, y: 5 }, label: 'B', canRemove: false },
    { type: 'output-8bit', pos: { x: 17, y: 3 }, label: 'Out', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'or', 'splitter', 'joiner'] },
  mode: 'combinational',
  test: {
    name: '8-bit OR',
    description: 'Bitwise OR on two 8-bit values',
    mode: 'combinational',
    cases: [
      { inputs: { A: 0b00000000, B: 0b00000000 }, expected: { Out: 0b00000000 } },
      { inputs: { A: 0b11111111, B: 0b00000000 }, expected: { Out: 0b11111111 } },
      { inputs: { A: 0b10101010, B: 0b01010101 }, expected: { Out: 0b11111111 } },
      { inputs: { A: 0b11001100, B: 0b00110011 }, expected: { Out: 0b11111111 } },
      { inputs: { A: 0b11000000, B: 0b00001111 }, expected: { Out: 0b11001111 } },
    ],
  },
  prerequisites: [lid('or')],
  mapPosition: { x: 36, y: 3 },
};
export default level;
