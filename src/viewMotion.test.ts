import { describe, expect, it } from 'vitest';
import { ViewMotion } from './viewMotion';

const input = (overrides = {}) => ({ yaw: 0, pitch: 0, ads: 0, speed: 0, strafeSpeed: 0, grounded: true, sprinting: false, crouching: false, ...overrides });
function advance(motion: ViewMotion, seconds: number, controls = input(), hz = 120) {
  for (let i = 0; i < Math.round(seconds * hz); i++) motion.update(1 / hz, controls);
}

describe('weapon and camera presentation', () => {
  it('tracks mouse turns with bounded sway, attenuates it in ADS and settles after stopping', () => {
    const hip = new ViewMotion(), aimed = new ViewMotion();
    for (let i = 1; i <= 60; i++) {
      hip.update(1 / 120, input({ yaw: i * .012 }));
      aimed.update(1 / 120, input({ yaw: i * .012, ads: 1 }));
    }
    expect(hip.weaponX).toBeLessThan(-.005);
    expect(Math.abs(aimed.weaponX)).toBeLessThan(Math.abs(hip.weaponX) * .2);
    const start = Math.abs(hip.weaponX);
    advance(hip, .6, input({ yaw: .72 }));
    expect(Math.abs(hip.weaponX)).toBeLessThan(start * .01);
    hip.update(1 / 120, input({ yaw: 10000, pitch: 10000 }));
    expect(Math.abs(hip.weaponX)).toBeLessThan(.02);
    expect(Number.isFinite(hip.weaponPitch)).toBe(true);
  });
  it('treats yaw wrapping as a small turn and ignores menu camera changes on resume', () => {
    const motion = new ViewMotion(); motion.reset(Math.PI - .001, 0);
    motion.update(1 / 60, input({ yaw: -Math.PI + .001 }));
    expect(Math.abs(motion.weaponX)).toBeLessThan(.001);
    motion.resetLook(2, 1); motion.update(1 / 60, input({ yaw: 2, pitch: 1 }));
    expect(motion.weaponX).toBe(0);
  });
  it('gives landings a deflection and recovery without shaking on stair-sized drops', () => {
    const motion = new ViewMotion(); motion.land(1);
    advance(motion, .15); expect(motion.cameraY).toBe(0);
    motion.land(7); advance(motion, .075); const early = motion.cameraY;
    advance(motion, .075); expect(motion.cameraY).toBeLessThan(early);
    expect(motion.cameraY).toBeLessThan(-.05);
    advance(motion, .3); expect(motion.cameraY).toBeCloseTo(0);
    expect(motion.weaponY).toBeGreaterThan(-.002);
  });
  it('accumulates recoil on repeated shots, recovers and behaves consistently at 30/60/144 Hz', () => {
    const kicks = [30, 60, 144].map(hz => {
      const motion = new ViewMotion(); motion.fire(1); advance(motion, .2, input(), hz);
      return motion.viewKick;
    });
    expect(Math.max(...kicks) - Math.min(...kicks)).toBeLessThan(.015);
    const motion = new ViewMotion(); motion.fire(.34); advance(motion, .08);
    const once = motion.gunKick;
    motion.fire(.34); advance(motion, .04);
    expect(motion.gunKick).toBeGreaterThan(once);
    expect(motion.cameraPitch).toBeLessThan(0);
    advance(motion, 1);
    expect(Math.abs(motion.gunKick)).toBeLessThan(.001);
    expect(Math.abs(motion.viewKick)).toBeLessThan(.001);
    motion.fire(1); motion.clearRecoil(); advance(motion, .1);
    expect(motion.gunKick).toBe(0); expect(motion.viewKick).toBe(0);
  });
  it('lowers the weapon during a sprint and restores a stable aimed posture', () => {
    const motion = new ViewMotion();
    advance(motion, .4, input({ sprinting: true, speed: 9 }));
    expect(motion.weaponY).toBeLessThan(-.04);
    expect(motion.weaponPitch).toBeGreaterThan(.15);
    advance(motion, .5, input({ ads: 1, speed: 3 }));
    expect(Math.abs(motion.weaponPitch)).toBeLessThan(.001);
    expect(Math.abs(motion.cameraRoll)).toBeLessThan(.001);
    motion.reset();
    expect(motion.sprint).toBe(0); expect(motion.weaponY).toBe(0);
  });
  it('produces consistent look sway and suppresses footfall bob in the air', () => {
    const turns = [30, 60, 144].map(hz => {
      const motion = new ViewMotion();
      for (let i = 1; i <= hz; i++) motion.update(1 / hz, input({ yaw: i / hz, speed: 6 }));
      return motion.weaponYaw;
    });
    expect(Math.max(...turns) - Math.min(...turns)).toBeLessThan(.001);
    const motion = new ViewMotion();
    advance(motion, .3, input({ speed: 6 }));
    advance(motion, .6, input({ speed: 6, grounded: false }));
    expect(Math.abs(motion.cameraY)).toBeLessThan(.0001);
  });
});
