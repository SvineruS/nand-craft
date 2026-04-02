import type { Editor } from './editor/Editor.ts';

/** Current Editor instance — one per loaded level. */
let instance: Editor | null = null;

export function getEditor(): Editor {
  if (!instance) throw new Error('No editor — load a level first');
  return instance;
}

export function hasEditor(): boolean {
  return instance !== null;
}

export function setEditor(editor: Editor): void {
  instance = editor;
}
