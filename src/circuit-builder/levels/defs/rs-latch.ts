import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('rs-latch'),
  name: 'RS Latch',
  description: 'Build a 1-bit RS latch using delay gates.\n\nS (set) = 1 sets Q to 1. R (reset) = 1 sets Q to 0. When both are 0, Q holds its value. \n\n' +
    'Default NAND and NOR latches will not work here because they require direct feedback loops, which are not allowed :(. You need to use delay gate to create a feedback loop with a one-tick delay.',
  hints: [
    'You need a feedback loop — connect the output back to the input through a delay gate.',
    'If R=1, delay gate input should be 0.',
    'IF R=0, delay gate input should be S OR the delay gate output.',
  ],
  inputs: [
    { name: 'S' },
    { name: 'R' },
  ],
  outputs: [{ name: 'Q' }],
  predefinedGates: [
    { type: 'input', pos: { x: -12, y: -4 }, label: 'S', canRemove: false },
    { type: 'input', pos: { x: -12, y: 1 }, label: 'R', canRemove: false },
    { type: 'output', pos: { x: 9, y: -3 }, label: 'Q', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'nor', 'delay', 'tristate', 'mux'] },
  test: {
    name: 'RS Latch',
    description: 'Set, hold, reset, hold',
    cases: [
      { inputs: { S: 1, R: 0 }, expected: { Q: 0 } },
      { inputs: { S: 0, R: 0 }, expected: { Q: 1 } },
      { inputs: { S: 0, R: 1 }, expected: { Q: 1 } },
      { inputs: { S: 0, R: 0 }, expected: { Q: 0 } },
      { inputs: { S: 1, R: 0 }, expected: { Q: 0 } },
      { inputs: { S: 0, R: 0 }, expected: { Q: 1 } },
    ],
  },
  prerequisites: [lid('delay')],
  mapPosition: { x: 52, y: 11 },
};
export default level;
