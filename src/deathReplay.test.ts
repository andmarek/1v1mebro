import { describe, expect, it } from 'vitest';
import { DeathReplay, DEATH_IMPACT_SECONDS } from './deathReplay';
import { KillReplay, ReplayRecorder } from './killReplay';
import { MatchSimulation } from './matchSimulation';
import { DEFAULT_MATCH_RULES, DEATH_RESPAWN_MAX_SECONDS, SPAWN_PROTECTION_SECONDS } from './match';
import { INITIAL_SPAWN } from './spawning';
import { createPatrol, PatrolNavigation } from './patrol';

const clip = () => {
  const recorder = new ReplayRecorder(1); recorder.record(0, data => data[0] = 0); recorder.record(4, data => data[0] = 1);
  recorder.cue(4, 'sniper', { actorId: 'bot-0' }); return recorder.clip('bot-0')!;
};
const match = (limit = 20, timeLimitSeconds = 300) => new MatchSimulation([{ id: 0, home: { x: 0, y: 0, z: 5 }, patrol: createPatrol([{ x: 0, z: 5 }, { x: 3, z: 5 }], new PatrolNavigation([], 0), 0) }], { ...DEFAULT_MATCH_RULES, botsShoot: true }, { killLimit: limit, timeLimitSeconds });

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
  it('keeps the match and patrols running while holding only the victim respawn, then waits for a safe spawn', () => {
    const sim = match(); sim.advance(3, () => INITIAL_SPAWN); sim.fire();
    expect(sim.damagePlayer(0, 150).died).toBe(true);
    const deathAt = sim.now, ammo = sim.loadout.weapon.ammo, replay = new DeathReplay(); replay.begin(clip(), 0);
    expect(sim.holdRespawnForReplay()).toBe(true);
    const botBefore = sim.snapshots()[0];
    replay.advance(2);
    for (let i = 0; i < 240; i++) { sim.advance(1 / 120, () => INITIAL_SPAWN); sim.patrol(1 / 120, true); }
    expect(sim.now).toBeCloseTo(deathAt + 2); expect(sim.round.elapsedSeconds).toBeCloseTo(sim.now);
    expect(sim.snapshots()[0]).not.toEqual(botBefore); expect(sim.life.alive).toBe(false);
    expect(sim.holdRespawnForReplay()).toBe(true); expect(sim.life.respawnAt).toBe(deathAt + DEATH_RESPAWN_MAX_SECONDS);
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
  it('respawns by ten seconds even if presentation never releases the wait', () => {
    const sim = match(); sim.advance(3, () => INITIAL_SPAWN); sim.fire(); sim.damagePlayer(0, 150);
    sim.holdRespawnForReplay(); sim.advance(DEATH_RESPAWN_MAX_SECONDS - .01, () => INITIAL_SPAWN);
    expect(sim.life.alive).toBe(false);
    const tick = sim.advance(.02, () => INITIAL_SPAWN);
    expect(tick.playerRespawn).toEqual(INITIAL_SPAWN); expect(sim.life.alive).toBe(true); expect(sim.life.deaths).toBe(1);
    expect(sim.holdRespawnForReplay()).toBe(false);
  });
  it('caps even an oversized replay at ten seconds and finishes normal clips earlier', () => {
    const replay = new DeathReplay();
    replay.begin(new KillReplay([{ at: 0, pose: new Float32Array(1) }, { at: 30, pose: new Float32Array(1) }], []), 0);
    replay.advance(9.99); expect(replay.complete).toBe(false); replay.advance(.01); expect(replay.complete).toBe(true);
    replay.reset(); replay.begin(clip(), 0); replay.advance(5); expect(replay.complete).toBe(true);
  });
  it('continues bot respawns and respects a match timeout during the replay wait', () => {
    const sim = match(); sim.advance(3, () => INITIAL_SPAWN); sim.fire(); sim.damagePlayer(0, 150); sim.holdRespawnForReplay();
    sim.enemies[0].respawnAt = sim.now + 1; sim.enemies[0].health = 0;
    expect(sim.advance(1, () => INITIAL_SPAWN).enemyRespawns).toEqual([0]); expect(sim.enemies[0].health).toBe(100);
    const timed = match(20, 4); timed.advance(6, () => INITIAL_SPAWN); timed.fire(); timed.damagePlayer(0, 150); timed.holdRespawnForReplay();
    timed.advance(2, () => INITIAL_SPAWN);
    expect(timed.round.phase).toBe('finished'); expect(timed.round.finishReason).toBe('time-limit');
    expect(timed.life.alive).toBe(false); expect(timed.completeDeathReplay()).toBe(false);
  });
  it('cannot respawn or reopen a match ended by the attacking bot', () => {
    const sim = match(1); sim.advance(3, () => INITIAL_SPAWN); sim.fire(); sim.damagePlayer(0, 150);
    const before = sim.round.snapshot;
    const replay = new DeathReplay(); replay.begin(clip(), 0); replay.skip();
    expect(sim.completeDeathReplay()).toBe(false); sim.advance(1, () => INITIAL_SPAWN);
    expect(sim.round.snapshot).toEqual(before); expect(sim.life.alive).toBe(false);
  });
});
