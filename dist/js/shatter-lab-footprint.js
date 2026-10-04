import * as THREE from 'three';
import { CONTACT_TOOLS, contactFootprint } from './shatter-lab-contact.js';
import { cross } from './shatter-lab-solid.js';

export class FootprintPreview {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.visible = false;
    this.root.userData.omitReflection = true;
    const fill = new THREE.BufferGeometry();
    fill.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 9), 3));
    const outline = new THREE.BufferGeometry();
    outline.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
    this.fill = new THREE.Mesh(
      fill,
      new THREE.MeshBasicMaterial({
        color: '#e5b65f',
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.outline = new THREE.LineLoop(
      outline,
      new THREE.LineBasicMaterial({ color: '#c88a31', transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.fill.frustumCulled = this.outline.frustumCulled = false;
    this.root.add(this.fill, this.outline);
    scene.add(this.root);
  }
  update(point, contact, polygon, tool) {
    this.root.visible = false;
    this.vertices = 0;
    if (!contact || !polygon || contact.incidence < 0.05) return;
    const size = CONTACT_TOOLS[tool];
    const vertices = contactFootprint(
      polygon,
      point,
      contact.tangent,
      cross(contact.normal, contact.tangent),
      size.width,
      size.length / Math.max(0.22, contact.incidence),
    );
    if (vertices.length < 3 || vertices.length > 64) return;
    const shifted = vertices.map((p) => p.map((v, i) => v + contact.normal[i] * 0.006));
    const fill = this.fill.geometry.attributes.position;
    const outline = this.outline.geometry.attributes.position;
    let count = 0;
    for (let i = 1; i < shifted.length - 1; i++)
      for (const p of [shifted[0], shifted[i], shifted[i + 1]]) fill.setXYZ(count++, ...p);
    shifted.forEach((p, i) => outline.setXYZ(i, ...p));
    fill.needsUpdate = outline.needsUpdate = true;
    this.fill.geometry.setDrawRange(0, count);
    this.outline.geometry.setDrawRange(0, shifted.length);
    this.vertices = shifted.length;
    this.root.visible = true;
  }
}
