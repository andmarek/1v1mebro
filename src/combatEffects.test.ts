import { expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CombatEffects, TRACER_LIMIT } from './combatEffects';

it('bounds enemy tracer allocation, expires effects, and reuses geometry after reset', () => {
  const engine = new NullEngine(), scene = new Scene(engine), effects = new CombatEffects(scene);
  try {
    for (let i = 0; i < 100; i++) effects.shot(new Vector3(i, 1, 0), new Vector3(i, 1, 10), 1);
    expect(scene.meshes).toHaveLength(TRACER_LIMIT);
    expect(scene.meshes.every(mesh => mesh.isEnabled() && !mesh.isPickable)).toBe(true);
    effects.update(1.08); expect(scene.meshes.every(mesh => !mesh.isEnabled())).toBe(true);
    effects.shot(Vector3.Zero(), new Vector3(1, 2, 3), 2); effects.clear();
    expect(scene.meshes).toHaveLength(TRACER_LIMIT);
    expect(scene.meshes.every(mesh => !mesh.isEnabled())).toBe(true);
  } finally { scene.dispose(); engine.dispose(); }
});
