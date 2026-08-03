import { useEffect, useRef } from 'preact/hooks';
import { navigateTo } from '../screenManager.ts';
import {
  backgroundGrid, musicVolume, paletteId, setBackgroundGrid, setMusicVolume, setPaletteId,
  setSoundVolume, soundVolume,
} from '../editorStore.ts';
import {
  type GridPatternId, GRID_PATTERNS, drawBackground,
} from '../../circuit-builder/editor/render/backgroundPattern.ts';
import { type CanvasColors, PALETTES } from '../../circuit-builder/editor/palettes.ts';
import { COLORS } from '../../circuit-builder/editor/consts.ts';

const PREVIEW_WIDTH = 76;
const PREVIEW_HEIGHT = 52;
/** Zoomed out so a preview shows a couple of major grid cells, not one minor one. */
const PREVIEW_ZOOM = 0.5;

/** Colours shown as chips on a palette swatch — the ones that carry a palette's character. */
const SWATCH_KEYS: (keyof CanvasColors)[] = ['gateFill', 'wireDefault', 'wireActive', 'wireZero'];

export function SettingsScreen() {
  const grid = backgroundGrid.value;
  const palette = paletteId.value;

  return (
    <div class="fullscreen-menu">
      <h1 class="menu-title">Settings</h1>

      <div class="settings-group">
        <div class="settings-label">Palette</div>
        <div class="pattern-options">
          {PALETTES.map(p => (
            <button
              key={p.id}
              class={`palette-option${p.id === palette ? ' pattern-option-selected' : ''}`}
              onClick={() => setPaletteId(p.id)}
            >
              <div class="palette-swatch" style={{ background: p.canvas.background }}>
                {SWATCH_KEYS.map(key => (
                  <span key={key} class="palette-chip" style={{ background: p.canvas[key] }} />
                ))}
              </div>
              <span>{p.label}</span>
              <span class="palette-desc">{p.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-label">Background grid</div>
        <div class="pattern-options">
          {GRID_PATTERNS.map(pattern => (
            <PatternOption
              key={pattern.id}
              grid={pattern.id}
              label={pattern.label}
              selected={pattern.id === grid}
            />
          ))}
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-label">Sound effects</div>
        <VolumeSlider value={soundVolume.value} onChange={setSoundVolume} />
      </div>

      <div class="settings-group">
        <div class="settings-label">Music</div>
        <VolumeSlider value={musicVolume.value} onChange={setMusicVolume} />
      </div>

      <div class="menu-buttons">
        <button class="menu-btn" onClick={() => navigateTo('mainMenu')}>
          Back
        </button>
      </div>
    </div>
  );
}

interface VolumeSliderProps {
  value: number;
  onChange: (volume: number) => void;
}

/** A volume row. Two of them now, so the markup is written once. */
function VolumeSlider({ value, onChange }: VolumeSliderProps) {
  return (
    <div class="settings-row">
      <input
        type="range"
        min="0"
        max="100"
        value={Math.round(value * 100)}
        onInput={e => onChange(Number((e.target as HTMLInputElement).value) / 100)}
      />
      <span class="settings-value">
        {value === 0 ? 'Off' : `${Math.round(value * 100)}%`}
      </span>
    </div>
  );
}

interface PatternOptionProps {
  grid: GridPatternId;
  label: string;
  selected: boolean;
}

function PatternOption({ grid, label, selected }: PatternOptionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Previews read the live COLORS, so they have to be redrawn when the palette changes.
  const palette = paletteId.value;

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
    // Grid only: the ornament belongs to whatever level is open, not to this choice. And
    // map === viewport, so no preview shows the dimmed outside-the-map treatment.
    drawBackground(ctx, {
      style: { grid, ornament: 'none' },
      viewport: bounds,
      map: bounds,
      zoom: PREVIEW_ZOOM,
    });
  }, [grid, palette]);

  return (
    <button
      class={`pattern-option${selected ? ' pattern-option-selected' : ''}`}
      onClick={() => setBackgroundGrid(grid)}
    >
      <canvas
        ref={canvasRef}
        style={{ width: `${PREVIEW_WIDTH}px`, height: `${PREVIEW_HEIGHT}px` }}
      />
      <span>{label}</span>
    </button>
  );
}
