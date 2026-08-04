/**
 * How a note sounds. Most instruments here are one signal path and a set of numbers in `PATCHES`;
 * kick, snare and hat are separate classes, being different paths rather than another patch, and
 * `SampleVoice` is a fourth — a recording played back at the rate the note asks for.
 *
 * The patches with a `harmonics` table were built from spectra measured off a real tracker
 * module's samples with `npm run music:analyze -- --sample=N`. That is the only way a synth gets
 * near a sampled instrument: a violin is not a filtered saw.
 */
import {
  Envelope, type Waveform, Random, Svf, centsToRatio, midiToHz, oscillator, panLeftGain,
  panRightGain, softClip,
} from './dsp.ts';
import type { LoadedSample } from './samples.ts';

export interface Voice {
  readonly active: boolean;
  /** Share of this voice's output sent to the ping-pong delay. */
  readonly delaySend: number;
  /** Share sent to the reverb. */
  readonly reverbSend: number;
  /** Whether the kick ducks this voice — the sidechain that keeps the low end clear. */
  readonly ducked: boolean;
  /**
   * Write `count` samples from index 0, zeros once finished. `brightness` shifts the filter by
   * that many octaves, read per call so turning it moves the notes already sounding.
   */
  render(left: Float32Array, right: Float32Array, count: number, brightness: number): void;
}

/** Oscillators one note may stack. Three detuned saws is already a wide pad. */
const MAX_UNISON = 3;

/**
 * Harmonic amplitudes measured off the instruments of a reference tracker module with
 * `npm run music:analyze -- --sample=N`. A spectrum, not a recording: twenty numbers, from which
 * `wavetableFor` builds one cycle.
 *
 * This is the only way a synth gets near a sampled instrument. A violin is not a filtered saw —
 * it is saw-like for four harmonics and then falls away far faster, with a bump around the ninth,
 * and that shape is what the ear recognises.
 */
const VIOLIN_HARMONICS = [
  1, 0.537, 0.436, 0.327, 0.152, 0.147, 0.064, 0.031, 0.088, 0.086, 0.028, 0.035, 0.009, 0.006,
  0.026, 0.006, 0.005, 0.005,
];

/** The reference's "Deep Bass2": all fundamental, which is to say a sine. */
const SUB_HARMONICS = [1, 0.004, 0.01, 0.003, 0.008, 0.002, 0.004];

/**
 * The reference's "33-HI": a *missing* fundamental. The octave and the twelfth above it are equal
 * and carry the sound, while the fundamental itself is a tenth of them.
 *
 * Measured off a render of that instrument alone rather than off the raw sample, and the two
 * disagree: read from the sample, its first three harmonics look equal. They are not, and a synth
 * given the fundamental at full strength plays something an octave too low and far too thick,
 * because the ear takes its pitch from a series it can no longer hear the bottom of.
 */
const HOLLOW_HARMONICS = [0.1, 1, 1, 0.37, 0.14, 0.08, 0.08, 0.19];

/** "TECHN~46": the second harmonic loudest and the odd ones nearly gone — a hollow low stab. */
const SUBHIT_HARMONICS = [0.587, 1, 0.105, 0.345, 0.02, 0.152, 0.029, 0.029, 0.026, 0.024];

/** Hollow, with the third, fourth and sixth standing out — the reference's choir. */
const CHOIR_HARMONICS = [
  1, 0.088, 0.372, 0.329, 0.041, 0.297, 0.029, 0.192, 0.058, 0.008, 0.009, 0.048, 0.011, 0.001,
  0.02, 0.114,
];

/** One cycle, at this resolution. Read with interpolation, so it needs a wrapped extra sample. */
const TABLE_SIZE = 2048;
const wavetables = new Map<readonly number[], Float32Array>();

