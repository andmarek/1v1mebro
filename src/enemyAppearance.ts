import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { Scene } from '@babylonjs/core/scene';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { Material } from '@babylonjs/core/Materials/material';
import { roundedBox } from './rifleGeometry';
import { boxUVs } from './arenaGeometry';

/** One palette and one small cloth texture are shared by the entire patrol. */
export function enemyMaterials(scene: Scene) {
  const plain = (name: string, color: string, shine = .04) => {
    const mat = new StandardMaterial(name, scene); mat.diffuseColor = Color3.FromHexString(color);
    mat.specularColor.set(shine, shine, shine); return mat;
  };
  const weave = new DynamicTexture('shared soldier woven canvas', 128, scene, true);
  const c = weave.getContext() as CanvasRenderingContext2D;
  c.fillStyle = '#deded7'; c.fillRect(0, 0, 128, 128);
  let seed = 417;
  const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  // Faded broad camo patches read at range; a fine weave survives close inspection.
  for (let i = 0; i < 32; i++) {
    c.fillStyle = i % 2 ? 'rgba(32,38,26,.13)' : 'rgba(250,245,230,.10)';
    c.beginPath(); c.ellipse(random() * 128, random() * 128, 3 + random() * 13, 3 + random() * 6, random() * 6, 0, Math.PI * 2); c.fill();
  }
  for (let i = 0; i < 128; i += 2) {
    c.fillStyle = 'rgba(20,23,18,.06)'; c.fillRect(i, 0, 1, 128);
    c.fillStyle = 'rgba(236,227,210,.05)'; c.fillRect(0, i, 128, 1);
  }
  weave.update();
  const cloth = (name: string, color: string) => { const mat = plain(name, color); mat.diffuseTexture = weave; return mat; };
  return { detailFabric: cloth('batched soldier fabric', '#ffffff'), uniform: cloth('dusty field uniform', '#8c8b71'), vest: cloth('olive woven plate carrier', '#565c45'),
    webbing: plain('tan nylon webbing', '#aaa082'), rubber: plain('boot rubber and gloves', '#34362e'),
    skin: plain('exposed face', '#b79677'), helmet: plain('matte composite helmet', '#686d53'),
    metal: plain('enemy rifle gunmetal', '#4b504b', .28), lens: plain('smoked ballistic lenses', '#243536', .65),
    marker: plain('rust orange team cloth', '#b27543') };
}
export type EnemyMaterials = ReturnType<typeof enemyMaterials>;

/** Solve the elbow without changing bone lengths. Bend is projected into the arm's hinge plane. */
export function armElbow(shoulder: Vector3, hand: Vector3, bend: Vector3, upper = .29, lower = .28) {
  const delta = hand.subtract(shoulder), distance = Math.max(.0001, delta.length()), axis = delta.scale(1 / distance);
  const reach = Math.min(upper + lower - .0001, Math.max(Math.abs(upper - lower) + .0001, distance));
  const along = (upper * upper - lower * lower + reach * reach) / (2 * reach);
  let hinge = bend.subtract(axis.scale(Vector3.Dot(bend, axis)));
  if (hinge.lengthSquared() < .000001) hinge = Vector3.Cross(axis, Math.abs(axis.y) < .9 ? Vector3.Up() : Vector3.Right());
  hinge.normalize();
  return shoulder.add(axis.scale(along)).add(hinge.scale(Math.sqrt(Math.max(0, upper * upper - along * along))));
}

