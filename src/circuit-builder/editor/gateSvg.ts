// SVG path data for gate shapes, loaded from .svg files.
// Extracts the `d` attribute from the first <path> element.

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
import muxSvg from './svg/mux.svg?raw';
import decoder2Svg from './svg/decoder-2.svg?raw';
import decoder8Svg from './svg/decoder-8.svg?raw';
import inputSvg from './svg/input.svg?raw';
import input8bitSvg from './svg/input-8bit.svg?raw';
import outputSvg from './svg/output.svg?raw';
import output8bitSvg from './svg/output-8bit.svg?raw';
import constant8bitSvg from './svg/constant-8bit.svg?raw';
import constant16bitSvg from './svg/constant-16bit.svg?raw';
import splitterSvg from './svg/splitter.svg?raw';
import joinerSvg from './svg/joiner.svg?raw';

function extractPath(svg: string): string {
  const match = svg.match(/\bd="([^"]*)"/);
  return match ? match[1] : '';
}

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
export const MUX = extractPath(muxSvg);
export const DECODER_2 = extractPath(decoder2Svg);
export const DECODER_8 = extractPath(decoder8Svg);
export const INPUT = extractPath(inputSvg);
export const INPUT_8BIT = extractPath(input8bitSvg);
export const OUTPUT = extractPath(outputSvg);
export const OUTPUT_8BIT = extractPath(output8bitSvg);
export const CONSTANT_8BIT = extractPath(constant8bitSvg);
export const CONSTANT_16BIT = extractPath(constant16bitSvg);
export const SPLITTER = extractPath(splitterSvg);
export const JOINER = extractPath(joinerSvg);
