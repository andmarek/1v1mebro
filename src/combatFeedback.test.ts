import { expect, it } from 'vitest';
// Bearing stays independent of DOM presentation; CSS is harmless under Vitest.
import { damageBearing } from './combatFeedback';
it('shows incoming fire relative to current facing, including wraparound and respawn positions', () => {
  const player = { x: 10, y: 0, z: -5 };
  expect(damageBearing(player, { x: 10, y: 4, z: 0 }, 0)).toBe(0);
  expect(damageBearing(player, { x: 15, y: 0, z: -5 }, 0)).toBeCloseTo(Math.PI / 2);
  expect(damageBearing(player, { x: 5, y: 0, z: -5 }, 0)).toBeCloseTo(-Math.PI / 2);
  expect(Math.abs(damageBearing(player, { x: 10, y: 0, z: -10 }, 0))).toBeCloseTo(Math.PI);
  expect(damageBearing(player, { x: 15, y: 0, z: -5 }, Math.PI / 2)).toBeCloseTo(0);
  expect(damageBearing(player, { x: 10, y: 0, z: 0 }, Math.PI * 2)).toBeCloseTo(0);
});
