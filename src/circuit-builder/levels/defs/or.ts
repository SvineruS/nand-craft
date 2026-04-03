import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('or'),
  name: 'OR',
  description: "Build an OR gate using NAND and NOT gates.\n\nOR outputs 1 when at least one input is 1.\n\nHint: De Morgan's law — you'll need three NAND gates.",
  inputs: [
    { name: 'A' },
    { name: 'B' },
  ],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'input', pos: { x: 2, y: 2 }, label: 'A', canRemove: false, canMove: false },
    { type: 'input', pos: { x: 2, y: 5 }, label: 'B', canRemove: false, canMove: false },
    { type: 'output', pos: { x: 12, y: 3 }, label: 'Out', canRemove: false, canMove: false },
  ],
  gateConstraints: { allow: ['nand', 'not'] },
  mode: 'combinational',
  test: {
    name: 'OR gate',
    description: 'Output 1 when at least one input is 1',
    mode: 'combinational',
    cases: [
      { inputs: { A: 0, B: 0 }, expected: { Out: 0 } },
      { inputs: { A: 0, B: 1 }, expected: { Out: 1 } },
      { inputs: { A: 1, B: 0 }, expected: { Out: 1 } },
      { inputs: { A: 1, B: 1 }, expected: { Out: 1 } },
    ],
  },
  prerequisites: [lid('not')],
  mapPosition: { x: 12, y: 7 },
};
export default level;
