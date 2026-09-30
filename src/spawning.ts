import type { BotSnapshot, CombatVector } from './match';
import { hasClearance, PLAYER_HEIGHT, PLAYER_RADIUS, type Solid } from './simulation';

export type SpawnPoint = CombatVector & { id: string; yaw: number };
export type SpawnSight = (from: CombatVector, to: CombatVector) => boolean;

export const INITIAL_SPAWN: Readonly<SpawnPoint> = { id: 'south-entry', x: 0, y: 0, z: -23, yaw: 0 };
const ground = (id: string, x: number, z: number): Readonly<SpawnPoint> => ({ id, x, y: 0, z, yaw: Math.atan2(-x, -z) });
/** Authored open ground lanes, clear of the containers, stairs, drums and boundary walls. */
export const ARENA_SPAWNS: readonly Readonly<SpawnPoint>[] = [
  INITIAL_SPAWN,
  ground('southwest-corner', -25, -25),
  ground('west-lane', -25, -4),
  ground('northwest-corner', -25, 25),
  ground('north-lane', -8, 27),
  ground('northeast-corner', 25, 26),
  ground('east-lane', 25, 10),
  ground('southeast-corner', 25, -25),
  ground('south-lane', 8, -27),
  ground('west-back-lane', -9, 17),
];

const ARENA_EXTENT = 28;
const OCCUPIED_RADIUS = PLAYER_RADIUS + .34 + .35;
const NEAR_ENEMY_RADIUS = 8;
const FIRING_RANGE = 35;
const MUZZLE_HEIGHT = 1.34;
const TORSO_HEIGHT = 1.05;

/** The arena's y=0 plane is implicit in movePlayer; elevated points need full-footprint support. */
export function isValidSpawn(point: Readonly<SpawnPoint>, solids: Solid[]): boolean {
  if (![point.x, point.y, point.z, point.yaw].every(Number.isFinite) || point.y < 0 ||
      Math.abs(point.x) > ARENA_EXTENT || Math.abs(point.z) > ARENA_EXTENT) return false;
  if (!hasClearance({ ...point, vy: 0, grounded: true }, PLAYER_HEIGHT, solids)) return false;
  return point.y === 0 || solids.some(s => Math.abs(s.maxY - point.y) <= .001 &&
    point.x - PLAYER_RADIUS >= s.minX && point.x + PLAYER_RADIUS <= s.maxX &&
    point.z - PLAYER_RADIUS >= s.minZ && point.z + PLAYER_RADIUS <= s.maxZ);
}

/**
 * Select from validated candidates only. Hidden positions take priority over exposed ones;
 * within that group, avoid close enemies, favor distance and discourage repeated spawns.
 * All-visible situations use the same least-risk ranking. If every candidate is blocked,
 * unsupported or occupied, return null so the simulation can defer respawn and retry.
 */
export function chooseSpawn(
  points: readonly Readonly<SpawnPoint>[],
  enemies: readonly BotSnapshot[],
  canSee: SpawnSight,
  solids: Solid[],
  previousSpawnId?: string,
): SpawnPoint | null {
  const living = enemies.filter(enemy => enemy.alive && [enemy.x, enemy.y, enemy.z].every(Number.isFinite));
  const previousIndex = points.findIndex(point => point.id === previousSpawnId);
  const start = previousIndex < 0 ? 0 : (previousIndex + 1) % points.length;
  const candidates: { point: Readonly<SpawnPoint>; visible: number; risk: number; order: number }[] = [];
  points.forEach((point, index) => {
    if (!isValidSpawn(point, solids)) return;
    if (living.some(enemy => Math.hypot(enemy.x - point.x, enemy.z - point.z) < OCCUPIED_RADIUS &&
      enemy.y < point.y + PLAYER_HEIGHT && enemy.y + 1.98 > point.y)) return;
    let visible = 0, close = 0, nearest = 40;
    const torso = { x: point.x, y: point.y + TORSO_HEIGHT, z: point.z };
    for (const enemy of living) {
      const distance = Math.hypot(enemy.x - point.x, enemy.y - point.y, enemy.z - point.z);
      nearest = Math.min(nearest, distance);
      if (distance < NEAR_ENEMY_RADIUS) close++;
      const muzzle = { x: enemy.x, y: enemy.y + MUZZLE_HEIGHT, z: enemy.z };
      if (Math.hypot(muzzle.x - torso.x, muzzle.y - torso.y, muzzle.z - torso.z) <= FIRING_RANGE && canSee(muzzle, torso)) visible++;
    }
    candidates.push({ point, visible, risk: close * 100 - nearest * 5 + (point.id === previousSpawnId ? 20 : 0),
      order: (index - start + points.length) % points.length });
  });
  candidates.sort((a, b) => a.visible - b.visible || a.risk - b.risk || a.order - b.order);
  const selected = candidates[0]?.point;
  return selected ? { ...selected } : null;
}
