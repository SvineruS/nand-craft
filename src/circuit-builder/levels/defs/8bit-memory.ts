import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('8bit-memory'),
  name: '8-bit Memory',
  description: 'Build an 8-bit register (D flip-flop).\n\nWhen W (write enable) is 1, store the value of D. Output Q always shows the stored value.',
  hints: ['Use a switch/mux to select between the stored value and new input based on W, then feed through delays.'],
  inputs: [
    { name: 'D' },
    { name: 'W' },
  ],
  outputs: [{ name: 'Q' }],
  predefinedGates: [
    { type: 'input-8bit', pos: { x: 2, y: 3 }, label: 'D', canRemove: false },
    { type: 'input', pos: { x: 2, y: 7 }, label: 'W', canRemove: false },
    { type: 'output-8bit', pos: { x: 29, y: 5 }, label: 'Q', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'nor', 'mux', 'delay', 'rs-latch', 'splitter', 'joiner'] },
  test: {
    name: '8-bit Memory',
    description: 'Store and recall 8-bit values',
    cases: [
      { inputs: { D: 42, W: 1 }, expected: { Q: 42 } },
      { inputs: { D: 0, W: 0 }, expected: { Q: 42 } },
      { inputs: { D: 255, W: 1 }, expected: { Q: 255 } },
      { inputs: { D: 255, W: 0 }, expected: { Q: 255 } },
      { inputs: { D: 0, W: 1 }, expected: { Q: 0 } },
    ],
  },
  prerequisites: [lid('rs-latch'), lid('8bit-constant')],
  mapPosition: { x: 60, y: 11 },
};
export default level;
