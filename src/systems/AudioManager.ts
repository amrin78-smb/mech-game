import Phaser from 'phaser';

import { tuning } from '../data';
import type { ArmorClass } from '../types';

/**
 * All battle audio, synthesised at runtime rather than loaded.
 *
 * GAME_DESIGN section 11 asks for layered cannon thumps, distinct death sounds
 * per armor class, a low engine drone bed and boss stingers, "CC0 sourced or
 * synthesized". Generating them keeps the repo asset free and the licence
 * question closed; swapping in real samples later only touches this file.
 *
 * Web Audio requires a fresh BufferSource per playback, so this is the one place
 * that unavoidably allocates per sound. Every cue is throttled, which caps that
 * churn and also stops a wall of identical hits turning into mud.
 */

export type SoundKey =
  | 'cannon'
  | 'turret'
  | 'impact'
  | 'death_light'
  | 'death_armored'
  | 'death_shielded'
  | 'death_swarm'
  | 'hull_hit'
  | 'boss_stinger'
  | 'boss_phase'
  | 'ui_click'
  | 'upgrade';

/** Minimum gap between repeats of the same cue, seconds. */
const THROTTLE: Record<SoundKey, number> = {
  cannon: 0.07,
  turret: 0.07,
  impact: 0.04,
  death_light: 0.05,
  death_armored: 0.06,
  death_shielded: 0.06,
  death_swarm: 0.05,
  hull_hit: 0.12,
  boss_stinger: 1,
  boss_phase: 1,
  ui_click: 0.05,
  upgrade: 0.05,
};

const SAMPLE_RATE_FALLBACK = 44100;

export class AudioManager {
  private readonly context: AudioContext | null;
  private readonly master: GainNode | null = null;
  private readonly buffers = new Map<SoundKey, AudioBuffer>();
  private readonly lastPlayed = new Map<SoundKey, number>();

  private drone: AudioBufferSourceNode | null = null;
  private droneGain: GainNode | null = null;

  private muted = false;

  constructor(scene: Phaser.Scene) {
    this.context = readContext(scene);

    if (this.context === null) {
      // NoAudio or HTML5 audio: the game stays perfectly playable, just silent.
      this.buffers.clear();
      return;
    }

    this.master = this.context.createGain();
    this.master.gain.value = tuning.audio.masterVolume;
    this.master.connect(this.context.destination);

    this.renderAll(this.context);
  }

