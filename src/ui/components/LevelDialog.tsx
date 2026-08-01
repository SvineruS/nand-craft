import { levelDialogVisible } from '../editorStore.ts';
import { useEditor } from '../editorContext.ts';
import { FloatingWindow } from './FloatingWindow.tsx';

/**
 * What the level asks for — opened on entering a level and reopened by the Goals button.
 *
 * A window rather than a modal: the goals are what the player checks *while* building, and
 * a dialog that has to be dismissed first made re-reading them a chore.
 */
export function LevelDialog() {
  const { level } = useEditor();
  const visible = levelDialogVisible.value;

  // Nothing to introduce when the editor is not on a level (component / level map).
  if (!visible || !level) return null;

  return (
    <FloatingWindow
      id="goals"
      class="window-goals"
      title={level.name}
      onClose={() => { levelDialogVisible.value = false; }}
    >
      <div class="goals-body">
        <p class="goals-desc">{level.description}</p>
      </div>
    </FloatingWindow>
  );
}
