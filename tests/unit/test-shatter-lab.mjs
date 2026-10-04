import test from 'node:test';
import assert from 'node:assert/strict';
import {
  block,
  solidInfo,
  splitSolid,
  connectionArea,
  normal,
  dot,
} from '../../dist/js/shatter-lab-solid.js';
import { solveContact, impactFracture, contactSurface } from '../../dist/js/shatter-lab-contact.js';
import { FractureWorld } from '../../dist/js/shatter-lab-world.js';
import RAPIER from '../../dist/vendor/rapier.mjs';
import { parseStagePrompt, makeStage } from '../../dist/js/shatter-lab-stage.js';
import { SHAPES } from '../../dist/js/shatter-catalog.js';
import { contactSpeed, ImpactAudioGate } from '../../dist/js/shatter-lab-impact-audio.js';
import { embedRescueBalls } from '../../dist/js/shatter-lab-goals.js';
import { landingFracture } from '../../dist/js/shatter-lab-landing.js';
import { SoundClusters } from '../../dist/js/shatter-lab-sound-clusters.js';
import * as THREE from 'three';
import { ContactTool } from '../../dist/js/shatter-lab-tool.js';
import { makeGallery } from '../../dist/js/shatter-lab-room.js';
import { CollapseChains } from '../../dist/js/shatter-lab-chain.js';
import { contactFootprint } from '../../dist/js/shatter-lab-contact.js';
import { BestShotRanking, stageRankingKey } from '../../dist/js/shatter-lab-ranking.js';
import { readAudioPreferences, saveAudioPreferences } from '../../dist/js/shatter-lab-experience.js';
import { glassVoiceProfile, CollisionAudio } from '../../dist/js/shatter-lab-audio.js';
import { ShotMoment } from '../../dist/js/shatter-lab-moment.js';

test('sliding without fracturing scores zero, but actual floor splitting scores once', async () => {
  await FractureWorld.init();
  const world = new FractureWorld();
  world.reset([{ name: 'sliding', faces: block(0, 0, 1, 0.5, 1) }], []);
  world.hits = 1;
  world.chains.begin(1);
  const sliding = [...world.pieces.values()][0];
  world.release(sliding, 1);
  sliding.body.setLinvel({ x: 1, y: 0, z: 0 }, true);
  for (let i = 0; i < 240; i++) world.step(1 / 120);
  assert.equal(world.snapshot().chain.bestPercent, 100, 'old metric counts sliding');
  assert.equal(world.snapshot().floorFracture.bestPercent, 0, 'new metric does not');
  world.reset([], []);
  world.initialVolume = 1;
  world.hits = 1;
  world.chains.begin(1);
  const falling = world.create(block(0, 2, 1, 1, 1), { dynamic: true, cause: 1 });
  world.initialVolume = falling.volume;
  for (let i = 0; i < 30; i++) world.step(1 / 120);
  assert.equal(world.snapshot().floorFracture.bestPercent, 0, 'falling is not yet a fracture');
  for (let i = 0; i < 180; i++) world.step(1 / 120);
  assert.ok(world.secondary > 0);
  assert.ok(Math.abs(world.snapshot().floorFracture.creditedVolume - falling.volume) < 1e-6);
  for (let i = 0; i < 600; i++) world.step(1 / 120);
  assert.ok(
    Math.abs(world.snapshot().floorFracture.creditedVolume - falling.volume) < 1e-6,
    'repeat breakage and cleanup add nothing',
  );
  world.reset();
  assert.equal(world.snapshot().floorFracture.creditedVolume, 0);
  world.events.free();
  world.world.free();
});

test('air fractures are unscored and descendants inherit floor-credit across re-strikes', async () => {
  await FractureWorld.init();
  const world = new FractureWorld();
  world.reset([], []);
  world.initialVolume = 1;
  world.hits = 1;
  world.chains.begin(1);
  const p = world.create(block(0, 2, 1, 1, 1), { dynamic: true, cause: 1 });
  world.breakFalling(p, [0, 2, 0], 2, [0, 1, 0], false);
  assert.equal(world.snapshot().floorFracture.creditedVolume, 0);
  const child = [...world.pieces.values()].sort((a, b) => b.volume - a.volume)[0];
  const amount = child.volume;
  world.breakFalling(child, child.center, 2, [0, 1, 0], true);
  assert.ok(Math.abs(world.snapshot().floorFracture.creditedVolume - amount) < 1e-6);
  const credited = [...world.pieces.values()].find((p) => p.floorCredited && p.volume > 0.018);
  assert.ok(credited);
  const faces = world.worldFaces(credited);
  const face = faces[0],
    n = normal(face);
  const point = face.points.reduce((a, p) => a.map((v, i) => v + p[i] / face.points.length), [0, 0, 0]);
  const surface = contactSurface(faces, point, n);
  const beforeIds = new Set(world.pieces.keys());
  assert.ok(
    world.hit(
      credited.id,
      point,
      solveContact(
        'hammer',
        n,
        n.map((v) => -v),
        surface.thickness,
        surface,
      ),
    ),
  );
  const children = [...world.pieces.values()].filter((p) => !beforeIds.has(p.id));
  assert.ok(children.length > 0 && children.every((p) => p.floorCredited && p.cause === 2));
  for (const child of children) world.chains.creditFloor(child, 2);
  assert.equal(world.snapshot().floorFracture.latestPercent, 0);
  world.events.free();
  world.world.free();
});

