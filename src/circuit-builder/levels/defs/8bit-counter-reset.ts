import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('8bit-counter-reset'),
  name: '8-bit Counter + Reset',
  description: 'Build an 8-bit increment counter with a reset input.\n\nSame as the counter, but when R=1 the counter resets to 0 on the next tick.\n\nHint: Use a switch/mux to choose between the incremented value and 0 based on R.',
  inputs: [{ name: 'R' }],
  outputs: [{ name: 'Q' }],
  predefinedGates: [
    { type: 'input', pos: { x: 2, y: 3 }, label: 'R', canRemove: false },
    { type: 'output-8bit', pos: { x: 29, y: 5 }, label: 'Q', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'xor', 'nor', '8bit-or', '8bit-nor', '8bit-not', '2bit-adder', 'switch', 'delay', 'rs-latch', '8bit-memory', '8bit-counter', 'constant', 'splitter', 'joiner'] },
  mode: 'sequential',
  test: {
    name: '8-bit Counter + Reset',
    description: 'Counts up, resets to 0 when R=1',
    mode: 'sequential',
    steps: [
      { type: 'write', pin: 'R', value: 0 },
      { type: 'read', pin: 'Q', expected: 1 },
      { type: 'read', pin: 'Q', expected: 2 },
      { type: 'read', pin: 'Q', expected: 3 },
      { type: 'write', pin: 'R', value: 1 },
      { type: 'read', pin: 'Q', expected: 0 },
      { type: 'write', pin: 'R', value: 0 },
      { type: 'read', pin: 'Q', expected: 1 },
      { type: 'read', pin: 'Q', expected: 2 },
    ],
  },
  prerequisites: [lid('8bit-counter')],
  mapPosition: { x: 76, y: 11 },
};
export default level;
