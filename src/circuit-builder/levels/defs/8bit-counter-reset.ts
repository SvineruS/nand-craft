import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('8bit-counter-reset'),
  name: '8-bit Counter + Set',
  description: 'Build a programmable 8-bit counter.\n\nWhen Inc=1, add the value of D to the counter. When Inc=0, set the counter to D.\n\nOutput Q always shows the current counter value.',
  hints: ['Use a switch/mux to choose between (Q + D) and D based on Inc.', 'Feed the result through memory to store it.'],
  inputs: [{ name: 'D' }, { name: 'Inc' }],
  outputs: [{ name: 'Q' }],
  predefinedGates: [
    { type: 'input-8bit', pos: { x: 2, y: 3 }, label: 'D', canRemove: false },
    { type: 'input', pos: { x: 2, y: 7 }, label: 'Inc', canRemove: false },
    { type: 'output-8bit', pos: { x: 29, y: 5 }, label: 'Q', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'xor', 'nor', '8bit-or', '8bit-nor', '8bit-not', '2bit-adder', '3bit-adder', 'switch', 'delay', 'rs-latch', '8bit-memory', '8bit-counter', 'constant', 'constant-8bit', 'splitter', 'joiner', '8bit-negative'] },
  test: {
    name: '8-bit Counter + Set',
    description: 'Increment by D or set to D',
    cases: [
      // Set to 10
      { inputs: { D: 10, Inc: 0 }, expected: { Q: 10 } },
      // Increment by 5
      { inputs: { D: 5, Inc: 1 }, expected: { Q: 15 } },
      // Increment by 3
      { inputs: { D: 3, Inc: 1 }, expected: { Q: 18 } },
      // Set to 0
      { inputs: { D: 0, Inc: 0 }, expected: { Q: 0 } },
      // Increment by 1
      { inputs: { D: 1, Inc: 1 }, expected: { Q: 1 } },
      // Increment by 1 again
      { inputs: { D: 1, Inc: 1 }, expected: { Q: 2 } },
      // Set to 200
      { inputs: { D: 200, Inc: 0 }, expected: { Q: 200 } },
      // Increment by 100 (wraps at 256)
      { inputs: { D: 100, Inc: 1 }, expected: { Q: 44 } },
    ],
  },
  prerequisites: [lid('8bit-counter')],
  mapPosition: { x: 76, y: 11 },
};
export default level;
