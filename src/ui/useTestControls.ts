import { useCallback } from 'preact/hooks';
import { useEditor } from './editorContext.ts';
import { notifyStateChange } from './editorStore.ts';

/**
 * The four TestPanel buttons, for whichever editor is open.
 *
 * No longer aware that there are two test modes: `editor.tests` picks the engine from its
 * mode and these four call it. This hook used to branch on `tests.mode` to choose between
 * two pairs of methods — a second copy of a decision LevelTests was already making.
 *
 * `onAllPassed` fires when a run finishes green — the level editor marks the level solved,
 * the component editor has nothing to do.
 */
export function useTestControls(onAllPassed?: () => void) {
  const editor = useEditor();

  const handleReset = useCallback(() => {
    editor.tests.reset();
    notifyStateChange();
  }, [editor]);

  const handleStep = useCallback(() => {
    const { tests } = editor;
    tests.step();
    if (tests.allPassed()) onAllPassed?.();
    notifyStateChange();
  }, [editor, onAllPassed]);

  const handleRunAll = useCallback(() => {
    editor.tests.runAnimated(() => notifyStateChange(), () => onAllPassed?.());
  }, [editor, onAllPassed]);

  const handlePause = useCallback(() => {
    editor.tests.cancelRunAll();
    notifyStateChange();
  }, [editor]);

  return { handleReset, handleStep, handleRunAll, handlePause };
}
