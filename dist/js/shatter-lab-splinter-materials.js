import * as THREE from 'three';

export function splinterMaterial(refractive) {
  const material = new THREE.MeshPhysicalMaterial({
    color: '#f5fcff',
    metalness: 0,
    roughness: refractive ? 0.045 : 0.065,
    ior: 1.52,
    transmission: refractive ? 1 : 0,
    thickness: 0.045,
    attenuationColor: '#def3f0',
    attenuationDistance: 3.2,
    envMapIntensity: 1.15,
    transparent: true,
    depthWrite: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float shardFade; attribute float shardFlash; varying vec2 vShard;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShard = vec2(shardFade, shardFlash);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vShard;')
      .replace(
        '#include <opaque_fragment>',
        refractive
          ? `outgoingLight += vec3(0.6, 0.8, 0.9) * vShard.y * pow(abs(normal.z), 10.0);
             #include <opaque_fragment>
             gl_FragColor.a *= vShard.x;`
          : `vec3 glint = totalSpecular * 1.35 + vec3(0.8, 0.96, 1.0) * vShard.y * pow(abs(normal.z), 12.0);
             float coverage = clamp(0.055 + max3(glint) * 0.85, 0.055, 0.9);
             gl_FragColor = vec4(glint / max(coverage, 0.06), coverage * vShard.x);`,
      );
  };
  // Subpixel chips use environment-lit specular coverage; only the larger tier samples refraction.
  material.customProgramCacheKey = () => `glass-splinter-${refractive ? 'refraction' : 'glint'}-v2`;
  return material;
}
