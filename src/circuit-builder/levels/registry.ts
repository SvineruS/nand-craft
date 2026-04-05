import type { LevelId } from '../editor/types.ts';
import type { Level } from "./levelTypes.ts";

import wire from './defs/wire.ts';
import nand from './defs/nand.ts';
import not from './defs/not.ts';
import and from './defs/and.ts';
import or from './defs/or.ts';
import alwaysOn from './defs/always-on.ts';
import xor from './defs/xor.ts';
import xnor from './defs/xnor.ts';
import parity from './defs/parity.ts';
import or3 from './defs/3bit-or.ts';
import and3 from './defs/3bit-and.ts';
import mot8 from './defs/8bit-not.ts';
import or8 from './defs/8bit-or.ts';
import constant8 from './defs/8bit-constant.ts';
import adder8 from './defs/8bit-adder.ts';
import eqzero8 from './defs/8bit-eqzero.ts';
import sub8 from './defs/8bit-subtractor.ts';
import mux8 from './defs/8bit-mux.ts';
import halfAdder from './defs/half-adder.ts';
import fullAdder from './defs/full-adder.ts';
import switchLevel from './defs/switch.ts';
import decoder1 from './defs/1bit-decoder.ts';
import decoder3 from './defs/3bit-decoder.ts';
import neg8 from './defs/8bit-negative.ts';
import delay from './defs/delay.ts';
import rsLatch from './defs/rs-latch.ts';
import memory1 from './defs/1bit-memory.ts';
import memory8 from './defs/8bit-memory.ts';
import counter8 from './defs/8bit-counter.ts';
import counterReset8 from './defs/8bit-counter-reset.ts';
import sandbox from './defs/sandbox.ts';

export const LEVELS: Level[] = [
  sandbox,
  wire,
  nand,
  not,
  and,
  or,
  alwaysOn,
  xor,
  xnor,
  parity,
  or3,
  and3,
  mot8,
  or8,
  constant8,
  adder8,
  eqzero8,
  sub8,
  mux8,
  halfAdder,
  fullAdder,
  switchLevel,
  decoder1,
  decoder3,
  neg8,
  delay,
  rsLatch,
  memory1,
  memory8,
  counter8,
  counterReset8,
];

export function getLevelById(id: LevelId): Level | undefined {
  return LEVELS.find(l => l.id === id);
}
