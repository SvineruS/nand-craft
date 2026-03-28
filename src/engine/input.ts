import type { Vec2 } from '../types.ts';
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
  private shouldPan: (e: PointerEvent) => boolean;
  private zoomMin: number;
  private zoomMax: number;
  private zoomFactor: number;

  private panning = false;
  private panLast: Vec2 = { x: 0, y: 0 };

  // Bound listeners
  private _mouseDown: (e: MouseEvent) => void;
  private _mouseMove: (e: MouseEvent) => void;
  private _mouseUp: (e: MouseEvent) => void;
  private _wheel: (e: globalThis.WheelEvent) => void;
  private _keyDown: (e: KeyboardEvent) => void;
  private _contextMenu: (e: MouseEvent) => void;
  private _dragOver: (e: globalThis.DragEvent) => void;
  private _drop: (e: globalThis.DragEvent) => void;
  private _dragLeave: (e: globalThis.DragEvent) => void;

  constructor(
    canvas: HTMLCanvasElement,
    handlers: CanvasInputHandlers,
    opts: CanvasInputOptions,
  ) {
    this.canvas = canvas;
    this.handlers = handlers;
    this.getCamera = opts.getCamera;
    this.onCameraChange = opts.onCameraChange;
    this.shouldPan = opts.shouldPan ?? ((e) => e.button === 1);
    this.zoomMin = opts.zoomMin ?? 0.25;
    this.zoomMax = opts.zoomMax ?? 4;
    this.zoomFactor = opts.zoomFactor ?? 1.1;

    this._mouseDown = this.handleMouseDown.bind(this);
    this._mouseMove = this.handleMouseMove.bind(this);
    this._mouseUp = this.handleMouseUp.bind(this);
    this._wheel = this.handleWheel.bind(this);
    this._keyDown = this.handleKeyDown.bind(this);
    this._contextMenu = this.handleContextMenu.bind(this);
    this._dragOver = this.handleDragOver.bind(this);
    this._drop = this.handleDrop.bind(this);
    this._dragLeave = this.handleDragLeave.bind(this);
  }

  attach(): void {
    this.canvas.addEventListener('mousedown', this._mouseDown);
    this.canvas.addEventListener('mousemove', this._mouseMove);
    this.canvas.addEventListener('mouseup', this._mouseUp);
    this.canvas.addEventListener('wheel', this._wheel, { passive: false });
    window.addEventListener('keydown', this._keyDown);
    this.canvas.addEventListener('contextmenu', this._contextMenu);
    this.canvas.addEventListener('dragover', this._dragOver);
    this.canvas.addEventListener('drop', this._drop);
    this.canvas.addEventListener('dragleave', this._dragLeave);
  }

  detach(): void {
    this.canvas.removeEventListener('mousedown', this._mouseDown);
    this.canvas.removeEventListener('mousemove', this._mouseMove);
    this.canvas.removeEventListener('mouseup', this._mouseUp);
    this.canvas.removeEventListener('wheel', this._wheel);
    window.removeEventListener('keydown', this._keyDown);
    this.canvas.removeEventListener('contextmenu', this._contextMenu);
    this.canvas.removeEventListener('dragover', this._dragOver);
    this.canvas.removeEventListener('drop', this._drop);
    this.canvas.removeEventListener('dragleave', this._dragLeave);
  }

  toWorld(screen: Vec2): Vec2 {
    const cam = this.getCamera();
    return screenToWorld(screen, cam, this.canvas.clientWidth, this.canvas.clientHeight);
  }

  private pointer(e: MouseEvent): PointerEvent {
    const screen = { x: e.offsetX, y: e.offsetY };
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
    const screen = { x: e.offsetX, y: e.offsetY };
    return { world: this.toWorld(screen), screen, raw: e, dataTransfer: e.dataTransfer };
  }

  // --- Event handlers ---

  private handleMouseDown(e: MouseEvent): void {
    const p = this.pointer(e);
    if (this.shouldPan(p)) {
      this.panning = true;
      this.panLast = { x: e.offsetX, y: e.offsetY };
      return;
    }
    this.handlers.onPointerDown?.(p);
  }

  private handleMouseMove(e: MouseEvent): void {
    if (this.panning) {
      const current = { x: e.offsetX, y: e.offsetY };
      applyPan(this.getCamera(), { x: current.x - this.panLast.x, y: current.y - this.panLast.y });
      this.panLast = current;
      this.onCameraChange?.();
      return;
    }
    this.handlers.onPointerMove?.(this.pointer(e));
  }

  private handleMouseUp(e: MouseEvent): void {
    if (this.panning) {
      this.panning = false;
      return;
    }
    this.handlers.onPointerUp?.(this.pointer(e));
  }

  private handleWheel(e: globalThis.WheelEvent): void {
    e.preventDefault();
    const screen = { x: e.offsetX, y: e.offsetY };
    const factor = e.deltaY < 0 ? this.zoomFactor : 1 / this.zoomFactor;
    applyZoom(
      this.getCamera(), screen, factor,
      this.canvas.clientWidth, this.canvas.clientHeight,
      this.zoomMin, this.zoomMax,
    );
    this.onCameraChange?.();
    this.handlers.onWheel?.({
      world: this.toWorld(screen), screen, raw: e, deltaY: e.deltaY,
    });
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    this.handlers.onKeyDown?.({
      raw: e, key: e.key,
      ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey,
    });
  }

  private handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    this.handlers.onContextMenu?.(this.pointer(e));
  }

  private handleDragOver(e: globalThis.DragEvent): void {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    this.handlers.onDragOver?.(this.dragEvent(e));
  }

  private handleDrop(e: globalThis.DragEvent): void {
    e.preventDefault();
    this.handlers.onDrop?.(this.dragEvent(e));
  }

  private handleDragLeave(e: globalThis.DragEvent): void {
    this.handlers.onDragLeave?.(this.dragEvent(e));
  }
}
