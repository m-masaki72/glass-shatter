import { add, sub, cross, dot, unit } from './shatter-lab-solid.js';

export function contactSpeed(a, b, point, forceDirection) {
  const velocity = (motion) =>
    motion ? add(motion.linear, cross(motion.angular, sub(point, motion.center))) : [0, 0, 0];
  return Math.abs(dot(sub(velocity(a), velocity(b)), unit(forceDirection)));
}

export class ImpactAudioGate {
  constructor() {
    this.contacts = new Map();
  }
  accept(key, time, impulse, speed) {
    if (speed < 0.22 || impulse < 0.008 || time - (this.contacts.get(key) ?? -Infinity) < 0.09) return false;
    this.contacts.set(key, time);
    for (const [id, last] of this.contacts) if (time - last > 1) this.contacts.delete(id);
    if (this.contacts.size > 512) this.contacts.delete(this.contacts.keys().next().value);
    return true;
  }
}
