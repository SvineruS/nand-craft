/**
 * Renders the music to a wav, so it can be heard without a browser. Also reports how much faster
 * than real time it went, which is what says whether a thread can keep up.
 *
 *   npm run music:render                                    # 90s of tea/puzzle
 *   npm run music:render -- --soundtrack=coffee
 *   npm run music:render -- --mood=menu --seconds=45 --seed=7 --out=/tmp/menu.wav
 *   npm run music:render -- --sweep             # turns every control, then changes mood
 *   npm run music:render -- --all               # every soundtrack and mood, one file each
 *   npm run music:render -- --soundtrack=foregone --instruments=15,16,17
 */
import { writeFileSync } from 'node:fs';
import {
  DEFAULT_MUSIC_PARAMS, MusicPlayer, type MusicParams,
} from '../src/engine/music/player.ts';
import {
  DEFAULT_SOUNDTRACK, MOOD_IDS, SOUNDTRACK_IDS, themeOf,
  type MoodId, type SoundtrackId,
} from '../src/engine/music/themes.ts';
import { SCORES } from '../src/engine/music/scores.ts';
import type { ScoreVoice } from '../src/engine/music/score.ts';

const SAMPLE_RATE = 48000;
/** Frames per render call — small, like the game's, so the timing below means something. */
const RENDER_BLOCK = 128;

const options = parseArguments(process.argv.slice(2));

if (options.all) {
  for (const soundtrack of SOUNDTRACK_IDS) {
    for (const mood of MOOD_IDS) {
      renderTrack(soundtrack, mood, `music-${soundtrack}-${mood}.wav`);
    }
  }
} else {
  renderTrack(options.soundtrack, options.mood, options.out);
}

function renderTrack(soundtrack: SoundtrackId, mood: MoodId, out: string): void {
  if (options.instruments.length > 0) keepInstruments(options.instruments);
  const player = new MusicPlayer(SAMPLE_RATE, themeOf(soundtrack, mood), options.seed);
  const frames = Math.round(options.seconds * SAMPLE_RATE);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);

  const moves = options.sweep ? sweepMoves(player, mood) : [];
  let nextMove = 0;

  const startedAt = performance.now();
  const blockLeft = new Float32Array(RENDER_BLOCK);
  const blockRight = new Float32Array(RENDER_BLOCK);
  for (let offset = 0; offset < frames; offset += RENDER_BLOCK) {
    const count = Math.min(RENDER_BLOCK, frames - offset);

    // Turned mid-render, exactly as the game turns them mid-playback.
    const seconds = offset / SAMPLE_RATE;
    while (nextMove < moves.length && moves[nextMove].at <= seconds) {
      const move = moves[nextMove++];
      console.log(`  ${move.at.toFixed(0).padStart(3)}s  ${move.what}`);
      move.apply();
    }

    player.render(blockLeft, blockRight, count);
    left.set(blockLeft.subarray(0, count), offset);
    right.set(blockRight.subarray(0, count), offset);
  }
  const elapsedMs = performance.now() - startedAt;

  writeFileSync(out, encodeWav(left, right, SAMPLE_RATE));

  const peak = Math.max(peakOf(left), peakOf(right));
  console.log(`wrote ${out}`);
  console.log(
    `  ${soundtrack}/${mood}, ${player.bpm.toFixed(0)}bpm, seed ${options.seed},`
    + ` ${options.seconds}s`,
  );
  console.log(`  peak ${peak.toFixed(3)}, rms ${rmsOf(left).toFixed(3)}`);
  console.log(
    `  rendered in ${elapsedMs.toFixed(0)}ms — ${(options.seconds * 1000 / elapsedMs).toFixed(0)}x`
    + ` real time, ${(elapsedMs / options.seconds / 10).toFixed(2)}% of one core`,
  );
}

/**
 * Silences every instrument of every score but the ones named — the other half of the A/B against
 * `npm run music:solo`, which does the same to the original module.
 *
 * Mutates the registry rather than threading a filter through the player, because this is a
 * diagnostic that runs once in a process that then does nothing else.
 */
