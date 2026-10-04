import { SoundClusters } from './shatter-lab-sound-clusters.js';
import { glassVoiceProfile, glassAccentLayers } from './shatter-lab-audio-layers.js';
import { IceMusic } from './shatter-lab-music.js';
export { glassVoiceProfile } from './shatter-lab-audio-layers.js';

export class CollisionAudio {
  constructor() {
    this.enabled = true;
    this.volume = 0.45;
    this.musicEnabled = true;
    this.visible = true;
    this.voices = 0;
    this.lastCollision = 0;
    this.events = 0;
    this.clusters = new SoundClusters();
    this.sources = new Map();
    this.cameraRight = [1, 0, 0];
  }
  initialize(c) {
    this.context = c;
    this.output = c.createGain();
    this.output.gain.value = this.enabled ? this.volume : 0;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.ratio.value = 10;
    this.output.connect(limiter);
    limiter.connect(c.destination);
    this.reverb = c.createConvolver();
    const buffer = c.createBuffer(2, c.sampleRate * 0.65, c.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const d = buffer.getChannelData(channel);
      for (let i = 0; i < d.length; i++)
        d[i] = (Math.random() * 2 - 1) * Math.exp((-i / c.sampleRate) * 12) * 0.18;
    }
    this.reverb.buffer = buffer;
    const wet = c.createGain();
    wet.gain.value = 0.12;
    this.reverb.connect(wet);
    wet.connect(this.output);
    this.noise = c.createBuffer(1, c.sampleRate * 0.55, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.music = new IceMusic(c, this.output);
    this.music.setEnabled(this.musicEnabled);
    this.music.setActive(this.enabled && this.visible && this.volume > 0);
  }
  async unlock() {
    if (!this.context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      this.initialize(new Audio());
    }
    try {
      await this.context.resume();
      this.music?.sync();
    } catch {
      this.enabled = false;
    }
  }
  setEnabled(value) {
    this.enabled = value;
    if (!value) this.reset();
    if (this.output)
      this.output.gain.setTargetAtTime(value ? this.volume : 0, this.context.currentTime, 0.02);
    this.music?.setActive(value && this.visible && this.volume > 0);
  }
  setMusicEnabled(value) {
    this.musicEnabled = value;
    this.music?.setEnabled(value);
  }
  setVisible(value) {
    this.visible = value;
    this.music?.setActive(value && this.enabled && this.volume > 0);
  }
  setVolume(value) {
    this.volume = value;
    this.setEnabled(this.enabled);
  }
  flush() {
    this.music?.tick();
    for (const e of this.clusters.drain(this.context?.currentTime ?? 0)) this.play(e);
  }
  reset() {
    this.clusters.clear();
    for (const [source, finish] of [...this.sources]) {
      source.stop();
      finish();
    }
  }
  track(source, nodes, done) {
    this.voices++;
    const finish = () => {
      if (!this.sources.delete(source)) return;
      source.onended = null;
      for (const node of [source, ...nodes]) node.disconnect();
      this.voices--;
      done();
    };
    this.sources.set(source, finish);
    source.onended = finish;
  }
  sound(event) {
    if (!this.enabled || this.context?.state !== 'running') return;
    if (event.kind === 'secondary' && event.floor && event.volume >= 0.08 && event.landingDepth === 1)
      this.music?.duck();
    if (event.kind === 'strike') this.play(event);
    else this.clusters.add({ kind: 'collision', impulse: 0.1, volume: 0.05, point: [0, 0, 0], ...event });
  }
  play({
    volume = 0.05,
    impulse = 0.1,
    point = [0, 0, 0],
    glass = false,
    kind = 'collision',
    tool = 'hammer',
    count = 1,
    floor = false,
  }) {
    const c = this.context;
    const voiceLimit = kind === 'collision' ? 26 : 36;
    if (!this.enabled || !c || c.state !== 'running' || this.voices >= voiceLimit) return;
    const now = c.currentTime;
    this.events++;
    const profile = glassVoiceProfile(volume, kind, glass);
    const { size, collision, crash } = profile;
    const fundamental = profile.fundamental * (0.985 + Math.random() * 0.03);
    const level = Math.min(0.2, Math.sqrt(Math.max(0, impulse)) * 0.055) * (kind === 'collision' ? 0.65 : 1);
    const pan = c.createStereoPanner();
    pan.pan.value = Math.max(
      -0.8,
      Math.min(0.8, point.reduce((s, v, i) => s + v * this.cameraRight[i], 0) / 5),
    );
    pan.connect(this.output);
    pan.connect(this.reverb);
    let remaining = 0;
    const done = () => {
      if (--remaining === 0) pan.disconnect();
    };
    for (const [i, ratio] of profile.ratios.entries()) {
      if (this.voices >= voiceLimit - 1) break;
      const frequency = fundamental * ratio;
      if (frequency > Math.min(11500, c.sampleRate * 0.45)) continue;
      const osc = c.createOscillator(),
        gain = c.createGain(),
        decay = profile.decay / (1 + i * 0.45);
      osc.frequency.value = frequency;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime((level / (1 + i * 1.6)) * profile.modalLevel, now + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(gain);
      gain.connect(pan);
      osc.start(now);
      osc.stop(now + decay + 0.01);
      remaining++;
      this.track(osc, [gain], done);
    }
    if (this.voices < voiceLimit) {
      const source = c.createBufferSource(),
        filter = c.createBiquadFilter(),
        gain = c.createGain();
      source.buffer = this.noise;
      filter.type = 'bandpass';
      filter.frequency.value = crash
        ? 6200
        : collision
          ? Math.min(9000, 1800 + fundamental * 0.7)
          : tool === 'bat'
            ? 3000
            : 4200;
      filter.Q.value = crash ? 0.65 : collision ? 0.8 : 0.55;
      const duration = crash ? Math.min(0.24, 0.09 + size * 0.09 + count * 0.003) : collision ? 0.022 : 0.018;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(level * profile.noiseLevel, now + 0.001);
      if (crash) {
        filter.frequency.setValueAtTime(6800, now);
        filter.frequency.exponentialRampToValueAtTime(4600, now + duration);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * 0.14), now + 0.075);
      }
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(pan);
      source.start(now);
      source.stop(now + duration + 0.01);
      remaining++;
      this.track(source, [filter, gain], done);
    }
    for (const layer of glassAccentLayers({ kind, volume, floor, tool })) {
      if (this.voices >= voiceLimit) break;
      const start = now + layer.delay,
        source = layer.noise ? c.createBufferSource() : c.createOscillator(),
        gain = c.createGain(),
        nodes = [gain];
      const frequency = Math.min(layer.frequency, c.sampleRate * 0.42);
      if (layer.noise) {
        source.buffer = this.noise;
        const filter = c.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = frequency;
        filter.Q.value = layer.q;
        source.connect(filter);
        filter.connect(gain);
        nodes.push(filter);
      } else {
        source.type = 'sine';
        source.frequency.value = frequency;
        source.connect(gain);
      }
      gain.gain.setValueAtTime(0, now);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(Math.max(0.0002, level * layer.level), start + 0.001);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + layer.duration);
      gain.connect(pan);
      source.start(start);
      source.stop(start + layer.duration + 0.01);
      remaining++;
      this.track(source, nodes, done);
    }
    if (!remaining) pan.disconnect();
  }
}
