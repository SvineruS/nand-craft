import type { Camera } from '../engine/camera.ts';
import VERT from './shaders/terrain.vert.glsl?raw';
import FRAG from './shaders/terrain.frag.glsl?raw';
import { createProgram } from "./webGlHelper.ts";


const GRID_SIZE = 32;


// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

export interface TerrainRenderer {
  render(camera: Camera): void;
  resize(): void;
  destroy(): void;
}

export function createTerrainRenderer(canvas: HTMLCanvasElement): TerrainRenderer {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false })!;
  if (!gl) throw new Error('WebGL2 not supported');

  const program = createProgram(gl, VERT, FRAG);

  // Full-screen quad (two triangles)
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  // prettier-ignore
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1,  -1, 1,
    -1,  1,  1, -1,   1, 1,
  ]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // Uniform locations
  const uCamera   = gl.getUniformLocation(program, 'u_camera')!;
  const uZoom     = gl.getUniformLocation(program, 'u_zoom')!;
  const uViewport = gl.getUniformLocation(program, 'u_viewport')!;
  const uGridSize = gl.getUniformLocation(program, 'u_gridSize')!;

  function syncSize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  return {
    render(camera: Camera): void {
      syncSize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);

      gl.uniform2f(uCamera, camera.pos.x, camera.pos.y);
      gl.uniform1f(uZoom, camera.zoom);
      gl.uniform2f(uViewport, canvas.clientWidth, canvas.clientHeight);
      gl.uniform1f(uGridSize, GRID_SIZE);

      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
    },

    resize(): void {
      syncSize();
    },

    destroy(): void {
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    },
  };
}
