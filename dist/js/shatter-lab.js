import * as THREE from 'three';
import { CrystalView } from './shatter-lab-view.js';
import { FractureWorld, STEP } from './shatter-lab-world.js';
import { solveContact, contactSurface } from './shatter-lab-contact.js';
import { CollisionAudio } from './shatter-lab-audio.js';
import { ContactTool } from './shatter-lab-tool.js';
import { bindStageComposer } from './shatter-lab-composer.js';
import { parseStagePrompt, makeStage } from './shatter-lab-stage.js';
import { PlayExperience, readAudioPreferences, saveAudioPreferences } from './shatter-lab-experience.js';
import { aimDescription } from './shatter-lab-readout.js';
import { physicalContact } from './shatter-lab-motion.js';
import { prepareLandingMaterials } from './shatter-lab-warmup.js';
import { readStageSelection, DEFAULT_STAGE_PROMPT } from './shatter-lab-save.js';

const $ = (s) => document.querySelector(s),
  host = $('#crystal-viewport');
const view = new CrystalView(host),
  audio = new CollisionAudio(),
  weapon = new ContactTool(view.scene);
let world,
  navigation = null,
  orbitDrag = null,
  hovering = false,
  tool = 'hammer',
  slow = false,
  ready = false,
  previous = performance.now(),
  fps = 60,
  aim = new THREE.Vector2(),
  lastStats = 0;
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = motionPreference.matches;
motionPreference.addEventListener('change', (event) => {
  reducedMotion = event.matches;
  view.fractureLight.enabled = !reducedMotion;
  if (reducedMotion) view.clearEffects();
});
view.fractureLight.enabled = !reducedMotion;
const status = (message) => ($('#lab-status').textContent = message);
const controlHint = () =>
  matchMedia('(pointer: coarse)').matches
    ? 'ガラスをタップ · 空白をドラッグで視点移動'
    : 'ガラスをクリック · 空白／右ドラッグで視点移動';
