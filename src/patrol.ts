import type { Solid } from './simulation';

export type PatrolPoint = { x: number; z: number };
const RADIUS = .34, HEIGHT = 1.98;
const distance = (a: PatrolPoint, b: PatrolPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** A small navigation grid at one floor height. Elevated cells require a supporting deck. */
export class PatrolNavigation {
  private readonly cells: boolean[];
  private readonly width: number;
  constructor(private readonly solids: Solid[], readonly floorY: number, private readonly extent = 28, private readonly spacing = .75) {
    this.width = Math.floor(extent * 2 / spacing) + 1;
    this.cells = Array.from({ length: this.width ** 2 }, (_, i) => this.canStand(this.point(i)));
  }
  canStand(p: PatrolPoint) {
    if (Math.abs(p.x) > this.extent || Math.abs(p.z) > this.extent) return false;
    if (this.solids.some(s => s.maxY > this.floorY + .055 && s.minY < this.floorY + HEIGHT &&
      p.x + RADIUS > s.minX && p.x - RADIUS < s.maxX && p.z + RADIUS > s.minZ && p.z - RADIUS < s.maxZ)) return false;
    return this.floorY === 0 || this.solids.some(s => Math.abs(s.maxY - this.floorY) < .055 &&
      p.x - RADIUS >= s.minX && p.x + RADIUS <= s.maxX && p.z - RADIUS >= s.minZ && p.z + RADIUS <= s.maxZ);
  }
  canWalk(a: PatrolPoint, b: PatrolPoint) {
    const steps = Math.max(1, Math.ceil(distance(a, b) / .15));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.canStand({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
    }
    return true;
  }
  private point(i: number): PatrolPoint { return { x: -this.extent + i % this.width * this.spacing, z: -this.extent + Math.floor(i / this.width) * this.spacing }; }
  private nearest(p: PatrolPoint) {
    if (!this.canStand(p)) return -1;
    const x = Math.round((p.x + this.extent) / this.spacing), z = Math.round((p.z + this.extent) / this.spacing);
    const candidates: { id: number; distance: number }[] = [];
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      if (x + dx < 0 || z + dz < 0 || x + dx >= this.width || z + dz >= this.width) continue;
      const id = x + dx + (z + dz) * this.width;
      if (this.cells[id]) candidates.push({ id, distance: distance(p, this.point(id)) });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates.find(candidate => this.canWalk(p, this.point(candidate.id)))?.id ?? -1;
  }
  path(from: PatrolPoint, to: PatrolPoint): PatrolPoint[] {
    if (this.canWalk(from, to)) return [{ ...to }];
    const start = this.nearest(from), goal = this.nearest(to);
    if (start < 0 || goal < 0) return [];
    const queue: { id: number; score: number }[] = [];
    const push = (id: number, score: number) => {
      queue.push({ id, score }); let i = queue.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1; if (queue[parent].score <= score) break;
        [queue[parent], queue[i]] = [queue[i], queue[parent]]; i = parent;
      }
    };
    const pop = () => {
      const first = queue[0], last = queue.pop()!;
      if (queue.length) {
        queue[0] = last; let i = 0;
        while (i * 2 + 1 < queue.length) {
          let child = i * 2 + 1;
          if (child + 1 < queue.length && queue[child + 1].score < queue[child].score) child++;
          if (queue[i].score <= queue[child].score) break;
          [queue[i], queue[child]] = [queue[child], queue[i]]; i = child;
        }
      }
      return first.id;
    };
    const cost = new Float64Array(this.cells.length).fill(Infinity), previous = new Int32Array(this.cells.length).fill(-1);
    const closed = new Uint8Array(this.cells.length), goalPoint = this.point(goal);
    cost[start] = 0; push(start, 0);
    while (queue.length) {
      const current = pop(); if (closed[current]) continue;
      if (current === goal) {
        const raw: PatrolPoint[] = [{ ...to }];
        for (let i = goal; i !== -1; i = previous[i]) raw.push(this.point(i));
        raw.reverse();
        const result: PatrolPoint[] = []; let at = from;
        for (let i = 0; i < raw.length;) {
          let furthest = i;
          for (let j = i; j < raw.length; j++) if (this.canWalk(at, raw[j])) furthest = j;
          result.push(raw[furthest]); at = raw[furthest]; i = furthest + 1;
        }
        return result;
      }
      closed[current] = 1;
      const x = current % this.width, z = Math.floor(current / this.width);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if ((!dx && !dz) || x + dx < 0 || z + dz < 0 || x + dx >= this.width || z + dz >= this.width) continue;
        const next = current + dx + dz * this.width;
        if (!this.cells[next] || closed[next]) continue;
        if (dx && dz && (!this.cells[current + dx] || !this.cells[current + dz * this.width])) continue;
        const nextCost = cost[current] + Math.hypot(dx, dz) * this.spacing;
        if (nextCost >= cost[next]) continue;
        previous[next] = current; cost[next] = nextCost;
        push(next, nextCost + distance(this.point(next), goalPoint));
      }
    }
    return [];
  }
}

