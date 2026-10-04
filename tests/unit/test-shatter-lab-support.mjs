import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORT_STAGES } from '../../dist/js/shatter-lab-support-stages.js';
import {
  EXTRA_SUPPORT_STAGES,
  makeExtraSupportStage,
} from '../../dist/js/shatter-lab-support-stages-extra.js';
import { makeStage, parseStagePrompt } from '../../dist/js/shatter-lab-stage.js';
import { solidInfo, normal, dot, sub } from '../../dist/js/shatter-lab-solid.js';
import { FractureWorld } from '../../dist/js/shatter-lab-world.js';
import { solveContact, contactSurface } from '../../dist/js/shatter-lab-contact.js';

test('delegated stages integrate with prompt generation, versioned records and multi-object layout', () => {
  for (const { id, name } of EXTRA_SUPPORT_STAGES) {
    assert.equal(parseStagePrompt(name).type, id);
    const stage = makeStage({ ...parseStagePrompt(id), count: 2, size: 0.78 });
    assert.equal(stage.spec.layoutVersion, 'supports-v1');
    assert.equal(stage.title, name);
    assert.equal(stage.solids.length, makeExtraSupportStage(id).solids.length * 2);
    assert.equal(stage.centers.length, 2);
    assert.ok(stage.hint.length > 20);
  }
});

test('three new support stages parse by label or English, scale, stay convex and stable at every size/count', async () => {
  await FractureWorld.init();
  const world = new FractureWorld();
  try {
    for (const { id, name } of SUPPORT_STAGES) {
      assert.equal(parseStagePrompt(`透明なガラスの${name}`).type, id);
      const base = makeStage(parseStagePrompt(id));
      const volume = base.solids.reduce((sum, part) => sum + solidInfo(part.faces).volume, 0);
      for (const part of base.solids) {
        const info = solidInfo(part.faces);
        assert.ok(info.volume > 0.000015);
        for (const face of part.faces) {
          const n = normal(face);
          assert.ok(dot(n, sub(face.points[0], info.center)) >= -1e-7);
          assert.ok(
            info.vertices.every((p) => p.every(Number.isFinite) && dot(n, sub(p, face.points[0])) < 1e-6),
          );
        }
      }
      for (const size of [0.78, 1, 1.14])
        for (const count of [1, 2, 3, 4, 5]) {
          const stage = makeStage({ ...parseStagePrompt(id), size, count });
          world.reset(stage.solids, []);
          for (let i = 0; i < 120; i++) world.step(1 / 120);
          assert.equal(world.snapshot().moving, 0, `${id}/${size}/${count}`);
          assert.equal(world.secondary, 0);
          assert.ok(Math.abs(world.initialVolume - volume * size ** 3 * count) < 1e-7);
        }
    }
  } finally {
    world.events.free();
    world.world.free();
  }
});

for (const { id } of SUPPORT_STAGES)
  test(`${id} keeps its load through repeated preparation and falls only after its last real support is cut`, async (t) => {
    await FractureWorld.init();
    const world = new FractureWorld();
    try {
      for (const [size, reverse] of [0.78, 1, 1.14].flatMap((size) => [
        [size, false],
        [size, true],
      ])) {
        const stage = makeStage({ ...parseStagePrompt(id), size });
        world.reset(stage.solids, []);
        const names = stage.solids.filter((p) => p.name.endsWith('・中段')).map((p) => p.name);
        if (reverse) names.reverse();
        const payload = [...world.pieces.values()]
          .filter((p) => !p.name.includes('支柱') && p.min[1] > 1)
          .map((p) => p.id);
        assert.ok(names.length >= 6 && payload.length >= 5);
        for (const [index, name] of names.entries()) {
          const p = [...world.pieces.values()].find((p) => p.name === name && !p.dynamic);
          assert.ok(p, `${name} remains independently supported`);
          const point = [p.center[0], p.center[1], p.max[2]],
            n = [0, 0, 1];
          const surface = contactSurface(world.worldFaces(p), point, n);
          assert.ok(
            world.hit(p.id, point, solveContact('hammer', n, [-0.4, -0.5, -1], surface.thickness, surface)),
          );
          for (let i = 0; i < 360; i++) world.step(1 / 120);
          if (index < names.length - 1)
            assert.ok(
              payload.every((id) => world.pieces.has(id) && !world.pieces.get(id).dynamic),
              'uncut supports still carry all payload',
            );
        }
        assert.ok(payload.every((id) => !world.pieces.has(id) || world.pieces.get(id).dynamic));
        assert.ok(world.snapshot().floorFracture.bestPercent > 25);
        t.diagnostic(
          `size ${size}/${reverse ? 'reverse' : 'forward'}: ${world.hits} preparation strikes, ${world.snapshot().floorFracture.bestPercent.toFixed(2)}% floor fracture`,
        );
      }
    } finally {
      world.events.free();
      world.world.free();
    }
  });
