/**
 * How close two renders are, as a number rather than an opinion.
 *
 * Written for the transcribed soundtrack, whose whole claim is that it resembles a real tracker
 * module. Render the original with `openmpt123 --render --samplerate 48000 file.it`, render ours
 * with `npm run music:render`, and compare:
 *
 *   npm run music:compare -- --a=ref.it.wav --b=music-foregone-puzzle.wav
 *   npm run music:compare -- --a=ref.it.wav --b=mine.wav --seconds=30 --from=148
 *   npm run music:compare -- --a=one.wav --spectrum         # just what is in one file
 *
 * Both files are binned into semitones every half second and the two spectra compared by cosine.
 * That measures *what notes are sounding in what balance*, which is what "the same piece" means —
 * it is deliberately blind to timbre, so a good number here still needs an ear on it.
 */
import { readFileSync } from 'node:fs';

/** Range binned, in MIDI notes: below is rumble, above is mostly cymbal noise. */
const LOW_NOTE = 28;
const HIGH_NOTE = 100;
/** Long enough to resolve a bass note, short enough that a bar is several windows. */
const WINDOW_SECONDS = 0.5;
/** Bins quieter than this share of the loudest are not printed in a spectrum. */
const VISIBLE = 0.06;

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Declared above `main()` deliberately: this file runs top to bottom, and a `const` arrow defined
// further down is still in its temporal dead zone when a report reaches for it.
const hzOf = (note: number) => 440 * 2 ** ((note - 69) / 12);
const noteLabel = (note: number) => `${NAMES[note % 12]}${Math.floor(note / 12) - 1}`.padEnd(4);

main();

function main(): void {
  const options = parseArguments(process.argv.slice(2));
  const a = readWav(options.a);

  if (options.spectrum || !options.b) {
    reportSpectrum(a, options);
    return;
  }
  reportComparison(a, readWav(options.b), options);
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

function reportSpectrum(audio: Audio, options: Options): void {
  const from = Math.floor(options.from * audio.rate);
  const count = Math.min(Math.floor(options.seconds * audio.rate), audio.mono.length - from);
  const bins = spectrum(audio, from, count);
  const peak = Math.max(...bins);

  console.log(`${options.a}  ${options.from}s +${options.seconds}s`);
  bins.forEach((magnitude, index) => {
    const relative = peak > 0 ? magnitude / peak : 0;
    if (relative < VISIBLE) return;
    const note = LOW_NOTE + index;
    console.log(`  ${noteLabel(note)} ${hzOf(note).toFixed(1).padStart(7)}Hz`
      + ` ${relative.toFixed(3)} ${'#'.repeat(Math.round(relative * 44))}`);
  });
}

function reportComparison(a: Audio, b: Audio, options: Options): void {
  const windows = Math.floor(options.seconds / WINDOW_SECONDS);
  const classesA = new Array(12).fill(0);
  const classesB = new Array(12).fill(0);
  let total = 0;
  let compared = 0;

  console.log('window     cos   level a/b     loudest a / b');
  for (let index = 0; index < windows; index++) {
    const at = index * WINDOW_SECONDS;
    const binsA = spectrum(a, Math.floor((options.from + at) * a.rate),
      Math.floor(WINDOW_SECONDS * a.rate));
    const binsB = spectrum(b, Math.floor((options.fromB + at) * b.rate),
      Math.floor(WINDOW_SECONDS * b.rate));

    binsA.forEach((value, bin) => { classesA[(LOW_NOTE + bin) % 12] += value; });
    binsB.forEach((value, bin) => { classesB[(LOW_NOTE + bin) % 12] += value; });

    // Windows where both are silent say nothing about similarity, and averaging them in as zero
    // drags the mean down by however much rest the piece has in it.
    const levelA = magnitudeOf(binsA);
    const levelB = magnitudeOf(binsB);
    if (levelA <= 0 && levelB <= 0) continue;
    const cosine = similarity(binsA, binsB);
    total += cosine;
    compared++;

    if (index % options.every !== 0) continue;
    console.log(`  ${at.toFixed(1).padStart(6)}s ${cosine.toFixed(3)}`
      + `  ${levelA.toFixed(4)}/${levelB.toFixed(4)}`
      + `  ${noteLabel(loudest(binsA))} / ${noteLabel(loudest(binsB))}`);
  }

  console.log(`\nmean spectral cosine over ${compared} sounding windows:`
    + ` ${(total / Math.max(1, compared)).toFixed(3)}`);
  reportPitchClasses(classesA, classesB);
}

/**
 * Which notes each file leans on, over the whole comparison.
 *
 * The single most useful line in this tool: two renders of the same piece agree here even when
 * individual windows do not, and two renders of *different* pieces never do — it is what showed
 * that reading the module's written notes literally put the whole thing in the wrong key.
 */
function reportPitchClasses(a: number[], b: number[]): void {
  const peakA = Math.max(...a);
  const peakB = Math.max(...b);
  console.log('\npitch class   a                       b');
  for (let index = 0; index < 12; index++) {
    const barA = '#'.repeat(Math.round((a[index] / (peakA || 1)) * 22));
    const barB = '#'.repeat(Math.round((b[index] / (peakB || 1)) * 22));
    console.log(`  ${NAMES[index].padEnd(3)} ${barA.padEnd(24)}${barB}`);
  }
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

/** Magnitude per semitone by Goertzel — a few dozen bins, far cheaper than an FFT. */
function spectrum(audio: Audio, from: number, count: number): number[] {
  const bins: number[] = [];
  const start = Math.max(0, Math.min(from, audio.mono.length - 1));
  const length = Math.max(1, Math.min(count, audio.mono.length - start));

  for (let note = LOW_NOTE; note <= HIGH_NOTE; note++) {
    const w = (2 * Math.PI * hzOf(note)) / audio.rate;
    const coefficient = 2 * Math.cos(w);
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < length; i++) {
      const s0 = audio.mono[start + i] + coefficient * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    const magnitude = Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coefficient * s1 * s2)) / length;
    bins.push(Number.isFinite(magnitude) ? magnitude : 0);
  }
  return bins;
}

function similarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA > 0 && normB > 0 ? dot / Math.sqrt(normA * normB) : 0;
}

function magnitudeOf(bins: number[]): number {
  return Math.sqrt(bins.reduce((sum, value) => sum + value * value, 0));
}

function loudest(bins: number[]): number {
  return LOW_NOTE + bins.indexOf(Math.max(...bins));
}

// ---------------------------------------------------------------------------
// Wav
// ---------------------------------------------------------------------------

interface Audio {
  mono: Float32Array;
  rate: number;
}

/**
 * Mono sum of a wav, 16-bit or 32-bit float.
 *
 * The bit depth is not optional to handle: `openmpt123` writes 32-bit float, and reading that as
 * 16-bit makes every frequency come out exactly an octave low, because each float is read as two
 * frames. Both files look plausible and quietly disagree.
 */
function readWav(file: string): Audio {
  const buffer = readFileSync(file);
  let at = 12;
  let rate = 48000;
  let channels = 2;
  let bits = 16;
  let dataAt = 0;
  let dataLength = 0;

  while (at + 8 <= buffer.length) {
    const id = buffer.toString('latin1', at, at + 4);
    const size = buffer.readUInt32LE(at + 4);
    if (id === 'fmt ') {
      channels = buffer.readUInt16LE(at + 10);
      rate = buffer.readUInt32LE(at + 12);
      bits = buffer.readUInt16LE(at + 22);
    }
    if (id === 'data') {
      dataAt = at + 8;
      dataLength = size;
      break;
    }
    at += 8 + size + (size & 1);
  }
  if (!dataAt) throw new Error(`${file}: no data chunk`);

  const width = bits / 8;
  const frames = Math.floor(dataLength / (width * channels));
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel++) {
      const offset = dataAt + (i * channels + channel) * width;
      sum += bits === 16 ? buffer.readInt16LE(offset) / 32768 : buffer.readFloatLE(offset);
    }
    mono[i] = sum / channels;
  }
  return { mono, rate };
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

interface Options {
  a: string;
  b: string | null;
  seconds: number;
  /** Seconds into each file to start, so two renders can be lined up. */
  from: number;
  fromB: number;
  /** Print one line in this many windows, so a long comparison stays readable. */
  every: number;
  spectrum: boolean;
}

function parseArguments(args: string[]): Options {
  const flags = new Map<string, string>();
  for (const arg of args) {
    const match = /^--([a-z]+)(?:=(.*))?$/.exec(arg);
    if (match) flags.set(match[1], match[2] ?? '');
  }
  if (!flags.has('a')) {
    console.error('usage: npm run music:compare -- --a=reference.wav --b=mine.wav [--seconds=60]'
      + ' [--from=0] [--fromb=0] [--every=8] [--spectrum]');
    process.exit(1);
  }
  const from = Number(flags.get('from') ?? 0);
  return {
    a: flags.get('a')!,
    b: flags.get('b') ?? null,
    seconds: Number(flags.get('seconds') ?? 60),
    from,
    fromB: Number(flags.get('fromb') ?? from),
    every: Math.max(1, Number(flags.get('every') ?? 8)),
    spectrum: flags.has('spectrum'),
  };
}
