import { block, prism, solidInfo } from './shatter-lab-solid.js';

const piece = (faces, name) => ({ faces, name });
const move = (parts, transform) =>
  parts.map((part) => ({
    ...part,
    faces: part.faces.map((face) => ({ ...face, points: face.points.map(transform) })),
  }));

function bridge() {
  return {
    solids: [
      ...[-1, 1].flatMap((side) => [
        piece(block(side * 2.15, 0, 0.7, 0.16, 1.5, 1.4), '橋台の足'),
        piece(block(side * 2.15, 0.16, 0.3, 1.74, 0.6, 1.4), '橋台'),
        piece(
          block(side * 1.86, 1.74, 0.38, 0.16, 0.4, 1.4, 0.008),
          side < 0 ? '橋の左連結部' : '橋の右連結部',
        ),
      ]),
      ...[0.12, 0.26, 0.52].map((thickness, index) =>
        piece(
          block(((index - 1) * 3.5) / 3, 1.9 - thickness, 3.5 / 3, thickness, 2.7),
          ['薄い橋板', '橋の中厚板', '厚い橋板'][index],
        ),
      ),
    ],
    hint: '薄板・中厚板・厚板の橋。左右の細い連結部を削って仕込み、残る支えを断って厚みの違う3枚を床へ落とそう。',
    viewElevation: 0.43,
  };
}

function cantilever(parts) {
  return {
    solids: [
      piece(block(-2.15, 0, 0.8, 0.16, 1.0), '宝石の展示台座'),
      piece(block(-2.15, 0.16, 0.4, 1.96, 0.42), '宝石の側方支柱'),
      piece(block(-1.375, 1.9, 1.25, 0.22, 0.22, 0, 0.008), '宝石の細い横腕'),
      ...move(parts, ([x, y, z]) => [x, y + 1.5, z]),
    ],
    hint: '宝石は左の支柱から伸びた細い横腕だけで固定されています。横腕の中央を断つと、下を塞がれずに大きな塊が落ちます。',
    viewElevation: 0.33,
  };
}

function mergeHeartCuts(parts) {
  const polygons = [];
  for (const part of parts) {
    const next = part.faces[0].points.map(([x, y]) => [x, y]),
      previous = polygons.at(-1),
      joined = previous ? [...previous, next.at(-1)] : next;
    const convex = joined.every((point, i) => {
      const b = joined[(i + 1) % joined.length],
        c = joined[(i + 2) % joined.length];
      return (b[0] - point[0]) * (c[1] - b[1]) - (b[1] - point[1]) * (c[0] - b[0]) >= -1e-7;
    });
    if (previous && convex) polygons[polygons.length - 1] = joined;
    else polygons.push(next);
  }
  return polygons.map((polygon) => piece(prism(polygon, 0.5), 'ハートの面'));
}

function pendant(type, parts) {
  const raised = move(type === 'heart' ? mergeHeartCuts(parts) : parts, ([x, y, z]) => [x, y + 1.25, z]),
    top = Math.max(...raised.map((part) => solidInfo(part.faces).max[1])),
    neckBottom = type === 'star' ? top - 0.16 : 4.1,
    frame = [];
  for (const side of [-1, 1]) {
    frame.push(piece(block(side * 2.1, 0, 0.62, 0.16, 0.85), 'オーナメント架台の足'));
    frame.push(piece(block(side * 2.1, 0.16, 0.24, 2.39, 0.24, 0, 0.012), 'オーナメント架台の柱'));
  }
  for (let segment = 0; segment < 16; segment++) {
    const a = (segment * Math.PI) / 16,
      b = ((segment + 1) * Math.PI) / 16,
      point = (radius, angle) => [Math.cos(angle) * radius, 2.55 + Math.sin(angle) * radius];
    frame.push(
      piece(
        prism([point(1.98, a), point(2.22, a), point(2.22, b), point(1.98, b)], 0.24),
        'オーナメントのアーチ',
      ),
    );
  }
  if (type === 'heart') frame.push(piece(block(0, 3.33, 0.18, 0.77, 0.22, 0, 0.008), 'ハートの吊り飾り'));
  frame.push(
    piece(
      block(0, neckBottom, 0.22, 4.65 - neckBottom, 0.22, 0, 0.008),
      type === 'star' ? '星の吊り首' : 'ハートの吊り首',
    ),
  );
  return {
    solids: [...frame, ...raised],
    hint:
      type === 'star'
        ? 'アーチから下がる細い吊り首を狙おう。上の接続を断つと、星のカットがまとまって床へ降り注ぎます。'
        : 'ハートを吊っている中央上の細い首を狙おう。飾りの接続を断つと、ハート全体が床へ落ちます。',
    viewElevation: 0.32,
  };
}

export function makeOrnamentStage(type, parts) {
  if (type === 'panel') return bridge();
  if (type === 'diamond') return cantilever(parts);
  if (type === 'star' || type === 'heart') return pendant(type, parts);
  return null;
}
