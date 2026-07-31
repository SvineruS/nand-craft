import {
  DEFAULT_MAP_HEIGHT, DEFAULT_MAP_WIDTH, GRID_SIZE,
  LEVEL_MAP_HEIGHT, LEVEL_MAP_WIDTH, PAN_MARGIN,
} from '../consts.ts';
import type { Camera } from '../../../engine/camera.ts';
import type { Vec2 } from './vec2.ts';

/** Dimensions of the buildable area, in world units. */
export interface MapSize {
  width: number;
  height: number;
}

export interface MapRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const DEFAULT_MAP_SIZE: MapSize = {
  width: DEFAULT_MAP_WIDTH,
  height: DEFAULT_MAP_HEIGHT,
};

/** Used by the level-select board and its editor, which are laid out, not built in. */
export const LEVEL_MAP_SIZE: MapSize = {
  width: LEVEL_MAP_WIDTH,
  height: LEVEL_MAP_HEIGHT,
};

/** The map is centred on the origin — where the camera starts and where levels are laid out. */
export function mapRectOf(size: MapSize): MapRect {
  return {
    left: -size.width / 2,
    top: -size.height / 2,
    right: size.width / 2,
    bottom: size.height / 2,
  };
}

/** Move a gate's top-left corner as little as needed for its whole body to fit the map. */
export function clampGatePos(pos: Vec2, dims: { w: number; h: number }, size: MapSize): Vec2 {
  const rect = mapRectOf(size);
  return {
    x: pos.x + slideInside(pos.x, pos.x + dims.w, rect.left, rect.right),
    y: pos.y + slideInside(pos.y, pos.y + dims.h, rect.top, rect.bottom),
  };
}

/** Move a point as little as needed to be inside the map. */
export function clampPoint(pos: Vec2, size: MapSize): Vec2 {
  return clampGatePos(pos, { w: 0, h: 0 }, size);
}

/**
 * Shrink a drag/paste offset so the whole group lands inside the map.
 *
 * The group is clamped as one rigid body rather than per item, which keeps its internal
 * layout intact — and, because both the drag preview and the command it commits go through
 * this, keeps the two identical (see `check:invariants`).
 */
export function clampGroupOffset(offset: Vec2, bounds: MapRect, size: MapSize): Vec2 {
  // An empty group has no bounds to hold anywhere.
  if (!Number.isFinite(bounds.left) || !Number.isFinite(bounds.top)) return offset;

  const rect = mapRectOf(size);
  const moved = {
    left: bounds.left + offset.x,
    right: bounds.right + offset.x,
    top: bounds.top + offset.y,
    bottom: bounds.bottom + offset.y,
  };
  return {
    x: offset.x + slideInside(moved.left, moved.right, rect.left, rect.right),
    y: offset.y + slideInside(moved.top, moved.bottom, rect.top, rect.bottom),
  };
}

/**
 * Keep the camera looking at the map, allowing PAN_MARGIN screen pixels of slack past each
 * edge. When the viewport is wider than map + margin the axis is centred instead, so a
 * zoomed-out view can't be dragged off into empty space.
 */
export function clampCamera(camera: Camera, size: MapSize, viewport: Vec2): void {
  const rect = mapRectOf(size);
  const margin = PAN_MARGIN / camera.zoom;
  const halfW = viewport.x / 2 / camera.zoom;
  const halfH = viewport.y / 2 / camera.zoom;

  camera.pos.x = clampAxis(camera.pos.x, rect.left - margin + halfW, rect.right + margin - halfW);
  camera.pos.y = clampAxis(camera.pos.y, rect.top - margin + halfH, rect.bottom + margin - halfH);
}

// --- Private helpers ---

/** Centre when the allowed range has collapsed — i.e. the view is larger than the map. */
function clampAxis(value: number, min: number, max: number): number {
  if (min > max) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}

/**
 * Delta that slides the span `min..max` inside `lo..hi`.
 *
 * Always a whole number of grid steps, so anything already aligned stays aligned —
 * including the half-grid offset that rotated non-square gates sit on.
 */
function slideInside(min: number, max: number, lo: number, hi: number): number {
  if (min < lo) return Math.ceil((lo - min) / GRID_SIZE) * GRID_SIZE;
  if (max > hi) return -Math.ceil((max - hi) / GRID_SIZE) * GRID_SIZE;
  return 0;
}
