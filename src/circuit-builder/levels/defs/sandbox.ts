import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('sandbox'),
  name: 'Sandbox',
  description: 'Free-form playground. All gates are available, no tests to pass.',
  inputs: [],
  outputs: [],
  test: {
    name: 'Sandbox',
    description: 'No tests',
  },
  prerequisites: [],
  mapPosition: { x: 0, y: 11 },
};
export default level;
