import test from 'node:test';
import assert from 'node:assert/strict';
import { STRATEGY_STAGES, makeStrategyStage } from '../../dist/js/shatter-lab-strategy-stages.js';
import { makeStage, parseStagePrompt } from '../../dist/js/shatter-lab-stage.js';
import { readStageSelection, saveStageSelection } from '../../dist/js/shatter-lab-save.js';
import { stageRankingKey } from '../../dist/js/shatter-lab-ranking.js';
import { FractureWorld } from '../../dist/js/shatter-lab-world.js';
import { solidInfo, normal, dot, sub } from '../../dist/js/shatter-lab-solid.js';

test('strategy prototypes are separately named/versioned and restore without replacing old selections or records', () => {
  assert.equal(makeStrategyStage('unknown'), null);
  const stored = new Map(),
    storage = { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value) };
  for (const { id, name, layoutVersion } of STRATEGY_STAGES) {
    assert.equal(parseStagePrompt(name).type, id);
    const prompt = `青い小さなガラスの${name}を2つ`,
      stage = makeStage(parseStagePrompt(prompt));
    assert.equal(stage.spec.layoutVersion, layoutVersion);
    assert.equal(stage.spec.size, 0.78);
    assert.equal(stage.spec.color, 'blue');
    assert.equal(stage.spec.count, 2);
    assert.equal(stage.title, name);
    assert.ok(stage.hint.length > 20);
    assert.ok(saveStageSelection(storage, prompt));
    assert.equal(readStageSelection(storage).type, id);
    assert.ok(stageRankingKey(stage.spec).includes(layoutVersion));
  }
  assert.equal(makeStage(parseStagePrompt('構造標本')).spec.layoutVersion, 'structure-bundle-v2');
  assert.equal(makeStage(parseStagePrompt('双子の吊り灯')).spec.layoutVersion, 'supports-v1');
  assert.notEqual(
    stageRankingKey(makeStage(parseStagePrompt('cutgate')).spec),
    stageRankingKey(makeStage(parseStagePrompt('構造標本')).spec),
  );
  assert.equal(saveStageSelection(storage, '未知のかたち'), false);
  assert.equal(readStageSelection(storage).type, 'cutgate');
});

test('strategy prototypes stay convex and intact for three sizes and one through five copies', async () => {
  await FractureWorld.init();
  const world = new FractureWorld();
  try {
    for (const { id } of STRATEGY_STAGES) {
      const original = makeStage(parseStagePrompt(id));
      const volume = original.solids.reduce((s, p) => s + solidInfo(p.faces).volume, 0);
      for (const size of [0.78, 1, 1.14])
        for (const count of [1, 2, 3, 4, 5]) {
          const stage = makeStage({ ...parseStagePrompt(id), size, count });
          for (const part of stage.solids) {
            const info = solidInfo(part.faces);
            assert.ok(info.volume > 0 && Number.isFinite(info.volume));
            for (const face of part.faces) {
              const n = normal(face);
              assert.ok(dot(n, sub(face.points[0], info.center)) > -1e-7);
              assert.ok(
                info.vertices.every((v) => v.every(Number.isFinite) && dot(n, sub(v, face.points[0])) < 1e-6),
              );
            }
          }
          world.reset(stage.solids, []);
          for (let i = 0; i < 120; i++) world.step(1 / 120);
          assert.equal(world.snapshot().moving, 0, `${id}/${size}/${count}: no spontaneous collapse`);
          assert.equal(world.pieces.size, stage.solids.length);
          assert.equal(world.snapshot().floorFracture.bestPercent, 0);
          assert.ok(Math.abs(world.initialVolume - volume * size ** 3 * count) < 1e-7);
        }
    }
  } finally {
    world.events.free();
    world.world.free();
  }
});
