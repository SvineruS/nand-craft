import { useState } from 'preact/hooks';
import { navigateTo } from '../screenManager.ts';
import { ControlsWindow } from '../components/ControlsWindow.tsx';

export function MainMenuScreen() {
  const [showControls, setShowControls] = useState(false);

  return (
    <div class="fullscreen-menu">
      <h1 class="menu-title">NAND Craft</h1>
      <div class="menu-buttons">
        <button class="menu-btn" onClick={() => navigateTo('levelSelect')}>
          Level Select
        </button>
        <button class="menu-btn" onClick={() => setShowControls(true)}>
          Controls
        </button>
        <button class="menu-btn" onClick={() => navigateTo('settings')}>
          Settings
        </button>
      </div>

      {showControls && <ControlsWindow onClose={() => setShowControls(false)} />}
    </div>
  );
}
