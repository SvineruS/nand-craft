import { WIRE_COLORS } from '../editor/EditorState.ts';
import { currentLevel, useEditorState } from './editorStore.ts';

interface ToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  onColorChange: (color: string) => void;
}

export function Toolbar({ onUndo, onRedo, onColorChange }: ToolbarProps) {
  const state = useEditorState();
  const level = currentLevel.value;

  if (!state) return null;

  return (
    <div class="toolbar">
      <span class="toolbar-level-name">{level?.name ?? 'Untitled'}</span>

      <div class="toolbar-separator" />

      <button class="toolbar-btn" title="Ctrl+Z" onClick={onUndo}>
        Undo
      </button>
      <button class="toolbar-btn" title="Ctrl+Shift+Z" onClick={onRedo}>
        Redo
      </button>

      <div class="toolbar-separator" />

      <span class="toolbar-color-label">Wire:</span>
      {WIRE_COLORS.map((color) => (
        <div
          key={color}
          class="toolbar-swatch"
          style={{
            background: color,
            borderColor: state.wireColor === color ? '#ffffff' : 'transparent',
          }}
          title="Wire color (E to apply, Shift+E for all connected)"
          onClick={() => onColorChange(color)}
        />
      ))}

      <div class="toolbar-spacer" />
    </div>
  );
}
