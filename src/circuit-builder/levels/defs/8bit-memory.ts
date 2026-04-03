import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('8bit-memory'),
  name: '8-bit Memory',
  description: 'Build an 8-bit register (D flip-flop).\n\nWhen W (write enable) is 1, store the value of D. Output Q always shows the stored value.\n\nHint: Use a switch/mux to select between the stored value and new input based on W, then feed through delays.',
  inputs: [
    { name: 'D' },
    { name: 'W' },
  ],
  outputs: [{ name: 'Q' }],
  predefinedGates: [
    { type: 'input-8bit', pos: { x: 2, y: 3 }, label: 'D', canRemove: false, canMove: false },
    { type: 'input', pos: { x: 2, y: 7 }, label: 'W', canRemove: false, canMove: false },
    { type: 'output-8bit', pos: { x: 24, y: 5 }, label: 'Q', canRemove: false, canMove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'nor', 'switch', 'delay', 'rs-latch', 'splitter', 'joiner'] },
  mode: 'sequential',
  test: {
    name: '8-bit Memory',
    description: 'Store and recall 8-bit values',
    mode: 'sequential',
    steps: [
      [{ type: 'write', pin: 'D', value: 42 }, { type: 'write', pin: 'W', value: 1 }],
      { type: 'read', pin: 'Q', expected: 42 },
      [{ type: 'write', pin: 'W', value: 0 }, { type: 'write', pin: 'D', value: 0 }],
      { type: 'read', pin: 'Q', expected: 42 },
      [{ type: 'write', pin: 'D', value: 255 }, { type: 'write', pin: 'W', value: 1 }],
      { type: 'read', pin: 'Q', expected: 255 },
      { type: 'write', pin: 'W', value: 0 },
      { type: 'read', pin: 'Q', expected: 255 },
      [{ type: 'write', pin: 'D', value: 0 }, { type: 'write', pin: 'W', value: 1 }],
      { type: 'read', pin: 'Q', expected: 0 },
    ],
  },
  prerequisites: [lid('rs-latch'), lid('switch')],
  mapPosition: { x: 60, y: 11 },
};
export default level;
