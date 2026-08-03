/**
 * The mixer and the clock: the composer's notes into samples. Whatever calls `render` is a
 * transport — a worker in the game, a wav writer in `npm run music:render`.
 *
 * Coefficients and the step clock update per control block, oscillators per sample: a `tan` per
 * voice at 1.5 kHz instead of 48, for a grid quantised to 0.7 ms.
 */
import { PingPongDelay, Reverb, softClip } from './dsp.ts';
import {
  CONTROL_BLOCK, HatVoice, KickVoice, PATCHES, SnareVoice, SynthVoice, type Voice,
} from './instruments.ts';
import { Composer, createEventPool, type NoteEvent } from './composer.ts';
import type { MusicTheme } from './themes.ts';

/** Tuned voices held at once. A pad chord is four, and chords overlap by design. */
const SYNTH_VOICES = 24;
const KICK_VOICES = 2;
const SNARE_VOICES = 3;
const HAT_VOICES = 4;
/** Notes one sixteenth may start. A pad chord with a seventh plus drums is the busy case. */
const MAX_EVENTS_PER_STEP = 12;

/** How far the kick pushes the pad and bass down, and how quickly they come back. */
const DUCK_DEPTH = 0.34;
const DUCK_RELEASE_SECONDS = 0.16;

/** How long the old key's chord takes to get out of the way on a theme swap. */
const SWAP_RELEASE_SECONDS = 0.5;

/** Every control glides: a cutoff that jumps is a click, a tempo that jumps is a stumble. */
const PARAM_GLIDE_SECONDS = 2;

/** Echo spacing as a fraction of a beat — a dotted eighth, which pulls against the beat. */
const DELAY_BEATS = 0.75;

/** Headroom — the one number to turn when the whole mix is too loud. */
const MASTER_GAIN = 0.62;

/**
 * The live controls, as *modifiers* over whatever theme is playing — the defaults mean "the theme
 * as written". Being relative is what lets them outlive a theme change.
 */
export interface MusicParams {
  /** Added to the theme's intensity, -1…1. Which layers play: below zero strips it back. */
  energy: number;
  /** Octaves added to every filter, -2…2. How bright and present the whole thing is. */
  brightness: number;
  /** Multiplies the theme's tempo, 0.5…2. */
  tempo: number;
  /** Multiplies the theme's reverb, 0…2. How far away the music sounds. */
  space: number;
}

export const DEFAULT_MUSIC_PARAMS: MusicParams = {
  energy: 0,
  brightness: 0,
  tempo: 1,
  space: 1,
};

export class MusicPlayer {
  private theme: MusicTheme;
  private composer: Composer;

  private synths: SynthVoice[] = [];
  private kicks: KickVoice[] = [];
  private snares: SnareVoice[] = [];
  private hats: HatVoice[] = [];
  private voices: Voice[] = [];

  private events: NoteEvent[] = createEventPool(MAX_EVENTS_PER_STEP);
  private step = 0;
  /** Samples until the next sixteenth. Fractional, so the tempo does not drift. */
  private stepCountdown = 1;
  private samplesPerStep = 1;

  private delay: PingPongDelay;
  private reverb: Reverb;

  private voiceLeft = new Float32Array(CONTROL_BLOCK);
  private voiceRight = new Float32Array(CONTROL_BLOCK);
  private dryLeft = new Float32Array(CONTROL_BLOCK);
  private dryRight = new Float32Array(CONTROL_BLOCK);
  private delayLeft = new Float32Array(CONTROL_BLOCK);
  private delayRight = new Float32Array(CONTROL_BLOCK);
  private reverbLeft = new Float32Array(CONTROL_BLOCK);
  private reverbRight = new Float32Array(CONTROL_BLOCK);
  private duck = new Float32Array(CONTROL_BLOCK);

  private duckLevel = 0;
  private duckDecay = 0;
  private pending: { theme: MusicTheme; seed: number } | null = null;

  /** Where the controls are now, and where they are heading. Never the same for long. */
  private params: MusicParams = { ...DEFAULT_MUSIC_PARAMS };
  private target: MusicParams = { ...DEFAULT_MUSIC_PARAMS };
  private glide = 0;

  private sampleRate: number;
  private seed: number;

