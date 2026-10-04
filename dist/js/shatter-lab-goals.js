import RAPIER from '../vendor/rapier.mjs';
import { solidInfo, normal, dot, sub, carveSolid, unit } from './shatter-lab-solid.js';

export function embedRescueBalls(stage) {
  const colors = ['#ffb83e', '#ee7379', '#b994ef'];
  let goals = [];
  if (['vase', 'bottle'].includes(stage.spec.type)) {
    goals = Array.from({ length: 3 }, (_, i) => {
      const center = stage.centers[i % stage.centers.length];
      return {
        position: [center.x + (stage.spec.count === 1 ? (i - 1) * 0.28 : 0), 0.7 + i * 0.32, center.z],
        radius: 0.12 * stage.spec.size,
        color: colors[i],
      };
    });
    return { ...stage, goals };
  }
  const candidates = stage.solids.flatMap(({ faces }) => {
    const info = solidInfo(faces);
    const axis = [0, 1, 2].sort((a, b) => info.max[b] - info.min[b] - (info.max[a] - info.min[a]))[0];
    return [0, -0.24, 0.24]
      .map((offset) => {
        const position = [...info.center];
        position[axis] += (info.max[axis] - info.min[axis]) * offset;
        const clearance = Math.min(...faces.map((f) => dot(normal(f), sub(f.points[0], position))));
        return { position, radius: Math.min(0.14, clearance * 0.55), volume: info.volume };
      })
      .filter((p) => p.radius >= 0.035 && p.position[1] > p.radius + 0.15);
  });
  for (let i = 0; i < 3; i++) {
    const ranked = candidates.filter((p) =>
      goals.every((g) => Math.hypot(...sub(p.position, g.position)) > (p.radius + g.radius) * 2),
    );
    ranked.sort((a, b) => {
      const score = (p) =>
        goals.length
          ? Math.min(...goals.map((g) => Math.hypot(...sub(p.position, g.position)))) * Math.sqrt(p.radius)
          : p.volume * p.radius;
      return score(b) - score(a);
    });
    if (!ranked.length)
      throw new Error('この大きさでは球を3個配置できません。別の形か大きさを選んでください。');
    goals.push({ ...ranked[0], color: colors[i] });
  }
  let solids = stage.solids;
  for (const goal of goals) {
    const radius = goal.radius * 1.28;
    const planes = [];
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          if (Math.abs(x) + Math.abs(y) + Math.abs(z) !== 1) continue;
          const n = unit([x, y, z]);
          planes.push({ n, d: dot(n, goal.position) + radius });
        }
    solids = solids.flatMap((part) => {
      const info = solidInfo(part.faces);
      if (
        [0, 1, 2].some(
          (axis) =>
            goal.position[axis] + radius < info.min[axis] || goal.position[axis] - radius > info.max[axis],
        )
      )
        return [part];
      return carveSolid(part.faces, planes).retained.map((faces) => ({ ...part, faces }));
    });
  }
  return { ...stage, solids, goals };
}

export class RescueBalls {
  constructor(world, floor, definitions, callbacks) {
    this.world = world;
    this.floor = floor;
    this.callbacks = callbacks;
    this.balls = definitions.map((definition, id) => {
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(...definition.position)
          .setCcdEnabled(true)
          .setLinearDamping(0.3),
      );
      const collider = world.createCollider(
        RAPIER.ColliderDesc.ball(definition.radius).setDensity(1.2).setFriction(0.6).setRestitution(0.22),
        body,
      );
      const ball = { ...definition, id, body, collider, collected: false };
      callbacks.goalAdded?.(ball);
      return ball;
    });
  }
  step() {
    for (const ball of this.balls) {
      if (ball.collected) continue;
      this.world.contactPair(ball.collider, this.floor, (manifold) => {
        if (manifold.numSolverContacts() > 0 && ball.body.translation().y <= ball.radius + 0.025) {
          ball.collected = true;
          this.callbacks.goalCollected?.(ball);
        }
      });
    }
  }
  snapshot() {
    const collected = this.balls.filter((b) => b.collected).length;
    return {
      total: this.balls.length,
      collected,
      complete: this.balls.length > 0 && collected === this.balls.length,
    };
  }
  dispose() {
    for (const ball of this.balls) {
      this.callbacks.goalRemoved?.(ball);
      this.world.removeRigidBody(ball.body);
    }
  }
}
