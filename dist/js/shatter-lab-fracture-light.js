import * as THREE from 'three';
import { normal, sub, unit, cross, add, mul } from './shatter-lab-solid.js';

const edgeKey = (a, b) =>
  [a, b]
    .map((p) => p.map((v) => Math.round(v * 1e5)).join(','))
    .sort()
    .join(':');

export class FractureLight {
  constructor() {
    this.time = { value: 0 };
    this.pulse = { value: 1 };
    this.material = new THREE.ShaderMaterial({
      uniforms: { fractureTime: this.time },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `attribute vec3 crackData; varying vec3 vCrack;
        void main() { vCrack = crackData; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float fractureTime; varying vec3 vCrack;
        void main() {
          float age = fractureTime - vCrack.x;
          float reveal = smoothstep(vCrack.y * 0.035, vCrack.y * 0.035 + 0.018, age);
          float fade = 1.0 - smoothstep(0.055, 0.27, age);
          float edge = 1.0 - smoothstep(0.3, 1.0, abs(vCrack.z));
          gl_FragColor = vec4(vec3(1.45, 1.7, 1.8), reveal * fade * edge * 0.85);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
  }
  get enabled() {
    return this.pulse.value > 0;
  }
  set enabled(value) {
    this.pulse.value = value ? 1 : 0;
  }
  decorate(material) {
    const original = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      original(shader, renderer);
      shader.uniforms.fractureTime = this.time;
      shader.uniforms.fractureEnabled = this.pulse;
      shader.vertexShader =
        'attribute float fractureBirth; varying float vFractureBirth;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvFractureBirth = fractureBirth;',
      );
      shader.fragmentShader =
        'uniform float fractureTime; uniform float fractureEnabled; varying float vFractureBirth;\n' +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
        float fractureAge = fractureTime - vFractureBirth;
        float fracturePulse = smoothstep(0.0, 0.015, fractureAge) * (1.0 - smoothstep(0.035, 0.23, fractureAge));
        float facet = pow(abs(dot(normal, normalize(vec3(-0.45, 0.8, 0.4)))), 9.0);
        outgoingLight += vec3(0.7, 0.92, 1.0) * fracturePulse * facet * 1.4 * fractureEnabled;
        #include <opaque_fragment>`,
      );
    };
    material.customProgramCacheKey = () => 'fracture-micro-roughness-facet-v1';
  }
  attach(piece, geometry) {
    const active = this.enabled && piece.landingDepth === 1;
    const birth = active ? this.time.value : -1e6;
    geometry.setAttribute(
      'fractureBirth',
      new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(birth), 1),
    );
    if (!active) return null;
    const cuts = new Set();
    for (const face of piece.faces.filter((f) => f.tag === 'cut'))
      face.points.forEach((a, i) => cuts.add(edgeKey(a, face.points[(i + 1) % face.points.length])));
    const positions = [],
      data = [];
    const origin = piece.impactPoint || piece.center;
    const radius = Math.max(0.2, Math.hypot(...sub(piece.max, piece.min)));
    for (const face of piece.faces.filter((f) => f.tag !== 'cut')) {
      const n = normal(face);
      face.points.forEach((a, i) => {
        const b = face.points[(i + 1) % face.points.length];
        if (!cuts.has(edgeKey(a, b))) return;
        const side = mul(unit(cross(sub(b, a), n)), 0.007);
        for (const [p, sign] of [
          [a, -1],
          [b, -1],
          [b, 1],
          [a, -1],
          [b, 1],
          [a, 1],
        ]) {
          positions.push(...sub(add(add(p, mul(side, sign)), mul(n, 0.002)), piece.center));
          data.push(birth, Math.min(1, Math.hypot(...sub(p, origin)) / radius), sign);
        }
      });
    }
    if (!positions.length) return null;
    const ribbons = new THREE.BufferGeometry();
    ribbons.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    ribbons.setAttribute('crackData', new THREE.Float32BufferAttribute(data, 3));
    const mesh = new THREE.Mesh(ribbons, this.material);
    mesh.userData.fractureBirth = birth;
    mesh.userData.omitReflection = true;
    return mesh;
  }
  update(delta) {
    this.time.value += delta;
  }
}
