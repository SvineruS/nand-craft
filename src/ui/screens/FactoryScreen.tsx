import { useEffect, useRef } from 'preact/hooks';
import { viewMode } from '../editorStore.ts';
import type { Camera } from '../../engine/camera.ts';
import { CanvasInput } from '../../engine/input.ts';
import { createTerrainRenderer } from '../../factory/terrainShader.ts';

const GRID_SIZE = 64;

export function FactoryScreen() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current!;
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' });
    container.appendChild(canvas);

    const terrain = createTerrainRenderer(canvas, GRID_SIZE);
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
        terrain.render(camera);
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
      terrain.destroy();
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
