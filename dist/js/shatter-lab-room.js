import * as THREE from 'three';

export function stoneFinish(material, tiles = false) {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.vertexShader = 'varying vec3 vStonePosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvStonePosition = (modelMatrix * vec4(position, 1.0)).xyz;',
    );
    shader.fragmentShader = 'varying vec3 vStonePosition;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec2 stone = vStonePosition.xz;
      float grain = sin(stone.x * 57.0 + sin(stone.y * 39.0)) * sin(stone.y * 63.0);
      float grainFilter = 1.0 - smoothstep(0.01, 0.065, length(fwidth(stone)));
      float vein = sin(stone.x * 3.1 + stone.y * 1.7 + sin(stone.y * 2.2));
      diffuseColor.rgb *= 0.96 + 0.018 * vein + 0.024 * grain * grainFilter;
      ${
        tiles
          ? `vec2 cell = stone / vec2(3.6, 1.8);
      vec2 edge = abs(fract(cell - 0.5) - 0.5) / max(fwidth(cell), vec2(0.0001));
      float seam = 1.0 - smoothstep(0.5, 1.7, min(edge.x, edge.y));
      float shade = fract(sin(dot(floor(cell), vec2(12.9898, 78.233))) * 43758.5453);
      diffuseColor.rgb *= mix(0.94, 1.0, shade) * (1.0 - seam * 0.2);`
          : ''
      }
    `,
    );
  };
  material.customProgramCacheKey = () => `stone-finish-${tiles}-v2`;
}

export function makeGallery(scene) {
  const room = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: '#123c36', roughness: 0.63 });
  const stone = new THREE.MeshStandardMaterial({ color: '#d0b58b', roughness: 0.77 });
  const inset = new THREE.MeshStandardMaterial({ color: '#246252', roughness: 0.47, metalness: 0.15 });
  const trim = new THREE.MeshStandardMaterial({ color: '#b98e51', metalness: 0.8, roughness: 0.29 });
  const lamp = new THREE.MeshStandardMaterial({
    color: '#f6efdc',
    emissive: '#eee1c7',
    emissiveIntensity: 1.8,
    roughness: 0.3,
  });
  const batches = new Map();
  const transform = new THREE.Object3D();
  const box = (size, position, material, side = 0) => {
    const angle = (side * Math.PI) / 2;
    transform.position.set(
      position[0] * Math.cos(angle) + position[2] * Math.sin(angle),
      position[1],
      -position[0] * Math.sin(angle) + position[2] * Math.cos(angle),
    );
    transform.rotation.set(0, angle, 0);
    transform.scale.set(...size);
    transform.updateMatrix();
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push(transform.matrix.clone());
  };
  for (let side = 0; side < 4; side++) {
    box([40.3, 30, 0.35], [0, 15, -20], stone, side);
    box([40, 0.45, 0.6], [0, 0.225, -19.7], dark, side);
    box([40, 0.035, 0.2], [0, 0.5, -19.34], trim, side);
    for (let i = -2; i <= 2; i++) {
      const x = i * 7.5;
      box([6.6, 12.6, 0.5], [x, 7.5, -19.65], dark, side);
      box([5.8, 11.7, 0.18], [x, 7.55, -19.34], inset, side);
      box([5.6, 0.14, 0.85], [x, 1.7, -18.96], trim, side);
      for (const sign of [-1, 1]) {
        box([0.38, 13.2, 1.1], [x + sign * 3.4, 7.35, -19.3], stone, side);
        box([0.05, 11.65, 0.12], [x + sign * 2.84, 7.55, -19.18], lamp, side);
      }
      box([5.7, 0.12, 0.12], [x, 13.36, -19.18], lamp, side);
      for (let slat = -3; slat <= 3; slat++)
        box([0.035, 10.3, 0.08], [x + slat * 0.61, 7.65, -19.2], dark, side);
    }
    box([40, 0.7, 1.3], [0, 14.4, -19.35], stone, side);
    box([40, 0.08, 0.18], [0, 13.96, -18.68], lamp, side);
    for (let i = -4; i <= 4; i++) box([0.06, 14.8, 0.1], [i * 4.7, 22.3, -19.72], dark, side);
  }
  box([40.3, 0.35, 40.3], [0, 30, 0], dark);
  for (const x of [-14, -7, 0, 7, 14]) {
    box([0.45, 0.7, 40], [x, 29.5, 0], stone);
    box([40, 0.7, 0.45], [0, 29.5, x], stone);
  }
  for (const x of [-10.5, -3.5, 3.5, 10.5])
    for (const z of [-10.5, -3.5, 3.5, 10.5]) {
      box([5.9, 0.18, 5.9], [x, 29.78, z], inset);
      box([4.6, 0.05, 0.6], [x, 29.64, z], lamp);
    }
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  for (const [material, matrices] of batches) {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.computeBoundingSphere();
    room.add(mesh);
  }
  scene.add(room);
  return room;
}
