import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { EnemyMaterials } from './enemyAppearance';
import { buildSoldier } from './soldier';
import { createPatrol, PatrolNavigation } from './patrol';

describe('shared soldier rig', () => {
  it('retains NPC hit targets while keeping the replay victim hidden, cosmetic and reusable', () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const keys = ['detailFabric', 'uniform', 'vest', 'webbing', 'rubber', 'skin', 'helmet', 'metal', 'lens', 'marker'];
      const materials = Object.fromEntries(keys.map(key => [key, new StandardMaterial(key, scene)])) as EnemyMaterials;
      const flash = new StandardMaterial('flash', scene), shadows = { addShadowCaster: () => {} } as unknown as ShadowGenerator;
      const patrol = () => createPatrol([{ x: 0, z: 0 }, { x: 3, z: 0 }], new PatrolNavigation([], 0), 0);
      const enemy = buildSoldier(scene, shadows, 2, Vector3.Zero(), patrol(), materials, flash);
      const victim = buildSoldier(scene, shadows, -1, Vector3.Zero(), patrol(), materials, flash, true);
      expect(enemy.root.isEnabled()).toBe(true); expect(enemy.meshes.some(mesh => mesh.metadata?.head && mesh.metadata.target === 2)).toBe(true);
      expect(victim.root.isEnabled()).toBe(false);
      expect(victim.root.getChildMeshes().every(mesh => !mesh.isPickable && mesh.metadata === null)).toBe(true);
      const count = scene.meshes.length;
      for (let frame = 0; frame < 30; frame++) { enemy.animate(1 / 30, frame / 30); enemy.setCombatPose(true, .4, -.2, Infinity); }
      expect(enemy.aimAmount()).toBeGreaterThan(.99); enemy.reset(); expect(enemy.aimAmount()).toBe(0);
      victim.root.setEnabled(true); victim.patrol.x = 3; victim.home.y = 2; victim.animate(.1, 1);
      expect(victim.root.position.x).toBe(3); expect(victim.root.position.y).toBe(2);
      victim.reset(); victim.root.setEnabled(false); expect(scene.meshes.length).toBe(count);
      expect(victim.root.getChildMeshes().every(mesh => !mesh.isPickable)).toBe(true);
    } finally { scene.dispose(); engine.dispose(); }
  });
});
