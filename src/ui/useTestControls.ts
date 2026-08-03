import { useCallback } from 'preact/hooks';
import { useEditor } from './editorContext.ts';
import { notifyStateChange } from './editorStore.ts';
import { playSfx } from '../circuit-builder/sfx.ts';

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

  /**
   * A run is over, one way or the other.
   *
   * A green run in a level is answered by the level-complete fanfare that `onAllPassed` sets
   * off, so the plain chime would only play over it — it is for the editors that have nothing
   * to unlock.
   */
  const finish = useCallback((passed: boolean) => {
    if (!passed) {
      playSfx('testsFailed');
      return;
    }
    if (onAllPassed) onAllPassed();
    else playSfx('testsPassed');
  }, [onAllPassed]);

  const handleReset = useCallback(() => {
    editor.tests.reset();
    notifyStateChange();
  }, [editor]);

  const handleStep = useCallback(() => {
    const { tests } = editor;
    tests.step();
    // The step that ends the run is announced as the ending, not as another step.
    if (tests.allPassed() || tests.failed) finish(tests.allPassed());
    else playSfx('testStep');
    notifyStateChange();
  }, [editor, finish]);

  const handleRunAll = useCallback(() => {
    editor.tests.runAnimated(() => notifyStateChange(), finish);
  }, [editor, finish]);

  const handlePause = useCallback(() => {
    editor.tests.cancelRunAll();
    notifyStateChange();
  }, [editor]);

  return { handleReset, handleStep, handleRunAll, handlePause };
}
