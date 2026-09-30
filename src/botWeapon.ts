import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Scene } from '@babylonjs/core/scene';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { roundedBox } from './rifleGeometry';

/** An original scoped bolt-action rifle. Decorative geometry never becomes a target hitbox. */
export function buildBotWeapon(scene: Scene, parent: TransformNode, shadows: ShadowGenerator,
  metal: Material, polymer: Material, flashMaterial: StandardMaterial) {
  const root = new TransformNode('patrol sniper', scene); root.parent = parent;
  const pieces: Mesh[] = [];
  const finish = (mesh: Mesh, material: Material) => {
    mesh.material = material; mesh.parent = root; mesh.isPickable = false;
    mesh.metadata = null; mesh.receiveShadows = true; pieces.push(mesh); return mesh;
  };
  const box = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, mat = metal) => {
    const mesh = roundedBox(name, w, h, d, Math.min(.012, w * .2, h * .2, d * .2), scene);
    mesh.position.set(x, y, z); return finish(mesh, mat);
  };
  const tube = (name: string, z: number, length: number, diameter: number, y = .08, mat = metal) => {
    const mesh = MeshBuilder.CreateCylinder(name, { height: length, diameter, tessellation: 16 }, scene);
    mesh.rotation.x = Math.PI / 2; mesh.position.set(0, y, z); return finish(mesh, mat);
  };
  // A long fluted barrel, slim chassis and large optic give readable sniper proportions.
  box('bolt-action receiver', 0, .06, .035, .095, .12, .32);
  box('scope mounting rail', 0, .137, -.01, .058, .025, .32);
  box('skeleton stock beam', 0, .065, .275, .045, .05, .23);
  box('adjustable cheek rest', 0, .12, .285, .065, .075, .16, polymer);
  box('stock rubber shoulder pad', 0, .035, .415, .078, .18, .028, polymer);
  const grip = box('sloped pistol grip', 0, -.072, .12, .06, .18, .085, polymer); grip.rotation.x = -.26;
  box('five-round magazine', 0, -.055, -.075, .062, .10, .115, polymer);
  box('slender chassis handguard', 0, .035, -.245, .079, .09, .31, polymer);
  for (let i = 0; i < 6; i++) {
    box('chassis vent rim', 0, .035, -.115 - i * .045, .087, .095, .009);
  }
  tube('free-float precision barrel', -.61, .46, .028);
  for (const side of [-1, 1]) {
    const flute = box('barrel flute', side * .013, .08, -.60, .006, .005, .34, polymer);
    flute.rotation.z = side * .35;
  }
  tube('ported muzzle brake', -.884, .085, .049);
  for (let i = 0; i < 3; i++) box('brake port', 0, .104, -.857 - i * .024, .035, .005, .009, polymer);
  tube('optic body', -.055, .31, .058, .225);
  tube('scope objective bell', -.25, .08, .093, .225);
  tube('scope objective glass', -.293, .003, .072, .225, polymer);
  tube('scope eyepiece', .12, .062, .073, .225);
  tube('scope eyepiece glass', .153, .003, .054, .225, polymer);
  for (const z of [-.14, .055]) {
    tube('optic clamp', z, .028, .071, .225);
    box('scope mount', 0, .169, z, .053, .063, .035);
  }
  const turret = MeshBuilder.CreateCylinder('elevation turret', { height: .04, diameter: .048, tessellation: 16 }, scene);
  turret.position.set(0, .275, -.055); finish(turret, metal);
  box('trigger guard base', 0, -.043, .074, .05, .012, .083);
  box('trigger guard front', 0, -.018, .031, .05, .06, .011);
  box('receiver ejection port', .049, .074, .04, .003, .042, .105, polymer);
  for (const side of [-1, 1]) {
    const foldedBipod = box('folded bipod leg', side * .046, -.028, -.49, .019, .019, .26);
    foldedBipod.rotation.y = side * .07;
  }
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
    merged.name = 'patrol sniper / ' + material.name; merged.parent = root;
    merged.material = material; merged.isPickable = false; merged.metadata = null; merged.receiveShadows = true;
    shadows.addShadowCaster(merged);
  }
  // The bolt stays separate so its lift, rearward extraction and return are visible.
  const bolt = new TransformNode('working sniper bolt', scene); bolt.parent = root;
  bolt.position.set(.045, .082, .08);
  const handle = MeshBuilder.CreateCylinder('bolt handle', { height: .065, diameter: .013, tessellation: 12 }, scene);
  handle.rotation.z = Math.PI / 2; handle.position.x = .032;
  const knob = MeshBuilder.CreateSphere('bolt knob', { diameter: .033, segments: 12 }, scene); knob.position.x = .068;
  const boltMesh = Mesh.MergeMeshes([handle, knob], true, true)!;
  boltMesh.name = 'patrol sniper / working bolt'; boltMesh.parent = bolt; boltMesh.material = metal;
  boltMesh.isPickable = false; boltMesh.metadata = null; boltMesh.receiveShadows = true;
  shadows.addShadowCaster(boltMesh);
  const updateBolt = (progress: number) => {
    const p = Math.max(0, Math.min(1, progress));
    const lift = p < .28 ? p / .28 : p < .76 ? 1 : (1 - p) / .24;
    const pull = p < .28 ? 0 : p < .53 ? (p - .28) / .25 : p < .76 ? (.76 - p) / .23 : 0;
    bolt.rotation.z = lift * .9; bolt.position.z = .08 + pull * .105;
  };
  const flash = MeshBuilder.CreateSphere('enemy muzzle flash', { diameter: .12, segments: 6 }, scene);
  flash.parent = root; flash.position.set(0, .08, -.94); flash.scaling.z = 1.8;
  flash.material = flashMaterial; flash.isPickable = false; flash.metadata = null; flash.setEnabled(false);
  return { root, flash, bolt, updateBolt };
}

export function botFlashMaterial(scene: Scene) {
  const material = new StandardMaterial('patrol muzzle glow', scene);
  material.diffuseColor = new Color3(1, .54, .1); material.emissiveColor = new Color3(1, .62, .16);
  material.disableLighting = true; material.alpha = .92;
  return material;
}
