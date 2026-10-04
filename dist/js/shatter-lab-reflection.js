import * as THREE from 'three';
import { Reflector } from '../vendor/Reflector.js';

export function makeFloorReflection(scene) {
  const shader = {
    ...Reflector.ReflectorShader,
    fragmentShader: Reflector.ReflectorShader.fragmentShader.replace(
      'vec4( blendOverlay( base.rgb, color ), 1.0 )',
      'vec4( blendOverlay( base.rgb, color ), 0.12 )',
    ),
  };
  const mirror = new Reflector(new THREE.CircleGeometry(3.45, 96), {
    textureWidth: 768,
    textureHeight: 768,
    multisample: 0,
    clipBias: 0.003,
    color: 0x999999,
    shader,
  });
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.y = -0.017;
  mirror.material.transparent = true;
  mirror.material.depthWrite = false;
  const reflect = mirror.onBeforeRender;
  mirror.onBeforeRender = function (...args) {
    const hidden = [];
    scene.traverse((object) => {
      if (object.visible && object.userData.omitReflection) {
        hidden.push(object);
        object.visible = false;
      }
    });
    try {
      reflect.apply(this, args);
    } finally {
      for (const object of hidden) object.visible = true;
    }
  };
  scene.add(mirror);
  return mirror;
}
