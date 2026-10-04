import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LandingBeat } from '../../dist/js/shatter-lab-landing-beat.js';
import { LandingEffects } from '../../dist/js/shatter-lab-landing-effects.js';
import { landingFracture, FLOOR_BREAKUP } from '../../dist/js/shatter-lab-landing.js';
import { block, solidInfo } from '../../dist/js/shatter-lab-solid.js';
import { FractureWorld } from '../../dist/js/shatter-lab-world.js';
import { BestShotRanking } from '../../dist/js/shatter-lab-ranking.js';

const impact = { kind: 'secondary', floor: true, landingDepth: 1, volume: 0.5, cause: 1, point: [2, 0, -1] };
const advance = (beat, seconds) => {
  for (let i = 0; i < Math.ceil(seconds * 120); i++) beat.advance(1 / 120);
};

test('landing beat ignores hits, airborne breaks, tiny chips and uncredited scenery', () => {
  const beat = new LandingBeat();
  for (const invalid of [
    { kind: 'strike' },
    { floor: false },
    { volume: 0.079 },
    { cause: 0 },
    { landingDepth: 2 },
  ])
    assert.equal(beat.trigger({ ...impact, ...invalid }), false);
  assert.equal(beat.active, false);
  assert.equal(beat.scale, 1);
  assert.equal(beat.played, 0);
});

test('landing beat keeps the original single crash timing and allows a later landing from the same shot', () => {
  const beat = new LandingBeat();
  assert.equal(beat.trigger(impact), true);
  assert.equal(beat.scale, 0.2);
  advance(beat, 0.05);
  assert.equal(beat.scale, 0.2);
  advance(beat, 0.25);
  assert.equal(beat.scale, 0.2);
  advance(beat, 0.3);
  assert.ok(beat.scale > 0.2 && beat.scale < 1);
  advance(beat, 0.33);
  assert.equal(beat.active, false);
  assert.equal(beat.scale, 1);
  assert.equal(
    beat.trigger(impact),
    true,
    'a new first-generation floor fracture can continue the same shot',
  );
  assert.equal(beat.combo, 2);
  assert.equal(beat.scale, 1, 'the new slow pulse eases in without a time-scale jump');
  advance(beat, 0.1);
  assert.equal(beat.scale, 0.2);
  advance(beat, 0.57);
  assert.equal(beat.scale, 1, 'follow-up slow pulses are shorter than the first one');
  beat.reset();
  assert.equal(beat.played, 0);
  assert.equal(beat.active, false);
  assert.equal(beat.trigger(impact), true, 'retry resets shot IDs');
  beat.advance(1.5);
  assert.equal(beat.active, false, 'a long render stall does not extend the cinematic clock');
});

test('landing combo groups simultaneous contacts in physics time and deduplicates actual pieces', () => {
  const beat = new LandingBeat();
  assert.equal(beat.trigger({ ...impact, pieceId: 1, time: 4 }), true);
  beat.advance(0.5);
  assert.equal(
    beat.trigger({ ...impact, pieceId: 2, time: 4.04 }),
    false,
    'slow motion or a stalled render must not split simultaneous contacts into extra combos',
  );
  assert.equal(beat.combo, 1);
  assert.equal(beat.trigger({ ...impact, pieceId: 3, time: 4.2 }), true);
  assert.equal(beat.combo, 2);
  beat.advance(0.5);
  assert.equal(beat.trigger({ ...impact, pieceId: 3, time: 4.8 }), false);
  assert.equal(beat.trigger({ ...impact, pieceId: 4, time: 4.8, landingDepth: 2 }), false);
  assert.equal(beat.trigger({ ...impact, pieceId: 5, time: 4.8, volume: 0.079 }), false);
  assert.equal(beat.combo, 2, 'rebounds and tiny shards cannot inflate the count');
  assert.equal(beat.trigger({ ...impact, pieceId: 6, time: 4.8 }), true);
  assert.equal(beat.combo, 3);
  assert.equal(beat.labelActive, true);
});

test('landing combo caps a continuous cascade and only starts over after a quiet interval', () => {
  const beat = new LandingBeat();
  for (let i = 0; i < 25; i++) {
    const accepted = beat.trigger({ ...impact, pieceId: i + 1, time: i * 0.3 });
    if (i >= 6) assert.equal(accepted, false, 'the same cascade cannot keep taking over the camera');
    assert.ok(beat.scale >= 0.2 - 1e-9 && beat.scale <= 1);
    if (beat.sequenceAge >= 3) {
      assert.equal(beat.scale, 1);
      assert.equal(beat.labelActive, false);
    }
    beat.advance(0.41);
  }
  assert.equal(beat.combo, 6);
  beat.advance(1.51);
  assert.equal(beat.trigger({ ...impact, pieceId: 100, time: 20 }), true);
  assert.equal(beat.combo, 1);
  assert.equal(beat.sequenceAge, 0);
  beat.advance(10);
  assert.equal(beat.scale, 1);
  assert.equal(beat.labelActive, false);
});

