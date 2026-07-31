import {
  COLORS, GRID_DOT_RADIUS, GRID_SIZE, MAJOR_GRID_DOT_RADIUS, MAJOR_GRID_EVERY,
  OUTSIDE_MAP_PATTERN_ALPHA,
} from '../consts.ts';

/**
 * The canvas background, in two independent layers:
 *
 * - a *grid* — dots, crosses or lines — which is functional: it shows where things snap,
 *   so it stays legible and always draws on top;
 * - an *ornament* — waves, hexagons and friends — which is decorative, drawn underneath at
 *   low alpha so it never competes with wires.
 *
 * Both layers tile on GRID_SIZE multiples, so an ornament lines up with the grid instead of
 * drifting against it.
 */
export type GridPatternId = 'dots' | 'crosses' | 'lines' | 'plain';
export type OrnamentPatternId = 'none' | 'waves' | 'hexagons' | 'triangles' | 'scales' | 'checker';

export interface BackgroundStyle {
  grid: GridPatternId;
  ornament: OrnamentPatternId;
}

export const DEFAULT_BACKGROUND_STYLE: BackgroundStyle = { grid: 'crosses', ornament: 'none' };

export const GRID_PATTERNS: { id: GridPatternId; label: string }[] = [
  { id: 'dots', label: 'Dots' },
  { id: 'crosses', label: 'Crosses' },
  { id: 'lines', label: 'Lines' },
  { id: 'plain', label: 'None' },
];

export const ORNAMENT_PATTERNS: { id: OrnamentPatternId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'waves', label: 'Waves' },
  { id: 'hexagons', label: 'Hexagons' },
  { id: 'triangles', label: 'Triangles' },
  { id: 'scales', label: 'Scales' },
  { id: 'checker', label: 'Checker' },
];

/** World-space rect to fill. */
export interface PatternBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function isGridPatternId(value: string): value is GridPatternId {
  return GRID_PATTERNS.some(p => p.id === value);
}

export function isOrnamentPatternId(value: string): value is OrnamentPatternId {
  return ORNAMENT_PATTERNS.some(p => p.id === value);
}

export interface BackgroundDrawOptions {
  style: BackgroundStyle;
  /** World rect currently on screen. */
  viewport: PatternBounds;
  /** Buildable area. Outside it the pattern is dimmed and veiled. */
  map: PatternBounds;
  /** Passed so line work keeps a constant on-screen thickness at any zoom. */
  zoom: number;
}

/**
 * Paint the background in world space — the caller has already applied the camera
 * transform. Inside the map the pattern is drawn at full strength; outside it is veiled
 * and faded, so the buildable area reads as the place where things belong.
 */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  { style, viewport, map, zoom }: BackgroundDrawOptions,
): void {
  const inside = intersect(viewport, map);
  const reachesOutside = viewport.left < map.left || viewport.top < map.top
    || viewport.right > map.right || viewport.bottom > map.bottom;

  if (reachesOutside) {
    ctx.save();
    clipOutside(ctx, viewport, map);
    ctx.fillStyle = COLORS.outsideMap;
    ctx.fillRect(
      viewport.left, viewport.top,
      viewport.right - viewport.left, viewport.bottom - viewport.top,
    );
    ctx.globalAlpha = OUTSIDE_MAP_PATTERN_ALPHA;
    drawLayers(ctx, style, viewport, zoom);
    ctx.restore();
  }

  if (!isEmpty(inside)) {
    ctx.save();
    clipTo(ctx, inside);
    drawLayers(ctx, style, inside, zoom);
    ctx.restore();

    ctx.strokeStyle = COLORS.mapBorder;
    ctx.lineWidth = 2 / zoom;
    ctx.strokeRect(map.left, map.top, map.right - map.left, map.bottom - map.top);
  }
}