test('big-shot feedback waits for a real floor fracture and does not repeat for its splinters', () => {
  const moment = new ShotMoment();
  const e = { kind: 'secondary', floor: true, volume: 0.3, cause: 1 };
  assert.equal(moment.landing({ ...e, floor: false }, 80, 70, 0), false);
  assert.equal(moment.landing({ ...e, kind: 'collision' }, 80, 70, 0), false);
  assert.equal(moment.landing(e, 80, 70, 0), true);
  assert.equal(moment.landing(e, 85, 70, 0.5), false);
  assert.equal(moment.update(new Map([[1, 9]]), 10, 1).score, 90);
  assert.equal(moment.update(new Map([[1, 9]]), 10, 3), null);
  moment.reset();
  assert.equal(moment.active, null);
});

test('small collision sounds leave headroom for the main glass crash', () => {
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  const node = () => ({
    frequency: param(),
    gain: param(),
    pan: param(),
    Q: param(),
    connect() {},
    disconnect() {},
    start() {},
    stop() {},
  });
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
  audio.output = {};
  audio.reverb = {};
  for (let i = 0; i < 20; i++) audio.play({ kind: 'collision', volume: 0.1, impulse: 1 });
  assert.ok(audio.voices <= 26);
  const before = audio.events;
  audio.play({ kind: 'secondary', volume: 1, impulse: 4 });
  assert.equal(audio.events, before + 1);
  assert.ok(audio.voices <= 36);
  const clusters = new SoundClusters();
  for (let i = 1; i <= 4; i++)
    clusters.add({ point: [i * 2, 0, 0], kind: 'collision', volume: 0.1, impulse: i + 5 });
  clusters.add({ point: [0, 0, 0], kind: 'secondary', volume: 1, impulse: 1 });
  assert.equal(clusters.drain(1)[0].kind, 'secondary');
});

test('re-striking moving glass transfers causality without counting its detached volume twice', async () => {
  await FractureWorld.init();
  const world = new FractureWorld();
  world.reset([], []);
  world.hits = 1;
  world.chains.begin(1);
  const p = world.create(block(0, 1, 1, 1, 1), { dynamic: true, cause: 1 });
  const credited = world.chains.snapshot(1).creditedVolume;
  const point = [0, 1.5, 0.5],
    n = [0, 0, 1];
  const surface = contactSurface(world.worldFaces(p), point, n);
  assert.ok(world.hit(p.id, point, solveContact('bat', n, [0, 0, -1], surface.thickness, surface)));
  assert.ok([...world.pieces.values()].every((child) => child.cause === 2));
  assert.equal(world.chains.snapshot(1).creditedVolume, credited);
  world.events.free();
  world.world.free();
});

test('independent support losses keep their own impact attribution', async () => {
  await FractureWorld.init();
  const world = new FractureWorld();
  world.reset(
    [-2, 2].flatMap((x, i) => [
      { name: `support${i}`, faces: block(x, 0, 0.5, 1, 0.5) },
      { name: `top${i}`, faces: block(x, 1, 1, 0.4, 1) },
    ]),
    [],
  );
  world.chains.begin(1);
  world.chains.begin(2);
  const pieces = [...world.pieces.values()];
  world.releaseFromImpact(
    pieces.find((p) => p.name === 'support0'),
    1,
  );
  world.releaseFromImpact(
    pieces.find((p) => p.name === 'support1'),
    2,
  );
  assert.equal(pieces.find((p) => p.name === 'top0').cause, 1);
  assert.equal(pieces.find((p) => p.name === 'top1').cause, 2);
  world.events.free();
  world.world.free();
});

test('best-shot ranking updates one attempt, attributes delayed chains and separates stage conditions', () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  let id = 0;
  const ranking = new BestShotRanking(storage, () => String(++id));
  const spec = { type: 'castle', size: 1, count: 1, color: 'clear' };
  ranking.begin(spec);
  ranking.strike(1, 'hammer');
  ranking.strike(2, 'pick');
  ranking.update(
    new Map([
      [1, 3],
      [2, 2],
    ]),
    10,
  );
  assert.equal(ranking.entries.length, 1);
  ranking.update(
    new Map([
      [1, 7],
      [2, 2],
    ]),
    10,
  );
  assert.equal(ranking.entries[0].score, 70);
  assert.equal(ranking.entries[0].tool, 'hammer');
  assert.equal(ranking.entries.length, 1, 'late chain updates original entry');
  assert.equal(
    ranking.update(
      new Map([
        [1, 7],
        [2, 2],
      ]),
      10,
    ),
    false,
  );
  for (let n = 0; n < 8; n++) {
    ranking.begin(spec);
    ranking.strike(1, 'pick');
    ranking.update(new Map([[1, n + 1]]), 10);
  }
  assert.equal(ranking.entries.length, 5);
  assert.equal(ranking.entries[0].score, 80);
  const restored = new BestShotRanking(storage, () => 'new');
  restored.begin({ ...spec, color: 'blue' });
  assert.equal(restored.entries[0].score, 80, 'color does not change mechanics');
  restored.begin({ ...spec, count: 2 });
  assert.equal(restored.entries.length, 0);
  assert.notEqual(stageRankingKey(spec), stageRankingKey({ ...spec, size: 2 }));
  const blocked = new BestShotRanking(undefined, () => 'blocked');
  blocked.begin(spec);
  blocked.strike(1, 'hammer');
  assert.doesNotThrow(() => blocked.update(new Map([[1, 5]]), 10));
  assert.equal(blocked.saved, false);
  assert.equal(blocked.entries[0].score, 50);
});

