import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LandingCamera } from '../../dist/js/shatter-lab-landing-camera.js';
import { applyPiecePose, physicalContact } from '../../dist/js/shatter-lab-motion.js';
import { FractureWorld, STEP } from '../../dist/js/shatter-lab-world.js';
import { block } from '../../dist/js/shatter-lab-solid.js';
import { CrystalView } from '../../dist/js/shatter-lab-view.js';
import { prepareLandingMaterials } from '../../dist/js/shatter-lab-warmup.js';
import { FractureLight } from '../../dist/js/shatter-lab-fracture-light.js';

test('cinematic zoom and pan are bounded, focus on landing and return to the untouched base pose', () => {
  const effect = new LandingCamera(),
    camera = new THREE.PerspectiveCamera(36, 1.5, 0.05, 70);
  const position = new THREE.Vector3(4, 5, 10),
    target = new THREE.Vector3(0, 2, 0);
  const base = () => {
    camera.position.copy(position);
    camera.lookAt(target);
  };
  base();
  const orientation = camera.quaternion.clone();
  effect.start([1.2, 0, 0]);
  for (const age of [0, 0.09, 0.2, 0.48, 0.8, 1, 1.12, 2]) {
    base();
    effect.apply(camera, target, age);
    assert.ok(camera.zoom >= 1 && camera.zoom <= 1.14 + 1e-9);
    assert.ok(Math.abs(effect.pan) <= 0.065);
    assert.ok(camera.position.toArray().every(Number.isFinite));
    if (age === 0.48) {
      assert.ok(Math.abs(camera.zoom - 1.14) < 1e-9);
      assert.ok(effect.target.y < target.y);
      assert.ok(effect.target.x > 0);
    }
    if (age >= 1.12 || age === 0) {
      assert.deepEqual(camera.position, position);
      assert.ok(camera.quaternion.angleTo(orientation) < 1e-7);
      assert.equal(camera.zoom, 1);
    }
  }
  effect.start([1000, -20, 1000]);
  base();
  effect.apply(camera, target, 0.4);
  assert.ok(effect.target.distanceTo(target) <= position.distanceTo(target) * 0.12 + 1e-7);
  effect.cancel();
  base();
  effect.apply(camera, target, 0.5);
  assert.equal(camera.zoom, 1);
  assert.deepEqual(camera.position, position);
});

test('landing camera retargets continuously, respects the three-second cap and keeps manual cancellation', () => {
  const effect = new LandingCamera(),
    camera = new THREE.PerspectiveCamera(36, 1.5, 0.05, 70),
    position = new THREE.Vector3(4, 5, 10),
    target = new THREE.Vector3(0, 2, 0);
  const draw = (age, sequenceAge) => {
    camera.position.copy(position);
    camera.lookAt(target);
    effect.apply(camera, target, age, sequenceAge);
  };
  effect.start([-2, 0, 0], 10);
  draw(0.48, 0.48);
  const previous = camera.position.clone(),
    orientation = camera.quaternion.clone(),
    zoom = camera.zoom;
  assert.equal(effect.start([2, 0, 0], 10, true), true);
  draw(0, 0.48);
  assert.ok(camera.position.distanceTo(previous) < 1e-9, 'retarget starts at the rendered camera pose');
  assert.ok(camera.quaternion.angleTo(orientation) < 1e-7);
  assert.equal(camera.zoom, zoom, 'zoom never snaps back to its base at a combo boundary');
  draw(0.14, 0.62);
  assert.ok(effect.focus.x > -2 && effect.focus.x < 2);
  draw(0.28, 0.76);
  assert.equal(effect.focus.x, 2);
  assert.ok(Math.abs(effect.pan) <= 0.065);
  effect.start([-1, 0, 2], 10, true);
  draw(0.5, 3);
  assert.equal(effect.running, false);
  assert.equal(camera.zoom, 1);
  assert.deepEqual(camera.position, position);

  effect.start([1, 0, 0], 20);
  draw(0.3, 0.3);
  effect.cancel();
  assert.equal(effect.start([-1, 0, 0], 20, true), false, 'later combo pulses cannot undo manual input');
  draw(0.2, 0.7);
  assert.equal(camera.zoom, 1);
  assert.deepEqual(camera.position, position);
  assert.equal(effect.start([-1, 0, 0], 21, false, false), false);
  assert.equal(
    effect.start([1, 0, 0], 21, true),
    false,
    'an interrupted navigation sequence stays suppressed',
  );
  assert.equal(effect.start([1, 0, 0], 22), true, 'a later, separate cascade may use the camera');
  effect.reset();
  assert.equal(effect.start([1, 0, 0], 0), true, 'retry can reuse the zero-based presentation clock');
});

