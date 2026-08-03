import { useCallback, useMemo } from 'preact/hooks';
import type { Editor } from '../../circuit-builder/editor/Editor.ts';
import { createLevelEditor } from '../../circuit-builder/levels/levelManager.ts';
import { Toolbar } from '../components/Toolbar.tsx';
import { LevelDialog } from '../components/LevelDialog.tsx';
import { LevelCompleteDialog } from '../components/LevelCompleteDialog.tsx';
import { CircuitWorkspace } from '../components/CircuitWorkspace.tsx';
import { useLevelCallbacks } from '../useLevelCallbacks.ts';
import { EditorContext } from '../editorContext.ts';
import { openLevelIndex, saveError } from '../editorStore.ts';
import { switchToLevelMap } from '../screenManager.ts';

export function CircuitBuilderScreen() {
  const levelIndex = openLevelIndex.value ?? 0;
  // This screen owns the Editor: built for the requested level, discarded on unmount.
  const editor = useMemo(() => createLevelEditor(levelIndex), [levelIndex]);

  return (
    <EditorContext.Provider value={editor}>
      <CircuitBuilder editor={editor} />
    </EditorContext.Provider>
  );
}

/** Inner component so the toolbar, sidebar and panels can useEditor() from context. */
function CircuitBuilder({ editor }: { editor: Editor }) {
  const cb = useLevelCallbacks();
  const save = useCallback(() => saveLevel(editor), [editor]);

  const toolbar = (
    <Toolbar
      onUndo={cb.handleUndo}
      onRedo={cb.handleRedo}
      onColorChange={cb.handleColorChange}
      onShowLevels={cb.handleShowLevels}
      onMenu={cb.handleMenu}
      onResetLevel={cb.handleResetLevel}
    />
  );

  return (
    <CircuitWorkspace toolbar={toolbar} save={save} onAllPassed={cb.handleLevelComplete}>
      <LevelDialog />
      {cb.showLevelComplete && (
        <LevelCompleteDialog
          onLevelMap={() => {
            switchToLevelMap();
            cb.setShowLevelComplete(false);
          }}
          onClose={() => cb.setShowLevelComplete(false)}
        />
      )}
    </CircuitWorkspace>
  );
}

/** Save, surfacing a storage failure in the toolbar rather than swallowing it. */
function saveLevel(editor: Editor): void {
  const error = editor.save();
  if (error !== saveError.peek()) saveError.value = error;
}
