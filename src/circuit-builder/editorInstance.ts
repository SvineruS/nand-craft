import { Editor } from './editor/Editor.ts';

/** Singleton Editor — state persists across screen switches. */
let instance: Editor | null = null;

export function getEditor(): Editor {
  return instance ??= new Editor();
}
