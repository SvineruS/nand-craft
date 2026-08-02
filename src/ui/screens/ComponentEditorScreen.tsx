import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { InputHandler } from '../../circuit-builder/editor/InputHandler.ts';
import type { Editor } from '../../circuit-builder/editor/Editor.ts';
import { useCanvasEditor } from '../useCanvasEditor.ts';
import { EditorContext, useEditor } from '../editorContext.ts';
import { componentEditorName, createComponentEditor } from '../componentNav.ts';
import { notifyStateChange, openComponentId, openGateWindow, testEditorVisible } from '../editorStore.ts';
import { navigateTo } from '../screenManager.ts';
import { Sidebar } from '../components/Sidebar.tsx';
import { TestPanel } from '../components/TestPanel.tsx';
import { TestEditorDialog } from '../components/TestEditorDialog.tsx';
import { RamWindows } from '../components/RamWindows.tsx';
import { WireSwatches } from '../components/WireSwatches.tsx';
import { buildComponentDefinition } from '../../circuit-builder/components/componentBuilder.ts';
import { saveComponent, deleteComponent } from '../../circuit-builder/components/componentRegistry.ts';
import { clearComponentDefCache } from '../../circuit-builder/editor/gates.ts';
import { AUTOSAVE_INTERVAL_MS } from '../../circuit-builder/persistence/storage.ts';
import type { ComponentId } from '../../circuit-builder/editor/types.ts';
import type { Command } from '../../circuit-builder/editor/commands.ts';

export function ComponentEditorScreen() {
  const requested = openComponentId.value;
  // This screen owns the Editor for the component being edited.
  const editor = useMemo(() => createComponentEditor(requested), [requested]);
  // Memoised because a new component's name is generated: called per render it would be a
  // different name every time, and the one that reached useState would be pure luck.
  const initialName = useMemo(() => componentEditorName(requested), [requested]);

  return (
    <EditorContext.Provider value={editor}>
      <ComponentEditor initialId={requested} initialName={initialName} />
    </EditorContext.Provider>
  );
}

function ComponentEditor({ initialId, initialName }: { initialId: ComponentId | null; initialName: string }) {
  const editor: Editor = useEditor();
  const [name, setName] = useState(initialName);
  // Saving a new component assigns it an id, which later saves reuse.
  const [componentId, setComponentId] = useState<ComponentId | null>(initialId);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

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
  });

  // Through refs, because the autosave timer below is bound once: a closure over the state
  // would keep saving under the name the editor opened with and — with componentId still
  // null — file every autosave as another new component.
  const nameRef = useRef(name);
  nameRef.current = name;
  const componentIdRef = useRef(componentId);
  componentIdRef.current = componentId;
  /** Set by a delete, so the save on the way out cannot resurrect what was just removed. */
  const deletedRef = useRef(false);

  /** Build and store the component. Returns null on success, or the failure message. */
  const persist = useCallback((): string | null => {
    if (deletedRef.current) return null;
    // An empty board is a screen the player opened and left. Saving it would litter the
    // sidebar with blank circuits under generated names.
    if (editor.getCircuit().gates.size === 0) return null;

    try {
      const def = buildComponentDefinition(
        editor.getCircuit(), nameRef.current, componentIdRef.current ?? undefined,
      );
      saveComponent(def);
      clearComponentDefCache();
      // The ref is updated here rather than waiting for the re-render: the next autosave can
      // fire first, and it has to reuse this id instead of creating a second component.
      componentIdRef.current = def.id;
      setComponentId(def.id);
      setSaveError(null);
      return null;
    } catch (e) {
      const message = (e as Error).message;
      setSaveError(message);
      return message;
    }
  }, [editor]);

  // Auto-save: periodically, when the tab is hidden, when it closes, and on the way out —
  // the same triggers CircuitBuilderScreen uses, so a component is no easier to lose than a
  // level circuit.
  useEffect(() => {
    const saveNow = () => { persist(); };
    const onVisibilityChange = () => { if (document.hidden) saveNow(); };
    window.addEventListener('beforeunload', saveNow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const interval = setInterval(saveNow, AUTOSAVE_INTERVAL_MS);

    return () => {
      window.removeEventListener('beforeunload', saveNow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(interval);
      saveNow(); // Leaving via Back unmounts the screen without any other trigger firing.
    };
  }, [persist]);

  function handleSave() {
    setSaveStatus(persist() === null ? 'saved' : 'error');
    setTimeout(() => setSaveStatus('idle'), 150);
  }

  function handleDelete() {
    if (!componentId) return;
    if (!confirm(`Delete component "${name}"?`)) return;
    deletedRef.current = true;
    deleteComponent(componentId);
    clearComponentDefCache();
    navigateTo('levelSelect');
  }

  function handleUndo() { editor.undo(); notifyStateChange(); }
  function handleRedo() { editor.redo(); notifyStateChange(); }
  function handleColorChange(color: string) { editor.getState().wireColor = color; notifyStateChange(); }
  function handleDragEnd() { editor.getState().mode = { kind: 'normal' }; }
  function handleExecuteCommand(cmd: Command) { editor.executeCommand(cmd); }

  // Test panel callbacks
  function handleReset() { editor.tests.reset(); notifyStateChange(); }
  function handleStep() {
    const { tests } = editor;
    tests.cancelRunAll();
    tests.step();
    notifyStateChange();
  }
  function handleRunAll() {
    editor.tests.runAllAnimated(() => notifyStateChange(), () => {});
  }
  function handlePause() { editor.tests.cancelRunAll(); notifyStateChange(); }

  return (
    <>
      <div class="toolbar">
        <button class="toolbar-btn" onClick={() => navigateTo('levelSelect')}>Back</button>

        <div class="toolbar-separator" />

        <button class="toolbar-btn" onClick={handleUndo}>Undo</button>
        <button class="toolbar-btn" onClick={handleRedo}>Redo</button>

        <div class="toolbar-separator" />

        <span class="toolbar-color-label">Wire:</span>
        <WireSwatches selected={editor.getState().wireColor} onSelect={handleColorChange} />

        <div class="toolbar-spacer" />

        <button class="toolbar-btn" onClick={() => { testEditorVisible.value = !testEditorVisible.value; }}>Tests</button>

        <div class="toolbar-separator" />

        {/* Next to Save, because the name is what Save files the component under. */}
        <input
          type="text"
          class="toolbar-name-input"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          placeholder="Component name"
        />
        <button
          class="toolbar-btn"
          style={{
            fontWeight: 'bold',
            background: saveStatus === 'saved' ? 'var(--pass)' : saveStatus === 'error' ? 'var(--fail)' : undefined,
            transition: saveStatus === 'idle' ? 'background 600ms ease-out' : 'none',
          }}
          title={saveStatus === 'error' ? saveError ?? undefined : undefined}
          onClick={handleSave}
        >
          Save
        </button>
        {componentId && (
          <button class="toolbar-btn" style={{ color: 'var(--fail)' }} onClick={handleDelete}>Delete</button>
        )}
      </div>
      <div class="main-row">
        <TestPanel
          onReset={handleReset}
          onStep={handleStep}
          onRunAll={handleRunAll}
          onPause={handlePause}
          onExecuteCommand={handleExecuteCommand}
        />
        <div id="editor-container" ref={containerRef} />
        <Sidebar onDragEnd={handleDragEnd} />
      </div>
      <TestEditorDialog />
      <RamWindows />
    </>
  );
}
