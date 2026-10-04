import * as THREE from 'three';
import { normal, sub } from './shatter-lab-solid.js';

export function makeGlassGeometry(piece) {
  const geometry = new THREE.BufferGeometry(),
    positions = [],
    normals = [];
  for (const [index, tag] of ['polished', 'cut', 'bevel'].entries()) {
    const start = positions.length / 3;
    for (const face of piece.faces) {
      const surface = face.tag === 'cut' || face.tag === 'bevel' ? face.tag : 'polished';
      if (surface !== tag) continue;
      const n = normal(face);
      for (let i = 1; i < face.points.length - 1; i++)
        for (const vertex of [face.points[0], face.points[i], face.points[i + 1]]) {
          positions.push(...sub(vertex, piece.center));
          normals.push(...n);
        }
    }
    const count = positions.length / 3 - start;
    if (count) geometry.addGroup(start, count, index);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}
