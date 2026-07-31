import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';

const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('8bit-counter'),
  name: '8-bit Counter',
  description: 'Build an 8-bit increment counter.\n\nThe output increments by 1 each tick. Starts at 0, wraps around at 255.',
  hints: ['Feed the output back through an adder (+1) and delays to create a counter loop.'],
  inputs: [],
  outputs: [{ name: 'Q' }],
  predefinedGates: [
    { type: 'output-8bit', pos: { x: -1, y: -1 }, label: 'Q', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'xor', 'nor', '8bit-or', '8bit-nor', '8bit-not', '2bit-adder', '3bit-adder', '8bit-adder', 'mux', 'delay', 'rs-latch', '8bit-memory', 'constant', 'splitter', 'joiner'] },
  test: {
    name: '8-bit Counter',
    description: 'Counts up from 0 each tick',
    cases: [
      { inputs: {}, expected: { Q: 0 } },
      { inputs: {}, expected: { Q: 1 } },
      { inputs: {}, expected: { Q: 2 } },
      { inputs: {}, expected: { Q: 3 } },
      { inputs: {}, expected: { Q: 4 } },
      { inputs: {}, expected: { Q: 5 } },
    ],
  },
  prerequisites: [lid('8bit-memory'), lid('8bit-adder')],
  mapPosition: { x: 68, y: 11 },
};
export default level;
