import type { BotSnapshot, CombatVector } from './match';

export const MELEE_HIT_SECONDS = .16;
export const MELEE_DURATION_SECONDS = .52;
export const MELEE_COOLDOWN_SECONDS = .62;
export const MELEE_DAMAGE = 100;
export const MELEE_REACH = 2;
const BODY_RADIUS = .32;
const VIEW_CONE = Math.PI / 5;

/** Game-clock attack timing. Animation and hit queries share this clock. */
export class MeleeController {
  readyAt = 0;
  private startedAt = -Infinity;
  private hitDelivered = true;

  start(now: number, allowed = true): boolean {
    if (!allowed || now < this.readyAt) return false;
    this.startedAt = now;
    this.readyAt = now + MELEE_COOLDOWN_SECONDS;
    this.hitDelivered = false;
    return true;
  }

  /** Emits one contact event, including when a frame crosses the contact time. */
  update(now: number): boolean {
    if (this.hitDelivered || now < this.startedAt + MELEE_HIT_SECONDS) return false;
    this.hitDelivered = true;
    return true;
  }

  active(now: number): boolean {
    return now >= this.startedAt && now < this.startedAt + MELEE_DURATION_SECONDS;
  }

  progress(now: number): number {
    if (this.startedAt === -Infinity) return 0;
    return Math.max(0, Math.min(1, (now - this.startedAt) / MELEE_DURATION_SECONDS));
  }

  reset(): void {
    this.readyAt = 0;
    this.startedAt = -Infinity;
    this.hitDelivered = true;
  }
}

/** No aim snap or movement lunge: contact is limited to the body in front of the camera. */
export function selectMeleeTarget(
  origin: CombatVector,
  direction: CombatVector,
  targets: readonly BotSnapshot[],
  blocked: (origin: CombatVector, aimPoint: CombatVector) => boolean,
): number | null {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(length) || length < 1e-8) return null;
  let nearest = Infinity;
  let selected: number | null = null;
  for (const target of targets) {
    if (!target.alive) continue;
    const aimPoint = { x: target.x, y: target.y + 1.1, z: target.z };
    const dx = aimPoint.x - origin.x, dy = aimPoint.y - origin.y, dz = aimPoint.z - origin.z;
    const centerDistance = Math.hypot(dx, dy, dz);
    const bodyDistance = Math.max(0, centerDistance - BODY_RADIUS);
    if (!Number.isFinite(bodyDistance) || bodyDistance > MELEE_REACH || bodyDistance >= nearest) continue;
    const dot = (dx * direction.x + dy * direction.y + dz * direction.z) / length;
    // Account for body width so a close target at eye height stays hittable.
    // The center must still be ahead; this never reaches behind the player.
    if (dot < 0) continue;
    const angularRadius = Math.asin(Math.min(1, BODY_RADIUS / Math.max(centerDistance, BODY_RADIUS)));
    if (centerDistance > 1e-8 && dot / centerDistance < Math.cos(VIEW_CONE + angularRadius)) continue;
    if (blocked(origin, aimPoint)) continue;
    nearest = bodyDistance;
    selected = target.id;
  }
  return selected;
}