/** One cycle summed from harmonic amplitudes, built once per table and cached. */
function wavetableFor(harmonics: readonly number[]): Float32Array {
  const cached = wavetables.get(harmonics);
  if (cached) return cached;

  const table = new Float32Array(TABLE_SIZE + 1);
  harmonics.forEach((amplitude, index) => {
    if (amplitude === 0) return;
    const harmonic = index + 1;
    for (let i = 0; i < TABLE_SIZE; i++) {
      table[i] += amplitude * Math.sin((2 * Math.PI * harmonic * i) / TABLE_SIZE);
    }
  });

  let peak = 0;
  for (let i = 0; i < TABLE_SIZE; i++) peak = Math.max(peak, Math.abs(table[i]));
  if (peak > 0) for (let i = 0; i < TABLE_SIZE; i++) table[i] /= peak;
  table[TABLE_SIZE] = table[0];

  wavetables.set(harmonics, table);
  return table;
}

function readTable(table: Float32Array, phase: number): number {
  const position = phase * TABLE_SIZE;
  const index = position | 0;
  return table[index] + (table[index + 1] - table[index]) * (position - index);
}

/** Where `cutoffHz` is quoted from, for patches whose filter tracks the note. */
const MIDDLE_C_HZ = 261.626;

/** Samples between coefficient updates — see `MusicPlayer`, which renders in these. */
export const CONTROL_BLOCK = 32;

export interface Patch {
  /** Ignored when `harmonics` is given. */
  readonly wave: Waveform;
  /** Harmonic amplitudes to build the oscillator from, instead of a named waveform. */
  readonly harmonics?: readonly number[];
  /** Oscillators per note, spread across the stereo field and detuned around the pitch. */
  readonly unison: number;
  readonly detuneCents: number;
  /** How far apart the unison oscillators are panned, 0…1. */
  readonly spread: number;
  /** A sine an octave down at this gain: weight under a pad, the whole body of a bass. */
  readonly sub: number;
  /** Phase modulation, for the one instrument that is not subtractive at all — the bell. */
  readonly fmRatio: number;
  /** Modulation depth in cycles, decaying over `fmDecay` seconds so the clang is the attack. */
  readonly fmIndex: number;
  readonly fmDecay: number;
  readonly attack: number;
  /** Share of the written note length the voice holds before releasing. 0 makes notes short. */
  readonly hold: number;
  /** 60 dB time of the release tail, in seconds. */
  readonly release: number;
  /** Pitch wobble depth in cents, and its rate. What makes a held lead note sound played. */
  readonly vibratoCents?: number;
  readonly vibratoHz?: number;
  /** Quoted at middle C when `cutoffTrack` is set, and absolute otherwise. */
  readonly cutoffHz: number;
  /**
   * How much the cutoff follows the pitch, 0…1. Without it a patch is bright in the bass and dull
   * in the treble, which is the opposite of every real instrument.
   */
  readonly cutoffTrack?: number;
  /** Octaves the filter opens by at the attack, closing again over `cutoffDecay` seconds. */
  readonly cutoffEnv: number;
  readonly cutoffDecay: number;
  readonly q: number;
  readonly gain: number;
  readonly delaySend: number;
  readonly reverbSend: number;
  readonly ducked: boolean;
}

