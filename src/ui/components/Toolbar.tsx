import { useEditorState, testEditorVisible } from '../editorStore.ts';
import { getEditor } from '../../circuit-builder/editorInstance.ts';
import { WIRE_COLORS } from "../../circuit-builder/editor/consts.ts";

interface ToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  onColorChange: (color: string) => void;
  onShowLevels: () => void;
  onMenu: () => void;
  onResetLevel: () => void;
}

export function Toolbar({ onUndo, onRedo, onColorChange, onShowLevels, onMenu, onResetLevel }: ToolbarProps) {
  const state = useEditorState();
  const { level } = getEditor();

  return (
    <div class="toolbar">
      <button class="toolbar-btn" onClick={onMenu}>Menu</button>
      <button class="toolbar-btn" onClick={onShowLevels}>Levels</button>

      <div class="toolbar-separator" />

      <span class="toolbar-level-name">{level.name}</span>

      <div class="toolbar-separator" />

      <button class="toolbar-btn" title="Ctrl+Z" onClick={onUndo}>Undo</button>
      <button class="toolbar-btn" title="Ctrl+Shift+Z" onClick={onRedo}>Redo</button>
      <button class="toolbar-btn" title="Reset level to default" onClick={onResetLevel}>Reset</button>
      {level.customTests && (
        <button class="toolbar-btn" title="Open test editor" onClick={() => { testEditorVisible.value = !testEditorVisible.value; }}>Tests</button>
      )}

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
