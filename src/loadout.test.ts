import { describe, expect, it } from 'vitest';
import { Loadout, WEAPONS, HOLSTER_SECONDS, SWAP_SECONDS } from './loadout';
import { Firearm } from './simulation';

describe('two-weapon loadout', () => {
  it('blocks shots and reloads through the whole holster/draw animation', () => {
    const l = new Loadout(); l.request(1, 0);
    l.update(.1, .1, true, .18);
    expect(l.active).toBe(0); expect(l.fire(.1)).toBeNull(); expect(l.reload(.1)).toBe(false);
    l.update(HOLSTER_SECONDS, .02, true, .18);
    expect(l.active).toBe(1); expect(l.holsterAmount(HOLSTER_SECONDS)).toBe(1);
    expect(l.fire(.2)).toBeNull(); expect(l.weapon.ads).toBe(0);
    l.update(SWAP_SECONDS, .16, false, .18);
    expect(l.swapping).toBe(false); expect(l.holsterAmount(SWAP_SECONDS)).toBe(0); expect(l.fire(SWAP_SECONDS)).not.toBeNull();
  });
  it('keeps independent ammo and prevents swapping around the sniper bolt cycle', () => {
    const l = new Loadout(); l.fire(0); l.request(1, 0);
    l.update(.28, .28, false, .18); l.fire(.3); l.request(0, .3);
    l.update(.59, .29, false, .18);
    expect(l.weapon.ammo).toBe(4); expect(l.weapons[1].ammo).toBe(14);
    expect(l.fire(.6)).toBeNull(); expect(l.fire(.93)).not.toBeNull(); expect(l.shots).toBe(3);
  });
  it('cancels a reload on holster and requires a fresh full reload', () => {
    const l = new Loadout(); l.fire(0); l.reload(1); l.request(1, 1.5);
    expect(l.weapons[0].reloadAt).toBe(0);
    l.update(4, .28, false, .18); l.request(0, 4); l.update(4.3, .3, false, .18);
    expect(l.weapon.ammo).toBe(4); expect(l.reload(4.3)).toBe(true);
    l.update(6.4, .01, false, .18); expect(l.weapon.ammo).toBe(4);
    l.update(6.46, .01, false, .18); expect(l.weapon.ammo).toBe(5);
  });
  it('honors the most recent selection when keys are pressed during a swap', () => {
    const l = new Loadout(); l.request(1, 0); l.request(0, .04); l.request(1, .07);
    l.update(.29, .29, false, .18); expect(l.active).toBe(1); expect(l.swapping).toBe(false);
    l.request(0, .3); l.toggle(.32); l.update(.59, .29, false, .18);
    expect(l.active).toBe(0); expect(l.swapping).toBe(true);
    l.update(.9, .31, false, .18); expect(l.active).toBe(1); expect(l.swapping).toBe(false);
  });
  it('never grants a pistol quickscope and resets both weapons with the practice session', () => {
    const l = new Loadout(); l.request(1, 0); l.update(.3, .3, false, .18);
    l.update(.42, .12, true, .18);
    expect(l.fire(.43)).toEqual({ quickscope: false, scoped: true });
    l.reload(.7); l.reset();
    expect(l.active).toBe(0); expect(l.shots).toBe(0); expect(l.swapping).toBe(false);
    expect(l.weapons.map(w => w.ammo)).toEqual([5, 15]);
    expect(l.weapons.every(w => !w.reloadAt && !w.readyAt && !w.ads)).toBe(true);
  });
});

describe('semi-automatic pistol', () => {
  it('enforces its cadence, 15-round magazine, and reload duration', () => {
    const p = new Firearm(WEAPONS[1]); expect(p.fire(0)).not.toBeNull(); expect(p.fire(.1)).toBeNull();
    for (let i = 1; i < 15; i++) expect(p.fire(i * .2)).not.toBeNull();
    expect(p.fire(3)).toBeNull(); expect(p.reload(3)).toBe(true); expect(p.fire(4)).toBeNull();
    p.update(4.34, .01, false, .12); expect(p.ammo).toBe(0);
    p.update(4.36, .02, false, .12); expect(p.ammo).toBe(15); expect(p.fire(4.36)).not.toBeNull();
  });
});
