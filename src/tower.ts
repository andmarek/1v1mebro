import type { Solid } from './simulation';
export type TowerBox = { name: string; x: number; y: number; z: number; w: number; h: number; d: number; material: 'steel' | 'rust' };
/** Shared stair and deck collision envelopes; the arena renders open metal treads at their tops. */
export function towerGeometry(): TowerBox[] {
  const boxes: TowerBox[] = [];
  const add = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, material: 'steel' | 'rust' = 'steel') => boxes.push({ name, x, y, z, w, h, d, material });
  add('lower tower platform', 0, 4.1, 3.5, 7.6, 0.3, 7.6);
  // The upper deck has a stairwell rather than a solid ceiling over the steps.
  add('upper platform left', -3.1, 8.2, 3.5, 1.4, 0.3, 7.6, 'rust');
  add('upper platform right', 1.7, 8.2, 3.5, 4.2, 0.3, 7.6, 'rust');
  add('upper platform front', -1.4, 8.2, -0.06, 2, 0.3, 0.48, 'rust');
  for (let i = 0; i < 15; i++) {
    const top = (i + 1) * (4.25 / 15);
    add('stair tread', 5.2, top / 2, -5.8 + i * 0.6, 2.2, top, 0.6);
  }
  add('stair landing', 4.7, 4.1, 3.4, 2.4, 0.3, 2.2);
  for (let i = 0; i < 15; i++) {
    const top = 4.25 + (i + 1) * (4.1 / 15);
    add('upper stair tread', -1.4, (top + 4.25) / 2, 6.7 - i * 0.43, 1.8, top - 4.25, 0.43);
  }
  return boxes;
}
export function towerColliders(): Solid[] {
  return towerGeometry().map(({ x, y, z, w, h, d }) => ({ minX: x - w / 2, maxX: x + w / 2, minY: y - h / 2, maxY: y + h / 2, minZ: z - d / 2, maxZ: z + d / 2 }));
}
