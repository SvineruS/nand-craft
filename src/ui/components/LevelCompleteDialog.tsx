import { useEditor } from '../editorContext.ts';

interface LevelCompleteDialogProps {
  onLevelMap: () => void;
  onClose: () => void;
}

export function LevelCompleteDialog({ onLevelMap, onClose }: LevelCompleteDialogProps) {
  const { level } = useEditor();

  return (
    <div class="level-dialog-overlay">
      <div class="level-dialog-card">
        <h2 class="level-dialog-title">Level Complete!</h2>
        <p class="level-dialog-desc">
          You solved <strong>{level.name}</strong>. All test cases passed.
        </p>

        <div class="level-dialog-btn-row">
          <button class="level-dialog-start-btn" onClick={onClose}>
            Continue
          </button>
          <button class="level-dialog-start-btn" onClick={() => { onClose(); onLevelMap(); }}>
            Level Map
          </button>
        </div>
      </div>
    </div>
  );
}
