import { useCallback, useState } from 'preact/hooks';
import { getEditor } from '../circuit-builder/editorInstance.ts';
import type { Command } from '../circuit-builder/editor/commands.ts';
import { notifyStateChange, currentLevel, viewMode } from './editorStore.ts';
import { simulateFirstCase, stepTestCase, runAllAnimated, resetTests } from '../circuit-builder/editor/testRunner.ts';
import { switchToLevelMap } from './screenManager.ts';
import { saveCircuit } from '../circuit-builder/persistence/storage.ts';
import type { GateType } from "../circuit-builder/editor/gates.ts";

export function useEditorCallbacks() {
  const [showLevelComplete, setShowLevelComplete] = useState(false);

  const onLevelComplete = useCallback(() => setShowLevelComplete(true), []);

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
    if (currentLevel.value) {
      saveCircuit(currentLevel.value.id, getEditor().getCircuit());
    }
    viewMode.value = 'mainMenu';
    notifyStateChange();
  }, []);

  const handleResetLevel = useCallback(() => {
    const editor = getEditor();
    const level = currentLevel.value;
    if (!level) return;
    editor.loadLevel(level);
    simulateFirstCase(editor);
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
    const editor = getEditor();
    editor.executeCommand(cmd);
    simulateFirstCase(editor);
  }, []);

  // Test panel
  const handleReset = useCallback(() => {
    resetTests(getEditor());
  }, []);

  const handleStep = useCallback(() => {
    stepTestCase(getEditor(), onLevelComplete);
  }, []);

  const handleRunAll = useCallback(() => {
    runAllAnimated(getEditor(), onLevelComplete);
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
