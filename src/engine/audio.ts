/**
 * Sound playback: one AudioContext, each file decoded once and replayed from its buffer.
 *
 * Web Audio rather than `<audio>` elements, because a click has to be able to overlap itself —
 * two gates placed in quick succession are two sounds, not one restarted one — and a decoded
 * buffer costs nothing to play again.
 *
 * Knows nothing about the game: it plays a url. Which sound means what is `circuit-builder/sfx.ts`.
 */

/** Ignore a repeat of the same sound inside this window, so a held key is not a machine gun. */
const REPEAT_GUARD_MS = 40;

let context: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 1;

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

/** Master volume, 0 silences everything (and stops sounds being decoded at all). */
export function setMasterVolume(next: number): void {
  volume = Math.min(1, Math.max(0, next));
  if (master) master.gain.value = volume;
}

/**
 * Play a preloaded sound. Silent — never throwing — if it is muted, still loading, or failed:
 * audio is feedback, and a missing file must not break the interaction that triggered it.
 */
export function playSound(url: string, gain = 1): void {
  if (volume === 0) return;

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
    source.connect(master!);
  } else {
    const node = ctx.createGain();
    node.gain.value = gain;
    source.connect(node).connect(master!);
  }
  source.start();
  lastPlayed.set(url, now);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function ensureContext(): AudioContext {
  if (!context) {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = volume;
    master.connect(context.destination);
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
