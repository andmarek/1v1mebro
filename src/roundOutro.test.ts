import { describe, expect, it } from 'vitest';
import { MatchSimulation } from './matchSimulation';
import { RoundOutro, FINAL_IMPACT_SECONDS, ROUND_OUTRO_SECONDS } from './roundOutro';
import { createPatrol, PatrolNavigation } from './patrol';
import { INITIAL_SPAWN } from './spawning';

describe('round outro presentation', () => {
  it('holds the impact, lowers sights smoothly, then reveals results', () => {
    const outro = new RoundOutro();
    expect(outro.stage).toBe('idle'); expect(outro.begin()).toBe(true);
    outro.advance(FINAL_IMPACT_SECONDS / 2); expect(outro.stage).toBe('impact'); expect(outro.aimScale).toBe(1);
    expect(outro.begin()).toBe(false); // Repeated finished ticks cannot restart the bumper.
    outro.advance(FINAL_IMPACT_SECONDS / 2 + .325);
    expect(outro.stage).toBe('banner'); expect(outro.aimScale).toBeCloseTo(.5);
    outro.advance(.4); expect(outro.aimScale).toBe(0);
    outro.advance(10); expect(outro.stage).toBe('results'); expect(outro.elapsed).toBe(ROUND_OUTRO_SECONDS);
  });
  it('supports skipping, invalid deltas and clean rematches', () => {
    const outro = new RoundOutro(); outro.skip(); expect(outro.stage).toBe('idle'); outro.begin();
    for (const dt of [NaN, Infinity, -1, 0]) outro.advance(dt);
    expect(outro.elapsed).toBe(0); outro.skip(); expect(outro.stage).toBe('results');
    outro.reset(); expect(outro.stage).toBe('idle'); expect(outro.begin()).toBe(true); expect(outro.elapsed).toBe(0);
  });
  it('does not extend gameplay, respawn enemies or admit actions after the final kill', () => {
    const patrol = createPatrol([{ x: 0, z: 5 }, { x: 3, z: 5 }], new PatrolNavigation([], 0), 0);
    const sim = new MatchSimulation([{ id: 0, home: { x: 0, y: 0, z: 5 }, patrol }], undefined, { killLimit: 1, timeLimitSeconds: 60 });
    sim.advance(3, () => INITIAL_SPAWN); sim.fire(); sim.hitEnemy(0, 150, 'sniper');
    const finished = sim.round.snapshot, outro = new RoundOutro(); outro.begin();
    outro.advance(ROUND_OUTRO_SECONDS); sim.advance(ROUND_OUTRO_SECONDS, () => INITIAL_SPAWN);
    expect(sim.round.snapshot).toEqual(finished); expect(sim.enemies[0].health).toBe(0);
    expect(sim.fire()).toBeNull(); expect(sim.swap(1)).toBe(false); expect(sim.knife()).toBe(false);
  });
});
