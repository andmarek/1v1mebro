import { describe, expect, it } from 'vitest';
import { movePlayer, Rifle, type Player, type Solid } from './simulation';
import { towerColliders } from './tower';
const player = (): Player => ({ x: 0, y: 0, z: 0, vy: 0, grounded: true });
const wall: Solid = { minX: 1, maxX: 1.1, minY: 0, maxY: 3, minZ: -2, maxZ: 2 };
describe('character movement', () => {
  it('cannot sprint through a thin wall, and slides along it', () => {
    const p = player(); movePlayer(p, 5, 1, 0.2, [wall]);
    expect(p.x).toBeLessThanOrEqual(0.68); expect(p.z).toBeCloseTo(1);
  });
  it('steps up low stairs but cannot walk onto tall cover', () => {
    const p = player(); movePlayer(p, 1.2, 0, 0.1, [{ ...wall, maxX: 3, maxY: 0.3 }]);
    expect(p.y).toBeCloseTo(0.3); expect(p.x).toBeCloseTo(1.2);
    const q = player(); movePlayer(q, 1.2, 0, 0.1, [wall]); expect(q.y).toBe(0);
  });
  it('lands on a platform and stops upward at a ceiling', () => {
    const p = { ...player(), x: 1.5, y: 4, vy: -5, grounded: false };
    const platform = { ...wall, maxX: 3, maxY: 2 };
    for (let i = 0; i < 90; i++) movePlayer(p, 0, 0, 1 / 120, [platform]);
    expect(p.y).toBeCloseTo(2); expect(p.grounded).toBe(true);
    const q = { ...player(), vy: 8 };
    const roof = { minX: -2, maxX: 2, minZ: -2, maxZ: 2, minY: 2, maxY: 3 };
    for (let i = 0; i < 10; i++) movePlayer(q, 0, 0, 1 / 120, [roof]);
    expect(q.y).toBeLessThanOrEqual(0.25);
  });
  it('can walk the actual tower stairs to both platforms', () => {
    const p = { ...player(), x: 5.2, z: -7 };
    const solids = towerColliders();
    const walkTo = (x: number, z: number) => {
      for (let i = 0; i < 1500; i++) {
        const dx = x - p.x, dz = z - p.z, distance = Math.hypot(dx, dz);
        if (distance < 0.025) return;
        const step = Math.min(distance, 5.2 / 120);
        movePlayer(p, dx / distance * step, dz / distance * step, 1 / 120, solids);
      }
      throw new Error(`Stuck at ${p.x}, ${p.y}, ${p.z}`);
    };
    walkTo(5.2, 3.4); expect(p.y).toBeCloseTo(4.25);
    walkTo(1, 3.4); walkTo(1, 7.25); walkTo(-1.4, 7.25);
    walkTo(-1.4, 0.05); expect(p.y).toBeCloseTo(8.35);
  });
});
describe('bolt-action rifle', () => {
  it('enforces the bolt cycle and magazine capacity', () => {
    const r = new Rifle(); expect(r.fire(0)).not.toBeNull(); expect(r.fire(0.5)).toBeNull();
    for (let t = 1; t < 5; t++) expect(r.fire(t)).not.toBeNull();
    expect(r.fire(6)).toBeNull(); expect(r.ammo).toBe(0);
  });
  it('blocks firing during reload and refills only when finished', () => {
    const r = new Rifle(); r.fire(0); expect(r.reload(1)).toBe(true);
    expect(r.fire(2)).toBeNull(); r.update(3, 0.01, false, 0.18); expect(r.ammo).toBe(4);
    r.update(3.2, 0.01, false, 0.18); expect(r.ammo).toBe(5); expect(r.fire(3.2)).not.toBeNull();
  });
  it('awards quickscopes only just after the accuracy threshold', () => {
    const r = new Rifle(); r.update(0.14, 0.14, true, 0.18);
    expect(r.fire(0.15)?.quickscope).toBe(true);
    expect(r.fire(1.1)?.quickscope).toBe(false);
    r.update(1.2, 0.18, false, 0.18); expect(r.ads).toBe(0);
    expect(r.accurateSince).toBe(-Infinity);
  });
});
