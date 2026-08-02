import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('8bit-counter'),
  name: '8-bit Counter + Set',
  description: 'Build a programmable 8-bit counter.\n\nNormally increments by 1 each tick, wrapping around at 255. When O (override) is 1, set the counter to V instead.\n\nOutput Q always shows the current counter value.',
  hints: [
    'Feed the output back through an adder (+1) and memory to create a counter loop.',
    'Use a MUX to select between (Q + 1) and V based on O.',
  ],
  inputs: [{ name: 'V' }, { name: 'O' }],
  outputs: [{ name: 'Q' }],
  predefinedGates: [
    // Flag above value, the same way round as the CTR gate's own pins.
    { type: 'input', pos: { x: -15, y: -3 }, label: 'O', canRemove: false },
    { type: 'input-8bit', pos: { x: -15, y: 1 }, label: 'V', canRemove: false },
    { type: 'output-8bit', pos: { x: 12, y: -1 }, label: 'Q', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'xor', 'nor', '8bit-or', '8bit-nor', '8bit-not', '2bit-adder', '3bit-adder', '8bit-adder', 'mux', '8bit-mux', 'delay', 'rs-latch', '1bit-memory', '8bit-memory', 'constant', 'constant-8bit', 'splitter', 'joiner', '8bit-negative'] },
  test: {
    name: '8-bit Counter + Set',
    description: 'Increment or override',
    cases: [
      // Starts at 0, increments
      { inputs: { V: 0, O: 0 }, expected: { Q: 0 } },
      { inputs: { V: 0, O: 0 }, expected: { Q: 1 } },
      { inputs: { V: 0, O: 0 }, expected: { Q: 2 } },
      // Override to 100
      { inputs: { V: 100, O: 1 }, expected: { Q: 3 } },
      // Now Q is 100, continue incrementing
      { inputs: { V: 0, O: 0 }, expected: { Q: 100 } },
      { inputs: { V: 0, O: 0 }, expected: { Q: 101 } },
      // Override to 254
      { inputs: { V: 254, O: 1 }, expected: { Q: 102 } },
      // Increment wraps at 255
      { inputs: { V: 0, O: 0 }, expected: { Q: 254 } },
      { inputs: { V: 0, O: 0 }, expected: { Q: 255 } },
      { inputs: { V: 0, O: 0 }, expected: { Q: 0 } },
    ],
  },
  prerequisites: [lid('8bit-memory'), lid('8bit-adder'), lid('8bit-mux')],
  mapPosition: { x: 68, y: 11 },
};
export default level;