test('large contacts less than 400 ms apart share one beat even when their physics times differ', () => {
  const beat = new LandingBeat();
  beat.trigger({ ...impact, pieceId: 1, time: 1 });
  beat.advance(0.2);
  assert.equal(beat.trigger({ ...impact, pieceId: 2, time: 1.2 }), false);
  assert.equal(beat.played, 1);
  beat.advance(0.21);
  assert.equal(beat.trigger({ ...impact, pieceId: 3, time: 1.4 }), true);
  assert.equal(beat.played, 2);
});

test('landing presentation preserves the beat without allocating a white ring or flash', () => {
  const scene = new THREE.Scene(),
    effects = new LandingEffects(scene);
  assert.equal(effects.trigger(impact), true);
  assert.equal(effects.beat.scale, 0.2);
  effects.update(1.1);
  assert.equal(effects.beat.scale, 1);
  effects.clear();
  assert.equal(effects.beat.scale, 1);
  assert.equal(effects.trigger(impact), true);
  assert.equal(scene.children.length, 0);
});

test('arcade floor cuts make many unequal shards while conserving physical volume', () => {
  const faces = block(0, 0, 1.6, 0.5, 1),
    point = [0.1, 0, 0.05],
    n = [0, 1, 0];
  const old = landingFracture(faces, point, n, 4, 7, 1.4);
  const enhanced = landingFracture(faces, point, n, 4, 7, FLOOR_BREAKUP.density);
  const volumes = enhanced.map((f) => solidInfo(f).volume);
  assert.ok(enhanced.length > old.length && enhanced.length <= 32);
  assert.ok(Math.max(...volumes) > Math.min(...volumes) * 3);
  assert.ok(Math.abs(volumes.reduce((a, b) => a + b, 0) - solidInfo(faces).volume) < 1e-7);
});

test('a short drop fractures at real floor contact, but resting glass never triggers the beat or scores', async () => {
  await FractureWorld.init();
  for (const height of [0, 0.04]) {
    const impacts = [],
      beat = new LandingBeat();
    const world = new FractureWorld({
      impact: (e) => {
        impacts.push(e);
        beat.trigger(e);
      },
    });
    try {
      world.reset([], []);
      world.hits = 1;
      world.chains.begin(1);
      const p = world.create(block(0, height, 1, 0.2, 1), { dynamic: true, cause: 1 });
      world.initialVolume = p.volume;
      for (let i = 0; i < 240; i++) {
        world.step(1 / 120);
        beat.advance(1 / 120);
      }
      if (!height) {
        assert.equal(impacts.length, 0);
        assert.equal(world.snapshot().floorFracture.bestPercent, 0);
        assert.equal(beat.played, 0);
      } else {
        assert.ok(impacts.some((e) => e.floor && e.landingDepth === 1));
        assert.ok(world.snapshot().floorFracture.bestPercent > 99.9);
        assert.equal(beat.played, 1);
      }
    } finally {
      world.events.free();
      world.world.free();
    }
  }
});

test('separate physical slabs from one strike produce a landing combo without extra score credit', async () => {
  await FractureWorld.init();
  const beat = new LandingBeat(),
    accepted = [];
  const world = new FractureWorld({
    impact: (event) => {
      if (beat.trigger(event)) accepted.push({ id: event.pieceId, time: event.time, combo: beat.combo });
    },
  });
  try {
    world.reset([], []);
    world.hits = 1;
    world.chains.begin(1);
    const slabs = [0.5, 1.3, 2.4].map((height, i) =>
      world.create(block((i - 1) * 2, height, 1, 0.2, 1), { dynamic: true, cause: 1 }),
    );
    world.initialVolume = slabs.reduce((sum, piece) => sum + piece.volume, 0);
    for (let i = 0; i < 480; i++) {
      beat.advance(1 / 60);
      world.step(beat.scale / 60);
    }
    assert.ok(
      accepted.some((event) => event.combo >= 2),
      JSON.stringify(accepted),
    );
    assert.equal(new Set(accepted.map((event) => event.id)).size, accepted.length);
    assert.ok(accepted.every((event) => Number.isFinite(event.time)));
    assert.ok(world.snapshot().floorFracture.bestPercent > 99.9);
    assert.ok(world.snapshot().floorFracture.bestPercent <= 100);
    assert.equal(beat.scale, 1);
  } finally {
    world.events.free();
    world.world.free();
  }
});

test('changed floor physics starts a separate ranking without deleting old records', () => {
  const oldKey = 'glass-rush.crystal.floor-fracture-shots.fixed-step.v2';
  const oldData = '{"castle:1:1":[{"id":"old","tool":"hammer","score":80}]}';
  const data = new Map([[oldKey, oldData]]);
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const ranking = new BestShotRanking(storage, () => 'new');
  ranking.begin({ type: 'castle', size: 1, count: 1 });
  assert.equal(ranking.entries.length, 0);
  ranking.strike(1, 'hammer');
  ranking.update(new Map([[1, 0.5]]), 1);
  assert.equal(data.get(oldKey), oldData);
  assert.equal(data.size, 2);
  const reloaded = new BestShotRanking(storage, () => 'next');
  reloaded.begin({ type: 'castle', size: 1, count: 1 });
  assert.equal(reloaded.entries[0].score, 50);
});
