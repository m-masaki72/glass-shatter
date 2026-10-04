import { block, prism } from './shatter-lab-solid.js';

export const SUPPORT_STAGES = [
  { id: 'canopy', name: '大屋根', pattern: /大屋根|canopy/i },
  { id: 'colonnade', name: 'ガラス回廊', pattern: /回廊|colonnade/i },
  { id: 'crown', name: '王冠の祭壇', pattern: /王冠|祭壇|crown/i },
];

function pier(solids, { x, z, height, width = 0.22, depth = 0.24, name }) {
  solids.push({ faces: block(x, 0, 0.5, 0.16, 0.5, z), name: `${name}・足` });
  const segment = (height - 0.16) / 3;
  for (let i = 0; i < 3; i++)
    solids.push({
      faces: block(x, 0.16 + i * segment, width, segment, depth, z, 0.008),
      name: `${name}・${['下段', '中段', '上段'][i]}`,
    });
}

export function makeSupportStage(type) {
  if (!SUPPORT_STAGES.some((stage) => stage.id === type)) return null;
  const solids = [],
    put = (faces, name) => solids.push({ faces, name });
  if (type === 'canopy') {
    for (const side of [-1, 1])
      for (const [i, z] of [-0.78, 0, 0.78].entries()) {
        const name = `大屋根・${side < 0 ? '左' : '右'}${['奥', '中央', '前'][i]}支柱`;
        pier(solids, { x: side * 2.65, z, height: 2.3, width: 0.18 + i * 0.045, name });
        put(block(side * 2.55, 2.3, 0.6, 0.34, 0.34, z, 0.008), `${name}・持送り`);
      }
    for (const [i, height] of [0.16, 0.34, 0.24].entries())
      put(block((i - 1) * 1.5, 2.64 - height, 1.5, height, 2.0), `大屋根の${['薄板', '厚板', '中厚板'][i]}`);
    for (let i = 0; i < 5; i++)
      put(block((i - 2) * 0.78, 2.64, 0.52, 0.44 + (i % 2) * 0.42, 0.68), '屋根上の大結晶');
    return {
      solids,
      viewElevation: 0.32,
      hint: '左右3本ずつ、計6本の支柱。細い柱から削るか、厚い持送りを欠くか。最後の支持を断つと、厚みの違う大屋根と結晶が落下します。',
    };
  }
  if (type === 'colonnade') {
    for (const front of [-1, 1])
      for (const [i, x] of [-1.65, -0.55, 0.55, 1.65].entries()) {
        const name = `回廊・${front > 0 ? '手前' : '奥'}${i + 1}番支柱`;
        pier(solids, { x, z: front * 1.3, height: 2.06, width: i % 2 ? 0.28 : 0.18, depth: 0.24, name });
        put(block(x, 2.06, 0.36, 0.28, 0.75, front * 1.175, 0.008), `${name}・持送り`);
      }
    for (const side of [-1, 1]) {
      put(
        block(side * 1.1, 2.06, 2.2, side < 0 ? 0.28 : 0.2, 1.6),
        `回廊の${side < 0 ? '厚い' : '薄い'}大梁`,
      );
      const top = side < 0 ? 2.34 : 2.26;
      for (const x of [side * 0.45, side * 1.75]) put(block(x, top, 0.28, 0.72, 0.55), '回廊上の小柱');
      put(block(side * 1.1, top + 0.72, 1.58, 0.12, 0.7), '回廊上の薄い天板');
    }
    return {
      solids,
      viewElevation: 0.34,
      hint: '手前4本・奥4本の列柱。細い柱と太い柱を削り、左右につながる大梁の支持を減らそう。手前だけを壊しても奥の柱が残ります。',
    };
  }
  for (const side of [-1, 1])
    for (const [i, z] of [0.38, 0.98].entries()) {
      const name = `祭壇・${side < 0 ? '左' : '右'}${i ? '前' : '奥'}支柱`;
      pier(solids, { x: side * 2.3, z, height: 2.4, width: i ? 0.26 : 0.19, name });
      put(block(side * 2.275, 2.4, 0.75, 0.24, 0.34, z, 0.008), `${name}・持送り`);
    }
  for (const side of [-1, 1]) {
    const name = `祭壇・背面${side < 0 ? '左' : '右'}支柱`;
    pier(solids, { x: side * 0.42, z: -1.65, height: 2.4, width: 0.22, depth: 0.26, name });
    put(block(side * 0.42, 2.4, 0.34, 0.24, 0.8, -1.65, 0.008), `${name}・持送り`);
  }
  put(block(0, 2.4, 3.8, 0.3, 2.5), '王冠の厚い祭壇');
  for (const front of [-1, 1])
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.72;
      put(
        prism(
          [
            [x - 0.32, 2.7],
            [x + 0.32, 2.7],
            [x, 3.35 + (i % 2) * 0.35],
          ],
          0.18,
          front * 0.96,
        ),
        '王冠の尖った薄板',
      );
    }
  put(block(0, 2.7, 0.9, 0.82, 0.9), '王冠の中心結晶');
  return {
    solids,
    viewElevation: 0.38,
    hint: '左右に2本ずつ、背面に2本。王冠を支える6本を削ろう。最後に残す支柱を選び、厚い祭壇と薄い王冠をまとめて床へ。',
  };
}
