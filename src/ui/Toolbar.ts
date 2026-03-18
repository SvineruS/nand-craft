import type { EditorState } from '../editor/EditorState.ts';
import { WIRE_COLORS } from '../editor/EditorState.ts';

const TOOLBAR_BG = '#1e1e2e';
const BUTTON_BG = '#363650';
const BUTTON_HOVER = '#44446a';
const BUTTON_TEXT = '#e0e0e0';
const SEPARATOR_COLOR = '#444466';
const TEST_BG = '#22c55e';
const TEST_HOVER = '#16a34a';

function createButton(label: string, title?: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  if (title) btn.title = title;
  Object.assign(btn.style, {
    background: BUTTON_BG,
    color: BUTTON_TEXT,
    border: 'none',
    borderRadius: '4px',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: '13px',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s',
  } satisfies Partial<Record<keyof CSSStyleDeclaration, string>>);
  btn.addEventListener('mouseenter', () => {
    btn.style.background = BUTTON_HOVER;
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = BUTTON_BG;
  });
  return btn;
}

function setDisabled(btn: HTMLButtonElement, disabled: boolean): void {
  btn.disabled = disabled;
  btn.style.opacity = disabled ? '0.4' : '1';
  btn.style.cursor = disabled ? 'default' : 'pointer';
}

function createSeparator(): HTMLElement {
  const sep = document.createElement('div');
  Object.assign(sep.style, {
    width: '1px',
    alignSelf: 'stretch',
    margin: '4px 6px',
    background: SEPARATOR_COLOR,
  });
  return sep;
}

export class Toolbar {
  readonly element: HTMLElement;

  private readonly levelNameEl: HTMLElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly stepBtn: HTMLButtonElement;
  private readonly playPauseBtn: HTMLButtonElement;
  private readonly testBtn: HTMLButtonElement;
  private readonly colorSwatches: HTMLElement[] = [];

  constructor(options: {
    onUndo: () => void;
    onRedo: () => void;
    onTest: () => void;
    onStepTick: () => void;
    onToggleSimulation: () => void;
    onColorChange: (color: string) => void;
  }) {
    const bar = document.createElement('div');
    this.element = bar;
    Object.assign(bar.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 12px',
      background: TOOLBAR_BG,
      borderBottom: `1px solid ${SEPARATOR_COLOR}`,
      height: '44px',
      boxSizing: 'border-box',
      userSelect: 'none',
      flexShrink: '0',
    });

    // Level name
    this.levelNameEl = document.createElement('span');
    Object.assign(this.levelNameEl.style, {
      color: '#ffffff',
      fontSize: '14px',
      fontWeight: '600',
      whiteSpace: 'nowrap',
      marginRight: '4px',
    });
    this.levelNameEl.textContent = 'Untitled';
    bar.appendChild(this.levelNameEl);

    bar.appendChild(createSeparator());

    // Undo / Redo
    this.undoBtn = createButton('Undo', 'Ctrl+Z');
    this.undoBtn.addEventListener('click', () => options.onUndo());
    bar.appendChild(this.undoBtn);

    this.redoBtn = createButton('Redo', 'Ctrl+Shift+Z');
    this.redoBtn.addEventListener('click', () => options.onRedo());
    bar.appendChild(this.redoBtn);

    bar.appendChild(createSeparator());

    // Simulation controls
    this.stepBtn = createButton('Step', 'Advance one tick');
    this.stepBtn.addEventListener('click', () => options.onStepTick());
    bar.appendChild(this.stepBtn);

    this.playPauseBtn = createButton('Play', 'Toggle simulation');
    this.playPauseBtn.addEventListener('click', () => options.onToggleSimulation());
    bar.appendChild(this.playPauseBtn);

    bar.appendChild(createSeparator());

    // Wire color picker
    const colorLabel = document.createElement('span');
    Object.assign(colorLabel.style, {
      color: BUTTON_TEXT,
      fontSize: '11px',
      marginRight: '2px',
    });
    colorLabel.textContent = 'Wire:';
    bar.appendChild(colorLabel);

    for (const color of WIRE_COLORS) {
      const swatch = document.createElement('div');
      Object.assign(swatch.style, {
        width: '18px',
        height: '18px',
        borderRadius: '3px',
        background: color,
        cursor: 'pointer',
        border: '2px solid transparent',
        boxSizing: 'border-box',
        transition: 'border-color 0.15s',
      });
      swatch.title = `Wire color (E to apply, Shift+E for all connected)`;
      swatch.addEventListener('click', () => options.onColorChange(color));
      this.colorSwatches.push(swatch);
      bar.appendChild(swatch);
    }

    bar.appendChild(createSeparator());

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    bar.appendChild(spacer);

    // Test button
    this.testBtn = createButton('Test');
    Object.assign(this.testBtn.style, {
      background: TEST_BG,
      color: '#ffffff',
      fontWeight: '600',
      padding: '6px 20px',
    });
    this.testBtn.addEventListener('mouseenter', () => {
      this.testBtn.style.background = TEST_HOVER;
    });
    this.testBtn.addEventListener('mouseleave', () => {
      this.testBtn.style.background = TEST_BG;
    });
    this.testBtn.addEventListener('click', () => options.onTest());
    bar.appendChild(this.testBtn);
  }

  update(state: EditorState): void {
    setDisabled(this.undoBtn, false);
    setDisabled(this.redoBtn, false);
    this.playPauseBtn.textContent = state.simulationRunning ? 'Pause' : 'Play';

    // Highlight active wire color
    for (let i = 0; i < WIRE_COLORS.length; i++) {
      const isActive = state.wireColor === WIRE_COLORS[i];
      this.colorSwatches[i].style.borderColor = isActive ? '#ffffff' : 'transparent';
    }
  }

  setLevelName(name: string): void {
    this.levelNameEl.textContent = name;
  }
}