test('audio preferences tolerate blocked or corrupt storage and constrain volume', () => {
  assert.deepEqual(readAudioPreferences(undefined), { enabled: true, volume: 0.45, musicEnabled: true });
  assert.deepEqual(readAudioPreferences({ getItem: () => '{broken' }), {
    enabled: true,
    volume: 0.45,
    musicEnabled: true,
  });
  assert.deepEqual(readAudioPreferences({ getItem: () => '{"enabled":false,"volume":9}' }), {
    enabled: false,
    musicEnabled: true,
    volume: 0.7,
  });
  assert.doesNotThrow(() => saveAudioPreferences(undefined, { enabled: false, volume: 0.2 }));
});

test('glass crash has high ringing modes and restrained noise while small contacts stay short', () => {
  const crash = glassVoiceProfile(1, 'secondary', true);
  const chip = glassVoiceProfile(0.001, 'collision');
  assert.ok(crash.fundamental >= 2800);
  assert.ok(crash.decay > 0.3 && crash.decay <= 0.46);
  assert.ok(crash.noiseLevel < 1);
  assert.ok(chip.fundamental > crash.fundamental);
  assert.ok(chip.decay < 0.05);
});

test('hammer keeps its flat contact face and has a tapered opposite pick', () => {
  const hammer = new ContactTool(new THREE.Scene());
  const face = hammer.root.getObjectByName('hammer-face');
  const pick = hammer.root.getObjectByName('hammer-pick');
  face.geometry.computeBoundingBox();
  pick.geometry.computeBoundingBox();
  assert.ok(Math.abs(face.geometry.boundingBox.max.x + face.position.x - 0.24) < 1e-6);
  const p = pick.geometry.attributes.position;
  let tips = 0;
  for (let i = 0; i < p.count; i++)
    if (p.getX(i) < -0.55) {
      tips++;
      assert.ok(Math.hypot(p.getY(i), p.getZ(i)) < 1e-6);
    }
  assert.ok(tips > 0);
  assert.ok(Math.abs(pick.geometry.boundingBox.max.x + 0.1) < 1e-6);
});

test('collapse score follows originating strike and cannot score already detached glass twice', () => {
  const chains = new CollapseChains();
  chains.begin(1);
  const piece = { volume: 3, credited: false };
  chains.credit(piece, 1);
  chains.credit(piece, 1);
  chains.begin(2);
  chains.credit({ volume: 1, credited: true }, 2);
  chains.credit({ volume: 2, credited: false }, 1);
  chains.credit({ volume: 1, credited: false }, 2);
  chains.credit({ volume: 7, credited: false }, 0);
  assert.deepEqual(chains.snapshot(10), { strike: 2, latestPercent: 10, bestPercent: 50, creditedVolume: 6 });
});

test('footprint is clipped to the actual glass face', () => {
  const polygon = [
    [-0.1, -0.1, 0],
    [0.1, -0.1, 0],
    [0.1, 0.1, 0],
    [-0.1, 0.1, 0],
  ];
  const clipped = contactFootprint(polygon, [0.08, 0, 0], [1, 0, 0], [0, 1, 0], 0.23, 0.4);
  assert.ok(clipped.length >= 3);
  assert.ok(
    clipped.every(([x, y, z]) => x >= -0.100001 && x <= 0.100001 && Math.abs(y) <= 0.100001 && z === 0),
  );
});

