import type { Vec2 as V } from '../../types.ts';
import { snapToGrid } from './geometry.ts';

export type Vec2 = V;

// eslint-disable-next-line @typescript-eslint/no-redeclare
export const Vec2 = {
  add: (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y }),
  scale: (v: V, s: number): V => ({ x: v.x * s, y: v.y * s }),
  dist: (a: V, b: V): number => Math.hypot(a.x - b.x, a.y - b.y),
  copy: (v: V): V => ({ x: v.x, y: v.y }),
  rotateCW: (v: V): V => ({ x: -v.y, y: v.x }),
  snap: (v: V, offset = 0): V => ({ x: snapToGrid(v.x, offset), y: snapToGrid(v.y, offset) }),
  near: (a: V, b: V, tol: number): boolean => Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol,
  equal: (a: V, b: V): boolean => a.x === b.x && a.y === b.y,
  avg: (points: V[]): V => Vec2.scale(points.reduce((a, b) => Vec2.add(a, b)), 1 / points.length),
  rotateAround: (v: V, center: V, degrees: number): V => {
    const rad = (degrees * Math.PI) / 180;
    const d: V = { x: v.x - center.x, y: v.y - center.y };
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return { x: center.x + d.x * cos - d.y * sin, y: center.y + d.x * sin + d.y * cos };
  },
};

/**
 * Compute the corner point of an L-shaped route from A to B.
 * Routes cardinal-first (horizontal or vertical), then 45° diagonal.
 * Returns null if A→B is axis-aligned or perfectly diagonal (straight line).
 */
export function routeCorner(a: V, b: V): V | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) return null;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  return adx > ady
    ? { x: a.x + (adx - ady) * Math.sign(dx), y: a.y }
    : { x: a.x, y: a.y + (ady - adx) * Math.sign(dy) };
}

/** Point at fraction t (0..1) along the routed path from A to B. */
export function routePointAt(a: V, b: V, t: number): V {
  const c = routeCorner(a, b);
  if (!c) return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  const s1 = Vec2.dist(a, c);
  const s2 = Vec2.dist(c, b);
  const d = t * (s1 + s2);
  if (d <= s1) {
    const f = s1 > 0 ? d / s1 : 0;
    return { x: a.x + (c.x - a.x) * f, y: a.y + (c.y - a.y) * f };
  }
  const f = s2 > 0 ? (d - s1) / s2 : 0;
  return { x: c.x + (b.x - c.x) * f, y: c.y + (b.y - c.y) * f };
}

/** Total length of the routed path from A to B. */
export function routeLength(a: V, b: V): number {
  const c = routeCorner(a, b);
  if (!c) return Vec2.dist(a, b);
  return Vec2.dist(a, c) + Vec2.dist(c, b);
}
