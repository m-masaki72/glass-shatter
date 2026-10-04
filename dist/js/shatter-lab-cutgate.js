import { block, prism } from './shatter-lab-solid.js';

export function makeCutgateStage() {
  const solids = [],
    put = (faces, name) => solids.push({ faces, name });
  for (const side of [-1, 1]) {
    const label = side < 0 ? '左' : '右';
    put(block(side * 2.52, 0, 0.86, 0.18, 1.1, 0.9), `門・${label}の足`);
    put(block(side * 2.52, 0.18, 0.62, 1.56, 0.76, 0.9), `門・${label}の外柱`);
    put(block(side * 2.4, 1.74, 0.9, 0.18, 0.9, 0.9), `門・${label}の受け台`);
  }
  put(block(-2.26, 1.92, 0.58, 0.78, 0.2, 1.02, 0.009), '門・薄い板状接合');
  put(block(2.26, 1.92, 0.8, 0.78, 1.05, 1.02, 0.012), '門・厚い角形接合');
  put(block(-1.38, 2.7, 1.4, 0.18, 2.08, 0, 0.01), '門の薄い天板');
  put(block(0, 2.7, 1.36, 0.4, 2.08, 0, 0.012), '門の厚い梁');
  put(block(1.38, 2.7, 1.4, 0.62, 2.08, 0, 0.015), '門の大きな端塊');
  put(
    prism(
      [
        [-0.95, 3.1],
        [0.95, 3.1],
        [0.6, 3.84],
        [-0.6, 3.84],
      ],
      0.98,
    ),
    '門の冠結晶',
  );
  return {
    solids,
    viewElevation: 0.3,
    hint: '左右の接合は、薄く広い板と奥行きのある角形。正面を広く欠くか、横から切り残しを狙うか。残った断面を見て、大きな梁を床へ落とそう。',
  };
}
