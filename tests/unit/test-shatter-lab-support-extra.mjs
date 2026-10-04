import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  EXTRA_SUPPORT_STAGES,
  makeExtraSupportStage,
} from '../../dist/js/shatter-lab-support-stages-extra.js';
import { FractureWorld } from '../../dist/js/shatter-lab-world.js';
import { contactSurface, solveContact } from '../../dist/js/shatter-lab-contact.js';
import { makeGlassGeometry } from '../../dist/js/shatter-lab-geometry.js';
import { solidInfo, normal, dot, sub } from '../../dist/js/shatter-lab-solid.js';

const payloadPattern = { halo: /^浮遊リング・/, stairbridge: /^階段大橋・/, lanterns: /^双子の吊り灯・/ };
const boundsOf = (parts) => {
  const points = parts.flatMap((part) => part.faces.flatMap((face) => face.points));
  return {
    min: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis]))),
    max: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis]))),
  };
};

function stageFor(type, size = 1, count = 1) {
  const stage = makeExtraSupportStage(type),
    bounds = boundsOf(stage.solids),
    width = (bounds.max[0] - bounds.min[0]) * size,
    depth = (bounds.max[2] - bounds.min[2]) * size,
    columns = Math.min(3, count),
    rows = Math.ceil(count / columns),
    solids = [];
  for (let item = 0; item < count; item++) {
    const x = ((item % columns) - (columns - 1) / 2) * (width + 0.7),
      z = (Math.floor(item / columns) - (rows - 1) / 2) * (depth + 0.9);
    for (const part of stage.solids)
      solids.push({
        ...part,
        faces: part.faces.map((face) => ({
          ...face,
          points: face.points.map(([px, py, pz]) => [px * size + x, py * size, pz * size + z]),
        })),
      });
  }
  return { ...stage, solids, bounds: boundsOf(solids) };
}

const settle = (world, frames = 360) => {
  for (let frame = 0; frame < frames; frame++) world.step(1 / 120);
};
const fixedPayload = (world, pattern) =>
  [...world.pieces.values()].filter((part) => !part.dynamic && pattern.test(part.name));

function strikeVisibleSupport(world, stage, name, tool = 'hammer') {
  const support = [...world.pieces.values()]
    .filter((part) => part.name === name && !part.dynamic)
    .sort((a, b) => b.volume - a.volume)[0];
  if (!support) return false;
  const material = new THREE.MeshBasicMaterial(),
    meshes = [...world.pieces.values()].map((part) => {
      const mesh = new THREE.Mesh(makeGlassGeometry(part), [material, material, material]);
      mesh.position.copy(part.body.translation());
      mesh.quaternion.copy(part.body.rotation());
      mesh.userData.piece = part;
      mesh.updateMatrixWorld(true);
      return mesh;
    });
  try {
    const target = new THREE.Vector3().copy(support.body.translation()),
      targetY = (stage.bounds.min[1] + stage.bounds.max[1]) / 2,
      distance = Math.max(8, stage.bounds.max[0] - stage.bounds.min[0] + 5);
    for (const elevation of [stage.viewElevation, 0.15])
      for (const azimuth of [0.36, 0, -0.6, 0.8, -1.2, 1.6, -2, 2.5, Math.PI]) {
        const camera = new THREE.PerspectiveCamera(36, 1.84, 0.05, 70),
          horizontal = Math.cos(elevation) * distance;
        camera.position.set(
          Math.sin(azimuth) * horizontal,
          targetY + Math.sin(elevation) * distance,
          Math.cos(azimuth) * horizontal,
        );
        camera.lookAt(0, targetY, 0);
        camera.updateMatrixWorld(true);
        const ray = new THREE.Raycaster(camera.position, target.clone().sub(camera.position).normalize()),
          hit = ray.intersectObjects(meshes, false)[0];
        if (hit?.object.userData.piece.id !== support.id) continue;
        const point = hit.point.toArray(),
          n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).toArray(),
          surface = contactSurface(world.worldFaces(support), point, n),
          angle = Math.atan2(tool === 'pick' ? -0.4 : -0.7, tool === 'pick' ? -0.45 : -0.95),
          direction = new THREE.Vector3(Math.cos(angle), Math.sin(angle), -1.7)
            .applyQuaternion(camera.quaternion)
            .normalize()
            .toArray();
        assert.ok(surface.polygon, 'the strike lands on an actual rendered face');
        return world.hit(support.id, point, solveContact(tool, n, direction, surface.thickness, surface));
      }
    assert.fail(`no orbit exposes ${name}`);
  } finally {
    for (const mesh of meshes) mesh.geometry.dispose();
    material.dispose();
  }
}

