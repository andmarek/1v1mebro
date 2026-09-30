import { describe, expect, it } from 'vitest';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Ray } from '@babylonjs/core/Culling/ray';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { armElbow, enemyGeometry, poseArm, rifleContact } from './enemyAppearance';

describe('soldier presentation', () => {
  it('keeps both hands on their rifle contacts while raising, pitching and lowering the weapon', () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const chest = new TransformNode('chest', scene), gun = new TransformNode('gun', scene); gun.parent = chest;
      for (const blend of [0, .25, .5, .75, 1]) for (const pitch of [-.6, 0, .6]) {
        gun.position.set(.10, 1.24 + blend * .27, -.10 - blend * .07);
        gun.rotation.set(-.64 * (1 - blend) + pitch * blend, 0, -.18 * (1 - blend));
        for (const side of [-1, 1]) {
          const shoulder = new TransformNode('shoulder', scene); shoulder.parent = chest; shoulder.position.set(side * .32, 1.43, 0);
          const elbow = new TransformNode('elbow', scene); elbow.parent = shoulder; elbow.position.y = -.29;
          const glove = new TransformNode('glove', scene); glove.parent = elbow; glove.position.y = -.28;
          const contact = rifleContact(gun, side < 0 ? new Vector3(-.025, .017, -.16) : new Vector3(.013, -.085, .12));
          const middle = armElbow(shoulder.position, contact, new Vector3(side * .28, -.9, .08));
          expect(Vector3.Distance(middle, shoulder.position)).toBeCloseTo(.29);
          expect(Vector3.Distance(middle, contact)).toBeCloseTo(.28);
          poseArm(shoulder, elbow, glove, contact, side, gun);
          chest.computeWorldMatrix(true); shoulder.computeWorldMatrix(true); elbow.computeWorldMatrix(true); glove.computeWorldMatrix(true);
          expect(Vector3.Distance(glove.getAbsolutePosition(), contact)).toBeLessThan(.00001);
          shoulder.dispose();
        }
      }
    } finally { scene.dispose(); engine.dispose(); }
  });
  it('retains the original hidden torso as a shooting target without adding cosmetic hitboxes', () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const geometry = enemyGeometry(scene, { addShadowCaster: () => {} } as unknown as ShadowGenerator, 2);
      const root = new TransformNode('chest', scene), mat = new StandardMaterial('cloth', scene);
      const torso = geometry.hit(MeshBuilder.CreateBox('torso', { width: .6, height: .7, depth: .3 }, scene), root, mat, false, false);
      torso.position.y = 1.2;
      geometry.box('decorative chest armor', root, mat, 0, 1.2, -.2, .4, .5, .1);
      geometry.flush();
      scene.meshes.forEach(mesh => mesh.computeWorldMatrix(true));
      const pick = scene.pickWithRay(new Ray(new Vector3(0, 1.2, -4), new Vector3(0, 0, 1)), mesh => mesh.isEnabled() && mesh.metadata?.target !== undefined);
      expect(pick?.pickedMesh).toBe(torso); expect(pick?.distance).toBeCloseTo(3.85);
      expect(torso.visibility).toBe(0); expect(torso.isPickable).toBe(true);
    } finally { scene.dispose(); engine.dispose(); }
  });
  it('combines different rough colors into one joint batch without losing their tint', () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const fabric = new StandardMaterial('shared fabric', scene), vest = new StandardMaterial('vest', scene), strap = new StandardMaterial('strap', scene);
      vest.specularColor.set(.04, .04, .04); strap.specularColor.set(.04, .04, .04);
      vest.diffuseColor.set(.2, .3, .1); strap.diffuseColor.set(.6, .5, .3);
      const geometry = enemyGeometry(scene, { addShadowCaster: () => {} } as unknown as ShadowGenerator, 2, fabric);
      const root = new TransformNode('shoulder', scene);
      geometry.box('pouch', root, vest, 0, 0, 0, .1, .1, .1);
      geometry.box('strap', root, strap, 0, .1, 0, .1, .1, .1);
      geometry.flush();
      const meshes = root.getChildMeshes(); expect(meshes).toHaveLength(1); expect(meshes[0].material).toBe(fabric);
      const colors = meshes[0].getVerticesData(VertexBuffer.ColorKind)!;
      expect(colors[0]).toBeCloseTo(.2); expect(colors[colors.length - 4]).toBeCloseTo(.6);
      expect(geometry.hits).toEqual([]);
    } finally { scene.dispose(); engine.dispose(); }
  });
  it('batches cosmetic gear per joint/material and excludes it from body and head hit testing', () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const shadows: unknown[] = [], geometry = enemyGeometry(scene, { addShadowCaster: (mesh: unknown) => shadows.push(mesh) } as unknown as ShadowGenerator, 3);
      const root = new TransformNode('bot', scene); root.position.set(10, 4, 8);
      const headJoint = geometry.joint('head', root, 0, 1.8), mat = new StandardMaterial('helmet', scene);
      const head = geometry.hit(MeshBuilder.CreateSphere('head volume', { diameter: .32 }, scene), headJoint, mat, true);
      geometry.box('helmet rim', headJoint, mat, 0, .06, 0, .25, .07, .21);
      geometry.ellipsoid('helmet shell', headJoint, mat, 0, .09, 0, .32, .13, .24);
      geometry.flush();
      expect(geometry.hits).toEqual([head]); expect(head.metadata).toEqual({ target: 3, head: true });
      const decor = headJoint.getChildMeshes().filter(mesh => mesh !== head);
      expect(decor).toHaveLength(1); expect(decor[0].isPickable).toBe(false); expect(decor[0].metadata).toBeNull();
      expect(shadows).toEqual([head]);
      decor[0].computeWorldMatrix(true);
      expect(decor[0].getBoundingInfo().boundingBox.centerWorld.x).toBeCloseTo(10);
      expect(decor[0].getBoundingInfo().boundingBox.centerWorld.y).toBeGreaterThan(5.8);
      root.position.x += 6; decor[0].computeWorldMatrix(true);
      expect(decor[0].getBoundingInfo().boundingBox.centerWorld.x).toBeCloseTo(16);
    } finally { scene.dispose(); engine.dispose(); }
  });
});
