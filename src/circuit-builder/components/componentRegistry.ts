import type { ComponentId } from '../editor/types.ts';
import type { ComponentDefinition } from './componentTypes.ts';

const STORAGE_KEY = 'nand-craft:components';
const COMPONENT_PREFIX = 'nand-craft:component:';

/** In-memory component registry, backed by localStorage. */
const components = new Map<ComponentId, ComponentDefinition>();

export function loadAllComponents(): void {
  components.clear();
  const ids: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  for (const id of ids) {
    const json = localStorage.getItem(COMPONENT_PREFIX + id);
    if (json) {
      const def: ComponentDefinition = JSON.parse(json);
      components.set(id as ComponentId, def);
    }
  }
}

export function getComponent(id: ComponentId): ComponentDefinition | undefined {
  return components.get(id);
}

export function getAllComponents(): ComponentDefinition[] {
  return [...components.values()];
}

export function saveComponent(def: ComponentDefinition): void {
  components.set(def.id, def);
  persistIndex();
  localStorage.setItem(COMPONENT_PREFIX + def.id, JSON.stringify(def));
}

export function deleteComponent(id: ComponentId): void {
  components.delete(id);
  persistIndex();
  localStorage.removeItem(COMPONENT_PREFIX + id);
}

/** Fast check if a type string is a registered component (O(1) map lookup). */
export function isComponentType(type: string): boolean {
  return components.has(type as ComponentId);
}

function persistIndex(): void {
  const ids = [...components.keys()];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

// Load on module init
loadAllComponents();
