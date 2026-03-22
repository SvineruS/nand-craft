import { currentLevel, levelDialogVisible } from './editorStore.ts';

export function LevelDialog() {
  const level = currentLevel.value;
  const visible = levelDialogVisible.value;

  if (!visible || !level) return null;

  return (
    <div class="level-dialog-overlay">
      <div class="level-dialog-card">
        <h2 class="level-dialog-title">{level.name}</h2>
        <p class="level-dialog-desc">{level.description}</p>

        <div class="level-dialog-io-section">
          <PinList heading="Inputs" pins={level.inputs} />
          <PinList heading="Outputs" pins={level.outputs} />
        </div>

        <div class="level-dialog-mode-badge">
          {level.mode === 'combinational' ? 'Combinational' : 'Sequential'}
        </div>

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

function PinList({ heading, pins }: { heading: string; pins: { name: string; bitWidth: number }[] }) {
  return (
    <div class="level-dialog-pin-list">
      <div class="level-dialog-pin-heading">{heading}</div>
      {pins.map((pin) => (
        <div class="level-dialog-pin-item" key={pin.name}>
          {pin.bitWidth > 1 ? `${pin.name} [${pin.bitWidth}-bit]` : pin.name}
        </div>
      ))}
    </div>
  );
}
