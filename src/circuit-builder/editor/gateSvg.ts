// SVG path data for gate shapes.
// Unique gates load from .svg files; IO/mux/constant variants are composed from fragments.

import andSvg from './svg/and.svg?raw';
import nandSvg from './svg/nand.svg?raw';
import orSvg from './svg/or.svg?raw';
import norSvg from './svg/nor.svg?raw';
import xorSvg from './svg/xor.svg?raw';
import xnorSvg from './svg/xnor.svg?raw';
import notSvg from './svg/not.svg?raw';
import tristateSvg from './svg/tristate.svg?raw';
import box2x2Svg from './svg/box-2x2.svg?raw';
import box3x3Svg from './svg/box-3x3.svg?raw';
import adderSvg from './svg/adder.svg?raw';
import negateSvg from './svg/negate.svg?raw';
import delaySvg from './svg/delay.svg?raw';
import decoder2Svg from './svg/decoder-2.svg?raw';
import decoder8Svg from './svg/decoder-8.svg?raw';
import splitterSvg from './svg/splitter.svg?raw';
import joinerSvg from './svg/joiner.svg?raw';

function extractPath(svg: string): string {
  const match = svg.match(/\bd="([^"]*)"/);
  return match ? match[1] : '';
}

// --- Unique gate shapes (from SVG files) ---

export const AND = extractPath(andSvg);
export const NAND = extractPath(nandSvg);
export const OR = extractPath(orSvg);
export const NOR = extractPath(norSvg);
export const XOR = extractPath(xorSvg);
export const XNOR = extractPath(xnorSvg);
export const NOT = extractPath(notSvg);
export const TRISTATE = extractPath(tristateSvg);
export const BOX_2x2 = extractPath(box2x2Svg);
export const BOX_3x3 = extractPath(box3x3Svg);
export const ADDER = extractPath(adderSvg);
export const NEGATE = extractPath(negateSvg);
export const DELAY = extractPath(delaySvg);
export const COUNTER = DELAY;
export const DECODER_2 = extractPath(decoder2Svg);
export const DECODER_8 = extractPath(decoder8Svg);
export const SPLITTER = extractPath(splitterSvg);
export const JOINER = extractPath(joinerSvg);

// --- Composable path fragments ---

// Base shapes
const INPUT_SHAPE  = 'M 0.2,0.2 L 1.3,0.2 L 1.8,1 L 1.3,1.8 L 0.2,1.8 Z';
const OUTPUT_SHAPE = 'M 1.8,0.2 L 0.7,0.2 L 0.2,1 L 0.7,1.8 L 1.8,1.8 Z';
const INPUT_SW_SHAPE  = 'M 0.2,0.2 L 1.3,0.2 L 1.8,1 L 1.3,1.8 L 1.2,1.8 L 1,1.6 L 0.8,1.8 L 0.2,1.8 Z';
const OUTPUT_SW_SHAPE = 'M 1.8,0.2 L 0.7,0.2 L 0.2,1 L 0.7,1.8 L 0.8,1.8 L 1,1.6 L 1.2,1.8 L 1.8,1.8 Z';
const BOX_SHAPE    = 'M 0.3,0.3 L 1.7,0.3 L 1.7,1.7 L 0.3,1.7 Z';
const MUX_SHAPE    = 'M 0,0 L 2,0.5 L 2,1.5 L 0,2 Z';

// Modifiers
const INPUT_8BIT_MARKS  = ' M 1.38,0.14 L 1.88,0.94 M 1.88,1.06 L 1.38,1.86';
const OUTPUT_8BIT_MARKS = ' M 0.62,0.14 L 0.12,0.94 M 0.12,1.06 L 0.62,1.86';
const CONST_8BIT_MARK   = ' M 1.8,0.4 L 1.8,1.6';
const CONST_16BIT_MARK  = ' M 1.8,0.4 L 1.8,1.6 M 1.9,0.4 L 1.9,1.6';
const MUX_8BIT_MARKS    = ' M -0.15,0.1 L -0.15,1.9';
const MUX_LINE_A        = ' M 1,1 L 0.15,0.15';
const MUX_LINE_B        = ' M 1,1 L 0.15,1.85';

// NOT 8-bit variant (bus mark on input side)
export const NOT_8BIT = NOT + ' M 0.1,0.4 L 0.1,1.6';

// --- Composed gate SVGs ---

// Input gates
export const INPUT          = INPUT_SHAPE;
export const INPUT_8BIT     = INPUT_SHAPE + INPUT_8BIT_MARKS;
export const INPUT_SW       = INPUT_SW_SHAPE;
export const INPUT_8BIT_SW  = INPUT_SW_SHAPE + INPUT_8BIT_MARKS;

// Output gates
export const OUTPUT          = OUTPUT_SHAPE;
export const OUTPUT_8BIT     = OUTPUT_SHAPE + OUTPUT_8BIT_MARKS;
export const OUTPUT_SW       = OUTPUT_SW_SHAPE;
export const OUTPUT_8BIT_SW  = OUTPUT_SW_SHAPE + OUTPUT_8BIT_MARKS;

// Constant gates
export const CONSTANT_8BIT  = BOX_SHAPE + CONST_8BIT_MARK;
export const CONSTANT_16BIT = BOX_SHAPE + CONST_16BIT_MARK;

// Decoder line modifiers
const DEC_LINE_0 = ' M 1,1 L 1.85,0.4';
const DEC_LINE_1 = ' M 1,1 L 1.85,1.6';

// Decoder gates (arrays: [A=0 → O0, A=1 → O1])
export const DECODER_2_0 = DECODER_2 + DEC_LINE_0;
export const DECODER_2_1 = DECODER_2 + DEC_LINE_1;

// MUX gates (arrays: [S=0 → A, S=1 → B])
export const MUX_A       = MUX_SHAPE + MUX_LINE_A;
export const MUX_B       = MUX_SHAPE + MUX_LINE_B;
export const MUX_8BIT_A  = MUX_SHAPE + MUX_8BIT_MARKS + MUX_LINE_A;
export const MUX_8BIT_B  = MUX_SHAPE + MUX_8BIT_MARKS + MUX_LINE_B;
