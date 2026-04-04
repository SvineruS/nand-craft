import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('switch'),
  name: 'Switch',
  description: 'Build a 2-to-1 multiplexer (switch) using tri-state buffers.\n\nWhen S=0, output A. When S=1, output B.\n\nHint: Use two tri-state buffers — enable one with S, the other with NOT S. Connect both outputs to the same wire.',
  inputs: [
    { name: 'S' },
    { name: 'A' },
    { name: 'B' },
  ],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'input', pos: { x: 2, y: 1 }, label: 'S', canRemove: false },
    { type: 'input', pos: { x: 2, y: 4 }, label: 'A', canRemove: false },
    { type: 'input', pos: { x: 2, y: 7 }, label: 'B', canRemove: false },
    { type: 'output', pos: { x: 19, y: 4 }, label: 'Out', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'tristate'] },
  test: {
    name: 'Switch (Mux)',
    description: 'S=0 selects A, S=1 selects B',
    cases: [
      { inputs: { S: 0, A: 0, B: 0 }, expected: { Out: 0 } },
      { inputs: { S: 0, A: 0, B: 1 }, expected: { Out: 0 } },
      { inputs: { S: 0, A: 1, B: 0 }, expected: { Out: 1 } },
      { inputs: { S: 0, A: 1, B: 1 }, expected: { Out: 1 } },
      { inputs: { S: 1, A: 0, B: 0 }, expected: { Out: 0 } },
      { inputs: { S: 1, A: 0, B: 1 }, expected: { Out: 1 } },
      { inputs: { S: 1, A: 1, B: 0 }, expected: { Out: 0 } },
      { inputs: { S: 1, A: 1, B: 1 }, expected: { Out: 1 } },
    ],
  },
  prerequisites: [lid('and'), lid('not'), lid('or')],
  mapPosition: { x: 28, y: 5 },
};
export default level;
