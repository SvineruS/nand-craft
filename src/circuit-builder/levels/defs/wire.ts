import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('wire'),
  name: 'Wire',
  description: 'Connect the input to the output with a wire.\n\nClick on the input pin, then click on the output pin to draw a wire.',
  inputs: [{ name: 'A' }],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'input', pos: { x: 2, y: 3 }, label: 'A', canRemove: false, canMove: false },
    { type: 'output', pos: { x: 12, y: 3 }, label: 'Out', canRemove: false, canMove: false },
  ],
  gateConstraints: { allow: [] },
  mode: 'combinational',
  test: {
    name: 'Wire',
    description: 'Output must equal input',
    mode: 'combinational',
    cases: [
      { inputs: { A: 0 }, expected: { Out: 0 } },
      { inputs: { A: 1 }, expected: { Out: 1 } },
    ],
  },
  prerequisites: [],
  mapPosition: { x: 0, y: 5 },
};
export default level;