function drawLayers(
  ctx: CanvasRenderingContext2D,
  style: BackgroundStyle,
  bounds: PatternBounds,
  zoom: number,
): void {
  drawOrnament(ctx, style.ornament, bounds, zoom);
  drawGrid(ctx, style.grid, bounds, zoom);
}

const MAJOR_STEP = GRID_SIZE * MAJOR_GRID_EVERY;
const CROSS_ARM = 2.5;
/**
 * Ornaments sit behind the grid, fainter than it even inside the map — they are texture,
 * and the grid is information.
 */
const ORNAMENT_ALPHA = 0.4;
const WAVE_AMPLITUDE = GRID_SIZE;
/**
 * Hexagon half-extents. A *regular* hexagon can't have both its width and its row pitch on
 * the grid — one of them ends up scaled by √3 — so these are grid-sized instead: every
 * vertex lands on a grid point, at the cost of the hex being a touch wide.
 */
const HEX_HALF_WIDTH = GRID_SIZE * 2;
const HEX_SIDE_HALF = GRID_SIZE;
const SCALE_RADIUS = GRID_SIZE * 2;

// --- Grid layer ---

function drawGrid(
  ctx: CanvasRenderingContext2D,
  grid: GridPatternId,
  bounds: PatternBounds,
  zoom: number,
): void {
  switch (grid) {
    case 'dots': return drawDots(ctx, bounds);
    case 'crosses': return drawCrosses(ctx, bounds, zoom);
    case 'lines': return drawLines(ctx, bounds, zoom);
    case 'plain': return;
  }
}

