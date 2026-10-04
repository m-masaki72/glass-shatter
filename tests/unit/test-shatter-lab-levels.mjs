import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeStage, parseStagePrompt } from '../../dist/js/shatter-lab-stage.js';
import { FractureWorld } from '../../dist/js/shatter-lab-world.js';
import { makeGlassGeometry } from '../../dist/js/shatter-lab-geometry.js';
import { contactSurface, solveContact } from '../../dist/js/shatter-lab-contact.js';
import { solidInfo, normal, dot, sub, connectionArea } from '../../dist/js/shatter-lab-solid.js';

const targets = {
  panel: ['橋の左連結部', '橋の右連結部'],
  diamond: ['宝石の細い横腕'],
  star: ['星の吊り首'],
  heart: ['ハートの吊り首'],
  structure: ['細長い支柱', '厚い持送り'],
  building: ['左前束ね柱・前左細柱', '右前束ね柱・前右細柱'],
};
const payloadNames = {
  panel: ['薄い橋板', '橋の中厚板', '厚い橋板'],
  diamond: ['宝石'],
  star: ['星のカット'],
  heart: ['ハートの面'],
  structure: ['薄いプレート', '厚いプレート', '太いガラスブロック', '太い上部ブロック', '薄い上部プレート'],
  building: ['床スラブ'],
};
const isPayload = (type, part) => payloadNames[type].includes(part.name);
const volumeOf = (stage) => stage.solids.reduce((volume, part) => volume + solidInfo(part.faces).volume, 0);

