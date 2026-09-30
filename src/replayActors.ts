import type { BotAimPose, BotShot } from './botCombat';
import type { BotSnapshot } from './match';
import type { ReplaySample } from './killReplay';

export type PlayerReplayPose = { x: number; y: number; z: number; yaw: number; pitch: number; height: number; travel: number; walking: boolean; ads: number; shotAt: number; alive: boolean; weapon: number };
export type AttackerReplayPose = { x: number; y: number; z: number; yaw: number; pitch: number; ads: number; shotAt: number; reloading: boolean; reloadProgress: number; alive: boolean };
export type BotReplaySource = { bot: BotSnapshot; pose: BotAimPose; heading: number; ads: number; lastShot?: BotShot & { at: number } };
const BOT_WIDTH = 10, PLAYER_WIDTH = 12;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const turn = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/** Bot models face -Z; first-person cameras face +Z. At firing, use the actual spread ray. */
export function attackerReplayPose(source: BotReplaySource, now: number): AttackerReplayPose {
  const { bot, pose, lastShot } = source;
  const shooting = lastShot && now - lastShot.at >= 0 && now - lastShot.at < .09 && pose.shotAge < .09;
  return {
    x: shooting ? lastShot.origin.x : bot.x, y: shooting ? lastShot.origin.y : bot.y + 1.34, z: shooting ? lastShot.origin.z : bot.z,
    yaw: shooting ? Math.atan2(lastShot.direction.x, lastShot.direction.z) : (pose.aiming ? pose.yaw : source.heading) + Math.PI,
    pitch: shooting ? -Math.atan2(lastShot.direction.y, Math.hypot(lastShot.direction.x, lastShot.direction.z)) : pose.aiming ? -pose.pitch : 0,
    ads: pose.reloading && pose.shotAge > .15 ? 0 : source.ads, shotAt: Number.isFinite(pose.shotAge) ? now - pose.shotAge : -1e6,
    reloading: pose.reloading, reloadProgress: pose.reloadProgress, alive: bot.alive,
  };
}

/** Small extra fields beside the shared scene poses, allowing a different recorded POV. */
export class ReplayActors {
  readonly width: number;
  constructor(private readonly offset: number, private readonly botIds: readonly number[]) {
    this.width = offset + PLAYER_WIDTH + botIds.length * BOT_WIDTH;
  }
  capture(data: Float32Array, player: PlayerReplayPose, bots: readonly BotReplaySource[], now: number) {
    data.set([player.x, player.y, player.z, player.yaw, player.pitch, player.height, player.travel, Number(player.walking), player.ads, player.shotAt, Number(player.alive), player.weapon], this.offset);
    bots.forEach(source => {
      const index = this.botIds.indexOf(source.bot.id); if (index < 0) return;
      const p = attackerReplayPose(source, now);
      data.set([p.x, p.y, p.z, p.yaw, p.pitch, p.ads, p.shotAt, Number(p.reloading), p.reloadProgress, Number(p.alive)], this.offset + PLAYER_WIDTH + index * BOT_WIDTH);
    });
  }
  private values(sample: ReplaySample, offset: number, width: number) {
    const { before, after, mix: t } = sample, a = before.pose, b = after.pose;
    const fraction = Math.hypot(b[offset] - a[offset], b[offset + 1] - a[offset + 1], b[offset + 2] - a[offset + 2]) > 3 ? 0 : t;
    return Array.from({ length: width }, (_, i) => i === 3 || i === 4 ? turn(a[offset + i], b[offset + i], fraction) : mix(a[offset + i], b[offset + i], fraction));
  }
  player(sample: ReplaySample): PlayerReplayPose {
    const p = this.values(sample, this.offset, PLAYER_WIDTH), discrete = sample.before.pose;
    return { x: p[0], y: p[1], z: p[2], yaw: p[3], pitch: p[4], height: p[5], travel: p[6], walking: !!discrete[this.offset + 7], ads: p[8], shotAt: discrete[this.offset + 9], alive: !!discrete[this.offset + 10], weapon: discrete[this.offset + 11] };
  }
  attacker(sample: ReplaySample, id: number): AttackerReplayPose {
    const index = this.botIds.indexOf(id); if (index < 0) throw new Error(`Unknown replay attacker ${id}`);
    const offset = this.offset + PLAYER_WIDTH + index * BOT_WIDTH, p = this.values(sample, offset, BOT_WIDTH), discrete = sample.before.pose;
    return { x: p[0], y: p[1], z: p[2], yaw: p[3], pitch: p[4], ads: p[5], shotAt: discrete[offset + 6], reloading: !!discrete[offset + 7], reloadProgress: p[8], alive: !!discrete[offset + 9] };
  }
}
