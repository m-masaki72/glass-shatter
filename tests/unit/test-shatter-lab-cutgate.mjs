import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCutgateStage } from '../../dist/js/shatter-lab-cutgate.js';
import { FractureWorld } from '../../dist/js/shatter-lab-world.js';
import {
  strategyStage,
  strikeStrategy,
  settleStrategy,
  strategyRay,
} from '../helpers/crystal-strategy-test-helpers.mjs';

const LEFT = '門・薄い板状接合',
  RIGHT = '門・厚い角形接合';
const fixedPayload = (world) =>
  [...world.pieces.values()].filter((p) => p.name?.startsWith('門の') && !p.dynamic);

async function withGate(size, run) {
  await FractureWorld.init();
  const stage = strategyStage(makeCutgateStage, size),
    world = new FractureWorld();
  try {
    world.reset(stage.solids, []);
    settleStrategy(world, 1);
    assert.equal(world.snapshot().moving, 0);
    await run(world, stage);
  } finally {
    world.events.free();
    world.world.free();
  }
}

function prepare(world, stage) {
  assert.ok(strikeStrategy(world, stage, LEFT));
  settleStrategy(world, 0.8);
  assert.equal(fixedPayload(world).length, 4, 'the right joint still physically carries every payload');
}

for (const size of [0.78, 1, 1.14])
  test(`cutgate/${size}: broad inner-edge cuts release the load only after both joints lose support`, async (t) => {
    await withGate(size, (world, stage) => {
      prepare(world, stage);
      const credited = world.chains.floorSnapshot(world.initialVolume).creditedVolume;
      assert.ok(strikeStrategy(world, stage, RIGHT, { point: [1.98, 2.31, 1.53].map((v) => v * size) }));
      assert.equal(
        world.chains.floorSnapshot(world.initialVolume).creditedVolume,
        credited,
        'cutting is not floor scoring',
      );
      settleStrategy(world, 4);
      assert.equal(fixedPayload(world).length, 0);
      assert.ok(world.snapshot().floorFracture.bestPercent > 50);
      assert.ok(world.snapshot().floorFracture.creditedVolume <= world.initialVolume + 1e-7);
      const score = world.snapshot().floorFracture.creditedVolume;
      settleStrategy(world, 5);
      assert.ok(world.snapshot().floorFracture.creditedVolume <= world.initialVolume + 1e-7);
      assert.ok(world.snapshot().floorFracture.creditedVolume >= score);
      t.diagnostic(
        `${world.hits} hits, ${world.snapshot().floorFracture.bestPercent.toFixed(2)}% floor fracture`,
      );
      world.reset(stage.solids, []);
      assert.equal(world.hits, 0);
      assert.equal(world.snapshot().floorFracture.bestPercent, 0);
      assert.equal(fixedPayload(world).length, 4);
    });
  });

test('cutgate: the same upper-face target keeps a pick-cut connection but a broad hammer cut releases it', async () => {
  for (const tool of ['hammer', 'pick'])
    await withGate(1, (world, stage) => {
      prepare(world, stage);
      assert.ok(strikeStrategy(world, stage, RIGHT, { tool, point: [2.26, 2.55, 1.53] }));
      settleStrategy(world, 3);
      assert.equal(fixedPayload(world).length, tool === 'hammer' ? 0 : 4);
      if (tool === 'pick') {
        assert.ok(strikeStrategy(world, stage, RIGHT, { tool, azimuth: 1.1, point: [2.65, 2.08, 0.64] }));
        settleStrategy(world, 4);
        assert.equal(
          fixedPayload(world).length,
          0,
          'a different physical section releases the remaining connection',
        );
        assert.ok(world.snapshot().floorFracture.bestPercent > 50);
      }
    });
});

test('cutgate: multiple broad target regions and a side-view pick route work without hit-count gates', async () => {
  for (const options of [
    { tool: 'hammer', point: [2.26, 2.05, 1.53] },
    { tool: 'pick', point: [1.98, 2.31, 1.53] },
    { tool: 'pick', azimuth: 1.1, point: [2.65, 2.08, 0.64] },
  ])
    await withGate(1, (world, stage) => {
      prepare(world, stage);
      assert.ok(strikeStrategy(world, stage, RIGHT, options));
      settleStrategy(world, 4);
      assert.equal(fixedPayload(world).length, 0);
      assert.ok(world.snapshot().floorFracture.bestPercent > 50);
    });
});

test('cutgate: both joints are visible and retain contrasting local section depths at desktop and narrow aspects', async () => {
  await withGate(1, (world, stage) => {
    for (const aspect of [0.75, 1.2, 1.84, 2.4]) {
      const left = strategyRay(world, stage, LEFT, { aspect });
      const right = strategyRay(world, stage, RIGHT, { aspect });
      assert.equal(left?.piece.name, LEFT);
      assert.equal(right?.piece.name, RIGHT);
      assert.ok(right.thickness > left.thickness * 4);
      assert.ok(left.contact.area > 0 && right.contact.area > 0);
    }
  });
});
