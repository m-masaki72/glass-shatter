import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeChandelierStage } from '../../dist/js/shatter-lab-chandelier.js';
import { FractureWorld } from '../../dist/js/shatter-lab-world.js';
import { contactSurface, solveContact } from '../../dist/js/shatter-lab-contact.js';
import { makeGlassGeometry } from '../../dist/js/shatter-lab-geometry.js';
import { solidInfo, connectionArea, normal, dot, sub } from '../../dist/js/shatter-lab-solid.js';

const settle = (world, frames = 480) => {
  for (let i = 0; i < frames; i++) world.step(1 / 120);
};
const lowerPayload = (world) => [...world.pieces.values()].filter((p) => p.name.includes('下段'));
const fixedLower = (world) => lowerPayload(world).filter((p) => !p.dynamic);
const dispose = (world) => {
  world.events.free();
  world.world.free();
};
function partsFor(size = 1, count = 1) {
  const source = makeChandelierStage().solids;
  const vertices = source.flatMap((part) => part.faces.flatMap((face) => face.points));
  const span = (axis) =>
    Math.max(...vertices.map((p) => p[axis])) - Math.min(...vertices.map((p) => p[axis]));
  const width = span(0),
    depth = span(2);
  const columns = Math.min(3, count),
    rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, index) =>
    source.map((part) => ({
      ...part,
      faces: part.faces.map((face) => ({
        ...face,
        points: face.points.map(([x, y, z]) => [
          x * size + ((index % columns) - (columns - 1) / 2) * (width * size + 0.7),
          y * size,
          z * size + (Math.floor(index / columns) - (rows - 1) / 2) * (depth * size + 0.9),
        ]),
      })),
    })),
  ).flat();
}
function strike(world, name, tool = 'hammer', size = 1, offset = [0, 0, 0]) {
  const p = [...world.pieces.values()]
    .filter((p) => p.name === name && !p.dynamic)
    .sort((a, b) => b.volume - a.volume)[0];
  assert.ok(p, name);
  const material = new THREE.MeshBasicMaterial();
  const meshes = [...world.pieces.values()].map((part) => {
    const mesh = new THREE.Mesh(makeGlassGeometry(part), [material, material, material]);
    mesh.position.copy(part.body.translation());
    mesh.quaternion.copy(part.body.rotation());
    mesh.userData.piece = part;
    mesh.updateMatrixWorld(true);
    return mesh;
  });
  try {
    const target = new THREE.Vector3(...p.center).add(new THREE.Vector3(...offset).multiplyScalar(size));
    for (const azimuth of [0.36, 0, -0.6, 0.8, -1.2, 1.6, -2, 2.5, Math.PI]) {
      const elevation = 0.29,
        distance = 11 * size,
        horizontal = Math.cos(elevation) * distance;
      const camera = new THREE.PerspectiveCamera(36, 1.84, 0.05, 70);
      camera.position.set(
        Math.sin(azimuth) * horizontal,
        (2.725 + Math.sin(elevation) * 11) * size,
        Math.cos(azimuth) * horizontal,
      );
      camera.lookAt(0, 2.725 * size, 0);
      camera.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(camera.position, target.clone().sub(camera.position).normalize());
      const hit = ray.intersectObjects(meshes, false)[0];
      if (hit?.object.userData.piece.id !== p.id) continue;
      const point = hit.point.toArray(),
        n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).toArray();
      const surface = contactSurface(world.worldFaces(p), point, n);
      assert.ok(surface.polygon, 'the camera ray lands on an actual rendered face');
      const angle = Math.atan2(tool === 'pick' ? -0.4 : -0.7, tool === 'pick' ? -0.45 : -0.95);
      const direction = new THREE.Vector3(Math.cos(angle), Math.sin(angle), -1.7)
        .applyQuaternion(camera.quaternion)
        .normalize()
        .toArray();
      assert.ok(world.hit(p.id, point, solveContact(tool, n, direction, surface.thickness, surface)));
      return { azimuth, point };
    }
    assert.fail(`no ordinary orbit exposes ${name}`);
  } finally {
    for (const mesh of meshes) mesh.geometry.dispose();
    material.dispose();
  }
}