const aimLabel = $('#aim-readout');
function showAim(text = '') {
  aimLabel.hidden = !text;
  if (aimLabel.textContent !== text) aimLabel.textContent = text;
}
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}
const preferences = readAudioPreferences(storage);
audio.setVolume(preferences.volume);
audio.setEnabled(preferences.enabled);
audio.setMusicEnabled(preferences.musicEnabled);
$('#lab-volume').value = String(Math.round(preferences.volume * 100));
function syncSound() {
  $('#lab-sound').textContent = audio.enabled ? '音 ON' : '音 OFF';
  $('#lab-sound').setAttribute('aria-pressed', String(audio.enabled));
  $('#lab-music').textContent = audio.musicEnabled ? 'BGM ON' : 'BGM OFF';
  $('#lab-music').setAttribute('aria-pressed', String(audio.musicEnabled));
}
syncSound();
const experience = new PlayExperience({
  host,
  reset: resetStage,
  cancel,
  storage,
  home: () => {
    if (!ready) return;
    cancel();
    view.azimuth = 0.36;
    view.fitStage();
  },
});
function resetStage() {
  if (!ready) return;
  cancel();
  view.clearEffects();
  audio.reset();
  experience.update(world);
  world.reset();
  experience.reset(view.stage.spec);
  status('同じ形でもう一度。道具・角度・打点を変えて、最大の一撃を狙おう。');
}
const coordinates = (event) => {
  const r = host.getBoundingClientRect();
  return new THREE.Vector2(
    ((event.clientX - r.left) / r.width) * 2 - 1,
    1 - ((event.clientY - r.top) / r.height) * 2,
  );
};
const defaultDirection = (hit) => {
  const direction = view.direction(tool === 'pick' ? -0.45 : -0.95, tool === 'pick' ? 0.4 : 0.7);
  if (tool === 'bat' && hit) {
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const opposite = view.direction(1, 0.12);
    // Choose the accessible side of the face instead of swinging out through its back.
    if (direction.dot(normal) > -0.15 && opposite.dot(normal) < direction.dot(normal)) return opposite;
  }
  return direction;
};
function stopOrbit() {
  const previous = orbitDrag;
  orbitDrag = null;
  host.classList.remove('orbiting');
  if (previous && host.hasPointerCapture(previous.id)) host.releasePointerCapture(previous.id);
}
function beginOrbit(event, active) {
  if (active) cancel();
  hovering = false;
  view.preview(null);
  showAim();
  if (!weapon.animation) weapon.cancel();
  host.focus({ preventScroll: true });
  orbitDrag = {
    id: event.pointerId,
    buttons: event.button === 2 ? 2 : 1,
    x: event.clientX,
    y: event.clientY,
    active,
  };
  host.setPointerCapture(event.pointerId);
  host.classList.toggle('orbiting', active);
}
function cancel() {
  view.cancelLandingCamera();
  stopOrbit();
  navigation = null;
  hovering = false;
  view.preview(null);
  showAim();
  weapon.cancel();
}
function select(next) {
  cancel();
  tool = next;
  weapon.setTool(tool);
  document
    .querySelectorAll('[data-lab-tool]')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.labTool === tool)));
}
function strike(hit, direction) {
  if (!ready || orbitDrag || weapon.animation || !hit) return;
  view.preview(null);
  showAim();
  const { point, normal: n } = physicalContact(hit),
    id = hit.object.userData.piece.id;
  const p = world.pieces.get(id);
  if (!p) return;
  const surface = contactSurface(world.worldFaces(p), point.toArray(), n.toArray());
  const contact = solveContact(tool, n.toArray(), direction.toArray(), surface.thickness, surface);
  view.cancelLandingCamera();
  weapon.swing(hit, direction, () => {
    if (world.hit(id, point.toArray(), contact)) {
      experience.strike(world, tool);
      const degrees = Math.round((Math.acos(contact.incidence) * 180) / Math.PI);
      status(
        `${tool === 'hammer' ? 'ハンマー' : 'ピック'} · 入射角 ${degrees}° · ${contact.incidence < 0.4 ? '表面をかすめた' : tool === 'hammer' ? '広い範囲を叩き欠いた' : '狭い点を深く削った'}`,
      );
    } else status('かすめました。面に向かう方向で当ててみてください。');
  });
}
host.addEventListener('contextmenu', (event) => event.preventDefault());
host.addEventListener('pointerdown', (event) => {
  if (event.button === 2 && event.isPrimary) {
    event.preventDefault();
    beginOrbit(event, true);
    return;
  }
  if (event.button !== 0 || !event.isPrimary || !ready || orbitDrag) return;
  event.preventDefault();
  host.focus({ preventScroll: true });
  aim.copy(coordinates(event));
  view.preview(null);
  const hit = view.hit(aim);
  if (!hit) {
    beginOrbit(event, false);
    return;
  }
  audio.unlock().catch(() => status('音を開始できませんでした。'));
  strike(hit, defaultDirection(hit));
});
host.addEventListener('pointermove', (event) => {
  if (orbitDrag) {
    if (orbitDrag.id !== event.pointerId) return;
    if (!(event.buttons & orbitDrag.buttons)) stopOrbit();
    else {
      if (!orbitDrag.active) {
        if (Math.hypot(event.clientX - orbitDrag.x, event.clientY - orbitDrag.y) < 6) return;
        orbitDrag.active = true;
        navigation = null;
        weapon.cancel();
        host.classList.add('orbiting');
      }
      view.orbit((orbitDrag.x - event.clientX) * 0.005, (event.clientY - orbitDrag.y) * 0.005);
      orbitDrag.x = event.clientX;
      orbitDrag.y = event.clientY;
      return;
    }
  }
  aim.copy(coordinates(event));
  hovering = event.pointerType !== 'touch' && event.buttons === 0;
});
host.addEventListener('pointerup', (event) => {
  if (orbitDrag?.id !== event.pointerId || event.buttons & orbitDrag.buttons) return;
  stopOrbit();
  aim.copy(coordinates(event));
  hovering = event.pointerType !== 'touch' && Math.abs(aim.x) <= 1 && Math.abs(aim.y) <= 1;
});
host.addEventListener('lostpointercapture', (event) => {
  if (orbitDrag?.id === event.pointerId) stopOrbit();
});
host.addEventListener('pointercancel', cancel);
host.addEventListener('pointerleave', () => {
  hovering = false;
  view.preview(null);
  showAim();
  if (!weapon.animation) weapon.cancel();
});
window.addEventListener('blur', cancel);
document.addEventListener('visibilitychange', () => {
  audio.setVisible(!document.hidden);
  cancel();
  previous = performance.now();
  if (ready) experience.update(world);
});
window.addEventListener('pagehide', () => {
  audio.setVisible(false);
  if (ready) experience.update(world);
});
window.addEventListener('pageshow', () => audio.setVisible(!document.hidden));
host.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (!event.repeat && ['r', 's', 'm'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    if (event.key.toLowerCase() === 'r') resetStage();
    if (event.key.toLowerCase() === 's') $('#lab-slow').click();
    if (event.key.toLowerCase() === 'm') $('#lab-sound').click();
    return;
  }
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) event.preventDefault();
  if (event.key.startsWith('Arrow')) {
    aim.x += event.key === 'ArrowRight' ? 0.06 : event.key === 'ArrowLeft' ? -0.06 : 0;
    aim.y += event.key === 'ArrowUp' ? 0.06 : event.key === 'ArrowDown' ? -0.06 : 0;
    aim.clampScalar(-0.95, 0.95);
    hovering = true;
  }
  if (event.code === 'Space' && !event.repeat) {
    audio.unlock();
    const hit = view.hit(aim);
    strike(hit, defaultDirection(hit));
  }
  if (event.key === '1') select('hammer');
  if (event.key === '2') select('pick');
});
document
  .querySelectorAll('[data-lab-tool]')
  .forEach((button) => button.addEventListener('click', () => select(button.dataset.labTool)));
