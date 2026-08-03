/**
 * Runs `MusicPlayer` and posts back finished audio. Off the main thread because generating the
 * busiest theme costs a few percent of a core in bursts, and a burst inside the frame loop is a
 * dropped frame.
 *
 * A worker rather than the AudioWorklet this belongs in: a worklet's scope has no module loader,
 * and Vite's dev server serves it as ESM (`worker.format` does not change that), so it would work
 * built and fail in dev. The cost is preparing audio ahead — see the scheduler in `music.ts`.
 */
import { MusicPlayer } from './player.ts';
import { MUSIC_THEMES } from './themes.ts';
import type { MusicChunk, MusicRequest } from './musicProtocol.ts';

// DedicatedWorkerGlobalScope: adding the WebWorker lib would change what all of `src` sees.
declare const self: {
  onmessage: ((event: MessageEvent<MusicRequest>) => void) | null;
  postMessage(chunk: MusicChunk, transfer: Transferable[]): void;
};

let player: MusicPlayer | null = null;

self.onmessage = event => {
  const request = event.data;
  switch (request.kind) {
    case 'init':
      player = new MusicPlayer(request.sampleRate, MUSIC_THEMES[request.theme], request.seed);
      return;
    case 'render':
      render(request.frames);
      return;
    case 'theme':
      player?.setTheme(MUSIC_THEMES[request.theme], request.seed);
      return;
    case 'params':
      player?.setParams(request.params);
  }
};

function render(frames: number): void {
  if (!player) return;
  // A fresh pair each time, since transferring them leaves the worker's own references detached.
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  player.render(left, right, frames);
  self.postMessage({ left, right }, [left.buffer, right.buffer]);
}
