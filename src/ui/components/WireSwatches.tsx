import { COLORS, WIRE_COLORS } from '../../circuit-builder/editor/consts.ts';
import { paletteId } from '../editorStore.ts';

interface WireSwatchesProps {
  /** Currently chosen wire colour — matched against the entries by value. */
  selected: string;
  onSelect: (color: string) => void;
  /** Swatch edge length in px. */
  size?: number;
}

/**
 * The wire-colour row shared by every toolbar.
 *
 * Reads `paletteId` so it re-renders when the palette changes: `WIRE_COLORS` is mutated in
 * place, so nothing about the array itself tells Preact the list has been reordered.
 */
export function WireSwatches({ selected, onSelect, size = 18 }: WireSwatchesProps) {
  paletteId.value;

  return (
    <>
      {WIRE_COLORS.map((color, i) => (
        <div
          key={color}
          class="toolbar-swatch"
          style={{
            // Slot 0 is the "no override" sentinel, so it shows what an unpainted wire
            // actually looks like on this board rather than the sentinel's own value.
            background: i === 0 ? COLORS.wireDefault : color,
            width: `${size}px`,
            height: `${size}px`,
            borderColor: selected === color ? 'var(--text)' : 'transparent',
          }}
          title={i === 0
            ? 'Default wire colour (E to apply, Shift+E for all connected)'
            : 'Wire colour (E to apply, Shift+E for all connected)'}
          onClick={() => onSelect(color)}
        />
      ))}
    </>
  );
}
