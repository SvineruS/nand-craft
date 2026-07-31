import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('sandbox'),
  name: 'Sandbox',
  description: 'Free-form playground. All gates are available. Write your own tests.\n\nUse I/O gates (IN, OUT) to define inputs and outputs for your circuit. Select an I/O gate and rename it in the Properties panel — test cases reference gates by label.\n\nYou can add, remove, or replace I/O gates freely. Click "Tests" in the toolbar to open the test editor and write custom tests.',
  inputs: [{ name: 'A' }, { name: 'B' }],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'input', pos: { x: -10, y: -3 }, label: 'A' },
    { type: 'input', pos: { x: -10, y: 1 }, label: 'B' },
    { type: 'output', pos: { x: 8, y: -1 }, label: 'Out' },
  ],
  test: {
    name: 'Sandbox',
    description: 'Custom tests',
    cases: [
      { inputs: { A: 0, B: 0 }, expected: { Out: 0 } },
      { inputs: { A: 0, B: 1 }, expected: { Out: 1 } },
      { inputs: { A: 1, B: 0 }, expected: { Out: 1 } },
      { inputs: { A: 1, B: 1 }, expected: { Out: 0 } },
    ],
  },
  prerequisites: [],
  mapPosition: { x: 0, y: 11 },
  customTests: true,
};
export default level;
