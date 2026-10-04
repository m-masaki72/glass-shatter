import * as THREE from 'three';
import { splinterMaterial } from './shatter-lab-splinter-materials.js';

export class LandingSplinters {
  constructor(scene, capacity = 720) {
    this.capacity = capacity;
    this.clearCapacity = Math.min(40, capacity);
    this.particles = [];
    this.peak = 0;
    this.dummy = new THREE.Object3D();
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, -0.4);
    shape.lineTo(0.5, -0.24);
    shape.lineTo(-0.18, 0.6);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false, steps: 1 });
    geometry.center();
    this.mesh = new THREE.InstancedMesh(geometry, splinterMaterial(false), capacity);
    this.clearMesh = new THREE.InstancedMesh(geometry.clone(), splinterMaterial(true), this.clearCapacity);
    for (const mesh of [this.mesh, this.clearMesh]) {
      const fade = new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count), 1);
      fade.setUsage(THREE.DynamicDrawUsage);
      mesh.geometry.setAttribute('shardFade', fade);
      const flash = new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count), 1);
      flash.setUsage(THREE.DynamicDrawUsage);
      mesh.geometry.setAttribute('shardFlash', flash);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.userData.omitReflection = mesh === this.mesh;
      scene.add(mesh);
    }
  }
  emit({ point, volume, energy = 1, floor = true, drift = [0, 0, 0], landingDepth = 1 }) {
    const emphasis = floor && volume >= 0.08 && landingDepth === 1;
    const count = Math.min(emphasis ? 260 : 80, Math.ceil(20 + Math.cbrt(volume) * (emphasis ? 240 : 90)));
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.capacity) {
        const disposable = this.particles.findIndex((p) => p.tier === 'fine');
        this.particles.splice(disposable < 0 ? 0 : disposable, 1);
      }
      const directed = floor && Math.hypot(drift[0], drift[2]) > 0.15 && i % 4 !== 0;
      const angle = directed
        ? Math.atan2(drift[2], drift[0]) + (Math.random() - 0.5) * 2.6
        : Math.random() * Math.PI * 2;
      const speed =
        (0.5 + Math.random() * 2.7) * Math.min(1.8, 0.6 + Math.sqrt(energy) * 0.25) * (emphasis ? 1.7 : 1);
      const clear = i % 12 === 0;
      const needle = !clear && i % 3 === 0;
      const size = clear
        ? 0.1 + Math.random() * 0.14
        : needle
          ? 0.055 + Math.random() * 0.06
          : 0.016 + Math.pow(Math.random(), 2) * 0.045;
      this.particles.push({
        clear,
        tier: clear ? 'hero' : needle ? 'needle' : 'fine',
        emphasis,
        position: new THREE.Vector3(point[0], Math.max(0.015, point[1]), point[2]),
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed,
          floor
            ? (0.3 + Math.random() * (needle ? 2.6 : clear ? 1.9 : 1.2)) * (emphasis ? 1 : 0.55)
            : 0.7 + Math.random() * 1.5,
          Math.sin(angle) * speed,
        ),
        rotation: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        spin: new THREE.Vector3(Math.random() * 18 - 9, Math.random() * 18 - 9, Math.random() * 18 - 9),
        scale: new THREE.Vector3(
          size * (needle ? 0.24 : 1),
          size * (needle ? 2.6 : 0.4 + Math.random()),
          size * (0.35 + Math.random() * 0.45),
        ),
        age: 0,
        life: 2.2 + Math.random() * 2.8,
        resting: false,
      });
    }
    this.peak = Math.max(this.peak, this.particles.length);
  }
  clear() {
    this.particles.length = 0;
    this.mesh.count = 0;
    this.clearMesh.count = 0;
    this.peak = 0;
  }
  update(dt) {
    this.particles = this.particles.filter((p) => (p.age += dt) < p.life);
    let index = 0,
      clearIndex = 0;
    for (const p of this.particles) {
      if (!p.resting) {
        p.velocity.y -= 9.81 * dt;
        p.position.addScaledVector(p.velocity, dt);
        p.rotation.x += p.spin.x * dt;
        p.rotation.y += p.spin.y * dt;
        p.rotation.z += p.spin.z * dt;
        if (p.position.y < 0.012) {
          p.position.y = 0.012;
          p.velocity.y = Math.abs(p.velocity.y) * 0.24;
          p.velocity.x *= 0.67;
          p.velocity.z *= 0.67;
          p.spin.multiplyScalar(0.42);
          if (p.velocity.y < 0.18) {
            p.resting = true;
            p.rotation.x = -Math.PI / 2;
            p.rotation.z = 0;
          }
        }
      }
      this.dummy.position.copy(p.position);
      this.dummy.rotation.copy(p.rotation);
      this.dummy.scale.copy(p.scale);
      this.dummy.updateMatrix();
      const mesh = p.clear && clearIndex < this.clearCapacity ? this.clearMesh : this.mesh;
      const slot = mesh === this.clearMesh ? clearIndex++ : index++;
      mesh.setMatrixAt(slot, this.dummy.matrix);
      mesh.geometry.attributes.shardFade.setX(slot, Math.min(1, (p.life - p.age) / 0.25));
      mesh.geometry.attributes.shardFlash.setX(slot, p.emphasis ? Math.max(0, 1 - p.age / 0.22) : 0);
    }
    this.mesh.count = index;
    this.clearMesh.count = clearIndex;
    for (const mesh of [this.mesh, this.clearMesh]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.shardFade.needsUpdate = true;
      mesh.geometry.attributes.shardFlash.needsUpdate = true;
    }
  }
}
