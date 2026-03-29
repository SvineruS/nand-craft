import { viewMode } from '../editorStore.ts';

export function SettingsScreen() {
  return (
    <div class="fullscreen-menu">
      <h1 class="menu-title">Settings</h1>
      <p class="menu-placeholder">Coming soon</p>
      <div class="menu-buttons">
        <button class="menu-btn" onClick={() => { viewMode.value = 'mainMenu'; }}>
          Back
        </button>
      </div>
    </div>
  );
}