test('cascade stage is stable and physically releases a large chain after its narrow support is chipped', async () => {
  await FractureWorld.init();
  const world = new FractureWorld();
  const stage = embedRescueBalls(makeStage(parseStagePrompt('透明なガラスの大落下')));
  world.reset(stage.solids, stage.goals);
  for (let i = 0; i < 180; i++) world.step(1 / 120);
  assert.equal(world.snapshot().moving, 0);
  assert.equal(world.snapshot().goals.collected, 0);
  for (let i = 0; i < 6 && world.snapshot().chain.bestPercent < 20; i++) {
    const p = [...world.pieces.values()]
      .filter((p) => p.name === '細い支え' && !p.dynamic)
      .sort((a, b) => b.volume - a.volume)[0];
    assert.ok(p);
    const faces = world.worldFaces(p);
    const face = faces.find((f) => normal(f)[2] > 0.9);
    const point = face.points.reduce((a, p) => a.map((v, k) => v + p[k] / face.points.length), [0, 0, 0]);
    const n = normal(face);
    const surface = contactSurface(faces, point, n);
    assert.ok(
      world.hit(p.id, point, solveContact('hammer', n, [-0.4, -0.5, -1], surface.thickness, surface)),
    );
    world.step(1 / 60);
  }
  assert.ok(world.snapshot().chain.bestPercent > 20);
  for (let i = 0; i < 480; i++) world.step(1 / 120);
  assert.ok(world.secondary > 0);
  const credited = world.snapshot().chain.creditedVolume;
  assert.ok(credited <= world.initialVolume + 1e-6);
  for (let i = 0; i < 1800; i++) world.step(1 / 120);
  assert.equal(world.snapshot().chain.creditedVolume, credited, 'expiry never adds score');
  world.reset();
  assert.equal(world.snapshot().chain.bestPercent, 0);
  world.events.free();
  world.world.free();
});

test('hammer narrow end follows approach and reaches the aim at the impact callback', () => {
  const weapon = new ContactTool(new THREE.Scene());
  const point = new THREE.Vector3(1, 2, 0);
  for (const d of [
    [-0.6, -0.4, -1],
    [0, -1, 0],
    [1, 0, 0],
  ]) {
    const direction = new THREE.Vector3(...d).normalize();
    const hit = { point, face: { normal: new THREE.Vector3(0, 0, 1) }, object: new THREE.Mesh() };
    weapon.preview(hit, direction);
    assert.ok(weapon.root.position.distanceTo(point) > 1.2);
    let invoked = false;
    weapon.swing(hit, direction, () => {
      invoked = true;
      const end = weapon.root.localToWorld(new THREE.Vector3(0.24, 0, 0));
      assert.ok(end.distanceTo(point) < 1e-9);
      const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(weapon.root.quaternion);
      assert.ok(axis.dot(direction) > 0.999999);
    });
    weapon.update(0.1);
    assert.ok(invoked);
    weapon.cancel();
  }
});

test('pick tip reaches the aim once and the fast swing finishes cleanly', () => {
  const weapon = new ContactTool(new THREE.Scene());
  weapon.setTool('pick');
  const tip = weapon.root.getObjectByName('pick-point');
  tip.geometry.computeBoundingBox();
  assert.ok(Math.abs(tip.geometry.boundingBox.max.x - 0.62) < 1e-6);
  const point = new THREE.Vector3(1, 2, 0);
  for (const d of [
    [-0.6, -0.4, -1],
    [0, -1, 0],
    [1, 0, 0],
  ]) {
    const direction = new THREE.Vector3(...d).normalize();
    const hit = { point, face: { normal: new THREE.Vector3(0, 0, 1) }, object: new THREE.Mesh() };
    weapon.preview(hit, direction);
    assert.ok(weapon.root.position.distanceTo(point) > 1.4);
    let hits = 0;
    weapon.swing(hit, direction, () => {
      hits++;
      assert.ok(weapon.root.localToWorld(new THREE.Vector3(0.62, 0, 0)).distanceTo(point) < 1e-9);
      assert.ok(new THREE.Vector3(1, 0, 0).applyQuaternion(weapon.root.quaternion).dot(direction) > 0.999999);
    });
    weapon.update(0.06);
    assert.equal(hits, 0);
    weapon.update(0.06);
    assert.equal(hits, 1);
    weapon.update(0.12);
    assert.equal(hits, 1);
    assert.equal(weapon.animation, null);
    assert.equal(weapon.root.visible, false);
  }
});

test('gallery has walls in all four directions and a ceiling at each stage scale', () => {
  const scene = new THREE.Scene();
  const room = makeGallery(scene);
  const ray = new THREE.Raycaster();
  for (const scale of [1, 2.5]) {
    room.scale.setScalar(scale);
    scene.updateMatrixWorld(true);
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      ray.set(new THREE.Vector3(0, 2, 0), new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)));
      assert.ok(ray.intersectObject(room, true).length > 0);
    }
    ray.set(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 1, 0));
    assert.ok(ray.intersectObject(room, true).length > 0);
  }
});

test('landing cuts conserve glass, vary sizes and depend on the contact', () => {
  const faces = block(0, 0, 1.4, 0.8, 0.6);
  const first = landingFracture(faces, [-0.6, 0, 0.2], [0, 1, 0], 4, 12);
  const volumes = first.map((f) => solidInfo(f).volume);
  assert.ok(first.length >= 4 && first.length <= 14);
  assert.ok(Math.max(...volumes) / Math.min(...volumes) > 3);
  assert.ok(Math.abs(volumes.reduce((a, b) => a + b, 0) - solidInfo(faces).volume) < 1e-6);
  assert.deepEqual(first, landingFracture(faces, [-0.6, 0, 0.2], [0, 1, 0], 4, 12));
  assert.notDeepEqual(first, landingFracture(faces, [0.6, 0.4, 0], [1, 0, 0], 4, 12));
  for (const f of first) {
    const info = solidInfo(f);
    for (const face of f)
      for (const vertex of info.vertices)
        assert.ok(
          dot(
            normal(face),
            vertex.map((v, i) => v - face.points[0][i]),
          ) < 1e-6,
        );
  }
});

