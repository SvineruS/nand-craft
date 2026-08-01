/**
 * Colour palettes, each modelled on a real circuit board.
 *
 * A palette covers both halves of the app: `canvas` colours are read by the renderer through
 * the live `COLORS` object, `ui` values are written to the CSS variables the Preact shell
 * uses. Switching a palette mutates `COLORS` in place rather than threading a theme argument
 * through every draw call — the renderer reads it once per frame, so an in-place swap shows
 * up on the next frame with no plumbing.
 */

export interface CanvasColors {
  background: string;
  gridDot: string;
  /** Decorative background layer. Drawn under the grid at ORNAMENT_ALPHA, hence the lift. */
  ornament: string;
  gateFill: string;
  gateStroke: string;
  gateText: string;
  wireDefault: string;
  wireActive: string;
  wireZero: string;
  wireHighZ: string;
  pinActive: string;
  pinZero: string;
  pinHighZ: string;
  selection: string;
  error: string;
  selectionRectFill: string;
  selectionRectStroke: string;
  wireNodeFill: string;
  wireNodeStroke: string;
  /** Veil over the unbuildable area outside the map, and the map's own edge. */
  outsideMap: string;
  mapBorder: string;
  /**
   * Level-map node states. Named per state rather than borrowed from `selection` /
   * `wireActive`, whose hues differ per board — a level should not turn magenta because
   * that palette happens to select in magenta. Green reads as solved on every board.
   */
  levelLocked: string;
  levelAvailable: string;
  levelSolved: string;
}

/** CSS variables the Preact shell reads, without the `--` prefix. */
export type UiVarName =
  | 'bg' | 'surface' | 'surface-hover' | 'border'
  | 'text' | 'text-dim' | 'text-dim2'
  | 'accent' | 'accent-hover'
  | 'green' | 'red' | 'orange' | 'pass' | 'fail'
  | 'button-bg' | 'button-hover' | 'label-bg' | 'prop-bg'
  | 'input-bg' | 'input-border' | 'current-bg' | 'current-border';

export type PaletteId = 'midnight' | 'fr4' | 'blueMask' | 'breadboard';

/** Wire colours as authored. `WIRE_COLORS` is this list, reordered to suit the palette. */
const BASE_WIRE_COLORS = [
  '#4a4a7a', // default (no override)
  '#fb923c', // orange
  '#facc15', // yellow
  '#60a5fa', // blue
  '#c084fc', // purple
  '#f472b6', // pink
  '#8b5cf6', // violet
  '#14b8a6', // teal
  '#ffffff', // white
];

export interface Palette {
  id: PaletteId;
  label: string;
  /** What board it is imitating — shown under the swatch. */
  description: string;
  /** Drives `color-scheme`, so form controls and scrollbars match. */
  scheme: 'dark' | 'light';
  /**
   * How gate bodies are drawn — separate from `scheme` on purpose. A real board has pale
   * silkscreen components on a dark mask, so a palette can be dark-chromed and still want
   * light gates. Must agree with `canvas.gateText`, which sits on the gate body.
   */
  gateStyle: 'dark' | 'light';
  canvas: CanvasColors;
  ui: Record<UiVarName, string>;
}

/** The original dark theme: no board, just a dark workbench. */
const MIDNIGHT: Palette = {
  id: 'midnight',
  label: 'Midnight',
  description: 'The original dark workbench',
  scheme: 'dark',
  gateStyle: 'dark',
  canvas: {
    background: '#181825',
    gridDot: '#313150',
    ornament: '#2f2f4d',
    gateFill: '#2d2d4d',
    gateStroke: '#5a5a8a',
    gateText: '#e8e8f0',
    wireDefault: '#555580',
    wireActive: '#4ade80',
    wireZero: '#f87171',
    wireHighZ: '#45456a',
    pinActive: '#5eebb0',
    pinZero: '#f87171',
    pinHighZ: '#7a7a90',
    selection: '#6cb4ff',
    error: '#ef4444',
    selectionRectFill: 'rgba(108, 180, 255, 0.15)',
    selectionRectStroke: '#6cb4ff',
    wireNodeFill: '#3e3e60',
    wireNodeStroke: '#8888bb',
    outsideMap: 'rgba(10, 10, 18, 0.55)',
    mapBorder: '#3d3d63',
    levelLocked: '#555568',
    levelAvailable: '#6cb4ff',
    levelSolved: '#5a8a5a',
  },
  ui: {
    'bg': '#1e1e2e',
    'surface': '#2d2d4d',
    'surface-hover': '#3d3d5d',
    'border': '#444466',
    'text': '#e0e0e0',
    'text-dim': '#9ca3af',
    'text-dim2': '#999baf',
    'accent': '#3b82f6',
    'accent-hover': '#2563eb',
    'green': '#4ade80',
    'red': '#f87171',
    'orange': '#fb923c',
    'pass': '#22c55e',
    'fail': '#ef4444',
    'button-bg': '#363650',
    'button-hover': '#44446a',
    'label-bg': '#252540',
    'prop-bg': '#252540',
    'input-bg': '#1a1a30',
    'input-border': '#4a4a7a',
    'current-bg': 'rgba(96, 165, 250, 0.12)',
    'current-border': '#60a5fa',
  },
};

