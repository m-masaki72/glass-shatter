import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LandingSplinters } from '../../dist/js/shatter-lab-splinters.js';
import { ContactShadows } from '../../dist/js/shatter-lab-contact-shadows.js';
import { FractureWorld, STEP } from '../../dist/js/shatter-lab-world.js';
import { block } from '../../dist/js/shatter-lab-solid.js';
import { makeStage, parseStagePrompt } from '../../dist/js/shatter-lab-stage.js';
import { contactSurface, solveContact } from '../../dist/js/shatter-lab-contact.js';
import { DebrisBed } from '../../dist/js/shatter-lab-debris-bed.js';
import { FractureLight } from '../../dist/js/shatter-lab-fracture-light.js';
import { landingFracture } from '../../dist/js/shatter-lab-landing.js';
import { makeGlassGeometry } from '../../dist/js/shatter-lab-geometry.js';
import { solidInfo } from '../../dist/js/shatter-lab-solid.js';

test('fracture light follows real cut seams and uses shared bounded-life shader resources', () => {
  const light = new FractureLight();
  const faces = block(0, 0, 1.5, 0.4, 1);
  const original = { faces, ...solidInfo(faces), landingDepth: 0 };
  const originalGeometry = makeGlassGeometry(original);
  assert.equal(light.attach(original, originalGeometry), null);
  assert.ok(originalGeometry.attributes.fractureBirth.getX(0) < -100);
  const chunks = landingFracture(faces, [0, 0, 0], [0, 1, 0], 3, 2, 2.5);
  const ribbons = [];
  for (const f of chunks) {
    const p = { faces: f, ...solidInfo(f), landingDepth: 1, impactPoint: [0, 0, 0] };
    const geometry = makeGlassGeometry(p);
    const mesh = light.attach(p, geometry);
    assert.equal(geometry.attributes.fractureBirth.getX(0), 0);
    if (mesh) ribbons.push(mesh);
    light.enabled = false;
    assert.equal(light.attach(p, geometry), null);
    light.enabled = true;
  }
  assert.ok(ribbons.length > 0);
  assert.ok(ribbons.every((m) => m.material === light.material));
  assert.ok(ribbons.every((m) => m.geometry.attributes.position.count % 6 === 0));
  light.update(0.3);
  assert.ok(ribbons.every((m) => light.time.value - m.userData.fractureBirth > 0.27));
});

test('glass splinters pool three size tiers, lift off the floor and disappear without shrinking', () => {
  const scene = new THREE.Scene(),
    effect = new LandingSplinters(scene);
  const resources = scene.children.map((m) => [m.geometry, m.material]);
  for (let i = 0; i < 5; i++) effect.emit({ point: [0, 0, 0], volume: 1, energy: 8, drift: [2, -4, 0] });
  assert.equal(effect.particles.length, 720);
  assert.ok(effect.particles.every((p) => p.velocity.y <= 2.9));
  assert.ok(effect.particles.some((p) => p.velocity.y > 2));
  assert.deepEqual(new Set(effect.particles.map((p) => p.tier)), new Set(['hero', 'needle', 'fine']));
  assert.ok(effect.particles.filter((p) => p.velocity.x > 0).length > 500);
  effect.update(0);
  assert.equal(effect.mesh.count + effect.clearMesh.count, 720);
  assert.ok(effect.clearMesh.count <= 40 && effect.clearMesh.count > 0);
  assert.equal(effect.mesh.material.metalness, 0);
  assert.equal(effect.clearMesh.material.transmission, 1);
  assert.equal(effect.mesh.material.emissive.getHex(), 0);
  const p = effect.particles[10],
    size = p.scale.clone();
  effect.update(0.02);
  assert.deepEqual(p.scale, size);
  effect.update(10);
  assert.equal(effect.mesh.count + effect.clearMesh.count, 0);
  effect.clear();
  assert.equal(effect.peak, 0);
  assert.deepEqual(
    scene.children.map((m) => [m.geometry, m.material]),
    resources,
  );
});

test('contact shadows follow the rendered footprint, fade with height and pool their resources', () => {
  const scene = new THREE.Scene(),
    shadows = new ContactShadows(scene, 1);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 1), [new THREE.MeshBasicMaterial()]);
  mesh.position.set(1, 0.1, -2);
  mesh.userData.piece = { dynamic: true };
  const meshes = new Map([[1, mesh]]);
  shadows.update(meshes);
  assert.equal(shadows.mesh.count, 1);
  const opacity = shadows.mesh.geometry.attributes.contactOpacity.getX(0);
  const matrix = new THREE.Matrix4();
  shadows.mesh.getMatrixAt(0, matrix);
  assert.equal(matrix.elements[12], 1);
  assert.equal(matrix.elements[14], -2);
  mesh.position.y += 0.13;
  shadows.update(meshes);
  assert.ok(shadows.mesh.geometry.attributes.contactOpacity.getX(0) < opacity / 3);
  mesh.position.y += 1;
  shadows.update(meshes);
  assert.equal(shadows.mesh.count, 0, 'no floating dark patch under airborne glass');
  shadows.clear();
  assert.equal(scene.children.length, 1);
});