test('denser floor breakup makes more unequal pieces without inventing glass', () => {
  const faces = block(0, 0, 1.4, 0.8, 0.6);
  const regular = landingFracture(faces, [-0.6, 0, 0.2], [0, 1, 0], 4, 12);
  const dense = landingFracture(faces, [-0.6, 0, 0.2], [0, 1, 0], 4, 12, 1.4);
  const volumes = dense.map((f) => solidInfo(f).volume);
  assert.ok(dense.length > regular.length && dense.length <= 18);
  assert.ok(Math.max(...volumes) / Math.min(...volumes) > 3);
  assert.ok(Math.abs(volumes.reduce((sum, v) => sum + v, 0) - solidInfo(faces).volume) < 1e-6);
});

test('manual cuts and one air fracture do not consume the two floor-fracture generations', async () => {
  await FractureWorld.init();
  const world = new FractureWorld();
  world.reset([], []);
  world.hits = 1;
  world.chains.begin(1);
  const parent = world.create(block(0, 2, 2, 2, 2), { dynamic: true, generation: 8, cause: 1 });
  world.initialVolume = parent.volume;
  assert.equal(world.breakFalling(parent, [0, 2, 0], 2, [0, 1, 0], false), true);
  const airChild = [...world.pieces.values()].sort((a, b) => b.volume - a.volume)[0];
  assert.equal(airChild.airDepth, 1);
  assert.equal(airChild.landingDepth, 0);
  assert.equal(world.breakFalling(airChild, airChild.center, 2, [0, 1, 0], false), false);
  assert.equal(world.breakFalling(airChild, airChild.center, 2, [0, 1, 0], true), true);
  const floorChild = [...world.pieces.values()]
    .filter((p) => p.landingDepth === 1)
    .sort((a, b) => b.volume - a.volume)[0];
  const credited = world.snapshot().floorFracture.creditedVolume;
  assert.equal(world.breakFalling(floorChild, floorChild.center, 2, [0, 1, 0], true), true);
  const grandchild = [...world.pieces.values()].find((p) => p.landingDepth === 2);
  assert.ok(grandchild);
  assert.equal(world.breakFalling(grandchild, grandchild.center, 2, [0, 1, 0], true), false);
  assert.equal(world.snapshot().floorFracture.creditedVolume, credited);
  world.events.free();
  world.world.free();
});

test('simultaneous falling pieces defer excess floor contacts instead of losing the crash', async () => {
  await FractureWorld.init();
  const world = new FractureWorld();
  world.reset([], []);
  world.hits = 1;
  world.chains.begin(1);
  for (let i = 0; i < 10; i++)
    world.create(block(((i % 5) - 2) * 1.6, 1.8, 0.8, 0.5, 0.8, (Math.floor(i / 5) - 0.5) * 2), {
      dynamic: true,
      cause: 1,
    });
  world.initialVolume = [...world.pieces.values()].reduce((sum, p) => sum + p.volume, 0);
  let deferred = false;
  for (let i = 0; i < 240; i++) {
    world.step(1 / 120);
    deferred ||= world.pendingBreaks.size > 0;
    assert.ok(world.pendingBreaks.size <= 24);
  }
  assert.equal(deferred, true, 'simultaneous contacts exceed one frame budget');
  assert.ok(world.snapshot().floorFracture.bestPercent > 99.9, 'all original slabs fracture at the floor');
  world.events.free();
  world.world.free();
});

test('sound clusters keep a large crash over nearby small contacts and do not loop', () => {
  const groups = new SoundClusters();
  for (let i = 0; i < 100; i++)
    groups.add({ point: [0, 0, 0], impulse: 0.01, volume: 0.001, kind: 'collision' });
  groups.add({ point: [0.1, 0, 0], impulse: 5, volume: 0.5, kind: 'secondary' });
  const events = groups.drain(0);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'secondary');
  assert.equal(events[0].impulse, 5);
  assert.equal(events[0].count, 101);
  groups.add({ point: [0, 0, 0], impulse: 0.02, volume: 0.001, kind: 'collision' });
  assert.equal(groups.drain(0.01).length, 0);
  assert.equal(groups.drain(1).length, 0);
  groups.add({ point: [0, 0, 0], impulse: 0.4, volume: 0.03, kind: 'collision' });
  assert.equal(groups.drain(1.1).length, 1);
  groups.add({ point: [0, 0, 0], impulse: 4, volume: 0.5, kind: 'secondary' });
  assert.equal(groups.drain(1.11)[0].kind, 'secondary');
  groups.clear();
  assert.equal(groups.drain(2).length, 0);
});

