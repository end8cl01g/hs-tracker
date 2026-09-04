/**
 * Web Audio API synthesizer for authentic Skyrim-style ambient and UI sound effects.
 * Synthesized completely client-side without relying on external assets.
 */

class SkyrimAudioManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private initCtx() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Sound of unrolling or turning dry, weathered ancient parchment.
   */
  public playParchmentRustle() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Filtered noise buffer
    const bufferSize = ctx.sampleRate * 0.45;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(850, now);
    bandpass.frequency.exponentialRampToValueAtTime(320, now + 0.4);
    bandpass.Q.setValueAtTime(2.5, now);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.01, now);
    gainNode.gain.linearRampToValueAtTime(0.18, now + 0.08);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    whiteNoise.connect(bandpass);
    bandpass.connect(gainNode);
    gainNode.connect(ctx.destination);

    whiteNoise.start(now);
    whiteNoise.stop(now + 0.45);
  }

  /**
   * Skyrim iconic UI menu selection click / stone-blade tap.
   */
  public playMenuClick() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(540, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.08);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  /**
   * Metallic blade unsheath or equipment equip ring.
   */
  public playEquip() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1420, now + 0.12);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(440, now);
    osc2.frequency.linearRampToValueAtTime(660, now + 0.1);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.28);
    osc2.stop(now + 0.28);
  }

  /**
   * Powerful deep Dragon Shout (Thu'um) sub-bass resonance and shockwave rumble.
   */
  public playDragonShout(level: number = 1) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const duration = 0.8 + level * 0.4;

    // Sub oscillator (bass thud)
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(90 + level * 15, now);
    subOsc.frequency.exponentialRampToValueAtTime(45, now + duration);

    // Lowpass filter for deep brassy sound
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(320 + level * 80, now);
    lowpass.frequency.exponentialRampToValueAtTime(90, now + duration);
    lowpass.Q.setValueAtTime(4, now);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.28, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    subOsc.connect(lowpass);
    lowpass.connect(subGain);
    subGain.connect(ctx.destination);

    subOsc.start(now);
    subOsc.stop(now + duration);

    // Wind rumble
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const out = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      out[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(240, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(120, now + duration);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.15, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + duration);
  }

  /**
   * Arcane magical chime / elder scroll reading shimmer.
   */
  public playArcaneChime() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    const freqs = [523.25, 659.25, 783.99, 1046.5]; // C E G C
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);

      gain.gain.setValueAtTime(0.05, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.65);
    });
  }
}

export const skyrimAudio = new SkyrimAudioManager();