/** Gains are relative to each other: a pad is four notes of three oscillators, a bass is one. */
export const PATCHES = {
  /** Held chords, the layer that is always playing. Slow enough that it never marks time. */
  pad: {
    wave: 'saw', unison: 3, detuneCents: 11, spread: 0.9, sub: 0.22,
    fmRatio: 0, fmIndex: 0, fmDecay: 1,
    attack: 1.1, hold: 1, release: 2.8,
    cutoffHz: 780, cutoffEnv: 0.7, cutoffDecay: 2.4, q: 0.8,
    gain: 0.115, delaySend: 0.05, reverbSend: 0.55, ducked: true,
  },
  /** Root notes under the chord. Nearly all sub: it is felt more than heard. */
  bass: {
    wave: 'triangle', unison: 1, detuneCents: 0, spread: 0, sub: 0.85,
    fmRatio: 0, fmIndex: 0, fmDecay: 1,
    attack: 0.012, hold: 0.85, release: 0.32,
    cutoffHz: 210, cutoffEnv: 1.1, cutoffDecay: 0.22, q: 1,
    gain: 0.5, delaySend: 0, reverbSend: 0.05, ducked: true,
  },
  /** The arpeggio. Short, bright, and mostly heard as its echoes. */
  pluck: {
    wave: 'square', unison: 2, detuneCents: 7, spread: 0.55, sub: 0,
    fmRatio: 0, fmIndex: 0, fmDecay: 1,
    attack: 0.002, hold: 0, release: 0.42,
    cutoffHz: 1250, cutoffEnv: 1.7, cutoffDecay: 0.11, q: 1.7,
    gain: 0.13, delaySend: 0.5, reverbSend: 0.32, ducked: false,
  },
  /** The melody, such as it is: a few notes every other bar, left to ring. */
  bell: {
    wave: 'sine', unison: 1, detuneCents: 0, spread: 0, sub: 0,
    fmRatio: 3.5, fmIndex: 0.42, fmDecay: 0.35,
    attack: 0.004, hold: 0.2, release: 2.1,
    cutoffHz: 4200, cutoffEnv: 0, cutoffDecay: 1, q: 0.7,
    gain: 0.17, delaySend: 0.42, reverbSend: 0.5, ducked: false,
  },

  /**
   * Strings: a section, from the measured spectrum of a violin rather than a filtered saw. Wide
   * unison, a slow bowed swell, and vibrato — which is most of what separates bowed from held.
   */
  strings: {
    wave: 'saw', harmonics: VIOLIN_HARMONICS,
    unison: 3, detuneCents: 13, spread: 0.8, sub: 0,
    fmRatio: 0, fmIndex: 0, fmDecay: 1,
    attack: 0.34, hold: 1, release: 1.4,
    vibratoCents: 8, vibratoHz: 4.8,
    // Well above the fundamental and tracking it: the spectrum sets the tone, not the filter.
    cutoffHz: 3200, cutoffTrack: 1, cutoffEnv: 0.4, cutoffDecay: 1.2, q: 0.7,
    gain: 0.13, delaySend: 0.08, reverbSend: 0.4, ducked: true,
  },
  /** The choir the reference uses for stabs: hollow, and slower still to arrive. */
  choir: {
    wave: 'sine', harmonics: CHOIR_HARMONICS,
    unison: 2, detuneCents: 9, spread: 0.6, sub: 0,
    fmRatio: 0, fmIndex: 0, fmDecay: 1,
    attack: 0.12, hold: 1, release: 1.1,
    vibratoCents: 5, vibratoHz: 4.2,
    cutoffHz: 2600, cutoffTrack: 1, cutoffEnv: 0.3, cutoffDecay: 1, q: 0.7,
    gain: 0.1, delaySend: 0.1, reverbSend: 0.45, ducked: true,
  },
  /** Chords as stabs rather than a wash — the pad of something with a backbeat. */
  stab: {
    wave: 'saw', unison: 2, detuneCents: 15, spread: 0.45, sub: 0.1,
    fmRatio: 0, fmIndex: 0, fmDecay: 1,
    attack: 0.005, hold: 0.16, release: 0.45,
    cutoffHz: 1150, cutoffEnv: 1.2, cutoffDecay: 0.28, q: 1.5,
    gain: 0.115, delaySend: 0.16, reverbSend: 0.28, ducked: true,
  },
  /**
   * The rolling bass, from the reference's own spectrum — which is a sine and almost nothing else.
   * A square here was the wrong instrument entirely: far too bright, and it fought the drums.
   *
   * Short, because sixteenths on one pitch smear into a drone if they overlap.
   */
  drive: {
    wave: 'sine', harmonics: SUB_HARMONICS,
    unison: 1, detuneCents: 0, spread: 0, sub: 0.3,
    fmRatio: 0, fmIndex: 0, fmDecay: 1,
    attack: 0.004, hold: 0.55, release: 0.07,
    cutoffHz: 1800, cutoffTrack: 1, cutoffEnv: 0, cutoffDecay: 1, q: 0.7,
    gain: 0.52, delaySend: 0, reverbSend: 0.03, ducked: true,
  },
  /**
   * Reese bass: detuned saws taken right down by the filter, so what is left is the beating
   * between them over a sub. Sustained, unlike `drive` — it is one note a bar, not sixteen.
   */
  reese: {
    wave: 'saw', unison: 3, detuneCents: 26, spread: 0.15, sub: 0.8,
    fmRatio: 0, fmIndex: 0, fmDecay: 1,
    attack: 0.02, hold: 0.9, release: 0.3,
    cutoffHz: 210, cutoffEnv: 0.8, cutoffDecay: 0.5, q: 1.3,
    gain: 0.42, delaySend: 0, reverbSend: 0.05, ducked: true,
  },
  /**
   * The transcribed piece's hook: a sine, played in sixteenths, high enough to sing.
   *
   * Its reference sample is a sine and almost literally nothing else, so there is nothing to
   * filter and nothing to detune — what carries it is the line, not the timbre. The tiny sub
   * underneath it and the short release are the whole patch: enough weight not to sound like a
   * test tone, short enough that consecutive sixteenths stay separate notes.
   */
  riff: {
    wave: 'sine', harmonics: SUB_HARMONICS,
    unison: 1, detuneCents: 0, spread: 0, sub: 0.14,
    fmRatio: 0, fmIndex: 0, fmDecay: 1,
    attack: 0.004, hold: 0.86, release: 0.05,
    cutoffHz: 5000, cutoffTrack: 1, cutoffEnv: 0, cutoffDecay: 1, q: 0.7,
    gain: 0.34, delaySend: 0.14, reverbSend: 0.12, ducked: false,
  },
  /** A stopped-organ tone from a measured spectrum: three equal harmonics and no filter to speak of. */
  hollow: {
    wave: 'sine', harmonics: HOLLOW_HARMONICS,
    unison: 1, detuneCents: 0, spread: 0, sub: 0.2,
    fmRatio: 0, fmIndex: 0, fmDecay: 1,
    attack: 0.008, hold: 0.9, release: 0.5,
    cutoffHz: 2600, cutoffTrack: 1, cutoffEnv: 0.3, cutoffDecay: 0.8, q: 0.7,
    gain: 0.3, delaySend: 0.06, reverbSend: 0.2, ducked: true,
  },
  /** The low stab: hollow, short, and felt. */
  subhit: {
    wave: 'sine', harmonics: SUBHIT_HARMONICS,
    unison: 1, detuneCents: 0, spread: 0, sub: 0.55,
    fmRatio: 0, fmIndex: 0, fmDecay: 1,
    attack: 0.004, hold: 0.75, release: 0.22,
    cutoffHz: 1400, cutoffTrack: 1, cutoffEnv: 0.6, cutoffDecay: 0.3, q: 0.9,
    gain: 0.42, delaySend: 0, reverbSend: 0.06, ducked: true,
  },

  /**
   * The tune. Detuned saws, and deliberately not a plucked sound: a slow attack, a filter that
   * only opens a little, and a vibrato — a held note has to sound played rather than triggered.
   */
  lead: {
    wave: 'saw', unison: 3, detuneCents: 16, spread: 0.35, sub: 0.18,
    fmRatio: 0, fmIndex: 0, fmDecay: 1,
    attack: 0.022, hold: 0.95, release: 0.3,
    vibratoCents: 11, vibratoHz: 5.2,
    cutoffHz: 1700, cutoffEnv: 0.8, cutoffDecay: 0.3, q: 1.7,
    gain: 0.185, delaySend: 0.34, reverbSend: 0.24, ducked: false,
  },
} as const satisfies Record<string, Patch>;

