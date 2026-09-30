import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import type { Scene } from '@babylonjs/core/scene';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { roundedBox } from './rifleGeometry';

type XYZ = [number, number, number];
const vector = (p: XYZ) => new Vector3(...p);
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

/** Original drop-point combat knife with a ground steel bevel and sculpted glove. */
export function buildKnife(scene: Scene, camera: FreeCamera) {
  const root = new TransformNode('combat knife and glove', scene);
  const environment = scene.textures.find(t => t.name === '/assets/rifle-lighting.env')
    ?? CubeTexture.CreateFromPrefilteredData('/assets/rifle-lighting.env', scene);
  const grain = new DynamicTexture('knife brushed finish', 128, scene, true);
  const ctx = grain.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#d4d4d0'; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 2) {
    ctx.fillStyle = i % 6 ? '#51565313' : '#ffffff30'; ctx.fillRect(0, i, 128, 1);
  }
  grain.update();
  const fabric = new DynamicTexture('knife glove weave', 128, scene, true);
  const weave = fabric.getContext() as CanvasRenderingContext2D;
  weave.fillStyle = '#d5d5cb'; weave.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 3) {
    weave.fillStyle = '#47543b22'; weave.fillRect(i, 0, 1, 128); weave.fillRect(0, i, 128, 1);
    weave.fillStyle = '#ffffff24'; weave.fillRect(i + 1, 0, 1, 128);
  }
  fabric.update();
  function material(name: string, color: string, metal: number, roughness: number, textile = false) {
    const mat = new PBRMaterial(name, scene);
    mat.albedoColor = Color3.FromHexString(color); mat.metallic = metal; mat.roughness = roughness;
    mat.albedoTexture = textile ? fabric : grain;
    mat.reflectionTexture = environment; mat.environmentIntensity = .7; mat.directIntensity = .85;
    return mat;
  }
  const steel = material('knife satin ground steel', '#8c979b', .95, .32);
  const spine = material('knife dark coated blade flats', '#414b4b', .8, .4);
  const edge = material('knife polished cutting edge', '#c0c8c5', .96, .24);
  const rubber = material('knife grooved grip', '#29352d', .02, .94);
  const glove = material('knife glove suede', '#968668', 0, .95, true);
  const pad = material('knife glove reinforcement', '#414638', 0, .95, true);
  const sleeve = material('knife sleeve fabric', '#606a4b', 0, .96, true);
  const seam = material('knife glove stitching', '#b6a586', 0, .9, true);
  const groups = new Map<PBRMaterial, Mesh[]>();
  function finish(mesh: Mesh, mat: PBRMaterial) {
    mesh.material = mat; mesh.parent = root; mesh.isPickable = false; mesh.renderingGroupId = 2;
    const list = groups.get(mat) ?? []; list.push(mesh); groups.set(mat, list); return mesh;
  }
  function block(name: string, p: XYZ, size: XYZ, mat: PBRMaterial, bevel = .003) {
    const mesh = roundedBox(name, ...size, bevel, scene); mesh.position.copyFrom(vector(p)); return finish(mesh, mat);
  }
  function oval(name: string, p: XYZ, size: XYZ, mat: PBRMaterial) {
    const mesh = MeshBuilder.CreateSphere(name, { diameter: 1, segments: 12 }, scene);
    mesh.position.copyFrom(vector(p)); mesh.scaling.copyFrom(vector(size)); return finish(mesh, mat);
  }
  function path(name: string, points: XYZ[], radius: number, mat: PBRMaterial) {
    return finish(MeshBuilder.CreateTube(name, { path: points.map(vector), radius, tessellation: 10, cap: Mesh.CAP_ALL }, scene), mat);
  }
  // Blade stations form a real tapered silhouette, with separately lit bevel facets.
  const stations = [{ z: .023, left: -.018, right: .018 }, { z: .148, left: -.017, right: .018 },
    { z: .203, left: -.008, right: .014 }, { z: .249, left: .004, right: .004 }];
  const positions: number[] = [], indices: number[] = [], normals: number[] = [], uvs: number[] = [];
  for (const sign of [-1, 1]) for (let section = 0; section < stations.length - 1; section++) {
    const a = stations[section], b = stations[section + 1];
    for (const side of ['left', 'right'] as const) {
      const offset = positions.length / 3;
      const centerA = (a.left + a.right) / 2, centerB = (b.left + b.right) / 2;
      positions.push(centerA, sign * .0038, a.z, a[side], 0, a.z, b[side], 0, b.z, centerB, sign * (section === 2 ? 0 : .0038), b.z);
      uvs.push(.5, a.z * 4, side === 'left' ? 0 : 1, a.z * 4, side === 'left' ? 0 : 1, b.z * 4, .5, b.z * 4);
      // Each bevel must face away from the blade's center plane.
      const reverse = (sign > 0) !== (side === 'left');
      if (reverse) indices.push(offset, offset + 2, offset + 1);
      else indices.push(offset, offset + 1, offset + 2);
      // At the point both edges and the center meet: no degenerate second triangle.
      if (b.left !== b.right) {
        if (reverse) indices.push(offset, offset + 3, offset + 2);
        else indices.push(offset, offset + 2, offset + 3);
      }
    }
  }
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData(); data.positions = positions; data.indices = indices; data.normals = normals; data.uvs = uvs;
  const blade = new Mesh('ground drop-point knife blade', scene); data.applyToMesh(blade);
  steel.backFaceCulling = false; finish(blade, steel);
  block('coated blade spine inset', [0, .004, .089], [.008, .0006, .123], spine, .0002);
  path('polished knife cutting edge', stations.map(p => [p.left, 0, p.z] as XYZ), .0007, edge);
  path('knife sharpened tip', stations.slice(1).map(p => [p.right, 0, p.z] as XYZ), .0007, edge);
  block('rounded steel knife guard', [0, 0, .019], [.066, .009, .016], spine, .003);
  block('knife full tang handle', [0, 0, -.047], [.028, .021, .121], steel, .005);
  for (const side of [-1, 1]) {
    block('rubber grip scale', [0, side * .011, -.048], [.031, .008, .105], rubber, .003);
    for (let i = 0; i < 9; i++) block('grip cross grooves', [0, side * .0154, -.086 + i * .01], [.031, .001, .0013], spine, .0003);
    for (const z of [-.079, -.016]) {
      const pin = MeshBuilder.CreateCylinder('flush handle rivet', { diameter: .005, height: .0015, tessellation: 12 }, scene);
      pin.position.set(0, side * .016, z); finish(pin, steel);
    }
  }
  block('knife steel pommel', [0, 0, -.108], [.03, .024, .009], spine, .003);
  const hole = MeshBuilder.CreateTorus('pommel lanyard eye', { diameter: .01, thickness: .002, tessellation: 16 }, scene);
  hole.position.set(0, 0, -.119); finish(hole, spine);
  oval('knife glove palm', [.026, -.02, -.047], [.069, .066, .091], glove);
  oval('knife glove knuckle protection', [.05, -.014, -.046], [.026, .05, .083], pad);
  for (let i = 0; i < 4; i++) {
    const z = -.013 - i * .022;
    path('knife curled finger', [[.044, -.012, z], [.022, -.026, z], [-.016, -.023, z], [-.022, .006, z], [-.014, .018, z]], .01, glove);
    oval('knife finger armored pad', [.039, -.018, z], [.023, .017, .018], pad);
    oval('knife rounded fingertip', [-.014, .018, z], [.02, .019, .02], glove);
  }
  path('knife gripping thumb', [[.03, -.029, -.078], [.012, -.036, -.028], [-.029, -.015, -.002]], .012, glove);
  oval('knife rounded thumb tip', [-.029, -.015, -.002], [.024, .024, .023], glove);
  path('knife glove palm seam', [[.056, -.032, -.077], [.058, -.034, -.04], [.035, -.035, .001]], .001, seam);
  oval('knife glove wrist', [.052, -.041, -.106], [.073, .06, .073], glove);
  oval('knife reinforced wrist cuff', [.064, -.052, -.131], [.079, .064, .048], pad);
  path('knife sleeve forearm', [[.066, -.052, -.134], [.105, -.088, -.199], [.154, -.13, -.26]], .038, sleeve);
  for (let i = 0; i < 3; i++) {
    const fold = oval('knife sleeve fabric fold', [.088 + i * .026, -.072 - i * .023, -.173 - i * .04], [.088, .08, .027], sleeve); fold.rotation.x = -.4;
  }
  // Seven material batches rather than one draw call per knuckle, pin, or grip groove.
  for (const [mat, list] of groups) {
    if (list.length < 2) continue;
    list.forEach(mesh => mesh.computeWorldMatrix(true));
    const merged = Mesh.MergeMeshes(list, true, true);
    if (!merged) continue;
    merged.name = `knife assembly / ${mat.name}`; merged.parent = root; merged.material = mat;
    merged.isPickable = false; merged.renderingGroupId = 2;
  }
  root.parent = camera;
  const fill = new DirectionalLight('knife soft fill', new Vector3(-.5, -.45, 1), scene);
  fill.parent = camera; fill.diffuse = new Color3(.9, .95, 1); fill.intensity = .6; fill.includedOnlyMeshes = root.getChildMeshes();
  root.setEnabled(false);
  function updatePose(progress: number) {
    const p = Math.max(0, Math.min(1, progress));
    const aspect = scene.getEngine().getRenderWidth() / scene.getEngine().getRenderHeight();
    const scale = Math.max(.78, Math.min(1.08, aspect / 1.35));
    const draw = smooth(p / .18);
    const slash = smooth((p - .18) / .28);
    const recover = smooth((p - .48) / .52);
    const extension = Math.sin(Math.PI * slash) * (1 - recover);
    root.scaling.setAll(scale);
    root.position.set((.24 - slash * .39 + recover * .42) * scale,
      (-.39 + draw * .24 - recover * .25) * scale, .44 + extension * .17 - recover * .05);
    root.rotation.set(-.18 - extension * .19 + recover * .2,
      -.72 + slash * 1.55 - recover * .95, .55 - slash * 1.75 + recover * 1.2);
  }
  updatePose(0);
  return { root, updatePose };
}
