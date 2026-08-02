import type { Vec2 } from '../circuit-builder/editor/types.ts';
import type { Camera } from './camera.ts';
import { screenToWorld, applyZoom, applyPan } from './camera.ts';

// ---------------------------------------------------------------------------
// Event types — enriched wrappers around DOM events
// ---------------------------------------------------------------------------

export interface PointerEvent {
  world: Vec2;
  screen: Vec2;
  raw: MouseEvent;
  button: number;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

export interface WheelEvent {
  world: Vec2;
  screen: Vec2;
  raw: globalThis.WheelEvent;
  deltaY: number;
}

export interface KeyEvent {
  raw: KeyboardEvent;
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

export interface DragDropEvent {
  world: Vec2;
  screen: Vec2;
  raw: globalThis.DragEvent;
  dataTransfer: DataTransfer | null;
}

// ---------------------------------------------------------------------------
// Handler & option interfaces
// ---------------------------------------------------------------------------

export interface CanvasInputHandlers {
  onPointerDown?(e: PointerEvent): void;
  onPointerMove?(e: PointerEvent): void;
  onPointerUp?(e: PointerEvent): void;
  onWheel?(e: WheelEvent): void;
  onKeyDown?(e: KeyEvent): void;
  onContextMenu?(e: PointerEvent): void;
  onDragOver?(e: DragDropEvent): void;
  onDrop?(e: DragDropEvent): void;
  onDragLeave?(e: DragDropEvent): void;
}

export interface CanvasInputOptions {
  getCamera(): Camera;
  onCameraChange?(): void;
  /** Runs after every pan and zoom, so the camera can be held over a bounded world. */
  clampCamera?(camera: Camera, viewportSize: Vec2): void;
  shouldPan?(e: PointerEvent): boolean;
  zoomMin?: number;
  zoomMax?: number;
  zoomFactor?: number;
}

// ---------------------------------------------------------------------------
// CanvasInput
// ---------------------------------------------------------------------------

export class CanvasInput {
  private canvas: HTMLCanvasElement;
  private handlers: CanvasInputHandlers;
  private getCamera: () => Camera;
  private onCameraChange?: () => void;
  private clampCamera?: (camera: Camera, viewportSize: Vec2) => void;
  private shouldPan: (e: PointerEvent) => boolean;
  private zoomMin: number;
  private zoomMax: number;
  private zoomFactor: number;

  private panning = false;
  private panLast: Vec2 = { x: 0, y: 0 };

  /**
   * Whether a button is down. While it is, moves and the release are followed on `window`
   * rather than on the canvas, so a drag that wanders over the sidebar — or off the page —
   * still ends where the player let go.
   */
  private pressed = false;

  /**
   * The last move we actually saw. A release outside the browser is never delivered, so the
   * drag is closed at the position it was last drawn at rather than wherever the pointer
   * happens to re-enter.
   */
  private lastMove: MouseEvent | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    handlers: CanvasInputHandlers,
    opts: CanvasInputOptions,
  ) {
    this.canvas = canvas;
    this.handlers = handlers;
    this.getCamera = opts.getCamera;
    this.onCameraChange = opts.onCameraChange;
    this.clampCamera = opts.clampCamera;
    this.shouldPan = opts.shouldPan ?? ((e) => e.button === 1);
    this.zoomMin = opts.zoomMin ?? 0.25;
    this.zoomMax = opts.zoomMax ?? 4;
    this.zoomFactor = opts.zoomFactor ?? 1.1;
  }

  attach(): void {
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    window.addEventListener('keydown', this.handleKeyDown);
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
    this.canvas.addEventListener('dragover', this.handleDragOver);
    this.canvas.addEventListener('drop', this.handleDrop);
    this.canvas.addEventListener('dragleave', this.handleDragLeave);
  }

  detach(): void {
    this.endPress();
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('keydown', this.handleKeyDown);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    this.canvas.removeEventListener('dragover', this.handleDragOver);
    this.canvas.removeEventListener('drop', this.handleDrop);
    this.canvas.removeEventListener('dragleave', this.handleDragLeave);
  }

  // --- Event handlers ---

