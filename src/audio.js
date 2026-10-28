/**
 * audio.js — WebAudio punch synthesis. No samples, no network.
 * AudioContext is only created after a real user gesture (click/keydown).
 */

export class AudioEngine {
  constructor({ muted = false } = {}) {
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    this.noiseBuffer = null;
    this.muted = Boolean(muted);
    this.volume = 0.72;
    this.supported = Boolean(window.AudioContext || window.webkitAudioContext);
  }

  /** Call from a click/keydown handler. Safe to call repeatedly. */
  unlock() {
    if (!this.supported) return false;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();

        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : this.volume;

        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -18;
        this.compressor.knee.value = 16;
        this.compressor.ratio.value = 5;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.18;

        this.master.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);

        this.noiseBuffer = this._createNoiseBuffer(0.35);
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return true;
    } catch {
      this.supported = false;
      return false;
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.ctx && this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, now, 0.02);
    }
  }

  _createNoiseBuffer(seconds) {
    const rate = this.ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * seconds));
    const buffer = this.ctx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  _canPlay() {
    return Boolean(this.ctx && this.master && !this.muted && this.ctx.state !== "closed");
  }

  /**
   * Layered punch: low body thump + filtered noise slap + short click.
   * @param {number} strength 0.3 .. 1.5
   */
  playPunch(strength = 0.6) {
    if (!this._canPlay()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const s = Math.min(1.5, Math.max(0.3, strength));

    // 1. Low sine thump — the weight of the bag.
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const startFreq = 92 + s * 38;
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(44 + s * 10, t + 0.17);

    const oscGain = ctx.createGain();
    const thumpLevel = 0.32 + s * 0.22;
    oscGain.gain.setValueAtTime(0.0001, t);
    oscGain.gain.linearRampToValueAtTime(thumpLevel, t + 0.006);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.21);

    osc.connect(oscGain);
    oscGain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.23);

    // 2. Filtered noise slap — leather impact.
    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.Q.value = 0.72;
      band.frequency.setValueAtTime(780 + s * 900, t);
      band.frequency.exponentialRampToValueAtTime(420 + s * 380, t + 0.1);

      const noiseGain = ctx.createGain();
      const noiseLevel = 0.26 + s * 0.2;
      noiseGain.gain.setValueAtTime(0.0001, t);
      noiseGain.gain.linearRampToValueAtTime(noiseLevel, t + 0.004);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.115);

      noise.connect(band);
      band.connect(noiseGain);
      noiseGain.connect(this.master);
      noise.start(t);
      noise.stop(t + 0.14);
    }

    // 3. Tiny high click — knuckle snap.
    const click = ctx.createOscillator();
    click.type = "triangle";
    click.frequency.setValueAtTime(1900 + s * 500, t);
    click.frequency.exponentialRampToValueAtTime(700, t + 0.025);
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.05 + s * 0.035, t);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    click.connect(clickGain);
    clickGain.connect(this.master);
    click.start(t);
    click.stop(t + 0.035);
  }

  /** Soft UI blip for mode/buttons. */
  playUi() {
    if (!this._canPlay()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.exponentialRampToValueAtTime(990, t + 0.05);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.055, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  /** Low round-end hit, used when the timer expires. */
  playRoundEnd() {
    if (!this._canPlay()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (let i = 0; i < 2; i += 1) {
      const start = t + i * 0.16;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(120, start);
      osc.frequency.exponentialRampToValueAtTime(48, start + 0.3);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.22, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.34);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(start);
      osc.stop(start + 0.36);
    }
  }

  dispose() {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
