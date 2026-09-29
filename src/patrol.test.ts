import { describe, expect, it } from 'vitest';
import { createPatrol, PATROL_ROUTES, PatrolNavigation, resetPatrol, updatePatrol, walkingPose } from './patrol';
import { towerColliders } from './tower';

describe('walking enemy patrols', () => {
  const cover = [{ minX: -1, maxX: 1, minZ: -2, maxZ: 2, minY: 0, maxY: 3 }];
  it('routes around solid cover without cutting its corners', () => {
    const navigation = new PatrolNavigation(cover, 0, 8, .5);
    let previous = { x: -4, z: 0 };
    const route = navigation.path(previous, { x: 4, z: 0 });
    expect(route.length).toBeGreaterThan(1);
    for (const point of route) { expect(navigation.canWalk(previous, point)).toBe(true); previous = point; }
    expect(route.at(-1)).toEqual({ x: 4, z: 0 });
    expect(navigation.path(previous, { x: 0, z: 0 })).toEqual([]);
  });
  it('walks continuously through a loop and stops when movement is disabled', () => {
    const navigation = new PatrolNavigation(cover, 0, 8, .5);
    const patrol = createPatrol([{ x: -4, z: 0 }, { x: 4, z: 0 }], navigation, 0);
    let travelled = 0;
    for (let i = 0; i < 2400; i++) {
      const old = { x: patrol.x, z: patrol.z };
      updatePatrol(patrol, 1 / 60, true);
      const step = Math.hypot(patrol.x - old.x, patrol.z - old.z);
      expect(step).toBeLessThanOrEqual(patrol.maxSpeed / 60 + .000001);
      expect(navigation.canStand(patrol)).toBe(true); travelled += step;
    }
    expect(travelled).toBeGreaterThan(25); expect(patrol.lap).toBeGreaterThan(1);
    const before = { x: patrol.x, z: patrol.z };
    for (let i = 0; i < 60; i++) updatePatrol(patrol, 1 / 60, false);
    expect({ x: patrol.x, z: patrol.z }).toEqual(before); expect(patrol.walking).toBe(false);
    resetPatrol(patrol); expect({ x: patrol.x, z: patrol.z }).toEqual(patrol.home);
    expect(patrol.path).toEqual([]); expect(patrol.speed).toBe(0); expect(patrol.wait).toBe(patrol.initialWait);
  });
  it('keeps both tower patrols supported by their actual platforms', () => {
    const solids = towerColliders();
    for (const [index, floor] of [[5, 4.25], [6, 8.35]]) {
      const navigation = new PatrolNavigation(solids, floor, 8, .5);
      const patrol = createPatrol(PATROL_ROUTES[index], navigation, index);
      for (let i = 0; i < 1800; i++) {
        updatePatrol(patrol, 1 / 60, true); expect(navigation.canStand(patrol)).toBe(true);
      }
      expect(patrol.lap).toBeGreaterThan(3);
    }
    const upper = new PatrolNavigation(solids, 8.35, 8, .5);
    expect(upper.canStand({ x: -1.4, z: 4 })).toBe(false);
    expect(upper.canStand({ x: 5, z: 4 })).toBe(false);
  });
  it('waits for a character immediately ahead instead of passing through', () => {
    const navigation = new PatrolNavigation([], 0, 8, .5);
    const patrol = createPatrol([{ x: 0, z: 0 }, { x: 0, z: -4 }], navigation, 0);
    for (let i = 0; i < 120; i++) updatePatrol(patrol, 1 / 60, true, [{ x: 0, z: -.4 }]);
    expect(patrol.z).toBe(0); expect(patrol.walking).toBe(false);
    for (let i = 0; i < 120; i++) updatePatrol(patrol, 1 / 60, true);
    expect(patrol.z).toBeLessThan(-1);
  });
  it('swings opposite limbs, lifts the forward knee, and returns to idle', () => {
    const stride = walkingPose(.22, 1);
    expect(stride.leftLeg).toBe(-stride.rightLeg); expect(stride.leftArm).toBe(-stride.rightArm);
    expect(stride.leftArm * stride.leftLeg).toBeLessThan(0); expect(stride.leftKnee).toBeLessThan(0);
    const idle = walkingPose(.22, 0);
    expect(Math.abs(idle.leftLeg) + Math.abs(idle.rightKnee) + Math.abs(idle.leftArm) + Math.abs(idle.bob)).toBe(0);
  });
});