test('extra stages have unique names, convex outward solids, and volume scales with size and copy count', () => {
  assert.equal(makeExtraSupportStage('unknown'), null);
  assert.equal(new Set(EXTRA_SUPPORT_STAGES.map(({ id }) => id)).size, 3);
  for (const { id, name, pattern } of EXTRA_SUPPORT_STAGES) {
    assert.match(name, pattern);
    const source = makeExtraSupportStage(id),
      volume = source.solids.reduce((sum, part) => sum + solidInfo(part.faces).volume, 0);
    assert.equal(new Set(source.solids.map((part) => part.name)).size, source.solids.length);
    assert.ok(source.hint.length > 30);
    assert.ok(source.viewElevation >= 0.3 && source.viewElevation <= 0.5);
    assert.equal(
      source.solids.filter((part) => part.name.endsWith('支柱・中段')).length,
      id === 'stairbridge' ? 6 : 8,
    );
    for (const size of [0.78, 1, 1.14]) {
      const stage = stageFor(id, size, 5);
      assert.ok(
        Math.abs(
          stage.solids.reduce((sum, part) => sum + solidInfo(part.faces).volume, 0) - volume * size ** 3 * 5,
        ) < 1e-7,
      );
      for (const part of stage.solids) {
        const info = solidInfo(part.faces);
        assert.ok(Number.isFinite(info.volume) && info.volume > 0.000015);
        for (const face of part.faces) {
          const n = normal(face);
          assert.ok(dot(n, sub(face.points[0], info.center)) > -1e-7, `${part.name}: outward face`);
          for (const vertex of info.vertices) {
            assert.ok(vertex.every(Number.isFinite));
            assert.ok(dot(n, sub(vertex, face.points[0])) < 1e-6, `${part.name}: convex solid`);
          }
        }
      }
    }
  }
});

test('all extra stages stay intact without input at every size and one through five copies', async () => {
  await FractureWorld.init();
  const world = new FractureWorld();
  try {
    for (const { id } of EXTRA_SUPPORT_STAGES)
      for (const size of [0.78, 1, 1.14])
        for (const count of [1, 2, 3, 4, 5]) {
          const stage = stageFor(id, size, count);
          world.reset(stage.solids, []);
          settle(world, 120);
          const state = world.snapshot();
          assert.equal(state.moving, 0, `${id}/${size}/${count}: all original supports are connected`);
          assert.equal(state.bodies, stage.solids.length);
          assert.equal(state.secondary, 0);
          assert.equal(state.floorFracture.bestPercent, 0);
        }
  } finally {
    world.events.free();
    world.world.free();
  }
});

