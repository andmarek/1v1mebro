export type Solid = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
export type Player = { x: number; y: number; z: number; vy: number; grounded: boolean };
export const PLAYER_RADIUS = 0.32;
export const PLAYER_HEIGHT = 1.75;
const overlaps = (p: Player, s: Solid, height: number) =>
  p.x + PLAYER_RADIUS > s.minX && p.x - PLAYER_RADIUS < s.maxX &&
  p.z + PLAYER_RADIUS > s.minZ && p.z - PLAYER_RADIUS < s.maxZ &&
  p.y + height > s.minY + 0.001 && p.y < s.maxY - 0.001;

/** A fixed-step character controller. Position is at the player's feet. */
export function movePlayer(p: Player, dx: number, dz: number, dt: number, solids: Solid[], height = PLAYER_HEIGHT) {
  // Small substeps prevent tunnelling through thin geometry at sprint speed.
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz), Math.abs(p.vy * dt)) / 0.12));
  for (let i = 0; i < steps; i++) {
    for (const [axis, delta] of [['x', dx / steps], ['z', dz / steps]] as const) {
      const old = p[axis];
      p[axis] += delta;
      const hits = solids.filter(s => overlaps(p, s, height));
      if (hits.length) {
        const top = Math.max(...hits.map(s => s.maxY));
        const oldY = p.y;
        if (p.grounded && top - p.y <= 0.36) {
          p.y = top;
          if (solids.some(s => overlaps(p, s, height))) { p.y = oldY; p[axis] = old; }
        } else p[axis] = old;
      }
    }
    const oldY = p.y;
    p.vy -= 22 * dt / steps;
    p.y += p.vy * dt / steps;
    p.grounded = false;
    for (const s of solids) {
      if (!overlaps(p, s, height)) continue;
      if (p.vy <= 0 && oldY >= s.maxY - 0.002) { p.y = s.maxY; p.vy = 0; p.grounded = true; }
      else if (p.vy > 0 && oldY + height <= s.minY + 0.002) { p.y = s.minY - height; p.vy = 0; }
      else p.y = oldY;
    }
    if (p.y <= 0) { p.y = 0; p.vy = 0; p.grounded = true; }
  }
}

export const MAGAZINE_SIZE = 5;
export const BOLT_SECONDS = 0.92;
export const RELOAD_SECONDS = 2.15;
export class Rifle {
  ammo = MAGAZINE_SIZE;
  readyAt = 0;
  reloadAt = 0;
  shots = 0;
  ads = 0;
  accurateSince = -Infinity;
  update(now: number, dt: number, aiming: boolean, adsSeconds: number) {
    if (this.reloadAt && now >= this.reloadAt) { this.ammo = MAGAZINE_SIZE; this.reloadAt = 0; }
    const previous = this.ads;
    this.ads = Math.max(0, Math.min(1, this.ads + (aiming && !this.reloadAt ? 1 : -1) * dt / adsSeconds));
    if (previous < 0.72 && this.ads >= 0.72) this.accurateSince = now;
    if (this.ads < 0.72) this.accurateSince = -Infinity;
  }
  fire(now: number) {
    if (this.reloadAt || now < this.readyAt || this.ammo === 0) return null;
    this.ammo--; this.shots++; this.readyAt = now + BOLT_SECONDS;
    return { quickscope: this.ads >= 0.72 && now - this.accurateSince <= 0.18, scoped: this.ads >= 0.72 };
  }
  reload(now: number) {
    if (this.reloadAt || this.ammo === MAGAZINE_SIZE) return false;
    this.reloadAt = now + RELOAD_SECONDS;
    return true;
  }
}
