import type { RealmLayer } from '@w20-vtt/core';
import type { AudioSyncPayload } from '@w20-vtt/protocol';

function clampVolume(vol: number): number {
  if (!Number.isFinite(vol)) return 0.65;
  return Math.min(1, Math.max(0, vol));
}

export class SyncedSoundscapeEngine {
  private ctx: AudioContext | null = null;
  private physicalGain: GainNode | null = null;
  private penumbraGain: GainNode | null = null;
  private physicalAudio = new Audio();
  private penumbraAudio = new Audio();
  private physicalTrackUrl: string | null = null;
  private penumbraTrackUrl: string | null = null;
  private unlocked = false;
  private currentMasterVolume = 0.65;
  private activeRealm: RealmLayer = 'physical';
  private pendingState: {
    payload: AudioSyncPayload;
    serverClockOffsetMs: number;
    activeRealm: RealmLayer;
  } | null = null;

  constructor() {
    this.physicalAudio.loop = true;
    this.physicalAudio.crossOrigin = 'anonymous';
    this.penumbraAudio.loop = true;
    this.penumbraAudio.crossOrigin = 'anonymous';
  }

  unlockOnFirstGesture(): void {
    if (this.unlocked) {
      if (this.ctx?.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtx =
      typeof window !== 'undefined'
        ? window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        : undefined;

    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.physicalGain = this.ctx.createGain();
    this.penumbraGain = this.ctx.createGain();

    const physSource = this.ctx.createMediaElementSource(this.physicalAudio);
    const penSource = this.ctx.createMediaElementSource(this.penumbraAudio);

    physSource.connect(this.physicalGain).connect(this.ctx.destination);
    penSource.connect(this.penumbraGain).connect(this.ctx.destination);

    this.physicalGain.gain.value = this.currentMasterVolume;
    this.penumbraGain.gain.value = 0;
    this.unlocked = true;

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }

    if (this.pendingState) {
      const { payload, serverClockOffsetMs, activeRealm } = this.pendingState;
      this.pendingState = null;
      this.syncState(payload, serverClockOffsetMs, activeRealm);
    }
  }

  syncState(
    payload: AudioSyncPayload,
    serverClockOffsetMs: number,
    activeRealm: RealmLayer
  ): void {
    this.currentMasterVolume = clampVolume(payload.masterVolume);
    this.activeRealm = activeRealm;

    if (!this.unlocked || !this.ctx) {
      this.pendingState = { payload, serverClockOffsetMs, activeRealm };
      return;
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }

    const elapsedSec = Math.max(
      0,
      (Date.now() + serverClockOffsetMs - payload.startedAtServerMs) / 1000
    );

    this.syncLoopElement(
      this.physicalAudio,
      'physical',
      payload.physicalTrackUrl,
      elapsedSec
    );
    this.syncLoopElement(
      this.penumbraAudio,
      'penumbra',
      payload.penumbraTrackUrl,
      elapsedSec
    );
    this.crossfadeToRealm(activeRealm, this.currentMasterVolume);
  }

  crossfadeToRealm(realm: RealmLayer, masterVolume?: number): void {
    this.activeRealm = realm;
    if (masterVolume !== undefined) {
      this.currentMasterVolume = clampVolume(masterVolume);
    }

    if (!this.ctx || !this.physicalGain || !this.penumbraGain) return;

    const vol = this.currentMasterVolume;
    const now = this.ctx.currentTime;
    const inUmbra = realm !== 'physical';

    this.physicalGain.gain.setTargetAtTime(inUmbra ? 0.08 * vol : vol, now, 0.35);
    this.penumbraGain.gain.setTargetAtTime(inUmbra ? vol : 0.0, now, 0.35);
  }

  playSting(stingUrl: string, masterVolume?: number): void {
    if (!this.unlocked || !stingUrl) return;
    if (this.ctx?.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }

    const vol = clampVolume((masterVolume ?? this.currentMasterVolume) * 1.15);
    const sting = new Audio(stingUrl);
    sting.crossOrigin = 'anonymous';
    sting.volume = vol;
    void sting.play().catch(() => {});
  }

  setMasterVolume(vol: number): void {
    this.currentMasterVolume = clampVolume(vol);
    this.crossfadeToRealm(this.activeRealm, this.currentMasterVolume);
  }

  private syncLoopElement(
    el: HTMLAudioElement,
    slot: 'physical' | 'penumbra',
    url: string | null,
    elapsedSec: number
  ): void {
    const currentUrl = slot === 'physical' ? this.physicalTrackUrl : this.penumbraTrackUrl;

    if (!url) {
      if (slot === 'physical') this.physicalTrackUrl = null;
      else this.penumbraTrackUrl = null;
      el.pause();
      return;
    }

    if (currentUrl !== url) {
      if (slot === 'physical') this.physicalTrackUrl = url;
      else this.penumbraTrackUrl = url;
      el.src = url;
      el.onloadedmetadata = () => {
        if (Number.isFinite(el.duration) && el.duration > 0) {
          el.currentTime = elapsedSec % el.duration;
        }
        void el.play().catch(() => {});
      };
      return;
    }

    if (Number.isFinite(el.duration) && el.duration > 0) {
      const targetPos = elapsedSec % el.duration;
      // Only re-seek if drift exceeds 250ms to prevent audible clicks
      if (Math.abs(el.currentTime - targetPos) > 0.25) {
        el.currentTime = targetPos;
      }
      if (el.paused) {
        void el.play().catch(() => {});
      }
    }
  }
}

export const soundscapeEngine = new SyncedSoundscapeEngine();
