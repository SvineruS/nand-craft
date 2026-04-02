import { getEditor } from '../circuit-builder/editorInstance.ts';
import { notifyStateChange, viewMode } from './editorStore.ts';

export function switchToLevelMap(): void {
  const editor = getEditor();
  editor.save();
  viewMode.value = 'levelSelect';
  notifyStateChange();
}
