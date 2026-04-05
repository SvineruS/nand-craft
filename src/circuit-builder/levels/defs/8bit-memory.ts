import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('8bit-memory'),
  name: '8-bit Memory',
  description: 'Build an 8-bit register.\n\nWhen S (set) is 1, store the value of V. Output Q always shows the stored value.',
  hints: ['Same as 1-bit memory but for 8 bits. Use splitters, joiners, and 1-bit memory gates or MUXes with delays.'],
  inputs: [
    { name: 'V' },
    { name: 'S' },
  ],
  outputs: [{ name: 'Q' }],
  predefinedGates: [
    { type: 'input-8bit', pos: { x: 2, y: 3 }, label: 'V', canRemove: false },
    { type: 'input', pos: { x: 2, y: 7 }, label: 'S', canRemove: false },
    { type: 'output-8bit', pos: { x: 29, y: 5 }, label: 'Q', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'nor', 'mux', 'delay', 'rs-latch', '1bit-memory', 'splitter', 'joiner'] },
  test: {
    name: '8-bit Memory',
    description: 'Store and recall 8-bit values',
    cases: [
      // Store 42 — output is still 0 (1-tick delay)
      { inputs: { V: 42, S: 1 }, expected: { Q: 0 } },
      // Now Q shows 42
      { inputs: { V: 0, S: 0 }, expected: { Q: 42 } },
      // Hold — Q stays 42
      { inputs: { V: 100, S: 0 }, expected: { Q: 42 } },
      // Store 255
      { inputs: { V: 255, S: 1 }, expected: { Q: 42 } },
      // Now Q shows 255
      { inputs: { V: 0, S: 0 }, expected: { Q: 255 } },
      // Store 0
      { inputs: { V: 0, S: 1 }, expected: { Q: 255 } },
      // Now Q shows 0
      { inputs: { V: 0, S: 0 }, expected: { Q: 0 } },
    ],
  },
  prerequisites: [lid('1bit-memory'), lid('8bit-constant')],
  mapPosition: { x: 60, y: 11 },
};
export default level;