for (const { id } of EXTRA_SUPPORT_STAGES)
  for (const size of [0.78, 1, 1.14])
    test(`${id}/${size}: preparing visible columns preserves the payload until the final actual support is cut`, async (t) => {
      await FractureWorld.init();
      const world = new FractureWorld(),
        stage = stageFor(id, size),
        names = stage.solids.filter((part) => part.name.endsWith('支柱・中段')).map((part) => part.name),
        groups = id === 'lanterns' ? [names.slice(0, 4), names.slice(4)] : [names];
      try {
        world.reset(stage.solids, []);
        for (const [groupIndex, group] of groups.entries()) {
          const pattern =
              id === 'lanterns'
                ? new RegExp(`^双子の吊り灯・${groupIndex ? '右' : '左'}`)
                : payloadPattern[id],
            count = fixedPayload(world, pattern).length;
          assert.ok(count > 0);
          for (const [index, name] of group.entries()) {
            const before = world.snapshot().floorFracture.creditedVolume;
            assert.ok(strikeVisibleSupport(world, stage, name));
            assert.equal(
              world.snapshot().floorFracture.creditedVolume,
              before,
              'a hammer cut is not floor fracture',
            );
            settle(world);
            if (index < group.length - 1)
              assert.equal(
                fixedPayload(world, pattern).length,
                count,
                `${name}: an uncut remaining column holds its payload`,
              );
          }
          assert.equal(fixedPayload(world, pattern).length, 0, 'the final column releases its payload');
          if (id === 'lanterns' && groupIndex === 0)
            assert.equal(
              fixedPayload(world, /^双子の吊り灯・右/).length,
              3,
              'the other lantern is structurally independent',
            );
        }
        const state = world.snapshot();
        assert.equal(state.hits, names.length);
        assert.ok(state.floorFracture.bestPercent > 20, `${id}: substantial real floor fracture`);
        assert.ok(state.floorFracture.creditedVolume <= world.initialVolume + 1e-7);
        t.diagnostic(
          `${names.length} hammer hits, ${state.floorFracture.bestPercent.toFixed(2)}% best floor fracture`,
        );
      } finally {
        world.events.free();
        world.world.free();
      }
    });

for (const id of ['halo', 'stairbridge'])
  test(`${id}: real horizontal arms provide a second release route while the columns remain intact`, async (t) => {
    await FractureWorld.init();
    const world = new FractureWorld(),
      stage = stageFor(id),
      names = stage.solids.filter((part) => part.name.endsWith('・横腕')).map((part) => part.name);
    try {
      world.reset(stage.solids, []);
      const payloadCount = fixedPayload(world, payloadPattern[id]).length;
      for (const [index, name] of names.entries()) {
        assert.ok(strikeVisibleSupport(world, stage, name));
        settle(world);
        if (index < names.length - 1)
          assert.equal(
            fixedPayload(world, payloadPattern[id]).length,
            payloadCount,
            `${name}: remaining arms still carry the payload`,
          );
      }
      assert.equal(fixedPayload(world, payloadPattern[id]).length, 0);
      assert.equal(
        [...world.pieces.values()].filter((part) => !part.dynamic && part.name.endsWith('支柱・中段')).length,
        names.length,
      );
      const state = world.snapshot();
      assert.ok(state.floorFracture.bestPercent > 20);
      t.diagnostic(
        `${state.hits} arm hits, ${state.floorFracture.bestPercent.toFixed(2)}% best floor fracture`,
      );
    } finally {
      world.events.free();
      world.world.free();
    }
  });

test('lantern necks can release each heavy crystal without hitting a support column', async (t) => {
  await FractureWorld.init();
  const world = new FractureWorld(),
    stage = stageFor('lanterns');
  try {
    world.reset(stage.solids, []);
    for (const side of ['左', '右']) {
      assert.ok(strikeVisibleSupport(world, stage, `双子の吊り灯・${side}の吊り首`));
      settle(world);
      assert.equal(fixedPayload(world, new RegExp(`^双子の吊り灯・${side}の大結晶$`)).length, 0);
      assert.equal(fixedPayload(world, new RegExp(`^双子の吊り灯・${side}の薄い天板$`)).length, 1);
    }
    const state = world.snapshot();
    assert.equal(state.hits, 2);
    assert.ok(state.floorFracture.bestPercent > 20);
    t.diagnostic(`2 neck hits, ${state.floorFracture.bestPercent.toFixed(2)}% best floor fracture`);
  } finally {
    world.events.free();
    world.world.free();
  }
});
