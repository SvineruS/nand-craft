import { useState } from 'preact/hooks';
import { useEditorState, testEditorVisible, levelDialogVisible, saveError } from '../editorStore.ts';
import { useEditor } from '../editorContext.ts';
import { WireSwatches } from './WireSwatches.tsx';
import { FloatingWindow } from './FloatingWindow.tsx';

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

      <span class="toolbar-level-name">{level?.name ?? ''}</span>

      <div class="toolbar-separator" />

      <button class="toolbar-btn" title="Ctrl+Z" onClick={onUndo}>Undo</button>
      <button class="toolbar-btn" title="Ctrl+Shift+Z" onClick={onRedo}>Redo</button>
      <button class="toolbar-btn" title="Reset level to default" onClick={onResetLevel}>Reset</button>

      <div class="toolbar-separator" />

      <span class="toolbar-color-label">Wire:</span>
      <WireSwatches selected={state.wireColor} onSelect={onColorChange} />

      <div class="toolbar-spacer" />

      {saveError.value && (
        <span class="toolbar-save-error" title={saveError.value}>
          Save failed — progress is not being stored
        </span>
      )}

      {/* Past the spacer sit the buttons that open a window — Tests in the same place the
          component editor's toolbar puts it, since it is the same window. */}
      {level?.customTests && (
        <button class="toolbar-btn" title="Open test editor" onClick={() => { testEditorVisible.value = !testEditorVisible.value; }}>Tests</button>
      )}
      <button class="toolbar-btn" title="Show level description" onClick={() => { levelDialogVisible.value = true; }}>Goals</button>
      {level?.hints && level.hints.length > 0 && (
        <button class="toolbar-btn" onClick={() => setShowHints(!showHints)}>Hints</button>
      )}

      {showHints && level?.hints && (
        <FloatingWindow id="hints" class="window-hints" title="Hints" onClose={() => setShowHints(false)}>
          <div class="hints-list">
            {level.hints.map((hint, i) => (
              <div key={i} class="hint-item">
                <span class="hint-label">Hint {i + 1}</span>
                <span class="hint-text">{hint}</span>
              </div>
            ))}
          </div>
        </FloatingWindow>
      )}
    </div>
  );
}
