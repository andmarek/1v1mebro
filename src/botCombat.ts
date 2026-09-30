import type { BotSnapshot, CombatVector, PlayerSnapshot } from './match';
import { Firearm } from './simulation';
import { WEAPONS } from './loadout';
export { PlayerLife } from './playerLife';

export type BotShot = { botId: number; origin: CombatVector; direction: CombatVector; damage: number; hit: boolean; weapon: 'sniper' };
export type BotAimPose = { aiming: boolean; yaw: number; pitch: number; shotAge: number; ammo: number; reloading: boolean; reloadProgress: number; boltProgress: number };
type AimState = {
  seen: boolean; nextSightAt: number; acquiredAt: number; readyAt: number;
  weapon: Firearm; reloadStartedAt: number; lastShotAt: number; aiming: boolean; yaw: number; pitch: number; aim: CombatVector;
};
const SNIPER = WEAPONS[0];
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
    const shotAge = s ? now - s.lastShotAt : Infinity;
    return { aiming: s?.aiming ?? false, yaw: s?.yaw ?? 0, pitch: s?.pitch ?? 0, shotAge,
      ammo: s?.weapon.ammo ?? SNIPER.magazineSize, reloading: !!s?.weapon.reloadAt,
      reloadProgress: s?.weapon.reloadAt ? Math.max(0, Math.min(1, (now - s.reloadStartedAt) / SNIPER.reloadSeconds)) : 0,
      boltProgress: shotAge >= 0 && shotAge < SNIPER.fireSeconds ? shotAge / SNIPER.fireSeconds : 0 };
  }
  update(now: number, dt: number, bots: readonly BotSnapshot[], player: PlayerSnapshot, enabled: boolean,
    canSee: (from: CombatVector, to: CombatVector) => boolean): BotShot[] {
    const living = new Set(bots.filter(b => b.alive).map(b => b.id));
    for (const id of this.states.keys()) if (!living.has(id)) this.states.delete(id);
    const target = torso(player), candidates: { bot: BotSnapshot; state: AimState; distance: number }[] = [];
    for (const bot of bots) {
      if (!bot.alive) continue;
      let state = this.states.get(bot.id);
      if (!state) {
        state = { seen: false, nextSightAt: now + (bot.id % 9) * .016, acquiredAt: Infinity,
          readyAt: Infinity, weapon: new Firearm(SNIPER), reloadStartedAt: 0, lastShotAt: -Infinity, aiming: false, yaw: 0, pitch: 0, aim: { ...target } };
        this.states.set(bot.id, state);
      }
      // Bolting and reloading are physical weapon timers, independent of perception.
      // Losing sight, player protection/death, or a disabled rule cannot refill ammunition.
      state.weapon.update(now, dt, false, SNIPER.aimSeconds);
      if (!enabled || !player.alive) { state.seen = false; this.release(state); continue; }
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
        state.readyAt = now + 1.10 + this.random() * .65;
        state.aim = { ...target };
      }
      // Smooth tracking leaves room for strafing, jumping, and ducking behind cover.
      const blend = 1 - Math.exp(-Math.max(0, dt) * 2.3);
      for (const axis of ['x', 'y', 'z'] as const) state.aim[axis] += (target[axis] - state.aim[axis]) * blend;
      const origin = muzzle(bot), dx = state.aim.x - origin.x, dy = state.aim.y - origin.y, dz = state.aim.z - origin.z;
      state.yaw = Math.atan2(-dx, -dz); state.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      if (now < state.readyAt || now < state.weapon.readyAt || state.weapon.reloadAt) continue;
      // Never trust cached sight at firing time: a newly crossed wall must stop a shot immediately.
      if (!canSee(origin, target)) { state.seen = false; this.release(state); continue; }
      if (!state.weapon.fire(now)) continue;
      state.lastShotAt = now; state.readyAt = now + SNIPER.fireSeconds + .25 + this.random() * .30;
      if (state.weapon.ammo === 0) {
        state.weapon.reload(now); state.reloadStartedAt = now;
      }
      const spread = .028 + range * .0007;
      const horizontalError = (this.random() * 2 - 1) * spread;
      const verticalError = (this.random() * 2 - 1) * spread;
      const yaw = Math.atan2(dx, dz) + horizontalError;
      const pitch = Math.atan2(dy, Math.hypot(dx, dz)) + verticalError;
      const direction = { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
      shots.push({ botId: bot.id, origin, direction, damage: SNIPER.bodyDamage, weapon: 'sniper', hit: hitsPlayer(origin, direction, player) });
    }
    return shots;
  }
}
