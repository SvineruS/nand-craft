import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('always-on'),
  name: 'Always On',
  description: 'Build a circuit that always outputs 1, with no inputs.\n\nHint: What does a NAND gate output when both inputs have no signal?',
  inputs: [],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'output', pos: { x: 13, y: 3 }, label: 'Out', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not'] },
  test: {
    name: 'Always On',
    description: 'Output must always be 1',
    cases: [
      { inputs: {}, expected: { Out: 1 } },
    ],
  },
  prerequisites: [lid('not')],
  mapPosition: { x: 20, y: 11 },
};
export default level;
