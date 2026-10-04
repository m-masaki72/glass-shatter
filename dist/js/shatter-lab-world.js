import RAPIER from '../vendor/rapier.mjs';
import { solidInfo, connectionArea, add, sub, mul, unit } from './shatter-lab-solid.js';
import { impactFracture } from './shatter-lab-contact.js';
import { makeGate } from './shatter-lab-gate.js';
import { contactSpeed, ImpactAudioGate } from './shatter-lab-impact-audio.js';
import { RescueBalls } from './shatter-lab-goals.js';
import { landingFracture, FLOOR_BREAKUP } from './shatter-lab-landing.js';
import { CollapseChains } from './shatter-lab-chain.js';
import { DebrisBed } from './shatter-lab-debris-bed.js';

export const STEP = 1 / 120;
export class FractureWorld {
  static async init() {
    await RAPIER.init();
  }
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.reset();
  }
  reset(solids, goals) {
    this.stageSolids = solids ?? this.stageSolids ?? makeGate();
    this.goalDefinitions = goals ?? this.goalDefinitions ?? [];
    if (this.world) {
      this.objectives?.dispose();
      for (const p of this.pieces.values()) this.callbacks.remove?.(p);
      this.events.free();
      this.world.free();
    }
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = STEP;
    this.world.numSolverIterations = 6;
    this.events = new RAPIER.EventQueue(true);
    this.pieces = new Map();
    this.colliders = new Map();
    this.nextId = 0;
    this.clock = 0;
    this.accumulator = 0;
    this.hits = 0;
    this.chains = new CollapseChains();
    this.secondary = 0;
    this.contacts = 0;
    this.removed = 0;
    this.lastContact = null;
    this.pendingBreaks = new Map();
    this.audioGate = new ImpactAudioGate();
    this.debrisBed = new DebrisBed();
    this.floorCollider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(20, 0.15, 20)
        .setTranslation(0, -0.16, 0)
        .setFriction(0.52)
        .setRestitution(0.16),
    );
    for (const { faces, name } of this.stageSolids) this.create(faces, { name });
    this.initialVolume = [...this.pieces.values()].reduce((s, p) => s + p.volume, 0);
    this.resolveSupport();
    this.objectives = new RescueBalls(this.world, this.floorCollider, this.goalDefinitions, this.callbacks);
  }
  create(faces, options = {}) {
    const info = solidInfo(faces);
    if (info.volume < 0.000015) {
      this.removed += info.volume;
      return null;
    }
    // A cut-off chip cannot remain an immortal floor anchor merely because it touches y=0.
    if (options.cracked && info.volume < 0.015) options = { ...options, dynamic: true };
    if (this.pieces.size >= 420) {
      const oldest = [...this.pieces.values()].find((p) => p.dynamic && p.volume < 0.04);
      if (oldest) this.remove(oldest, true);
    }
    const center = info.center;
    const descriptor = options.dynamic ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed();
    const body = this.world.createRigidBody(
      descriptor
        .setTranslation(...center)
        .setCcdEnabled(true)
        .setLinearDamping(0.11)
        .setAngularDamping(0.18),
    );
    const vertices = info.vertices.flatMap((v) => sub(v, center));
    const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(vertices));
    if (!desc) {
      this.world.removeRigidBody(body);
      return null;
    }
    const collider = this.world.createCollider(
      desc
        .setDensity(2.5)
        .setFriction(0.46)
        .setRestitution(0.22)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(0.3),
      body,
    );
    const p = {
      ...info,
      faces,
      id: this.nextId++,
      body,
      collider,
      name: options.name || '割れ片',
      dynamic: !!options.dynamic,
      created: this.clock,
      releasedAt: options.dynamic ? this.clock : Infinity,
      generation: options.generation || 0,
      landingDepth: options.landingDepth || 0,
      airDepth: options.airDepth || 0,
      cracked: options.cracked || false,
      credited: options.credited || false,
      floorCredited: options.floorCredited || false,
      cause: options.cause ?? this.hits,
      impactPoint: options.impactPoint,
      age: 0,
      previousPosition: body.translation(),
      previousRotation: body.rotation(),
      expiresAt: options.dynamic
        ? Math.min(options.expiresAt ?? Infinity, this.clock + (info.volume < 0.04 ? 5.5 : 14))
        : Infinity,
    };
    if (options.velocity)
      body.setLinvel({ x: options.velocity[0], y: options.velocity[1], z: options.velocity[2] }, true);
    if (options.spin) body.setAngvel({ x: options.spin[0], y: options.spin[1], z: options.spin[2] }, true);
    this.pieces.set(p.id, p);
    if (p.dynamic) this.chains.credit(p, p.cause);
    this.colliders.set(collider.handle, p);
    this.callbacks.add?.(p);
    return p;
  }
  remove(p, vanished = false) {
    if (!this.pieces.has(p.id)) return;
    this.callbacks.remove?.(p);
    this.colliders.delete(p.collider.handle);
    this.world.removeRigidBody(p.body);
    this.pieces.delete(p.id);
    if (vanished) this.removed += p.volume;
  }
  worldFaces(p) {
    const q = p.body.rotation(),
      t = p.body.translation();
    return p.faces.map((f) => ({
      ...f,
      points: f.points.map((v) => {
        const a = sub(v, p.center),
          u = [q.x, q.y, q.z];
        const uv = [u[1] * a[2] - u[2] * a[1], u[2] * a[0] - u[0] * a[2], u[0] * a[1] - u[1] * a[0]];
        const uuv = [u[1] * uv[2] - u[2] * uv[1], u[2] * uv[0] - u[0] * uv[2], u[0] * uv[1] - u[1] * uv[0]];
        return add([t.x, t.y, t.z], add(a, add(mul(uv, 2 * q.w), mul(uuv, 2))));
      }),
    }));
  }
  hit(id, point, contact) {
    const p = this.pieces.get(id);
    if (!p) return false;
    const result = impactFracture(this.worldFaces(p), point, contact, this.hits + 17);
    if (!result) return false;
    const velocity = p.body.linvel(),
      parentVelocity = [velocity.x, velocity.y, velocity.z];
    const dynamic = p.dynamic,
      generation = p.generation + 1,
      name = p.name,
      expiresAt = p.expiresAt;
    this.remove(p);
    this.hits++;
    this.chains.begin(this.hits);
    this.lastContact = { ...contact, removedVolume: result.removedVolume, point };
    const eject = Math.min(1.45, Math.max(0.75, Math.sqrt(contact.energy / 5)));
    for (const f of result.retained)
      this.create(f, {
        dynamic,
        velocity: parentVelocity,
        generation,
        landingDepth: p.landingDepth,
        airDepth: p.airDepth,
        name,
        cracked: true,
        impactPoint: point,
        expiresAt,
        credited: p.credited,
        floorCredited: p.floorCredited,
        cause: this.hits,
      });
    for (const f of result.shards) {
      const center = solidInfo(f).center;
      const radial = unit(sub(center, point));
      this.create(f, {
        dynamic: true,
        generation,
        landingDepth: p.landingDepth,
        airDepth: p.airDepth,
        cracked: true,
        expiresAt,
        credited: p.credited,
        floorCredited: p.floorCredited,
        cause: this.hits,
        velocity: add(
          parentVelocity,
          mul(add(mul(contact.direction, 1.4), add(mul(radial, 1.8), mul(contact.normal, 2.1))), eject),
        ),
        spin: mul(radial, 9),
      });
    }
    this.callbacks.impact?.({ point, volume: result.removedVolume, energy: contact.energy, kind: 'strike' });
    this.resolveSupport();
    return true;
  }
  release(p, cause = this.hits) {
    if (p.dynamic) return;
    p.dynamic = true;
    p.cause = cause;
    this.chains.credit(p, cause);
    p.releasedAt = this.clock;
    p.expiresAt = this.clock + (p.volume < 0.04 ? 5.5 : 14);
    p.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    p.body.setAngvel({ x: 0.06, z: p.center[0] * 0.08, y: 0 }, true);
  }
  releaseFromImpact(p, cause) {
    if (p.dynamic) return;
    this.release(p, cause);
    this.resolveSupport(cause);
  }
  resolveSupport(cause = this.hits) {
    const fixed = [...this.pieces.values()].filter((p) => !p.dynamic);
    const graph = new Map(fixed.map((p) => [p.id, []]));
    for (let i = 0; i < fixed.length; i++)
      for (let j = i + 1; j < fixed.length; j++) {
        const a = fixed[i],
          b = fixed[j],
          area = connectionArea(a, b);
        if (area > 0.003) {
          graph.get(a.id).push({ id: b.id, area });
          graph.get(b.id).push({ id: a.id, area });
        }
      }
    const queue = fixed.filter((p) => p.min[1] < 0.035).map((p) => p.id),
      seen = new Set(queue),
      parent = new Map();
    for (let i = 0; i < queue.length; i++)
      for (const edge of graph.get(queue[i]))
        if (!seen.has(edge.id)) {
          seen.add(edge.id);
          queue.push(edge.id);
          parent.set(edge.id, { id: queue[i], area: edge.area });
        }
    const load = new Map(fixed.map((p) => [p.id, p.volume * 2.5 * 9.81]));
    const failed = new Set();
    for (const id of [...queue].reverse()) {
      const edge = parent.get(id);
      if (!edge) continue;
      const p = this.pieces.get(id);
      // A bonded rigid-cluster approximation; this is not a finite-element stress solver.
      if (edge.area * 900 < load.get(id) && p.cracked) failed.add(id);
      else load.set(edge.id, load.get(edge.id) + load.get(id));
    }
    for (const p of fixed) {
      let cursor = p.id,
        broken = !seen.has(cursor);
      while (!broken && parent.has(cursor)) {
        if (failed.has(cursor)) broken = true;
        cursor = parent.get(cursor).id;
      }
      if (broken) this.release(p, cause);
    }
    const visited = new Set();
    for (const root of fixed) {
      if (root.dynamic || visited.has(root.id)) continue;
      const component = [root];
      visited.add(root.id);
      for (let i = 0; i < component.length; i++)
        for (const edge of graph.get(component[i].id)) {
          const neighbor = this.pieces.get(edge.id);
          if (!neighbor.dynamic && !visited.has(neighbor.id)) {
            visited.add(neighbor.id);
            component.push(neighbor);
          }
        }
      // Low, unloaded footing remnants are debris cleanup, not another destruction objective.
      if (component.every((p) => p.max[1] < 0.4))
        for (const p of component) {
          this.release(p, 0);
          p.expiresAt = this.clock + 5.5;
        }
    }
    this.bonds = [...graph.values()].reduce((s, e) => s + e.length, 0) / 2;
  }
  breakFalling(p, point, impulse, normal = [0, 1, 0], floor = true, bed = false, incoming) {
    if (
      !this.pieces.has(p.id) ||
      (floor ? p.landingDepth >= 2 : p.airDepth >= 1) ||
      p.volume < (floor ? FLOOR_BREAKUP.minVolume : 0.018)
    )
      return false;
    const faces = this.worldFaces(p),
      velocity = p.body.linvel(),
      gen = p.generation + 1;
    const chunks = landingFracture(faces, point, normal, impulse, p.id, floor ? FLOOR_BREAKUP.density : 1);
    if (chunks.length < 2) return false;
    if (floor) this.chains.creditFloor(p, p.cause);
    this.remove(p);
    this.secondary++;
    for (const f of chunks) {
      const offset = sub(solidInfo(f).center, point);
      const radial = unit(floor ? [offset[0], Math.max(0.08, offset[1] * 0.18), offset[2]] : offset);
      const scatter = Math.min(2.4, 0.4 + Math.sqrt(impulse / Math.max(0.05, p.volume)) * 0.18);
      this.create(f, {
        dynamic: true,
        generation: gen,
        landingDepth: p.landingDepth + Number(floor),
        airDepth: p.airDepth + Number(!floor),
        expiresAt: p.expiresAt,
        cracked: true,
        credited: p.credited,
        floorCredited: p.floorCredited,
        cause: p.cause,
        impactPoint: point,
        velocity: add(
          [velocity.x * 0.5, Math.abs(velocity.y) * 0.16 + 0.3, velocity.z * 0.5],
          mul(radial, scatter),
        ),
        spin: mul(radial, 5),
      });
    }
    this.callbacks.impact?.({
      point,
      normal,
      floor,
      bed,
      drift: incoming ?? [velocity.x, velocity.y, velocity.z],
      volume: p.volume,
      energy: Math.min(10, impulse),
      kind: 'secondary',
      cause: p.cause,
      pieceId: p.id,
      time: this.clock,
      fragments: chunks.length,
      landingDepth: p.landingDepth + Number(floor),
    });
    return true;
  }
  step(delta) {
    this.accumulator = Math.min(0.085, this.accumulator + delta);
    while (this.accumulator >= STEP) {
      const breaks = this.pendingBreaks;
      this.pendingBreaks = new Map();
      this.clock += STEP;
      const motions = new Map();
      for (const p of this.pieces.values())
        if (p.dynamic) {
          const v = p.body.linvel(),
            w = p.body.angvel(),
            c = p.body.translation();
          p.previousPosition = c;
          p.previousRotation = p.body.rotation();
          motions.set(p.collider.handle, {
            linear: [v.x, v.y, v.z],
            angular: [w.x, w.y, w.z],
            center: [c.x, c.y, c.z],
          });
        }
      this.world.step(this.events);
      this.debrisBed.update(this.world, this.colliders, this.floorCollider, this.clock);
      this.objectives.step();
      this.accumulator -= STEP;
      this.events.drainContactForceEvents((event) => {
        const a = this.colliders.get(event.collider1()),
          b = this.colliders.get(event.collider2());
        const impulse = event.totalForceMagnitude() * STEP;
        if (impulse < 0.008) return;
        this.contacts++;
        const piece = a?.dynamic ? a : b?.dynamic ? b : null;
        if (piece && this.clock - piece.releasedAt > 0.06) {
          const position = piece.body.translation();
          let point = [position.x, position.y, position.z];
          const first = this.world.getCollider(event.collider1()),
            second = this.world.getCollider(event.collider2());
          this.world.contactPair(first, second, (manifold) => {
            if (manifold.numSolverContacts()) {
              const contact = manifold.solverContactPoint(0);
              if (contact) point = [contact.x, contact.y, contact.z];
            }
          });
          const axis = event.maxForceDirection();
          const speed = contactSpeed(motions.get(event.collider1()), motions.get(event.collider2()), point, [
            axis.x,
            axis.y,
            axis.z,
          ]);
          const key = [event.collider1(), event.collider2()].sort((a, b) => a - b).join(':');
          if (this.audioGate.accept(key, this.clock, impulse, speed))
            this.callbacks.collision?.({ point, volume: piece.volume, impulse, speed, glass: !!a && !!b });
          const directFloor =
            first.handle === this.floorCollider.handle || second.handle === this.floorCollider.handle;
          for (const p of [a, b]) {
            const motion = p && motions.get(p.collider.handle);
            const bed = this.debrisBed.isLanding(p, p === a ? b : a, motion, point, axis);
            const floor = directFloor || bed;
            if (!floor && this.debrisBed.has(p)) continue;
            const effectiveSpeed = bed ? this.debrisBed.downwardSpeed(motion, point) : speed;
            const effectiveImpulse = bed ? this.debrisBed.impact(p, impulse, this.clock) : impulse;
            if (
              p &&
              effectiveSpeed > (floor ? FLOOR_BREAKUP.speed : 0.65) &&
              effectiveImpulse >
                Math.max(
                  floor ? FLOOR_BREAKUP.impulse : 0.09,
                  p.volume * 2.5 * (floor ? FLOOR_BREAKUP.massImpulse : 1.65),
                ) &&
              this.clock - p.created > (floor ? 0.045 : 0.09)
            ) {
              if (!p.dynamic) this.releaseFromImpact(p, piece.cause);
              const normal = floor ? [0, 1, 0] : unit(sub([position.x, position.y, position.z], point));
              const queued = breaks.get(p.id);
              if (
                !queued ||
                (floor && !queued.floor) ||
                (floor === queued.floor && queued.impulse < effectiveImpulse)
              )
                breaks.set(p.id, {
                  p,
                  point,
                  impulse: effectiveImpulse,
                  normal,
                  floor,
                  bed,
                  incoming: motion?.linear,
                  time: this.clock,
                });
            }
          }
        }
      });
      this.resolveBreaks(breaks);
      this.retirePieces();
    }
  }
  retirePieces() {
    for (const p of this.pieces.values()) {
      p.age = this.clock - p.created;
      if (p.dynamic) {
        const pos = p.body.translation();
        p.fade = Math.max(0, Math.min(1, (p.expiresAt - this.clock) / (p.volume < 0.04 ? 0.8 : 1.4)));
        if (pos.y < -8 || this.clock > p.expiresAt) this.remove(p, true);
      }
    }
  }
  resolveBreaks(breaks) {
    let count = 0;
    for (const e of [...breaks.values()].sort(
      (a, b) => Number(b.floor) - Number(a.floor) || b.impulse - a.impulse,
    )) {
      if (!this.pieces.has(e.p.id) || this.clock - e.time > 0.12) continue;
      if (count >= 6) {
        if (this.pendingBreaks.size < 24) this.pendingBreaks.set(e.p.id, e);
        continue;
      }
      if (this.breakFalling(e.p, e.point, e.impulse, e.normal, e.floor, e.bed, e.incoming)) {
        count++;
        this.resolveSupport(e.p.cause);
      }
    }
  }
  snapshot() {
    const pieces = [...this.pieces.values()],
      dynamic = pieces.filter((p) => p.dynamic);
    return {
      hits: this.hits,
      bodies: pieces.length,
      fixed: pieces.length - dynamic.length,
      moving: dynamic.length,
      secondary: this.secondary,
      contacts: this.contacts,
      bonds: this.bonds,
      removed: this.removed / this.initialVolume,
      lastContact: this.lastContact,
      volumes: pieces.map((p) => p.volume),
      clock: this.clock,
      goals: this.objectives.snapshot(),
      chain: this.chains.snapshot(this.initialVolume),
      floorFracture: this.chains.floorSnapshot(this.initialVolume),
    };
  }
}
