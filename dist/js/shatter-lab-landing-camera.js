import * as THREE from 'three';

const ease = (t) => {
  t = THREE.MathUtils.clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
const up = new THREE.Vector3(0, 1, 0);

export class LandingCamera {
  constructor() {
    this.focus = new THREE.Vector3();
    this.fromFocus = new THREE.Vector3();
    this.destination = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this.arm = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.reset();
  }
  reset() {
    this.sequence = null;
    this.blockedSequence = null;
    this.cancel();
  }
  start(point, sequence = 0, continuation = false, allowed = true) {
    if (!allowed) this.blockedSequence = sequence;
    if (this.blockedSequence === sequence) return false;
    const joining = continuation && this.running && this.sequence === sequence;
    this.sequence = sequence;
    this.destination.fromArray(point);
    this.destination.y = Math.max(0.2, this.destination.y);
    if (!joining) this.focus.copy(this.destination);
    this.fromFocus.copy(this.focus);
    this.fromWeight = joining ? this.weight : 0;
    this.fromSweep = joining ? this.sweep : -0.025;
    this.toSweep = joining ? Math.min(0.065, this.fromSweep + 0.04) : 0.065;
    this.hold = continuation ? 0.35 : 0.62;
    this.running = true;
    return true;
  }
  cancel(sequence = this.sequence) {
    this.blockedSequence = sequence;
    this.running = false;
    this.weight = 0;
    this.pan = 0;
  }
  apply(camera, baseTarget, age, sequenceAge = age) {
    const weight = this.running
      ? (this.fromWeight + (1 - this.fromWeight) * ease(age / 0.18)) *
        (1 - ease((age - this.hold) / 0.5)) *
        (1 - ease((sequenceAge - 2.5) / 0.5))
      : 0;
    this.weight = weight;
    if (age >= this.hold + 0.5 || sequenceAge >= 3) this.running = false;
    const zoom = 1 + 0.14 * weight;
    if (camera.zoom !== zoom) {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
    }
    if (!weight) {
      this.pan = 0;
      return;
    }
    this.focus.lerpVectors(this.fromFocus, this.destination, ease(age / 0.28));
    this.arm.copy(camera.position).sub(baseTarget);
    this.offset
      .copy(this.focus)
      .sub(baseTarget)
      .multiplyScalar(0.55 * weight);
    this.offset.clampLength(0, this.arm.length() * 0.12);
    this.target.copy(baseTarget).add(this.offset);
    this.sweep = this.fromSweep + (this.toSweep - this.fromSweep) * ease(age / 0.85);
    this.pan = this.sweep * weight;
    this.arm.applyAxisAngle(up, this.pan);
    camera.position.copy(this.target).add(this.arm);
    camera.lookAt(this.target);
  }
}
