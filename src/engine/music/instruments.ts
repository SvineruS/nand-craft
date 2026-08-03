/**
 * Pad, bass, pluck and bell are one signal path and four sets of numbers in `PATCHES`. Kick and
 * hat are separate classes, being different paths rather than another patch.
 */
import {
  Envelope, type Waveform, Random, Svf, centsToRatio, midiToHz, oscillator, panLeftGain,
  panRightGain, softClip,
} from './dsp.ts';

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

/** Samples between coefficient updates — see `MusicPlayer`, which renders in these. */
export const CONTROL_BLOCK = 32;

export interface Patch {
  readonly wave: Waveform;
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
  readonly cutoffHz: number;
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
    const cutoff = this.patch.cutoffHz * 2 ** (this.cutoffMod + brightness);
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

      let sampleLeft = 0;
      let sampleRight = 0;
      for (let o = 0; o < this.unison; o++) {
        const increment = this.increments[o];
        this.phases[o] = (this.phases[o] + increment) % 1;
        // Phase modulation, so the offset adds straight to the phase. Only the bell uses it.
        const phase = modulation === 0 ? this.phases[o] : wrapPhase(this.phases[o] + modulation);
        const value = oscillator(wave, phase, increment);
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
