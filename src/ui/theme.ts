import {
  type PaletteId, applyCanvasColors, getPalette,
} from '../circuit-builder/editor/palettes.ts';

/**
 * Point the whole app at a palette: the canvas colours the renderer reads, and the CSS
 * variables the Preact shell reads. Canvases pick the change up on their next frame,
 * provided something marks them dirty (see useCanvasEditor).
 */
export function applyPalette(id: PaletteId): void {
  const palette = getPalette(id);
  applyCanvasColors(palette);

  const root = document.documentElement;
  for (const [name, value] of Object.entries(palette.ui)) {
    root.style.setProperty(`--${name}`, value);
  }
  // Keeps native controls, scrollbars and form widgets on the same side as the palette.
  root.style.setProperty('color-scheme', palette.scheme);
}
