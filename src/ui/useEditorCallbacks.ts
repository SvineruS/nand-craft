import type { RefObject } from 'preact';
import { useCallback, useState } from 'preact/hooks';
import type { Editor } from '../editor/Editor.ts';
import type { Command } from '../editor/CommandHistory.ts';
import { notifyStateChange, currentLevel, viewMode } from './editorStore.ts';
import { simulateFirstCase, stepTestCase, runAllAnimated, resetTests } from './testRunner.ts';
import { switchToLevelMap, switchToEditor, detachMapInput } from './levelManager.ts';
import { saveCircuit } from '../persistence/storage.ts';
import type { GateType } from "../editor/gates.ts";

export function useEditorCallbacks(editorRef: RefObject<Editor | null>) {
  const [showLevelComplete, setShowLevelComplete] = useState(false);

  const onLevelComplete = useCallback(() => setShowLevelComplete(true), []);

  // Toolbar
  const handleUndo = useCallback(() => {
    editorRef.current?.undo();
  }, []);
  const handleRedo = useCallback(() => {
    editorRef.current?.redo();
  }, []);

  const handleColorChange = useCallback((color: string) => {
    const editor = editorRef.current;
    if (editor) {
      editor.getState().wireColor = color;
      notifyStateChange();
    }
  }, []);

  const handleShowLevels = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (viewMode.value === 'levelSelect') {
      if (currentLevel.value) switchToEditor(editor);
    } else {
      switchToLevelMap(editor);
    }
  }, []);

  const handleMenu = useCallback(() => {
    const editor = editorRef.current;
    if (editor && viewMode.value === 'editor' && currentLevel.value) {
      saveCircuit(currentLevel.value.id, editor.getCircuit());
    }
    detachMapInput();
    if (editor) editor.detachInput();
    viewMode.value = 'mainMenu';
    notifyStateChange();
  }, []);

  const handleResetLevel = useCallback(() => {
    const editor = editorRef.current;
    const level = currentLevel.value;
    if (!editor || !level) return;
    editor.loadLevel(level);
    simulateFirstCase(editor);
  }, []);

  // Sidebar
  const handleStamp = useCallback((type: GateType) => {
    const editor = editorRef.current;
    if (!editor) return;
    const state = editor.getState();
    state.mode = { kind: 'stamping', gateType: type };
    state.renderDirty = true;
  }, []);

  const handleDragStart = useCallback((type: GateType) => {
    const editor = editorRef.current;
    if (editor) editor.getState().mode = { kind: 'stamping', gateType: type };
  }, []);

  const handleDragEnd = useCallback(() => {
    const editor = editorRef.current;
    if (editor) editor.getState().mode = { kind: 'normal' };
  }, []);

  const handleExecuteCommand = useCallback((cmd: Command) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.executeCommand(cmd);
    simulateFirstCase(editor);
  }, []);

  // Test panel
  const handleReset = useCallback(() => {
    const editor = editorRef.current;
    if (editor) resetTests(editor);
  }, []);

  const handleStep = useCallback(() => {
    const editor = editorRef.current;
    if (editor) stepTestCase(editor, onLevelComplete);
  }, []);

  const handleRunAll = useCallback(() => {
    const editor = editorRef.current;
    if (editor) runAllAnimated(editor, onLevelComplete);
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
