import { Editor } from '../circuit-builder/editor/Editor.ts';
import { Circuit } from '../circuit-builder/simulation/circuit.ts';
import { deserializeCircuit } from '../circuit-builder/persistence/serialize.ts';
import { getComponent } from '../circuit-builder/components/componentRegistry.ts';
import { applyTestSource } from '../circuit-builder/testing/applyTests.ts';
import { SANDBOX_MAP_SIZE } from '../circuit-builder/editor/utils/mapBounds.ts';
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
 *
 * Gets the sandbox's map rather than the default one: a component is a whole sub-machine,
 * built the same way a sandbox circuit is, so it needs the same room to sprawl.
 */
export function createComponentEditor(id: ComponentId | null): Editor {
  const def = id ? getComponent(id) : undefined;
  const editor = Editor.create(
    def ? deserializeCircuit(def.circuit) : new Circuit(), SANDBOX_MAP_SIZE,
  );
  // The tests saved with the component, back in force without the player pressing Apply again.
  // Ignored if they no longer apply — the text is still in the test editor to be fixed.
  if (def?.tests) applyTestSource(editor, def.tests);
  return editor;
}

/**
 * Display name for the component being edited.
 *
 * A new component gets a generated name rather than a placeholder: autosave has to file it
 * under something long before the player thinks to type a name, and every unnamed circuit
 * sharing one would make them indistinguishable in the sidebar.
 */
export function componentEditorName(id: ComponentId | null): string {
  return (id && getComponent(id)?.name) || randomComponentName();
}

function randomComponentName(): string {
  const suffix = Math.floor(Math.random() * 0x10000).toString(16).toUpperCase().padStart(4, '0');
  return `Circuit ${suffix}`;
}
