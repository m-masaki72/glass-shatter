import { parsePrompt } from './shatter-core.js';
import { SHAPES } from './shatter-catalog.js';
import { makeGate } from './shatter-lab-gate.js';
import { makeHangingDisplay } from './shatter-lab-display.js';
import { makeOrnamentStage } from './shatter-lab-ornaments.js';
import { makeStructureStage } from './shatter-lab-structure.js';
import { SUPPORT_STAGES, makeSupportStage } from './shatter-lab-support-stages.js';
import { EXTRA_SUPPORT_STAGES, makeExtraSupportStage } from './shatter-lab-support-stages-extra.js';
import { STRATEGY_STAGES, makeStrategyStage } from './shatter-lab-strategy-stages.js';
import { bundledColumn } from './shatter-lab-bundles.js';
import { block, prism, normal, dot, sub, mean, solidInfo } from './shatter-lab-solid.js';

const authoredStages = [...STRATEGY_STAGES, ...SUPPORT_STAGES, ...EXTRA_SUPPORT_STAGES];

export function parseStagePrompt(text) {
  const spec = parsePrompt(text, 'clear');
  if (spec.material !== 'glass')
    throw new Error('この試作はガラス専用です。木材・チョコは旧プロトタイプで遊べます。');
  const supportStage = authoredStages.find(({ pattern }) => pattern.test(text.normalize('NFKC')));
  if (supportStage) return { ...spec, type: supportStage.id, name: supportStage.name };
  if (/大落下|cascade/i.test(text)) return { ...spec, type: 'cascade', name: '大落下の展示台' };
  if (/構造標本|structure/i.test(text)) return { ...spec, type: 'structure', name: '厚みと支持の構造標本' };
  if (!SHAPES.some(({ pattern }) => pattern.test(spec.text.normalize('NFKC').toLowerCase())))
    throw new Error('まだ対応していない形です。城・ビル・ツボ・キーボード・携帯電話などから選んでください。');
  return spec;
}

function shellSection(y0, y1, r0, r1, a, b, thickness) {
  const points = [y0, y1].flatMap((y, layer) => {
    const radius = layer ? r1 : r0;
    return [radius, radius - thickness].flatMap((r) =>
      [a, b].map((t) => [Math.cos(t) * r, y, Math.sin(t) * r]),
    );
  });
  const center = mean(points);
  return [
    [0, 1, 5, 4],
    [2, 6, 7, 3],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
    [0, 2, 3, 1],
    [4, 5, 7, 6],
  ].map((indices) => {
    const face = { points: indices.map((i) => points[i]), tag: 'polished' };
    if (dot(normal(face), sub(mean(face.points), center)) < 0) face.points.reverse();
    return face;
  });
}

function vessel(bottle) {
  const profile = bottle
    ? [
        [0.18, 0.75],
        [0.5, 0.9],
        [2.25, 0.9],
        [2.65, 0.36],
        [3.5, 0.36],
        [3.64, 0.43],
      ]
    : [
        [0.18, 0.65],
        [0.65, 1],
        [1.6, 1.2],
        [2.4, 0.85],
        [3.2, 0.5],
        [3.48, 0.72],
      ];
  const solids = [{ faces: block(0, 0, profile[0][1] * 2, 0.18, profile[0][1] * 2), name: '底' }];
  for (let layer = 1; layer < profile.length; layer++) {
    const [y0, r0] = profile[layer - 1],
      [y1, r1] = profile[layer];
    for (let i = 0; i < 12; i++)
      solids.push({
        faces: shellSection(y0, y1, r0, r1, (i * Math.PI) / 6, ((i + 1) * Math.PI) / 6, 0.14),
        name: layer === profile.length - 1 ? '口縁' : '器の壁',
      });
  }
  return solids;
}

