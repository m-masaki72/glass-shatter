import * as THREE from 'three';
import { sub } from './shatter-lab-solid.js';
import { makeGlassGeometry } from './shatter-lab-geometry.js';
import { LandingSplinters } from './shatter-lab-splinters.js';
import { makeFloorReflection } from './shatter-lab-reflection.js';
import { makeGallery, stoneFinish } from './shatter-lab-room.js';
import { FootprintPreview } from './shatter-lab-footprint.js';
import { LandingEffects } from './shatter-lab-landing-effects.js';
import { LandingCamera } from './shatter-lab-landing-camera.js';
import { applyPiecePose } from './shatter-lab-motion.js';
import { ContactShadows } from './shatter-lab-contact-shadows.js';
import { FractureLight } from './shatter-lab-fracture-light.js';

export class CrystalView {
  constructor(host) {
    this.host = host;
    this.meshes = new Map();
    this.goalMeshes = new Map();
    this.materials = new Map();
    this.fractureLight = new FractureLight();
    this.azimuth = 0.36;
    this.elevation = Math.atan2(2.5, 11);
    this.distance = Math.hypot(11, 2.5);
    this.targetY = 1.9;
    this.minDistance = 6.7;
    this.maxDistance = 17;
    this.tint = '#def3f0';
    this.effects = [];
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.info.autoReset = false;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    host.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#b6a07d');
    this.scene.environment = this.studio();
    this.scene.environmentIntensity = 0.8;
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.05, 70);
    this.orbit(0);
    this.ray = new THREE.Raycaster();
    this.addRoom();
    this.footprint = new FootprintPreview(this.scene);
    this.floorReflection = makeFloorReflection(this.scene);
    this.splinters = new LandingSplinters(this.scene);
    this.contactShadows = new ContactShadows(this.scene);
    this.landingEffects = new LandingEffects();
    this.landingCamera = new LandingCamera();
    this.cameraTarget = new THREE.Vector3();
    this.splinters.mesh.userData.omitReflection = true;
    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.085, 0.093, 40),
      new THREE.MeshBasicMaterial({ color: '#d49b43', side: THREE.DoubleSide, depthTest: false }),
    );
    this.reticle.visible = false;
    this.reticle.userData.omitReflection = true;
    this.reticle.renderOrder = 10;
    this.scene.add(this.reticle);
    this.arrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(),
      0.8,
      0xe3b770,
      0.13,
      0.075,
    );
    this.arrow.visible = false;
    this.arrow.userData.omitReflection = true;
    for (const part of [this.arrow.line, this.arrow.cone]) {
      part.material.transparent = true;
      part.material.opacity = 0.9;
      part.material.depthTest = false;
      part.renderOrder = 12;
    }
    this.scene.add(this.arrow);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }
  studio() {
    const width = 512,
      height = 256,
      data = new Float32Array(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        let c = [0.015, 0.055, 0.043];
        if (y < height * 0.38) c = [0.23, 0.18, 0.115];
        if (y > height * 0.42 && y < height * 0.72)
          c = x < width * 0.5 ? [0.11, 0.27, 0.21] : [0.3, 0.17, 0.065];
        for (const [cx, cy, w, h, p, color] of [
          [0.11, 0.32, 0.04, 0.5, 11, [0.82, 0.91, 1]],
          [0.52, 0.3, 0.09, 0.43, 6, [1, 0.89, 0.72]],
          [0.8, 0.3, 0.015, 0.5, 16, [1, 1, 1]],
          [0.32, 0.09, 0.22, 0.05, 9, [1, 1, 1]],
        ])
          if (Math.abs(x / width - cx) < w / 2 && Math.abs(y / height - cy) < h / 2)
            c = color.map((v) => v * p);
        data.set([...c, 1], (y * width + x) * 4);
      }
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.needsUpdate = true;
    const generator = new THREE.PMREMGenerator(this.renderer),
      target = generator.fromEquirectangular(texture);
    texture.dispose();
    generator.dispose();
    this.environmentTarget = target;
    return target.texture;
  }
  addRoom() {
    this.scene.add(new THREE.HemisphereLight('#e8f4ff', '#48453e', 1.5));
    const key = new THREE.DirectionalLight('#fff3de', 3);
    key.position.set(-4, 7, 4);
    this.scene.add(key);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ color: '#a5845e', roughness: 0.55, metalness: 0.08 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.03;
    stoneFinish(floor.material, true);
    this.scene.add(floor);
    this.floor = floor;
    const tableMaterial = new THREE.MeshStandardMaterial({
      color: '#285949',
      roughness: 0.36,
      metalness: 0.12,
    });
    tableMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = 'varying vec3 vTablePosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvTablePosition = position;',
      );
      shader.fragmentShader = 'varying vec3 vTablePosition;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float radius = length(vTablePosition.xz);
        float seam = 1.0 - smoothstep(0.003, 0.014, abs(radius - 3.17));
        float edgeBand = smoothstep(3.23, 3.35, radius);
        diffuseColor.rgb *= mix(1.0, 0.42, edgeBand) * (1.0 - seam * 0.6);`,
      );
    };
    tableMaterial.customProgramCacheKey = () => 'inlaid-studio-table-v2';
    stoneFinish(tableMaterial);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(3.45, 3.5, 0.13, 100), tableMaterial);
    plinth.position.y = -0.085;
    this.scene.add(plinth);
    this.table = plinth;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.32, 0.012, 8, 128),
      new THREE.MeshStandardMaterial({ color: '#af8d5b', metalness: 0.8, roughness: 0.2 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.012;
    this.scene.add(ring);
    this.tableRing = ring;
    this.room = makeGallery(this.scene);
  }
  setStage(stage) {
    this.stage = stage;
    const tints = {
      clear: '#def3f0',
      mint: '#8cd8b7',
      blue: '#8dc7ee',
      pink: '#eeb5cd',
      amber: '#edc27f',
      violet: '#b7a0e4',
    };
    this.tint = tints[stage.spec.color] || tints.clear;
    for (const material of this.materials.values()) material.attenuationColor.set(this.tint);
    this.azimuth = 0.36;
    this.fitStage();
  }
  fitStage() {
    if (!this.stage) return;
    const { min, max } = this.stage.bounds;
    const width = max[0] - min[0],
      height = max[1] - min[1],
      depth = max[2] - min[2];
    this.targetY = Math.max(0.25, (max[1] + min[1]) / 2);
    this.elevation = this.stage.viewElevation ?? Math.atan2(2.5, 11);
    const tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.distance = Math.max(
      5.5,
      Math.max(height / 2 / tangent, Math.hypot(width, depth) / 2 / tangent / this.camera.aspect) * 1.22 +
        depth,
    );
    this.minDistance = Math.max(3.8, this.distance * 0.45);
    this.fittedDistance = this.distance;
    this.maxDistance = Math.max(17, this.distance * 1.8);
    const roomRadius = this.maxDistance + this.targetY + 6;
    this.room.scale.setScalar(roomRadius / 20);
    this.floor.scale.setScalar(Math.max(1, roomRadius / 45));
    this.camera.far = roomRadius * 4;
    this.camera.updateProjectionMatrix();
    const radius = Math.max(3.45, Math.hypot(width, depth) / 2 + 0.9);
    this.table.scale.set(radius / 3.45, 1, radius / 3.45);
    this.tableRing.scale.setScalar(radius / 3.45);
    this.floorReflection.scale.setScalar(radius / 3.45);
    this.orbit(0);
  }
  glass(depth, cut = false, bevel = false, frontOnly = false) {
    const bucket = Math.max(0.03, Math.round(depth * 10) / 10),
      key = `${bucket}:${cut}:${bevel}:${frontOnly}`;
    if (this.materials.has(key)) return this.materials.get(key);
    const material = new THREE.MeshPhysicalMaterial({
      color: '#f5fcff',
      metalness: 0,
      roughness: cut ? 0.085 : bevel ? 0.018 : 0.025,
      transmission: 1,
      thickness: bucket,
      ior: 1.52,
      dispersion: 0.45,
      attenuationColor: this.tint,
      attenuationDistance: 3.2,
      envMapIntensity: 1.1,
      side: frontOnly ? THREE.FrontSide : THREE.DoubleSide,
    });
    if (cut) {
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = 'varying vec3 vFracturePosition;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvFracturePosition = position;',
        );
        shader.fragmentShader = 'varying vec3 vFracturePosition;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          float grain = sin(vFracturePosition.x * 173.0 + sin(vFracturePosition.z * 91.0))
            * sin(vFracturePosition.y * 227.0 + vFracturePosition.z * 147.0);
          roughnessFactor = clamp(roughnessFactor + 0.006 * grain, 0.065, 0.105);`,
        );
      };
      material.customProgramCacheKey = () => 'fracture-micro-roughness-v4';
      this.fractureLight.decorate(material);
    }
    this.materials.set(key, material);
    return material;
  }
  add(piece) {
    const geometry = makeGlassGeometry(piece);
    const cracks = this.fractureLight.attach(piece, geometry);
    const depth = Math.min(...piece.max.map((v, i) => v - piece.min[i]));
    const frontOnly = piece.landingDepth > 0;
    const mesh = new THREE.Mesh(geometry, [
      this.glass(depth, false, false, frontOnly),
      this.glass(depth, true, false, frontOnly),
      this.glass(depth, false, true, frontOnly),
    ]);
    mesh.position.set(...piece.center);
    mesh.userData.piece = piece;
    this.scene.add(mesh);
    this.meshes.set(piece.id, mesh);
    if (cracks) mesh.add(cracks);
    else if (piece.cracked) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 22),
        new THREE.LineBasicMaterial({ color: '#e2f3f4', transparent: true, opacity: 0.22 }),
      );
      if (piece.impactPoint) {
        const a = edges.geometry.attributes.position.array,
          segments = [],
          origin = sub(piece.impactPoint, piece.center);
        for (let i = 0; i < a.length; i += 6) segments.push(Array.from(a.slice(i, i + 6)));
        const distance = (s) => Math.hypot(...origin.map((v, i) => (s[i] + s[i + 3]) / 2 - v));
        segments.sort((a, b) => distance(a) - distance(b));
        edges.geometry.setAttribute('position', new THREE.Float32BufferAttribute(segments.flat(), 3));
      }
      mesh.add(edges);
    }
  }
  remove(piece) {
    const mesh = this.meshes.get(piece.id);
    if (!mesh) return;
    mesh.traverse((o) => {
      o.geometry?.dispose();
      if (o.isLineSegments) o.material.dispose();
    });
    if (mesh.userData.retiring) for (const material of mesh.material) material.dispose();
    this.scene.remove(mesh);
    this.meshes.delete(piece.id);
  }
  addGoal(ball) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(ball.radius, 24, 16),
      new THREE.MeshStandardMaterial({
        color: ball.color,
        metalness: 0.35,
        roughness: 0.23,
        emissive: ball.color,
        emissiveIntensity: 0.18,
      }),
    );
    mesh.userData.ball = ball;
    mesh.position.copy(ball.body.translation());
    this.goalMeshes.set(ball.id, mesh);
    this.scene.add(mesh);
  }
  removeGoal(ball) {
    const mesh = this.goalMeshes.get(ball.id);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    this.goalMeshes.delete(ball.id);
  }
  orbit(amount, elevation = 0, distance = 0) {
    this.landingCamera?.cancel(this.landingEffects?.beat.sequenceStarted);
    this.azimuth = THREE.MathUtils.euclideanModulo(this.azimuth + amount + Math.PI, Math.PI * 2) - Math.PI;
    this.elevation = THREE.MathUtils.clamp(this.elevation + elevation, 0.06, 0.95);
    this.distance = THREE.MathUtils.clamp(this.distance + distance, this.minDistance, this.maxDistance);
    this.updateCamera();
  }
  updateCamera() {
    const horizontal = Math.cos(this.elevation) * this.distance;
    this.camera.position.set(
      Math.sin(this.azimuth) * horizontal,
      this.targetY + Math.sin(this.elevation) * this.distance,
      Math.cos(this.azimuth) * horizontal,
    );
    this.camera.lookAt(0, this.targetY, 0);
    if (this.landingCamera) {
      this.cameraTarget.set(0, this.targetY, 0);
      const beat = this.landingEffects.beat;
      this.landingCamera.apply(this.camera, this.cameraTarget, beat.age, beat.sequenceAge);
    }
    this.camera.updateMatrixWorld(true);
  }
  updatePresentation(wallDelta) {
    this.landingEffects.update(wallDelta);
    this.updateCamera();
  }
  cancelLandingCamera() {
    this.landingCamera.cancel(this.landingEffects.beat.sequenceStarted);
    this.updateCamera();
  }
  resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    const elevation = this.elevation;
    const zoom = this.fittedDistance ? this.distance / this.fittedDistance : 1;
    this.camera.aspect = w / h;
    this.camera.fov = w < 600 ? 48 : 36;
    this.camera.updateProjectionMatrix();
    this.fitStage();
    this.elevation = elevation;
    if (this.fittedDistance) this.distance = this.fittedDistance * zoom;
    this.orbit(0);
    this.renderer.setSize(w, h);
  }
  hit(ndc) {
    this.scene.updateMatrixWorld(true);
    this.ray.setFromCamera(ndc, this.camera);
    return this.ray.intersectObjects([...this.meshes.values()], false)[0] || null;
  }
  direction(dx, dy) {
    const angle = Math.atan2(-dy, dx),
      axis = new THREE.Vector3(Math.cos(angle), Math.sin(angle), -1.7);
    return axis.applyQuaternion(this.camera.quaternion).normalize();
  }
  preview(hit, direction, contact, polygon, tool) {
    this.footprint.update(hit?.point.toArray(), contact, polygon, tool);
    if (!hit) {
      this.previewInfo = null;
      this.reticle.visible = false;
      this.arrow.visible = false;
      return;
    }
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    this.previewInfo = direction
      ? { normal: n.toArray(), direction: direction.toArray(), incidence: Math.max(0, -direction.dot(n)) }
      : null;
    this.reticle.visible = true;
    this.reticle.position.copy(hit.point).addScaledVector(n, 0.009);
    this.reticle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    this.arrow.visible = !!direction;
    if (direction) {
      this.arrow.position.copy(hit.point).addScaledVector(n, 0.13).addScaledVector(direction, -0.65);
      this.arrow.setDirection(direction);
      this.arrow.setLength(0.65, 0.1, 0.06);
    }
  }
  clearEffects() {
    this.landingEffects.clear();
    this.landingCamera.reset();
    this.updateCamera();
    this.splinters.clear();
    this.contactShadows.clear();
    for (const e of this.effects) {
      this.scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mesh.material.dispose();
    }
    this.effects = [];
  }
  burst(event, allowCamera = true) {
    const { point, volume, kind } = event;
    if (kind === 'secondary') {
      if (this.landingEffects.trigger(event)) {
        const beat = this.landingEffects.beat;
        this.landingCamera.start(point, beat.sequenceStarted, beat.combo > 1, allowCamera);
      }
      this.splinters.emit(event);
      return;
    }
    const positions = [],
      velocities = [];
    for (let i = 0; i < Math.min(90, 20 + volume * 200); i++) {
      positions.push(...point);
      velocities.push((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mesh = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: '#e7f9ff',
        size: 0.018,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    );
    this.scene.add(mesh);
    mesh.userData.omitReflection = true;
    this.effects.push({ mesh, velocities, age: 0 });
  }
  render(delta, alpha = 1, wallDelta = delta) {
    this.fractureLight.update(wallDelta);
    this.splinters.update(delta);
    for (const mesh of this.goalMeshes.values()) {
      const ball = mesh.userData.ball;
      mesh.position.copy(ball.body.translation());
      mesh.quaternion.copy(ball.body.rotation());
    }
    for (const mesh of this.meshes.values()) {
      const p = mesh.userData.piece;
      applyPiecePose(mesh, alpha);
      const remaining = p.expiresAt - (p.created + p.age);
      if (p.dynamic && remaining < 0.22) {
        if (!mesh.userData.retiring) {
          mesh.userData.retiring = true;
          mesh.material = mesh.material.map((m) => {
            const copy = m.clone();
            copy.onBeforeCompile = m.onBeforeCompile;
            copy.customProgramCacheKey = m.customProgramCacheKey;
            copy.alphaHash = true;
            return copy;
          });
        }
        for (const material of mesh.material) material.opacity = Math.max(0, remaining / 0.22);
      }
      for (const edges of mesh.children) {
        if (edges.userData.fractureBirth !== undefined)
          edges.visible =
            this.fractureLight.enabled && this.fractureLight.time.value - edges.userData.fractureBirth < 0.27;
        if (edges.isLineSegments) {
          const count = edges.geometry.attributes.position.count;
          edges.geometry.setDrawRange(
            0,
            Math.min(count, 2 * Math.ceil((count / 2) * Math.min(1, p.age / 0.12))),
          );
          edges.material.opacity = 0.1 + 0.24 * Math.exp(-p.age * 5);
        }
      }
    }
    this.effects = this.effects.filter((e) => {
      e.age += delta;
      const duration = e.duration ?? 0.7;
      if (e.age > duration) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        return false;
      }
      const a = e.mesh.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        e.velocities[i * 3 + 1] -= 9.81 * delta;
        for (let j = 0; j < 3; j++) a.array[i * 3 + j] += e.velocities[i * 3 + j] * delta;
      }
      a.needsUpdate = true;
      e.mesh.material.opacity = (1 - e.age / duration) * 0.7;
      return true;
    });
    this.contactShadows.update(this.meshes);
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
  }
}
