import { useCallback, useState } from 'preact/hooks';
import { useEditor } from './editorContext.ts';
import { useTestControls } from './useTestControls.ts';
import type { Command } from '../circuit-builder/editor/commands.ts';
import { notifyStateChange, solvedLevelIds } from './editorStore.ts';
import { navigateTo, switchToLevelMap } from './screenManager.ts';
import { getSolvedLevelIds, markLevelSolved } from '../circuit-builder/persistence/storage.ts';
import type { GateType } from "../circuit-builder/editor/gates.ts";

export function useEditorCallbacks() {
  const editor = useEditor();
  const [showLevelComplete, setShowLevelComplete] = useState(false);

  const onLevelComplete = useCallback(() => setShowLevelComplete(true), []);

  const handleLevelComplete = useCallback(() => {
    if (!editor.level) return; // component / level-map editors have nothing to mark solved
    markLevelSolved(editor.level.id);
    solvedLevelIds.value = getSolvedLevelIds();
    onLevelComplete();
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

  const handleShowLevels = useCallback(() => {
    switchToLevelMap();
  }, [editor]);

  const handleMenu = useCallback(() => {
    navigateTo('mainMenu');
  }, [editor]);

  const handleResetLevel = useCallback(() => {
    if (!confirm('Reset level to default? All changes will be lost.')) return;
    editor.resetLevel();
    editor.tests.reset();
    notifyStateChange();
  }, [editor]);

  // Sidebar
  const handleStamp = useCallback((type: GateType) => {
    const state = editor.getState();
    state.mode = { kind: 'stamping', gateType: type };
    state.renderDirty = true;
  }, [editor]);

  const handleDragStart = useCallback((type: GateType) => {
    editor.getState().mode = { kind: 'stamping', gateType: type };
  }, [editor]);

  const handleDragEnd = useCallback(() => {
    editor.getState().mode = { kind: 'normal' };
  }, [editor]);

  const handleExecuteCommand = useCallback((cmd: Command) => {
    editor.executeCommand(cmd);
  }, [editor]);

  // Test panel — shared with the component editor, which has the same four buttons.
  const { handleReset, handleStep, handleRunAll, handlePause } = useTestControls(handleLevelComplete);

  return {
    showLevelComplete,
    setShowLevelComplete,
    handleUndo,
    handleRedo,
    handleColorChange,
    handleShowLevels,
    handleMenu,
    handleResetLevel,
    handleStamp,
    handleDragStart,
    handleDragEnd,
    handleExecuteCommand,
    handleReset,
    handleStep,
    handleRunAll,
    handlePause,
  };
}
