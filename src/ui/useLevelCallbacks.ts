import { useCallback, useState } from 'preact/hooks';
import { useEditor } from './editorContext.ts';
import { notifyStateChange, solvedLevelIds } from './editorStore.ts';
import { navigateTo, switchToLevelMap } from './screenManager.ts';
import { getSolvedLevelIds, markLevelSolved } from '../circuit-builder/persistence/storage.ts';
import { playSfx } from '../circuit-builder/sfx.ts';

/** The level editor's toolbar, and the bookkeeping a solved level triggers. */
export function useLevelCallbacks() {
  const editor = useEditor();
  const [showLevelComplete, setShowLevelComplete] = useState(false);

  const handleLevelComplete = useCallback(() => {
    if (!editor.level) return; // the component editor has nothing to mark solved
    markLevelSolved(editor.level.id);
    solvedLevelIds.value = getSolvedLevelIds();
    playSfx('levelComplete');
    setShowLevelComplete(true);
  }, [editor]);

  // Toolbar
  const handleUndo = useCallback(() => {
    editor.undo();
  }, [editor]);
  const handleRedo = useCallback(() => {
    editor.redo();
  }, [editor]);

  const handleColorChange = useCallback((color: string) => {
    editor.getState().wireColor = color;
    notifyStateChange();
  }, [editor]);

  const handleShowLevels = useCallback(() => switchToLevelMap(), []);
  const handleMenu = useCallback(() => navigateTo('mainMenu'), []);

  const handleResetLevel = useCallback(() => {
    if (!confirm('Reset level to default? All changes will be lost.')) return;
    editor.resetLevel();
    editor.tests.reset();
    notifyStateChange();
  }, [editor]);

  return {
    showLevelComplete,
    setShowLevelComplete,
    handleLevelComplete,
    handleUndo,
    handleRedo,
    handleColorChange,
    handleShowLevels,
    handleMenu,
    handleResetLevel,
  };
}
