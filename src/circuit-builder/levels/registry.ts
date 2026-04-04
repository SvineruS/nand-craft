import type { LevelId } from '../editor/types.ts';
import type { Level } from "./levelTypes.ts";

import wire from './defs/wire.ts';
import nand from './defs/nand.ts';
import not from './defs/not.ts';
import and from './defs/and.ts';
import or from './defs/or.ts';
import alwaysOn from './defs/always-on.ts';
import nor from './defs/nor.ts';
import xor from './defs/xor.ts';
import xnor from './defs/xnor.ts';
import threebitOr from './defs/3bit-or.ts';
import threebitAnd from './defs/3bit-and.ts';
import eightbitNot from './defs/8bit-not.ts';
import eightbitOr from './defs/8bit-or.ts';
import eightbitNor from './defs/8bit-nor.ts';
import halfAdder from './defs/half-adder.ts';
import fullAdder from './defs/full-adder.ts';
import switchLevel from './defs/switch.ts';
import onebitDecoder from './defs/1bit-decoder.ts';
import threebitDecoder from './defs/3bit-decoder.ts';
import eightbitNegative from './defs/8bit-negative.ts';
import delay from './defs/delay.ts';
import rsLatch from './defs/rs-latch.ts';
import eightbitMemory from './defs/8bit-memory.ts';
import eightbitCounter from './defs/8bit-counter.ts';
import eightbitCounterReset from './defs/8bit-counter-reset.ts';
import sandbox from './defs/sandbox.ts';

export const LEVELS: Level[] = [
  sandbox,
  wire,
  nand,
  not,
  and,
  or,
  alwaysOn,
  nor,
  xor,
  xnor,
  threebitOr,
  threebitAnd,
  eightbitNot,
  eightbitOr,
  eightbitNor,
  halfAdder,
  fullAdder,
  switchLevel,
  onebitDecoder,
  threebitDecoder,
  eightbitNegative,
  delay,
  rsLatch,
  eightbitMemory,
  eightbitCounter,
  eightbitCounterReset,
];

export function getLevelById(id: LevelId): Level | undefined {
  return LEVELS.find(l => l.id === id);
}