$('#lab-sound').addEventListener('click', () => {
  audio.unlock();
  audio.setEnabled(!audio.enabled);
  syncSound();
  saveAudioPreferences(storage, audio);
});
$('#lab-volume').addEventListener('input', (e) => {
  audio.setVolume(Number(e.target.value) / 100);
  saveAudioPreferences(storage, audio);
});
$('#lab-music').addEventListener('click', () => {
  audio.setMusicEnabled(!audio.musicEnabled);
  audio.unlock();
  syncSound();
  saveAudioPreferences(storage, audio);
});
document.addEventListener(
  'pointerdown',
  () => {
    audio.unlock();
  },
  { once: true },
);
document.addEventListener(
  'keydown',
  () => {
    audio.unlock();
  },
  { once: true },
);
$('#lab-slow').addEventListener('click', () => {
  slow = !slow;
  $('#lab-slow').setAttribute('aria-pressed', String(slow));
  $('#slow-indicator').hidden = !slow;
});
for (const [id, delta] of [
  ['#view-left', [-0.12, 0, 0]],
  ['#view-right', [0.12, 0, 0]],
  ['#view-up', [0, 0.08, 0]],
  ['#view-down', [0, -0.08, 0]],
  ['#view-near', [0, 0, -0.65]],
  ['#view-far', [0, 0, 0.65]],
]) {
  const button = $(id);
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    cancel();
    button.focus({ preventScroll: true });
    button.setPointerCapture(event.pointerId);
    view.orbit(...delta);
    navigation = { button, id: event.pointerId, delta, next: performance.now() + 320 };
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    button.addEventListener(type, (event) => {
      if (navigation?.button === button && navigation.id === event.pointerId) navigation = null;
    });
  button.addEventListener('click', (event) => {
    if (event.detail !== 0) return;
    cancel();
    view.orbit(...delta);
  });
}
function frame(time) {
  const wallDelta = Math.max(0, (time - previous) / 1000),
    dt = Math.min(0.05, wallDelta);
  previous = time;
  if (document.hidden) {
    requestAnimationFrame(frame);
    return;
  }
  fps = fps * 0.96 + (wallDelta ? 1 / wallDelta : 60) * 0.04;
  if (navigation && time >= navigation.next) {
    view.orbit(...navigation.delta.map((v) => v * dt * 7));
  }
  view.updatePresentation(wallDelta);
  const impactScale = reducedMotion ? 1 : view.landingEffects.beat.scale;
  const simulationDelta = dt * Math.min(slow ? 0.28 : 1, impactScale);
  const beat = view.landingEffects.beat;
  $('#slow-indicator').hidden = !slow && impactScale === 1 && !beat.labelActive;
  $('#slow-indicator').classList.toggle('combo', beat.labelActive);
  const slowLabel = beat.labelActive
    ? `${beat.combo}連鎖！${slow ? ' · スロー中' : ''}`
    : slow
      ? 'スロー中'
      : '着地スロー';
  if ($('#slow-indicator').textContent !== slowLabel) $('#slow-indicator').textContent = slowLabel;
  audio.cameraRight = [Math.cos(view.azimuth), 0, -Math.sin(view.azimuth)];
  if (ready && !document.hidden) {
    weapon.update(dt * (slow ? 0.28 : 1));
    world.step(simulationDelta);
    experience.tick(world);
  }
  audio.flush();
  if (!weapon.animation) {
    const hit = ready && hovering && !navigation && !orbitDrag && !document.hidden ? view.hit(aim) : null;
    host.classList.toggle('empty-aim', hovering && !hit && !orbitDrag && !navigation);
    const direction = defaultDirection(hit);
    if (hit) {
      const { point, normal: n } = physicalContact(hit);
      const surface = contactSurface(
        world.worldFaces(world.pieces.get(hit.object.userData.piece.id)),
        point.toArray(),
        n.toArray(),
      );
      const contact = solveContact(tool, n.toArray(), direction.toArray(), surface.thickness, surface);
      view.preview(hit, direction, contact, surface.polygon, tool);
      showAim(aimDescription(hit.object.userData.piece, contact, tool, surface.thickness));
    } else {
      view.preview(null);
      showAim();
    }
    if (hit) weapon.preview(hit, direction);
    else weapon.cancel();
  }
  view.render(simulationDelta, world ? world.accumulator / STEP : 1, wallDelta);
  if (ready && time - lastStats > 350) {
    lastStats = time;
    const s = world.snapshot();
    $('#lab-stats').textContent = `${Math.round(fps)} fps · ${s.bodies} bodies · 二次破壊 ${s.secondary}`;
    experience.update(world);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
try {
  await FractureWorld.init();
  world = new FractureWorld({
    add: (p) => view.add(p),
    remove: (p) => view.remove(p),
    impact: (e) => {
      if (ready) experience.landing(e, world);
      if (!reducedMotion)
        view.burst(
          e,
          !orbitDrag?.active && !navigation && !weapon.animation && !experience.panels.active?.open,
        );
      audio.sound({ ...e, tool, glass: true, impulse: e.energy * 0.4 });
    },
    collision: (e) => audio.sound(e),
  });
  status('ガラスと着地演出を準備しています…');
  await prepareLandingMaterials(view);
  const savedSelection = readStageSelection(storage);
  const initialSpec = savedSelection || parseStagePrompt(DEFAULT_STAGE_PROMPT);
  bindStageComposer(
    (stage) => {
      cancel();
      view.clearEffects();
      audio.reset();
      experience.update(world);
      view.setStage(stage);
      world.reset(stage.solids, []);
      experience.reset(stage.spec);
      document.querySelector('#stage-name').textContent = stage.spec.name;
      document.querySelector('.stage').setAttribute('aria-label', stage.spec.name);
      $('#stage-hint').textContent = stage.hint || '狙う → 欠く → 支えを失ったガラスが落ちる';
      status(controlHint());
      return stage;
    },
    () => experience.panels.close(host),
    { storage, initialPrompt: initialSpec.text },
  );
  const initial = makeStage(initialSpec);
  view.setStage(initial);
  world.reset(initial.solids, []);
  experience.reset(initial.spec);
  $('#stage-name').textContent = initial.spec.name;
  document.querySelector('.stage').setAttribute('aria-label', initial.spec.name);
  $('#stage-hint').textContent = initial.hint || '狙う → 欠く → 支えを失ったガラスが落ちる';
  ready = true;
  status(savedSelection ? `前回の選択を復元しました。${controlHint()}` : controlHint());
} catch (error) {
  ready = false;
  console.error(error);
  status('初期化できませんでした。再読み込みしてください。');
}
window.crystalLab = {
  snapshot: () => ({
    ready,
    tool,
    stage: view.stage?.spec ?? { type: 'castle', material: 'glass', color: 'clear', count: 1, size: 1 },
    stageParts: view.stage?.solids.length ?? 31,
    fps,
    camera: {
      azimuth: view.azimuth,
      elevation: view.elevation,
      distance: view.distance,
      minDistance: view.minDistance,
      maxDistance: view.maxDistance,
      zoom: view.camera.zoom,
      cinematic: view.landingCamera.running,
      pan: view.landingCamera.pan,
      position: view.camera.position.toArray(),
    },
    preview: {
      visible: view.arrow.visible,
      footprint: view.footprint.root.visible,
      footprintVertices: view.footprint.vertices,
      ...view.previewInfo,
    },
    debrisRendering: {
      splinters: view.splinters.particles.length,
      peakSplinters: view.splinters.peak,
      clearSplinters: view.splinters.clearMesh.count,
      contactShadows: view.contactShadows.mesh.count,
      floorReflection: view.floorReflection.visible,
      scaled: [...view.meshes.values()].filter((m) => m.scale.x !== 1 || m.scale.y !== 1 || m.scale.z !== 1)
        .length,
      retiring: [...view.meshes.values()].filter((m) => m.userData.retiring).length,
    },
    landingPresentation: {
      active: view.landingEffects.beat.active,
      scale: reducedMotion ? 1 : view.landingEffects.beat.scale,
      played: view.landingEffects.beat.played,
      combo: view.landingEffects.beat.combo,
      sequenceAge: Number.isFinite(view.landingEffects.beat.sequenceAge)
        ? view.landingEffects.beat.sequenceAge
        : null,
      focus: view.landingCamera.focus.toArray(),
      flash: false,
      reducedMotion,
    },
    audio: {
      state: audio.context?.state,
      events: audio.events,
      voices: audio.voices,
      enabled: audio.enabled,
      volume: audio.volume,
      musicEnabled: audio.musicEnabled,
      musicPlaying: audio.music?.playing ?? false,
      musicVoices: audio.music?.sources.size ?? 0,
      musicDucking: (audio.music?.ducker.gain.value ?? 1) < 0.99,
    },
    ranking: {
      best: experience.ranking.best,
      entries: experience.ranking.entries,
      saved: experience.ranking.saved,
    },
    readout: {
      id: experience.readout.id,
      percent: experience.readout.percent,
      phase: experience.readout.phase,
    },
    rendering: {
      calls: view.renderer.info.render.calls,
      triangles: view.renderer.info.render.triangles,
      geometries: view.renderer.info.memory.geometries,
      glassGroups: [...view.meshes.values()].reduce((sum, mesh) => sum + mesh.geometry.groups.length, 0),
      interpolation: world ? world.accumulator / STEP : 1,
      motionSamples: [...view.meshes.values()]
        .filter((mesh) => mesh.userData.piece.dynamic)
        .slice(0, 12)
        .map((mesh) => ({ id: mesh.userData.piece.id, position: mesh.position.toArray() })),
      debrisFrontOnly: [...view.meshes.values()].filter(
        (mesh) =>
          mesh.userData.piece.landingDepth > 0 && mesh.material.every((m) => m.side === THREE.FrontSide),
      ).length,
      originalFaceGroups: [...view.meshes.values()].reduce(
        (sum, mesh) => sum + mesh.userData.piece.faces.length,
        0,
      ),
    },
    ...world?.snapshot(),
    targets: world
      ? [...world.pieces.values()]
          .filter((p) => !p.dynamic || p.volume > 0.04)
          .map((p) => {
            const v = new THREE.Vector3().copy(p.body.translation()).project(view.camera);
            return {
              id: p.id,
              name: p.name,
              volume: p.volume,
              moving: p.dynamic,
              x: ((v.x + 1) * host.clientWidth) / 2,
              y: ((1 - v.y) * host.clientHeight) / 2,
            };
          })
      : [],
  }),
};
