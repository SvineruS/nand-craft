import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('delay'),
  name: 'Delay',
  description: 'Pass the input to the output with a 1-tick delay.\n\nThe output should reflect the input value from the previous tick.',
  hints: ['Use a delay gate.'],
  inputs: [{ name: 'In' }],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'input', pos: { x: 2, y: 3 }, label: 'In', canRemove: false },
    { type: 'output', pos: { x: 17, y: 3 }, label: 'Out', canRemove: false },
  ],
  gateConstraints: { allow: ['delay'] },
  test: {
    name: 'Delay',
    description: 'Output follows input with a 1-tick delay',
    cases: [
      { inputs: { In: 0 }, expected: { Out: 0 } },
      { inputs: { In: 1 }, expected: { Out: 0 } },
      { inputs: { In: 0 }, expected: { Out: 1 } },
      { inputs: { In: 1 }, expected: { Out: 0 } },
      { inputs: { In: 1 }, expected: { Out: 1 } },
      { inputs: { In: 1 }, expected: { Out: 1 } },
      { inputs: { In: 0 }, expected: { Out: 1 } },
      { inputs: { In: 0 }, expected: { Out: 0 } },
    ],
  },
  prerequisites: [lid('not')],
  mapPosition: { x: 44, y: 11 },
};
export default level;
