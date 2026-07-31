import { useState } from 'preact/hooks';
import { useEditorState, testEditorVisible, levelDialogVisible, saveError } from '../editorStore.ts';
import { useEditor } from '../editorContext.ts';
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
  const { level } = useEditor();
  const [showHints, setShowHints] = useState(false);

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

      {saveError.value && (
        <span class="toolbar-save-error" title={saveError.value}>
          Save failed — progress is not being stored
        </span>
      )}

      <button class="toolbar-btn" title="Show level description" onClick={() => { levelDialogVisible.value = true; }}>Goals</button>
      {level.hints && level.hints.length > 0 && (
        <button class="toolbar-btn" onClick={() => setShowHints(!showHints)}>Hints</button>
      )}

      {showHints && level.hints && (
        <div class="hints-overlay" onClick={() => setShowHints(false)}>
          <div class="hints-card" onClick={(e) => e.stopPropagation()}>
            <div class="hints-header">
              <span>Hints</span>
              <button class="test-editor-close" onClick={() => setShowHints(false)}>✕</button>
            </div>
            <div class="hints-list">
              {level.hints.map((hint, i) => (
                <div key={i} class="hint-item">
                  <span class="hint-label">Hint {i + 1}</span>
                  <span class="hint-text">{hint}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
