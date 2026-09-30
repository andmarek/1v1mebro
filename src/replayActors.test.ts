import { describe, expect, it } from 'vitest';
import { attackerReplayPose, ReplayActors, type BotReplaySource, type PlayerReplayPose } from './replayActors';

const source = (id: number): BotReplaySource => ({ bot: { id, x: 2, y: 4, z: 6, alive: true }, heading: .4, ads: .9,
  pose: { aiming: true, yaw: -.7, pitch: .2, shotAge: Infinity, ammo: 5, reloading: false, reloadProgress: 0, boltProgress: 0 } });
const player: PlayerReplayPose = { x: 0, y: 0, z: -23, yaw: Math.PI - .1, pitch: 0, height: 1.75, travel: 1, walking: true, ads: .7, shotAt: -10, alive: true, weapon: 0 };

describe('recorded attacker perspectives', () => {
  it('converts NPC facing into camera facing and reproduces actual spread rays when firing', () => {
    const bot = source(0), pose = attackerReplayPose(bot, 5);
    expect(pose.yaw).toBeCloseTo(-.7 + Math.PI); expect(pose.pitch).toBe(-.2); expect(pose.y).toBeCloseTo(5.34);
    for (const [x, y, z] of [[1, .2, -2], [-3, -.5, 1], [0, 1, 0]]) {
      const length = Math.hypot(x, y, z), direction = { x: x / length, y: y / length, z: z / length };
      bot.lastShot = { botId: 0, origin: { x: 2, y: 5.34, z: 6 }, direction, damage: 150, hit: true, weapon: 'sniper', at: 5 };
      bot.pose.shotAge = 0;
      const pov = attackerReplayPose(bot, 5);
      expect(Math.sin(pov.yaw) * Math.cos(pov.pitch)).toBeCloseTo(direction.x);
      expect(-Math.sin(pov.pitch)).toBeCloseTo(direction.y);
      expect(Math.cos(pov.yaw) * Math.cos(pov.pitch)).toBeCloseTo(direction.z);
    }
    expect(attackerReplayPose(bot, 6).yaw).toBeCloseTo(-.7 + Math.PI);
  });
  it('selects the actual attacker by ID and interpolates movement/crouch while snapping life and weapon events', () => {
    const actors = new ReplayActors(12, [8, 2]), a = { at: 0, pose: new Float32Array(actors.width) }, b = { at: 1, pose: new Float32Array(actors.width) };
    const second = source(2); second.bot.x = -2;
    actors.capture(a.pose, player, [second, source(8)], 0);
    second.bot.x = 0; second.pose.reloading = true; second.pose.reloadProgress = .5;
    actors.capture(b.pose, { ...player, x: 2, yaw: -Math.PI + .1, height: 1.25, travel: 3, alive: false, weapon: 1 }, [source(8), second], 1);
    const midway = { before: a, after: b, mix: .5 };
    expect(actors.attacker(midway, 2).x).toBe(-1); expect(actors.attacker(midway, 8).x).toBe(2);
    expect(actors.attacker(midway, 2).reloading).toBe(false);
    const body = actors.player(midway); expect(body.x).toBe(1); expect(body.height).toBe(1.5); expect(body.travel).toBe(2);
    expect(Math.abs(body.yaw)).toBeCloseTo(Math.PI); expect(body.alive).toBe(true); expect(body.weapon).toBe(0);
    const terminal = { before: b, after: b, mix: 0 }; expect(actors.player(terminal).alive).toBe(false); expect(actors.attacker(terminal, 2).reloading).toBe(true);
  });
});
