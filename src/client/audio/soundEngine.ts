import { BiomeId } from '../../shared/types.ts';

export interface AudioVolumes {
  master: number;
  music: number;
  sfx: number;
  voice: number;
}

/**
 * ASHEN CROWN audio layer.
 * All effects are generated locally with Web Audio so the game ships without
 * external audio dependencies. The sound palette is deliberately tactile:
 * dry impacts, low-end weight, metallic weapon transients and restrained wind.
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientSource: AudioBufferSourceNode | null = null;
  private ambientFilter: BiquadFilterNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientDrone: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private currentBiome: BiomeId | null = null;
  private muted = false;
  private volumes: AudioVolumes = { master: 0.78, music: 0.62, sfx: 0.92, voice: 0.9 };

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
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
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
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, now, 0.035);
    this.musicGain.gain.setTargetAtTime(this.volumes.music * 0.52, now, 0.12);
    this.sfxGain.gain.setTargetAtTime(this.volumes.sfx, now, 0.025);
  }

  private tone(
    frequency: number,
    duration: number,
    amplitude: number,
    type: OscillatorType = 'sine',
    endFrequency = frequency,
    when = 0,
    destination: AudioNode | null = null
  ) {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, frequency), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), t + duration);
    gain.gain.setValueAtTime(Math.max(0.0001, amplitude), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(destination || this.sfxGain);
    osc.start(t);
    osc.stop(t + duration + 0.015);
  }

  private noise(
    duration: number,
    amplitude: number,
    filterType: BiquadFilterType = 'lowpass',
    frequency = 900,
    when = 0,
    q = 0.7,
    destination: AudioNode | null = null
  ) {
    if (!this.ctx || !this.sfxGain) return;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const fade = 1 - i / length;
      channel[i] = (Math.random() * 2 - 1) * fade;
    }
    const src = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    src.buffer = buffer;
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, this.ctx.currentTime + when);
    filter.Q.value = q;
    gain.gain.setValueAtTime(amplitude, this.ctx.currentTime + when);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + when + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(destination || this.sfxGain);
    src.start(this.ctx.currentTime + when);
    src.stop(this.ctx.currentTime + when + duration);
  }

  public setBiomeAmbience(biome: BiomeId) {
    if (!this.ctx || !this.musicGain || this.currentBiome === biome) return;
    this.currentBiome = biome;

    if (!this.ambientSource) {
      const length = this.ctx.sampleRate * 5;
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.025 * white) / 1.025;
        data[i] = last * 5.5;
      }
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 360;
      filter.Q.value = 0.42;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.16;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      source.start();
      this.ambientSource = source;
      this.ambientFilter = filter;
      this.ambientGain = gain;

      const drone = this.ctx.createOscillator();
      const droneFilter = this.ctx.createBiquadFilter();
      const droneGain = this.ctx.createGain();
      drone.type = 'sine';
      drone.frequency.value = 48;
      droneFilter.type = 'lowpass';
      droneFilter.frequency.value = 110;
      droneGain.gain.value = 0.035;
      drone.connect(droneFilter);
      droneFilter.connect(droneGain);
      droneGain.connect(this.musicGain);
      drone.start();
      this.ambientDrone = drone;
      this.droneGain = droneGain;
    }

    const profile: Record<BiomeId, { wind: number; low: number; volume: number }> = {
      BASE_CAMP: { wind: 310, low: 52, volume: 0.11 },
      MARSH: { wind: 185, low: 42, volume: 0.19 },
      CINDER_FLATS: { wind: 125, low: 38, volume: 0.2 },
      PINE_FOREST: { wind: 510, low: 58, volume: 0.13 },
      SALT_DUNES: { wind: 690, low: 46, volume: 0.2 },
      FROST_RIDGE: { wind: 880, low: 64, volume: 0.18 },
      ORCHARD_RUINS: { wind: 260, low: 49, volume: 0.14 },
    };
    const p = profile[biome];
    const now = this.ctx.currentTime;
    this.ambientFilter?.frequency.setTargetAtTime(p.wind, now, 0.8);
    this.ambientGain?.gain.setTargetAtTime(p.volume, now, 0.9);
    this.ambientDrone?.frequency.setTargetAtTime(p.low, now, 1.1);
  }

  public stopAmbience() {
    try { this.ambientSource?.stop(); } catch { /* already stopped */ }
    try { this.ambientDrone?.stop(); } catch { /* already stopped */ }
    this.ambientSource?.disconnect();
    this.ambientDrone?.disconnect();
    this.ambientFilter?.disconnect();
    this.ambientGain?.disconnect();
    this.droneGain?.disconnect();
    this.ambientSource = null;
    this.ambientDrone = null;
    this.ambientFilter = null;
    this.ambientGain = null;
    this.droneGain = null;
    this.currentBiome = null;
  }

  public playFootstep(sprint = false) {
    if (!this.ctx || !this.sfxGain) return;
    const weight = sprint ? 0.2 : 0.13;
    this.noise(0.095, weight, 'lowpass', sprint ? 520 : 430, 0, 0.8);
    this.tone(sprint ? 72 : 58, 0.105, sprint ? 0.13 : 0.085, 'sine', 35);
    this.noise(0.035, 0.035, 'highpass', 1800, 0.012, 0.6);
  }

  public playUiClick() {
    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    this.tone(760, 0.035, 0.055, 'sine', 510);
    this.tone(1120, 0.025, 0.018, 'sine', 860, 0.012);
  }

  public playWeaponAttack(weaponId: string) {
    if (!this.ctx || !this.sfxGain) return;
    if (weaponId === 'flintlock') {
      this.noise(0.34, 0.52, 'highpass', 1150, 0, 0.65);
      this.noise(0.42, 0.42, 'lowpass', 190, 0, 0.9);
      this.tone(105, 0.38, 0.42, 'sawtooth', 36);
      this.tone(48, 0.48, 0.2, 'sine', 28, 0.025);
      this.noise(0.16, 0.12, 'bandpass', 720, 0.08, 1.4);
    } else if (weaponId === 'longbow') {
      this.noise(0.11, 0.22, 'bandpass', 1450, 0, 1.2);
      this.tone(390, 0.16, 0.13, 'triangle', 145);
      this.noise(0.19, 0.11, 'highpass', 2600, 0.035, 0.8);
    } else {
      this.noise(0.14, 0.26, 'bandpass', 1150, 0, 1.1);
      this.tone(205, 0.16, 0.2, 'triangle', 68);
      this.noise(0.09, 0.08, 'highpass', 2200, 0.018, 0.8);
    }
  }

  public playHit(blocked = false) {
    if (!this.ctx || !this.sfxGain) return;
    if (blocked) {
      this.noise(0.12, 0.22, 'highpass', 2200, 0, 1.4);
      this.tone(980, 0.16, 0.18, 'square', 410);
      this.tone(620, 0.22, 0.1, 'triangle', 280, 0.018);
      return;
    }
    this.noise(0.15, 0.34, 'lowpass', 540, 0, 0.9);
    this.noise(0.07, 0.14, 'highpass', 1750, 0.006, 0.7);
    this.tone(92, 0.2, 0.28, 'sine', 38);
    this.tone(180, 0.12, 0.1, 'triangle', 72, 0.008);
  }

  public playPickup() {
    if (!this.ctx || !this.sfxGain) return;
    this.noise(0.055, 0.045, 'highpass', 2600);
    this.tone(520, 0.12, 0.11, 'triangle', 780);
    this.tone(780, 0.16, 0.09, 'sine', 1040, 0.075);
  }

  public playHeraldChime(tone: 'ceremony' | 'warning' | 'elimination' | 'escape' | 'victory') {
    if (!this.ctx || !this.sfxGain) return;
    const patterns: Record<typeof tone, number[]> = {
      ceremony: [196, 293.66, 392],
      warning: [174.61, 164.81, 130.81],
      elimination: [220, 164.81, 110],
      escape: [293.66, 392, 587.33],
      victory: [293.66, 369.99, 440, 587.33],
    };
    const notes = patterns[tone];
    notes.forEach((frequency, index) => {
      const when = index * (tone === 'warning' ? 0.19 : 0.13);
      this.tone(frequency, tone === 'warning' ? 0.48 : 0.72, tone === 'warning' ? 0.09 : 0.075, 'triangle', frequency * 0.985, when);
      this.tone(frequency * 2.01, 0.42, 0.022, 'sine', frequency * 1.98, when + 0.012);
    });
    if (tone === 'warning' || tone === 'elimination') {
      this.noise(0.38, 0.06, 'lowpass', 260, 0.02, 0.7);
    }
  }

  public playHelicopterPulse() {
    if (!this.ctx || !this.sfxGain) return;
    this.tone(58, 0.13, 0.16, 'sawtooth', 44);
    this.tone(116, 0.1, 0.045, 'sine', 82, 0.018);
    this.noise(0.11, 0.06, 'lowpass', 170, 0.015, 0.8);
  }
}

export const soundEngine = new SoundEngine();
