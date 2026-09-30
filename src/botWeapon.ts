import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Scene } from '@babylonjs/core/scene';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { roundedBox } from './rifleGeometry';

/** An original compact patrol carbine. Decorative geometry never becomes a target hitbox. */
export function buildBotWeapon(scene: Scene, parent: TransformNode, shadows: ShadowGenerator,
  metal: Material, polymer: Material, flashMaterial: StandardMaterial) {
  const root = new TransformNode('patrol carbine', scene); root.parent = parent;
  const pieces: Mesh[] = [];
  const finish = (mesh: Mesh, material: Material) => {
    mesh.material = material; mesh.parent = root; mesh.isPickable = false;
    mesh.metadata = null; mesh.receiveShadows = true; pieces.push(mesh); return mesh;
  };
  const box = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, mat = metal) => {
    const mesh = roundedBox(name, w, h, d, Math.min(.012, w * .2, h * .2, d * .2), scene);
    mesh.position.set(x, y, z); return finish(mesh, mat);
  };
  const tube = (name: string, z: number, length: number, diameter: number) => {
    const mesh = MeshBuilder.CreateCylinder(name, { height: length, diameter, tessellation: 12 }, scene);
    mesh.rotation.x = Math.PI / 2; mesh.position.set(0, .08, z); return finish(mesh, metal);
  };
  box('machined receiver', 0, .045, 0, .085, .12, .28);
  box('receiver top rail', 0, .118, -.055, .052, .025, .36);
  box('adjustable stock', 0, .05, .235, .065, .115, .20, polymer);
  box('stock rubber pad', 0, .025, .343, .075, .145, .025, polymer);
  const grip = box('pistol grip', 0, -.085, .08, .055, .17, .09, polymer); grip.rotation.x = -.25;
  const magazine = box('curved magazine', 0, -.095, -.09, .045, .18, .10, polymer); magazine.rotation.x = .13;
  box('vented handguard', 0, .055, -.25, .078, .11, .27, polymer);
  for (let i = 0; i < 5; i++) {
    box('handguard rib', 0, .055, -.15 - i * .043, .086, .115, .008);
    box('top rail tooth', 0, .135, .08 - i * .07, .066, .012, .024);
  }
  tube('steel barrel', -.44, .16, .022); tube('muzzle brake', -.537, .055, .034);
  box('front iron sight', 0, .155, -.405, .038, .07, .025);
  box('rear iron sight', 0, .165, .035, .056, .06, .032);
  box('ejection port', .044, .063, .04, .003, .046, .10, polymer);
  box('trigger guard', 0, -.049, .016, .041, .012, .083);
  const groups = new Map<Material, Mesh[]>();
  for (const mesh of pieces) {
    // The parent carries the bot's world position; merge only the gun's local geometry.
    mesh.parent = null;
    const group = groups.get(mesh.material!) ?? []; group.push(mesh); groups.set(mesh.material!, group);
  }
  for (const [material, meshes] of groups) {
    // Bake local component transforms before attaching the merged mesh to the animated gun root.
    const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, false);
    if (!merged) continue;
    merged.name = 'patrol carbine / ' + material.name; merged.parent = root;
    merged.material = material; merged.isPickable = false; merged.metadata = null; merged.receiveShadows = true;
    shadows.addShadowCaster(merged);
  }
  const flash = MeshBuilder.CreateSphere('enemy muzzle flash', { diameter: .12, segments: 6 }, scene);
  flash.parent = root; flash.position.set(0, .08, -.59); flash.scaling.z = 1.8;
  flash.material = flashMaterial; flash.isPickable = false; flash.metadata = null; flash.setEnabled(false);
  return { root, flash };
}

export function botFlashMaterial(scene: Scene) {
  const material = new StandardMaterial('patrol muzzle glow', scene);
  material.diffuseColor = new Color3(1, .54, .1); material.emissiveColor = new Color3(1, .62, .16);
  material.disableLighting = true; material.alpha = .92;
  return material;
}
