import { navigateTo } from './screenManager.ts';
import { editComponent } from './componentNav.ts';
import { requestLevel } from '../circuit-builder/levels/levelManager.ts';
import { LEVELS } from '../circuit-builder/levels/registry.ts';
import { getComponent } from '../circuit-builder/components/componentRegistry.ts';
import { isLevelUnlocked } from '../circuit-builder/persistence/storage.ts';
import { isBuiltInGateType } from '../circuit-builder/editor/gates.ts';
import type { GateType } from '../circuit-builder/simulation/gateTypes.ts';
import type { ComponentId, LevelId } from '../circuit-builder/editor/types.ts';

/** Where a gate is defined, when it is somewhere the player can open. */
export type GateDefinitionRef =
  | { kind: 'component'; id: ComponentId; name: string }
  | { kind: 'level'; index: number; name: string; unlocked: boolean };

/**
 * The level or component a gate comes from, or null for a primitive.
 *
 * A built-in gate is matched to its level *by id*: a level that teaches a gate is named
 * after it (`and` ↔ `and`), the same convention that makes a component's id its gate type.
 * Gates with nothing to open — IO, constants, splitters, the NAND primitive itself — simply
 * have no level of that name, so no lookup table has to be kept in step with the level list.
 */
export function findGateDefinition(
  type: GateType,
  solvedIds: Set<LevelId>,
): GateDefinitionRef | null {
  if (!isBuiltInGateType(type)) {
    const component = getComponent(type as ComponentId);
    return component ? { kind: 'component', id: component.id, name: component.name } : null;
  }

  const index = LEVELS.findIndex(level => level.id === (type as string));
  if (index === -1) return null;

  const level = LEVELS[index];
  return {
    kind: 'level',
    index,
    name: level.name,
    unlocked: isLevelUnlocked(level, solvedIds),
  };
}

/**
 * Open what `findGateDefinition` found. A locked level is not navigable — the level map
 * would not let the player in either — so it is ignored here rather than checked by callers.
 */
export function openGateDefinition(ref: GateDefinitionRef): void {
  if (ref.kind === 'component') {
    editComponent(ref.id);
    return;
  }
  if (!ref.unlocked) return;
  requestLevel(ref.index);
  navigateTo('editor');
}
