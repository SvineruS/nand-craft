import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('8bit-constant'),
  name: '8-bit Constant',
  description: 'Output the constant 8-bit value 67 (0b01000011).\n\nNo inputs — the output must always be 67.',
  hints: ['67 in binary is 01000011.', 'Use a constant gate and a joiner, or wire individual bits.'],
  inputs: [],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'output-8bit', pos: { x: -1, y: -1 }, label: 'Out', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'constant', 'splitter', 'joiner'] },
  test: {
    name: '8-bit Constant',
    description: 'Output must always be 67',
    cases: [
      { inputs: {}, expected: { Out: 67 } },
    ],
  },
  prerequisites: [lid('always-on')],
  mapPosition: { x: 32, y: 15 },
};
export default level;
