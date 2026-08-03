import { render } from 'preact';
import { App } from './ui/App.tsx';
import { preloadSfx } from './circuit-builder/sfx.ts';
import { installUiSounds } from './ui/uiSounds.ts';
import { installMusic } from './ui/musicDirector.ts';
import './ui/style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
render(<App />, app);

// Decoded now rather than on first use: a click is feedback, and feedback that arrives after
// the click reads as a glitch.
preloadSfx();
installUiSounds();
// Waits for the first press: an audio context made before a gesture starts suspended.
installMusic();
