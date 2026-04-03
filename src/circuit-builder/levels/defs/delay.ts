import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('delay'),
  name: 'Delay',
  description: 'Pass the input to the output with a 1-tick delay.\n\nThe output should reflect the input value from the previous tick.\n\nHint: Use a delay gate.',
  inputs: [{ name: 'In' }],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'input', pos: { x: 2, y: 3 }, label: 'In', canRemove: false, canMove: false },
    { type: 'output', pos: { x: 12, y: 3 }, label: 'Out', canRemove: false, canMove: false },
  ],
  gateConstraints: { allow: ['delay'] },
  mode: 'sequential',
  test: {
    name: 'Delay',
    description: 'Output follows input with a 1-tick delay',
    mode: 'sequential',
    steps: [
      { type: 'write', pin: 'In', value: 1 },
      { type: 'read', pin: 'Out', expected: 1 },
      { type: 'write', pin: 'In', value: 0 },
      { type: 'read', pin: 'Out', expected: 0 },
      { type: 'write', pin: 'In', value: 1 },
      { type: 'read', pin: 'Out', expected: 1 },
    ],
  },
  prerequisites: [lid('not')],
  mapPosition: { x: 44, y: 11 },
};
export default level;