/** Classic FR-4: green solder mask, cream silkscreen, gold-plated traces. */
const FR4: Palette = {
  id: 'fr4',
  label: 'FR-4',
  description: 'Green solder mask, gold traces',
  scheme: 'dark',
  gateStyle: 'light',
  canvas: {
    background: '#14603f',
    gridDot: '#3d9a70',
    ornament: '#2b8259',
    gateFill: '#f2eee1',
    gateStroke: '#b8a878',
    gateText: '#0c1f18',
    // Unpowered traces are gold, but 1/0 stays green/red on every board — signal state is
    // the thing you read constantly, and it should not need relearning per palette.
    wireDefault: '#c9962c',
    wireActive: '#5cf58a',
    // Crimson rather than orange-red: an orange zero is nearly indistinguishable from the
    // gold unpowered trace, which would make a 0 read as "not connected".
    wireZero: '#ff3b57',
    wireHighZ: '#6f8a7c',
    pinActive: '#8dffab',
    pinZero: '#ff6b80',
    pinHighZ: '#9aae9f',
    selection: '#7cf0ff',
    error: '#ff5252',
    selectionRectFill: 'rgba(124, 240, 255, 0.18)',
    selectionRectStroke: '#7cf0ff',
    wireNodeFill: '#e6d5a0',
    wireNodeStroke: '#8a6a2a',
    outsideMap: 'rgba(4, 30, 19, 0.5)',
    mapBorder: '#4fae82',
    levelLocked: '#6f8a7c',
    levelAvailable: '#d9a021',
    levelSolved: '#2f9e63',
  },
  ui: {
    'bg': '#0f4a31',
    'surface': '#186b48',
    'surface-hover': '#1f855a',
    'border': '#2f9a6b',
    'text': '#f2eee1',
    'text-dim': '#a8c9b6',
    'text-dim2': '#94bda8',
    'accent': '#ffc94d',
    'accent-hover': '#e0ab2e',
    'green': '#7ce8a4',
    'red': '#ff8a70',
    'orange': '#ffab4d',
    'pass': '#4ede8e',
    'fail': '#ff6b52',
    'button-bg': '#1c7a52',
    'button-hover': '#279467',
    'label-bg': '#13593c',
    'prop-bg': '#13593c',
    'input-bg': '#0b3d28',
    'input-border': '#2f9a6b',
    'current-bg': 'rgba(255, 217, 77, 0.14)',
    'current-border': '#ffd94d',
  },
};

/** Modern blue solder mask with white silkscreen. */
const BLUE_MASK: Palette = {
  id: 'blueMask',
  label: 'Blue Mask',
  description: 'Blue board, white silkscreen',
  scheme: 'dark',
  gateStyle: 'light',
  canvas: {
    background: '#16477e',
    gridDot: '#4b82c4',
    ornament: '#2f66a8',
    gateFill: '#eef3f8',
    gateStroke: '#9fbcd8',
    gateText: '#0a1826',
    wireDefault: '#d4ae52',
    wireActive: '#5ce894',
    wireZero: '#ff4062',
    wireHighZ: '#7d94ab',
    pinActive: '#8bf5b4',
    pinZero: '#ff7089',
    pinHighZ: '#9db2c6',
    selection: '#ff8ad8',
    error: '#ff5b5b',
    selectionRectFill: 'rgba(255, 138, 216, 0.18)',
    selectionRectStroke: '#ff8ad8',
    wireNodeFill: '#e4d6a8',
    wireNodeStroke: '#8f7430',
    outsideMap: 'rgba(6, 20, 38, 0.5)',
    mapBorder: '#5c95d6',
    levelLocked: '#7d94ab',
    levelAvailable: '#d9a021',
    levelSolved: '#2f9e63',
  },
  ui: {
    'bg': '#103562',
    'surface': '#1b4d85',
    'surface-hover': '#245f9f',
    'border': '#356fb0',
    'text': '#eef3f8',
    'text-dim': '#a9c4de',
    'text-dim2': '#93b4d3',
    'accent': '#ffd75e',
    'accent-hover': '#e6bc43',
    'green': '#6fe3a5',
    'red': '#ff8f7a',
    'orange': '#ffb35e',
    'pass': '#43d68d',
    'fail': '#ff6f5c',
    'button-bg': '#1f5794',
    'button-hover': '#2a6cb3',
    'label-bg': '#144074',
    'prop-bg': '#144074',
    'input-bg': '#0c2a4e',
    'input-border': '#356fb0',
    'current-bg': 'rgba(255, 215, 94, 0.14)',
    'current-border': '#ffd75e',
  },
};

