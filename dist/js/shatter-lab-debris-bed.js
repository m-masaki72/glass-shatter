export class DebrisBed {
  constructor() {
    this.grounded = new Set();
    this.impacts = new Map();
  }
  update(world, colliders, floor, time) {
    for (const [id, history] of this.impacts) {
      const recent = history.filter((sample) => time - sample.time < 0.06);
      if (recent.length) this.impacts.set(id, recent);
      else this.impacts.delete(id);
    }
    const candidates = new Map();
    for (const [handle, p] of colliders) if (p.dynamic && p.cracked) candidates.set(handle, p);
    const connected = new Set(),
      queue = [floor];
    for (let index = 0; index < queue.length; index++) {
      const support = queue[index];
      world.contactPairsWith(support, (collider) => {
        if (!candidates.has(collider.handle) || connected.has(collider.handle)) return;
        if (support !== floor && collider.translation().y < support.translation().y - 0.01) return;
        let touching = false;
        world.contactPair(support, collider, (manifold) => {
          if (Math.abs(manifold.normal().y) < 0.35) return;
          for (let i = 0; i < manifold.numContacts(); i++)
            if (manifold.contactDist(i) <= 0.015) touching = true;
        });
        if (touching) {
          connected.add(collider.handle);
          queue.push(collider);
        }
      });
    }
    this.grounded.clear();
    for (const handle of connected) this.grounded.add(candidates.get(handle).id);
  }
  has(piece) {
    return !!piece && this.grounded.has(piece.id);
  }
  impact(piece, impulse, time) {
    // A pile splits one landing impulse across many colliders and a few solver ticks.
    const history = this.impacts.get(piece.id) ?? [];
    let sample = history.at(-1);
    if (!sample || sample.time !== time) {
      sample = { time, impulse: 0 };
      history.push(sample);
    }
    sample.impulse += impulse;
    this.impacts.set(piece.id, history);
    return history.reduce((sum, entry) => sum + entry.impulse, 0);
  }
  downwardSpeed(motion, point) {
    if (!motion) return 0;
    const angular = motion.angular ?? [0, 0, 0];
    return -(
      motion.linear[1] +
      angular[2] * (point[0] - motion.center[0]) -
      angular[0] * (point[2] - motion.center[2])
    );
  }
  isLanding(piece, support, motion, point, axis) {
    if (!motion) return false;
    return !!(
      piece?.dynamic &&
      this.has(support) &&
      this.downwardSpeed(motion, point) > 0.3 &&
      Math.abs(axis.y) > 0.35 &&
      motion.center[1] > support.body.translation().y + 0.01 &&
      point[1] < motion.center[1] + 0.04
    );
  }
}