test('a falling slab keeps its shape in the air and shatters at the floor contact', async () => {
  await FractureWorld.init();
  const impacts = [];
  const world = new FractureWorld({ impact: (e) => impacts.push(e) });
  world.reset([], []);
  const slab = world.create(block(0, 2, 1.5, 0.5, 1), { dynamic: true });
  for (let i = 0; i < 30; i++) world.step(1 / 120);
  assert.ok(world.pieces.has(slab.id));
  assert.equal(impacts.length, 0);
  for (let i = 0; i < 100; i++) world.step(1 / 120);
  const landing = impacts.find((e) => e.kind === 'secondary' && e.floor);
  assert.ok(landing);
  assert.ok(Math.abs(landing.point[1]) < 0.08);
  assert.ok(landing.fragments >= 4);
  assert.ok(!world.pieces.has(slab.id));
  world.events.free();
  world.world.free();
});

test('three rescue balls are contained until glass is removed and clear on real floor contact', async () => {
  await FractureWorld.init();
  const world = new FractureWorld();
  for (const shape of [...SHAPES, { name: '大落下' }]) {
    const stage = embedRescueBalls(makeStage(parseStagePrompt(`ガラスの${shape.name}`)));
    assert.equal(stage.goals.length, 3);
    world.reset(stage.solids, stage.goals);
    for (let i = 0; i < 180; i++) world.step(1 / 120);
    assert.equal(world.snapshot().goals.collected, 0, `${shape.name} holds its balls`);
    assert.equal(world.snapshot().moving, 0, `${shape.name} remains supported`);
    for (const p of [...world.pieces.values()]) world.remove(p);
    world.create(block(9, 0, 1, 1, 1), { name: '残っているガラス' });
    for (let i = 0; i < 360; i++) world.step(1 / 120);
    assert.equal(world.snapshot().goals.complete, true, `${shape.name} can release all three balls`);
    assert.ok(world.snapshot().bodies > 0, 'clear does not require all glass to disappear');
    world.reset();
    assert.equal(world.snapshot().goals.collected, 0);
  }
  world.events.free();
  world.world.free();
});

test('impact audio rejects supporting force and sliding, but accepts rebounds', () => {
  const gate = new ImpactAudioGate();
  assert.equal(gate.accept('floor', 0, 0.12, 0.01), false);
  assert.equal(gate.accept('floor', 0.1, 0.12, 1.2), true);
  assert.equal(gate.accept('floor', 0.12, 0.12, 1.2), false);
  assert.equal(gate.accept('floor', 0.4, 0.12, 0.6), true);
  const sliding = { center: [0, 0, 0], linear: [3, 0, 0], angular: [0, 0, 0] };
  assert.equal(contactSpeed(sliding, null, [0, 0, 0], [0, 1, 0]), 0);
});

test('settled debris does not repeatedly send collision sound events', async () => {
  await FractureWorld.init();
  const sounds = [];
  const world = new FractureWorld({ collision: (e) => sounds.push({ ...e, time: world.clock }) });
  for (const p of [...world.pieces.values()]) world.remove(p);
  world.create(block(0, 0.3, 0.8, 0.8, 0.8), { dynamic: true, landingDepth: 2, airDepth: 1 });
  for (let i = 0; i < 480; i++) world.step(1 / 120);
  assert.ok(
    sounds.length > 0 && sounds.length < 10,
    'impact audible without repeated supporting-force sounds',
  );
  assert.ok(sounds.every((e) => e.speed >= 0.22));
  assert.ok(
    sounds.every((e) => e.time < 1.5),
    'settled block is quiet',
  );
  world.events.free();
  world.world.free();
});

test('prompt stages are convex, grounded and stable for every supported shape', async () => {
  await FractureWorld.init();
  const world = new FractureWorld();
  for (const shape of [...SHAPES, { name: '大落下' }]) {
    const stage = makeStage(parseStagePrompt(`透明なガラスの${shape.name}`));
    for (const { faces } of stage.solids) {
      const info = solidInfo(faces);
      assert.ok(info.volume > 0 && Number.isFinite(info.volume), shape.name);
      for (const face of faces) {
        const n = normal(face);
        assert.ok(
          dot(
            n,
            face.points[0].map((v, i) => v - info.center[i]),
          ) > -1e-7,
          shape.name,
        );
        for (const vertex of info.vertices)
          assert.ok(
            dot(
              n,
              vertex.map((v, i) => v - face.points[0][i]),
            ) < 1e-6,
            `${shape.name} convex`,
          );
      }
    }
    world.reset(stage.solids);
    assert.equal(world.snapshot().moving, 0, `${shape.name} starts supported`);
    assert.equal(world.snapshot().bodies, stage.solids.length);
    world.reset();
    assert.equal(world.snapshot().bodies, stage.solids.length, 'reset repeats generated stage');
  }
  const multi = makeStage(parseStagePrompt('大きな青いガラスの城を3つ'));
  assert.equal(multi.spec.count, 3);
  assert.equal(multi.spec.color, 'blue');
  assert.equal(multi.solids.length, 93);
  assert.ok(multi.bounds.max[0] - multi.bounds.min[0] > 10);
  assert.throws(() => parseStagePrompt('木の城'), /ガラス専用/);
  assert.throws(() => parseStagePrompt('宇宙クジラ'), /対応していない/);
  world.events.free();
  world.world.free();
});

