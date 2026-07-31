export const WIRE_COLORS = [
  '#4a4a7a', // default (no override)
  '#fb923c', // orange
  '#facc15', // yellow
  '#60a5fa', // blue
  '#c084fc', // purple
  '#f472b6', // pink
  '#8b5cf6', // violet
  '#14b8a6', // teal
  '#ffffff', // white
]; // --- Colors (dark theme) ---

export const COLORS = {
  background: '#181825',
  gridDot: '#313150',
  gridLine: '#252540',
  gridLineMajor: '#343458',
  /** Decorative background layer. Drawn under the grid at ORNAMENT_ALPHA, hence the lift. */
  ornament: '#2f2f4d',
  ornamentTile: '#2b2b47',
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
  /** Veil over the unbuildable area outside the map, and the map's own edge. */
  outsideMap: 'rgba(10, 10, 18, 0.55)',
  mapBorder: '#3d3d63',
} as const;

/**
 * Playable area in world units, centred on the origin.
 *
 * The floor here is set by level content, not by taste: predefined gates are laid out from
 * the origin outwards and the largest built-in level (3bit-decoder) reaches (580, 480), so
 * a centred map narrower than ~1160×960 would strand its own gates outside the map.
 */
export const DEFAULT_MAP_WIDTH = 1400;
export const DEFAULT_MAP_HEIGHT = 1000;

/**
 * The level map is not a circuit the player builds in — it is a board that grows with every
 * level added, so it keeps the roomier area the buildable maps used to have.
 */
export const LEVEL_MAP_WIDTH = 4000;
export const LEVEL_MAP_HEIGHT = 3000;

/** How far past the map edge the camera may look, in screen pixels at the current zoom. */
export const PAN_MARGIN = 60;

/** Alpha applied to the background pattern outside the map. */
export const OUTSIDE_MAP_PATTERN_ALPHA = 0.3;

export const GRID_SIZE = 20;
export const GRID_DOT_RADIUS = 1;
export const MAJOR_GRID_EVERY = 4;
export const MAJOR_GRID_DOT_RADIUS = 1.5;
export const WIRE_DASH_SIZE = 3;
export const WIRE_LABEL_SPACING = 80;
export const WIRE_LABEL_MIN_LENGTH = 30;