test('render interpolation advances smoothly between physical ticks without changing the body', async () => {
  await FractureWorld.init();
  const world = new FractureWorld();
  try {
    world.reset([], []);
    const piece = world.create(block(0, 4, 0.3, 0.3, 0.3), {
      dynamic: true,
      velocity: [2, 0, 0],
      spin: [0, 2, 0],
    });
    const mesh = new THREE.Object3D();
    mesh.userData.piece = piece;
    world.step(STEP);
    const current = piece.body.translation(),
      rotation = piece.body.rotation();
    const positions = [];
    for (const alpha of [0, 0.25, 0.5, 0.75, 1]) {
      applyPiecePose(mesh, alpha);
      positions.push(mesh.position.x);
      assert.ok(Math.abs(mesh.quaternion.length() - 1) < 1e-7);
    }
    assert.equal(positions[0], piece.previousPosition.x);
    assert.equal(positions[4], current.x);
    assert.ok(positions.every((x, i) => !i || x > positions[i - 1]));
    assert.deepEqual(piece.body.translation(), current);
    assert.deepEqual(piece.body.rotation(), rotation);
    const before = world.clock;
    world.step(STEP * 0.2);
    assert.equal(world.clock, before);
    applyPiecePose(mesh, world.accumulator / STEP);
    assert.ok(mesh.position.x > positions[0] && mesh.position.x < positions[1]);
  } finally {
    world.events.free();
    world.world.free();
  }
});

test('contact on an interpolated mesh is mapped back onto the actual collider surface', () => {
  const mesh = new THREE.Object3D(),
    local = new THREE.Vector3(0.3, 0.2, 0.1);
  mesh.position.set(0, 1, 0);
  mesh.rotation.y = 0.3;
  mesh.updateMatrixWorld(true);
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.6);
  const position = new THREE.Vector3(0.1, 1.1, 0.2);
  mesh.userData.piece = { body: { translation: () => position, rotation: () => rotation } };
  const contact = physicalContact({
    object: mesh,
    point: mesh.localToWorld(local.clone()),
    face: { normal: new THREE.Vector3(0, 0, 1) },
  });
  assert.ok(contact.point.distanceTo(local.clone().applyQuaternion(rotation).add(position)) < 1e-7);
  assert.ok(contact.normal.distanceTo(new THREE.Vector3(0, 0, 1).applyQuaternion(rotation)) < 1e-7);
});

test('closed floor shards avoid backface transmission passes but retain glass optics', () => {
  const view = { materials: new Map(), tint: '#def3f0', fractureLight: new FractureLight() };
  const original = CrystalView.prototype.glass.call(view, 0.2, true);
  const debris = CrystalView.prototype.glass.call(view, 0.2, true, false, true);
  assert.equal(original.side, THREE.DoubleSide);
  assert.equal(debris.side, THREE.FrontSide);
  for (const key of ['transmission', 'ior', 'dispersion', 'roughness', 'thickness', 'attenuationDistance'])
    assert.equal(debris[key], original[key]);
  assert.equal(debris.attenuationColor.getHex(), original.attenuationColor.getHex());
  for (const material of view.materials.values()) material.dispose();
});

test('shader preparation covers screen/reflection output and restores renderer state on failure', async () => {
  for (const fail of [false, true]) {
    const original = {},
      reflection = {},
      calls = [],
      materials = [];
    let target = original,
      disposed = false;
    const view = {
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
      fractureLight: new FractureLight(),
      glass: () => {
        const material = new THREE.MeshBasicMaterial();
        materials.push(material);
        return material;
      },
      floorReflection: { getRenderTarget: () => reflection },
      renderer: {
        getRenderTarget: () => target,
        setRenderTarget: (next) => {
          target = next;
        },
        compileAsync: (group) => {
          calls.push(target);
          group.children[0]?.geometry?.addEventListener('dispose', () => {
            disposed = true;
          });
          if (fail) throw new Error('compile failed');
          return Promise.resolve();
        },
      },
    };
    if (fail) await assert.rejects(prepareLandingMaterials(view), /compile failed/);
    else {
      await prepareLandingMaterials(view);
      assert.deepEqual(calls, [null, reflection, original]);
    }
    assert.equal(target, original);
    assert.equal(disposed, true);
    materials.forEach((m) => m.dispose());
  }
});
