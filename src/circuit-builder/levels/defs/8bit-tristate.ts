import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('8bit-tristate'),
  name: '8-bit Tri-state',
  description: 'Pass an 8-bit value through a tri-state buffer.\n\nWhen en=1, the output matches the input. When en=0, the output is disconnected (high-Z). Use the 8-bit tri-state buffer to wire it up.',
  hints: ['Drop in an 8-bit tri-state (TRI8), connect A to its data input, en to its enable, and its output to Out.'],
  inputs: [
    { name: 'A' },
    { name: 'en' },
  ],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'input',      pos: { x: 2, y: 2 }, label: 'en', canRemove: false },
    { type: 'input-8bit', pos: { x: 2, y: 5 }, label: 'A',  canRemove: false },
    { type: 'output-8bit', pos: { x: 15, y: 5 }, label: 'Out', canRemove: false },
  ],
  gateConstraints: { allow: ['tristate', 'splitter', 'joiner'] },
  test: {
    name: '8-bit Tri-state',
    description: 'When enabled, Out follows A',
    cases: [
      { inputs: { A: 0,   en: 1 }, expected: { Out: 0   } },
      { inputs: { A: 1,   en: 1 }, expected: { Out: 1   } },
      { inputs: { A: 42,  en: 0 }, expected: { Out: null  } },
      { inputs: { A: 128, en: 1 }, expected: { Out: 128 } },
      { inputs: { A: 255, en: 0 }, expected: { Out: null } },
      { inputs: { A: 0b10101010, en: 0 }, expected: { Out: null } },
      { inputs: { A: 0b01010101, en: 1 }, expected: { Out: 0b01010101 } },
    ],
  },
  prerequisites: [lid('switch'), lid('8bit-not')],
  mapPosition: { x: 32, y: 7 },
};
export default level;
