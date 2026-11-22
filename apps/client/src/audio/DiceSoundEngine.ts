export interface DiceSoundPreferences {
  muted: boolean;
  volume: number;
}

const DEFAULT_PREFS: DiceSoundPreferences = {
  muted: false,
  volume: 0.75,
};

function clampVolume(vol: number): number {
  if (!Number.isFinite(vol)) return DEFAULT_PREFS.volume;
  return Math.min(1, Math.max(0, vol));
}

function getStorageKey(userId: string): string {
  return `w20-dice-sfx:v1:${userId}`;
}

export class DiceSoundEngine {
  private ctx: AudioContext | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private activeTimers = new Set<ReturnType<typeof setTimeout>>();
  private lastSettleAtMs = 0;
  private preferences: DiceSoundPreferences = { ...DEFAULT_PREFS };

  unlock(): void {
    const AudioCtx =
      typeof window !== 'undefined'
        ? window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        : undefined;

    if (!AudioCtx) return;

    if (!this.ctx) {
      const ctx = new AudioCtx();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 12;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.002;
      compressor.release.value = 0.12;

      const masterGain = ctx.createGain();
      masterGain.gain.value = this.preferences.muted ? 0 : this.preferences.volume;

      compressor.connect(masterGain).connect(ctx.destination);

      this.ctx = ctx;
      this.compressor = compressor;
      this.masterGain = masterGain;
      this.noiseBuffer = this.createNoiseBuffer(ctx);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
  }

  loadPreferences(userId: string): DiceSoundPreferences {
    let loaded = { ...DEFAULT_PREFS };
    try {
      const raw = window.localStorage.getItem(getStorageKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<DiceSoundPreferences>;
        loaded = {
          muted: Boolean(parsed.muted),
          volume: clampVolume(Number(parsed.volume ?? DEFAULT_PREFS.volume)),
        };
      }
    } catch {
      // Ignore storage access restrictions
    }
    this.applyPreferences(loaded);
    return loaded;
  }

  savePreferences(userId: string, prefs: DiceSoundPreferences): void {
    const normalized: DiceSoundPreferences = {
      muted: Boolean(prefs.muted),
      volume: clampVolume(prefs.volume),
    };
    this.applyPreferences(normalized);
    try {
      window.localStorage.setItem(getStorageKey(userId), JSON.stringify(normalized));
    } catch {
      // Ignore storage write errors
    }
  }

  applyPreferences(prefs: DiceSoundPreferences): void {
    this.preferences = {
      muted: Boolean(prefs.muted),
      volume: clampVolume(prefs.volume),
    };
    if (this.ctx && this.masterGain) {
      const target = this.preferences.muted ? 0 : this.preferences.volume;
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.015);
    }
  }

  stopActiveRollCascade(): void {
    for (const timer of this.activeTimers) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();
  }

  playThrowCascade(effectivePool: number, rageDiceCount: number): void {
    this.unlock();
    this.stopActiveRollCascade();

    if (this.preferences.muted || effectivePool <= 0 || !this.ctx || !this.compressor) {
      return;
    }

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 1. Brief hand-release brush across the felt
    if (this.noiseBuffer) {
      const brushSrc = ctx.createBufferSource();
      brushSrc.buffer = this.noiseBuffer;
      const brushFilter = ctx.createBiquadFilter();
      brushFilter.type = 'bandpass';
      brushFilter.frequency.setValueAtTime(1350, now);
      brushFilter.Q.value = 1.2;

      const brushGain = ctx.createGain();
      brushGain.gain.setValueAtTime(0.0001, now);
      brushGain.gain.linearRampToValueAtTime(0.14, now + 0.008);
      brushGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

      brushSrc.connect(brushFilter).connect(brushGain).connect(this.compressor);
      brushSrc.start(now);
      brushSrc.stop(now + 0.055);
    }

    // 2. Subtle crimson ember resonance when throwing Blood-Red Rage dice
    if (rageDiceCount > 0) {
      const emberOsc = ctx.createOscillator();
      emberOsc.type = 'triangle';
      emberOsc.frequency.setValueAtTime(68, now);
      emberOsc.frequency.exponentialRampToValueAtTime(48, now + 0.22);

      const emberFilter = ctx.createBiquadFilter();
      emberFilter.type = 'lowpass';
      emberFilter.frequency.value = 210;

      const emberGain = ctx.createGain();
      emberGain.gain.setValueAtTime(0.0001, now);
      emberGain.gain.linearRampToValueAtTime(0.12, now + 0.025);
      emberGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.23);

      emberOsc.connect(emberFilter).connect(emberGain).connect(this.compressor);
      emberOsc.start(now);
      emberOsc.stop(now + 0.24);
    }

