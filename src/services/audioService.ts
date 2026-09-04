/**
 * Authentic Skyrim Web Audio Synthesizer
 * 100% Client-side and offline-ready procedural sound effects.
 */

class SkyrimAudioService {
  private ctx: AudioContext | null = null;
  public isMuted = false;

  private getAudioContext(): AudioContext | null {
    if (this.isMuted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public triggerHaptic(pattern: number | number[] = 20) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignore if denied or unsupported
      }
    }
  }

  /**
   * Iconic Skyrim Level Up:
   * Deep Nordic war drum thud + ascending ethereal choir chords
   */
  public playLevelUp() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    this.triggerHaptic([40, 60, 100]);

    const now = ctx.currentTime;

    // 1. Deep war drum thud
    const oscDrum = ctx.createOscillator();
    const gainDrum = ctx.createGain();
    oscDrum.type = 'sine';
    oscDrum.frequency.setValueAtTime(110, now);
    oscDrum.frequency.exponentialRampToValueAtTime(32, now + 0.4);

    gainDrum.gain.setValueAtTime(0.7, now);
    gainDrum.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    oscDrum.connect(gainDrum);
    gainDrum.connect(ctx.destination);
    oscDrum.start(now);
    oscDrum.stop(now + 0.8);

    // 2. Ascending choir chords (F3 - A3 - C4 - E4)
    const freqs = [174.61, 220.0, 261.63, 329.63, 440.0, 659.25];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800 + idx * 200, now);

      gain.gain.setValueAtTime(0.0001, now + idx * 0.1);
      gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.1 + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.1);
      osc.stop(now + 2.0);
    });
  }

  /**
   * Skyrim Quest Completed:
   * Resonant low brass gong followed by a high harmonic bell chime
   */
  public playQuestComplete() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    this.triggerHaptic([30, 40, 50]);

    const now = ctx.currentTime;

    // Bell chime frequencies (medieval fifths)
    const tones = [587.33, 880.0, 1174.66, 1760.0];
    tones.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.15 / (idx + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 1.7);
    });

    // Sub resonance
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(146.83, now); // D3
    subGain.gain.setValueAtTime(0.3, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 1.3);
  }

  /**
   * Constellation Perk Unlock:
   * Celestial star spark shimmer and crystalline ring
   */
  public playPerkUnlock() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    this.triggerHaptic([30, 50, 40]);

    const now = ctx.currentTime;

    // Shimmer chime
    const shimmerFreqs = [783.99, 1046.5, 1318.51, 1567.98, 2093.0];
    shimmerFreqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.05);

      gain.gain.setValueAtTime(0.0001, now + i * 0.05);
      gain.gain.linearRampToValueAtTime(0.12, now + i * 0.05 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.05);
      osc.stop(now + 1.4);
    });
  }

  /**
   * UI Click / Touch: Soft parchment leather tap
   */
  public playTabSwitch() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    this.triggerHaptic(15);

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.06);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.07);
  }

  /**
   * Objective checkmark notch sound
   */
  public playCheckbox() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    this.triggerHaptic(20);

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }
}

export const skyrimAudio = new SkyrimAudioService();
