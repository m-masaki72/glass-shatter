export class ShotMoment {
  constructor() {
    this.reset();
  }
  reset() {
    this.seen = new Set();
    this.peak = 0;
    this.active = null;
  }
  landing(event, score, previousBest, now) {
    if (
      event.kind !== 'secondary' ||
      !event.floor ||
      event.volume < 0.08 ||
      !event.cause ||
      this.seen.has(event.cause) ||
      score < 20 ||
      score <= this.peak + 0.01
    )
      return false;
    this.seen.add(event.cause);
    this.peak = score;
    this.active = { cause: event.cause, score, previousBest, until: now + 2.4 };
    return true;
  }
  update(volumes, total, now) {
    if (this.active && now >= this.active.until) this.active = null;
    if (!this.active) return null;
    this.active.score = Math.min(100, ((volumes.get(this.active.cause) ?? 0) / total) * 100);
    this.peak = Math.max(this.peak, this.active.score);
    return this.active;
  }
}
