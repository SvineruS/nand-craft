/** What the page and the rendering worker say to each other. */
import type { MusicParams } from './player.ts';
import type { MusicThemeId } from './themes.ts';

export type MusicRequest =
  /** Build the player. Sent once, with the sample rate of the context that will play it. */
  | { kind: 'init'; sampleRate: number; theme: MusicThemeId; seed: number }
  /** Render the next stretch of music and post it back. */
  | { kind: 'render'; frames: number }
  /** Change theme. Takes effect at the end of the current chord, without a break. */
  | { kind: 'theme'; theme: MusicThemeId; seed: number }
  /** Turn any of the live controls. Anything not named is left where it is. */
  | { kind: 'params'; params: Partial<MusicParams> };

/** Finished audio, transferred rather than copied. */
export interface MusicChunk {
  // Spelled with the buffer type `copyToChannel` insists on; a plain Float32Array might be shared.
  left: Float32Array<ArrayBuffer>;
  right: Float32Array<ArrayBuffer>;
}