function keepInstruments(keep: number[]): void {
  for (const [id, playable] of Object.entries(SCORES)) {
    const voices: Record<number, ScoreVoice> = {};
    for (const [number, voice] of Object.entries(playable.voices)) {
      if (keep.includes(Number(number))) voices[Number(number)] = voice;
    }
    (SCORES as Record<string, unknown>)[id] = { score: playable.score, voices };
  }
  console.log(`  only instruments ${keep.join(',')}`);
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

interface Move {
  /** Seconds into the render. */
  at: number;
  what: string;
  apply: () => void;
}

/** Everything that can be changed while the music plays, one at a time, with room to hear each. */
function sweepMoves(player: MusicPlayer, from: MoodId): Move[] {
  const other: MoodId = from === 'menu' ? 'puzzle' : 'menu';
  const turn = (at: number, what: string, params: Partial<MusicParams>): Move => (
    { at, what, apply: () => player.setParams(params) }
  );

  return [
    turn(12, 'energy -0.4 — strip the arrangement back', { energy: -0.4 }),
    turn(28, 'energy +0.45 — everything on', { energy: 0.45 }),
    turn(44, 'brightness -1.2 — close the filters', { brightness: -1.2 }),
    turn(58, 'brightness +0.8, space 1.6 — open up, further away', { brightness: 0.8, space: 1.6 }),
    turn(72, 'tempo 1.18 — speed up', { tempo: 1.18 }),
    turn(86, 'tempo 0.85 — slow down', { tempo: 0.85 }),
    {
      at: 100,
      what: `mood -> ${other}, controls back to neutral — a new key, no break`,
      apply: () => {
        player.setParams(DEFAULT_MUSIC_PARAMS);
        player.setTheme(themeOf(options.soundtrack, other));
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

interface Options {
  soundtrack: SoundtrackId;
  mood: MoodId;
  seconds: number;
  seed: number;
  out: string;
  sweep: boolean;
  all: boolean;
  /** Score instrument numbers to keep, for hearing or measuring one part on its own. */
  instruments: number[];
}

function parseArguments(args: string[]): Options {
  const flags = new Map<string, string>();
  for (const arg of args) {
    const match = /^--([a-z]+)(?:=(.*))?$/.exec(arg);
    if (match) flags.set(match[1], match[2] ?? '');
  }
  const sweep = flags.has('sweep');

  const soundtrack = flags.get('soundtrack') ?? DEFAULT_SOUNDTRACK;
  if (!SOUNDTRACK_IDS.includes(soundtrack as SoundtrackId)) {
    console.error(`unknown soundtrack "${soundtrack}" — one of: ${SOUNDTRACK_IDS.join(', ')}`);
    process.exit(1);
  }
  const mood = flags.get('mood') ?? 'puzzle';
  if (!MOOD_IDS.includes(mood as MoodId)) {
    console.error(`unknown mood "${mood}" — one of: ${MOOD_IDS.join(', ')}`);
    process.exit(1);
  }

  return {
    soundtrack: soundtrack as SoundtrackId,
    mood: mood as MoodId,
    // Long enough for the sweep to get through every move it makes.
    seconds: Number(flags.get('seconds') ?? (sweep ? 120 : 90)),
    seed: Number(flags.get('seed') ?? 1),
    out: flags.get('out') ?? `music-${sweep ? 'sweep-' : ''}${soundtrack}-${mood}.wav`,
    sweep,
    all: flags.has('all'),
    instruments: (flags.get('instruments') ?? '').split(',').filter(Boolean).map(Number),
  };
}

// ---------------------------------------------------------------------------
// Wav
// ---------------------------------------------------------------------------

/** 16-bit stereo PCM. Every player on the machine reads it, which is the whole requirement. */
function encodeWav(left: Float32Array, right: Float32Array, sampleRate: number): Buffer {
  const frames = left.length;
  const dataBytes = frames * 4;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVEfmt ', 8, 'ascii');
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(2, 22); // channels
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 4, 28); // bytes per second
  buffer.writeUInt16LE(4, 32); // bytes per frame
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < frames; i++) {
    buffer.writeInt16LE(toPcm(left[i]), 44 + i * 4);
    buffer.writeInt16LE(toPcm(right[i]), 46 + i * 4);
  }
  return buffer;
}

function toPcm(sample: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
}

function peakOf(samples: Float32Array): number {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return peak;
}

function rmsOf(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}