function building(tower) {
  const solids = [],
    floors = tower ? 6 : 4,
    width = tower ? 1.55 : 2.7,
    depth = tower ? 1.55 : 1.8;
  const put = (faces, name) => solids.push({ faces, name });
  if (tower) put(block(0, 0, width + 0.35, 0.18, depth + 0.35), '基礎');
  else
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        put(block(x * (width / 2 + 0.3), 0, 0.5, 0.18, 0.5, z * (depth / 2 - 0.16)), '独立フーチング');
  for (let level = 0; level < floors; level++) {
    const y = 0.18 + level * 0.82;
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        const px = x * (width / 2 - 0.16),
          pz = z * (depth / 2 - 0.16);
        if (!tower && level === 0) {
          solids.push(
            ...bundledColumn({
              x: x * (width / 2 + 0.3),
              bottom: y,
              width: 0.28,
              height: 0.54,
              depth: 0.28,
              z: pz,
              name: `${x < 0 ? '左' : '右'}${z > 0 ? '前' : '奥'}束ね柱`,
              // Keep collar contact above the support-area threshold even at the smallest scale.
              strandRatio: 0.34,
            }),
          );
          put(
            block(x * (width / 2 + 0.07), y + 0.54, 0.74, 0.12, 0.32, pz, 0.012),
            `${x < 0 ? '左' : '右'}${z > 0 ? '前' : '奥'}束ね柱・厚い持送り`,
          );
        } else put(block(px, y, 0.28, 0.66, 0.28, pz), '支柱');
      }
    put(block(0, y + 0.66, width, 0.16, depth), '床スラブ');
  }
  return solids;
}

function keyboard() {
  const solids = [{ faces: block(0, 0, 4.8, 0.24, 1.8), name: 'キーボードの基板' }];
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 10; col++) {
      if (row === 0 && col > 2 && col < 7) continue;
      const space = row === 0 && col === 2;
      solids.push({
        faces: block(
          space ? -0.225 : (col - 4.5) * 0.45,
          0.24,
          space ? 2.18 : 0.38,
          0.32,
          0.34,
          (row - 1.5) * 0.4,
        ),
        name: space ? 'スペースキー' : 'キー',
      });
    }
  return solids;
}

function phone() {
  const solids = [],
    put = (faces, name) => solids.push({ faces, name });
  put(block(0, 0, 1.8, 0.22, 0.4), '下部フレーム');
  for (const x of [-0.81, 0.81]) put(block(x, 0.22, 0.18, 3.18, 0.4), '側面フレーム');
  put(block(0, 3.4, 1.8, 0.2, 0.4), '上部フレーム');
  put(block(0, 0.22, 1.44, 3.18, 0.06, -0.17, 0.008), '背面パネル');
  put(block(0, 0.22, 1.44, 3.18, 0.06, 0.17, 0.008), '画面');
  put(block(0, 0.22, 1.1, 2.1, 0.24, 0, 0.018), '内部ブロック');
  return solids;
}

