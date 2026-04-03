import { useCallback, useState } from 'preact/hooks';
import { getEditor } from '../circuit-builder/editorInstance.ts';
import type { Command } from '../circuit-builder/editor/commands.ts';
import { notifyStateChange, solvedLevelIds, viewMode } from './editorStore.ts';
import { switchToLevelMap } from './screenManager.ts';
import { getSolvedLevelIds, markLevelSolved } from '../circuit-builder/persistence/storage.ts';
import type { GateType } from "../circuit-builder/editor/gates.ts";

export function useEditorCallbacks() {
  const [showLevelComplete, setShowLevelComplete] = useState(false);

  const onLevelComplete = useCallback(() => setShowLevelComplete(true), []);

  const handleLevelComplete = useCallback(() => {
    const editor = getEditor();
    markLevelSolved(editor.level.id);
    solvedLevelIds.value = getSolvedLevelIds();
    onLevelComplete();
  }, []);

  // Toolbar
  const handleUndo = useCallback(() => {
    getEditor().undo();
  }, []);
  const handleRedo = useCallback(() => {
    getEditor().redo();
  }, []);

  const handleColorChange = useCallback((color: string) => {
    getEditor().getState().wireColor = color;
    notifyStateChange();
  }, []);

  const handleShowLevels = useCallback(() => {
    switchToLevelMap();
  }, []);

  const handleMenu = useCallback(() => {
    const editor = getEditor();
    editor.save();
    viewMode.value = 'mainMenu';
    notifyStateChange();
  }, []);

  const handleResetLevel = useCallback(() => {
    const editor = getEditor();
    editor.resetLevel();
    editor.tests.reset();
    notifyStateChange();
  }, []);

  // Sidebar
  const handleStamp = useCallback((type: GateType) => {
    const state = getEditor().getState();
    state.mode = { kind: 'stamping', gateType: type };
    state.renderDirty = true;
  }, []);

  const handleDragStart = useCallback((type: GateType) => {
    getEditor().getState().mode = { kind: 'stamping', gateType: type };
  }, []);

  const handleDragEnd = useCallback(() => {
    getEditor().getState().mode = { kind: 'normal' };
  }, []);

  const handleExecuteCommand = useCallback((cmd: Command) => {
    getEditor().executeCommand(cmd);
  }, []);

  // Test panel
  const handleReset = useCallback(() => {
    getEditor().tests.reset();
    notifyStateChange();
  }, []);

  const handleStep = useCallback(() => {
    const { tests } = getEditor();
    tests.cancelRunAll();
    const result = tests.step();
    if (result && tests.allPassed()) handleLevelComplete();
    notifyStateChange();
  }, []);

  const handleRunAll = useCallback(() => {
    getEditor().tests.runAllAnimated(
      () => notifyStateChange(),
      handleLevelComplete,
    );
  }, []);

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
  };
}
