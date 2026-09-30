import { describe, expect, it, vi } from 'vitest';
import type { BotSnapshot } from './match';
import { ARENA_SPAWNS, chooseSpawn, INITIAL_SPAWN, isValidSpawn, type SpawnPoint } from './spawning';
import { movePlayer, PLAYER_RADIUS, type Solid } from './simulation';
import { towerColliders } from './tower';

const point = (id: string, x: number, z = 0, y = 0): SpawnPoint => ({ id, x, y, z, yaw: 0 });
const enemy = (x: number, z = 0, y = 0, alive = true): BotSnapshot => ({ id: 0, x, y, z, alive });
const box = (x: number, y: number, z: number, w: number, h: number, d: number): Solid =>
  ({ minX: x - w / 2, maxX: x + w / 2, minY: y - h / 2, maxY: y + h / 2, minZ: z - d / 2, maxZ: z + d / 2 });

describe('fair spawn selection', () => {
  it('prefers a hidden spawn even when a visible spawn is further away', () => {
    expect(chooseSpawn([point('visible', 25), point('hidden', 10)], [enemy(0)], (_, to) => to.x === 25, [])?.id).toBe('hidden');
  });
  it('chooses the least exposed valid option when every point is visible', () => {
    const bots = [enemy(0), { ...enemy(20), id: 1 }];
    expect(chooseSpawn([point('both', 10), point('one', -20)], bots, () => true, [])?.id).toBe('one');
    expect(chooseSpawn([point('near', 4), point('far', 20)], [enemy(0)], () => true, [])?.id).toBe('far');
  });
  it('avoids nearby enemies and uses true distance among similarly safe points', () => {
    expect(chooseSpawn([point('near', 7), point('far', -12)], [enemy(0)], () => false, [])?.id).toBe('far');
    expect(chooseSpawn([point('ten', 10), point('twenty', 20)], [enemy(0)], () => false, [])?.id).toBe('twenty');
  });
  it('rejects occupied points instead of spawning inside an enemy', () => {
    expect(chooseSpawn([point('occupied', .8), point('open', 12)], [enemy(0)], () => false, [])?.id).toBe('open');
    expect(chooseSpawn([point('occupied', .8)], [enemy(0)], () => false, [])).toBeNull();
    expect(chooseSpawn([point('under-deck', 0)], [enemy(0, 0, 4.25)], () => false, [])?.id).toBe('under-deck');
  });
  it('ignores dead enemies for occupancy, distance and visibility', () => {
    const sight = vi.fn(() => true);
    expect(chooseSpawn([point('a', 0), point('b', 10)], [enemy(0, 0, 0, false)], sight, [])?.id).toBe('a');
    expect(sight).not.toHaveBeenCalled();
  });
  it('discourages repeating a spot and rotates exact ties deterministically', () => {
    const points = [point('a', 0), point('b', 10), point('c', 20)];
    expect(chooseSpawn(points, [], () => false, [], 'a')?.id).toBe('b');
    expect(chooseSpawn(points, [], () => false, [], 'b')?.id).toBe('c');
    expect(chooseSpawn(points, [], () => false, [], 'c')?.id).toBe('a');
    expect(chooseSpawn(points, [], () => false, [], 'unknown')?.id).toBe('a');
    // A repeat remains preferable to being immediately visible in the open.
    expect(chooseSpawn(points.slice(0, 2), [enemy(20)], (_, to) => to.x === 10, [], 'a')?.id).toBe('a');
  });
  it('checks real muzzle-to-torso visibility only within firing range', () => {
    const sight = vi.fn(() => false);
    chooseSpawn([point('one', 0, 0)], [enemy(5, 2, 4.25), enemy(100)], sight, []);
    expect(sight).toHaveBeenCalledExactlyOnceWith({ x: 5, y: 5.59, z: 2 }, { x: 0, y: 1.05, z: 0 });
  });
  it('rejects cover, low ceilings, unsupported elevated points and outside-map positions', () => {
    const solid = box(0, .5, 0, 2, 1, 2);
    expect(chooseSpawn([point('cover', 0), point('safe', 5)], [], () => false, [solid])?.id).toBe('safe');
    expect(isValidSpawn(point('ceiling', 0), [box(0, 1.5, 0, 4, .2, 4)])).toBe(false);
    for (const p of [point('air', 0, 0, 2), point('outside', 29), point('below', 0, 0, -1), point('invalid', NaN)]) {
      expect(isValidSpawn(p, [])).toBe(false);
    }
    expect(chooseSpawn([point('cover', 0)], [], () => false, [solid])).toBeNull();
    expect(chooseSpawn([], [], () => false, [])).toBeNull();
  });
  it('accepts supported feet only when the whole player footprint fits', () => {
    const platform = box(0, 1, 0, 2, 2, 2);
    expect(isValidSpawn(point('supported', 0, 0, 2), [platform])).toBe(true);
    expect(isValidSpawn(point('over-edge', 1 - PLAYER_RADIUS + .01, 0, 2), [platform])).toBe(false);
    expect(isValidSpawn(point('floating', 0, 0, 2.01), [platform])).toBe(false);
  });
  it('returns a copy and leaves candidates and enemies unchanged', () => {
    const points = [Object.freeze(point('a', 4))];
    const bots = [Object.freeze(enemy(12))];
    const selected = chooseSpawn(points, bots, () => false, [])!;
    selected.x = 0;
    expect(points[0].x).toBe(4); expect(bots[0].x).toBe(12);
  });
});

