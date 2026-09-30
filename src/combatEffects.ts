import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateLines } from '@babylonjs/core/Meshes/Builders/linesBuilder';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { Scene } from '@babylonjs/core/scene';

export const TRACER_LIMIT = 12;
/** Brief, depth-tested bot tracers. Geometry is reused and never acts as a hitbox. */
export class CombatEffects {
  private readonly pool: { mesh: LinesMesh; until: number }[] = [];
  constructor(private readonly scene: Scene) {}
  shot(from: Vector3, to: Vector3, now: number) {
    let entry = this.pool.find(item => item.until <= now);
    if (!entry && this.pool.length < TRACER_LIMIT) {
      const mesh = CreateLines('enemy tracer', { points: [Vector3.Zero(), Vector3.Zero()], updatable: true }, this.scene);
      mesh.color = new Color3(1, .72, .32); mesh.alpha = .4; mesh.isPickable = false;
      entry = { mesh, until: 0 }; this.pool.push(entry);
    }
    entry ??= this.pool.reduce((a, b) => a.until < b.until ? a : b);
    CreateLines('enemy tracer', { points: [from, to], instance: entry.mesh }, this.scene);
    entry.mesh.setEnabled(true); entry.until = now + .07;
  }
  update(now: number) { for (const entry of this.pool) if (entry.until <= now) entry.mesh.setEnabled(false); }
  clear() { for (const entry of this.pool) { entry.until = 0; entry.mesh.setEnabled(false); } }
}
