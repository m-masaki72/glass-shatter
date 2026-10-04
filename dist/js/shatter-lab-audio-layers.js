export function glassVoiceProfile(volume, kind, glass = false) {
  const size = Math.cbrt(Math.max(0.0001, volume));
  const collision = kind === 'collision' || kind === 'secondary';
  const crash = kind === 'secondary' && volume > 0.025;
  return {
    size,
    collision,
    crash,
    fundamental: crash
      ? Math.max(3400, Math.min(5300, 3900 / (size + 0.2)))
      : collision
        ? Math.max(2400, Math.min(7600, 2100 / (size + 0.2)))
        : Math.max(3400, Math.min(6200, 2100 / (size + 0.12))),
    ratios: crash ? [1, 1.31, 1.79, 2.43] : collision ? [1, 1.47, 2.63] : [1, 1.59, 2.14, 2.71],
    decay: crash
      ? Math.min(0.46, 0.26 + size * 0.17)
      : collision
        ? Math.min(0.11, 0.02 + size * (glass ? 0.09 : 0.05))
        : Math.min(0.13, 0.055 + size * 0.14),
    modalLevel: crash ? 0.94 : collision ? (glass ? 0.4 : 0.24) : 0.58,
    noiseLevel: crash ? 0.78 : collision ? 0.6 : 0.48,
  };
}

export function glassAccentLayers(
  { kind, volume = 0, floor = false, tool = 'hammer' },
  random = Math.random,
) {
  if (kind === 'collision') return [];
  if (kind === 'strike') {
    const narrow = tool === 'pick';
    return [0.012, 0.036, 0.069].slice(0, narrow ? 2 : 3).map((delay, i) => ({
      delay: delay + random() * 0.006,
      frequency: (narrow ? 7400 : 6100) + random() * 1100 + i * 210,
      duration: 0.009 + random() * 0.01,
      level: (narrow ? 0.26 : 0.32) / (1 + i * 0.6),
      noise: true,
      q: 1.1,
    }));
  }
  if (volume <= 0.025) return [];
  const accents = [
    { delay: 0.024, frequency: 8200, duration: 0.12, level: 0.28, noise: false },
    { delay: 0.056, frequency: 6500, duration: 0.065, level: 0.58, noise: true, q: 0.7 },
  ];
  if (floor) {
    accents.push(
      { delay: 0.081, frequency: 4100, duration: 0.19, level: 0.48, noise: false },
      { delay: 0.084, frequency: 6900, duration: 0.1, level: 0.24, noise: false },
    );
  }
  return accents;
}
