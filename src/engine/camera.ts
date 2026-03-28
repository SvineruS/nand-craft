import type { Vec2 } from '../types.ts';

export interface Camera {
  pos: Vec2;
  zoom: number;
}

export function screenToWorld(
  screen: Vec2, camera: Camera, viewportW: number, viewportH: number,
): Vec2 {
  return {
    x: (screen.x - viewportW / 2) / camera.zoom + camera.pos.x,
    y: (screen.y - viewportH / 2) / camera.zoom + camera.pos.y,
  };
}

export function worldToScreen(
  world: Vec2, camera: Camera, viewportW: number, viewportH: number,
): Vec2 {
  return {
    x: (world.x - camera.pos.x) * camera.zoom + viewportW / 2,
    y: (world.y - camera.pos.y) * camera.zoom + viewportH / 2,
  };
}

export function applyZoom(
  camera: Camera, screenPoint: Vec2, factor: number,
  viewportW: number, viewportH: number, minZoom: number, maxZoom: number,
): void {
  const before = screenToWorld(screenPoint, camera, viewportW, viewportH);
  camera.zoom = Math.min(maxZoom, Math.max(minZoom, camera.zoom * factor));
  const after = screenToWorld(screenPoint, camera, viewportW, viewportH);
  camera.pos.x += before.x - after.x;
  camera.pos.y += before.y - after.y;
}

export function applyPan(camera: Camera, screenDelta: Vec2): void {
  camera.pos.x -= screenDelta.x / camera.zoom;
  camera.pos.y -= screenDelta.y / camera.zoom;
}
