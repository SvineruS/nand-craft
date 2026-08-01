// SVG path data for gate shapes, in grid units (a gate's own width × height).
// Everything is a plain path string so shapes compose by concatenation: a body plus
// modifier marks (inversion bubble, bus slashes, selector lines) makes a variant.

// --- Shape builders ---

/** Rectangle spanning width × height grid units. `inset` 0 makes the body reach the pins. */
function buildBox(width: number, height: number, inset = 0): string {
  const [x1, y1] = [inset, inset];
  const [x2, y2] = [width - inset, height - inset];
  return `M ${x1},${y1} L ${x2},${y1} L ${x2},${y2} L ${x1},${y2} Z`;
}

/** Inversion bubble on the output side, vertically centred on a 2-unit-tall gate. */
function buildBubble(centerX: number, radius: number): string {
  const d = radius * 2;
  return ` M ${centerX},1 m ${-radius},0 a ${radius},${radius} 0 1,0 ${d},0`
       + ` a ${radius},${radius} 0 1,0 ${-d},0`;
}

/**
 * Trapezoid `width` units wide — the selector/bus-fan shape used by mux, decoders and
 * splitters. The bus gates pass width 1: they are tall enough to read as a fan without
 * spending a second grid column on it.
 */
function buildTrapezoid(
  leftTop: number, leftBottom: number, rightBottom: number, rightTop: number, width = 2,
): string {
  return `M 0,${leftTop} L 0,${leftBottom} L ${width},${rightBottom} L ${width},${rightTop} Z`;
}

// --- Bodies ---

const AND_BODY       = 'M 0.2,0.1 L 0.2,1.9 L 1.5,1.9 A 0.9,0.9 0 0,0 1.5,0.1 Z';
const OR_BODY        = 'M 0.2,0.1 Q 0.8,1 0.2,1.9 L 1.2,1.9 Q 2.3,1.9 2.8,1 Q 2.3,0.1 1.2,0.1 Z';
// Shortened nose, so the inverted variants have room for the bubble inside the same 3 units.
const OR_BODY_SHORT  = 'M 0.2,0.1 Q 0.8,1 0.2,1.9 L 1.2,1.9 Q 2.1,1.9 2.5,1 Q 2.1,0.1 1.2,0.1 Z';
const NOT_BODY       = 'M 0.2,0.3 L 0.2,1.7 L 1.5,1 Z';
const TRISTATE_BODY  = 'M 0.15,0.1 L 0.15,1.9 L 1.7,1 Z';
const BOX_2x2_INSET  = buildBox(2, 2, 0.3);
const MUX_BODY       = buildTrapezoid(0, 2, 1.5, 0.5);

// --- Modifier marks ---

const BUBBLE            = buildBubble(2.6, 0.15);
const NOT_BUBBLE        = buildBubble(1.65, 0.18);
const XOR_ARC           = ' M 0.0,0.1 Q 0.6,1 0.0,1.9';
const PLUS_MARK         = ' M 0.7,1 L 1.3,1 M 1,0.7 L 1,1.3';
const MINUS_MARK        = ' M 0.7,1.0 L 1.3,1.0';
const DELAY_MARK        = ' M 1.0,1.3 L 1.5,0.5 L 2.0,1.3 Z';
// Double chevrons, sitting below the gate label rather than behind it. Both are wound
// bottom-to-top so their implicit fill turns the same way as the body box: a subpath
// winding the other way punches a hole in the body it sits on.
const SHIFT_RIGHT_MARK  = ' M 0.6,1.15 L 0.95,1.4 L 0.6,1.65 M 1.05,1.15 L 1.4,1.4 L 1.05,1.65';
const SHIFT_LEFT_MARK   = ' M 1.4,1.65 L 1.05,1.4 L 1.4,1.15 M 0.95,1.65 L 0.6,1.4 L 0.95,1.15';
const INPUT_8BIT_MARKS  = ' M 1.38,0.14 L 1.88,0.94 M 1.88,1.06 L 1.38,1.86';
const OUTPUT_8BIT_MARKS = ' M 0.62,0.14 L 0.12,0.94 M 0.12,1.06 L 0.62,1.86';
const CONST_8BIT_MARK   = ' M 1.8,0.4 L 1.8,1.6';
const CONST_16BIT_MARK  = ' M 1.8,0.4 L 1.8,1.6 M 1.9,0.4 L 1.9,1.6';
const NOT_8BIT_MARK     = ' M 0.1,0.4 L 0.1,1.6';
const TRISTATE_8BIT_MARK = ' M 0.05,0.4 L 0.05,1.6';
const MUX_8BIT_MARKS    = ' M -0.15,0.1 L -0.15,1.9';
const MUX_LINE_A        = ' M 1,1 L 0.15,0.15';
const MUX_LINE_B        = ' M 1,1 L 0.15,1.85';
const DEC_LINE_0        = ' M 1,1 L 1.85,0.4';
const DEC_LINE_1        = ' M 1,1 L 1.85,1.6';