export type PatchName = keyof typeof PATCHES;

/** Oscillators into a filter into an amplifier — pad, bass, pluck and bell are all this. */
export class SynthVoice implements Voice {
  active = false;
  delaySend = 0;
  reverbSend = 0;
  ducked = false;

  private patch: Patch = PATCHES.pad;
  private amp = new Envelope();
  // One per channel: filtering the mono sum would undo the unison spread.
  private filterLeft = new Svf();
  private filterRight = new Svf();
  private sampleRate = 48000;
  private phases = new Float32Array(MAX_UNISON);
  private increments = new Float32Array(MAX_UNISON);
  private gainsLeft = new Float32Array(MAX_UNISON);
  private gainsRight = new Float32Array(MAX_UNISON);
  private unison = 1;
  private subPhase = 0;
  private subIncrement = 0;
  private fmPhase = 0;
  private fmIncrement = 0;
  private fmAmount = 0;
  private fmDecayPerBlock = 1;
  private vibratoPhase = 0;
  private vibratoIncrement = 0;
  private vibratoDepth = 0;
  /** One cycle of the patch's spectrum, or null when it uses a named waveform. */
  private table: Float32Array | null = null;
  /** How far this note's pitch moves the cutoff — 1 when the patch does not track. */
  private cutoffScale = 1;
  private cutoffMod = 0;
  private cutoffDecayPerBlock = 1;
  private gain = 0;