export type Patrol = {
  home: PatrolPoint; x: number; z: number; heading: number; speed: number; travel: number; walking: boolean;
  waypoint: number; path: PatrolPoint[]; pathIndex: number; wait: number; lap: number;
  route: PatrolPoint[]; navigation: PatrolNavigation; maxSpeed: number; initialWait: number;
};
export function createPatrol(route: PatrolPoint[], navigation: PatrolNavigation, index: number): Patrol {
  const home = { ...route[0] };
  return { home, ...home, heading: 0, speed: 0, travel: index * .27, walking: false,
    waypoint: 1, path: [], pathIndex: 0, wait: .65 + index * .18, lap: 0, route, navigation,
    maxSpeed: 1.3 + index % 3 * .2, initialWait: .65 + index * .18 };
}
export function resetPatrol(p: Patrol) {
  Object.assign(p, { ...p.home, heading: 0, speed: 0, travel: 0, walking: false,
    waypoint: 1, path: [], pathIndex: 0, wait: p.initialWait, lap: 0 });
}

export function updatePatrol(p: Patrol, dt: number, enabled: boolean, blockers: PatrolPoint[] = []) {
  p.walking = false;
  if (!enabled || p.wait > 0) {
    p.speed = Math.max(0, p.speed - dt * 5);
    if (enabled) p.wait = Math.max(0, p.wait - dt);
    return;
  }
  if (!p.path.length) {
    p.path = p.navigation.path(p, p.route[p.waypoint]); p.pathIndex = 0;
    if (!p.path.length) { p.waypoint = (p.waypoint + 1) % p.route.length; p.wait = 1; return; }
  }
  const next = p.path[p.pathIndex], dx = next.x - p.x, dz = next.z - p.z, remaining = Math.hypot(dx, dz);
  if (remaining < .035) {
    p.pathIndex++;
    if (p.pathIndex === p.path.length) {
      p.path = []; p.waypoint = (p.waypoint + 1) % p.route.length; p.lap++;
      p.wait = .5 + (p.lap % 3) * .35; p.speed = 0;
    }
    return;
  }
  const wantedHeading = Math.atan2(-dx, -dz), turn = angleDifference(wantedHeading, p.heading);
  p.heading += Math.max(-dt * 3.8, Math.min(dt * 3.8, turn));
  // Stop rather than walking through the player or another enemy.
  const blocked = blockers.some(b => distance(p, b) < .68 && (b.x - p.x) * dx + (b.z - p.z) * dz > 0);
  const targetSpeed = blocked || Math.abs(turn) > .6 ? 0 : Math.min(p.maxSpeed, remaining * 4);
  p.speed += Math.max(-dt * 5, Math.min(dt * 3, targetSpeed - p.speed));
  if (blocked || Math.abs(turn) > .6) return;
  const step = Math.min(remaining, p.speed * dt);
  p.x += dx / remaining * step; p.z += dz / remaining * step; p.travel += step; p.walking = step > .00001;
}

/** Opposing hips and shoulders, with a bent knee during each leg's forward swing. */
export function walkingPose(travel: number, blend: number) {
  const phase = travel / 1.35 * Math.PI * 2;
  const leg = Math.sin(phase) * .42 * blend;
  return { leftLeg: leg, rightLeg: -leg,
    leftKnee: -Math.max(0, Math.cos(phase)) * .65 * blend,
    rightKnee: -Math.max(0, -Math.cos(phase)) * .65 * blend,
    leftArm: -leg * .75, rightArm: leg * .75,
    bob: -.8 * (1 - Math.cos(leg)), lean: -.035 * blend };
}

/** Short patrol loops through the yard's lanes; elevated guards stay on their decks. */
export const PATROL_ROUTES: PatrolPoint[][] = [
  [[0, -8], [-3, -13], [3, -13], [3, -8]],
  [[-9, -3], [-14, -3], [-14, 7], [-8, 7], [-8, -5]],
  [[10, -4], [12, -9], [20, -9], [25, -1], [10, -1]],
  [[-13, 12], [-23, 12], [-24, 21], [-12, 23], [-9, 15]],
  [[8, 18], [4, 24], [10, 25], [11, 17], [6, 11]],
  [[.8, 4], [2.4, 4], [2.4, 2], [.8, 2]],
  [[1.5, 5], [2.5, 5.8], [2.5, 2], [.8, 2]],
  [[23, 23], [25, 14], [21, 9], [25, 5], [26, 24]],
  [[-23, -25], [-15, -24], [-24, -17], [-25, -6], [-25, -25]],
].map(route => route.map(([x, z]) => ({ x, z })));
