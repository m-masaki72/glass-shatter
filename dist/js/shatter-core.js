import { SHAPES, MATERIALS, detectMaterial } from './shatter-catalog.js';
import { presetParts } from './shatter-shapes.js';

export const COLORS = {
  mint: { name: 'ミント', label: 'MINT GLASS', hex: '#afe4cd' },
  blue: { name: 'ブルー', label: 'ICE BLUE GLASS', hex: '#88cbea' },
  pink: { name: 'ピンク', label: 'ROSE GLASS', hex: '#edafc9' },
  amber: { name: 'アンバー', label: 'AMBER GLASS', hex: '#f3ca81' },
  violet: { name: 'ラベンダー', label: 'LAVENDER GLASS', hex: '#b6a2e4' },
  clear: { name: 'クリア', label: 'CLEAR GLASS', hex: '#e1ece4' },
};

export const TOOLS = {
  hammer: {
    name: 'ハンマー',
    hint: '縁を叩いて削る。弱点が出たら、最後の一撃。',
    radius: 0.77,
    power: 1.35,
    cooldown: 260,
    word: 'SMASH!',
  },
  bat: {
    name: 'バット',
    hint: '縁を削って力をためる。弱点へ振り抜こう。',
    radius: 1.1,
    power: 1.05,
    cooldown: 210,
    word: 'HOME RUN!',
  },
  katana: {
    name: 'カタナ',
    hint: '袈裟斬りで縁を削る。露出した弱点を斬り抜こう。',
    radius: 0.34,
    power: 1.85,
    cooldown: 210,
    word: 'SLICE!',
  },
  press: {
    name: 'プレス',
    hint: '縁から圧を重ねる。弱点への一押しで圧壊。',
    radius: 0.75,
    power: 1.65,
    cooldown: 530,
    word: 'CRUNCH!',
  },
  laser: {
    name: 'レーザー',
    hint: '縁をじわっと削る。露出した弱点に照射。',
    radius: 0.38,
    power: 0.95,
    cooldown: 65,
    word: 'MELT!',
  },
};

export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function parsePrompt(input, fallbackColor = 'mint') {
  const text = String(input).trim().slice(0, 100);
  if (!text) throw new Error('つくりたいものを、ひとこと入力してください。');
  const normalized = text.normalize('NFKC').toLowerCase();
  const match = SHAPES.find(({ pattern }) => pattern.test(normalized));
  const material = detectMaterial(normalized);
  let color = fallbackColor;
  for (const [key, pattern] of [
    ['mint', /ミント|緑|みどり|グリーン|mint|green/],
    ['blue', /青|水色|ブルー|blue|cyan/],
    ['pink', /ピンク|桃色|赤|レッド|pink|rose|red/],
    ['amber', /金色|金の|黄色|黄|オレンジ|琥珀|ゴールド|gold|yellow|amber|orange/],
    ['violet', /紫|パープル|ラベンダー|violet|purple|lavender/],
    ['clear', /透明|クリア|clear|白|white/],
  ])
    if (pattern.test(normalized)) color = key;
  const countMatch =
    normalized.match(
      /(\d+)\s*(?:つ|個|本|枚|棟|台|個の|bottles?|hearts?|stars?|towers?|phones?|keyboards?|vases?|buildings?)/,
    ) || normalized.match(/[×x]\s*(\d+)/);
  const words = [
    ['一', 1],
    ['二', 2],
    ['三', 3],
    ['四', 4],
    ['五', 5],
  ];
  const wordCount = words.find(
    ([word]) =>
      normalized.includes(`${word}つ`) ||
      normalized.includes(`${word}本`) ||
      normalized.includes(`${word}個`),
  );
  const englishCount =
    ['one', 'two', 'three', 'four', 'five'].findIndex((word) =>
      new RegExp(`\\b${word}\\b`).test(normalized),
    ) + 1;
  const count = Math.max(
    1,
    Math.min(5, countMatch ? Number(countMatch[1]) : wordCount?.[1] || englishCount || 1),
  );
  const type = match?.id || 'panel';
  const size = /大き|巨大|big|large|giant/.test(normalized)
    ? 1.14
    : /小さ|ミニ|small|tiny|mini/.test(normalized)
      ? 0.78
      : 1;
  return {
    text,
    type,
    material,
    color: COLORS[color] ? color : 'mint',
    count,
    size,
    name:
      (material === 'glass'
        ? match?.glassName || 'ことばのガラス'
        : `${MATERIALS[material].name}の${match?.name || 'ことばパネル'}`) + (count > 1 ? ` × ${count}` : ''),
    caption: match ? '' : text,
  };
}

