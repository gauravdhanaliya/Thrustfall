// Synthesized sound effects (WebAudio). No audio files are shipped.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.45;
    this.master.connect(ctx.destination);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // jetpack hiss loop
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.8;
    this.jetGain = ctx.createGain();
    this.jetGain.gain.value = 0;
    src.connect(bp).connect(this.jetGain).connect(this.master);
    src.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.45;
  }

  noise(dur, type, freq, vol, at = 0) {
    const c = this.ctx, t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur);
  }

  tone(type, f0, f1, dur, vol, at = 0) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur);
  }

  shot(key, v) {
    switch (key) {
      case 'pistol': this.noise(0.09, 'lowpass', 3000, 0.5 * v); this.tone('square', 220, 80, 0.05, 0.12 * v); break;
      case 'smg': this.noise(0.06, 'lowpass', 4200, 0.35 * v); this.tone('triangle', 300, 120, 0.04, 0.15 * v); break;
      case 'shotgun': this.noise(0.32, 'lowpass', 1400, 0.85 * v); this.tone('sine', 120, 40, 0.16, 0.5 * v); break;
      case 'sniper': this.noise(0.5, 'lowpass', 2200, 0.7 * v); this.tone('sawtooth', 900, 100, 0.12, 0.18 * v); break;
      case 'rocket': this.noise(0.5, 'bandpass', 600, 0.6 * v); this.tone('sine', 200, 60, 0.25, 0.3 * v); break;
    }
  }

  handle(events, local) {
    if (!this.ctx || this.muted) return;
    const lx = local ? local.x : 0, ly = local ? local.y : 0;
    let shots = 0;
    for (const e of events) {
      const mine = local && (e.id === local.id || e.by === local.id);
      const v = e.x === undefined || mine ? 1 : Math.max(0, 1 - Math.hypot(e.x - lx, e.y - ly) / 1000) ** 1.5;
      if (v < 0.03) continue;
      switch (e.type) {
        case 'shot': if (shots++ < 4) this.shot(e.key, v); break;
        case 'explosion': this.noise(1.1, 'lowpass', 500, 1.0 * v); this.tone('sine', 90, 30, 0.6, 0.8 * v); break;
        case 'hit': if (mine) this.tone('square', 1300, 900, 0.04, e.head ? 0.2 : 0.12); break;
        case 'damage': if (local && e.id === local.id) this.tone('sawtooth', 200, 90, 0.12, 0.2); break;
        case 'kill':
          if (local && e.killer === local.id && e.victim !== local.id) { this.tone('sine', 660, 990, 0.12, 0.25); this.tone('sine', 990, 1320, 0.12, 0.2, 0.08); }
          else this.tone('sawtooth', 400, 60, 0.4, 0.15 * v);
          break;
        case 'pickup': if (mine) { this.tone('sine', 520, 1040, 0.1, 0.25); } break;
        case 'reload': if (mine) { this.noise(0.04, 'bandpass', 3000, 0.4); this.noise(0.05, 'bandpass', 2400, 0.5, 0.3); } break;
        case 'swap': if (mine) this.noise(0.05, 'bandpass', 2000, 0.3); break;
        case 'empty': if (mine) this.tone('square', 1500, 1400, 0.02, 0.15); break;
        case 'throw': this.noise(0.14, 'bandpass', 1200, 0.3 * v); break;
        case 'bounce': this.tone('triangle', 1800, 1400, 0.03, 0.1 * v); break;
        case 'spawn': if (mine) this.tone('sine', 300, 600, 0.2, 0.2); break;
        case 'over': [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.25, 0.25, i * 0.12)); break;
      }
    }
  }

  setJet(on) {
    if (!this.ctx) return;
    this.jetGain.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.05);
  }
}