  /** How loud this voice currently is, for the player to decide which one to steal. */
  get level(): number {
    return this.active ? this.amp.level * this.gain : 0;
  }

  /** `duration` and the patch times are in seconds; `pan` is -1…1. */
  trigger(
    patch: Patch, note: number, duration: number, velocity: number, pan: number,
    sampleRate: number,
  ): void {
    this.patch = patch;
    this.sampleRate = sampleRate;
    this.unison = Math.min(MAX_UNISON, patch.unison);
    const frequency = midiToHz(note);
    this.table = patch.harmonics ? wavetableFor(patch.harmonics) : null;
    this.cutoffScale = (frequency / MIDDLE_C_HZ) ** (patch.cutoffTrack ?? 0);

    for (let i = 0; i < this.unison; i++) {
      // Symmetric about the pitch: -1, 0, +1 for three oscillators.
      const offset = this.unison === 1 ? 0 : (i / (this.unison - 1)) * 2 - 1;
      this.increments[i] = (frequency * centsToRatio(offset * patch.detuneCents)) / sampleRate;
      // Offset phases, so the stack does not start as one loud in-phase hit.
      this.phases[i] = (i * 0.37) % 1;
      const voicePan = Math.max(-1, Math.min(1, pan + offset * patch.spread));
      this.gainsLeft[i] = panLeftGain(voicePan);
      this.gainsRight[i] = panRightGain(voicePan);
    }

    this.subIncrement = frequency / 2 / sampleRate;
    this.subPhase = 0;
    this.fmIncrement = (frequency * patch.fmRatio) / sampleRate;
    this.fmPhase = 0;
    this.fmAmount = patch.fmIndex;
    this.fmDecayPerBlock = decayPerBlock(patch.fmDecay, sampleRate);
    // Depth as a frequency ratio either side of the pitch, so it can multiply the increments.
    this.vibratoDepth = centsToRatio(patch.vibratoCents ?? 0) - 1;
    this.vibratoIncrement = (patch.vibratoHz ?? 0) / sampleRate;
    // A quarter turn in, so the note starts on its pitch and rises rather than starting flat.
    this.vibratoPhase = 0;
    this.cutoffMod = patch.cutoffEnv;
    this.cutoffDecayPerBlock = decayPerBlock(patch.cutoffDecay, sampleRate);

    this.filterLeft.reset();
    this.filterRight.reset();
    this.amp.trigger(
      patch.attack * sampleRate,
      duration * patch.hold * sampleRate,
      patch.release * sampleRate,
      velocity,
    );

    this.gain = patch.gain;
    this.delaySend = patch.delaySend;
    this.reverbSend = patch.reverbSend;
    this.ducked = patch.ducked;
    this.active = true;
  }

