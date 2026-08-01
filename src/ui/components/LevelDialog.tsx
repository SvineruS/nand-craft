import { levelDialogVisible } from '../editorStore.ts';
import { useEditor } from '../editorContext.ts';
import { FloatingWindow } from './FloatingWindow.tsx';
import { renderMarkdown } from '../markdown.tsx';

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
      {/* Descriptions are Markdown, so a level can spell out a table or an opcode in `code`. */}
      <div class="markdown-body">{renderMarkdown(level.description)}</div>
    </FloatingWindow>
  );
}
