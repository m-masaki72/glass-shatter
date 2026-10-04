import { block } from './shatter-lab-solid.js';

export function bundledColumn({ x, bottom, width, height, depth, z = 0, name, strandRatio = 0.3 }) {
  // Each post really touches both collars; the gaps must not create lateral support bonds.
  const collar = Math.min(0.12, height * 0.14),
    strandWidth = width * strandRatio,
    strandDepth = depth * strandRatio,
    solids = [
      { faces: block(x, bottom, width, collar, depth, z, 0.012), name: `${name}・下カラー` },
      {
        faces: block(x, bottom + height - collar, width, collar, depth, z, 0.012),
        name: `${name}・上カラー`,
      },
    ];
  for (const front of [-1, 1])
    for (const side of [-1, 1])
      solids.push({
        faces: block(
          x + (side * (width - strandWidth)) / 2,
          bottom + collar,
          strandWidth,
          height - collar * 2,
          strandDepth,
          z + (front * (depth - strandDepth)) / 2,
          0.006,
        ),
        name: `${name}・${front > 0 ? '前' : '奥'}${side > 0 ? '右' : '左'}細柱`,
      });
  return solids;
}