  constructor(sampleRate: number, theme: MusicTheme, seed: number) {
    this.sampleRate = sampleRate;
    this.seed = seed;
    this.theme = theme;
    this.composer = new Composer(theme, seed);
    this.delay = new PingPongDelay(sampleRate);
    this.reverb = new Reverb(sampleRate);
    this.duckDecay = Math.exp(-1 / (DUCK_RELEASE_SECONDS * sampleRate));
    // One-pole glide, per control block — fine enough for a control a hand turns.
    this.glide = 1 - Math.exp(-CONTROL_BLOCK / (PARAM_GLIDE_SECONDS * sampleRate));

    for (let i = 0; i < SYNTH_VOICES; i++) this.synths.push(new SynthVoice());
    for (let i = 0; i < KICK_VOICES; i++) this.kicks.push(new KickVoice());
    for (let i = 0; i < SNARE_VOICES; i++) this.snares.push(new SnareVoice());
    for (let i = 0; i < HAT_VOICES; i++) this.hats.push(new HatVoice());
    this.voices = [...this.synths, ...this.kicks, ...this.snares, ...this.hats];

    this.applyTempo();
  }

  /**
   * Change theme at the end of the current chord, without stopping. Waiting for the chord is what
   * makes it work: the key change lands where the ear already expects something to happen.
   */
  setTheme(theme: MusicTheme, seed = this.seed): void {
    if (theme === this.theme && seed === this.seed) return;
    this.pending = { theme, seed };
  }

  /** Turn any of the live controls; anything not named stays put. Glides, never interrupts. */
  setParams(params: Partial<MusicParams>): void {
    this.target = {
      energy: clamp(params.energy ?? this.target.energy, -1, 1),
      brightness: clamp(params.brightness ?? this.target.brightness, -2, 2),
      tempo: clamp(params.tempo ?? this.target.tempo, 0.5, 2),
      space: clamp(params.space ?? this.target.space, 0, 2),
    };
  }

  /** Where the controls are right now, mid-glide. */
  get currentParams(): Readonly<MusicParams> {
    return this.params;
  }

  /** Sixteenths begun since the theme started. For `check:invariants`, which checks for drift. */
  get stepsPlayed(): number {
    return this.step;
  }

  /** Fill both channels with `frames` samples of music. */
  render(left: Float32Array, right: Float32Array, frames: number): void {
    let done = 0;
    while (done < frames) {
      const count = Math.min(CONTROL_BLOCK, frames - done);
      this.advanceClock(count);
      this.renderBlock(left, right, done, count);
      done += count;
    }
  }

  // -------------------------------------------------------------------------
  // Clock
  // -------------------------------------------------------------------------

  private advanceClock(count: number): void {
    this.stepCountdown -= count;
    while (this.stepCountdown <= 0) {
      this.stepCountdown += this.samplesPerStep;
      this.startStep();
    }
  }

  private startStep(): void {
    // A theme waiting to come in does so here, at the chord boundary it was told to wait for.
    if (this.pending && this.step % this.composer.stepsPerChord === 0) this.applyPending();

    const intensity = clamp(this.theme.intensity + this.params.energy, 0, 1);
    const count = this.composer.collect(this.step, intensity, this.events);
    for (let i = 0; i < count; i++) this.startEvent(this.events[i]);
    this.step++;
  }

  private startEvent(event: NoteEvent): void {
    switch (event.kind) {
      case 'kick':
        this.takeKick().trigger(event.velocity, event.seed, this.sampleRate);
        // The sidechain: everything low is pushed aside for as long as the kick lasts.
        this.duckLevel = 1;
        return;
      case 'snare':
        this.takeSnare().trigger(event.velocity, event.seed, this.sampleRate);
        return;
      case 'hat':
        this.takeHat().trigger(
          event.velocity, event.duration, event.pan, event.seed, this.sampleRate,
        );
        return;
      default:
        this.takeSynth().trigger(
          PATCHES[event.kind], event.note, event.duration, event.velocity, event.pan,
          this.sampleRate,
        );
    }
  }

  // -------------------------------------------------------------------------
  // Mixing
  // -------------------------------------------------------------------------

  private renderBlock(
    outLeft: Float32Array, outRight: Float32Array, offset: number, count: number,
  ): void {
    this.advanceParams();
    this.clearBuses(count);
    this.fillDuck(count);

    for (const voice of this.voices) {
      if (!voice.active) continue;
      voice.render(this.voiceLeft, this.voiceRight, count, this.params.brightness);
      this.mixVoice(voice, count);
    }

    this.mixEffects(count);
    this.writeMaster(outLeft, outRight, offset, count);
  }

  private clearBuses(count: number): void {
    this.dryLeft.fill(0, 0, count);
    this.dryRight.fill(0, 0, count);
    this.delayLeft.fill(0, 0, count);
    this.delayRight.fill(0, 0, count);
    this.reverbLeft.fill(0, 0, count);
    this.reverbRight.fill(0, 0, count);
  }

