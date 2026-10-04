import * as THREE from 'three';

export class ContactShadows {
  constructor(scene, capacity = 420) {
    this.capacity = capacity;
    this.box = new THREE.Box3();
    this.dummy = new THREE.Object3D();
    this.dummy.rotation.x = -Math.PI / 2;
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.setAttribute(
      'contactOpacity',
      new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1),
    );
    geometry.attributes.contactOpacity.setUsage(THREE.DynamicDrawUsage);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `attribute float contactOpacity;
        varying vec2 vUv; varying float vOpacity;
        void main() { vUv=uv; vOpacity=contactOpacity;
          gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.); }`,
      fragmentShader: `varying vec2 vUv; varying float vOpacity;
        void main() {
          vec2 edge=abs(vUv*2.-1.);
          float footprint=(1.-smoothstep(.45,1.,edge.x))*(1.-smoothstep(.45,1.,edge.y));
          gl_FragColor=vec4(.10,.13,.14,footprint*vOpacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.userData.omitReflection = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
  }
  update(meshes) {
    let count = 0;
    for (const source of meshes.values()) {
      const p = source.userData.piece;
      if (!p.dynamic || count === this.capacity) continue;
      if (!source.geometry.boundingBox) source.geometry.computeBoundingBox();
      source.updateMatrix();
      this.box.copy(source.geometry.boundingBox).applyMatrix4(source.matrix);
      const height = Math.max(0, this.box.min.y);
      if (height >= 0.26) continue;
      const fade = source.userData.retiring ? source.material[0].opacity : 1;
      const opacity = 0.12 * (1 - height / 0.26) ** 2 * fade;
      this.dummy.position.set(
        (this.box.min.x + this.box.max.x) / 2,
        -0.013,
        (this.box.min.z + this.box.max.z) / 2,
      );
      this.dummy.scale.set(this.box.max.x - this.box.min.x + 0.04, this.box.max.z - this.box.min.z + 0.04, 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(count, this.dummy.matrix);
      this.mesh.geometry.attributes.contactOpacity.setX(count++, opacity);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.geometry.attributes.contactOpacity.needsUpdate = true;
  }
  clear() {
    this.mesh.count = 0;
  }
}
