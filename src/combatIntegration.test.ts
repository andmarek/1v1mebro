import { afterAll, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Ray } from '@babylonjs/core/Culling/ray';
import { captureGeometry, traceCover, type CoverSurface } from './ballistics';
import { selectMeleeTarget } from './melee';
import { BotCombat, playerHitDistance } from './botCombat';
import type { CombatVector } from './match';

const engine = new NullEngine(), scene = new Scene(engine);
afterAll(() => engine.dispose());
function wall(z: number): CoverSurface {
  const mesh = CreateBox('cover', { width: 4, height: 3, depth: .1 }, scene);
  mesh.position.set(0, 1.5, z);
  const geometry = captureGeometry(mesh); mesh.dispose();
  return { material: 'metal', geometry: [geometry] };
}
function visible(cover: CoverSurface[]) {
  return (a: CombatVector, b: CombatVector) => {
    const from = new Vector3(a.x, a.y, a.z), to = new Vector3(b.x, b.y, b.z);
    const distance = Vector3.Distance(from, to);
    return !traceCover(new Ray(from, to.subtract(from).normalize(), distance), cover)
      .some(hit => hit.entry.distance < distance - .01);
  };
}
it('blocks a reachable knife target using real cover triangles, but permits a clear strike', () => {
  const origin = { x: 0, y: 1.65, z: 0 }, direction = { x: 0, y: 0, z: 1 };
  const targets = [{ id: 0, x: 0, y: 0, z: 1.8, alive: true }];
  expect(selectMeleeTarget(origin, direction, targets, (a, b) => !visible([wall(1)])(a, b))).toBeNull();
  expect(selectMeleeTarget(origin, direction, targets, (a, b) => !visible([wall(3)])(a, b))).toBe(0);
});
it('prevents bot acquisition through real cover and distinguishes cover behind the player', () => {
  const bot = { id: 0, x: 0, y: 0, z: 0, alive: true };
  const player = { x: 0, y: 0, z: 10, height: 1.75, alive: true };
  const combat = new BotCombat(), occluded = visible([wall(5)]);
  for (let i = 0; i < 360; i++) expect(combat.update(i / 120, 1 / 120, [bot], player, true, occluded)).toHaveLength(0);
  const from = new Vector3(0, 1, 0), direction = Vector3.Forward();
  const entry = playerHitDistance(from, direction, player)!;
  expect(traceCover(new Ray(from, direction, entry), [wall(12)])).toHaveLength(0);
  expect(traceCover(new Ray(from, direction, entry), [wall(9.8)])).toHaveLength(0);
  expect(traceCover(new Ray(from, direction, entry), [wall(9.6)]).length).toBeGreaterThan(0);
});
