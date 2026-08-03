import { useCallback, useMemo, useRef, useState } from 'preact/hooks';
import type { Editor } from '../../circuit-builder/editor/Editor.ts';
import { EditorContext, useEditor } from '../editorContext.ts';
import { componentEditorName, createComponentEditor } from '../componentNav.ts';
import { notifyStateChange, openComponentId, testEditorVisible } from '../editorStore.ts';
import { navigateTo } from '../screenManager.ts';
import { CircuitWorkspace } from '../components/CircuitWorkspace.tsx';
import { WireSwatches } from '../components/WireSwatches.tsx';
import { buildComponentDefinition } from '../../circuit-builder/components/componentBuilder.ts';
import { saveComponent, deleteComponent } from '../../circuit-builder/components/componentRegistry.ts';
import { clearComponentDefCache } from '../../circuit-builder/editor/gates.ts';
import type { ComponentId } from '../../circuit-builder/editor/types.ts';

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

  // Through refs, because the autosave timer is bound once: a closure over the state would
  // keep saving under the name the editor opened with and — with componentId still null —
  // file every autosave as another new component.
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
      // The applied tests belong to the editing session, not to anything derived from the
      // circuit, so they are attached here rather than inside the builder.
      const tests = editor.tests.source;
      saveComponent(tests === null ? def : { ...def, tests });
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

  const save = useCallback(() => { persist(); }, [persist]);

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

  const toolbar = (
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
  );

  // No onAllPassed: a component has nothing to unlock when its tests go green.
  return <CircuitWorkspace toolbar={toolbar} save={save} />;
}