describe('authored scrapyard spawns', () => {
  it('retains the original initial position and provides unique safe ground entries', () => {
    expect(INITIAL_SPAWN).toEqual({ id: 'south-entry', x: 0, y: 0, z: -23, yaw: 0 });
    expect(ARENA_SPAWNS).toHaveLength(10);
    expect(new Set(ARENA_SPAWNS.map(p => p.id)).size).toBe(ARENA_SPAWNS.length);
    expect(ARENA_SPAWNS.every(p => p.y === 0)).toBe(true);
  });
  it('clears current yard collision envelopes and remains grounded under the character controller', () => {
    // Matching collision envelopes authored in arena.ts, including all major ground cover.
    const solids: Solid[] = towerColliders();
    for (const [x, z, w, d] of [[-16, -10, 9, 3.8], [17, 3, 10, 4], [-17, 18, 10, 4], [19, -19, 7, 3.8], [16, 21, 7, 4]]) solids.push(box(x, 1.5, z, w, 3, d));
    for (const [x, z, w] of [[-7, -16, 5], [7, -14, 4], [-11, 2, 4], [10, 12, 4], [-5, 21, 6]]) solids.push(box(x, .22, z, w, .44, 1.3), box(x, .77, z, w, 1.1, .7));
    for (const [x, z] of [[-23, 2], [23, 12], [-10, 24], [10, -24]]) solids.push(box(x, .65, z, 1.5, 1.3, 1.5));
    for (const [x, z] of [[-23, -20], [23, -6], [-9, 11], [11, 24]]) solids.push(box(x, .6, z, .8, 1.2, .8));
    for (const x of [-3.5, 3.5]) for (const z of [0, 7]) solids.push(box(x, 5.75, z, .28, 11.5, .28));
    for (const [x, z, thickness] of [[0, -11, .035], [10, -6, .12]]) {
      solids.push(box(x, 1.1, z, 2.3, 2.2, thickness));
      for (const side of [-1, 1]) solids.push(box(x + side * 1.21, 1.2, z, .09, 2.4, .09), box(x + side * 1.21, .04, z, .45, .08, .8));
    }
    for (let i = 0; i < 3; i++) solids.push({ minX: -22.6 + i * 1.3, maxX: -21.4 + i * 1.3, minY: 0, maxY: 1.25, minZ: 6.25, maxZ: 11.75 });
    for (const edge of [-30, 30]) solids.push(box(edge, 2.2, 0, .8, 4.4, 61), box(0, 1.3, edge, 61, 2.6, .8));
    for (const spawn of ARENA_SPAWNS) {
      expect(isValidSpawn(spawn, solids), spawn.id).toBe(true);
      const player = { x: spawn.x, y: spawn.y, z: spawn.z, vy: 0, grounded: true };
      movePlayer(player, 0, 0, 1 / 120, solids);
      expect(player.y, spawn.id).toBe(0); expect(player.grounded, spawn.id).toBe(true);
    }
  });
});