test('pile contact impulses combine within 60 ms but never accumulate indefinitely or across pieces', () => {
  const bed = new DebrisBed();
  const world = { contactPairsWith: () => {} };
  assert.equal(bed.impact({ id: 1 }, 0.2, 1), 0.2);
  assert.equal(bed.impact({ id: 1 }, 0.3, 1), 0.5);
  assert.equal(bed.impact({ id: 2 }, 0.1, 1), 0.1);
  bed.update(world, new Map(), {}, 1.04);
  assert.equal(bed.impact({ id: 1 }, 0.4, 1.04), 0.9);
  bed.update(world, new Map(), {}, 1.07);
  assert.equal(bed.impact({ id: 1 }, 0.1, 1.07), 0.5);
  bed.update(world, new Map(), {}, 1.2);
  assert.equal(bed.impacts.size, 0);
});

async function fixture(run) {
  await FractureWorld.init();
  const impacts = [],
    world = new FractureWorld({ impact: (e) => impacts.push(e) });
  try {
    world.reset([], []);
    await run(world, impacts);
  } finally {
    world.events.free();
    world.world.free();
  }
}
const advance = (world, seconds) => {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) world.step(STEP);
};
const bedPiece = (world, x, y, width = 1.4, height = 0.14) =>
  world.create(block(x, y, width, height, 1.4), {
    dynamic: true,
    cracked: true,
    landingDepth: 2,
    floorCredited: true,
    cause: 0,
  });

test('settled multi-layer debris transmits the floor landing rule and credits only the incoming volume', async () => {
  await fixture((world, impacts) => {
    const bottom = bedPiece(world, 0, 0);
    const top = bedPiece(world, 0, 0.145, 1.2);
    advance(world, 1);
    assert.ok(world.debrisBed.has(bottom));
    assert.ok(world.debrisBed.has(top), 'floor connectivity travels through an actual contacting stack');
    assert.equal(impacts.length, 0);
    world.hits = 1;
    world.chains.begin(1);
    const falling = world.create(block(0, 0.9, 0.8, 0.22, 0.8), { dynamic: true, cause: 1 });
    const volume = falling.volume;
    world.initialVolume = volume + bottom.volume + top.volume;
    advance(world, 2);
    const landing = impacts.find((e) => e.pieceId === falling.id);
    assert.ok(landing?.floor && landing?.bed, JSON.stringify(impacts));
    assert.ok(landing.point[1] > 0.15, 'fracture happens on the pile, not after reaching the real floor');
    assert.ok(landing.fragments > 10);
    assert.ok(world.pieces.has(bottom.id) && world.pieces.has(top.id), 'resting bed is not re-exploded');
    assert.ok(Math.abs(world.snapshot().floorFracture.creditedVolume - volume) < 1e-7);
    assert.ok(Math.abs(world.chains.floorVolumes.get(1) - volume) < 1e-7);
    advance(world, 1);
    assert.ok(
      Math.abs(world.snapshot().floorFracture.creditedVolume - volume) < 1e-7,
      'rebounds cannot double-score',
    );
  });
});

test('airborne debris, side hits and a disconnected former bed never qualify as floor', async () => {
  await fixture((world) => {
    const bed = bedPiece(world, 0, 0);
    const floating = bedPiece(world, 3, 3);
    world.step(STEP);
    assert.equal(world.debrisBed.has(floating), false);
    advance(world, 0.3);
    assert.ok(world.debrisBed.has(bed));
    const incoming = world.create(block(0, 1, 0.8, 0.2, 0.8), { dynamic: true, cause: 1 });
    const motion = { linear: [0, -2, 0], center: [0, 1.1, 0] };
    assert.equal(world.debrisBed.isLanding(incoming, bed, motion, [0, 0.14, 0], { y: 1 }), true);
    assert.equal(world.debrisBed.isLanding(incoming, bed, motion, [0, 0.14, 0], { y: 0 }), false);
    assert.equal(
      world.debrisBed.isLanding(incoming, bed, { ...motion, linear: [2, 0, 0] }, [0, 0.14, 0], { y: 1 }),
      false,
    );
    assert.equal(
      world.debrisBed.isLanding(
        incoming,
        bed,
        { ...motion, linear: [0, 0, 0], angular: [0, 0, -2] },
        [0.3, 0.14, 0],
        { y: 1 },
      ),
      true,
      'the descending end of a rotating slab also makes a landing',
    );
    bed.body.setTranslation({ x: 0, y: 4, z: 0 }, true);
    bed.body.setLinvel({ x: 0, y: -1, z: 0 }, true);
    world.step(STEP);
    assert.equal(world.debrisBed.has(bed), false);
    world.reset([], []);
    assert.equal(world.debrisBed.grounded.size, 0);
  });
});

test('fresh moving debris cannot cushion the mobile cascade slab out of its floor crash', async () => {
  await fixture((world, impacts) => {
    world.reset(makeStage(parseStagePrompt('cascade')).solids, []);
    advance(world, 1);
    const support = [...world.pieces.values()].find((p) => p.name === '細い支え');
    const slab = [...world.pieces.values()].find((p) => p.name === '大きな板');
    // Contact reproduced from the 390 px-wide browser regression, before its pile settled.
    const point = [0.0564604299898237, 0.9237813606384373, 0.15000000596046448];
    const n = [0, 0, 1],
      direction = [-0.6546194774021765, -0.48430752526945514, -0.5804477244102844];
    const surface = contactSurface(world.worldFaces(support), point, n);
    world.hit(support.id, point, solveContact('hammer', n, direction, surface.thickness, surface));
    advance(world, 4);
    const crash = impacts.find((e) => e.pieceId === slab.id);
    assert.ok(crash?.floor && crash?.bed, JSON.stringify(crash));
    assert.ok(crash.fragments > 10);
    assert.ok(world.snapshot().floorFracture.bestPercent > 50);
    assert.ok(world.snapshot().floorFracture.bestPercent <= 100);
  });
});
