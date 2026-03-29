import { viewMode } from '../editorStore.ts';

export function MainMenuScreen() {
  return (
    <div class="fullscreen-menu">
      <h1 class="menu-title">NAND Craft</h1>
      <div class="menu-buttons">
        <button class="menu-btn" onClick={() => { viewMode.value = 'levelSelect'; }}>
          Level Select
        </button>
        <button class="menu-btn" onClick={() => { viewMode.value = 'factory'; }}>
          Factory
        </button>
        <button class="menu-btn" onClick={() => { viewMode.value = 'settings'; }}>
          Settings
        </button>
      </div>
    </div>
  );
}