  /** The kick's ducking envelope, sampled across the block. */
  private fillDuck(count: number): void {
    for (let i = 0; i < count; i++) {
      this.duck[i] = this.duckLevel;
      this.duckLevel *= this.duckDecay;
    }
  }

  /** One voice into the dry bus and its two sends. */
  private mixVoice(voice: Voice, count: number): void {
    const { delaySend, reverbSend, ducked } = voice;
    for (let i = 0; i < count; i++) {
      const gain = ducked ? 1 - DUCK_DEPTH * this.duck[i] : 1;
      const left = this.voiceLeft[i] * gain;
      const right = this.voiceRight[i] * gain;
      this.dryLeft[i] += left;
      this.dryRight[i] += right;
      if (delaySend > 0) {
        this.delayLeft[i] += left * delaySend;
        this.delayRight[i] += right * delaySend;
      }
      if (reverbSend > 0) {
        this.reverbLeft[i] += left * reverbSend;
        this.reverbRight[i] += right * reverbSend;
      }
    }
  }

  /** Step every control toward its target. One pole each, once per block. */
  private advanceParams(): void {
    const { params, target, glide } = this;
    params.energy += (target.energy - params.energy) * glide;
    params.brightness += (target.brightness - params.brightness) * glide;
    params.space += (target.space - params.space) * glide;

    const tempo = params.tempo + (target.tempo - params.tempo) * glide;
    if (tempo !== params.tempo) {
      params.tempo = tempo;
      // Step length and echo spacing are both tempo. Re-timing the delay mid-tail nudges the
      // echoes already in the line, which is what a delay being nudged sounds like.
      this.applyTempo();
    }
  }

  private mixEffects(count: number): void {
    const wet = this.theme.reverb * this.params.space;
    for (let i = 0; i < count; i++) {
      this.delay.process(this.delayLeft[i], this.delayRight[i]);
      this.dryLeft[i] += this.delay.outLeft;
      this.dryRight[i] += this.delay.outRight;

      this.reverb.process(this.reverbLeft[i], this.reverbRight[i]);
      this.dryLeft[i] += this.reverb.outLeft * wet;
      this.dryRight[i] += this.reverb.outRight * wet;
    }
  }

  private writeMaster(
    outLeft: Float32Array, outRight: Float32Array, offset: number, count: number,
  ): void {
    for (let i = 0; i < count; i++) {
      outLeft[offset + i] = softClip(this.dryLeft[i] * MASTER_GAIN);
      outRight[offset + i] = softClip(this.dryRight[i] * MASTER_GAIN);
    }
  }

  // -------------------------------------------------------------------------
  // Theme changes
  // -------------------------------------------------------------------------

  /**
   * Hand over to the waiting theme on the beat. Nothing is silenced and nothing fades.
   *
   * The new theme's bar 0 is a chord boundary, so its chord fills the gap the old one left — and
   * must *not* also be triggered by hand here, or it plays twice over.
   */
  private applyPending(): void {
    const { theme, seed } = this.pending!;
    this.pending = null;
    this.theme = theme;
    this.seed = seed;
    // Allocates mid-render, but only once per screen change, with a queue of audio ahead of it.
    this.composer = new Composer(theme, seed);
    this.step = 0;
    this.applyTempo();

    // Only the tuned voices: a hat or kick ringing out belongs to no key.
    for (const voice of this.synths) {
      if (voice.active) voice.releaseNow(SWAP_RELEASE_SECONDS);
    }
  }

  private applyTempo(): void {
    this.samplesPerStep = (this.composer.stepDuration * this.sampleRate) / this.params.tempo;
    this.delay.setTime((this.composer.beatDuration * DELAY_BEATS) / this.params.tempo);
  }

  // -------------------------------------------------------------------------
  // Voice allocation
  // -------------------------------------------------------------------------

  /** A free voice, or the quietest one playing — the note least likely to be missed. */
  private takeSynth(): SynthVoice {
    let quietest = this.synths[0];
    for (const voice of this.synths) {
      if (!voice.active) return voice;
      if (voice.level < quietest.level) quietest = voice;
    }
    return quietest;
  }

  private takeKick(): KickVoice {
    return this.kicks.find(voice => !voice.active) ?? this.kicks[0];
  }

  private takeSnare(): SnareVoice {
    return this.snares.find(voice => !voice.active) ?? this.snares[0];
  }

  private takeHat(): HatVoice {
    return this.hats.find(voice => !voice.active) ?? this.hats[0];
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
