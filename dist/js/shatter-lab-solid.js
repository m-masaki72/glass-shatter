const EPS = 1e-6;
export const add = (a, b) => a.map((x, i) => x + b[i]);
export const sub = (a, b) => a.map((x, i) => x - b[i]);
export const mul = (a, s) => a.map((x) => x * s);
export const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const unit = (a) => mul(a, 1 / (Math.hypot(...a) || 1));
export const mean = (points) => mul(points.reduce(add, [0, 0, 0]), 1 / points.length);
export function normal(face) {
  for (let i = 1; i < face.points.length - 1; i++) {
    const n = cross(sub(face.points[i], face.points[0]), sub(face.points[i + 1], face.points[0]));
    if (Math.hypot(...n) > EPS * EPS) return unit(n);
  }
  return [0, 0, 0];
}

export function unique(points) {
  const out = [];
  for (const p of points) if (!out.some((q) => Math.hypot(...sub(p, q)) < EPS * 10)) out.push(p);
  return out;
}

export function solidInfo(faces) {
  const vertices = unique(faces.flatMap((f) => f.points));
  if (vertices.length < 4) return { volume: 0, center: [0, 0, 0], vertices };
  const origin = mean(vertices);
  let volume = 0,
    weighted = [0, 0, 0];
  for (const f of faces)
    for (let i = 1; i < f.points.length - 1; i++) {
      const [a, b, c] = [f.points[0], f.points[i], f.points[i + 1]];
      const v = Math.abs(dot(sub(a, origin), cross(sub(b, origin), sub(c, origin)))) / 6;
      volume += v;
      weighted = add(weighted, mul(mean([origin, a, b, c]), v));
    }
  return {
    volume,
    center: volume ? mul(weighted, 1 / volume) : origin,
    vertices,
    min: [0, 1, 2].map((i) => Math.min(...vertices.map((v) => v[i]))),
    max: [0, 1, 2].map((i) => Math.max(...vertices.map((v) => v[i]))),
  };
}

export function clipSolid(faces, n, d, tag = 'cut') {
  const distances = faces.flatMap((f) => f.points.map((p) => dot(n, p) - d));
  if (Math.max(...distances) <= EPS) return faces;
  if (Math.min(...distances) >= -EPS) return null;
  const output = [],
    cap = [];
  for (const face of faces) {
    const points = [];
    for (let i = 0; i < face.points.length; i++) {
      const a = face.points[i],
        b = face.points[(i + 1) % face.points.length];
      const da = dot(n, a) - d,
        db = dot(n, b) - d;
      if (da <= EPS) points.push(a);
      if ((da < -EPS && db > EPS) || (da > EPS && db < -EPS)) {
        const p = add(a, mul(sub(b, a), da / (da - db)));
        points.push(p);
        cap.push(p);
      } else if (Math.abs(da) <= EPS) cap.push(a);
    }
    const clean = unique(points);
    if (clean.length >= 3 && faceArea(clean) > EPS * EPS) output.push({ points: clean, tag: face.tag });
  }
  const points = unique(cap);
  if (points.length >= 3) {
    const center = mean(points),
      u = unit(sub(points[0], center)),
      v = cross(n, u);
    points.sort(
      (a, b) =>
        Math.atan2(dot(sub(a, center), v), dot(sub(a, center), u)) -
        Math.atan2(dot(sub(b, center), v), dot(sub(b, center), u)),
    );
    output.push({ points, tag });
  }
  return solidInfo(output).volume > 1e-7 ? output : null;
}

export function splitSolid(faces, n, d) {
  return [clipSolid(faces, n, d), clipSolid(faces, mul(n, -1), -d)].filter(Boolean);
}

export function prism(polygon, depth, z = 0) {
  const front = polygon.map((p) => [p[0], p[1], z + depth / 2]);
  const back = polygon.map((p) => [p[0], p[1], z - depth / 2]);
  return [
    { points: front, tag: 'polished' },
    { points: [...back].reverse(), tag: 'polished' },
    ...polygon.map((_, i) => ({
      points: [front[i], back[i], back[(i + 1) % polygon.length], front[(i + 1) % polygon.length]],
      tag: 'polished',
    })),
  ];
}

export function block(x, bottom, width, height, depth, z = 0, bevel = 0.025) {
  let faces = prism(
    [
      [x - width / 2, bottom],
      [x + width / 2, bottom],
      [x + width / 2, bottom + height],
      [x - width / 2, bottom + height],
    ],
    depth,
    z,
  );
  const center = [x, bottom + height / 2, z],
    half = [width / 2, height / 2, depth / 2];
  for (let a = 0; a < 3; a++)
    for (let b = a + 1; b < 3; b++)
      for (const sa of [-1, 1])
        for (const sb of [-1, 1]) {
          const n = [0, 0, 0];
          n[a] = sa / Math.SQRT2;
          n[b] = sb / Math.SQRT2;
          faces = clipSolid(faces, n, dot(n, center) + (half[a] + half[b] - bevel) / Math.SQRT2, 'bevel');
        }
  return faces;
}

export function carveSolid(faces, planes) {
  const retained = [];
  let core = faces;
  for (const { n, d } of planes) {
    if (!core) break;
    const outside = clipSolid(core, mul(n, -1), -d);
    if (outside) retained.push(outside);
    core = clipSolid(core, n, d);
  }
  return { retained, core };
}

export function faceArea(points) {
  let area = 0;
  for (let i = 1; i < points.length - 1; i++)
    area += Math.hypot(...cross(sub(points[i], points[0]), sub(points[i + 1], points[0]))) / 2;
  return area;
}

export function connectionArea(a, b, tolerance = 0.045) {
  if ([0, 1, 2].some((i) => a.min[i] > b.max[i] + tolerance || b.min[i] > a.max[i] + tolerance)) return 0;
  let area = 0;
  const overlap = [0, 1, 2].map((i) => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]));
  if (Math.min(...overlap) > 0.001) {
    let intersection = a.faces;
    for (const f of b.faces) {
      const n = normal(f);
      intersection = clipSolid(intersection, n, dot(n, f.points[0]));
      if (!intersection) break;
    }
    if (intersection) area = solidInfo(intersection).volume / Math.min(...overlap);
  }
  for (const fa of a.faces)
    for (const fb of b.faces) {
      const n = normal(fa);
      if (dot(n, normal(fb)) > -0.995 || Math.abs(dot(n, sub(fb.points[0], fa.points[0]))) > tolerance)
        continue;
      let polygon = fb.points;
      for (let i = 0; i < fa.points.length && polygon.length; i++) {
        const p = fa.points[i],
          q = fa.points[(i + 1) % fa.points.length],
          edge = unit(cross(sub(q, p), n));
        const next = [];
        for (let j = 0; j < polygon.length; j++) {
          const s = polygon[j],
            t = polygon[(j + 1) % polygon.length];
          const ds = dot(edge, sub(s, p)),
            dt = dot(edge, sub(t, p));
          if (ds <= EPS) next.push(s);
          if (ds < 0 !== dt < 0) next.push(add(s, mul(sub(t, s), ds / (ds - dt))));
        }
        polygon = next;
      }
      if (polygon.length >= 3) area = Math.max(area, faceArea(polygon));
    }
  return area;
}
