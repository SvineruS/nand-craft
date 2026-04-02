import type { Camera } from '../engine/camera.ts';

/** Persistent factory state — survives screen switches. */
export const factoryState: { camera: Camera; dirty: boolean } = {
  camera: { pos: { x: 0, y: 0 }, zoom: 1 },
  dirty: true,
};
