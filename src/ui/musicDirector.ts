/**
 * When the music plays and which theme it is: a screen implies a theme, and nothing can start
 * before the player has touched the page — a context made before any gesture starts suspended.
 */
import { effect, signal } from '@preact/signals';
import { resumeAudio } from '../engine/audio.ts';
import { playMusic, stopMusic } from '../engine/music/music.ts';
import type { MoodId } from '../engine/music/themes.ts';
import { musicVolume, soundtrackId, viewMode } from './editorStore.ts';
import type { ViewMode } from './editorStore.ts';

/**
 * Screens share a mood where switching would be churn: settings with the menu, the component
 * editor with the level editor. Exhaustive over ViewMode, so a new screen cannot be silent by
 * accident — the legacy factory prototype borrows the map's on those terms.
 */
const MOOD_BY_VIEW = {
  mainMenu: 'menu',
  settings: 'menu',
  levelSelect: 'map',
  levelMapEditor: 'map',
  editor: 'puzzle',
  componentEditor: 'puzzle',
  factory: 'map',
} as const satisfies Record<ViewMode, MoodId>;

/** A signal rather than a flag, so the one effect below covers the first start too. */
const unlocked = signal(false);

/** Called once at startup, from main.tsx. */
export function installMusic(): void {
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  // Screen, soundtrack and volume together: muting stops the generator instead of turning it
  // down, and changing soundtrack hands over on a chord boundary like any other switch.
  effect(() => {
    const mood = MOOD_BY_VIEW[viewMode.value];
    const soundtrack = soundtrackId.value;
    const volume = musicVolume.value;
    if (!unlocked.value) return;
    if (volume === 0) stopMusic();
    else playMusic(soundtrack, mood);
  });
}

function unlock(): void {
  resumeAudio();
  unlocked.value = true;
}
