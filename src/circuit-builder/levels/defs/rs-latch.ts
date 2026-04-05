import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('rs-latch'),
  name: 'RS Latch',
  description: 'Build a 1-bit RS latch using delay gates.\n\nS (set) = 1 sets Q to 1. R (reset) = 1 sets Q to 0. When both are 0, Q holds its value.',
  hints: ['Use NOR gates with delay feedback to break the combinational loop.'],
  inputs: [
    { name: 'S' },
    { name: 'R' },
  ],
  outputs: [{ name: 'Q' }],
  predefinedGates: [
    { type: 'input', pos: { x: 2, y: 2 }, label: 'S', canRemove: false },
    { type: 'input', pos: { x: 2, y: 7 }, label: 'R', canRemove: false },
    { type: 'output', pos: { x: 23, y: 3 }, label: 'Q', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'nor', 'delay'] },
  test: {
    name: 'RS Latch',
    description: 'Set, hold, reset, hold',
    cases: [
      { inputs: { S: 1, R: 0 }, expected: { Q: 1 } },
      { inputs: { S: 0, R: 0 }, expected: { Q: 1 } },
      { inputs: { S: 0, R: 1 }, expected: { Q: 0 } },
      { inputs: { S: 0, R: 0 }, expected: { Q: 0 } },
      { inputs: { S: 1, R: 0 }, expected: { Q: 1 } },
    ],
  },
  prerequisites: [lid('delay'), lid('nor')],
  mapPosition: { x: 52, y: 11 },
};
export default level;
