const ease = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};

export class LandingBeat {
  constructor() {
    this.reset();
  }
  reset() {
    this.time = 0;
    this.started = -Infinity;
    this.sequenceStarted = -Infinity;
    this.lastEligible = -Infinity;
    this.groupTime = -Infinity;
    this.seen = new Set();
    this.played = 0;
    this.combo = 0;
    this.startScale = 1;
  }
  advance(dt) {
    if (Number.isFinite(dt)) this.time += Math.max(0, dt);
  }
  trigger(event) {
    if (
      event.kind !== 'secondary' ||
      !event.floor ||
      event.landingDepth !== 1 ||
      !(event.volume >= 0.08) ||
      !event.cause ||
      (event.pieceId != null && this.seen.has(event.pieceId))
    )
      return false;
    if (event.pieceId != null) this.seen.add(event.pieceId);
    if (this.time - this.lastEligible > 1.5) {
      this.sequenceStarted = this.time;
      this.groupTime = -Infinity;
      this.combo = 0;
    }
    this.lastEligible = this.time;
    const physicsTime = Number.isFinite(event.time) ? event.time : this.time;
    if (
      this.sequenceAge >= 2.4 ||
      (this.combo > 0 && (physicsTime - this.groupTime < 0.12 || this.age < 0.4))
    )
      return false;
    this.startScale = this.localScale;
    this.groupTime = physicsTime;
    this.started = this.time;
    this.combo++;
    this.played++;
    return true;
  }
  get age() {
    return this.time - this.started;
  }
  get active() {
    return this.scale < 1;
  }
  get sequenceAge() {
    return this.time - this.sequenceStarted;
  }
  get labelActive() {
    return this.combo > 1 && this.age < 1.12 && this.sequenceAge < 3;
  }
  get localScale() {
    const age = this.age;
    const hold = this.combo > 1 ? 0.22 : 0.48;
    if (this.combo > 1 && age < 0.07) return this.startScale + (0.2 - this.startScale) * ease(age / 0.07);
    return 0.2 + 0.8 * ease((age - hold) / 0.44);
  }
  get scale() {
    const scale = this.localScale;
    return scale + (1 - scale) * ease((this.sequenceAge - 2.3) / 0.5);
  }
}