function cameraFor(stage, aspect = 1.6, azimuth = 0.36) {
  const camera = new THREE.PerspectiveCamera(36, aspect, 0.05, 70),
    { min, max } = stage.bounds,
    width = max[0] - min[0],
    height = max[1] - min[1],
    depth = max[2] - min[2],
    targetY = (max[1] + min[1]) / 2,
    tangent = Math.tan(THREE.MathUtils.degToRad(18)),
    distance = Math.max(
      5.5,
      Math.max(height / 2 / tangent, Math.hypot(width, depth) / 2 / tangent / aspect) * 1.22 + depth,
    ),
    horizontal = Math.cos(stage.viewElevation) * distance;
  camera.position.set(
    Math.sin(azimuth) * horizontal,
    targetY + Math.sin(stage.viewElevation) * distance,
    Math.cos(azimuth) * horizontal,
  );
  camera.lookAt(0, targetY, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

function directionFor(camera, tool) {
  const angle = Math.atan2(tool === 'pick' ? -0.4 : -0.7, tool === 'pick' ? -0.45 : -0.95);
  return new THREE.Vector3(Math.cos(angle), Math.sin(angle), -1.7)
    .applyQuaternion(camera.quaternion)
    .normalize()
    .toArray();
}

function intersectStage(world, camera, target) {
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
    const ray = new THREE.Raycaster(camera.position, target.clone().sub(camera.position).normalize()),
      hit = ray.intersectObjects(meshes, false)[0];
    assert.ok(hit, 'the screen ray intersects actual rendered geometry');
    return {
      piece: hit.object.userData.piece,
      point: hit.point.toArray(),
      normal: hit.face.normal.clone().transformDirection(hit.object.matrixWorld).toArray(),
    };
  } finally {
    for (const mesh of meshes) mesh.geometry.dispose();
    material.dispose();
  }
}

function strikeThroughCamera(world, camera, tool, name, point) {
  const support = [...world.pieces.values()]
    .filter((part) => part.name === name && !part.dynamic)
    .sort((a, b) => b.volume - a.volume)[0];
  if (!support) return false;
  const target = point ? new THREE.Vector3(...point) : new THREE.Vector3().copy(support.body.translation()),
    hit = intersectStage(world, camera, target);
  assert.equal(hit.piece.name, name, 'a nearer part must not steal the intended hit');
  const surface = contactSurface(world.worldFaces(hit.piece), hit.point, hit.normal);
  assert.ok(surface.polygon, 'the ray intersection belongs to a real face');
  return world.hit(
    hit.piece.id,
    hit.point,
    solveContact(tool, hit.normal, directionFor(camera, tool), surface.thickness, surface),
  );
}

test('drop layouts preserve scaled volume, finite convex solids, and only revise the redesigned specifications', () => {
  for (const type of Object.keys(targets)) {
    const spec = parseStagePrompt(type),
      baseline = makeStage(spec);
    assert.equal(spec.layoutVersion, undefined, 'input specification is not mutated');
    assert.equal(
      baseline.spec.layoutVersion,
      type === 'structure' ? 'structure-bundle-v2' : type === 'building' ? 'building-bundle-v1' : 'drop-v2',
    );
    assert.ok(baseline.hint.length > 20);
    assert.ok(baseline.viewElevation >= 0.3 && baseline.viewElevation <= 0.5);
    for (const size of [0.78, 1, 1.14]) {
      const stage = makeStage({ ...spec, size, count: 5 });
      assert.ok(Math.abs(volumeOf(stage) - volumeOf(baseline) * size ** 3 * 5) < 1e-7);
      for (const part of stage.solids) {
        const info = solidInfo(part.faces);
        assert.ok(Number.isFinite(info.volume) && info.volume > 0.000015);
        for (const face of part.faces) {
          const n = normal(face);
          assert.ok(dot(n, sub(face.points[0], info.center)) > -1e-7, `${type}: outward face`);
          for (const vertex of info.vertices) {
            assert.ok(vertex.every(Number.isFinite));
            assert.ok(dot(n, sub(vertex, face.points[0])) < 1e-6, `${type}: convex solid`);
          }
        }
      }
    }
  }
  for (const type of ['keyboard', 'phone', 'castle', 'bottle', 'vase', 'tower', 'cascade'])
    assert.equal(makeStage(parseStagePrompt(type)).spec.layoutVersion, undefined);
  const heart = makeStage(parseStagePrompt('heart')),
    heartVolume = heart.solids
      .filter((part) => isPayload('heart', part))
      .reduce((sum, part) => sum + solidInfo(part.faces).volume, 0);
  assert.ok(
    Math.abs(heartVolume - 2.7619575171291366) < 1e-10,
    'merging heart cuts preserves its original volume',
  );
  assert.equal(heart.solids.filter((part) => isPayload('heart', part)).length, 8);
});

test('all three sizes and one through five copies remain completely stable without input', async () => {
  await FractureWorld.init();
  const world = new FractureWorld();
  try {
    for (const type of Object.keys(targets))
      for (const size of [0.78, 1, 1.14])
        for (const count of [1, 2, 3, 4, 5]) {
          const stage = makeStage({ ...parseStagePrompt(type), size, count });
          world.reset(stage.solids, []);
          for (let frame = 0; frame < 120; frame++) world.step(1 / 120);
          const state = world.snapshot();
          assert.equal(state.moving, 0, `${type}/${size}/${count}: intact support`);
          assert.equal(state.bodies, stage.solids.length);
          assert.equal(state.secondary, 0);
          assert.equal(state.floorFracture.bestPercent, 0);
          assert.ok(Math.abs(world.initialVolume - volumeOf(stage)) < 1e-9);
        }
  } finally {
    world.events.free();
    world.world.free();
  }
});

test('initial camera sees each support surface before any opaque geometry blocks it', () => {
  const material = new THREE.MeshBasicMaterial();
  try {
    for (const type of Object.keys(targets)) {
      const stage = makeStage(parseStagePrompt(type)),
        meshes = stage.solids.map((part) => {
          const positions = part.faces.flatMap((face) =>
              face.points
                .slice(1, -1)
                .flatMap((point, i) => [...face.points[0], ...point, ...face.points[i + 2]]),
            ),
            geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = part.name;
          mesh.updateMatrixWorld(true);
          return mesh;
        });
      try {
        for (const aspect of [1.2, 1.6, 1.84, 2.4])
          for (const name of targets[type]) {
            const camera = cameraFor(stage, aspect);
            const info = solidInfo(stage.solids.find((part) => part.name === name).faces),
              point = new THREE.Vector3(...info.center),
              ray = new THREE.Raycaster(camera.position, point.clone().sub(camera.position).normalize()),
              hit = ray.intersectObjects(meshes, false)[0];
            assert.equal(hit?.object.name, name, `${type}/${aspect}: ${name} center is directly targetable`);
          }
      } finally {
        for (const mesh of meshes) mesh.geometry.dispose();
      }
    }
  } finally {
    material.dispose();
  }
});

for (const type of ['panel', 'diamond', 'star', 'heart'])
  test(`${type} releases its payload through actual tool contact and real floor fractures`, async (t) => {
    await FractureWorld.init();
    const world = new FractureWorld(),
      stage = makeStage(parseStagePrompt(type)),
      camera = cameraFor(stage, 1.84);
    try {
      for (const tool of ['hammer', 'pick']) {
        world.reset(stage.solids, []);
        for (let frame = 0; frame < 120; frame++) world.step(1 / 120);
        for (const [index, name] of targets[type].entries()) {
          const before = world.snapshot().floorFracture.creditedVolume;
          assert.ok(strikeThroughCamera(world, camera, tool, name));
          assert.equal(
            world.snapshot().floorFracture.creditedVolume,
            before,
            'a cut is not a floor fracture',
          );
          if (type === 'panel' && index === 0)
            assert.equal(
              [...world.pieces.values()].filter((part) => !part.dynamic && isPayload(type, part)).length,
              3,
              'the surviving real support holds the bridge',
            );
          for (let frame = 0; frame < 360; frame++) world.step(1 / 120);
        }
        const state = world.snapshot();
        assert.equal(state.hits, targets[type].length);
        assert.ok(state.floorFracture.bestPercent > 25, `${tool}: substantial real floor fracture`);
        assert.ok(state.floorFracture.creditedVolume <= world.initialVolume + 1e-7);
        assert.ok(state.secondary >= 3);
        t.diagnostic(
          `${tool}: ${state.floorFracture.bestPercent.toFixed(2)}% floor fracture, ${state.secondary} secondary events`,
        );
        assert.equal(
          [...world.pieces.values()].filter((part) => !part.dynamic && isPayload(type, part)).length,
          0,
          'no intact payload is left floating',
        );
        world.reset();
        assert.equal(world.snapshot().moving, 0);
        assert.equal(world.snapshot().floorFracture.bestPercent, 0);
      }
    } finally {
      world.events.free();
      world.world.free();
    }
  });

test('bridge and structure expose genuine thin, thick and load-bearing part dimensions', () => {
  const bridge = makeStage(parseStagePrompt('panel')),
    plates = bridge.solids
      .filter((part) => isPayload('panel', part))
      .map((part) => ({ ...solidInfo(part.faces), faces: part.faces }));
  for (const [index, thickness] of [0.12, 0.26, 0.52].entries()) {
    assert.ok(Math.abs(plates[index].max[1] - plates[index].min[1] - thickness) < 1e-9);
    assert.ok(Math.abs(plates[index].max[1] - 1.9) < 1e-9, 'bridge walking surfaces are flush');
  }
  assert.ok(connectionArea(plates[0], plates[1]) > 0.003);
  assert.ok(connectionArea(plates[1], plates[2]) > 0.003);
  const structure = makeStage(parseStagePrompt('構造標本')),
    dimensions = (name) => {
      const info = solidInfo(structure.solids.find((part) => part.name === name).faces);
      return info.max.map((value, axis) => value - info.min[axis]);
    };
  assert.equal(structure.spec.type, 'structure');
  assert.ok(structure.solids.length < 100);
  assert.ok(Math.abs(dimensions('薄いプレート')[1] - 0.12) < 1e-9);
  assert.ok(Math.abs(dimensions('厚いプレート')[1] - 0.44) < 1e-9);
  assert.ok(Math.abs(dimensions('太いガラスブロック')[1] - 0.86) < 1e-9);
  assert.ok(dimensions('細長い支柱')[1] > dimensions('細長い支柱')[0] * 8);
  assert.ok(dimensions('右束ね柱・上カラー')[0] > dimensions('細長い支柱')[0] * 2);
  assert.equal(structure.solids.length, 16);
});

test('bundled columns are four independent thin posts bonded only through their end collars', () => {
  for (const type of ['structure', 'building'])
    for (const size of [0.78, 1, 1.14]) {
      const stage = makeStage({ ...parseStagePrompt(type), size }),
        bundles = new Map();
      for (const part of stage.solids.filter((part) => part.name.includes('束ね柱'))) {
        const prefix = part.name.split('・')[0];
        if (!bundles.has(prefix)) bundles.set(prefix, []);
        bundles.get(prefix).push({ ...solidInfo(part.faces), faces: part.faces, name: part.name });
      }
      assert.equal(bundles.size, type === 'structure' ? 1 : 4);
      for (const parts of bundles.values()) {
        const posts = parts.filter((part) => part.name.endsWith('細柱')),
          collars = parts.filter((part) => part.name.endsWith('カラー'));
        assert.equal(posts.length, 4);
        assert.equal(collars.length, 2);
        for (const post of posts) {
          assert.ok(post.max[1] - post.min[1] > (post.max[0] - post.min[0]) * 4);
          for (const collar of collars)
            assert.ok(connectionArea(post, collar) > 0.003, `${type}/${size}: real collar bond`);
          for (const other of posts)
            if (post !== other) assert.equal(connectionArea(post, other), 0, 'no invisible lateral bond');
        }
      }
      if (type === 'building') {
        assert.equal(stage.solids.length, 48);
        assert.equal(stage.solids.filter((part) => part.name === '支柱').length, 12);
        assert.equal(stage.solids.filter((part) => part.name === '床スラブ').length, 4);
      }
    }
});

test('four-post preparation preserves remaining supports until the final real post is cut', async (t) => {
  await FractureWorld.init();
  const stage = makeStage(parseStagePrompt('structure')),
    world = new FractureWorld(),
    route = [
      ['細長い支柱', 0.36],
      ['右束ね柱・前左細柱', 0.36],
      ['右束ね柱・前右細柱', 0.36],
      ['右束ね柱・奥左細柱', 1.15],
      ['右束ね柱・奥右細柱', 1.15],
    ];
  try {
    for (const tool of ['hammer', 'pick']) {
      world.reset(stage.solids, []);
      const originalPayload = [...world.pieces.values()].filter((part) => isPayload('structure', part));
      const payloadVolume = originalPayload.reduce((sum, part) => sum + part.volume, 0);
      for (const [index, [name, azimuth]] of route.entries()) {
        const camera = cameraFor(stage, 1.84, azimuth);
        assert.ok(strikeThroughCamera(world, camera, tool, name));
        for (let frame = 0; frame < 360; frame++) world.step(1 / 120);
        const fixedPayload = [...world.pieces.values()].filter(
          (part) => !part.dynamic && isPayload('structure', part),
        );
        assert.equal(fixedPayload.length, index < route.length - 1 ? 5 : 0);
        if (index < route.length - 1) {
          assert.deepEqual(
            fixedPayload,
            originalPayload,
            'the surviving posts retain every original payload',
          );
          assert.ok(fixedPayload.every((part) => !part.floorCredited));
          assert.ok(
            world.snapshot().floorFracture.creditedVolume <= world.initialVolume - payloadVolume + 1e-7,
            'only chipped supports, not the intact payload, may already have fractured on the floor',
          );
        }
      }
      const state = world.snapshot();
      assert.equal(state.hits, route.length);
      assert.ok(state.floorFracture.bestPercent > 25);
      assert.ok(state.floorFracture.creditedVolume <= world.initialVolume + 1e-7);
      t.diagnostic(
        `${tool}: final post releases ${state.floorFracture.bestPercent.toFixed(2)}% floor fracture`,
      );
    }
  } finally {
    world.events.free();
    world.world.free();
  }
});

test('first-floor building bundles keep upper floors intact while individual supports are prepared', async (t) => {
  await FractureWorld.init();
  const stage = makeStage(parseStagePrompt('building')),
    world = new FractureWorld(),
    names = stage.solids.filter((part) => part.name.endsWith('細柱')).map((part) => part.name);
  try {
    for (const tool of ['hammer', 'pick']) {
      world.reset(stage.solids, []);
      for (const [index, name] of names.entries()) {
        const support = [...world.pieces.values()].find((part) => part.name === name && !part.dynamic);
        if (!support) continue;
        const target = new THREE.Vector3().copy(support.body.translation()),
          camera = [0.36, -0.36, 1.15, -1.15, Math.PI + 0.36, Math.PI - 0.36]
            .map((azimuth) => cameraFor(stage, 1.84, azimuth))
            .find((candidate) => intersectStage(world, candidate, target).piece.id === support.id);
        assert.ok(camera, `${name} can be reached with an ordinary orbit and center click`);
        assert.ok(strikeThroughCamera(world, camera, tool, name));
        for (let frame = 0; frame < 360; frame++) world.step(1 / 120);
        if (index === 3)
          assert.equal(
            [...world.pieces.values()].filter((part) => !part.dynamic && isPayload('building', part)).length,
            4,
            'the other three bundles still support every intact floor',
          );
      }
      const state = world.snapshot();
      assert.equal(
        [...world.pieces.values()].filter((part) => !part.dynamic && isPayload('building', part)).length,
        0,
      );
      t.diagnostic(
        `${tool}: ${state.hits} strikes, ${state.floorFracture.bestPercent.toFixed(2)}% floor fracture`,
      );
      assert.ok(state.floorFracture.bestPercent > 0, `${tool}: upper floors reach and break on the floor`);
    }
  } finally {
    world.events.free();
    world.world.free();
  }
});

test('building collars offer an alternate broad-cut route instead of requiring all sixteen post strikes', async (t) => {
  await FractureWorld.init();
  const stage = makeStage(parseStagePrompt('building')),
    world = new FractureWorld(),
    names = stage.solids.filter((part) => part.name.endsWith('下カラー')).map((part) => part.name);
  try {
    for (const tool of ['hammer', 'pick']) {
      world.reset(stage.solids, []);
      const views = [];
      for (const name of names) {
        for (let attempt = 0; attempt < 3; attempt++) {
          const support = [...world.pieces.values()]
            .filter((part) => part.name === name && !part.dynamic)
            .sort((a, b) => b.volume - a.volume)[0];
          if (!support) break;
          const target = new THREE.Vector3().copy(support.body.translation()),
            camera = [0.36, -0.36, 1.15, -1.15, Math.PI + 0.36, Math.PI - 0.36]
              .map((azimuth) => cameraFor(stage, 1.84, azimuth))
              .find((candidate) => intersectStage(world, candidate, target).piece.id === support.id);
          assert.ok(camera, `${name}: exposed collar can be aimed from a normal view`);
          views.push(`${name}@${Math.atan2(camera.position.x, camera.position.z).toFixed(2)}rad`);
          assert.ok(strikeThroughCamera(world, camera, tool, name));
          for (let frame = 0; frame < 360; frame++) world.step(1 / 120);
        }
      }
      const state = world.snapshot();
      t.diagnostic(
        `${tool}: ${state.hits} collar strikes, ${state.floorFracture.bestPercent.toFixed(2)}% floor fracture`,
      );
      t.diagnostic(views.join(' → '));
      assert.ok(state.hits < 16);
      assert.equal(
        [...world.pieces.values()].filter((part) => !part.dynamic && isPayload('building', part)).length,
        0,
      );
      assert.ok(state.floorFracture.bestPercent > 20, 'the floor itself breaks a substantial share of glass');
    }
  } finally {
    world.events.free();
    world.world.free();
  }
});

test('structure supports preparation then a final physical release, with distinct deep and broad tool cuts', async (t) => {
  await FractureWorld.init();
  const stage = makeStage(parseStagePrompt('構造標本')),
    camera = cameraFor(stage, 1.84),
    world = new FractureWorld(),
    cuts = {};
  const strike = (tool, name) => strikeThroughCamera(world, camera, tool, name);
  try {
    for (const tool of ['hammer', 'pick']) {
      world.reset(stage.solids, []);
      assert.ok(strike(tool, '厚い持送り'));
      cuts[tool] = world.lastContact;
      assert.ok(
        [...world.pieces.values()].some((part) => !part.dynamic && isPayload('structure', part)),
        'the other real support still holds',
      );
      world.reset(stage.solids, []);
      assert.ok(strike(tool, '細長い支柱'));
      for (let frame = 0; frame < 360; frame++) world.step(1 / 120);
      assert.equal(
        world.snapshot().floorFracture.bestPercent,
        0,
        'preparation alone is not floor destruction',
      );
      assert.equal(
        [...world.pieces.values()].filter((part) => !part.dynamic && isPayload('structure', part)).length,
        5,
      );
      assert.ok(strike(tool, '厚い持送り'));
      for (let frame = 0; frame < 360; frame++) world.step(1 / 120);
      if (tool === 'pick') {
        assert.ok(
          world.snapshot().floorFracture.bestPercent < 5,
          'a narrow hole at the thick support center does not sever its root',
        );
        assert.ok([...world.pieces.values()].some((part) => !part.dynamic && isPayload('structure', part)));
        assert.ok(strike(tool, '厚い持送り'), 'aim at the remaining support fragment');
        for (let frame = 0; frame < 360; frame++) world.step(1 / 120);
      }
      for (let attempt = 0; attempt < 2 && world.snapshot().floorFracture.bestPercent <= 25; attempt++) {
        if (!strike(tool, '厚い持送り')) break;
        for (let frame = 0; frame < 360; frame++) world.step(1 / 120);
      }
      const state = world.snapshot();
      assert.ok(state.hits >= 2);
      assert.ok(
        state.floorFracture.bestPercent > 25,
        `${tool}: final release reaches and fractures on the floor`,
      );
      assert.equal(
        [...world.pieces.values()].filter((part) => !part.dynamic && isPayload('structure', part)).length,
        0,
      );
      assert.ok(state.floorFracture.creditedVolume <= world.initialVolume + 1e-7);
      t.diagnostic(
        `${tool}: ${state.hits} physical strikes, ${state.floorFracture.bestPercent.toFixed(2)}% floor fracture`,
      );
    }
    assert.ok(cuts.hammer.removedVolume > cuts.pick.removedVolume * 2, 'hammer removes a broad chip');
    assert.ok(cuts.pick.depth > cuts.hammer.depth * 1.15, 'pick penetrates deeper into the same face');
  } finally {
    world.events.free();
    world.world.free();
  }
});

test('a precise pick shot at the inner support edge finishes structure without another center strike', async (t) => {
  await FractureWorld.init();
  const stage = makeStage(parseStagePrompt('構造標本')),
    camera = cameraFor(stage, 1.84),
    world = new FractureWorld();
  try {
    world.reset(stage.solids, []);
    assert.ok(strikeThroughCamera(world, camera, 'pick', '細長い支柱'));
    for (let frame = 0; frame < 360; frame++) world.step(1 / 120);
    assert.ok(strikeThroughCamera(world, camera, 'pick', '厚い持送り', [2.13, 1.88, 1.18]));
    for (let frame = 0; frame < 360; frame++) world.step(1 / 120);
    const state = world.snapshot();
    assert.equal(state.hits, 2);
    assert.ok(state.floorFracture.bestPercent > 25);
    assert.equal(
      [...world.pieces.values()].filter((part) => !part.dynamic && isPayload('structure', part)).length,
      0,
    );
    t.diagnostic(`inner-edge pick: ${state.floorFracture.bestPercent.toFixed(2)}% floor fracture`);
  } finally {
    world.events.free();
    world.world.free();
  }
});