function ornament(type) {
  if (type === 'panel') return [{ faces: block(0, 0, 3.5, 2.7, 0.2), name: 'ガラス板' }];
  if (type === 'diamond')
    return [
      {
        faces: prism(
          [
            [-0.45, 0],
            [0.45, 0],
            [1.5, 1.5],
            [0.9, 2.5],
            [-0.9, 2.5],
            [-1.5, 1.5],
          ],
          1.2,
        ),
        name: '宝石',
      },
    ];
  const points =
    type === 'star'
      ? Array.from({ length: 10 }, (_, i) => {
          const a = Math.PI / 2 + (i * Math.PI) / 5,
            r = i % 2 ? 0.72 : 1.6;
          return [Math.cos(a) * r, 1.6 + Math.sin(a) * r];
        })
      : Array.from({ length: 24 }, (_, i) => {
          const a = (i * Math.PI * 2) / 24;
          return [
            Math.pow(Math.sin(a), 3) * 1.6,
            1.7 + (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 10,
          ];
        }).reverse();
  const bottom = Math.min(...points.map((p) => p[1]));
  for (const p of points) p[1] -= bottom;
  const center = [0, 1.3],
    solids = [];
  for (let i = 0; i < points.length; i++)
    solids.push({
      faces: prism([center, points[i], points[(i + 1) % points.length]], 0.5),
      name: type === 'star' ? '星のカット' : 'ハートのカット',
    });
  return solids;
}

export function makeStage(spec) {
  const authored =
    spec.type === 'structure'
      ? makeStructureStage()
      : (makeStrategyStage(spec.type) ?? makeSupportStage(spec.type) ?? makeExtraSupportStage(spec.type));
  const object =
    authored?.solids ??
    (spec.type === 'cascade'
      ? [
          { faces: block(0, 0, 1.1, 0.16, 0.9), name: '台座' },
          { faces: block(0, 0.16, 0.3, 1.44, 0.3, 0, 0.012), name: '細い支え' },
          { faces: block(0, 1.6, 3.4, 0.36, 1.6), name: '大きな板' },
          ...[-1.1, 0, 1.1].map((x) => ({ faces: block(x, 1.96, 0.68, 0.72, 0.68), name: '展示クリスタル' })),
        ]
      : spec.type === 'castle'
        ? makeGate()
        : spec.type === 'vase' || spec.type === 'bottle'
          ? vessel(spec.type === 'bottle')
          : spec.type === 'building' || spec.type === 'tower'
            ? building(spec.type === 'tower')
            : spec.type === 'keyboard'
              ? keyboard()
              : spec.type === 'phone'
                ? phone()
                : ornament(spec.type));
  const display =
      authored ??
      (['keyboard', 'phone'].includes(spec.type)
        ? makeHangingDisplay(spec.type, object)
        : makeOrnamentStage(spec.type, object)),
    source = display?.solids ?? object;
  const baseBounds = boundsOf(source),
    width = (baseBounds.max[0] - baseBounds.min[0]) * spec.size,
    depth = (baseBounds.max[2] - baseBounds.min[2]) * spec.size,
    columns = Math.min(3, spec.count),
    rows = Math.ceil(spec.count / columns);
  const solids = [],
    centers = [];
  for (let item = 0; item < spec.count; item++) {
    const x = ((item % columns) - (columns - 1) / 2) * (width + 0.7);
    const z = (Math.floor(item / columns) - (rows - 1) / 2) * (depth + 0.9);
    centers.push({ x, z });
    for (const part of source)
      solids.push({
        ...part,
        faces: part.faces.map((f) => ({
          ...f,
          points: f.points.map(([px, py, pz]) => [px * spec.size + x, py * spec.size, pz * spec.size + z]),
        })),
      });
  }
  return {
    spec: authoredStages.some(({ id }) => id === spec.type)
      ? {
          ...spec,
          layoutVersion: authoredStages.find(({ id }) => id === spec.type).layoutVersion ?? 'supports-v1',
        }
      : ['panel', 'diamond', 'star', 'heart', 'structure', 'building'].includes(spec.type)
        ? {
            ...spec,
            layoutVersion:
              spec.type === 'structure'
                ? 'structure-bundle-v2'
                : spec.type === 'building'
                  ? 'building-bundle-v1'
                  : 'drop-v2',
          }
        : spec,
    solids,
    centers,
    bounds: boundsOf(solids),
    title:
      spec.type === 'cascade'
        ? '大落下の展示台'
        : spec.type === 'structure'
          ? '構造標本'
          : [...authoredStages, ...SHAPES].find((s) => s.id === spec.type).name,
    hint:
      display?.hint ??
      (spec.type === 'building'
        ? '1階は4本ずつ束ねた細柱。柱を間引くか、根元の接合カラーをまとめて欠くか。外側の支持を断ち、上階の大きな床を地面へ落とそう。'
        : undefined),
    viewElevation: display?.viewElevation ?? (spec.type === 'building' ? 0.32 : undefined),
  };
}

function boundsOf(solids) {
  const info = solids.map((p) => solidInfo(p.faces));
  return {
    min: [0, 1, 2].map((i) => Math.min(...info.map((p) => p.min[i]))),
    max: [0, 1, 2].map((i) => Math.max(...info.map((p) => p.max[i]))),
  };
}
