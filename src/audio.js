// Tiny WebAudio synth: every sound effect is generated, so there are no asset files.
// The AudioContext can only start after a user gesture, so call unlock() from a click.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.muted = false;
    try {
      this.muted = localStorage.getItem('clucked.muted') === '1';
    } catch { /* storage unavailable */ }
  }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch { /* audio is optional */ }
  }

  setMuted(m) {
    this.muted = m;
    try {
      localStorage.setItem('clucked.muted', m ? '1' : '0');
    } catch { /* ignore */ }
  }

  tone(freq, dur, { type = 'square', vol = 0.2, to = null, delay = 0 } = {}) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.3, hp = 0, lp = 9000, delay = 0 } = {}) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const hpf = c.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = hp;
    const lpf = c.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = lp;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(hpf).connect(lpf).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    try {
      this.sound(name);
    } catch { /* never let audio break the game */ }
  }

  sound(name) {
    switch (name) {
      case 'ui': this.tone(660, 0.07, { vol: 0.12, to: 990 }); break;
      case 'swing-light': this.noise(0.09, { vol: 0.12, hp: 1200, lp: 6000 }); break;
      case 'swing-heavy': this.noise(0.18, { vol: 0.2, hp: 500, lp: 4500 }); break;
      case 'swing-special':
        this.tone(320, 0.28, { type: 'sine', vol: 0.22, to: 980 });
        this.noise(0.2, { vol: 0.12, hp: 1500 });
        break;
      case 'hit-light':
        this.tone(190, 0.1, { type: 'triangle', vol: 0.4, to: 60 });
        this.noise(0.06, { vol: 0.3, lp: 3200 });
        break;
      case 'hit-heavy':
        this.tone(130, 0.22, { type: 'triangle', vol: 0.55, to: 38 });
        this.noise(0.14, { vol: 0.4, lp: 2400 });
        break;
      case 'hit-special':
        this.tone(420, 0.26, { type: 'sawtooth', vol: 0.3, to: 70 });
        this.noise(0.15, { vol: 0.3, lp: 4000 });
        break;
      case 'block':
        this.tone(900, 0.07, { vol: 0.16, to: 650 });
        this.noise(0.05, { vol: 0.18, hp: 3000 });
        break;
      case 'jump':
        this.tone(500, 0.08, { vol: 0.1, to: 760 });
        this.tone(620, 0.07, { vol: 0.09, to: 450, delay: 0.09 });
        break;
      case 'land': this.noise(0.06, { vol: 0.16, lp: 700 }); break;
      case 'dodge': this.noise(0.15, { vol: 0.16, hp: 2000 }); break;
      case 'clash': this.noise(0.12, { vol: 0.25, hp: 1500 }); this.tone(1200, 0.06, { vol: 0.12 }); break;
      case 'ko':
        this.tone(420, 0.9, { type: 'sawtooth', vol: 0.4, to: 55 });
        this.noise(0.5, { vol: 0.4, lp: 2000 });
        break;
      case 'domain':
        this.tone(110, 1.1, { type: 'sine', vol: 0.4, to: 880 });
        this.tone(55, 1.1, { type: 'triangle', vol: 0.3, to: 440 });
        this.noise(0.9, { vol: 0.15, hp: 800 });
        break;
      case 'domain-end': this.tone(500, 0.5, { type: 'sine', vol: 0.2, to: 90 }); break;
      case 'tick': this.tone(260, 0.05, { type: 'triangle', vol: 0.1, to: 200 }); break;
      case 'count': this.tone(440, 0.14, { vol: 0.18 }); break;
      case 'go': this.tone(880, 0.35, { vol: 0.22, to: 1100 }); break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, { vol: 0.2, delay: i * 0.12, type: 'triangle' }));
        break;
      case 'lose':
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.22, { vol: 0.2, delay: i * 0.16, type: 'triangle' }));
        break;
      default: break;
    }
  }
}
