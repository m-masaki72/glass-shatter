const priority = (e) => Number(e.kind === 'secondary' && e.volume > 0.025);
const byImportance = (a, b) => priority(b) - priority(a) || b.impulse - a.impulse;

export class SoundClusters {
  constructor() {
    this.pending = [];
    this.recent = [];
  }
  add(event) {
    const group = this.pending.find((g) => Math.hypot(...g.point.map((v, i) => v - event.point[i])) < 0.85);
    if (group) {
      group.impulse = Math.max(group.impulse, event.impulse);
      group.volume = Math.max(group.volume, event.volume);
      group.count++;
      if (event.kind === 'secondary') group.kind = 'secondary';
      group.floor = group.floor || event.floor;
    } else if (this.pending.length < 64) this.pending.push({ ...event, count: 1 });
    else {
      this.pending.sort(byImportance);
      if (byImportance(event, this.pending.at(-1)) < 0)
        this.pending[this.pending.length - 1] = { ...event, count: 1 };
    }
  }
  drain(now) {
    this.recent = this.recent.filter((g) => now - g.time < 0.04);
    const out = this.pending
      .sort(byImportance)
      .filter((event) => {
        const old = this.recent.find((g) => Math.hypot(...g.point.map((v, i) => v - event.point[i])) < 0.85);
        return (
          !old ||
          event.impulse > old.impulse * 1.8 ||
          (event.kind === 'secondary' && old.kind !== 'secondary')
        );
      })
      .slice(0, 4);
    this.recent.push(...out.map((g) => ({ ...g, time: now })));
    this.pending = [];
    return out;
  }
  clear() {
    this.pending = [];
    this.recent = [];
  }
}