  private handleMouseDown = (e: MouseEvent): void => {
    const p = this.pointer(e);
    this.beginPress();
    if (this.shouldPan(p)) {
      this.panning = true;
      this.panLast = p.screen;
      return;
    }
    this.handlers.onPointerDown?.(p);
  };

  private handleMouseMove = (e: MouseEvent): void => {
    // A release outside the browser never reaches us. The first move back in reports no
    // button held, which is the only sign we get that the drag is over.
    if (this.pressed && e.buttons === 0) {
      this.handleMouseUp(this.lastMove ?? e);
      return;
    }
    this.lastMove = e;

    if (this.panning) {
      const current = this.screenPos(e);
      applyPan(this.getCamera(), { x: current.x - this.panLast.x, y: current.y - this.panLast.y });
      this.panLast = current;
      this.clampToWorld();
      this.onCameraChange?.();
      return;
    }
    this.handlers.onPointerMove?.(this.pointer(e));
  };

  private handleMouseUp = (e: MouseEvent): void => {
    this.endPress();
    if (this.panning) {
      this.panning = false;
      return;
    }
    this.handlers.onPointerUp?.(this.pointer(e));
  };

  /**
   * Follow the pointer on `window` for the rest of the press.
   *
   * The canvas listener is swapped out rather than kept alongside, so a move over the canvas
   * is not delivered twice.
   */
  private beginPress(): void {
    if (this.pressed) return;
    this.pressed = true;
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp);
  }

  private endPress(): void {
    if (!this.pressed) return;
    this.pressed = false;
    this.lastMove = null;
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
  }

  private handleWheel = (e: globalThis.WheelEvent): void => {
    e.preventDefault();
    const screen = this.screenPos(e);
    const factor = e.deltaY < 0 ? this.zoomFactor : 1 / this.zoomFactor;
    applyZoom(
      this.getCamera(), screen, factor,
      this.canvas.clientWidth, this.canvas.clientHeight,
      this.zoomMin, this.zoomMax,
    );
    this.clampToWorld();
    this.onCameraChange?.();
    this.handlers.onWheel?.({
      world: this.toWorld(screen), screen, raw: e, deltaY: e.deltaY,
    });
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      || (e.target instanceof HTMLElement && e.target.isContentEditable)) return;
    this.handlers.onKeyDown?.({
      raw: e, key: e.key,
      ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey,
    });
  };

  private handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    this.handlers.onContextMenu?.(this.pointer(e));
  };

  private handleDragOver = (e: globalThis.DragEvent): void => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    this.handlers.onDragOver?.(this.dragEvent(e));
  };

  private handleDrop = (e: globalThis.DragEvent): void => {
    e.preventDefault();
    this.handlers.onDrop?.(this.dragEvent(e));
  };

  private handleDragLeave = (e: globalThis.DragEvent): void => {
    this.handlers.onDragLeave?.(this.dragEvent(e));
  };

  // --- Helpers ---

  private clampToWorld(): void {
    this.clampCamera?.(this.getCamera(), {
      x: this.canvas.clientWidth,
      y: this.canvas.clientHeight,
    });
  }

  toWorld(screen: Vec2): Vec2 {
    const cam = this.getCamera();
    return screenToWorld(screen, cam, this.canvas.clientWidth, this.canvas.clientHeight);
  }

  /**
   * Position within the canvas, in CSS pixels.
   *
   * Derived from the canvas rect rather than `offsetX`/`offsetY`, which are relative to
   * whatever element the event hit — during a drag that can be the sidebar, a window, or
   * anything else the pointer crosses.
   */
  private screenPos(e: MouseEvent): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private pointer(e: MouseEvent): PointerEvent {
    const screen = this.screenPos(e);
    return {
      world: this.toWorld(screen),
      screen,
      raw: e,
      button: e.button,
      ctrl: e.ctrlKey || e.metaKey,
      shift: e.shiftKey,
      alt: e.altKey,
    };
  }

  private dragEvent(e: globalThis.DragEvent): DragDropEvent {
    const screen = this.screenPos(e);
    return { world: this.toWorld(screen), screen, raw: e, dataTransfer: e.dataTransfer };
  }


}
