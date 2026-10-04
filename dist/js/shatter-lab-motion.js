import * as THREE from 'three';

const rotation = new THREE.Quaternion();

export function applyPiecePose(mesh, alpha = 1) {
  const piece = mesh.userData.piece;
  if (!piece.dynamic) return;
  const position = piece.body.translation(),
    currentRotation = piece.body.rotation();
  const blend = THREE.MathUtils.clamp(alpha, 0, 1);
  mesh.position.lerpVectors(piece.previousPosition || position, position, blend);
  mesh.quaternion
    .copy(piece.previousRotation || currentRotation)
    .slerp(rotation.copy(currentRotation), blend);
}

export function physicalContact(hit) {
  const piece = hit.object.userData.piece;
  const point = hit.object.worldToLocal(hit.point.clone());
  const orientation = new THREE.Quaternion().copy(piece.body.rotation());
  point.applyQuaternion(orientation).add(piece.body.translation());
  return { point, normal: hit.face.normal.clone().applyQuaternion(orientation).normalize() };
}
