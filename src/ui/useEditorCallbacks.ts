import { useCallback, useState } from 'preact/hooks';
import { getEditor } from '../circuit-builder/editorInstance.ts';
import type { Command } from '../circuit-builder/editor/commands.ts';
import { notifyStateChange, solvedLevelIds } from './editorStore.ts';
import { navigateTo, switchToLevelMap } from './screenManager.ts';
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
    navigateTo('mainMenu');
  }, []);

  const handleResetLevel = useCallback(() => {
    if (!confirm('Reset level to default? All changes will be lost.')) return;
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
    if (tests.mode === 'queue') {
      // Queue mode: tick once
      if (tests.queueDone || tests.queueFailed) {
        tests.reset();
      }
      if (tests.queueCommandIndex < 0) {
        // Re-init queue execution state
        tests.startQueue(tests.queueCommands);
      }
      tests.tickQueue();
    } else {
      const result = tests.step();
      if (result) {
        if (tests.allPassed()) handleLevelComplete();
      } else if (tests.finished) {
        tests.reset();
        tests.step();
      }
    }
    notifyStateChange();
  }, []);

  const handlePause = useCallback(() => {
    getEditor().tests.cancelRunAll();
    notifyStateChange();
  }, []);

  const handleRunAll = useCallback(() => {
    const { tests } = getEditor();
    if (tests.mode === 'queue') {
      // Queue mode: run with animated ticking
      tests.runQueueAnimated(() => notifyStateChange(), handleLevelComplete);
    } else {
      tests.runAllAnimated(
        () => notifyStateChange(),
        handleLevelComplete,
      );
    }
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
    handlePause,
  };
}