  get available(): boolean {
    return this.context !== null;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master !== null && this.context !== null) {
      this.master.gain.setTargetAtTime(
        muted ? 0 : tuning.audio.masterVolume,
        this.context.currentTime,
        0.02,
      );
    }
  }

  play(key: SoundKey, volumeScale = 1, detuneCents = 0): void {
    const ctx = this.context;
    const master = this.master;
    if (ctx === null || master === null || this.muted) return;

    const buffer = this.buffers.get(key);
    if (buffer === undefined) return;

    const now = ctx.currentTime;
    const last = this.lastPlayed.get(key) ?? -Infinity;
    if (now - last < THROTTLE[key]) return;
    this.lastPlayed.set(key, now);

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    if (detuneCents !== 0) {
      source.playbackRate.value = Math.pow(2, detuneCents / 1200);
    }

    const gain = ctx.createGain();
    gain.gain.value = tuning.audio.sfxVolume * volumeScale;
    source.connect(gain).connect(master);
    source.start();
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  }

  deathSoundFor(armorClass: ArmorClass): SoundKey {
    switch (armorClass) {
      case 'light':
        return 'death_light';
      case 'armored':
        return 'death_armored';
      case 'shielded':
        return 'death_shielded';
      case 'swarm':
        return 'death_swarm';
    }
  }

  /** The low engine bed under the whole battle. */
  startDrone(): void {
    const ctx = this.context;
    const master = this.master;
    if (ctx === null || master === null || this.drone !== null) return;

    const buffer = renderBuffer(ctx, 3, (t, rate) => {
      // Two detuned low sines plus a breath of filtered noise.
      const wobble = Math.sin(2 * Math.PI * 0.27 * t) * 1.5;
      const a = Math.sin(2 * Math.PI * (48 + wobble) * t);
      const b = Math.sin(2 * Math.PI * 71 * t) * 0.5;
      const chug = Math.sin(2 * Math.PI * 2.1 * t) * 0.5 + 0.5;
      const noise = (Math.random() * 2 - 1) * 0.06;
      void rate;
      return (a * 0.5 + b * 0.3 + noise) * (0.6 + chug * 0.4);
    });

    const gain = ctx.createGain();
    gain.gain.value = tuning.audio.musicVolume;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain).connect(master);
    source.start();

    this.drone = source;
    this.droneGain = gain;
  }

  stopDrone(): void {
    if (this.drone === null) return;
    try {
      this.drone.stop();
    } catch {
      // Already stopped: nothing to do.
    }
    this.drone.disconnect();
    this.droneGain?.disconnect();
    this.drone = null;
    this.droneGain = null;
  }

  private renderAll(ctx: BaseAudioContext): void {
    // Cannon: a layered thump, pitch dropping fast under a noise crack.
    this.buffers.set(
      'cannon',
      renderBuffer(ctx, 0.42, (t) => {
        const env = Math.exp(-t * 9);
        const body = Math.sin(2 * Math.PI * (170 * Math.exp(-t * 14) + 44) * t);
        const crack = (Math.random() * 2 - 1) * Math.exp(-t * 45);
        return (body * 0.85 + crack * 0.5) * env;
      }),
    );

    // Turret: the same idea an octave up and much shorter.
    this.buffers.set(
      'turret',
      renderBuffer(ctx, 0.2, (t) => {
        const env = Math.exp(-t * 22);
        const body = Math.sin(2 * Math.PI * (330 * Math.exp(-t * 18) + 120) * t);
        const crack = (Math.random() * 2 - 1) * Math.exp(-t * 70);
        return (body * 0.6 + crack * 0.6) * env;
      }),
    );

    this.buffers.set(
      'impact',
      renderBuffer(ctx, 0.14, (t) => {
        const env = Math.exp(-t * 40);
        const tone = Math.sin(2 * Math.PI * 620 * t) * 0.3;
        return ((Math.random() * 2 - 1) * 0.8 + tone) * env;
      }),
    );

    // Light armour: a dry crunch.
    this.buffers.set(
      'death_light',
      renderBuffer(ctx, 0.3, (t) => {
        const env = Math.exp(-t * 14);
        const grit = (Math.random() * 2 - 1) * 0.9;
        const tone = Math.sin(2 * Math.PI * (240 * Math.exp(-t * 8)) * t) * 0.4;
        return (grit + tone) * env;
      }),
    );

    // Armoured: heavier, with a metallic ring left hanging.
    this.buffers.set(
      'death_armored',
      renderBuffer(ctx, 0.62, (t) => {
        const env = Math.exp(-t * 6);
        const ring = Math.sin(2 * Math.PI * 196 * t) * 0.4 + Math.sin(2 * Math.PI * 293 * t) * 0.25;
        const thud = Math.sin(2 * Math.PI * (120 * Math.exp(-t * 10) + 40) * t) * 0.7;
        const grit = (Math.random() * 2 - 1) * Math.exp(-t * 26) * 0.6;
        return (ring + thud + grit) * env;
      }),
    );

    // Shielded: a glassy collapse.
    this.buffers.set(
      'death_shielded',
      renderBuffer(ctx, 0.5, (t) => {
        const env = Math.exp(-t * 8);
        const shimmer =
          Math.sin(2 * Math.PI * 880 * t) * 0.3 + Math.sin(2 * Math.PI * 1320 * t) * 0.2;
        const fall = Math.sin(2 * Math.PI * (500 * Math.exp(-t * 4)) * t) * 0.5;
        return (shimmer + fall) * env;
      }),
    );

    // Swarm: a small dry pop.
    this.buffers.set(
      'death_swarm',
      renderBuffer(ctx, 0.16, (t) => {
        const env = Math.exp(-t * 30);
        return ((Math.random() * 2 - 1) * 0.7 + Math.sin(2 * Math.PI * 700 * t) * 0.4) * env;
      }),
    );

    // Something bit the hull: felt more than heard.
    this.buffers.set(
      'hull_hit',
      renderBuffer(ctx, 0.36, (t) => {
        const env = Math.exp(-t * 11);
        const low = Math.sin(2 * Math.PI * (90 * Math.exp(-t * 7) + 32) * t);
        const scrape = (Math.random() * 2 - 1) * Math.exp(-t * 20) * 0.35;
        return (low * 0.9 + scrape) * env;
      }),
    );

    // Boss arrival: a rising minor third over a sub rumble.
    this.buffers.set(
      'boss_stinger',
      renderBuffer(ctx, 1.5, (t) => {
        const env = Math.min(1, t * 4) * Math.exp(-t * 1.4);
        const rise = 1 + t * 0.35;
        const a = Math.sin(2 * Math.PI * 110 * rise * t) * 0.5;
        const b = Math.sin(2 * Math.PI * 131 * rise * t) * 0.35;
        const sub = Math.sin(2 * Math.PI * 55 * t) * 0.6;
        const grit = (Math.random() * 2 - 1) * 0.08;
        return (a + b + sub + grit) * env;
      }),
    );

    // Phase 2: a harsher stab, the machine getting angry.
    this.buffers.set(
      'boss_phase',
      renderBuffer(ctx, 0.9, (t) => {
        const env = Math.exp(-t * 3.2);
        const growl = Math.sin(2 * Math.PI * (70 + Math.sin(2 * Math.PI * 7 * t) * 18) * t);
        const bite = Math.sin(2 * Math.PI * 220 * t) * 0.3;
        const grit = (Math.random() * 2 - 1) * 0.15;
        return (growl * 0.8 + bite + grit) * env;
      }),
    );

    this.buffers.set(
      'ui_click',
      renderBuffer(ctx, 0.09, (t) => {
        const env = Math.exp(-t * 50);
        return Math.sin(2 * Math.PI * 520 * t) * env * 0.7;
      }),
    );

    this.buffers.set(
      'upgrade',
      renderBuffer(ctx, 0.3, (t) => {
        const env = Math.exp(-t * 9);
        // Two tone confirmation, second note a fifth up.
        const first = Math.sin(2 * Math.PI * 440 * t) * (t < 0.12 ? 1 : 0);
        const second = Math.sin(2 * Math.PI * 660 * t) * (t >= 0.12 ? 1 : 0);
        return (first + second) * env * 0.6;
      }),
    );
  }

  destroy(): void {
    this.stopDrone();
    this.master?.disconnect();
  }
}

/** Phaser only exposes a Web Audio context on the WebAudio sound manager. */
function readContext(scene: Phaser.Scene): AudioContext | null {
  const manager = scene.sound as Partial<Phaser.Sound.WebAudioSoundManager>;
  const context = manager.context;
  return context instanceof AudioContext ? context : null;
}

/** Renders a mono buffer from a sample function of time in seconds. */
function renderBuffer(
  ctx: BaseAudioContext,
  durationSeconds: number,
  sample: (t: number, sampleRate: number) => number,
): AudioBuffer {
  const rate = ctx.sampleRate || SAMPLE_RATE_FALLBACK;
  const length = Math.max(1, Math.floor(rate * durationSeconds));
  const buffer = ctx.createBuffer(1, length, rate);
  const channel = buffer.getChannelData(0);

  for (let i = 0; i < length; i += 1) {
    const value = sample(i / rate, rate);
    // Guard against a runaway synth clipping the output.
    channel[i] = Math.max(-1, Math.min(1, value));
  }
  return buffer;
}
