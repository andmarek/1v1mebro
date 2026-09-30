import { describe, expect, it, vi } from 'vitest';
import { MeleeController, MELEE_HIT_SECONDS, MELEE_DURATION_SECONDS, MELEE_COOLDOWN_SECONDS, selectMeleeTarget } from './melee';
import type { BotSnapshot } from './match';

const origin = { x: 0, y: 1.65, z: 0 };
const forward = { x: 0, y: 0, z: 1 };
const bot = (id: number, x = 0, z = 1.5, y = 0, alive = true): BotSnapshot => ({ id, x, y, z, alive });
const clear = () => false;

describe('knife timing', () => {
  it('contacts once during the slash, with independent animation and cooldown durations', () => {
    const attack = new MeleeController();
    expect(attack.update(0)).toBe(false); expect(attack.active(0)).toBe(false);
    expect(attack.start(0)).toBe(true);
    expect(attack.update(MELEE_HIT_SECONDS - .001)).toBe(false);
    expect(attack.update(MELEE_HIT_SECONDS)).toBe(true);
    expect(attack.update(.2)).toBe(false);
    expect(attack.progress(MELEE_DURATION_SECONDS / 2)).toBeCloseTo(.5);
    expect(attack.active(MELEE_DURATION_SECONDS - .001)).toBe(true);
    expect(attack.active(MELEE_DURATION_SECONDS)).toBe(false);
    expect(attack.start(MELEE_COOLDOWN_SECONDS - .001)).toBe(false);
    expect(attack.start(MELEE_COOLDOWN_SECONDS)).toBe(true);
    expect(attack.update(MELEE_COOLDOWN_SECONDS + MELEE_HIT_SECONDS)).toBe(true);
  });
  it('does not drop or duplicate the contact event when a frame crosses its timestamp', () => {
    const attack = new MeleeController(); attack.start(5);
    expect(attack.update(5.1)).toBe(false); expect(attack.update(5.3)).toBe(true);
    expect(attack.update(6)).toBe(false);
  });
  it('disabled attacks do not consume cooldown and reset cancels pending contact', () => {
    const attack = new MeleeController();
    expect(attack.start(2, false)).toBe(false); expect(attack.readyAt).toBe(0);
    expect(attack.update(3)).toBe(false); expect(attack.start(3)).toBe(true);
    attack.reset();
    expect(attack.update(4)).toBe(false); expect(attack.active(4)).toBe(false);
    expect(attack.progress(4)).toBe(0); expect(attack.start(0)).toBe(true);
  });
  it('rejects button spam without restarting the slash and clamps its progress', () => {
    const attack = new MeleeController(); attack.start(10);
    expect(attack.start(10.1)).toBe(false); expect(attack.progress(10.16)).toBeCloseTo(.16 / MELEE_DURATION_SECONDS);
    expect(attack.progress(9)).toBe(0); expect(attack.progress(11)).toBe(1);
  });
});

describe('knife contact query', () => {
  it('chooses the nearest live body, regardless of target order', () => {
    expect(selectMeleeTarget(origin, forward, [bot(1, 0, 2), bot(2, 0, 1), bot(3, 0, .5, 0, false)], clear)).toBe(2);
  });
  it('allows contact at the body surface but excludes targets beyond two meters', () => {
    expect(selectMeleeTarget({ x: 0, y: 1.1, z: 0 }, forward, [bot(1, 0, 2.31)], clear)).toBe(1);
    expect(selectMeleeTarget({ x: 0, y: 1.1, z: 0 }, forward, [bot(1, 0, 2.33)], clear)).toBeNull();
  });
  it('does not lock onto side or rear targets, and accepts a close body at eye height', () => {
    expect(selectMeleeTarget(origin, forward, [bot(1, 1.5, .1), bot(2, 0, -1)], clear)).toBeNull();
    expect(selectMeleeTarget(origin, forward, [bot(3, 0, .5)], clear)).toBe(3);
  });
  it('requires aiming toward elevated bodies and rejects those outside physical reach', () => {
    const elevated = bot(1, 0, .5, 1.8);
    expect(selectMeleeTarget(origin, forward, [elevated], clear)).toBeNull();
    expect(selectMeleeTarget(origin, { x: 0, y: 1.25, z: .5 }, [elevated], clear)).toBe(1);
    expect(selectMeleeTarget(origin, { x: 0, y: 4, z: 1 }, [bot(2, 0, 1, 4)], clear)).toBeNull();
  });
  it('tests actual body-center visibility and selects a visible target beyond an occluded one', () => {
    const blocked = vi.fn((_from, point) => point.z < 1.2);
    expect(selectMeleeTarget(origin, forward, [bot(1, 0, 1), bot(2, 0, 1.5)], blocked)).toBe(2);
    expect(blocked).toHaveBeenCalledWith(origin, { x: 0, y: 1.1, z: 1 });
    expect(selectMeleeTarget(origin, forward, [bot(1)], () => true)).toBeNull();
  });
  it('normalizes valid aim directions and rejects zero directions or dead targets', () => {
    expect(selectMeleeTarget(origin, { x: 0, y: 0, z: 10 }, [bot(1)], clear)).toBe(1);
    expect(selectMeleeTarget(origin, { x: 0, y: 0, z: 0 }, [bot(1)], clear)).toBeNull();
    expect(selectMeleeTarget(origin, forward, [bot(1, 0, 1, 0, false)], clear)).toBeNull();
  });
});
