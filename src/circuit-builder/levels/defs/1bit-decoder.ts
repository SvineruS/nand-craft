import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('1bit-decoder'),
  name: '1-bit Decoder',
  description: 'Build a 1-to-2 decoder.\n\nWhen A=0, O0=1 and O1=0. When A=1, O0=0 and O1=1.\n\nHint: O0 is NOT A, O1 is A.',
  inputs: [{ name: 'A' }],
  outputs: [
    { name: 'O0' },
    { name: 'O1' },
  ],
  predefinedGates: [
    { type: 'input', pos: { x: 2, y: 3 }, label: 'A', canRemove: false, canMove: false },
    { type: 'output', pos: { x: 12, y: 2 }, label: 'O0', canRemove: false, canMove: false },
    { type: 'output', pos: { x: 12, y: 5 }, label: 'O1', canRemove: false, canMove: false },
  ],
  gateConstraints: { allow: ['nand', 'not'] },
  mode: 'combinational',
  test: {
    name: '1-bit Decoder',
    description: 'Decode 1 bit to 2 one-hot outputs',
    mode: 'combinational',
    cases: [
      { inputs: { A: 0 }, expected: { O0: 1, O1: 0 } },
      { inputs: { A: 1 }, expected: { O0: 0, O1: 1 } },
    ],
  },
  prerequisites: [lid('not')],
  mapPosition: { x: 44, y: 7 },
};
export default level;
