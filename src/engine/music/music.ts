/**
 * Starting, switching and stopping the music. The page's whole view of the synth; *when* it plays
 * is `ui/musicDirector.ts`.
 *
 * Each chunk is scheduled to start where the last one ended, by the audio clock rather than a
 * timer, so consecutive chunks are one continuous signal. The timer only asks for more in time.
 */
import { getAudioContext, getMusicBus } from '../audio.ts';
import MusicWorker from './musicWorker.ts?worker';
import type { MusicChunk, MusicRequest } from './musicProtocol.ts';
import type { MusicParams } from './player.ts';
import type { MusicThemeId } from './themes.ts';

/** Fixed, so it is the same piece every session and `music:render` renders what players hear. */
const MUSIC_SEED = 0x1a7e;

/** Seconds of audio per chunk. */
const CHUNK_SECONDS = 0.25;
/**
 * How far ahead of the speakers to keep the queue. Everything queued predates a change, so a wide
 * queue makes the music unresponsive; too narrow and a busy main thread leaves a gap.
 */
const LOOKAHEAD_SECONDS = 1;
/** How often to top the queue up. Well inside the lookahead, so a late tick is still early. */
const TOPUP_INTERVAL_MS = 150;
/** Requests allowed in flight, so a stalled worker cannot be asked for a hundred chunks. */
const MAX_PENDING_CHUNKS = 6;

/** Seconds before the first chunk plays — time for the queue to fill. */
const START_DELAY_SECONDS = 0.2;
/** Seconds the music takes to arrive, so it is never a sudden noise after a click. */
const START_FADE_SECONDS = 2.5;
/** Seconds to fade before the worker is dropped. */
const STOP_FADE_SECONDS = 0.6;

let worker: Worker | null = null;
/** The music's own fade, kept apart from the music bus so it cannot fight the volume setting. */
let fade: GainNode | null = null;
let timer: number | null = null;

/** Audio-clock time the next chunk starts at — the queue's leading edge. */
let queuedUntil = 0;
/** Chunks asked for and not yet received. */
let pending = 0;
/** Scheduled sources, so stopping can silence what is already queued. */
const sources = new Set<AudioBufferSourceNode>();

/** What the game last asked for, so a theme set before the worker exists is not lost. */
let wanted: { theme: MusicThemeId; seed: number } | null = null;
/** Controls set so far, replayed to a worker that starts after they were turned. */
const wantedParams: Partial<MusicParams> = {};

/**
 * Play a theme, or switch to it. Calling it with what is already playing is not a restart; a
 * switch lands at the end of the current chord, so it arrives a second or two later.
 */
export function playMusic(theme: MusicThemeId, seed = MUSIC_SEED): void {
  const already = wanted;
  wanted = { theme, seed };
  if (worker) {
    if (already?.theme !== theme || already.seed !== seed) send({ kind: 'theme', theme, seed });
    return;
  }
  start();
}

/**
 * Turn the live controls: `energy`, `brightness`, `tempo`, `space`. Anything left out stays put.
 * Each glides over a couple of seconds and interrupts nothing, but is heard about a second later —
 * this suits a mood following the game, not a sound answering a click.
 */
export function setMusicParams(params: Partial<MusicParams>): void {
  Object.assign(wantedParams, params);
  send({ kind: 'params', params });
}

/** Fade out and let the worker go, so a muted game is not still generating audio it discards. */
export function stopMusic(): void {
  wanted = null;
  if (!worker || !fade) return;

  const stopping = worker;
  const stoppingFade = fade;
  const stoppingSources = [...sources];
  worker = null;
  fade = null;
  sources.clear();
  pending = 0;
  if (timer !== null) window.clearInterval(timer);
  timer = null;

  rampTo(stoppingFade, 0, STOP_FADE_SECONDS);
  // Scheduled sources must be stopped by hand — disconnecting the gain node still lets them run.
  window.setTimeout(() => {
    stopping.terminate();
    for (const source of stoppingSources) source.stop();
    stoppingFade.disconnect();
  }, (STOP_FADE_SECONDS + 0.1) * 1000);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function start(): void {
  if (worker || !wanted) return;
  const context = getAudioContext();

  fade = context.createGain();
  fade.gain.value = 0;
  fade.connect(getMusicBus());

  worker = new MusicWorker();
  worker.onmessage = event => acceptChunk(event.data as MusicChunk);
  // A dead worker costs the music and nothing else — the same bargain the sound effects make.
  worker.onerror = error => {
    console.error('Music worker failed:', error.message);
    stopMusic();
  };

  send({ kind: 'init', sampleRate: context.sampleRate, theme: wanted.theme, seed: wanted.seed });
  if (Object.keys(wantedParams).length > 0) send({ kind: 'params', params: wantedParams });
  queuedUntil = context.currentTime + START_DELAY_SECONDS;
  rampTo(fade, 1, START_FADE_SECONDS);
  requestChunks();
  timer = window.setInterval(requestChunks, TOPUP_INTERVAL_MS);
}

/** Ask for as many chunks as the lookahead is short of, counting the ones already asked for. */
function requestChunks(): void {
  if (!worker) return;
  const context = getAudioContext();
  const frames = Math.round(CHUNK_SECONDS * context.sampleRate);
  while (
    queuedUntil + pending * CHUNK_SECONDS - context.currentTime < LOOKAHEAD_SECONDS
    && pending < MAX_PENDING_CHUNKS
  ) {
    send({ kind: 'render', frames });
    pending++;
  }
}

function acceptChunk(chunk: MusicChunk): void {
  pending = Math.max(0, pending - 1);
  if (!worker || !fade) return;

  const context = getAudioContext();
  const buffer = context.createBuffer(2, chunk.left.length, context.sampleRate);
  buffer.copyToChannel(chunk.left, 0);
  buffer.copyToChannel(chunk.right, 1);

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(fade);

  // Behind the clock means the page stalled past the lookahead: take one seam now rather than
  // have every later chunk inherit the delay.
  if (queuedUntil < context.currentTime) queuedUntil = context.currentTime + 0.05;
  source.start(queuedUntil);
  queuedUntil += buffer.duration;

  sources.add(source);
  source.onended = () => sources.delete(source);
}

function send(request: MusicRequest): void {
  worker?.postMessage(request);
}

function rampTo(gain: GainNode, target: number, seconds: number): void {
  const { currentTime } = getAudioContext();
  gain.gain.cancelScheduledValues(currentTime);
  gain.gain.setValueAtTime(gain.gain.value, currentTime);
  gain.gain.linearRampToValueAtTime(target, currentTime + seconds);
}
