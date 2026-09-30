import { describe, expect, it } from 'vitest';
import { DeathReplay, DEATH_IMPACT_SECONDS } from './deathReplay';
import { ReplayRecorder } from './killReplay';
import { MatchSimulation } from './matchSimulation';
import { DEFAULT_MATCH_RULES, SPAWN_PROTECTION_SECONDS } from './match';
import { INITIAL_SPAWN } from './spawning';
import { createPatrol, PatrolNavigation } from './patrol';

const clip = () => {
  const recorder = new ReplayRecorder(1); recorder.record(0, data => data[0] = 0); recorder.record(4, data => data[0] = 1);
  recorder.cue(4, 'sniper', { actorId: 'bot-0' }); return recorder.clip('bot-0')!;
};
const match = (limit = 20) => new MatchSimulation([{ id: 0, home: { x: 0, y: 0, z: 5 }, patrol: createPatrol([{ x: 0, z: 5 }, { x: 3, z: 5 }], new PatrolNavigation([], 0), 0) }], { ...DEFAULT_MATCH_RULES, botsShoot: true }, { killLimit: limit, timeLimitSeconds: 300 });

describe('attacker death replay', () => {
  it('holds the death impact, plays once, supports skip and resets on a fresh life', () => {
    const replay = new DeathReplay(); expect(replay.begin(null, 0)).toBe(false);
    expect(replay.begin(clip(), 0)).toBe(true); expect(replay.begin(clip(), 1)).toBe(false);
    replay.advance(DEATH_IMPACT_SECONDS / 2); expect(replay.showing).toBe(false);
    replay.advance(DEATH_IMPACT_SECONDS / 2); expect(replay.showing).toBe(true);
    for (const dt of [NaN, Infinity, -1, 0]) replay.advance(dt);
    expect(replay.replayElapsed).toBe(0); expect(replay.complete).toBe(false);
    replay.skip(); expect(replay.complete).toBe(true); expect(replay.attacker).toBe(0);
    replay.reset(); expect(replay.active).toBe(false); expect(replay.complete).toBe(false);
    replay.begin(clip(), 1); replay.advance(20); expect(replay.complete).toBe(true);
  });
  it('keeps live score and weapon state frozen while watching, then waits for a safe respawn', () => {
    const sim = match(); sim.advance(3, () => INITIAL_SPAWN); sim.fire();
    expect(sim.damagePlayer(0, 150).died).toBe(true);
    const before = sim.round.snapshot, ammo = sim.loadout.weapon.ammo, replay = new DeathReplay(); replay.begin(clip(), 0);
    replay.advance(2); expect(sim.round.snapshot).toEqual(before); expect(sim.life.alive).toBe(false);
    expect(sim.fire()).toBeNull(); expect(sim.swap(1)).toBe(false); expect(sim.knife()).toBe(false);
    replay.advance(10); expect(replay.complete).toBe(true); expect(sim.completeDeathReplay()).toBe(true);
    expect(sim.life.alive).toBe(false); expect(sim.loadout.weapon.ammo).toBe(ammo);
    sim.advance(1 / 120, () => null); expect(sim.life.alive).toBe(false);
    const tick = sim.advance(1 / 120, () => INITIAL_SPAWN);
    expect(tick.playerRespawn).toEqual(INITIAL_SPAWN); expect(sim.life.alive).toBe(true);
    expect(sim.life.deaths).toBe(1); expect(sim.loadout.weapon.ammo).toBe(5);
    expect(sim.life.protectedUntil - sim.now).toBeCloseTo(SPAWN_PROTECTION_SECONDS);
    expect(sim.completeDeathReplay()).toBe(false);
    expect(sim.round.standings().find(entry => entry.id === 'bot-0')!.kills).toBe(1);
  });
  it('cannot respawn or reopen a match ended by the attacking bot', () => {
    const sim = match(1); sim.advance(3, () => INITIAL_SPAWN); sim.fire(); sim.damagePlayer(0, 150);
    const before = sim.round.snapshot;
    const replay = new DeathReplay(); replay.begin(clip(), 0); replay.skip();
    expect(sim.completeDeathReplay()).toBe(false); sim.advance(1, () => INITIAL_SPAWN);
    expect(sim.round.snapshot).toEqual(before); expect(sim.life.alive).toBe(false);
  });
});
