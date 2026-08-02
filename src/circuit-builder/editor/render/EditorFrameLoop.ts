import type { EditorState } from '../EditorState.ts';
import type { RenderScene } from './renderScene.ts';
import { buildScene } from './buildScene.ts';
import type { Renderer } from './Renderer.ts';

export interface FrameLoopHooks {
  getState: () => EditorState;
  /** Topology changed: rebuild derived state (nets, program, tests), then re-tick. */
  onCircuitDirty?: () => void;
  /** Values changed but topology did not: re-tick only. */
  onValueDirty?: () => void;
  /** UI-visible state changed: let Preact re-render. */
  onStateChanged?: () => void;
}

/**
 * Drives one canvas: simulation first, then scene, then draw.
 *
 * This ordering used to live inside Renderer.startLoop, which meant the render layer
 * decided when the circuit was rebuilt and re-ticked and when Preact re-rendered. Keeping
 * it here leaves Renderer as a pure scene painter and puts the frame's phases in one
 * readable place.
 */
export class EditorFrameLoop {
  private renderer: Renderer;
  private hooks: FrameLoopHooks;
  private animationId: number | null = null;
  private lastTime = 0;
  private scene: RenderScene | null = null;
  /** Last snapshot handed to Preact, so hovering does not trigger re-renders. */
  private notifiedUi: UiSnapshot | null = null;

  constructor(renderer: Renderer, hooks: FrameLoopHooks) {
    this.renderer = renderer;
    this.hooks = hooks;
  }

  start(): void {
    this.lastTime = performance.now();
    const frame = (time: number) => {
      this.step((time - this.lastTime) / 1000);
      this.lastTime = time;
      this.animationId = requestAnimationFrame(frame);
    };
    this.animationId = requestAnimationFrame(frame);
  }

  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private step(dtSeconds: number): void {
    const state = this.hooks.getState();
    this.renderer.advanceAnimation(dtSeconds);
    this.renderer.syncCanvasSize();

    // 1. Simulation. circuitDirty implies a rebuild, which re-ticks on its own.
    if (state.circuitDirty) this.hooks.onCircuitDirty?.();
    if (state.valueDirty) {
      this.hooks.onValueDirty?.();
      state.valueDirty = false;
    }

    // 2. Scene, rebuilt only when something visible changed.
    if (state.renderDirty || state.circuitDirty) {
      this.scene = buildScene(state, this.renderer.viewport(state.camera));
      // Only notify Preact for UI-relevant changes, not on every hover or mousemove
      const ui = uiSnapshot(state);
      if (!sameUi(this.notifiedUi, ui) || state.circuitDirty) {
        this.notifiedUi = ui;
        this.hooks.onStateChanged?.();
      }
      state.renderDirty = false;
      state.circuitDirty = false;
    }

    // 3. Draw. The canvas is cleared every frame, so this repeats even when unchanged.
    if (this.scene) this.renderer.render(this.scene, state.camera);
  }
}

/**
 * The parts of EditorState the Preact panels read: the selection (PropertiesPanel), the wire
 * colour (the toolbar swatches) and the recent gate types (the Sidebar).
 *
 * All three are replaced rather than mutated, so identity comparison is enough. Anything a
 * panel starts reading has to be added here, or that panel updates only when one of these
 * happens to change — which is how picking a wire colour with Q used to leave the swatches
 * showing the old one until the next click moved the selection.
 */
interface UiSnapshot {
  selection: unknown;
  wireColor: string;
  recentGateTypes: unknown;
}

function uiSnapshot(state: EditorState): UiSnapshot {
  return {
    selection: state.selection,
    wireColor: state.wireColor,
    recentGateTypes: state.recentGateTypes,
  };
}

function sameUi(a: UiSnapshot | null, b: UiSnapshot): boolean {
  return a !== null
    && a.selection === b.selection
    && a.wireColor === b.wireColor
    && a.recentGateTypes === b.recentGateTypes;
}
