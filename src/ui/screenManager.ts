import { getEditor } from '../circuit-builder/editorInstance.ts';
import { saveCircuit } from '../circuit-builder/persistence/storage.ts';
import {
  currentLevel,
  viewMode,
  notifyStateChange,
} from './editorStore.ts';

export function switchToLevelMap(): void {
  if (currentLevel.value) {
    saveCircuit(currentLevel.value.id, getEditor().getCircuit());
  }
  viewMode.value = 'levelSelect';
  notifyStateChange();
}