const rectangle = (width, height) => [
  [-width / 2, 0],
  [width / 2, 0],
  [width / 2, height],
  [-width / 2, height],
];

export function makeParts(spec) {
  let parts = presetParts(spec.type);
  const part = (polygon, x = 0, y = 0, z = 0, depth = 0.7) => ({ polygon, x, y, z, depth });
  if (parts) {
    // Catalog objects are kept separate from the original silhouettes.
  } else if (spec.type === 'castle') {
    parts = [part(rectangle(2.3, 2.1), 0, 0.12, 0, 1.2)];
    for (const side of [-1, 1]) {
      parts.push(part(rectangle(0.93, 2.95), side * 1.53, 0, 0.16, 1.12));
      parts.push(
        part(
          [
            [-0.68, 0],
            [0.68, 0],
            [0, 1.2],
          ],
          side * 1.53,
          2.98,
          0.14,
          1.05,
        ),
      );
    }
    parts.push(part(rectangle(0.94, 1.28), 0, 2.1, -0.18, 0.94));
    parts.push(
      part(
        [
          [-0.69, 0],
          [0.69, 0],
          [0, 1.17],
        ],
        0,
        3.42,
        -0.18,
        0.98,
      ),
    );
    for (const x of [-0.95, -0.47, 0.47, 0.95]) parts.push(part(rectangle(0.24, 0.29), x, 2.23, 0.36, 0.45));
  } else if (spec.type === 'heart') {
    const polygon = Array.from({ length: 64 }, (_, i) => {
      const t = (i / 64) * Math.PI * 2;
      return [
        Math.pow(Math.sin(t), 3) * 1.8,
        (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 0.13 + 2.3,
      ];
    });
    parts = [part(polygon, 0, 0.1, 0, 0.85)];
  } else if (spec.type === 'star') {
    const polygon = Array.from({ length: 10 }, (_, i) => {
      const angle = (i * Math.PI) / 5 + Math.PI / 2,
        r = i % 2 ? 0.94 : 2.15;
      return [Math.cos(angle) * r, Math.sin(angle) * r + 2.2];
    });
    parts = [part(polygon, 0, 0.2, 0, 0.7)];
  } else if (spec.type === 'bottle') {
    parts = [
      part(
        [
          [-0.8, 0.12],
          [-0.94, 0.35],
          [-0.94, 2.5],
          [-0.76, 2.87],
          [-0.33, 3.26],
          [-0.33, 4.1],
          [0.33, 4.1],
          [0.33, 3.26],
          [0.76, 2.87],
          [0.94, 2.5],
          [0.94, 0.35],
          [0.8, 0.12],
        ],
        0,
        0,
        0,
        0.95,
      ),
    ];
    parts.push(part(rectangle(0.78, 0.2), 0, 4.02, 0, 1.02));
  } else if (spec.type === 'diamond') {
    parts = [
      part(
        [
          [-1.25, 3.8],
          [1.25, 3.8],
          [2, 2.8],
          [0, 0.2],
          [-2, 2.8],
        ],
        0,
        0,
        0,
        1.3,
      ),
    ];
  } else if (spec.type === 'tower') {
    parts = [];
    for (let i = 0; i < 7; i++)
      parts.push(part(rectangle(2.6 - i * 0.19, 0.5), 0, i * 0.58 + 0.1, 0, 1.6 - i * 0.09));
    parts.push(
      part(
        [
          [-0.25, 0],
          [0.25, 0],
          [0, 0.85],
        ],
        0,
        4.14,
        0,
        0.35,
      ),
    );
  } else {
    parts = [part(rectangle(3.9, 3.3), 0, 0.45, 0, 0.38)];
  }
  const scale = spec.size * (spec.count === 1 ? 1 : spec.count === 2 ? 0.67 : spec.count === 3 ? 0.53 : 0.39);
  const spacing = (spec.type === 'bottle' ? 2.4 : spec.type === 'keyboard' ? 5.6 : 4.55) * scale;
  return Array.from({ length: spec.count }, (_, i) =>
    parts.map((p) => ({
      polygon: p.polygon.map(([x, y]) => [x * scale, y * scale]),
      x: p.x * scale + (i - (spec.count - 1) / 2) * spacing,
      y: p.y * scale + 0.34,
      z: p.z * scale,
      depth: p.depth * scale,
      detail: Boolean(p.detail),
    })),
  ).flat();
}

export function polygonArea(polygon) {
  return (
    Math.abs(
      polygon.reduce((sum, p, i) => {
        const q = polygon[(i + 1) % polygon.length];
        return sum + p[0] * q[1] - q[0] * p[1];
      }, 0),
    ) / 2
  );
}

function clip(polygon, nx, ny, distance) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const da = a[0] * nx + a[1] * ny - distance,
      db = b[0] * nx + b[1] * ny - distance;
    if (da <= 1e-8) result.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return result;
}

