import { block, prism } from './shatter-lab-solid.js';

export const EXTRA_SUPPORT_STAGES = [
  { id: 'halo', name: '浮遊リング', pattern: /浮遊リング|水晶環|halo/i },
  { id: 'stairbridge', name: '階段大橋', pattern: /階段大橋|階段橋|stairbridge/i },
  { id: 'lanterns', name: '双子の吊り灯', pattern: /双子の吊り灯|吊り灯|lanterns/i },
];

const transform = (faces, map) => faces.map((face) => ({ ...face, points: face.points.map(map) }));
const turn = (faces, angle) =>
  transform(faces, ([x, y, z]) => [
    x * Math.cos(angle) - z * Math.sin(angle),
    y,
    x * Math.sin(angle) + z * Math.cos(angle),
  ]);

function pier(solids, { x, z, height, width = 0.22, depth = 0.24, name }) {
  solids.push({ faces: block(x, 0, 0.46, 0.16, 0.46, z), name: `${name}・足` });
  const segment = (height - 0.16) / 3;
  for (let i = 0; i < 3; i++)
    solids.push({
      faces: block(x, 0.16 + i * segment, width, segment, depth, z, 0.008),
      name: `${name}・${['下段', '中段', '上段'][i]}`,
    });
}

function halo() {
  const solids = [],
    put = (faces, name) => solids.push({ faces, name });
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4,
      b = ((i + 1) * Math.PI) / 4,
      angle = (a + b) / 2,
      name = `環・${i + 1}番支柱`;
    pier(solids, {
      x: Math.cos(angle) * 2.48,
      z: Math.sin(angle) * 2.48,
      height: 2.3,
      width: i % 2 ? 0.23 : 0.19,
      depth: 0.22,
      name,
    });
    put(turn(block(2.1, 2.3, 0.92, 0.24, 0.25, 0, 0.008), angle), `${name}・横腕`);
    const point = (radius, t) => [Math.cos(t) * radius, -Math.sin(t) * radius];
    put(
      transform(
        prism([point(0.92, a), point(0.92, b), point(1.88, b), point(1.88, a)], 0.42),
        ([x, y, z]) => [x, 2.51 + z, -y],
      ),
      `浮遊リング・${i + 1}番の厚い環`,
    );
    put(
      turn(
        prism(
          [
            [1.19, 2.72],
            [1.58, 2.72],
            [1.39, 3.22 + (i % 2) * 0.28],
          ],
          0.2,
        ),
        angle,
      ),
      `浮遊リング・${i + 1}番の薄い結晶`,
    );
  }
  return {
    solids,
    viewElevation: 0.49,
    hint: '8本の外周支柱が、横腕を通して中空の環を支えます。柱の中段や横腕を順に削り、最後の支持を断つと厚い環と薄い結晶が輪になって落下します。',
  };
}

function stairbridge() {
  const solids = [],
    put = (faces, name) => solids.push({ faces, name });
  for (let step = 0; step < 6; step++) {
    const x = (step - 2.5) * 0.66,
      bottom = 1.52 + step * 0.22,
      thickness = step % 2 ? 0.44 : 0.34;
    put(
      block(x, bottom, 0.66, thickness, 1.5, 0, 0.008),
      `階段大橋・${step + 1}段目の${step % 2 ? '厚板' : '薄板'}`,
    );
    if (step % 2 === 0)
      for (const side of [-1, 1]) {
        const name = `階段・${side > 0 ? '手前' : '奥'}${step / 2 + 1}番支柱`;
        pier(solids, { x, z: side * 1.33, height: bottom, width: step === 2 ? 0.27 : 0.2, name });
        put(block(x, bottom, 0.22, 0.18, 0.82, side * 1.07, 0.008), `${name}・横腕`);
      }
  }
  put(block(1.65, 3.06, 0.5, 0.74, 0.78), '階段大橋・頂上の大結晶');
  put(block(-1.65, 1.86, 0.38, 0.5, 0.58), '階段大橋・麓の小結晶');
  return {
    solids,
    viewElevation: 0.34,
    hint: '高さの異なる段床を、手前3本・奥3本で支える階段橋。片側だけでは落ちません。最後に低い柱を残すか、高い柱を残すかを決めて、段差ごと床へ落とそう。',
  };
}

function lanterns() {
  const solids = [],
    put = (faces, name) => solids.push({ faces, name });
  for (const side of [-1, 1]) {
    const x = side * 1.65,
      top = side < 0 ? 3.05 : 3.45,
      label = side < 0 ? '左' : '右';
    for (const flank of [-1, 1])
      for (const front of [-1, 1]) {
        const name = `吊り灯・${label}${flank < 0 ? '左脚' : '右脚'}${front > 0 ? '前' : '奥'}支柱`;
        pier(solids, {
          x: x + flank * 1.03,
          z: front * 0.52,
          height: top,
          width: front > 0 ? 0.2 : 0.26,
          name,
        });
        put(block(x + flank * 0.88, top, 0.75, 0.2, 0.26, front * 0.52, 0.008), `${name}・横腕`);
      }
    put(block(x, top, 1.35, 0.18, 1.25), `双子の吊り灯・${label}の薄い天板`);
    put(block(x, top - 0.25, 0.22, 0.25, 0.22, 0, 0.008), `双子の吊り灯・${label}の吊り首`);
    put(
      prism(
        [
          [x - 0.64, top - 1.55],
          [x, top - 2.1],
          [x + 0.64, top - 1.55],
          [x + 0.64, top - 0.75],
          [x + 0.17, top - 0.25],
          [x - 0.17, top - 0.25],
          [x - 0.64, top - 0.75],
        ],
        0.98,
      ),
      `双子の吊り灯・${label}の大結晶`,
    );
  }
  return {
    solids,
    viewElevation: 0.32,
    hint: '左右の吊り灯は、それぞれ4本の柱で独立して支えられています。片方ずつ支えを仕込み、最後の柱で大結晶を落下。細い吊り首を直接断つ別ルートもあります。',
  };
}

export function makeExtraSupportStage(type) {
  if (type === 'halo') return halo();
  if (type === 'stairbridge') return stairbridge();
  if (type === 'lanterns') return lanterns();
  return null;
}