// --- Logic gates ---

export const AND  = AND_BODY;
export const NAND = AND_BODY + BUBBLE;
export const OR   = OR_BODY;
export const NOR  = OR_BODY_SHORT + BUBBLE;
export const XOR  = OR_BODY + XOR_ARC;
export const XNOR = OR_BODY_SHORT + XOR_ARC + BUBBLE;

export const NOT      = NOT_BODY + NOT_BUBBLE;
export const NOT_8BIT = NOT + NOT_8BIT_MARK;

export const TRISTATE      = TRISTATE_BODY;
export const TRISTATE_8BIT = TRISTATE_BODY + TRISTATE_8BIT_MARK;

// --- Boxes ---

// The registers use a full-cell box so the body meets its pins; the RS latch and the
// constants keep the inset box, which has no pin on three of its sides.
export const BOX_2x2      = BOX_2x2_INSET;
export const BOX_2x2_FULL = buildBox(2, 2);
export const BOX_3x4      = buildBox(3, 4, 0.3);

export const ADDER   = buildBox(2, 2, 0.2) + PLUS_MARK;
export const SHIFT_RIGHT = buildBox(2, 2, 0.2) + SHIFT_RIGHT_MARK;
export const SHIFT_LEFT  = buildBox(2, 2, 0.2) + SHIFT_LEFT_MARK;
export const NEGATE  = BOX_2x2_INSET + MINUS_MARK;
export const DELAY   = buildBox(3, 2, 0.3) + DELAY_MARK;
export const COUNTER = DELAY;

export const CONSTANT_8BIT  = BOX_2x2_INSET + CONST_8BIT_MARK;
export const CONSTANT_16BIT = BOX_2x2_INSET + CONST_16BIT_MARK;

// --- IO gates ---

const INPUT_BODY      = 'M 0.2,0.2 L 1.3,0.2 L 1.8,1 L 1.3,1.8 L 0.2,1.8 Z';
const OUTPUT_BODY     = 'M 1.8,0.2 L 0.7,0.2 L 0.2,1 L 0.7,1.8 L 1.8,1.8 Z';
// The "SW" variants notch the bottom edge to mark an interactive switch.
const INPUT_SW_BODY   = 'M 0.2,0.2 L 1.3,0.2 L 1.8,1 L 1.3,1.8 L 1.2,1.8 L 1,1.6 L 0.8,1.8 L 0.2,1.8 Z';
const OUTPUT_SW_BODY  = 'M 1.8,0.2 L 0.7,0.2 L 0.2,1 L 0.7,1.8 L 0.8,1.8 L 1,1.6 L 1.2,1.8 L 1.8,1.8 Z';

export const INPUT          = INPUT_BODY;
export const INPUT_8BIT     = INPUT_BODY + INPUT_8BIT_MARKS;
export const INPUT_SW       = INPUT_SW_BODY;
export const INPUT_8BIT_SW  = INPUT_SW_BODY + INPUT_8BIT_MARKS;

export const OUTPUT          = OUTPUT_BODY;
export const OUTPUT_8BIT     = OUTPUT_BODY + OUTPUT_8BIT_MARKS;
export const OUTPUT_SW       = OUTPUT_SW_BODY;
export const OUTPUT_8BIT_SW  = OUTPUT_SW_BODY + OUTPUT_8BIT_MARKS;

// --- Selectors and bus shapes ---

// Decoders and muxes render as layer arrays: one path per selected input/output.
export const DECODER_2   = buildTrapezoid(0.7, 1.3, 1.7, 0.3);
export const DECODER_2_0 = DECODER_2 + DEC_LINE_0;
export const DECODER_2_1 = DECODER_2 + DEC_LINE_1;
// Left edge covers the three input rows at the top, right edge all eight outputs. The
// resulting wedge also tells the decoder apart from the splitter's symmetric taper.
export const DECODER_8   = buildTrapezoid(0, 3, 7, 0, 1);

export const MUX_A       = MUX_BODY + MUX_LINE_A;
export const MUX_B       = MUX_BODY + MUX_LINE_B;
export const MUX_8BIT_A  = MUX_BODY + MUX_8BIT_MARKS + MUX_LINE_A;
export const MUX_8BIT_B  = MUX_BODY + MUX_8BIT_MARKS + MUX_LINE_B;

export const SPLITTER = buildTrapezoid(1, 6, 7, 0, 1);
export const JOINER   = buildTrapezoid(0, 7, 6, 1, 1);
