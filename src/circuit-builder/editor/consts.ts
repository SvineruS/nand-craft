/**
 * Canvas colours and the wire-colour list are palette-dependent, so they live in
 * `palettes.ts` and are re-exported here — the rest of the editor keeps importing everything
 * it needs from one module.
 */
export { COLORS, WIRE_COLORS } from './palettes.ts';

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

/**
 * The sandbox is where a whole machine gets assembled — RAM, registers, an ALU and the
 * wiring between them — rather than the one circuit a level asks for, so it gets far more
 * room than a level does. Nothing is drawn per map area (the background follows the
 * viewport), so the size costs only the space it invites the player to use.
 */
export const SANDBOX_MAP_WIDTH = 6000;
export const SANDBOX_MAP_HEIGHT = 4000;

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
