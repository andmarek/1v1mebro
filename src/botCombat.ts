import { PLAYER_HEALTH, PLAYER_RESPAWN_SECONDS, SPAWN_PROTECTION_SECONDS, type BotSnapshot, type CombatVector, type PlayerSnapshot } from './match';

export class PlayerLife {
  health = PLAYER_HEALTH;
  deaths = 0;
  respawnAt = 0;
  protectedUntil = SPAWN_PROTECTION_SECONDS;
  get alive() { return this.health > 0; }
  damage(amount: number, now: number): boolean {
    if (!this.alive || now < this.protectedUntil || !Number.isFinite(amount) || amount <= 0) return false;
    this.health = Math.max(0, this.health - amount);
    if (this.alive) return false;
    this.deaths++; this.respawnAt = now + PLAYER_RESPAWN_SECONDS;
    return true;
  }
  update(now: number): boolean {
    if (this.alive || now < this.respawnAt) return false;
    this.health = PLAYER_HEALTH; this.respawnAt = 0;
    this.protectedUntil = now + SPAWN_PROTECTION_SECONDS;
    return true;
  }
  reset(now = 0) {
    this.health = PLAYER_HEALTH; this.deaths = 0; this.respawnAt = 0;
    this.protectedUntil = now + SPAWN_PROTECTION_SECONDS;
  }
}

export type BotShot = { botId: number; origin: CombatVector; direction: CombatVector; damage: number; hit: boolean };
export type BotAimPose = { aiming: boolean; yaw: number; pitch: number; shotAge: number };
type AimState = {
  seen: boolean; nextSightAt: number; acquiredAt: number; readyAt: number;
  lastShotAt: number; aiming: boolean; yaw: number; pitch: number; aim: CombatVector;
};
const RANGE = 35, SIGHT_INTERVAL = .15, MAX_ATTACKERS = 3;
const distance = (a: CombatVector, b: CombatVector) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const muzzle = (bot: BotSnapshot): CombatVector => ({ x: bot.x, y: bot.y + 1.34, z: bot.z });
const torso = (player: PlayerSnapshot): CombatVector => ({ x: player.x, y: player.y + player.height * .62, z: player.z });

/** Shot accuracy is geometric: a ray must intersect the current player volume, including crouch height. */
export function playerHitDistance(origin: CombatVector, direction: CombatVector, player: PlayerSnapshot): number | null {
  if (!player.alive) return null;
  const bounds = [
    [player.x - .3, player.x + .3, origin.x, direction.x],
    [player.y + .06, player.y + player.height + .1, origin.y, direction.y],
    [player.z - .3, player.z + .3, origin.z, direction.z],
  ];
  let near = 0, far = RANGE;
  for (const [min, max, start, delta] of bounds) {
    if (Math.abs(delta) < 1e-9) { if (start < min || start > max) return null; continue; }
    const a = (min - start) / delta, b = (max - start) / delta;
    near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    if (near > far) return null;
  }
  return far > 0 ? near : null;
}
export function hitsPlayer(origin: CombatVector, direction: CombatVector, player: PlayerSnapshot): boolean {
  return playerHitDistance(origin, direction, player) !== null;
}

/** No render/engine dependency; nine patrol bots share a bounded, cover-aware attack budget. */
export class BotCombat {
  private states = new Map<number, AimState>();
  private seed: number;
  constructor(private readonly initialSeed = 1947) { this.seed = initialSeed >>> 0; }
  private random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  private release(state: AimState) { state.aiming = false; state.acquiredAt = Infinity; state.readyAt = Infinity; }
  reset() { this.states.clear(); this.seed = this.initialSeed >>> 0; }
  pose(id: number, now: number): BotAimPose {
    const s = this.states.get(id);
    return s ? { aiming: s.aiming, yaw: s.yaw, pitch: s.pitch, shotAge: now - s.lastShotAt }
      : { aiming: false, yaw: 0, pitch: 0, shotAge: Infinity };
  }
  update(now: number, dt: number, bots: readonly BotSnapshot[], player: PlayerSnapshot, enabled: boolean,
    canSee: (from: CombatVector, to: CombatVector) => boolean): BotShot[] {
    if (!enabled || !player.alive) { this.reset(); return []; }
    const living = new Set(bots.filter(b => b.alive).map(b => b.id));
    for (const id of this.states.keys()) if (!living.has(id)) this.states.delete(id);
    const target = torso(player), candidates: { bot: BotSnapshot; state: AimState; distance: number }[] = [];
    for (const bot of bots) {
      if (!bot.alive) continue;
      let state = this.states.get(bot.id);
      if (!state) {
        state = { seen: false, nextSightAt: now + (bot.id % 9) * .016, acquiredAt: Infinity,
          readyAt: Infinity, lastShotAt: -Infinity, aiming: false, yaw: 0, pitch: 0, aim: { ...target } };
        this.states.set(bot.id, state);
      }
      const from = muzzle(bot), range = distance(from, target);
      if (range > RANGE) { state.seen = false; this.release(state); continue; }
      // Acquisition checks are staggered to spread expensive cover traces across frames.
      if (now >= state.nextSightAt) {
        state.seen = canSee(from, target);
        state.nextSightAt = now + SIGHT_INTERVAL;
      }
      if (!state.seen) { this.release(state); continue; }
      candidates.push({ bot, state, distance: range });
    }
    // Keep existing attackers engaged; nearby substitutes cannot produce a new nine-bot volley.
    candidates.sort((a, b) => Number(b.state.aiming) - Number(a.state.aiming) || a.distance - b.distance || a.bot.id - b.bot.id);
    const chosen = new Set(candidates.slice(0, MAX_ATTACKERS).map(c => c.bot.id));
    const shots: BotShot[] = [];
    for (const { bot, state, distance: range } of candidates) {
      if (!chosen.has(bot.id)) { this.release(state); continue; }
      if (!state.aiming) {
        state.aiming = true; state.acquiredAt = now;
        state.readyAt = now + .55 + this.random() * .35;
        state.aim = { ...target };
      }
      // Smooth tracking leaves room for strafing, jumping, and ducking behind cover.
      const blend = 1 - Math.exp(-Math.max(0, dt) * 4.5);
      for (const axis of ['x', 'y', 'z'] as const) state.aim[axis] += (target[axis] - state.aim[axis]) * blend;
      const origin = muzzle(bot), dx = state.aim.x - origin.x, dy = state.aim.y - origin.y, dz = state.aim.z - origin.z;
      state.yaw = Math.atan2(-dx, -dz); state.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      if (now < state.readyAt) continue;
      // Never trust cached sight at firing time: a newly crossed wall must stop a shot immediately.
      if (!canSee(origin, target)) { state.seen = false; this.release(state); continue; }
      state.lastShotAt = now; state.readyAt = now + .72 + this.random() * .28;
      const spread = .021 + range * .00035;
      const horizontalError = (this.random() * 2 - 1) * spread;
      const verticalError = (this.random() * 2 - 1) * spread;
      const yaw = Math.atan2(dx, dz) + horizontalError;
      const pitch = Math.atan2(dy, Math.hypot(dx, dz)) + verticalError;
      const direction = { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
      shots.push({ botId: bot.id, origin, direction, damage: 18, hit: hitsPlayer(origin, direction, player) });
    }
    return shots;
  }
}
