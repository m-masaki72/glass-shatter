const KEY = 'glass-rush.crystal.floor-fracture-shots.arcade-landing.v3';

export function stageRankingKey(spec) {
  const key = `${spec.type}:${spec.size}:${spec.count}`;
  return spec.layoutVersion ? `${key}:${spec.layoutVersion}` : key;
}

export class BestShotRanking {
  constructor(storage, makeId = () => crypto.randomUUID()) {
    this.storage = storage;
    this.makeId = makeId;
    this.saved = true;
    try {
      const parsed = JSON.parse(storage.getItem(KEY));
      this.boards = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      this.boards = {};
      this.saved = false;
    }
  }
  begin(spec) {
    this.key = stageRankingKey(spec);
    const entries = this.boards[this.key];
    this.entries = (Array.isArray(entries) ? entries : [])
      .filter(
        (e) =>
          e &&
          typeof e.id === 'string' &&
          Number.isFinite(e.score) &&
          e.score > 0 &&
          e.score <= 100 &&
          ['hammer', 'pick'].includes(e.tool),
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    this.id = this.makeId();
    this.best = 0;
    this.tools = new Map();
  }
  strike(id, tool) {
    this.tools.set(id, tool);
  }
  update(chains, total) {
    if (!(total > 0)) return false;
    let winner = null;
    for (const [id, volume] of chains) {
      const score = Math.min(100, (volume / total) * 100);
      if (score > (winner?.score ?? this.best) + 0.000001 && this.tools.has(id))
        winner = { id: this.id, score, tool: this.tools.get(id) };
    }
    if (!winner) return false;
    this.best = winner.score;
    this.entries = [...this.entries.filter((e) => e.id !== this.id), winner]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    this.boards[this.key] = this.entries;
    try {
      this.storage.setItem(KEY, JSON.stringify(this.boards));
      this.saved = true;
    } catch {
      this.saved = false;
    }
    return true;
  }
}