    // 3. Staggered polyhedral bounce voices scaled cleanly to pool size (1..8 voices)
    const voices = Math.min(Math.max(1, effectivePool), 8);
    for (let v = 0; v < voices; v += 1) {
      const bounceCount = 4 + Math.floor(Math.random() * 3);
      const voiceStartMs = 45 + v * 28 + Math.random() * 40;
      const voicePanBase = (Math.random() - 0.5) * 0.9;
      let cumulativeMs = voiceStartMs;

      for (let b = 0; b < bounceCount; b += 1) {
        const progress = b / bounceCount;
        const intensity = Math.max(0.16, (1 - progress * 0.68) * (0.72 + Math.random() * 0.28));
        const pitchScale = 0.88 + Math.random() * 0.28;
        const pan = Math.max(-0.55, Math.min(0.55, voicePanBase + (Math.random() - 0.5) * 0.22));
        const scheduledMs = cumulativeMs;

        const timer = setTimeout(() => {
          this.activeTimers.delete(timer);
          if (this.preferences.muted || !this.ctx || !this.compressor) return;
          this.scheduleDieImpact(this.ctx.currentTime + 0.004, intensity, pan, pitchScale);
        }, scheduledMs);

        this.activeTimers.add(timer);
        cumulativeMs += 70 + progress * 125 + Math.random() * 55;
      }
    }
  }

  playDieSettle(value?: number, isRageDie = false): void {
    if (this.preferences.muted || !this.ctx || !this.compressor) {
      return;
    }

    const nowMs = performance.now();
    if (nowMs - this.lastSettleAtMs < 35) {
      return;
    }
    this.lastSettleAtMs = nowMs;

    const whenSec = this.ctx.currentTime + 0.004;
    const pan = (Math.random() - 0.5) * 0.5;
    const pitchScale = isRageDie ? 0.92 : 1.04;
    this.scheduleDieImpact(whenSec, 0.28, pan, pitchScale);

    // Delicate high harmonic glint when a d10 settles on 10
    if (value === 10) {
      const glintOsc = this.ctx.createOscillator();
      glintOsc.type = 'sine';
      glintOsc.frequency.setValueAtTime(1320, whenSec);

      const glintGain = this.ctx.createGain();
      glintGain.gain.setValueAtTime(0.0001, whenSec);
      glintGain.gain.linearRampToValueAtTime(0.055, whenSec + 0.008);
      glintGain.gain.exponentialRampToValueAtTime(0.0001, whenSec + 0.11);

      glintOsc.connect(glintGain).connect(this.compressor);
      glintOsc.start(whenSec);
      glintOsc.stop(whenSec + 0.12);
    }
  }

  playOutcomeAccent(roll: {
    isBotch: boolean;
    netSuccesses: number;
    rollMode?: 'pool' | 'initiative';
  }): void {
    this.unlock();
    if (this.preferences.muted || !this.ctx || !this.compressor) {
      return;
    }

    const ctx = this.ctx;
    const now = ctx.currentTime + 0.01;

    if (roll.rollMode === 'initiative') {
      const notes = [440, 587.33];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.03);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now + idx * 0.03);
        gain.gain.linearRampToValueAtTime(0.09, now + idx * 0.03 + 0.014);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

        osc.connect(gain).connect(this.compressor!);
        osc.start(now + idx * 0.03);
        osc.stop(now + 0.32);
      });
      return;
    }

    if (roll.isBotch) {
      // Deep, ominous low umbral dissonance
      const freqs = [98, 92];
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(340, now);

      const outGain = ctx.createGain();
      outGain.gain.setValueAtTime(0.0001, now);
      outGain.gain.linearRampToValueAtTime(0.24, now + 0.025);
      outGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

      filter.connect(outGain).connect(this.compressor);

      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        osc.type = idx === 0 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(f, now);
        osc.frequency.exponentialRampToValueAtTime(f * 0.88, now + 0.4);
        osc.connect(filter);
        osc.start(now);
        osc.stop(now + 0.44);
      });
      return;
    }

    if (roll.netSuccesses >= 1) {
      // Warm antique-bronze fifth chime (+ octave shimmer on Exceptional 4+ successes)
      const notes = roll.netSuccesses >= 4 ? [440, 659.25, 880] : [440, 659.25];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        osc.type = idx === 2 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.025);

        const gain = ctx.createGain();
        const peak = idx === 2 ? 0.065 : 0.095;
        gain.gain.setValueAtTime(0.0001, now + idx * 0.025);
        gain.gain.linearRampToValueAtTime(peak, now + idx * 0.025 + 0.014);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);

        osc.connect(gain).connect(this.compressor!);
        osc.start(now + idx * 0.025);
        osc.stop(now + 0.36);
      });
      return;
    }

    // Quiet muted stone tap on ordinary failure
    const tapOsc = ctx.createOscillator();
    tapOsc.type = 'triangle';
    tapOsc.frequency.setValueAtTime(210, now);
    tapOsc.frequency.exponentialRampToValueAtTime(90, now + 0.055);

    const tapGain = ctx.createGain();
    tapGain.gain.setValueAtTime(0.0001, now);
    tapGain.gain.linearRampToValueAtTime(0.11, now + 0.004);
    tapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    tapOsc.connect(tapGain).connect(this.compressor);
    tapOsc.start(now);
    tapOsc.stop(now + 0.065);
  }

  playPipClick(): void {
    this.unlock();
    if (this.preferences.muted || !this.ctx || !this.compressor) {
      return;
    }
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.014);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.075, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.016);

    osc.connect(gain).connect(this.compressor);
    osc.start(now);
    osc.stop(now + 0.02);
  }

  private scheduleDieImpact(
    whenSec: number,
    intensity: number,
    pan: number,
    pitchScale: number
  ): void {
    if (!this.ctx || !this.compressor) return;
    const ctx = this.ctx;

    const bus = ctx.createGain();
    bus.gain.value = 1;

    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      bus.connect(panner).connect(this.compressor);
    } else {
      bus.connect(this.compressor);
    }

    // Felt / Wood tabletop thud
    const thudOsc = ctx.createOscillator();
    thudOsc.type = 'triangle';
    thudOsc.frequency.setValueAtTime(150 * pitchScale, whenSec);
    thudOsc.frequency.exponentialRampToValueAtTime(46, whenSec + 0.036);

    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.0001, whenSec);
    thudGain.gain.linearRampToValueAtTime(0.28 * intensity, whenSec + 0.002);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, whenSec + 0.042);

    thudOsc.connect(thudGain).connect(bus);
    thudOsc.start(whenSec);
    thudOsc.stop(whenSec + 0.048);

    // Resin/Obsidian edge click (filtered noise burst + two modal partials)
    if (this.noiseBuffer) {
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime((2400 + Math.random() * 1400) * pitchScale, whenSec);
      filter.Q.value = 3.5;

      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.0001, whenSec);
      clickGain.gain.linearRampToValueAtTime(0.36 * intensity, whenSec + 0.0015);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, whenSec + 0.02);

      noiseSrc.connect(filter).connect(clickGain).connect(bus);
      noiseSrc.start(whenSec);
      noiseSrc.stop(whenSec + 0.024);
    }

    const modalFreqs = [960 * pitchScale, 1620 * pitchScale];
    modalFreqs.forEach((mf, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(mf, whenSec);

      const mGain = ctx.createGain();
      mGain.gain.setValueAtTime(0.0001, whenSec);
      mGain.gain.linearRampToValueAtTime((idx === 0 ? 0.08 : 0.05) * intensity, whenSec + 0.001);
      mGain.gain.exponentialRampToValueAtTime(0.0001, whenSec + 0.021);

      osc.connect(mGain).connect(bus);
      osc.start(whenSec);
      osc.stop(whenSec + 0.025);
    });
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const sampleCount = Math.floor(ctx.sampleRate * 0.1);
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < sampleCount; i += 1) {
      const white = Math.random() * 2 - 1;
      // Slight warmth tilt while preserving crisp edge transients
      lastOut = (lastOut + 0.45 * white) / 1.45;
      channel[i] = white * 0.72 + lastOut * 0.28;
    }
    return buffer;
  }
}

export const diceSoundEngine = new DiceSoundEngine();