test('chandelier has convex glass, two real lower support paths, and a clear initial collision gap', () => {
  const stage = makeChandelierStage(),
    parts = stage.solids.map((part) => ({ ...part, ...solidInfo(part.faces) }));
  assert.equal(parts.length, 16);
  assert.equal(new Set(parts.map((p) => p.name)).size, 16);
  const baseline = parts.reduce((sum, p) => sum + p.volume, 0);
  for (const size of [0.78, 1, 1.14]) {
    const volume = partsFor(size, 5).reduce((sum, p) => sum + solidInfo(p.faces).volume, 0);
    assert.ok(Math.abs(volume - baseline * size ** 3 * 5) < 1e-7);
  }
  for (const part of parts) {
    assert.ok(Number.isFinite(part.volume) && part.volume > 0.000015);
    for (const face of part.faces) {
      const n = normal(face);
      assert.ok(dot(n, sub(face.points[0], part.center)) > -1e-7, `${part.name}: outward face`);
      for (const vertex of part.vertices) {
        assert.ok(vertex.every(Number.isFinite));
        assert.ok(dot(n, sub(vertex, face.points[0])) < 1e-6, `${part.name}: convex solid`);
      }
    }
  }
  const byName = (name) => parts.find((part) => part.name === name);
  const origin = byName('連鎖・起点の大結晶'),
    receiver = byName('連鎖・衝突を受ける長い腕');
  assert.ok(origin.min[1] - receiver.max[1] > 0.6);
  assert.equal(connectionArea(origin, receiver), 0);
  assert.deepEqual(
    parts.filter((p) => p !== origin && connectionArea(origin, p) > 0.003).map((p) => p.name),
    ['連鎖・上の吊り首'],
  );
  for (const name of ['連鎖・衝突を受ける長い腕', '連鎖・控えの細い横腕'])
    assert.ok(
      connectionArea(byName('連鎖・下の吊り首'), byName(name)) > 0.003,
      `${name}: separate real bond`,
    );
  assert.ok(parts.filter((p) => p.name.includes('下段')).every((p) => p.min[1] > 0.7));
});

test('chandelier stays intact at all three sizes and one through five copies', async () => {
  await FractureWorld.init();
  const world = new FractureWorld();
  try {
    for (const size of [0.78, 1, 1.14])
      for (const count of [1, 2, 3, 4, 5]) {
        world.reset(partsFor(size, count), []);
        settle(world, 120);
        assert.equal(world.snapshot().moving, 0, `${size}/${count}: no free-standing payload`);
        assert.equal(world.snapshot().bodies, 16 * count);
        assert.equal(world.secondary, 0);
        assert.equal(world.chains.floorSnapshot(world.initialVolume).creditedVolume, 0);
      }
  } finally {
    dispose(world);
  }
});

