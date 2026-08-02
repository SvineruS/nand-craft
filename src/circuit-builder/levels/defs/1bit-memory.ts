import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('1bit-memory'),
  name: '1-bit Memory',
  description: 'Build a 1-bit register.\n\nWhen S (set) is 1, store the value of V. Output Q always shows the stored value.',
  hints: [
    'Use a MUX to select between the new value V and the stored value.',
    'S controls the MUX: S=1 → select V, S=0 → keep stored value from delay.',
    'MUX(select=S, A=delayed_Q, B=V) → delay → Q',
  ],
  inputs: [
    { name: 'V' },
    { name: 'S' },
  ],
  outputs: [{ name: 'Q' }],
  predefinedGates: [
    // Flag above value, the same way round as the MEM gate's own pins.
    { type: 'input', pos: { x: -10, y: -3 }, label: 'S', canRemove: false },
    { type: 'input', pos: { x: -10, y: 1 }, label: 'V', canRemove: false },
    { type: 'output', pos: { x: 8, y: -1 }, label: 'Q', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'mux', 'delay', 'rs-latch', 'tristate'] },
  test: {
    name: '1-bit Memory',
    description: 'Store and recall 1-bit values',
    cases: [
      { inputs: { V: 1, S: 1 }, expected: { Q: 0 } },
      { inputs: { V: 0, S: 0 }, expected: { Q: 1 } },
      { inputs: { V: 0, S: 1 }, expected: { Q: 1 } },
      { inputs: { V: 1, S: 0 }, expected: { Q: 0 } },
      { inputs: { V: 1, S: 1 }, expected: { Q: 0 } },
      { inputs: { V: 1, S: 0 }, expected: { Q: 1 } },
      { inputs: { V: 1, S: 0 }, expected: { Q: 1 } },
    ],
  },
  prerequisites: [lid('rs-latch')],
  mapPosition: { x: 60, y: 11 },
};
export default level;
