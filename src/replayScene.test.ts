import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ReplayScene } from './replayScene';

describe('replay scene presentation', () => {
  it('replays articulated transforms, scope and wrapped camera turns, then restores the final pose', () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const camera = new FreeCamera('camera', Vector3.Zero(), scene), soldier = new TransformNode('soldier', scene);
      const arm = new TransformNode('arm', scene); arm.parent = soldier;
      const glove = new Mesh('glove', scene); glove.parent = arm; glove.position.y = -1; glove.visibility = .6;
      const adapter = new ReplayScene(camera, [soldier, arm]);
      expect(adapter.nodes).toHaveLength(3);
      soldier.position.x = 1; arm.rotationQuaternion = Quaternion.FromEulerAngles(0, 0, -.3);
      camera.rotation.y = Math.PI - .1; camera.fov = .8;
      const a = { at: 0, pose: new Float32Array(adapter.width) }; adapter.capture(a.pose, 0, false);
      soldier.position.x = 3; arm.rotationQuaternion = Quaternion.FromEulerAngles(0, 0, .3);
      camera.position.z = 2; camera.rotation.y = -Math.PI + .1; camera.fov = .2;
      soldier.setEnabled(false); glove.setEnabled(false);
      const b = { at: 1, pose: new Float32Array(adapter.width) }; adapter.capture(b.pose, 1, true);
      const lens = adapter.apply({ before: a, after: b, mix: .5 });
      expect(soldier.position.x).toBeCloseTo(2); expect(soldier.isEnabled()).toBe(true);
      expect(glove.isEnabled(false)).toBe(true); expect(glove.visibility).toBeCloseTo(.6);
      expect(arm.rotationQuaternion!.toEulerAngles().z).toBeCloseTo(0);
      expect(Math.abs(camera.rotation.y)).toBeCloseTo(Math.PI); expect(camera.fov).toBeCloseTo(.5); expect(lens.scope).toBeCloseTo(.5);
      adapter.apply({ before: b, after: b, mix: 0 });
      expect(soldier.position.x).toBeCloseTo(3); expect(soldier.isEnabled()).toBe(false);
      expect(glove.isEnabled(false)).toBe(false); expect(camera.fov).toBeCloseTo(.2);
    } finally { scene.dispose(); engine.dispose(); }
  });
  it('snaps a respawn rather than interpolating through walls', () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const camera = new FreeCamera('camera', Vector3.Zero(), scene), root = new TransformNode('bot', scene), adapter = new ReplayScene(camera, [root]);
      const a = { at: 0, pose: new Float32Array(adapter.width) }; adapter.capture(a.pose, 0, false);
      root.position.x = camera.position.x = 20;
      const b = { at: 1, pose: new Float32Array(adapter.width) }; adapter.capture(b.pose, 0, false);
      adapter.apply({ before: a, after: b, mix: .9 }); expect(root.position.x).toBe(0); expect(camera.position.x).toBe(0);
      adapter.apply({ before: b, after: b, mix: 0 }); expect(root.position.x).toBe(20);
    } finally { scene.dispose(); engine.dispose(); }
  });
  it('restores the latest live poses after drawing history, including on a failed render', () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const camera = new FreeCamera('camera', Vector3.Zero(), scene), root = new TransformNode('bot', scene);
      const arm = new Mesh('arm', scene); arm.parent = root;
      const adapter = new ReplayScene(camera, [root]);
      const historical = { at: 0, pose: new Float32Array(adapter.width) }; adapter.capture(historical.pose, 0, false);
      // The live bot has moved/respawned since the death, while the spectator camera is elsewhere.
      root.position.set(15, 2, 4); arm.rotation.z = .7; arm.visibility = .4; arm.setEnabled(false);
      camera.position.set(10, 3, -8); camera.fov = .9;
      for (const failure of [false, true]) {
        const draw = () => adapter.renderPresentation(() => {
          adapter.apply({ before: historical, after: historical, mix: 0 });
          root.setEnabled(false); expect(camera.position.x).toBe(0); expect(arm.isEnabled(false)).toBe(true);
          if (failure) throw new Error('render failed');
        });
        if (failure) expect(draw).toThrow('render failed'); else draw();
        expect(root.position.asArray()).toEqual([failure ? 16 : 15, 2, 4]); expect(root.isEnabled()).toBe(true);
        expect(arm.rotation.z).toBeCloseTo(.7); expect(arm.visibility).toBeCloseTo(.4); expect(arm.isEnabled(false)).toBe(false);
        expect(camera.position.asArray()).toEqual([10, 3, -8]); expect(camera.fov).toBeCloseTo(.9);
        root.position.x++;
      }
    } finally { scene.dispose(); engine.dispose(); }
  });
});