for (const size of [0.78, 1, 1.14])
  for (const tool of ['hammer', 'pick'])
    test(`chandelier ${size}/${tool}: preparing the brace changes the actual collision into one scored chain`, async (t) => {
      await FractureWorld.init();
      const results = [];
      for (const prepared of [false, true]) {
        const impacts = [],
          world = new FractureWorld({ impact: (event) => impacts.push(event) });
        try {
          world.reset(partsFor(size), []);
          settle(world, 120);
          const receiverId = [...world.pieces.values()].find((p) => p.name === '連鎖・衝突を受ける長い腕').id;
          const crystals = lowerPayload(world)
            .filter((p) => p.name.includes('大結晶'))
            .map((p) => ({ id: p.id, volume: p.volume }));
          if (prepared) {
            const hit = strike(world, '連鎖・控えの細い横腕', tool, size);
            assert.equal(hit.azimuth, 0.36, 'the brace is visible from the default camera');
            settle(world, 120);
            assert.equal(fixedLower(world).length, 4, 'preparation alone preserves the large lower payload');
          }
          const before = world.chains.floorSnapshot(world.initialVolume).creditedVolume;
          const hit = strike(world, '連鎖・上の吊り首', tool, size);
          assert.equal(hit.azimuth, 0.36, 'the upper neck is visible from the default camera');
          const cause = world.hits;
          assert.equal(
            world.chains.floorSnapshot(world.initialVolume).creditedVolume,
            before,
            'release is not a score',
          );
          assert.equal(
            fixedLower(world).length,
            4,
            'no scripted simultaneous release on the initiating click',
          );
          settle(world);
          const collision = impacts.find(
            (e) => e.kind === 'secondary' && !e.floor && e.pieceId === receiverId,
          );
          assert.ok(collision, 'the falling origin actually hits and fractures the receiver');
          assert.equal(collision.cause, cause);
          if (prepared) {
            assert.equal(fixedLower(world).length, 0);
            for (const crystal of crystals) {
              const landing = impacts.find((e) => e.floor && e.pieceId === crystal.id);
              assert.ok(landing, 'each intact lower crystal reaches a real floor/debris-bed fracture');
              assert.equal(landing.cause, cause);
              assert.ok(landing.time > collision.time, 'second floor crash follows the relay impact');
            }
          } else
            assert.equal(fixedLower(world).length, 4, 'the uncut alternate brace holds the lower chandelier');
          const score = world.chains.floorSnapshot(world.initialVolume);
          const firstLandingVolume = impacts
            .filter((e) => e.floor && e.landingDepth === 1)
            .reduce((sum, e) => sum + e.volume, 0);
          assert.ok(
            Math.abs(score.creditedVolume - firstLandingVolume) < 1e-7,
            'secondary splits never credit parent volume twice',
          );
          assert.ok(score.creditedVolume <= world.initialVolume + 1e-7);
          assert.ok([...world.chains.floorVolumes.values()].every((volume) => volume >= 0));
          results.push(score.bestPercent);
        } finally {
          dispose(world);
        }
      }
      assert.ok(results[1] > results[0] + 25, 'the planned relay has a materially larger best-shot payoff');
      t.diagnostic(`unprepared ${results[0].toFixed(2)}%, prepared ${results[1].toFixed(2)}%`);
    });

test('chandelier supports broad brace targeting with both tools, not one hidden pixel', async (t) => {
  await FractureWorld.init();
  for (const tool of ['hammer', 'pick'])
    for (const offset of [-0.2, 0.2]) {
      const world = new FractureWorld();
      try {
        world.reset(partsFor(), []);
        strike(world, '連鎖・控えの細い横腕', tool, 1, [0, 0, offset]);
        settle(world, 120);
        assert.equal(fixedLower(world).length, 4);
        strike(world, '連鎖・上の吊り首', tool, 1, [Math.sign(offset) * 0.035, 0, 0]);
        settle(world);
        assert.equal(fixedLower(world).length, 0);
        assert.ok(world.snapshot().floorFracture.bestPercent > 60);
        t.diagnostic(`${tool}/${offset}: ${world.snapshot().floorFracture.bestPercent.toFixed(2)}%`);
      } finally {
        dispose(world);
      }
    }
});

test('cutting both lower supports before the origin separates the two best-shot causes', async (t) => {
  await FractureWorld.init();
  for (const tool of ['hammer', 'pick']) {
    const impacts = [],
      world = new FractureWorld({ impact: (event) => impacts.push(event) });
    try {
      world.reset(partsFor(), []);
      const lowerIds = new Set(lowerPayload(world).map((p) => p.id));
      strike(world, '連鎖・控えの細い横腕', tool);
      settle(world, 120);
      strike(world, '連鎖・衝突を受ける長い腕', tool, 1, [1.4, 0, 0]);
      settle(world);
      assert.equal(fixedLower(world).length, 0);
      assert.ok(impacts.some((e) => e.floor && lowerIds.has(e.pieceId) && e.cause === 2));
      strike(world, '連鎖・上の吊り首', tool);
      settle(world);
      assert.ok(world.chains.floorVolumes.get(2) > 0);
      assert.ok(world.chains.floorVolumes.get(3) > 0);
      assert.ok(!impacts.some((e) => e.floor && lowerIds.has(e.pieceId) && e.cause === 3));
      assert.ok(world.snapshot().floorFracture.bestPercent < 65);
      t.diagnostic(`${tool}: separated best ${world.snapshot().floorFracture.bestPercent.toFixed(2)}%`);
    } finally {
      dispose(world);
    }
  }
});