test('keyboard and phone hanging displays fall through empty space after an actual neck cut', async () => {
  await FractureWorld.init();
  const world = new FractureWorld();
  for (const name of ['キーボード', '携帯電話']) {
    const stage = makeStage(parseStagePrompt(`透明なガラスの${name}`));
    assert.ok(stage.hint.includes('吊り'));
    assert.ok(stage.viewElevation >= 0.3 && stage.viewElevation <= 0.5);
    for (const tool of ['hammer', 'pick']) {
      world.reset(stage.solids, []);
      for (let i = 0; i < 180; i++) world.step(1 / 120);
      assert.equal(world.snapshot().moving, 0, `${name} is initially stable`);
      const neck = [...world.pieces.values()].find((p) => p.name === '吊り首');
      const faces = world.worldFaces(neck),
        n = [0, 0, 1];
      const point = [neck.center[0], neck.center[1], neck.max[2]];
      const surface = contactSurface(faces, point, n);
      assert.ok(
        world.hit(neck.id, point, solveContact(tool, n, [-0.4, -0.5, -1], surface.thickness, surface)),
      );
      assert.equal(world.hits, 1);
      assert.ok(world.snapshot().chain.bestPercent > 25, `${name}/${tool} releases the display payload`);
      assert.equal(world.snapshot().floorFracture.bestPercent, 0, 'a cut alone earns no floor score');
      for (let i = 0; i < 360; i++) world.step(1 / 120);
      assert.ok(
        world.snapshot().floorFracture.bestPercent > 25,
        `${name}/${tool} actually fractures at the floor`,
      );
      assert.ok(world.secondary > 5);
    }
    const multi = makeStage(parseStagePrompt(`大きな青いガラスの${name}を3つ`));
    world.reset(multi.solids, []);
    assert.equal(world.snapshot().moving, 0, 'scaled repeated display remains supported');
    assert.equal(multi.solids.filter((p) => p.name === '吊り首').length, 3);
  }
  world.events.free();
  world.world.free();
});

test('convex clipping preserves volume and outward face normals', () => {
  const box = block(0, 0, 1, 1, 1, 0, 0);
  assert.ok(Math.abs(solidInfo(box).volume - 1) < 1e-7);
  assert.equal(splitSolid(box, [0, 0, 1], 0.5).length, 1, 'a tangent cut does not duplicate a cap');
  const halves = splitSolid(box, [0, 0, 1], 0.12);
  assert.equal(halves.length, 2);
  assert.ok(Math.abs(halves.reduce((s, f) => s + solidInfo(f).volume, 0) - 1) < 1e-6);
  for (const faces of halves)
    for (const face of faces) {
      const c = solidInfo(faces).center;
      assert.ok(
        dot(
          normal(face),
          face.points[0].map((v, i) => v - c[i]),
        ) > 0,
      );
    }
});
test('contact area and angle control depth, without input speed or hold time', () => {
  const hammer = solveContact('hammer', [0, 0, 1], [0, 0, -1]);
  const pick = solveContact('pick', [0, 0, 1], [0, 0, -1]);
  const grazing = solveContact('hammer', [0, 0, 1], [1, 0, -0.15]);
  assert.ok(pick.depth >= hammer.depth);
  assert.ok(hammer.area > pick.area * 10);
  assert.ok(grazing.energy < hammer.energy * 0.1);
  assert.ok(grazing.depth < hammer.depth);
  assert.deepEqual(solveContact('hammer', [0, 0, 1], [0, 0, -10]), hammer);
});
test('hammer removes a broad chunk while pick cuts a much narrower and deeper hole', () => {
  const faces = block(0, 0, 2, 2, 1),
    point = [0, 1, 0.5],
    n = [0, 0, 1];
  const surface = contactSurface(faces, point, n);
  const strike = (tool) => {
    const contact = solveContact(tool, n, [-0.65, -0.48, -0.58], surface.thickness, surface);
    const cut = impactFracture(faces, point, contact);
    const pieces = [...cut.retained, ...cut.shards];
    assert.ok(
      Math.abs(pieces.reduce((sum, f) => sum + solidInfo(f).volume, 0) - solidInfo(faces).volume) < 1e-6,
    );
    return {
      ...cut,
      depth: Math.max(
        ...cut.shards.flatMap((f) => f.flatMap((face) => face.points.map((v) => point[2] - v[2]))),
      ),
    };
  };
  const hammer = strike('hammer'),
    pick = strike('pick');
  assert.ok(hammer.removedVolume > pick.removedVolume * 8);
  assert.ok(pick.depth > hammer.depth * 3);
});
test('local carving creates unequal volumes, leaves solid behind, and conserves material', () => {
  const faces = block(0, 0, 1, 2, 1, 0, 0),
    volume = solidInfo(faces).volume;
  const result = impactFracture(faces, [0, 1, 0.5], solveContact('hammer', [0, 0, 1], [0.3, -0.6, -1]));
  const sizes = [...result.retained, ...result.shards].map((f) => solidInfo(f).volume);
  assert.ok(result.retained.length > 0 && result.shards.length > 3);
  assert.ok(Math.max(...sizes) / Math.min(...sizes) > 20);
  assert.ok(Math.abs(sizes.reduce((a, b) => a + b, 0) - volume) < 1e-5);
  assert.ok(result.removedVolume < volume * 0.6);
});
test('a gap does not carry structural load', () => {
  const a = block(0, 0, 1, 1, 1, 0, 0),
    b = block(0, 1, 1, 1, 1, 0, 0),
    c = block(0, 1.2, 1, 1, 1, 0, 0);
  const info = (f) => ({ ...solidInfo(f), faces: f });
  assert.ok(connectionArea(info(a), info(b)) > 0.9);
  assert.equal(connectionArea(info(a), info(c)), 0);
});

