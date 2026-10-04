import { LandingBeat } from './shatter-lab-landing-beat.js';

export class LandingEffects {
  constructor() {
    this.beat = new LandingBeat();
  }
  trigger(event) {
    return this.beat.trigger(event);
  }
  update(dt) {
    this.beat.advance(dt);
  }
  clear() {
    this.beat.reset();
  }
}