/** Static detail batches stay attached to their animated joint, and never enter the shooting predicate. */
export function enemyGeometry(scene: Scene, shadows: ShadowGenerator, index: number, detailFabric?: StandardMaterial) {
  const hits: Mesh[] = [], batches = new Map<TransformNode, Map<Material, Mesh[]>>();
  const joint = (name: string, parent: TransformNode, x = 0, y = 0, z = 0) => {
    const node = new TransformNode(name, scene); node.parent = parent; node.position.set(x, y, z); return node;
  };
  const hit = (mesh: Mesh, parent: TransformNode, mat: Material, head = false, visible = true) => {
    mesh.parent = parent; mesh.material = mat; mesh.receiveShadows = true; mesh.visibility = visible ? 1 : 0;
    mesh.metadata = { target: index, head }; hits.push(mesh);
    if (visible) shadows.addShadowCaster(mesh); return mesh;
  };
  const detail = (mesh: Mesh, parent: TransformNode, mat: Material) => {
    // Bake the color into vertices so all rough detail on one joint shares a draw call.
    // The optic and metal retain their own specular response.
    let batchMaterial = mat;
    if (detailFabric && mat instanceof StandardMaterial && mat.specularColor.r < .1) {
      const colors = new Float32Array(mesh.getTotalVertices() * 4), tint = mat.diffuseColor;
      for (let i = 0; i < colors.length; i += 4) { colors[i] = tint.r; colors[i + 1] = tint.g; colors[i + 2] = tint.b; colors[i + 3] = 1; }
      mesh.setVerticesData(VertexBuffer.ColorKind, colors); batchMaterial = detailFabric;
    }
    mesh.material = batchMaterial; mesh.isPickable = false; mesh.metadata = null;
    let groups = batches.get(parent); if (!groups) { groups = new Map(); batches.set(parent, groups); }
    const group = groups.get(batchMaterial) ?? []; group.push(mesh); groups.set(batchMaterial, group); return mesh;
  };
  const box = (name: string, parent: TransformNode, mat: Material, x: number, y: number, z: number, w: number, h: number, d: number) => {
    const mesh = roundedBox(name, w, h, d, Math.min(.018, w * .18, h * .18, d * .18), scene);
    boxUVs(mesh, w, h, d); mesh.position.set(x, y, z); return detail(mesh, parent, mat);
  };
  const ellipsoid = (name: string, parent: TransformNode, mat: Material, x: number, y: number, z: number, w: number, h: number, d: number) => {
    const mesh = MeshBuilder.CreateSphere(name, { diameter: 1, segments: 16 }, scene);
    mesh.position.set(x, y, z); mesh.scaling.set(w, h, d); return detail(mesh, parent, mat);
  };
  const capsule = (name: string, parent: TransformNode, mat: Material, height: number, diameter: number, y: number) => {
    const mesh = MeshBuilder.CreateCapsule(name, { height, radius: diameter / 2, tessellation: 12, subdivisions: 2 }, scene);
    mesh.position.y = y; return hit(mesh, parent, mat);
  };
  const flush = () => {
    for (const [parent, materials] of batches) for (const [mat, parts] of materials) {
      const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
      if (!merged) continue;
      merged.name = `soldier detail / ${parent.name} / ${mat.name}`; merged.parent = parent; merged.material = mat;
      merged.isPickable = false; merged.metadata = null; merged.receiveShadows = true;
      // Only the shaped chest is an additional caster. Tiny straps and pouches do not multiply shadow passes.
      if (parent.name === 'aiming torso' && (mat === detailFabric || mat.name === 'dusty field uniform')) shadows.addShadowCaster(merged);
    }
    batches.clear();
  };
  return { hits, joint, hit, decor: detail, box, ellipsoid, capsule, flush };
}

/** The muzzle, supporting hand and trigger hand all follow the same rifle transform. */
export function rifleContact(root: TransformNode, local: Vector3) {
  const orientation = Quaternion.FromEulerAngles(root.rotation.x, root.rotation.y, root.rotation.z);
  return local.rotateByQuaternionToRef(orientation, new Vector3()).add(root.position);
}

export function poseArm(shoulder: TransformNode, elbow: TransformNode, glove: TransformNode, hand: Vector3, side: number, rifle: TransformNode) {
  const origin = shoulder.position, middle = armElbow(origin, hand, new Vector3(side * .28, -.9, .08));
  const upperDirection = middle.subtract(origin).normalize(), lowerDirection = hand.subtract(middle).normalize();
  shoulder.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Down(), upperDirection, new Quaternion());
  const lowerWorld = Quaternion.FromUnitVectorsToRef(Vector3.Down(), lowerDirection, new Quaternion());
  elbow.rotationQuaternion = shoulder.rotationQuaternion.conjugate().multiply(lowerWorld);
  glove.rotationQuaternion = lowerWorld.conjugate().multiply(Quaternion.FromEulerAngles(rifle.rotation.x, rifle.rotation.y, rifle.rotation.z));
}
