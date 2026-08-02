import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('ram'),
  name: 'RAM',
  description: 'Build an 8-word memory.\n\n' +
    'A (address) picks one of 8 cells. When W (write) is 1, store V in the chosen cell. ' +
    'When R (read) is 1, Q shows the chosen cell\'s contents; when R is 0, Q is disconnected (high-Z).\n\n' +
    'A cell\'s address is whichever decoder line you wire it to. Only the low 3 bits of A matter here.',
  hints: [
    'Split A and feed its low 3 bits into a 3-to-8 decoder. Exactly one of its 8 lines is 1 at a time.',
    'Line N AND W is the set input of cell N — so a write only reaches the addressed cell.',
    'Line N AND R enables cell N\'s tri-state buffer. Wire all 8 buffer outputs to the same wire: '
      + 'only the addressed one drives it, and with R=0 none do, so Q floats to high-Z.',
  ],
  inputs: [
    { name: 'A' },
    { name: 'V' },
    { name: 'R' },
    { name: 'W' },
  ],
  outputs: [{ name: 'Q' }],
  predefinedGates: [
    { type: 'input-8bit', pos: { x: -40, y: -22 }, label: 'A', canRemove: false },
    { type: 'input-8bit', pos: { x: -40, y: -18 }, label: 'V', canRemove: false },
    { type: 'input', pos: { x: -40, y: -14 }, label: 'R', canRemove: false },
    { type: 'input', pos: { x: -40, y: -10 }, label: 'W', canRemove: false },
    { type: 'output-8bit', pos: { x: 38, y: -1 }, label: 'Q', canRemove: false },
  ],
  // 8 rows of (2 AND gates + cell + buffer) do not fit the default 1400x1000 board.
  mapSize: { width: 1800, height: 1400 },
  gateConstraints: {
    allow: ['3bit-decoder', '8bit-memory', '8bit-tristate', 'splitter', 'joiner',
      'and', 'not', 'or', 'nand'],
    maxCount: { '8bit-memory': 8 },
  },
  test: {
    name: 'RAM',
    description: 'Store and recall bytes by address',
    cases: [
      // Write 42 to address 3. R is 0, so nothing drives Q.
      { inputs: { A: 3, V: 42, R: 0, W: 1 }, expected: { Q: null } },
      // Read it back.
      { inputs: { A: 3, V: 0, R: 1, W: 0 }, expected: { Q: 42 } },
      // Write and read the same address in one tick: the read sees the old contents,
      // because a cell's output is what it held at the start of the tick.
      { inputs: { A: 5, V: 99, R: 1, W: 1 }, expected: { Q: 0 } },
      // Now address 5 holds 99.
      { inputs: { A: 5, V: 0, R: 1, W: 0 }, expected: { Q: 99 } },
      // Writing address 5 left address 3 alone.
      { inputs: { A: 3, V: 0, R: 1, W: 0 }, expected: { Q: 42 } },
      // Read low disconnects the output.
      { inputs: { A: 3, V: 0, R: 0, W: 0 }, expected: { Q: null } },
      // Bottom of the address range.
      { inputs: { A: 0, V: 255, R: 0, W: 1 }, expected: { Q: null } },
      { inputs: { A: 0, V: 0, R: 1, W: 0 }, expected: { Q: 255 } },
      // Top of the address range.
      { inputs: { A: 7, V: 1, R: 0, W: 1 }, expected: { Q: null } },
      { inputs: { A: 7, V: 0, R: 1, W: 0 }, expected: { Q: 1 } },
      // Everything written earlier is still there.
      { inputs: { A: 5, V: 0, R: 1, W: 0 }, expected: { Q: 99 } },
      // A cell that was never written reads as 0.
      { inputs: { A: 1, V: 0, R: 1, W: 0 }, expected: { Q: 0 } },
    ],
  },
  prerequisites: [lid('8bit-memory'), lid('3bit-decoder'), lid('switch')],
  mapPosition: { x: 76, y: 11 },
};
export default level;
