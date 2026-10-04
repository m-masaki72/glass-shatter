import * as THREE from 'three';

export async function prepareLandingMaterials(view) {
  const group = new THREE.Group(),
    geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  geometry.setAttribute(
    'fractureBirth',
    new THREE.Float32BufferAttribute(new Float32Array(24).fill(-1e6), 1),
  );
  geometry.setAttribute('crackData', new THREE.Float32BufferAttribute(new Float32Array(72), 3));
  group.add(new THREE.Mesh(geometry, view.fractureLight.material));
  group.add(
    new THREE.Mesh(geometry, [
      view.glass(0.2, false, false, true),
      view.glass(0.2, true, false, true),
      view.glass(0.2, false, true, true),
    ]),
  );
  for (const mesh of [view.splinters?.mesh, view.splinters?.clearMesh, view.contactShadows?.mesh]) {
    if (!mesh) continue;
    const instance = new THREE.InstancedMesh(mesh.geometry, mesh.material, 1);
    instance.setMatrixAt(0, new THREE.Matrix4());
    group.add(instance);
  }
  try {
    for (const target of [null, view.floorReflection.getRenderTarget()]) {
      const saved = view.renderer.getRenderTarget();
      let pending;
      try {
        view.renderer.setRenderTarget(target);
        pending = view.renderer.compileAsync(group, view.camera, view.scene);
      } finally {
        view.renderer.setRenderTarget(saved);
      }
      await pending;
    }
    await view.renderer.compileAsync(view.scene, view.camera);
  } finally {
    for (const child of group.children) if (child.isInstancedMesh) child.dispose();
    geometry.dispose();
  }
}
