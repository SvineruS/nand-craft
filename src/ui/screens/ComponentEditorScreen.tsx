import { useMemo, useState } from 'preact/hooks';
import { InputHandler } from '../../circuit-builder/editor/InputHandler.ts';
import type { Editor } from '../../circuit-builder/editor/Editor.ts';
import { useCanvasEditor } from '../useCanvasEditor.ts';
import { EditorContext, useEditor } from '../editorContext.ts';
import { componentEditorName, createComponentEditor } from '../componentNav.ts';
import { notifyStateChange, openComponentId, testEditorVisible } from '../editorStore.ts';
import { navigateTo } from '../screenManager.ts';
import { Sidebar } from '../components/Sidebar.tsx';
import { TestPanel } from '../components/TestPanel.tsx';
import { TestEditorDialog } from '../components/TestEditorDialog.tsx';
import { WIRE_COLORS } from '../../circuit-builder/editor/consts.ts';
import { buildComponentDefinition } from '../../circuit-builder/components/componentBuilder.ts';
import { saveComponent, deleteComponent } from '../../circuit-builder/components/componentRegistry.ts';
import { clearComponentDefCache } from '../../circuit-builder/editor/gates.ts';
import type { ComponentId } from '../../circuit-builder/editor/types.ts';
import type { Command } from '../../circuit-builder/editor/commands.ts';

export function ComponentEditorScreen() {
  const requested = openComponentId.value;
  // This screen owns the Editor for the component being edited.
  const editor = useMemo(() => createComponentEditor(requested), [requested]);

  return (
    <EditorContext.Provider value={editor}>
      <ComponentEditor initialId={requested} initialName={componentEditorName(requested)} />
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
    createInput: (canvas, renderer) => new InputHandler(
      canvas,
      () => editor.getState(),
      () => editor.getHistory(),
      renderer,
    ),
    onCircuitDirty: () => { editor.onCircuitChanged(); notifyStateChange(); },
    onValueDirty: () => { editor.retick(); notifyStateChange(); },
    onStateChanged: () => notifyStateChange(),
  });

  function handleSave() {
    try {
      const def = buildComponentDefinition(editor.getCircuit(), name, componentId ?? undefined);
      saveComponent(def);
      clearComponentDefCache();
      setComponentId(def.id);
      setSaveError(null);
      setSaveStatus('saved');
    } catch (e) {
      setSaveError((e as Error).message);
      setSaveStatus('error');
    }
    setTimeout(() => setSaveStatus('idle'), 150);
  }

  function handleDelete() {
    if (!componentId) return;
    if (!confirm(`Delete component "${name}"?`)) return;
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

        <input
          type="text"
          class="toolbar-name-input"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          placeholder="Component name"
        />

        <div class="toolbar-separator" />

        <button class="toolbar-btn" onClick={handleUndo}>Undo</button>
        <button class="toolbar-btn" onClick={handleRedo}>Redo</button>

        <div class="toolbar-separator" />

        <span class="toolbar-color-label">Wire:</span>
        {WIRE_COLORS.map((color) => (
          <div
            key={color}
            class="toolbar-swatch"
            style={{
              background: color,
              borderColor: editor.getState().wireColor === color ? '#ffffff' : 'transparent',
            }}
            onClick={() => handleColorChange(color)}
          />
        ))}

        <div class="toolbar-spacer" />

        <button class="toolbar-btn" onClick={() => { testEditorVisible.value = !testEditorVisible.value; }}>Tests</button>
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
    </>
  );
}
