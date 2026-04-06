import { Editor } from '../circuit-builder/editor/Editor.ts';
import { Circuit } from '../circuit-builder/simulation/circuit.ts';
import { setEditor, hasEditor, getEditor } from '../circuit-builder/editorInstance.ts';
import { deserializeCircuit } from '../circuit-builder/persistence/serialize.ts';
import { getComponent } from '../circuit-builder/components/componentRegistry.ts';
import { setEditingComponent } from './screens/ComponentEditorScreen.tsx';
import { navigateTo } from './screenManager.ts';
import type { ComponentId } from '../circuit-builder/editor/types.ts';

/** Open the component editor for a new component. */
export function openComponentEditor(): void {
  if (hasEditor()) getEditor().save();
  const editor = Editor.create(new Circuit());
  setEditor(editor);
  setEditingComponent(null);
  navigateTo('componentEditor');
}

/** Open the component editor for an existing component. */
export function editComponent(id: ComponentId): void {
  if (hasEditor()) getEditor().save();
  const def = getComponent(id);
  if (!def) return;
  const circuit = deserializeCircuit(def.circuit);
  const editor = Editor.create(circuit);
  setEditor(editor);
  setEditingComponent(id, def.name);
  navigateTo('componentEditor');
}
