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
