const BEAT = 60 / 54;
const CHORDS = [
  [50, 57, 64, 66],
  [47, 54, 61, 62],
  [43, 50, 57, 59],
  [45, 52, 59, 62],
];
const MELODIES = [
  [74, 81, 78, 76],
  [73, 78, 74, 69],
  [71, 78, 74, 69],
  [76, 74, 71, 69],
];

export function iceNotes(bar) {
  const chord = CHORDS[bar % 4],
    melody = MELODIES[bar % 4];
  return [
    ...chord.map((midi, i) => ({
      midi,
      delay: i * 0.08,
      duration: BEAT * 9,
      level: 0.028,
      pad: true,
      pan: (i - 1.5) * 0.24,
    })),
    ...melody.map((midi, i) => ({
      midi,
      delay: [0.5, 2.25, 4.5, 6][i] * BEAT,
      duration: 3.8,
      level: i === 0 ? 0.085 : 0.06,
      pad: false,
      pan: i % 2 ? 0.42 : -0.42,
    })),
  ];
}

export class IceMusic {
  constructor(context, destination) {
    this.context = context;
    this.enabled = true;
    this.active = true;
    this.playing = false;
    this.sources = new Map();
    this.nextBar = 0;
    this.bar = 0;
    this.output = context.createGain();
    this.output.gain.value = 0;
    this.output.connect(destination);
    this.ducker = context.createGain();
    this.ducker.connect(this.output);
    this.reverb = context.createConvolver();
    const buffer = context.createBuffer(2, Math.ceil(context.sampleRate * 3.2), context.sampleRate);
    let seed = 73;
    for (let channel = 0; channel < 2; channel++) {
      const samples = buffer.getChannelData(channel);
      for (let i = 0; i < samples.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        samples[i] = (seed / 2147483648 - 1) * Math.exp((-i / context.sampleRate) * 2.6);
      }
    }
    this.reverb.buffer = buffer;
    const wet = context.createGain();
    wet.gain.value = 0.38;
    this.reverb.connect(wet);
    wet.connect(this.ducker);
  }
  setActive(value) {
    this.active = value;
    this.sync();
  }
  setEnabled(value) {
    this.enabled = value;
    this.sync();
  }
  sync() {
    const playing = this.enabled && this.active;
    if (playing === this.playing) return;
    this.playing = playing;
    const now = this.context.currentTime;
    this.output.gain.setTargetAtTime(playing ? 0.65 : 0, now, playing ? 0.8 : 0.06);
    if (!playing) {
      for (const source of this.sources.keys()) source.stop(now + 0.25);
    } else {
      this.nextBar = now + 0.06;
      this.bar = 0;
      this.ducker.gain.cancelScheduledValues(now);
      this.ducker.gain.setValueAtTime(1, now);
      this.tick();
    }
  }
  duck() {
    if (!this.playing) return;
    const now = this.context.currentTime;
    const gain = this.ducker.gain;
    gain.cancelAndHoldAtTime(now);
    gain.linearRampToValueAtTime(0.23, now + 0.025);
    gain.setValueAtTime(0.23, now + 0.32);
    gain.exponentialRampToValueAtTime(1, now + 1.5);
  }
  tick() {
    if (!this.playing || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    if (this.nextBar < now - BEAT * 8) this.nextBar = now + 0.06;
    while (this.nextBar < now + 1.2) {
      for (const note of iceNotes(this.bar)) this.note(note, this.nextBar + note.delay);
      this.nextBar += BEAT * 8;
      this.bar++;
    }
  }
  note(note, start) {
    const c = this.context;
    const pan = c.createStereoPanner();
    pan.pan.value = note.pan;
    pan.connect(this.ducker);
    pan.connect(this.reverb);
    let remaining = 0;
    for (const [ratio, strength] of note.pad
      ? [[1, 1]]
      : [
          [1, 1],
          [2.01, 0.18],
          [3.97, 0.035],
        ]) {
      const source = c.createOscillator(),
        gain = c.createGain();
      source.type = 'sine';
      source.frequency.value = 440 * 2 ** ((note.midi - 69) / 12) * ratio;
      const attack = note.pad ? 1.7 : 0.02;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(note.level * strength, start + attack);
      gain.gain.exponentialRampToValueAtTime(0.00001, start + note.duration);
      source.connect(gain);
      gain.connect(pan);
      remaining++;
      source.onended = () => {
        this.sources.delete(source);
        source.disconnect();
        gain.disconnect();
        if (--remaining === 0) pan.disconnect();
      };
      this.sources.set(source, true);
      source.start(start);
      source.stop(start + note.duration + 0.05);
    }
  }
}
