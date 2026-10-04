import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGlassGeometry } from '../../dist/js/shatter-lab-geometry.js';
import { solidInfo, normal, block } from '../../dist/js/shatter-lab-solid.js';
import { impactFracture, solveContact } from '../../dist/js/shatter-lab-contact.js';
import { makeStage, parseStagePrompt } from '../../dist/js/shatter-lab-stage.js';
import { aimDescription, StrikeReadout } from '../../dist/js/shatter-lab-readout.js';
import { BestShotRanking, stageRankingKey } from '../../dist/js/shatter-lab-ranking.js';
import { FractureWorld } from '../../dist/js/shatter-lab-world.js';
import { contactSurface } from '../../dist/js/shatter-lab-contact.js';
import { readStageSelection, saveStageSelection } from '../../dist/js/shatter-lab-save.js';

test('stage selection restores the validated prompt and tolerates blocked or obsolete storage', () => {
  let value;
  const storage = {
    getItem: () => value,
    setItem: (_key, text) => {
      value = text;
    },
  };
  assert.equal(readStageSelection(storage), null);
  assert.equal(saveStageSelection(storage, '青い大きなガラスの城 3個'), true);
  const spec = readStageSelection(storage);
  assert.equal(spec.type, 'castle');
  assert.equal(spec.color, 'blue');
  assert.equal(spec.count, 3);
  assert.equal(spec.size, 1.14);
  const saved = value;
  assert.equal(saveStageSelection(storage, '木材の城'), false);
  assert.equal(value, saved, 'invalid drafts cannot replace the playable selection');
  for (value of ['{broken', '{}', '{"version":9,"prompt":"城"}', '{"version":1,"prompt":"木材の城"}'])
    assert.equal(readStageSelection(storage), null);
  assert.equal(saveStageSelection(undefined, '城'), false);
  assert.equal(
    readStageSelection({
      getItem: () => {
        throw new Error('blocked');
      },
    }),
    null,
  );
});

test('glass batching preserves every triangle and surface normal with at most three material groups', () => {
  const cut = impactFracture(
    block(0, 0, 1, 2, 1),
    [0, 1, 0.5],
    solveContact('hammer', [0, 0, 1], [0.3, -0.6, -1]),
  );
  const pieces = [
    ...makeStage(parseStagePrompt('castle')).solids.map((p) => p.faces),
    ...cut.retained,
    ...cut.shards,
  ];
  let before = 0,
    after = 0;
  for (const faces of pieces) {
    const piece = { ...solidInfo(faces), faces };
    const geometry = makeGlassGeometry(piece);
    const expected = [],
      actual = [];
    for (const face of faces) {
      const tag = face.tag === 'cut' ? 1 : face.tag === 'bevel' ? 2 : 0;
      for (let i = 1; i < face.points.length - 1; i++) {
        const data = [face.points[0], face.points[i], face.points[i + 1]].flatMap((p) =>
          p.map((v, k) => v - piece.center[k]).concat(normal(face)),
        );
        expected.push([tag, ...data].map((v) => v.toFixed(5)).join(','));
      }
    }
    for (const group of geometry.groups) {
      for (let i = group.start; i < group.start + group.count; i += 3) {
        const data = [0, 1, 2].flatMap((k) => {
          const p = geometry.attributes.position,
            n = geometry.attributes.normal;
          return [p.getX(i + k), p.getY(i + k), p.getZ(i + k), n.getX(i + k), n.getY(i + k), n.getZ(i + k)];
        });
        actual.push([group.materialIndex, ...data].map((v) => v.toFixed(5)).join(','));
      }
    }
    assert.deepEqual(actual.sort(), expected.sort());
    assert.ok(geometry.groups.length <= 3);
    assert.equal(
      geometry.groups.reduce((sum, g) => sum + g.count, 0),
      geometry.attributes.position.count,
    );
    before += faces.length;
    after += geometry.groups.length;
    geometry.dispose();
  }
  assert.ok(after < before / 3);
});

test('aim description uses real thickness and angle, not a hidden weakpoint or power gauge', () => {
  const thin = aimDescription({ name: '薄いプレート' }, { incidence: 1, energy: 5 }, 'pick', 0.12);
  const thick = aimDescription({ name: '太い柱' }, { incidence: 0.2, energy: 0.2 }, 'hammer', 1);
  assert.match(thin, /薄い断面.*狭く深く/);
  assert.match(thick, /厚い塊.*かすめる/);
  assert.match(aimDescription({ name: '板' }, { incidence: 0, energy: 0 }, 'hammer', 0.3), /角度を変える/);
  assert.equal(aimDescription(null, null, 'hammer'), '');
});

test('latest-shot readout can settle, resume on delayed contacts, and reset without touching the best score', () => {
  const readout = new StrikeReadout();
  assert.match(readout.update(0, false, 0), /仕込み/);
  readout.strike(1, 1);
  readout.update(0, true, 1.5);
  assert.equal(readout.phase, 'chain');
  assert.match(readout.update(0, false, 2), /床破砕なし/);
  assert.equal(readout.phase, 'settled');
  assert.match(readout.update(35, true, 3), /35.0%/);
  assert.equal(readout.phase, 'chain', 'a late physical event reopens the readout');
  readout.update(35, false, 4);
  assert.equal(readout.phase, 'settled');
  readout.strike(2, 4);
  assert.match(readout.update(0, false, 5), /一撃 #2.*0.0%/);
  readout.reset();
  assert.equal(readout.id, 0);
  assert.equal(readout.phase, 'ready');
});

test('new layouts get their own record without modifying unchanged stages or deleting old scores', () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  let id = 0;
  const ranking = new BestShotRanking(storage, () => String(++id));
  const old = parseStagePrompt('panel'),
    current = makeStage(old).spec;
  assert.notEqual(stageRankingKey(old), stageRankingKey(current));
  ranking.begin(old);
  ranking.strike(1, 'hammer');
  ranking.update(new Map([[1, 0.7]]), 1);
  ranking.begin(current);
  assert.equal(ranking.entries.length, 0);
  ranking.begin(old);
  assert.equal(ranking.entries[0].score, 70);
  const castle = parseStagePrompt('castle');
  assert.equal(stageRankingKey(castle), stageRankingKey(makeStage(castle).spec));
});

test('floor fracture scoring and splitting are independent of 30, 60 or 120 render updates per second', async () => {
  await FractureWorld.init();
  const results = [];
  for (const hz of [30, 60, 120]) {
    const world = new FractureWorld();
    try {
      world.reset(makeStage(parseStagePrompt('keyboard')).solids, []);
      for (let i = 0; i < hz; i++) world.step(1 / hz);
      const support = [...world.pieces.values()].find((p) => p.name === '吊り首');
      const point = [support.center[0], support.center[1], support.max[2]],
        n = [0, 0, 1];
      const surface = contactSurface(world.worldFaces(support), point, n);
      world.hit(support.id, point, solveContact('hammer', n, [-0.4, -0.5, -1], surface.thickness, surface));
      for (let i = 0; i < hz * 8; i++) world.step(1 / hz);
      results.push({ score: world.snapshot().floorFracture.bestPercent, secondary: world.secondary });
    } finally {
      world.events.free();
      world.world.free();
    }
  }
  assert.ok(results[0].score > 25);
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
});