test('contact footprint clips against the remaining face and sees actual thickness', () => {
  const faces = block(0, 0, 1, 1, 1, 0, 0),
    n = [0, 0, 1];
  const middle = contactSurface(faces, [0, 0.5, 0.5], n),
    edge = contactSurface(faces, [0.49, 0.5, 0.5], n);
  assert.ok(Math.abs(middle.thickness - 1) < 1e-8);
  const a = solveContact('hammer', n, [0, 0, -1], middle.thickness, middle);
  const b = solveContact('hammer', n, [0, 0, -1], edge.thickness, edge);
  assert.ok(b.area < a.area * 0.6);
  const result = impactFracture(faces, [0, 0.5, 0.5], a);
  const deep = result.retained
    .flatMap((f) => f.map((face) => ({ face, faces: f })))
    .find(({ face }) => face.tag === 'cut' && normal(face)[2] > 0.99);
  assert.ok(deep);
  const point = deep.face.points.reduce(
    (v, p) => v.map((x, i) => x + p[i] / deep.face.points.length),
    [0, 0, 0],
  );
  assert.ok(contactSurface(deep.faces, point, n).thickness < 1 - a.depth + 0.01);
});
test('gate is stable, one strike chips locally, and reset releases resources', async () => {
  await FractureWorld.init();
  const world = new FractureWorld();
  assert.equal(world.snapshot().moving, 0);
  const pillar = [...world.pieces.values()].find((p) => p.name === '支柱');
  assert.ok(
    world.hit(
      pillar.id,
      [pillar.center[0], 1.1, pillar.max[2]],
      solveContact('hammer', [0, 0, 1], [0.2, -0.5, -1]),
    ),
  );
  assert.equal(world.hits, 1);
  assert.ok(world.snapshot().fixed > 0);
  assert.ok(world.snapshot().moving > 0);
  for (let i = 0; i < 240; i++) world.step(1 / 120);
  assert.ok(world.snapshot().contacts > 0);
  world.reset();
  assert.equal(world.snapshot().bodies, 31);
  assert.equal(world.snapshot().moving, 0);
  const chip = world.create(block(6, 0, 0.1, 0.1, 0.1, 0, 0), { cracked: true });
  assert.equal(chip.dynamic, true, 'chipped floor crumbs are debris, not permanent anchors');
  assert.ok(Number.isFinite(chip.expiresAt));
  world.events.free();
  world.world.free();
});

test('new colliders contain the chipped cavity, not the original uncut surface', async () => {
  await FractureWorld.init();
  const world = new FractureWorld();
  for (const p of [...world.pieces.values()]) world.remove(p);
  const p = world.create(block(0, 0, 1, 1, 1, 0, 0));
  const ray = new RAPIER.Ray({ x: 0, y: 0.5, z: 2 }, { x: 0, y: 0, z: -1 });
  const before = p.collider.castRay(ray, 5, true);
  const contact = solveContact('hammer', [0, 0, 1], [0, 0, -1], 1);
  world.hit(p.id, [0, 0.5, 0.5], contact);
  const distances = [...world.pieces.values()]
    .filter((p) => !p.dynamic)
    .map((p) => p.collider.castRay(ray, 5, true))
    .filter((t) => t >= 0);
  assert.ok(Math.min(...distances) > before + contact.depth - 0.015);
  world.events.free();
  world.world.free();
});

test('secondary fragments inherit cleanup deadlines instead of extending the round', async () => {
  await FractureWorld.init();
  const world = new FractureWorld();
  for (const p of [...world.pieces.values()]) world.remove(p);
  world.create(block(0, 3, 1, 1, 1), { dynamic: true, expiresAt: 1.2 });
  for (let i = 0; i < 240; i++) world.step(1 / 120);
  assert.ok(world.secondary > 0, 'the falling block actually fractures on impact');
  assert.equal(world.pieces.size, 0);
  world.events.free();
  world.world.free();
});