  /** Let this note go now, without cutting it — see `Envelope.releaseIn`. */
  releaseNow(seconds: number): void {
    this.amp.releaseIn(seconds * this.sampleRate);
  }

  render(left: Float32Array, right: Float32Array, count: number, brightness: number): void {
    // Once per block rather than per sample: a `tan` and an `exp`, at 1.5 kHz instead of 48.
    const cutoff = this.patch.cutoffHz * this.cutoffScale * 2 ** (this.cutoffMod + brightness);
    this.filterLeft.setCutoff(cutoff, this.patch.q, this.sampleRate);
    this.filterRight.setCutoff(cutoff, this.patch.q, this.sampleRate);
    this.cutoffMod *= this.cutoffDecayPerBlock;
    this.fmAmount *= this.fmDecayPerBlock;

    const { wave, sub } = this.patch;
    for (let i = 0; i < count; i++) {
      if (!this.amp.active) {
        left[i] = 0;
        right[i] = 0;
        continue;
      }
      const amplitude = this.amp.next() * this.gain;

      let modulation = 0;
      if (this.fmAmount > 0) {
        this.fmPhase = (this.fmPhase + this.fmIncrement) % 1;
        modulation = Math.sin(this.fmPhase * Math.PI * 2) * this.fmAmount;
      }

      let bend = 1;
      if (this.vibratoDepth > 0) {
        this.vibratoPhase = (this.vibratoPhase + this.vibratoIncrement) % 1;
        bend = 1 + this.vibratoDepth * Math.sin(this.vibratoPhase * Math.PI * 2);
      }

      let sampleLeft = 0;
      let sampleRight = 0;
      for (let o = 0; o < this.unison; o++) {
        const increment = this.increments[o] * bend;
        this.phases[o] = (this.phases[o] + increment) % 1;
        // Phase modulation, so the offset adds straight to the phase. Only the bell uses it.
        const phase = modulation === 0 ? this.phases[o] : wrapPhase(this.phases[o] + modulation);
        const value = this.table ? readTable(this.table, phase) : oscillator(wave, phase, increment);
        sampleLeft += value * this.gainsLeft[o];
        sampleRight += value * this.gainsRight[o];
      }
      if (sub > 0) {
        this.subPhase = (this.subPhase + this.subIncrement) % 1;
        const value = Math.sin(this.subPhase * Math.PI * 2) * sub;
        sampleLeft += value;
        sampleRight += value;
      }

      this.filterLeft.process(sampleLeft);
      this.filterRight.process(sampleRight);
      left[i] = this.filterLeft.low * amplitude;
      right[i] = this.filterRight.low * amplitude;
    }

    if (!this.amp.active) this.active = false;
  }
}

/** A sine whose pitch falls from a click to a thud, saturated on the way out. */
export class KickVoice implements Voice {
  active = false;
  delaySend = 0;
  reverbSend = 0.06;
  ducked = false;

  private amp = new Envelope();
  private clickAmp = new Envelope();
  private phase = 0;
  private pitch = 0;
  private pitchDecay = 0;
  private sampleRate = 48000;
  private noise = new Random(1);
  private gain = 0;

  /** Peak of the pitch drop, and where it lands. */
  private static readonly START_HZ = 132;
  private static readonly END_HZ = 47;

