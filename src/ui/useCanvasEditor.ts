import { useEffect, useRef } from 'preact/hooks';
import { effect } from '@preact/signals';
import type { RefObject } from 'preact';
import type { EditorState } from '../circuit-builder/editor/EditorState.ts';
import { Renderer } from '../circuit-builder/editor/render/Renderer.ts';
import { EditorFrameLoop } from '../circuit-builder/editor/render/EditorFrameLoop.ts';
import { backgroundGrid, paletteId } from './editorStore.ts';
import { randomOrnament } from '../circuit-builder/editor/render/backgroundPattern.ts';

/** Anything with a DOM listener lifecycle — InputHandler and CanvasInput both qualify. */
export interface AttachableInput {
  attach(): void;
  detach(): void;
}

export interface CanvasEditorOptions {
  getState: () => EditorState;
  /** Builds the input layer for this canvas. Omit for a display-only surface. */
  createInput?: (canvas: HTMLCanvasElement) => AttachableInput;
  /** Topology changed: rebuild derived state, then re-render. */
  onCircuitDirty?: () => void;
  /** Values changed but topology did not: re-tick only. */
  onValueDirty?: () => void;
  /** UI-visible state changed: let Preact re-render. */
  onStateChanged?: () => void;
  /** Extra teardown, run before the canvas is detached. */
  onTeardown?: () => void;
}

/**
 * Mount a canvas with a renderer, a frame loop, and an optional input layer.
 *
 * All four canvas screens used to hand-roll this: create the element, style it, construct
 * a Renderer, start the loop, construct an InputHandler, attach, listen for resize, then
 * tear all of it down in the right order. Returns the ref to attach to the container.
 */
export function useCanvasEditor(options: CanvasEditorOptions): RefObject<HTMLDivElement> {
  const containerRef = useRef<HTMLDivElement>(null);
  // Rolled once per canvas rather than per render, so the pattern doesn't change under you.
  const ornament = useRef(randomOrnament());

  // The effect runs once, but the callbacks it invokes are re-created on every render, so
  // it reaches them through a ref rather than capturing the first ones.
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const container = containerRef.current!;

    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' });
    container.appendChild(canvas);

    const renderer = new Renderer(canvas);
    const loop = new EditorFrameLoop(renderer, {
      getState: () => latest.current.getState(),
      onCircuitDirty: () => latest.current.onCircuitDirty?.(),
      onValueDirty: () => latest.current.onValueDirty?.(),
      onStateChanged: () => latest.current.onStateChanged?.(),
    });
    loop.start();

    // Runs once immediately, then again whenever the grid or palette setting changes. The
    // palette is read for its dirty side effect: scene entries carry baked-in colours, so a
    // palette swap needs a scene rebuild, not just a repaint.
    const stopWatchingBackground = effect(() => {
      paletteId.value;
      renderer.setBackgroundStyle({ grid: backgroundGrid.value, ornament: ornament.current });
      latest.current.getState().renderDirty = true;
    });

    const input = latest.current.createInput?.(canvas);
    input?.attach();

    // Mark dirty so the first frame renders
    latest.current.getState().renderDirty = true;

    const onResize = () => { latest.current.getState().renderDirty = true; };
    window.addEventListener('resize', onResize);

    return () => {
      latest.current.onTeardown?.();
      stopWatchingBackground();
      loop.stop();
      input?.detach();
      window.removeEventListener('resize', onResize);
      container.removeChild(canvas);
    };
  }, []);

  return containerRef;
}
