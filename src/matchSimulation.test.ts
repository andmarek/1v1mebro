import { describe, expect, it } from 'vitest';
import { MatchSimulation } from './matchSimulation';
import { DEFAULT_MATCH_RULES } from './match';
import { createPatrol, PatrolNavigation } from './patrol';
import { INITIAL_SPAWN, chooseSpawn } from './spawning';

function match(killLimit = 20, timeLimitSeconds = 300, armed = false) {
  const patrol = createPatrol([{ x: 0, z: 5 }, { x: 3, z: 5 }], new PatrolNavigation([], 0), 0);
  return new MatchSimulation([{ id: 0, home: { x: 0, y: 0, z: 5 }, patrol }], { ...DEFAULT_MATCH_RULES, botsShoot: armed }, { killLimit, timeLimitSeconds });
}
const spawn = () => ({ ...INITIAL_SPAWN });
const stats = (sim: MatchSimulation, id = 'player') => sim.round.standings().find(entry => entry.id === id)!;

describe('shared match simulation', () => {
  it('copies coordinates from renderer vectors with prototype accessors', () => {
    class RenderVector {
      get x() { return 3; } get y() { return 2; } get z() { return 5; }
    }
    const patrol = createPatrol([{ x: 3, z: 5 }, { x: 6, z: 5 }], new PatrolNavigation([], 2), 0);
    const sim = new MatchSimulation([{ id: 0, home: new RenderVector(), patrol }]);
    expect(sim.enemies[0].home).toEqual({ x: 3, y: 2, z: 5 });
    expect(sim.snapshots()[0]).toMatchObject({ x: 3, y: 2, z: 5 });
  });
  it('gates movement and weapon actions by phase, life, and melee recovery', () => {
    const sim = match(20, 300, true);
    const command = { yaw: 0, strafe: 0, forward: 1, sprint: true, crouching: false, aiming: false, jump: false };
    expect(sim.move(command, .1, [], .18)).toBeNull();
    expect(sim.swap(1)).toBe(false); expect(sim.reload()).toBe(false); expect(sim.knife()).toBe(false);
    sim.advance(3, spawn);
    expect(sim.move(command, .1, [], .18)).not.toBeNull(); expect(sim.player.z).toBeGreaterThan(-23);
    expect(sim.fire()).not.toBeNull(); expect(sim.reload()).toBe(true);
    expect(sim.knife()).toBe(true); expect(sim.loadout.weapon.reloadAt).toBe(0);
    expect(sim.swap(1)).toBe(false); expect(sim.reload()).toBe(false); expect(sim.fire()).toBeNull();
    sim.advance(.63, spawn); expect(sim.swap(1)).toBe(true);
    sim.advance(.3, spawn); sim.move(command, .3, [], .18);
    expect(sim.loadout.active).toBe(1); expect(sim.fire()).not.toBeNull();
    expect(sim.damagePlayer(0, 150).died).toBe(true);
    expect(sim.move(command, .1, [], .18)).toBeNull(); expect(sim.swap(0)).toBe(false);
    expect(sim.reload()).toBe(false); expect(sim.knife()).toBe(false); expect(sim.fire()).toBeNull();
  });
  it('blocks combat during countdown, preserves protection, and advances only live time', () => {
    const sim = match();
    expect(sim.fire()).toBeNull(); expect(sim.hitEnemy(0, 150, 'sniper')).toBeNull();
    sim.advance(2.5, spawn); expect(sim.now).toBe(0);
    const transition = sim.advance(.7, spawn);
    expect(transition.activeDt).toBeCloseTo(.2); expect(sim.now).toBeCloseTo(.2);
    expect(sim.life.protectedUntil).toBe(3); expect(sim.life.health).toBe(100);
    for (const dt of [NaN, Infinity, -1, 0]) sim.advance(dt, spawn);
    expect(sim.now).toBeCloseTo(.2);
  });
  it('honors damage rules while preserving shots/swaps, and excludes knife hits from accuracy', () => {
    const sim = match(); sim.reset({ ...DEFAULT_MATCH_RULES, secondaryDamage: false }); sim.advance(3, spawn);
    sim.loadout.request(1, sim.now); sim.loadout.update(.3, .3, false, .18); sim.advance(.3, spawn);
    expect(sim.fire()).not.toBeNull(); expect(sim.life.protectedUntil).toBe(3);
    expect(sim.hitEnemy(0, 70, 'pistol', { headshot: true })).toBeNull(); expect(sim.enemies[0].health).toBe(100);
    expect(sim.hitEnemy(0, 100, 'knife')?.eliminated).toBe(true);
    expect(stats(sim).shots).toBe(1); expect(stats(sim).hits).toBe(0); expect(stats(sim).kills).toBe(1);
    expect(stats(sim, 'bot-0').deaths).toBe(1);
  });
  it('records the decisive kill and event before freezing all subsequent combat', () => {
    const sim = match(1); sim.advance(3, spawn); sim.fire();
    expect(sim.hitEnemy(0, 300, 'sniper', { headshot: true, quickscope: true, throughCover: true })?.reward).toBe(200);
    expect(sim.round.phase).toBe('finished');
    expect(stats(sim)).toMatchObject({ kills: 1, hits: 1, shots: 1, points: 200, quickscopes: 1 });
    expect(stats(sim, 'bot-0').deaths).toBe(1);
    expect(sim.drainEvents()).toMatchObject([{ killerId: 'player', victimId: 'bot-0', headshot: true, quickscope: true, throughCover: true }]);
    expect(sim.drainEvents()).toHaveLength(0); expect(sim.fire()).toBeNull();
    expect(sim.hitEnemy(0, 100, 'knife')).toBeNull(); sim.advance(10, spawn); expect(sim.enemies[0].health).toBe(0);
  });
  it('defers unsafe respawns and restores health/ammo without clearing round shot counts', () => {
    const sim = match(20, 300, true); sim.advance(3, spawn); sim.fire(); sim.advance(4, spawn);
    sim.botFired(0); expect(sim.damagePlayer(0, 150)).toEqual({ applied: true, died: true });
    expect(stats(sim).deaths).toBe(1); expect(stats(sim, 'bot-0').kills).toBe(1);
    expect(sim.advance(2, () => null).playerRespawn).toBeNull(); expect(sim.life.alive).toBe(false);
    const next = { ...INITIAL_SPAWN, id: 'west', x: -25, z: -4, yaw: Math.PI / 2 };
    expect(sim.advance(.01, () => next).playerRespawn).toEqual(next);
    expect(sim.player.x).toBe(-25); expect(sim.life.health).toBe(100); expect(sim.loadout.weapon.ammo).toBe(5);
    expect(sim.life.protectedUntil - sim.now).toBeCloseTo(3); expect(stats(sim).shots).toBe(1); expect(sim.loadout.shots).toBe(1);
    expect(sim.damagePlayer(0, 150).applied).toBe(false);
  });
  it('accounts for simultaneous enemy respawns before selecting a safe player location', () => {
    const sim = match(20, 300, true); sim.advance(3, spawn); sim.advance(4, spawn);
    sim.enemies[0].health = 0; sim.enemies[0].respawnAt = 6;
    sim.life.damage(150, sim.now);
    const points = [{ ...INITIAL_SPAWN, id: 'occupied', z: 5 }, { ...INITIAL_SPAWN, id: 'safe', x: 15, z: 0 }];
    const result = sim.advance(2, () => chooseSpawn(points, sim.snapshots(), () => false, []));
    expect(result.enemyRespawns).toEqual([0]); expect(result.playerRespawn?.id).toBe('safe');
  });
  it('does not restore an enemy inside a player camping its patrol home', () => {
    const sim = match(); sim.advance(3, spawn); sim.hitEnemy(0, 150, 'sniper');
    sim.player.z = 5;
    expect(sim.advance(2, spawn).enemyRespawns).toEqual([]); expect(sim.enemies[0].health).toBe(0);
    sim.player.z = -23; expect(sim.advance(.01, spawn).enemyRespawns).toEqual([0]);
  });
  it('freezes at timeout and rematches with the same configuration and fresh state', () => {
    const sim = match(5, 2); sim.advance(3, spawn); sim.fire(); sim.hitEnemy(0, 150, 'sniper');
    sim.advance(2, spawn); expect(sim.round.finishReason).toBe('time-limit'); expect(sim.now).toBe(2);
    expect(sim.fire()).toBeNull(); sim.reset();
    expect(sim.round.options).toEqual({ killLimit: 5, timeLimitSeconds: 2 }); expect(sim.round.phase).toBe('countdown');
    expect(stats(sim).kills).toBe(0); expect(sim.life.deaths).toBe(0); expect(sim.loadout.shots).toBe(0);
    expect(sim.enemies[0].health).toBe(100); expect(sim.drainEvents()).toHaveLength(0);
  });
});
