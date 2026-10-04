import test from 'node:test';
import assert from 'node:assert/strict';
import { glassVoiceProfile, glassAccentLayers } from '../../dist/js/shatter-lab-audio-layers.js';
import { CollisionAudio } from '../../dist/js/shatter-lab-audio.js';
import { SoundClusters } from '../../dist/js/shatter-lab-sound-clusters.js';
import { iceNotes } from '../../dist/js/shatter-lab-music.js';

test('ice music has a repeating harmonic score, restrained notes and no noise transients', () => {
  for (let bar = 0; bar < 4; bar++) {
    const notes = iceNotes(bar);
    assert.equal(notes.length, 8);
    assert.equal(notes.filter((n) => n.pad).length, 4);
    assert.ok(notes.every((n) => n.level <= 0.085 && n.duration >= 3.8));
    assert.ok(notes.every((n) => n.midi >= 43 && n.midi <= 81));
    assert.deepEqual(iceNotes(bar), iceNotes(bar + 4));
  }
  const audio = new CollisionAudio();
  audio.setMusicEnabled(false);
  audio.setVisible(false);
  assert.equal(audio.musicEnabled, false);
  assert.equal(audio.visible, false);
  assert.equal(audio.context, undefined, 'preferences never start autoplay');
});

test('landing debris keeps its original paripari timbre and has no synthetic repeating tail', () => {
  for (const volume of [0.001, 0.01, 0.1, 1])
    for (const glass of [false, true]) {
      const profile = glassVoiceProfile(volume, 'collision', glass),
        size = Math.cbrt(volume);
      assert.equal(profile.fundamental, Math.max(2400, Math.min(7600, 2100 / (size + 0.2))));
      assert.equal(profile.decay, Math.min(0.11, 0.02 + size * (glass ? 0.09 : 0.05)));
      assert.deepEqual(profile.ratios, [1, 1.47, 2.63]);
      assert.equal(profile.modalLevel, glass ? 0.4 : 0.24);
      assert.equal(profile.noiseLevel, 0.6);
      assert.deepEqual(glassAccentLayers({ kind: 'collision', volume, floor: true }), []);
    }
});

test('fine cracks are sparse sharp transients while a large floor crash has a delayed bright accent', () => {
  const crack = glassVoiceProfile(0.01, 'strike'),
    crash = glassVoiceProfile(0.8, 'secondary');
  assert.ok(crack.fundamental > 5000 && crash.fundamental >= 3400);
  assert.ok(crash.decay > crack.decay * 3);
  assert.ok(crash.modalLevel > crack.modalLevel);
  const fine = glassAccentLayers({ kind: 'strike' }, () => 0.5);
  assert.equal(fine.length, 3);
  assert.ok(fine.every((layer) => layer.frequency > 6000 && layer.duration < 0.025 && layer.delay < 0.08));
  const landing = glassAccentLayers({ kind: 'secondary', volume: 0.8, floor: true });
  const air = glassAccentLayers({ kind: 'secondary', volume: 0.8, floor: false });
  assert.equal(landing.length, 4);
  assert.equal(air.length, 2);
  assert.ok(landing.some((layer) => layer.delay > 0.08 && !layer.noise));
  assert.ok(landing.every((layer) => layer.delay + layer.duration < 0.3));
});

test('clustering preserves floor accents without turning a strike into a floor crash', () => {
  const clusters = new SoundClusters();
  clusters.add({ kind: 'collision', volume: 0.001, impulse: 0.1, point: [0, 0, 0] });
  clusters.add({ kind: 'secondary', floor: true, volume: 0.8, impulse: 2, point: [0.1, 0, 0] });
  const [event] = clusters.drain(1);
  assert.equal(event.floor, true);
  assert.equal(event.kind, 'secondary');
  assert.equal(clusters.drain(2).length, 0);
});

test('scheduled accents respect the voice budget and are cancelled on retry or mute', () => {
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
  });
  const nodes = [],
    node = () => {
      const value = {
        frequency: param(),
        gain: param(),
        pan: param(),
        Q: param(),
        stopped: false,
        connect() {},
        disconnect() {},
        start(time) {
          this.startTime = time;
        },
        stop() {
          this.stopped = true;
        },
      };
      nodes.push(value);
      return value;
    };
  const audio = new CollisionAudio();
  audio.context = {
    state: 'running',
    currentTime: 0,
    sampleRate: 48000,
    createStereoPanner: node,
    createOscillator: node,
    createGain: node,
    createBufferSource: node,
    createBiquadFilter: node,
  };
  audio.output = node();
  audio.reverb = node();
  for (let i = 0; i < 50; i++) audio.play({ kind: 'collision', volume: 0.001, impulse: 0.1 });
  assert.ok(audio.voices <= 26);
  audio.play({ kind: 'secondary', volume: 0.8, impulse: 3, floor: true });
  assert.ok(audio.voices <= 36);
  assert.ok(nodes.some((node) => node.startTime > 0.08));
  const callbacks = [...audio.sources.keys()].map((node) => node.onended);
  audio.reset();
  assert.equal(audio.voices, 0);
  assert.equal(audio.sources.size, 0);
  for (const callback of callbacks) callback();
  assert.equal(audio.voices, 0, 'late ended events cannot decrement the budget again');
  audio.play({ kind: 'strike', volume: 0.04, impulse: 2 });
  assert.ok(audio.voices > 0);
  audio.setEnabled(false);
  assert.equal(audio.voices, 0);
  audio.play({ kind: 'secondary', volume: 0.8, impulse: 3, floor: true });
  assert.equal(audio.voices, 0);
});
