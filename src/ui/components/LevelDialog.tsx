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

  const close = () => { levelDialogVisible.value = false; };

  return (
    <FloatingWindow id="goals" class="window-goals" title={level.name} onClose={close}>
      {/* Descriptions are Markdown, so a level can spell out a table or an opcode in `code`. */}
      <div class="markdown-body">{renderMarkdown(level.description)}</div>

      {/*
        The window opens by itself on entering a level, so it needs an obvious way out for a
        player who has just read it — the ✕ is for closing something you went looking for.
      */}
      <div class="goals-footer">
        <button class="window-btn is-primary" onClick={close}>Continue</button>
      </div>
    </FloatingWindow>
  );
}
