import { useEffect, useRef } from 'preact/hooks';
import { navigateTo } from '../screenManager.ts';
import { backgroundStyle, setBackgroundStyle } from '../editorStore.ts';
import {
  type BackgroundStyle, GRID_PATTERNS, ORNAMENT_PATTERNS, drawBackground,
} from '../../circuit-builder/editor/render/backgroundPattern.ts';
import { COLORS } from '../../circuit-builder/editor/consts.ts';

const PREVIEW_WIDTH = 76;
const PREVIEW_HEIGHT = 52;
/** Zoomed out so a preview shows a couple of major grid cells, not one minor one. */
const PREVIEW_ZOOM = 0.5;

export function SettingsScreen() {
  const style = backgroundStyle.value;

  return (
    <div class="fullscreen-menu">
      <h1 class="menu-title">Settings</h1>

      <div class="settings-group">
        <div class="settings-label">Background grid</div>
        <div class="pattern-options">
          {GRID_PATTERNS.map(grid => (
            <PatternOption
              key={grid.id}
              label={grid.label}
              style={{ ...style, grid: grid.id }}
              selected={grid.id === style.grid}
            />
          ))}
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-label">Background pattern</div>
        <div class="pattern-options">
          {ORNAMENT_PATTERNS.map(ornament => (
            <PatternOption
              key={ornament.id}
              label={ornament.label}
              style={{ ...style, ornament: ornament.id }}
              selected={ornament.id === style.ornament}
            />
          ))}
        </div>
      </div>

      <div class="menu-buttons">
        <button class="menu-btn" onClick={() => navigateTo('mainMenu')}>
          Back
        </button>
      </div>
    </div>
  );
}

interface PatternOptionProps {
  label: string;
  /** The full style this option would select — previewed as it would actually look. */
  style: BackgroundStyle;
  selected: boolean;
}

function PatternOption({ label, style, selected }: PatternOptionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Previews are drawn by the same code the editor uses, so the two can't drift apart.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(PREVIEW_WIDTH * dpr);
    canvas.height = Math.round(PREVIEW_HEIGHT * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);

    ctx.scale(PREVIEW_ZOOM, PREVIEW_ZOOM);
    const bounds = {
      left: 0,
      top: 0,
      right: PREVIEW_WIDTH / PREVIEW_ZOOM,
      bottom: PREVIEW_HEIGHT / PREVIEW_ZOOM,
    };
    // The preview is all "inside the map" — the dimmed-outside look isn't what's on offer here.
    drawBackground(ctx, { style, viewport: bounds, map: bounds, zoom: PREVIEW_ZOOM });
  }, [style.grid, style.ornament]);

  return (
    <button
      class={`pattern-option${selected ? ' pattern-option-selected' : ''}`}
      onClick={() => setBackgroundStyle(style)}
    >
      <canvas
        ref={canvasRef}
        style={{ width: `${PREVIEW_WIDTH}px`, height: `${PREVIEW_HEIGHT}px` }}
      />
      <span>{label}</span>
    </button>
  );
}
