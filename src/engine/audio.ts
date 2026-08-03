/**
 * Sound playback: one AudioContext, each file decoded once and replayed from its buffer.
 *
 * Web Audio rather than `<audio>` elements, because a click has to be able to overlap itself —
 * two gates placed in quick succession are two sounds, not one restarted one — and a decoded
 * buffer costs nothing to play again.
 *
 * Also the one owner of the context, and of the two buses everything audible hangs off:
 * effects here, music on the bus `music/music.ts` asks for. Two buses rather than one because
 * the settings screen offers a slider each, and because music that ducks under a sound effect
 * would need them separate anyway.
 *
 * Knows nothing about the game: it plays a url. Which sound means what is `circuit-builder/sfx.ts`.
 */

/** Ignore a repeat of the same sound inside this window, so a held key is not a machine gun. */
const REPEAT_GUARD_MS = 40;

let context: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let sfxVolume = 1;
let musicVolume = 1;

/** Decoded buffers by url. A url that failed to load maps to null, so it is not retried. */
const buffers = new Map<string, AudioBuffer | null>();
const lastPlayed = new Map<string, number>();

/**
 * Fetch and decode ahead of time, so the first click of each kind is not the silent one.
 *
 * Safe to call before the player has interacted: constructing a context is allowed, it just
 * starts suspended, and decoding works while it is. Only *starting* a sound needs the gesture,
 * and every sound in this game is one.
 */
export function preloadSounds(urls: readonly string[]): void {
  for (const url of urls) void load(url);
}

/** Sound-effect volume, 0 silences them (and stops sounds being decoded at all). */
export function setSfxVolume(next: number): void {
  sfxVolume = clampVolume(next);
  if (sfxBus) sfxBus.gain.value = sfxVolume;
}

/** Music volume, applied to the music bus. 0 is how the music is turned off. */
export function setMusicVolume(next: number): void {
  musicVolume = clampVolume(next);
  if (musicBus) musicBus.gain.value = musicVolume;
}

/** The context, created on first use. Suspended until a gesture — see `resumeAudio`. */
export function getAudioContext(): AudioContext {
  return ensureContext();
}

/** Where the music generator connects. */
export function getMusicBus(): GainNode {
  ensureContext();
  return musicBus!;
}

/**
 * Resume the context, which browsers only allow from inside a user gesture.
 *
 * Sound effects get this for free — each one is a click — but music has to start on its own, so
 * something has to tell the audio layer that a gesture has happened. `ui/musicDirector.ts` does.
 */
export function resumeAudio(): void {
  const ctx = ensureContext();
  if (ctx.state === 'suspended') void ctx.resume();
}

/** Whether sound will actually be heard, rather than queued behind the autoplay policy. */
export function isAudioRunning(): boolean {
  return context !== null && context.state === 'running';
}

/**
 * Play a preloaded sound. Silent — never throwing — if it is muted, still loading, or failed:
 * audio is feedback, and a missing file must not break the interaction that triggered it.
 */
export function playSound(url: string, gain = 1): void {
  if (sfxVolume === 0) return;

  const now = performance.now();
  if (now - (lastPlayed.get(url) ?? -Infinity) < REPEAT_GUARD_MS) return;

  const buffer = buffers.get(url);
  if (buffer === undefined) {
    // Not loaded yet: start it, but do not play late — a click heard 300ms after the click
    // reads as a glitch rather than as feedback.
    void load(url);
    return;
  }
  if (buffer === null) return;

  const ctx = ensureContext();
  // Suspended until the page has been interacted with; resuming is only allowed from a gesture,
  // which is where every one of these calls comes from.
  if (ctx.state === 'suspended') void ctx.resume();

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  if (gain === 1) {
    source.connect(sfxBus!);
  } else {
    const node = ctx.createGain();
    node.gain.value = gain;
    source.connect(node).connect(sfxBus!);
  }
  source.start();
  lastPlayed.set(url, now);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function clampVolume(volume: number): number {
  return Math.min(1, Math.max(0, volume));
}

function ensureContext(): AudioContext {
  if (!context) {
    context = new AudioContext();
    sfxBus = context.createGain();
    sfxBus.gain.value = sfxVolume;
    sfxBus.connect(context.destination);
    musicBus = context.createGain();
    musicBus.gain.value = musicVolume;
    musicBus.connect(context.destination);
  }
  return context;
}

/** In-flight loads, so two plays in the same frame share one fetch. */
const loading = new Map<string, Promise<void>>();

function load(url: string): Promise<void> {
  if (buffers.has(url)) return Promise.resolve();
  const already = loading.get(url);
  if (already) return already;

  const task = (async () => {
    try {
      const response = await fetch(url);
      const bytes = await response.arrayBuffer();
      buffers.set(url, await ensureContext().decodeAudioData(bytes));
    } catch (e) {
      console.error(`Failed to load sound ${url}:`, e);
      buffers.set(url, null);
    } finally {
      loading.delete(url);
    }
  })();

  loading.set(url, task);
  return task;
}
