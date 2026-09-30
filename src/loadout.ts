import { Firearm, type WeaponTuning } from './simulation';

export type WeaponSlot = 0 | 1;
export type WeaponSpec = WeaponTuning & {
  name: string; label: string; bodyDamage: number; energy: number;
  aimSeconds: number; aimFov: number; lookReduction: number; recoil: number;
  moveScale: number; adsMoveScale: number;
};
export const WEAPONS: readonly WeaponSpec[] = [
  { name: 'INTERVENTION', label: 'BOLT-ACTION / .408', magazineSize: 5, fireSeconds: .92, reloadSeconds: 2.15,
    quickscope: true, bodyDamage: 150, energy: 1, aimSeconds: .18, aimFov: .235, lookReduction: .68, recoil: 1, moveScale: .95, adsMoveScale: .62 },
  { name: 'FIELD-9', label: 'SEMI-AUTO / 9 MM', magazineSize: 15, fireSeconds: .18, reloadSeconds: 1.35,
    quickscope: false, bodyDamage: 35, energy: .35, aimSeconds: .12, aimFov: .78, lookReduction: .22, recoil: .34, moveScale: 1, adsMoveScale: .75 },
];
export const HOLSTER_SECONDS = .12;
export const DRAW_SECONDS = .16;
export const SWAP_SECONDS = HOLSTER_SECONDS + DRAW_SECONDS;

/** Owns both weapons so holstering never resets ammunition or a shot's cooldown. */
export class Loadout {
  readonly weapons = WEAPONS.map(spec => new Firearm(spec));
  readonly lastShots = [-10, -10];
  active: WeaponSlot = 0;
  private destination: WeaponSlot = 0;
  private queued: WeaponSlot | null = null;
  private swapAt: number | null = null;
  get weapon() { return this.weapons[this.active]; }
  get spec() { return WEAPONS[this.active]; }
  get swapping() { return this.swapAt !== null; }
  get requested() { return this.queued ?? this.destination; }
  get shots() { return this.weapons.reduce((sum, weapon) => sum + weapon.shots, 0); }

  request(slot: WeaponSlot, now: number) {
    if (this.swapping) { this.queued = slot === this.destination ? null : slot; return false; }
    if (slot === this.active) return false;
    this.destination = slot; this.swapAt = now; this.queued = null;
    // Reloading is a physical action: holstering cancels it without granting ammunition.
    this.weapon.reloadAt = 0;
    return true;
  }
  toggle(now: number) { return this.request(this.requested === 0 ? 1 : 0, now); }
  update(now: number, dt: number, aiming: boolean, rifleAimSeconds: number) {
    if (this.swapAt !== null) {
      if (now - this.swapAt >= HOLSTER_SECONDS) this.active = this.destination;
      if (now - this.swapAt >= SWAP_SECONDS) {
        this.swapAt = null;
        const next = this.queued; this.queued = null;
        if (next !== null) this.request(next, now);
      }
    }
    this.weapons.forEach((weapon, slot) => weapon.update(now, dt, aiming && slot === this.active && !this.swapping,
      this.swapping ? .08 : slot === 0 ? rifleAimSeconds : WEAPONS[slot].aimSeconds));
  }
  fire(now: number) {
    if (this.swapping) return null;
    const shot = this.weapon.fire(now);
    if (shot) this.lastShots[this.active] = now;
    return shot;
  }
  reload(now: number) { return !this.swapping && this.weapon.reload(now); }
  swapProgress(now: number) { return this.swapAt === null ? 1 : Math.min(1, (now - this.swapAt) / SWAP_SECONDS); }
  holsterAmount(now: number) {
    if (this.swapAt === null) return 0;
    const age = now - this.swapAt;
    return age < HOLSTER_SECONDS ? Math.min(1, age / HOLSTER_SECONDS) : Math.max(0, 1 - (age - HOLSTER_SECONDS) / DRAW_SECONDS);
  }
  reset() {
    this.active = this.destination = 0; this.swapAt = this.queued = null;
    this.weapons.forEach(weapon => Object.assign(weapon, { ammo: weapon.tuning.magazineSize, readyAt: 0, reloadAt: 0, shots: 0, ads: 0, accurateSince: -Infinity }));
    this.lastShots.fill(-10);
  }
  respawn() {
    const shots = this.weapons.map(weapon => weapon.shots);
    this.reset();
    this.weapons.forEach((weapon, slot) => { weapon.shots = shots[slot]; });
  }
}
