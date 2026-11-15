import { BiomeId } from '../../shared/types.ts';

export interface AudioVolumes {
  master: number;
  music: number;
  sfx: number;
  voice: number;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientSource: AudioBufferSourceNode | null = null;
  private ambientFilter: BiquadFilterNode | null = null;
  private currentBiome: BiomeId | null = null;
  private muted = false;
  private volumes: AudioVolumes = { master: 0.75, music: 0.55, sfx: 0.85, voice: 0.85 };

  public unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setVolumes(next: Partial<AudioVolumes>) {
    this.volumes = { ...this.volumes, ...next };
    this.applyVolumes();
  }

  public getVolumes(): AudioVolumes {
    return { ...this.volumes };
  }

  public setMuted(m: boolean) {
    this.muted = m;
    this.applyVolumes();
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private applyVolumes() {
    if (!this.masterGain || !this.musicGain || !this.sfxGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, now, 0.04);
    this.musicGain.gain.setTargetAtTime(this.volumes.music * 0.35, now, 0.08);
    this.sfxGain.gain.setTargetAtTime(this.volumes.sfx, now, 0.04);
  }

  public setBiomeAmbience(biome: BiomeId) {
    if (!this.ctx || !this.musicGain || this.currentBiome === biome) return;
    this.currentBiome = biome;

    if (!this.ambientSource) {
      const length = this.ctx.sampleRate * 3;
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + 0.03 * white) / 1.03;
        lastOut = data[i];
        data[i] *= 2.5;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 340;
      filter.Q.value = 0.8;

      const ambGain = this.ctx.createGain();
      ambGain.gain.value = 0.28;

      src.connect(filter);
      filter.connect(ambGain);
      ambGain.connect(this.musicGain);
      src.start();

      this.ambientSource = src;
      this.ambientFilter = filter;
    }

    if (this.ambientFilter) {
      const freqByBiome: Record<BiomeId, number> = {
        BASE_CAMP: 260,
        MARSH: 210,
        CINDER_FLATS: 150,
        PINE_FOREST: 420,
        SALT_DUNES: 560,
        FROST_RIDGE: 740,
        ORCHARD_RUINS: 330,
      };
      this.ambientFilter.frequency.setTargetAtTime(freqByBiome[biome] || 300, this.ctx.currentTime, 0.6);
    }
  }

  public stopAmbience() {
    if (this.ambientSource) {
      try {
        this.ambientSource.stop();
        this.ambientSource.disconnect();
      } catch {
        // ignore
      }
      this.ambientSource = null;
      this.ambientFilter = null;
      this.currentBiome = null;
    }
  }

  public playFootstep(sprint = false) {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    const baseFreq = (sprint ? 120 : 95) * (0.92 + Math.random() * 0.16);
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.065);
    gain.gain.setValueAtTime(sprint ? 0.16 : 0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  public playUiClick() {
    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.045);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  public playWeaponAttack(weaponId: string) {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    if (weaponId === 'flintlock') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.18);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    } else if (weaponId === 'longbow') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.12);
      gain.gain.setValueAtTime(0.26, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.09);
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    }
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  public playHit(blocked = false) {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = blocked ? 'square' : 'sawtooth';
    osc.frequency.setValueAtTime(blocked ? 780 : 165, now);
    osc.frequency.exponentialRampToValueAtTime(blocked ? 480 : 55, now + 0.11);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playPickup() {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    [440, 587].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.055);
      gain.gain.setValueAtTime(0.18, now + i * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.12);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.13);
    });
  }

  public playHeraldChime(tone: 'ceremony' | 'warning' | 'elimination' | 'escape' | 'victory') {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const notes =
      tone === 'warning'
        ? [220, 207]
        : tone === 'victory'
          ? [293.66, 369.99, 440, 587.33]
          : tone === 'escape'
            ? [329.63, 440, 523.25]
            : [220, 277.18, 329.63];

    notes.forEach((f, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = tone === 'warning' ? 'sawtooth' : 'triangle';
      const t0 = now + idx * 0.12;
      osc.frequency.setValueAtTime(f, t0);
      gain.gain.setValueAtTime(0.16, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.65);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t0);
      osc.stop(t0 + 0.7);
    });
  }

  public playHelicopterPulse() {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(62, now);
    osc.frequency.linearRampToValueAtTime(48, now + 0.08);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }
}

export const soundEngine = new SoundEngine();