/** Prototyping on a breadboard, under a desk lamp — the bright one. */
const BREADBOARD: Palette = {
  id: 'breadboard',
  label: 'Breadboard',
  description: 'Cream board, daylight bright',
  scheme: 'light',
  gateStyle: 'light',
  canvas: {
    background: '#e9e6dc',
    gridDot: '#b3ac9a',
    ornament: '#cdc6b3',
    gateFill: '#ffffff',
    gateStroke: '#7d7869',
    gateText: '#1c1c1c',
    wireDefault: '#9a9488',
    wireActive: '#0a9e48',
    wireZero: '#d22b2b',
    wireHighZ: '#c2beb2',
    pinActive: '#0a9e48',
    pinZero: '#d22b2b',
    pinHighZ: '#8f8f8f',
    selection: '#1e6fd9',
    error: '#c62828',
    selectionRectFill: 'rgba(30, 111, 217, 0.15)',
    selectionRectStroke: '#1e6fd9',
    wireNodeFill: '#ffffff',
    wireNodeStroke: '#5f5b50',
    outsideMap: 'rgba(120, 116, 104, 0.35)',
    mapBorder: '#8a8578',
    levelLocked: '#9a958a',
    levelAvailable: '#1e6fd9',
    levelSolved: '#0a9e48',
  },
  ui: {
    'bg': '#f4f2ea',
    'surface': '#e4e0d3',
    'surface-hover': '#d7d2c2',
    'border': '#bdb7a5',
    'text': '#22221e',
    'text-dim': '#5f5b50',
    'text-dim2': '#6e6a5e',
    'accent': '#1e6fd9',
    'accent-hover': '#1558ad',
    'green': '#0a9e48',
    'red': '#d22b2b',
    'orange': '#d97706',
    'pass': '#0a9e48',
    'fail': '#c62828',
    'button-bg': '#ded9cb',
    'button-hover': '#cec8b7',
    'label-bg': '#eae6da',
    'prop-bg': '#eae6da',
    'input-bg': '#ffffff',
    'input-border': '#bdb7a5',
    'current-bg': 'rgba(30, 111, 217, 0.12)',
    'current-border': '#1e6fd9',
  },
};

export const PALETTES: Palette[] = [BREADBOARD, FR4, BLUE_MASK, MIDNIGHT];

export const DEFAULT_PALETTE_ID: PaletteId = 'breadboard';

export function getPalette(id: PaletteId): Palette {
  return PALETTES.find(p => p.id === id) ?? BREADBOARD;
}

export function isPaletteId(value: string): value is PaletteId {
  return PALETTES.some(p => p.id === value);
}

/**
 * Live canvas colours. Mutable on purpose: the whole renderer reads it, and
 * `applyCanvasColors` swaps the values when the player picks another palette.
 */
export const COLORS: CanvasColors = { ...getPalette(DEFAULT_PALETTE_ID).canvas };

/**
 * How the canvas should draw gate bodies. Read by `gateColors.ts`, which derives light gate
 * bodies from the dark ones the gate definitions author.
 */
export const THEME: { gateStyle: Palette['gateStyle'] } = {
  gateStyle: getPalette(DEFAULT_PALETTE_ID).gateStyle,
};

/**
 * Colours a wire can be given. Index 0 is the "no override" sentinel — a wire left on it
 * draws in `COLORS.wireDefault` — and the rest are real choices.
 *
 * White is the useful high-contrast pick on a dark board and invisible on a light one, so
 * on a light palette it trades places with the sentinel: white becomes the slot nobody
 * paints with, and the dark slate becomes a real choice.
 */
export const WIRE_COLORS: string[] = wireColorsFor(getPalette(DEFAULT_PALETTE_ID));

export function applyCanvasColors(palette: Palette): void {
  Object.assign(COLORS, palette.canvas);
  THEME.gateStyle = palette.gateStyle;
  // Mutated in place: modules index into this array, and re-assigning it would strand them.
  wireColorsFor(palette).forEach((color, i) => { WIRE_COLORS[i] = color; });
}

function wireColorsFor(palette: Palette): string[] {
  const colors = [...BASE_WIRE_COLORS];
  if (palette.scheme !== 'light') return colors;

  const last = colors.length - 1;
  [colors[0], colors[last]] = [colors[last], colors[0]];
  return colors;
}
