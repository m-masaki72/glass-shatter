import * as THREE from 'three';

export class ContactTool {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.userData.omitReflection = true;
    scene.add(this.root);
    this.root.visible = false;
    this.metal = new THREE.MeshStandardMaterial({ color: '#d9dcdb', metalness: 0.95, roughness: 0.21 });
    this.grip = new THREE.MeshStandardMaterial({ color: '#302d2a', metalness: 0.12, roughness: 0.65 });
    this.brass = new THREE.MeshStandardMaterial({ color: '#b5a078', metalness: 0.8, roughness: 0.27 });
    this.setTool('hammer');
  }
  setTool(tool) {
    this.tool = tool;
    for (const c of this.root.children) c.geometry.dispose();
    this.root.clear();
    const part = (geometry, material, y) => {
      const m = new THREE.Mesh(geometry, material);
      m.position.y = y;
      this.root.add(m);
      return m;
    };
    this.grip.color.set(tool === 'pick' ? '#705b3d' : '#302d2a');
    if (tool === 'hammer') {
      const face = part(new THREE.BoxGeometry(0.34, 0.26, 0.26), this.metal, 0);
      face.position.x = 0.07;
      face.name = 'hammer-face';
      const pick = new THREE.ConeGeometry(1, 1, 4, 1)
        .rotateY(Math.PI / 4)
        .rotateZ(Math.PI / 2)
        .scale(0.46, 0.26 / Math.SQRT2, 0.26 / Math.SQRT2)
        .translate(-0.33, 0, 0);
      part(pick, this.metal, 0).name = 'hammer-pick';
      part(new THREE.CylinderGeometry(0.035, 0.05, 0.85, 12), this.grip, -0.5);
      part(new THREE.CylinderGeometry(0.055, 0.055, 0.12, 12), this.brass, -0.84);
    } else if (tool === 'pick') {
      part(new THREE.BoxGeometry(0.24, 0.16, 0.14), this.metal, 0).position.x = -0.1;
      const point = new THREE.ConeGeometry(1, 1, 4, 1)
        .rotateY(Math.PI / 4)
        .rotateZ(-Math.PI / 2)
        .scale(0.6, 0.16 / Math.SQRT2, 0.14 / Math.SQRT2)
        .translate(0.32, 0, 0);
      part(point, this.metal, 0).name = 'pick-point';
      part(new THREE.CylinderGeometry(0.03, 0.042, 0.64, 12), this.grip, -0.4);
      part(new THREE.CylinderGeometry(0.047, 0.047, 0.09, 12), this.brass, -0.69);
    } else {
      part(new THREE.CylinderGeometry(0.11, 0.037, 1.2, 20), this.metal, -0.42);
      part(new THREE.SphereGeometry(0.11, 16, 12), this.metal, 0.18);
      part(new THREE.CylinderGeometry(0.035, 0.04, 0.3, 12), this.grip, -1.1);
    }
  }
  pose(point, direction, normal, distance) {
    this.root.visible = true;
    if (this.tool === 'hammer' || this.tool === 'pick') {
      const x = direction.clone().normalize();
      let y = new THREE.Vector3(0, 1, 0).addScaledVector(x, -x.y);
      if (y.lengthSq() < 0.01) y = new THREE.Vector3(0, 0, 1).addScaledVector(x, -x.z);
      y.normalize();
      const z = x.clone().cross(y).normalize();
      this.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      this.root.position.copy(point).addScaledVector(x, -distance - (this.tool === 'pick' ? 0.62 : 0.24));
      return;
    }
    this.root.position.copy(point).addScaledVector(direction, -distance).addScaledVector(normal, 0.13);
    const z = normal.clone().normalize();
    let y = direction.clone().negate().addScaledVector(z, direction.dot(z)).normalize();
    if (y.lengthSq() < 0.01)
      y = z
        .clone()
        .cross(Math.abs(z.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0))
        .normalize();
    if (this.tool === 'bat') y.cross(z).normalize();
    const x = y.clone().cross(z).normalize();
    this.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }
  preview(hit, direction) {
    if (this.animation) return;
    this.setPreview(true);
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    this.pose(hit.point, direction, n, this.tool === 'hammer' ? 1.05 : this.tool === 'pick' ? 0.85 : 0.65);
  }
  swing(hit, direction, callback) {
    this.setPreview(false);
    this.animation = {
      point: hit.point.clone(),
      normal: hit.face.normal.clone().transformDirection(hit.object.matrixWorld),
      direction: direction.clone(),
      age: 0,
      callback,
      hit: false,
    };
  }
  update(dt) {
    const a = this.animation;
    if (!a) return;
    a.age += dt;
    const impactTime = this.tool === 'pick' ? 0.065 : 0.075;
    const duration = this.tool === 'pick' ? 0.22 : 0.25;
    const distance =
      a.age < impactTime
        ? (this.tool === 'hammer' ? 1.05 : this.tool === 'pick' ? 0.85 : 0.65) *
          (1 - (a.age / impactTime) ** 2)
        : 0.3 * Math.sin(Math.min(1, (a.age - impactTime) / (duration - impactTime)) * Math.PI);
    this.pose(a.point, a.direction, a.normal, distance);
    if (a.age >= impactTime && !a.hit) {
      if (this.tool === 'hammer' || this.tool === 'pick') this.pose(a.point, a.direction, a.normal, 0);
      a.hit = true;
      a.callback();
    }
    if (a.age > duration) {
      this.animation = null;
      this.root.visible = false;
    }
  }
  cancel() {
    this.animation = null;
    this.root.visible = false;
  }
  setPreview(active) {
    if (this.previewing === active) return;
    this.previewing = active;
    for (const material of [this.metal, this.grip, this.brass]) {
      material.transparent = active;
      material.opacity = active ? 0.38 : 1;
      material.depthWrite = !active;
      material.needsUpdate = true;
    }
  }
}
