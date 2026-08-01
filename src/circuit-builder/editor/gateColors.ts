import { COLORS, THEME } from './palettes.ts';
import type { GateDefinition } from './gates.ts';
import type { LevelNodeStatus } from './EditorState.ts';

/**
 * Gate body colours for the active palette.
 *
 * Gate definitions author one colour per gate — a dark tint that reads on a dark board. On a
 * light palette those bodies turn into holes, so the light variant is *derived* from the
 * authored colour rather than authored a second time: same hue, pale fill, saturated
 * outline. That keeps `GATE_DEFS` the single place a gate's identity colour is chosen, and
 * new gates get a light variant for free.
 */
export interface GateColors {
  fill: string;
  stroke: string;
}

/**
 * Light-gate targets: a pastel body with a saturated outline.
 *
 * The saturation is scaled *up*, not down. HSL chroma is `(1 - |2L - 1|) * s`, so at a light
 * L the same `s` produces far less colour — carrying the authored saturation across
 * unchanged (they sit around 0.2–0.3) washes every gate out to near-white.
 */
const LIGHT_FILL_LIGHTNESS = 0.78;
const LIGHT_FILL_SATURATION = { min: 0.5, max: 0.88, scale: 2.4 };
const LIGHT_STROKE_LIGHTNESS = 0.4;
const LIGHT_STROKE_SATURATION = { min: 0.35, max: 0.72, scale: 1 };

export function gateColorsOf(def: GateDefinition): GateColors {
  const fill = def.color ?? COLORS.gateFill;
  const stroke = def.stroke ?? COLORS.gateStroke;
  if (THEME.gateStyle === 'dark') return { fill, stroke };

  const key = `${fill}|${stroke}`;
  let light = lightCache.get(key);
  if (!light) {
    light = {
      fill: recolor(fill, LIGHT_FILL_LIGHTNESS, LIGHT_FILL_SATURATION),
      stroke: recolor(stroke, LIGHT_STROKE_LIGHTNESS, LIGHT_STROKE_SATURATION),
    };
    lightCache.set(key, light);
  }
  return light;
}

/**
 * Colours for a level-map node: the palette's colour for that state, with a tinted body.
 *
 * The body is tinted toward white or toward the board depending on the gate style, for the
 * same reason gates are — `gateText` is dark on light-gate palettes, so a node body tinted
 * toward a dark board would swallow its own label.
 */
export function levelNodeColors(status: LevelNodeStatus): GateColors {
  const stroke = statusColor(status);
  const towards = THEME.gateStyle === 'light' ? WHITE : COLORS.background;
  return { fill: mix(stroke, towards, LEVEL_NODE_TINT), stroke };
}

const WHITE = '#ffffff';
/** How far a node body is pulled toward the backdrop — a tint, not a block of colour. */
const LEVEL_NODE_TINT = 0.72;

function statusColor(status: LevelNodeStatus): string {
  switch (status) {
    case 'locked': return COLORS.levelLocked;
    case 'available': return COLORS.levelAvailable;
    case 'solved': return COLORS.levelSolved;
  }
}

// --- Colour maths ---

const lightCache = new Map<string, GateColors>();

interface SaturationTarget {
  min: number;
  max: number;
  scale: number;
}

/** Same hue, new lightness, saturation pulled into a readable band. */
function recolor(hex: string, lightness: number, saturation: SaturationTarget): string {
  const { h, s } = hexToHsl(hex);
  const clamped = Math.min(saturation.max, Math.max(saturation.min, s * saturation.scale));
  return hslToHex(h, clamped, lightness);
}

/** Blend `amount` of `b` into `a`. Both must be #rrggbb. */
function mix(a: string, b: string, amount: number): string {
  const [ar, ag, ab] = rgbOf(a);
  const [br, bg, bb] = rgbOf(b);
  const channel = (x: number, y: number) => Math.round(x + (y - x) * amount);
  return toHex(channel(ar, br), channel(ag, bg), channel(ab, bb));
}

function rgbOf(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = rgbOf(hex).map(v => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  const [r, g, b] = rgbTriple(h, c, x);
  return toHex(
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  );
}

function rgbTriple(h: number, c: number, x: number): [number, number, number] {
  if (h < 60) return [c, x, 0];
  if (h < 120) return [x, c, 0];
  if (h < 180) return [0, c, x];
  if (h < 240) return [0, x, c];
  if (h < 300) return [x, 0, c];
  return [c, 0, x];
}