function drawDots(ctx: CanvasRenderingContext2D, bounds: PatternBounds): void {
  ctx.fillStyle = COLORS.gridDot;
  for (let gx = firstLine(bounds.left); gx <= bounds.right; gx += GRID_SIZE) {
    for (let gy = firstLine(bounds.top); gy <= bounds.bottom; gy += GRID_SIZE) {
      const isMajor = isMajorLine(gx) || isMajorLine(gy);
      ctx.beginPath();
      ctx.arc(gx, gy, isMajor ? MAJOR_GRID_DOT_RADIUS : GRID_DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCrosses(ctx: CanvasRenderingContext2D, bounds: PatternBounds, zoom: number): void {
  ctx.strokeStyle = COLORS.gridDot;
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath();
  for (let gx = firstLine(bounds.left); gx <= bounds.right; gx += GRID_SIZE) {
    for (let gy = firstLine(bounds.top); gy <= bounds.bottom; gy += GRID_SIZE) {
      const arm = isMajorLine(gx) && isMajorLine(gy) ? CROSS_ARM * 2 : CROSS_ARM;
      ctx.moveTo(gx - arm, gy);
      ctx.lineTo(gx + arm, gy);
      ctx.moveTo(gx, gy - arm);
      ctx.lineTo(gx, gy + arm);
    }
  }
  ctx.stroke();
}

function drawLines(ctx: CanvasRenderingContext2D, bounds: PatternBounds, zoom: number): void {
  // Minor and major lines are two passes so each colour is set once rather than per line.
  for (const major of [false, true]) {
    ctx.strokeStyle = major ? COLORS.gridLineMajor : COLORS.gridLine;
    ctx.lineWidth = (major ? 1.4 : 1) / zoom;
    ctx.beginPath();
    for (let gx = firstLine(bounds.left); gx <= bounds.right; gx += GRID_SIZE) {
      if (isMajorLine(gx) !== major) continue;
      ctx.moveTo(gx, bounds.top);
      ctx.lineTo(gx, bounds.bottom);
    }
    for (let gy = firstLine(bounds.top); gy <= bounds.bottom; gy += GRID_SIZE) {
      if (isMajorLine(gy) !== major) continue;
      ctx.moveTo(bounds.left, gy);
      ctx.lineTo(bounds.right, gy);
    }
    ctx.stroke();
  }
}

// --- Ornament layer ---

function drawOrnament(
  ctx: CanvasRenderingContext2D,
  ornament: OrnamentPatternId,
  bounds: PatternBounds,
  zoom: number,
): void {
  if (ornament === 'none') return;

  ctx.save();
  // Multiplied, not assigned: the caller may already have dimmed the whole layer for the
  // area outside the map, and that dimming has to survive.
  ctx.globalAlpha *= ORNAMENT_ALPHA;
  ctx.strokeStyle = COLORS.ornament;
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath();
  switch (ornament) {
    case 'waves': traceWaves(ctx, bounds); break;
    case 'hexagons': traceHexagons(ctx, bounds); break;
    case 'triangles': traceTriangles(ctx, bounds); break;
    case 'scales': traceScales(ctx, bounds); break;
    case 'checker': fillChecker(ctx, bounds); break;
  }
  if (ornament !== 'checker') ctx.stroke();
  ctx.restore();
}

/** Rows of sine-ish waves, one full period every two major cells. */
function traceWaves(ctx: CanvasRenderingContext2D, bounds: PatternBounds): void {
  const halfPeriod = MAJOR_STEP;
  const startX = Math.floor(bounds.left / (halfPeriod * 2)) * halfPeriod * 2;

  for (let y = firstMultiple(bounds.top, MAJOR_STEP); y <= bounds.bottom; y += MAJOR_STEP) {
    ctx.moveTo(startX, y);
    // A quadratic per half period, with the control point at twice the amplitude so the
    // curve's midpoint lands exactly on the crest — close enough to a sine to read as one,
    // and a handful of curves per row instead of hundreds of sampled points.
    let up = true;
    for (let x = startX; x <= bounds.right; x += halfPeriod) {
      const peak = up ? y - WAVE_AMPLITUDE * 2 : y + WAVE_AMPLITUDE * 2;
      ctx.quadraticCurveTo(x + halfPeriod / 2, peak, x + halfPeriod, y);
      up = !up;
    }
  }
}

/** Pointy-top hex lattice, pitched 4×3 grid cells so every vertex is on a grid point. */
function traceHexagons(ctx: CanvasRenderingContext2D, bounds: PatternBounds): void {
  const colStep = HEX_HALF_WIDTH * 2;
  const rowStep = HEX_SIDE_HALF * 3;
  const firstRow = Math.floor(bounds.top / rowStep) - 1;
  const lastRow = Math.ceil(bounds.bottom / rowStep);

  for (let row = firstRow; row <= lastRow; row++) {
    const cy = row * rowStep;
    // Every other row is offset by half a hex, which is what interlocks the lattice.
    const offset = Math.abs(row % 2) === 1 ? HEX_HALF_WIDTH : 0;
    const firstCol = Math.floor((bounds.left - offset) / colStep) - 1;
    const lastCol = Math.ceil((bounds.right - offset) / colStep);
    for (let col = firstCol; col <= lastCol; col++) {
      traceHexagon(ctx, col * colStep + offset, cy);
    }
  }
}

function traceHexagon(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const w = HEX_HALF_WIDTH;
  const s = HEX_SIDE_HALF;
  ctx.moveTo(cx, cy - s * 2);
  ctx.lineTo(cx + w, cy - s);
  ctx.lineTo(cx + w, cy + s);
  ctx.lineTo(cx, cy + s * 2);
  ctx.lineTo(cx - w, cy + s);
  ctx.lineTo(cx - w, cy - s);
  ctx.closePath();
}

/**
 * Horizontal lines crossed by both 45° diagonal families — a triangular tiling on the grid.
 *
 * Each diagonal is identified by its intercept (x − y, or x + y) snapped to MAJOR_STEP, not
 * by a sweep across the visible width: an intercept is a property of the lattice, so the
 * pattern stays put when the viewport pans, zooms or resizes.
 */
function traceTriangles(ctx: CanvasRenderingContext2D, bounds: PatternBounds): void {
  const { left, top, right, bottom } = bounds;

  for (let y = firstMultiple(top, MAJOR_STEP); y <= bottom; y += MAJOR_STEP) {
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  // x = y + c, visible while c is within the box's diagonal spread.
  for (let c = firstMultiple(left - bottom, MAJOR_STEP); c <= right - top; c += MAJOR_STEP) {
    ctx.moveTo(top + c, top);
    ctx.lineTo(bottom + c, bottom);
  }
  // x = c - y, the mirrored family.
  for (let c = firstMultiple(left + top, MAJOR_STEP); c <= right + bottom; c += MAJOR_STEP) {
    ctx.moveTo(c - top, top);
    ctx.lineTo(c - bottom, bottom);
  }
}

/** Overlapping half-circles, fish-scale style. */
function traceScales(ctx: CanvasRenderingContext2D, bounds: PatternBounds): void {
  const step = SCALE_RADIUS * 2;
  const firstRow = Math.floor(bounds.top / SCALE_RADIUS);
  const lastRow = Math.ceil(bounds.bottom / SCALE_RADIUS);

  for (let row = firstRow; row <= lastRow; row++) {
    const cy = row * SCALE_RADIUS;
    const offset = Math.abs(row % 2) === 1 ? SCALE_RADIUS : 0;
    const firstCol = Math.floor((bounds.left - offset) / step) - 1;
    const lastCol = Math.ceil((bounds.right - offset) / step);
    for (let col = firstCol; col <= lastCol; col++) {
      const cx = col * step + offset;
      ctx.moveTo(cx - SCALE_RADIUS, cy);
      ctx.arc(cx, cy, SCALE_RADIUS, Math.PI, 0, true);
    }
  }
}

/** Alternating major cells, tinted rather than stroked. */
function fillChecker(ctx: CanvasRenderingContext2D, bounds: PatternBounds): void {
  const startX = Math.floor(bounds.left / MAJOR_STEP) * MAJOR_STEP;
  const startY = Math.floor(bounds.top / MAJOR_STEP) * MAJOR_STEP;

  ctx.fillStyle = COLORS.ornamentTile;
  for (let gx = startX; gx <= bounds.right; gx += MAJOR_STEP) {
    for (let gy = startY; gy <= bounds.bottom; gy += MAJOR_STEP) {
      const cell = gx / MAJOR_STEP + gy / MAJOR_STEP;
      // Cells can be negative, so `% 2` alone would flip parity across the origin.
      if (Math.abs(cell % 2) === 1) continue;
      ctx.fillRect(gx, gy, MAJOR_STEP, MAJOR_STEP);
    }
  }
}

// --- Region helpers ---

function intersect(a: PatternBounds, b: PatternBounds): PatternBounds {
  return {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
}

function isEmpty(rect: PatternBounds): boolean {
  return rect.right <= rect.left || rect.bottom <= rect.top;
}

function clipTo(ctx: CanvasRenderingContext2D, rect: PatternBounds): void {
  ctx.beginPath();
  ctx.rect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
  ctx.clip();
}

/** Clip to the viewport minus the map: two rects, wound as a hole by the even-odd rule. */
function clipOutside(
  ctx: CanvasRenderingContext2D,
  viewport: PatternBounds,
  map: PatternBounds,
): void {
  ctx.beginPath();
  ctx.rect(viewport.left, viewport.top,
    viewport.right - viewport.left, viewport.bottom - viewport.top);
  ctx.rect(map.left, map.top, map.right - map.left, map.bottom - map.top);
  ctx.clip('evenodd');
}

// --- Lattice helpers ---

/** First grid line at or before `worldCoord`. */
function firstLine(worldCoord: number): number {
  return firstMultiple(worldCoord, GRID_SIZE);
}

function firstMultiple(worldCoord: number, step: number): number {
  return Math.floor(worldCoord / step) * step;
}

function isMajorLine(worldCoord: number): boolean {
  return worldCoord % MAJOR_STEP === 0;
}
