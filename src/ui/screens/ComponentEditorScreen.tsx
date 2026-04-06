import { useEffect, useRef, useState } from 'preact/hooks';
import { Renderer } from '../../circuit-builder/editor/render/Renderer.ts';
import { InputHandler } from '../../circuit-builder/editor/InputHandler.ts';
import { notifyStateChange, testEditorVisible } from '../editorStore.ts';
import { navigateTo } from '../screenManager.ts';
import { Sidebar } from '../components/Sidebar.tsx';
import { TestPanel } from '../components/TestPanel.tsx';
import { TestEditorDialog } from '../components/TestEditorDialog.tsx';
import { getEditor } from '../../circuit-builder/editorInstance.ts';
import { WIRE_COLORS } from '../../circuit-builder/editor/consts.ts';
import { buildComponentDefinition } from '../../circuit-builder/components/componentBuilder.ts';
import { saveComponent, deleteComponent } from '../../circuit-builder/components/componentRegistry.ts';
import { clearComponentDefCache } from '../../circuit-builder/editor/gates.ts';
import type { ComponentId } from '../../circuit-builder/editor/types.ts';

/** ID of the component being edited. Set before navigating to this screen. */
let editingComponentId: ComponentId | null = null;
let editingComponentName = 'New Component';

export function setEditingComponent(id: ComponentId | null, name?: string): void {
  editingComponentId = id;
  editingComponentName = name ?? 'New Component';
}

export function getEditingComponentId(): ComponentId | null {
  return editingComponentId;
}

export function ComponentEditorScreen() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(editingComponentName);

  useEffect(() => {
    const container = containerRef.current!;
    const editor = getEditor();

    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' });
    container.appendChild(canvas);

    const renderer = new Renderer(canvas);
    renderer.startLoop(
      () => editor.getState(),
      () => { editor.onCircuitChanged(); notifyStateChange(); },
      () => { editor.retick(); notifyStateChange(); },
      () => notifyStateChange(),
    );

    const input = new InputHandler(canvas,
      () => editor.getState(),
      () => editor.getHistory(),
      renderer);
    input.attach();

    editor.getState().renderDirty = true;

    const onResize = () => { editor.getState().renderDirty = true; };
    window.addEventListener('resize', onResize);

    return () => {
      renderer.stopLoop();
      input.detach();
      window.removeEventListener('resize', onResize);
      container.removeChild(canvas);
    };
  }, []);

  function handleSave() {
    const editor = getEditor();
    try {
      const def = buildComponentDefinition(
        editor.getCircuit(),
        name,
        editingComponentId ?? undefined,
      );
      saveComponent(def);
      clearComponentDefCache();
      editingComponentId = def.id;
      alert('Component saved!');
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function handleDelete() {
    if (!editingComponentId) return;
    if (!confirm(`Delete component "${name}"?`)) return;
    deleteComponent(editingComponentId);
    clearComponentDefCache();
    navigateTo('levelSelect');
  }

  function handleUndo() { getEditor().undo(); notifyStateChange(); }
  function handleRedo() { getEditor().redo(); notifyStateChange(); }
  function handleColorChange(color: string) { getEditor().getState().wireColor = color; notifyStateChange(); }
  function handleDragEnd() { getEditor().getState().mode = { kind: 'normal' }; }
  function handleExecuteCommand(cmd: any) { getEditor().executeCommand(cmd); }

  // Test panel callbacks
  function handleReset() { getEditor().tests.reset(); notifyStateChange(); }
  function handleStep() {
    const { tests } = getEditor();
    tests.cancelRunAll();
    tests.step();
    notifyStateChange();
  }
  function handleRunAll() {
    getEditor().tests.runAllAnimated(() => notifyStateChange(), () => {});
  }
  function handlePause() { getEditor().tests.cancelRunAll(); notifyStateChange(); }

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
              borderColor: getEditor().getState().wireColor === color ? '#ffffff' : 'transparent',
            }}
            onClick={() => handleColorChange(color)}
          />
        ))}

        <div class="toolbar-spacer" />

        <button class="toolbar-btn" onClick={() => { testEditorVisible.value = !testEditorVisible.value; }}>Tests</button>
        <button class="toolbar-btn" style={{ fontWeight: 'bold' }} onClick={handleSave}>Save</button>
        {editingComponentId && (
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
