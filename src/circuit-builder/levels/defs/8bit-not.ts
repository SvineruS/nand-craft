import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('8bit-not'),
  name: '8-bit NOT',
  description: 'Build an 8-bit NOT gate.\n\nInvert all 8 bits of the input.\n\nHint: A single NOT gate works on any bit width.',
  inputs: [{ name: 'A', bitWidth: 8 }],
  outputs: [{ name: 'Out', bitWidth: 8 }],
  predefinedGates: [
    { type: 'input', pos: { x: 2, y: 3 }, label: 'A', canRemove: false, canMove: false, bitWidth: 8 },
    { type: 'output', pos: { x: 12, y: 3 }, label: 'Out', canRemove: false, canMove: false, bitWidth: 8 },
  ],
  gateConstraints: { allow: ['nand', 'not'] },
  mode: 'combinational',
  test: {
    name: '8-bit NOT',
    description: 'Invert all 8 bits',
    mode: 'combinational',
    cases: [
      { inputs: { A: 0b00000000 }, expected: { Out: 0b11111111 } },
      { inputs: { A: 0b11111111 }, expected: { Out: 0b00000000 } },
      { inputs: { A: 0b10101010 }, expected: { Out: 0b01010101 } },
      { inputs: { A: 0b00001111 }, expected: { Out: 0b11110000 } },
    ],
  },
  prerequisites: [lid('not')],
  mapPosition: { x: 36, y: 1 },
};
export default level;
