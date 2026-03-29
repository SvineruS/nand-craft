import { useEffect, useRef } from 'preact/hooks';
import { viewMode } from '../editorStore.ts';
import type { Camera } from '../../engine/camera.ts';
import { CanvasInput } from '../../engine/input.ts';

const GRID_SIZE = 32;
const BG_COLOR = '#181825';
const GRID_LINE_COLOR = '#252540';
const GRID_MAJOR_COLOR = '#313150';
const MAJOR_EVERY = 8;

function renderGrid(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, camera: Camera): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  // Resize backing buffer if needed
  const bw = Math.round(w * dpr);
  const bh = Math.round(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, w, h);

  // Camera transform
  ctx.save();
  ctx.translate(
    w / 2 - camera.pos.x * camera.zoom,
    h / 2 - camera.pos.y * camera.zoom,
  );
  ctx.scale(camera.zoom, camera.zoom);

  // Visible world bounds
  const vw = w / camera.zoom;
  const vh = h / camera.zoom;
  const left = camera.pos.x - vw / 2;
  const top = camera.pos.y - vh / 2;
  const right = camera.pos.x + vw / 2;
  const bottom = camera.pos.y + vh / 2;

  const startX = Math.floor(left / GRID_SIZE) * GRID_SIZE;
  const startY = Math.floor(top / GRID_SIZE) * GRID_SIZE;

  ctx.lineWidth = 1 / camera.zoom;

  // Minor grid lines
  ctx.strokeStyle = GRID_LINE_COLOR;
  ctx.beginPath();
  for (let gx = startX; gx <= right; gx += GRID_SIZE) {
    if (Math.round(gx / GRID_SIZE) % MAJOR_EVERY === 0) continue;
    ctx.moveTo(gx, top);
    ctx.lineTo(gx, bottom);
  }
  for (let gy = startY; gy <= bottom; gy += GRID_SIZE) {
    if (Math.round(gy / GRID_SIZE) % MAJOR_EVERY === 0) continue;
    ctx.moveTo(left, gy);
    ctx.lineTo(right, gy);
  }
  ctx.stroke();

  // Major grid lines
  const majorSize = GRID_SIZE * MAJOR_EVERY;
  const majorStartX = Math.floor(left / majorSize) * majorSize;
  const majorStartY = Math.floor(top / majorSize) * majorSize;
  ctx.strokeStyle = GRID_MAJOR_COLOR;
  ctx.lineWidth = 2 / camera.zoom;
  ctx.beginPath();
  for (let gx = majorStartX; gx <= right; gx += majorSize) {
    ctx.moveTo(gx, top);
    ctx.lineTo(gx, bottom);
  }
  for (let gy = majorStartY; gy <= bottom; gy += majorSize) {
    ctx.moveTo(left, gy);
    ctx.lineTo(right, gy);
  }
  ctx.stroke();

  ctx.restore();
  ctx.restore();
}

export function FactoryScreen() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current!;
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' });
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d')!;
    const camera: Camera = { pos: { x: 0, y: 0 }, zoom: 1 };
    let dirty = true;
    let animId = 0;

    const input = new CanvasInput(canvas, {}, {
      getCamera: () => camera,
      onCameraChange() { dirty = true; },
      shouldPan: (e) => e.button === 0 || e.button === 1,
    });
    input.attach();

    const tick = () => {
      if (dirty) {
        renderGrid(canvas, ctx, camera);
        dirty = false;
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);

    const onResize = () => { dirty = true; };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      input.detach();
      window.removeEventListener('resize', onResize);
      container.removeChild(canvas);
    };
  }, []);

  return (
    <div class="factory-screen">
      <div class="factory-toolbar">
        <button class="toolbar-btn" onClick={() => { viewMode.value = 'mainMenu'; }}>Menu</button>
        <span class="toolbar-level-name">Factory</span>
        <div class="toolbar-spacer" />
      </div>
      <div class="factory-canvas" ref={containerRef} />
    </div>
  );
}