export function fracturePolygon(polygon, density, random = Math.random) {
  const minX = Math.min(...polygon.map((p) => p[0])),
    maxX = Math.max(...polygon.map((p) => p[0]));
  const minY = Math.min(...polygon.map((p) => p[1])),
    maxY = Math.max(...polygon.map((p) => p[1]));
  const width = maxX - minX,
    height = maxY - minY;
  const cols = Math.max(1, Math.ceil(width / density)),
    rows = Math.max(1, Math.ceil(height / density));
  const seeds = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      seeds.push([
        minX + ((x + 0.16 + random() * 0.68) / cols) * width,
        minY + ((y + 0.16 + random() * 0.68) / rows) * height,
      ]);
  const cells = [];
  for (let i = 0; i < seeds.length; i++) {
    let cell = polygon;
    for (let j = 0; j < seeds.length && cell.length > 2; j++) {
      if (i === j) continue;
      const a = seeds[i],
        b = seeds[j];
      cell = clip(cell, b[0] - a[0], b[1] - a[1], (b[0] ** 2 + b[1] ** 2 - a[0] ** 2 - a[1] ** 2) / 2);
    }
    if (cell.length >= 3 && polygonArea(cell) > 0.0001) cells.push(cell);
  }
  return cells;
}

export function hitStrength(tool, point, origin, end, charge = 0, fragility = 2, swept = false) {
  const dx = point.x - origin.x,
    dy = point.y - origin.y;
  const radius = TOOLS[tool].radius * (1 + charge * 0.85);
  let distance;
  if (tool === 'press') distance = Math.abs(dx);
  else if (tool === 'katana' || swept) {
    const vx = end.x - origin.x,
      vy = end.y - origin.y,
      length = vx * vx + vy * vy;
    const t = length > 0.01 ? Math.max(0, Math.min(1, (dx * vx + dy * vy) / length)) : 0;
    distance = Math.hypot(dx - vx * t, dy - vy * t);
  } else if (tool === 'bat') distance = Math.hypot(dx * 0.62, dy * 1.55);
  else distance = Math.hypot(dx, dy);
  if (distance > radius) return 0;
  return (
    TOOLS[tool].power *
    (1 + charge * 1.8) *
    [0.65, 1.05, 1.85][fragility - 1] *
    (1 - (distance / radius) * 0.55)
  );
}
