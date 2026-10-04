import { add, sub, mul, dot, cross, unit, solidInfo, splitSolid } from './shatter-lab-solid.js';

export const FLOOR_BREAKUP = {
  speed: 0.3,
  impulse: 0.018,
  massImpulse: 0.28,
  minVolume: 0.009,
  density: 2.5,
};

export function landingFracture(faces, point, normal, impulse, seed = 1, density = 1) {
  let state = (seed + 1) >>> 0;
  const random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
  const n = unit(normal);
  const u = unit(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const v = cross(n, u);
  const information = new Map();
  const infoFor = (f) => {
    if (!information.has(f)) information.set(f, solidInfo(f));
    return information.get(f);
  };
  const total = infoFor(faces).volume;
  const target = Math.min(
    density > 2 ? 32 : density > 1 ? 18 : 14,
    Math.max(4, Math.ceil((5 + Math.log1p(impulse) * 2) * density)),
  );
  const chunks = [faces];
  for (let i = 0; chunks.length < target && i < target * 3; i++) {
    const ranked = chunks
      .map((f, index) => {
        const info = infoFor(f);
        return { index, info, score: info.volume / (0.2 + Math.hypot(...sub(info.center, point))) };
      })
      .filter(({ info }) => info.volume > Math.max(0.0018, total * 0.015));
    ranked.sort((a, b) => b.score - a.score);
    if (!ranked.length) break;
    const { index, info } = ranked[Math.min(ranked.length - 1, i % 4 === 3 ? 1 : 0)];
    const angle = i * 2.39996 + random() * 0.65;
    const axis = unit(
      add(add(mul(u, Math.cos(angle)), mul(v, Math.sin(angle))), mul(n, (random() - 0.5) * 0.9)),
    );
    // Bias the cut toward the impact without moving it outside the convex piece.
    const centerWeight = 0.58 + random() * 0.3;
    const d = dot(axis, add(mul(info.center, centerWeight), mul(point, 1 - centerWeight)));
    const parts = splitSolid(chunks[index], axis, d);
    if (parts.length === 2 && parts.every((f) => infoFor(f).volume > 0.00012))
      chunks.splice(index, 1, ...parts);
  }
  return chunks;
}
