import { Editor } from '../circuit-builder/editor/Editor.ts';
import { Circuit } from '../circuit-builder/simulation/circuit.ts';
import { deserializeCircuit } from '../circuit-builder/persistence/serialize.ts';
import { getComponent } from '../circuit-builder/components/componentRegistry.ts';
import { navigateTo } from './screenManager.ts';
import { openComponentId } from './editorStore.ts';
import type { ComponentId } from '../circuit-builder/editor/types.ts';

/** Open the component editor for a new component. */
export function openComponentEditor(): void {
  openComponentId.value = null;
  navigateTo('componentEditor');
}

/** Open the component editor for an existing component. */
export function editComponent(id: ComponentId): void {
  if (!getComponent(id)) return;
  openComponentId.value = id;
  navigateTo('componentEditor');
}

/**
 * Build the Editor for the component editor screen: the saved component's circuit, or an
 * empty one for a new component. Called by the screen that owns the editor's lifetime.
 */
export function createComponentEditor(id: ComponentId | null): Editor {
  const def = id ? getComponent(id) : undefined;
  return Editor.create(def ? deserializeCircuit(def.circuit) : new Circuit());
}

/** Display name for the component being edited. */
export function componentEditorName(id: ComponentId | null): string {
  return (id && getComponent(id)?.name) || 'New Component';
}