  trigger(velocity: number, seed: number, sampleRate: number): void {
    this.sampleRate = sampleRate;
    this.phase = 0;
    this.pitch = 1;
    this.pitchDecay = Math.exp(-1 / (0.028 * sampleRate));
    this.amp.trigger(0.001 * sampleRate, 0.012 * sampleRate, 0.26 * sampleRate, 1);
    // Noise burst on top: on small speakers this is the part that reads as a kick.
    this.clickAmp.trigger(1, 0, 0.004 * sampleRate, 0.5);
    this.noise = new Random(seed);
    this.gain = velocity;
    this.active = true;
  }

  // No filter to shift, so brightness passes it by.
  render(left: Float32Array, right: Float32Array, count: number, _brightness: number): void {
    for (let i = 0; i < count; i++) {
      if (!this.amp.active) {
        left[i] = 0;
        right[i] = 0;
        continue;
      }
      this.pitch *= this.pitchDecay;
      const hz = KickVoice.END_HZ + (KickVoice.START_HZ - KickVoice.END_HZ) * this.pitch;
      this.phase = (this.phase + hz / this.sampleRate) % 1;

      const body = Math.sin(this.phase * Math.PI * 2) * this.amp.next();
      const click = (this.noise.next() * 2 - 1) * this.clickAmp.next();
      const out = softClip((body + click) * 1.4) * this.gain;
      left[i] = out;
      right[i] = out;
    }
    if (!this.amp.active) this.active = false;
  }
}

/**
 * Snare: a band of noise for the crack, a fast sine for the body. Both are needed — noise alone
 * is a hiss, and the body alone is a tom.
 */
export class SnareVoice implements Voice {
  active = false;
  delaySend = 0.06;
  reverbSend = 0.18;
  ducked = false;

  private amp = new Envelope();
  private bodyAmp = new Envelope();
  private filter = new Svf();
  private noise = new Random(1);
  private phase = 0;
  private sampleRate = 48000;
  private gain = 0;

  private static readonly BODY_HZ = 190;
  /** High enough to crack rather than thump — a break has to cut through a sub. */
  private static readonly NOISE_HZ = 2300;

  trigger(velocity: number, seed: number, sampleRate: number): void {
    this.sampleRate = sampleRate;
    this.amp.trigger(0.001 * sampleRate, 0.003 * sampleRate, 0.115 * sampleRate, velocity);
    this.bodyAmp.trigger(0.001 * sampleRate, 0, 0.06 * sampleRate, velocity * 0.45);
    this.filter.reset();
    this.noise = new Random(seed);
    this.phase = 0;
    this.gain = 1;
    this.active = true;
  }

  render(left: Float32Array, right: Float32Array, count: number, _brightness: number): void {
    this.filter.setCutoff(SnareVoice.NOISE_HZ, 0.7, this.sampleRate);
    const bodyIncrement = SnareVoice.BODY_HZ / this.sampleRate;

    for (let i = 0; i < count; i++) {
      if (!this.amp.active) {
        left[i] = 0;
        right[i] = 0;
        continue;
      }
      this.filter.process(this.noise.next() * 2 - 1);
      this.phase = (this.phase + bodyIncrement) % 1;
      const crack = this.filter.band * this.amp.next();
      const body = Math.sin(this.phase * Math.PI * 2) * this.bodyAmp.next();
      const out = softClip((crack + body) * 1.3) * this.gain;
      left[i] = out;
      right[i] = out;
    }
    if (!this.amp.active) this.active = false;
  }
}

/**
 * Plays a recording back at whatever rate the note asks for, which is all a tracker ever did.
 *
 * No filter and no envelope beyond a release: the recording already contains its own attack and
 * decay, and shaping it again is how a sampled instrument stops sounding like itself. The only
 * envelope is a short fade at the end, because cutting a waveform mid-cycle is a click.
 */
export class SampleVoice implements Voice {
  active = false;
  delaySend = 0.1;
  reverbSend = 0.28;
  ducked = true;

