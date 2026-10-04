import * as THREE from 'three';
import { makeGlassGeometry } from '../../dist/js/shatter-lab-geometry.js';
import { contactSurface, solveContact } from '../../dist/js/shatter-lab-contact.js';
import { solidInfo } from '../../dist/js/shatter-lab-solid.js';

export function strategyStage(factory, size = 1) {
  const stage = factory();
  stage.solids = stage.solids.map((part) => ({
    ...part,
    faces: part.faces.map((face) => ({ ...face, points: face.points.map((p) => p.map((x) => x * size)) })),
  }));
  const info = stage.solids.map((p) => solidInfo(p.faces));
  stage.bounds = {
    min: [0, 1, 2].map((i) => Math.min(...info.map((p) => p.min[i]))),
    max: [0, 1, 2].map((i) => Math.max(...info.map((p) => p.max[i]))),
  };
  return stage;
}

export function strategyCamera(stage, azimuth = 0.36, aspect = 1.84) {
  const camera = new THREE.PerspectiveCamera(36, aspect, 0.05, 100),
    { min, max } = stage.bounds,
    width = max[0] - min[0],
    height = max[1] - min[1],
    depth = max[2] - min[2],
    targetY = (max[1] + min[1]) / 2,
    tangent = Math.tan(THREE.MathUtils.degToRad(18)),
    distance = Math.max(
      5.5,
      Math.max(height / 2 / tangent, Math.hypot(width, depth) / 2 / tangent / aspect) * 1.22 + depth,
    ),
    elevation = stage.viewElevation ?? 0.35,
    horizontal = Math.cos(elevation) * distance;
  camera.position.set(
    Math.sin(azimuth) * horizontal,
    targetY + Math.sin(elevation) * distance,
    Math.cos(azimuth) * horizontal,
  );
  camera.lookAt(0, targetY, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

export function strategyRay(
  world,
  stage,
  name,
  { point, azimuth = 0.36, aspect = 1.84, tool = 'hammer' } = {},
) {
  const part = [...world.pieces.values()]
    .filter((p) => p.name === name && !p.dynamic)
    .sort((a, b) => b.volume - a.volume)[0];
  if (!part) return null;
  const material = new THREE.MeshBasicMaterial(),
    meshes = [...world.pieces.values()].map((p) => {
      const mesh = new THREE.Mesh(makeGlassGeometry(p), [material, material, material]);
      mesh.position.copy(p.body.translation());
      mesh.quaternion.copy(p.body.rotation());
      mesh.userData.piece = p;
      mesh.updateMatrixWorld(true);
      return mesh;
    });
  try {
    const camera = strategyCamera(stage, azimuth, aspect),
      target = new THREE.Vector3(...(point ?? part.center)),
      ray = new THREE.Raycaster(camera.position, target.sub(camera.position).normalize()),
      hit = ray.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    const p = hit.object.userData.piece,
      position = hit.point.toArray(),
      n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).toArray(),
      surface = contactSurface(world.worldFaces(p), position, n),
      angle = Math.atan2(tool === 'pick' ? -0.4 : -0.7, tool === 'pick' ? -0.45 : -0.95),
      direction = new THREE.Vector3(Math.cos(angle), Math.sin(angle), -1.7)
        .applyQuaternion(camera.quaternion)
        .normalize()
        .toArray();
    return {
      piece: p,
      point: position,
      normal: n,
      thickness: surface.thickness,
      contact: solveContact(tool, n, direction, surface.thickness, surface),
    };
  } finally {
    for (const mesh of meshes) mesh.geometry.dispose();
    material.dispose();
  }
}

export function strikeStrategy(world, stage, name, options) {
  const hit = strategyRay(world, stage, name, options);
  if (!hit || hit.piece.name !== name) return false;
  return world.hit(hit.piece.id, hit.point, hit.contact);
}

export function settleStrategy(world, seconds = 3) {
  for (let i = 0; i < seconds * 120; i++) world.step(1 / 120);
}
