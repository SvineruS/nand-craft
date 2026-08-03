import type { ComponentChildren } from 'preact';
import { InputHandler } from '../../circuit-builder/editor/InputHandler.ts';
import type { Command } from '../../circuit-builder/editor/commands.ts';
import { useCanvasEditor } from '../useCanvasEditor.ts';
import { useAutosave } from '../useAutosave.ts';
import { useTestControls } from '../useTestControls.ts';
import { useEditor } from '../editorContext.ts';
import { notifyStateChange, openGateWindow } from '../editorStore.ts';
import { Sidebar } from './Sidebar.tsx';
import { TestPanel } from './TestPanel.tsx';
import { TestEditorDialog } from './TestEditorDialog.tsx';
import { RamWindows } from './RamWindows.tsx';

interface CircuitWorkspaceProps {
  /** Rendered above the board. The one part the two screens genuinely disagree about. */
  toolbar: ComponentChildren;
  /** Persist the circuit. Called on the autosave triggers and once on the way out. */
  save: () => void;
  /** Fired when a test run finishes green. The level editor marks the level solved. */
  onAllPassed?: () => void;
  /** Dialogs the screen adds of its own — the level intro, the completion prompt. */
  children?: ComponentChildren;
}

/**
 * A board with tests down one side and a gate palette down the other: what the level editor
 * and the component editor both are.
 *
 * They differ in their toolbar, in what saving means, and in whether finishing a run unlocks
 * anything — so those three are props. Everything else was written out twice, including the
 * canvas mount and the autosave triggers.
 *
 * The level *map* editor deliberately does not use this. It has no tests, no RAM windows and
 * nothing to autosave, so sharing would mean handing it three switches all turned off.
 */
export function CircuitWorkspace({ toolbar, save, onAllPassed, children }: CircuitWorkspaceProps) {
  const editor = useEditor();
  const tests = useTestControls(onAllPassed);

  const containerRef = useCanvasEditor({
    getState: () => editor.getState(),
    createInput: (canvas) => new InputHandler(
      canvas,
      () => editor.getState(),
      () => editor.getHistory(),
      openGateWindow,
    ),
    onCircuitDirty: () => { editor.onCircuitChanged(); notifyStateChange(); },
    onValueDirty: () => { editor.retick(); notifyStateChange(); },
    onStateChanged: () => notifyStateChange(),
    onTeardown: () => {
      save();
      // A run left going would keep ticking a circuit this screen no longer shows.
      editor.tests.cancelRunAll();
    },
  });

  useAutosave(save);

  const handleDragEnd = () => { editor.getState().mode = { kind: 'normal' }; };
  const handleExecuteCommand = (cmd: Command) => { editor.executeCommand(cmd); };

  return (
    <>
      {toolbar}
      <div class="main-row">
        <TestPanel
          onReset={tests.handleReset}
          onStep={tests.handleStep}
          onRunAll={tests.handleRunAll}
          onPause={tests.handlePause}
          onExecuteCommand={handleExecuteCommand}
        />
        <div id="editor-container" ref={containerRef} />
        <Sidebar onDragEnd={handleDragEnd} />
      </div>
      <TestEditorDialog />
      <RamWindows />
      {children}
    </>
  );
}
