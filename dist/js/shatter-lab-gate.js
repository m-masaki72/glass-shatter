import { block, prism, clipSolid, unit, dot } from './shatter-lab-solid.js';

export function makeGate() {
  const solids = [];
  const put = (faces, name) => solids.push({ faces, name });
  for (const side of [-1, 1]) {
    const x = side * 1.3;
    put(block(x, 0, 1.02, 0.22, 0.95), '台座');
    put(block(x, 0.22, 0.72, 2.35, 0.62), '支柱');
    put(block(x, 2.57, 1.02, 0.24, 0.91), '柱頭');
    for (const z of [-0.31, 0.31])
      for (const offset of [-0.22, 0.22]) put(block(x + offset, 0.28, 0.09, 2.22, 0.12, z, 0.02), '柱の稜線');
    put(block(x, 2.81, 0.8, 0.72, 0.72), '塔');
    let roof = prism(
      [
        [x - 0.58, 3.53],
        [x + 0.58, 3.53],
        [x, 4.28],
      ],
      0.88,
    );
    const n = unit([0, 1, 1]);
    roof = clipSolid(roof, n, dot(n, [x, 4.25, 0]), 'polished');
    put(roof, '尖塔');
  }
  put(block(0, 2.81, 1.88, 0.35, 0.54), '横梁');
  for (const x of [-0.73, 0, 0.73]) put(block(x, 3.16, 0.32, 0.34, 0.54), '胸壁');
  for (let i = 0; i < 9; i++) {
    const a = (i * Math.PI) / 9,
      b = ((i + 1) * Math.PI) / 9;
    const xy = (r, t) => [Math.cos(t) * r, 1.66 + Math.sin(t) * r];
    put(prism([xy(0.94, a), xy(1.1, a), xy(1.1, b), xy(0.94, b)], 0.36), 'アーチ');
  }
  return solids;
}
