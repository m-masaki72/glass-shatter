import {
  add,
  sub,
  mul,
  dot,
  cross,
  unit,
  normal as faceNormal,
  solidInfo,
  carveSolid,
  splitSolid,
} from './shatter-lab-solid.js';

export const CONTACT_TOOLS = {
  hammer: {
    mass: 2,
    speed: 5.2,
    width: 0.26,
    length: 0.26,
    duration: 0.007,
    spall: 1.15,
    spread: 1.2,
    taper: 0.3,
    name: 'ハンマー',
  },
  pick: {
    mass: 1.1,
    speed: 5.5,
    width: 0.065,
    length: 0.065,
    duration: 0.004,
    spall: 0.3,
    spread: 1,
    taper: 0.09,
    name: 'ピック',
  },
  bat: { mass: 0.95, speed: 5.8, width: 0.16, length: 0.65, duration: 0.012, name: 'バット' },
};

export function contactSurface(faces, point, n) {
  let thickness = Infinity,
    polygon = null;
  for (const face of faces) {
    const f = faceNormal(face),
      distance = dot(f, sub(face.points[0], point));
    if (dot(f, n) > 0.99 && Math.abs(distance) < 0.002) polygon = face.points;
    const inward = dot(f, mul(n, -1));
    if (inward > 0.0001 && distance >= -0.0001)
      thickness = Math.min(thickness, Math.max(0, distance) / inward);
  }
  return { thickness: Number.isFinite(thickness) ? thickness : 0.7, polygon, point };
}

export function contactFootprint(polygon, point, u, v, width, length) {
  let points = polygon.map((p) => [dot(sub(p, point), u), dot(sub(p, point), v)]);
  for (const [axis, sign, bound] of [
    [0, 1, length / 2],
    [0, -1, length / 2],
    [1, 1, width / 2],
    [1, -1, width / 2],
  ]) {
    const clipped = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length],
        da = a[axis] * sign - bound,
        db = b[axis] * sign - bound;
      if (da <= 0) clipped.push(a);
      if (da < 0 !== db < 0) clipped.push(a.map((x, k) => x + ((b[k] - x) * da) / (da - db)));
    }
    points = clipped;
  }
  return points.map(([x, y]) => add(point, add(mul(u, x), mul(v, y))));
}

function overlapArea(polygon, point, u, v, width, length) {
  const points = contactFootprint(polygon, point, u, v, width, length).map((p) => [
    dot(sub(p, point), u),
    dot(sub(p, point), v),
  ]);
  return (
    Math.abs(
      points.reduce((sum, a, i) => {
        const b = points[(i + 1) % points.length];
        return sum + a[0] * b[1] - a[1] * b[0];
      }, 0),
    ) / 2
  );
}

export function solveContact(tool, normal, direction, thickness = 0.7, surface = null) {
  const t = CONTACT_TOOLS[tool],
    v = unit(direction),
    n = unit(normal);
  const incidence = Math.max(0, Math.min(1, -dot(v, n)));
  let tangent = sub(v, mul(n, dot(v, n)));
  if (Math.hypot(...tangent) < 0.01) tangent = cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
  const u = tool === 'bat' ? unit(cross(n, tangent)) : unit(tangent),
    across = unit(cross(n, u));
  const normalSpeed = t.speed * incidence;
  const nominalArea = (t.width * t.length) / Math.max(0.22, incidence);
  const area = surface?.polygon
    ? Math.max(
        0.0001,
        Math.min(
          nominalArea,
          overlapArea(
            surface.polygon,
            surface.point,
            u,
            across,
            t.width,
            t.length / Math.max(0.22, incidence),
          ),
        ),
      )
    : nominalArea;
  const engaged = Math.sqrt(area / nominalArea);
  const impulse = t.mass * normalSpeed * 1.18 * engaged;
  const force = impulse / t.duration;
  const pressure = force / area;
  const energy = 0.5 * t.mass * normalSpeed * normalSpeed * engaged;
  // Effective fracture-work density is tuned for this miniature, not a measured glass constant.
  const workDensity = 460;
  const depth = Math.min(thickness, 0.035 + energy / (workDensity * area));
  const radius = Math.sqrt(area / Math.PI) + Math.sqrt(energy / workDensity) * (t.spall ?? 0.8);
  return {
    incidence,
    impulse,
    area,
    force,
    pressure,
    energy,
    depth,
    radius,
    spread: t.spread ?? (tool === 'bat' ? 2.4 : 1),
    taper: t.taper ?? 0.3,
    direction: v,
    normal: n,
    tangent: u,
  };
}

export function impactFracture(faces, point, contact, seed = 1) {
  if (contact.energy < 0.1) return null;
  let value = seed | 0;
  const random = () => {
    value = (Math.imul(value, 1664525) + 1013904223) | 0;
    return (value >>> 0) / 4294967296;
  };
  const n = contact.normal;
  let tangent = sub(contact.direction, mul(n, dot(contact.direction, n)));
  if (Math.hypot(...tangent) < 0.01) tangent = cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
  const u = contact.tangent || unit(tangent),
    v = unit(cross(n, u));
  const r = contact.radius,
    planes = [];
  for (let i = 0; i < 7; i++) {
    const angle = ((i + 0.17) * Math.PI * 2) / 7;
    const raw = add(mul(u, Math.cos(angle) / (r * contact.spread)), mul(v, Math.sin(angle) / r));
    const scale = Math.hypot(...raw),
      side = unit(add(unit(raw), mul(n, -(contact.taper ?? 0.3))));
    planes.push({ n: side, d: dot(side, point) + 1 / scale });
  }
  planes.push({ n: mul(n, -1), d: -dot(n, point) + contact.depth });
  const { retained, core } = carveSolid(faces, planes);
  if (!core) return null;
  let shards = [core];
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI) / 3 + random() * 0.35;
    const cut = unit(add(mul(u, Math.cos(angle)), mul(v, Math.sin(angle))));
    const through = add(point, add(mul(n, -contact.depth * 0.35), mul(u, (random() - 0.5) * r * 0.4)));
    shards = shards.flatMap((s) => splitSolid(s, cut, dot(cut, through)));
  }
  shards = shards.flatMap((s) =>
    solidInfo(s).volume > 0.004
      ? splitSolid(s, n, dot(n, point) - contact.depth * (0.2 + random() * 0.45))
      : [s],
  );
  return { retained, shards, removedVolume: solidInfo(core).volume };
}
