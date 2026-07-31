import { levelDialogVisible } from '../editorStore.ts';
import { useEditor } from '../editorContext.ts';

export function LevelDialog() {
  const { level } = useEditor();
  const visible = levelDialogVisible.value;

  if (!visible) return null;

  return (
    <div class="level-dialog-overlay">
      <div class="level-dialog-card">
        <h2 class="level-dialog-title">{level.name}</h2>
        <p class="level-dialog-desc">{level.description}</p>

        <div class="level-dialog-btn-row">
          <button
            class="level-dialog-start-btn"
            onClick={() => {
              levelDialogVisible.value = false;
            }}
          >
            Start
          </button>
        </div>
      </div>
    </div>
  );
}
