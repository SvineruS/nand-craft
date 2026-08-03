import { useCallback } from 'preact/hooks';
import { useEditor } from './editorContext.ts';
import { notifyStateChange } from './editorStore.ts';

/**
 * The four TestPanel buttons, for whichever editor is open.
 *
 * Shared rather than written per screen because both modes have to be handled in one place:
 * a queue suite has no table cases, so the table-mode calls (`step`, `runAllAnimated`) return
 * without doing anything and the buttons look dead.
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
    tests.cancelRunAll();
    if (tests.mode === 'queue') {
      stepQueueOnce(tests);
    } else {
      const result = tests.step();
      if (result) {
        if (tests.allPassed()) onAllPassed?.();
      } else if (tests.finished) {
        tests.reset();
        tests.step();
      }
    }
    notifyStateChange();
  }, [editor, onAllPassed]);

  const handleRunAll = useCallback(() => {
    const { tests } = editor;
    const onComplete = () => onAllPassed?.();
    if (tests.mode === 'queue') {
      tests.runQueueAnimated(() => notifyStateChange(), onComplete);
    } else {
      tests.runAllAnimated(() => notifyStateChange(), onComplete);
    }
  }, [editor, onAllPassed]);

  const handlePause = useCallback(() => {
    editor.tests.cancelRunAll();
    notifyStateChange();
  }, [editor]);

  return { handleReset, handleStep, handleRunAll, handlePause };
}

/** Advance a queue run by one tick, restarting it first if it has finished or not begun. */
function stepQueueOnce(tests: ReturnType<typeof useEditor>['tests']): void {
  if (tests.queueDone || tests.queueFailed) tests.reset();
  if (tests.queueCommandIndex < 0) tests.startQueue(tests.queueCommands);
  tests.tickQueue();
}