  private data: Float32Array = EMPTY_SAMPLE;
  private position = 0;
  private step = 0;
  private gainLeft = 0;
  private gainRight = 0;
  private fade = 1;
  private fadePerSample = 0;

  /** How loud this voice is, for the player to decide which one to steal. */
  get level(): number {
    return this.active ? this.fade : 0;
  }

  trigger(
    sample: LoadedSample, note: number, velocity: number, pan: number, sampleRate: number,
  ): void {
    this.data = sample.data;
    this.position = 0;
    // Frames of source per frame of output: the pitch and the resampling are the same number.
    this.step = (sample.rate / sampleRate) * 2 ** ((note - sample.root) / 12);
    this.gainLeft = panLeftGain(pan) * velocity;
    this.gainRight = panRightGain(pan) * velocity;
    this.fade = 1;
    this.fadePerSample = 0;
    this.active = true;
  }

  /** Fade out over `seconds` rather than stop, for a theme handing over mid-sound. */
  releaseNow(seconds: number, sampleRate: number): void {
    this.fadePerSample = 1 / Math.max(1, seconds * sampleRate);
  }

  // A recording carries its own brightness, so there is no filter for `brightness` to move.
  render(left: Float32Array, right: Float32Array, count: number, _brightness: number): void {
    for (let i = 0; i < count; i++) {
      const low = this.position | 0;
      if (!this.active || low + 1 >= this.data.length || this.fade <= 0) {
        left[i] = 0;
        right[i] = 0;
        this.active = false;
        continue;
      }
      // Interpolated, because the step is almost never a whole number of frames.
      const fraction = this.position - low;
      const value = (this.data[low] + (this.data[low + 1] - this.data[low]) * fraction) * this.fade;
      left[i] = value * this.gainLeft;
      right[i] = value * this.gainRight;

      this.position += this.step;
      this.fade -= this.fadePerSample;
    }
  }
}

const EMPTY_SAMPLE = new Float32Array(1);

/** Hat: noise through a highpass, gone almost as soon as it arrives. */
export class HatVoice implements Voice {
  active = false;
  delaySend = 0.12;
  reverbSend = 0.2;
  ducked = false;

  private amp = new Envelope();
  private filter = new Svf();
  private noise = new Random(1);
  private gainLeft = 0;
  private gainRight = 0;
  private cutoffHz = 7600;
  private sampleRate = 48000;

  /** `release` in seconds is the difference between a closed hat and an open one. */
  trigger(
    velocity: number, release: number, pan: number, seed: number, sampleRate: number,
  ): void {
    this.sampleRate = sampleRate;
    this.amp.trigger(0.0005 * sampleRate, 0, release * sampleRate, velocity);
    this.filter.reset();
    this.noise = new Random(seed);
    // Brighter when louder, as a real one is.
    this.cutoffHz = 6800 + 1800 * velocity;
    this.gainLeft = panLeftGain(pan);
    this.gainRight = panRightGain(pan);
    this.active = true;
  }

  // Already near the top of the spectrum, so brightening it would do nothing audible.
  render(left: Float32Array, right: Float32Array, count: number, _brightness: number): void {
    this.filter.setCutoff(this.cutoffHz, 0.8, this.sampleRate);
    for (let i = 0; i < count; i++) {
      if (!this.amp.active) {
        left[i] = 0;
        right[i] = 0;
        continue;
      }
      this.filter.process(this.noise.next() * 2 - 1);
      const out = this.filter.high * this.amp.next();
      left[i] = out * this.gainLeft;
      right[i] = out * this.gainRight;
    }
    if (!this.amp.active) this.active = false;
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Decay factor per control block for a 60 dB time of `seconds`. */
function decayPerBlock(seconds: number, sampleRate: number): number {
  return Math.exp((-6.9078 * CONTROL_BLOCK) / Math.max(1, seconds * sampleRate));
}

function wrapPhase(phase: number): number {
  const wrapped = phase % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}
