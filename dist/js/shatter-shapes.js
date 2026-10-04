const rectangle = (width, height) => [
  [-width / 2, 0],
  [width / 2, 0],
  [width / 2, height],
  [-width / 2, height],
];
const part = (polygon, x = 0, y = 0, z = 0, depth = 0.7, detail = false) => ({
  polygon,
  x,
  y,
  z,
  depth,
  detail,
});

export function presetParts(type) {
  if (type === 'building') {
    const parts = [part(rectangle(2.45, 4.1), 0, 0, 0, 1.25), part(rectangle(1.6, 0.28), 0, 4.12, 0, 0.95)];
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 4; col++)
        parts.push(part(rectangle(0.36, 0.3), (col - 1.5) * 0.54, 0.26 + row * 0.46, 0.69, 0.1, true));
    return parts;
  }
  if (type === 'vase') {
    const profile = [
      [0.64, 0],
      [0.8, 0.12],
      [1.35, 0.7],
      [1.5, 1.4],
      [1.35, 2.1],
      [0.7, 2.85],
      [0.62, 3.45],
      [0.84, 3.6],
    ];
    return [
      part([...profile.map(([x, y]) => [-x, y]), ...profile.slice().reverse()], 0, 0.2, 0, 1.05),
      part(rectangle(1.8, 0.18), 0, 3.8, 0, 1.15),
    ];
  }
  if (type === 'keyboard') {
    const parts = [part(rectangle(5.2, 2.12), 0, 0.45, 0, 0.3)];
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 12; col++) {
        if (row === 0 && col > 2 && col < 8) continue;
        const width = row === 0 && col === 2 ? 2.3 : 0.35;
        const x = row === 0 && col === 2 ? -0.4 : (col - 5.5) * 0.41;
        parts.push(part(rectangle(width, 0.34), x, 0.61 + row * 0.46, 0.25, 0.18, true));
      }
    return parts;
  }
  if (type === 'phone') {
    return [
      part(
        [
          [-1, 0],
          [1, 0],
          [1.14, 0.14],
          [1.14, 4.06],
          [1, 4.2],
          [-1, 4.2],
          [-1.14, 4.06],
          [-1.14, 0.14],
        ],
        0,
        0.08,
        0,
        0.34,
      ),
      part(rectangle(1.98, 3.35), 0, 0.52, 0.2, 0.045, true),
      part(rectangle(0.62, 0.09), 0, 4.05, 0.23, 0.06, true),
      part(rectangle(0.35, 0.11), 0, 0.22, 0.24, 0.06, true),
    ];
  }
  return null;
}
