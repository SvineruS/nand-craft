import { navigateTo } from '../screenManager.ts';

export function MainMenuScreen() {
  return (
    <div class="fullscreen-menu">
      <h1 class="menu-title">NAND Craft</h1>
      <div class="menu-buttons">
        <button class="menu-btn" onClick={() => navigateTo('levelSelect')}>
          Level Select
        </button>
        <button class="menu-btn" onClick={() => navigateTo('settings')}>
          Settings
        </button>
      </div>
    </div>
  );
}
