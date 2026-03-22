import type { EditorState } from '../editor/EditorState.ts';
import { WIRE_COLORS } from '../editor/EditorState.ts';

export class Toolbar {
  readonly element: HTMLElement;

  private readonly levelNameEl: HTMLElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly colorSwatches: HTMLElement[] = [];

  constructor(options: {
    onUndo: () => void;
    onRedo: () => void;
    onColorChange: (color: string) => void;
  }) {
    const bar = document.createElement('div');
    this.element = bar;
    bar.className = 'toolbar';

    // Level name
    this.levelNameEl = document.createElement('span');
    this.levelNameEl.className = 'toolbar-level-name';
    this.levelNameEl.textContent = 'Untitled';
    bar.appendChild(this.levelNameEl);

    bar.appendChild(this.createSeparator());

    // Undo / Redo
    this.undoBtn = this.createButton('Undo', 'Ctrl+Z');
    this.undoBtn.addEventListener('click', () => options.onUndo());
    bar.appendChild(this.undoBtn);

    this.redoBtn = this.createButton('Redo', 'Ctrl+Shift+Z');
    this.redoBtn.addEventListener('click', () => options.onRedo());
    bar.appendChild(this.redoBtn);

    bar.appendChild(this.createSeparator());

    // Wire color picker
    const colorLabel = document.createElement('span');
    colorLabel.className = 'toolbar-color-label';
    colorLabel.textContent = 'Wire:';
    bar.appendChild(colorLabel);

    for (const color of WIRE_COLORS) {
      const swatch = document.createElement('div');
      swatch.className = 'toolbar-swatch';
      swatch.style.background = color;
      swatch.title = 'Wire color (E to apply, Shift+E for all connected)';
      swatch.addEventListener('click', () => options.onColorChange(color));
      this.colorSwatches.push(swatch);
      bar.appendChild(swatch);
    }

    // Spacer
    const spacer = document.createElement('div');
    spacer.className = 'toolbar-spacer';
    bar.appendChild(spacer);
  }

  private createButton(label: string, title?: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = 'toolbar-btn';
    if (title) btn.title = title;
    return btn;
  }

  private createSeparator(): HTMLElement {
    const sep = document.createElement('div');
    sep.className = 'toolbar-separator';
    return sep;
  }

  update(state: EditorState): void {
    this.undoBtn.disabled = false;
    this.redoBtn.disabled = false;

    for (let i = 0; i < WIRE_COLORS.length; i++) {
      const isActive = state.wireColor === WIRE_COLORS[i];
      this.colorSwatches[i].style.borderColor = isActive ? '#ffffff' : 'transparent';
    }
  }

  setLevelName(name: string): void {
    this.levelNameEl.textContent = name;
  }
}
