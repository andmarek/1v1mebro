import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import type { Material } from '@babylonjs/core/Materials/material';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { Scene } from '@babylonjs/core/scene';
import { roundedBox } from './rifleGeometry';

type XYZ = [number, number, number];
const V = (p: XYZ) => new Vector3(...p);

/** Original service pistol: machined slide, stippled grip, working slide and two-handed hold. */
export function buildPistol(scene: Scene, camera: FreeCamera) {
  const root = new TransformNode('FIELD-9 pistol', scene);
  const slide = new TransformNode('reciprocating pistol slide', scene); slide.parent = root;
  const magazine = new TransformNode('pistol detachable magazine', scene); magazine.parent = root;
  const support = new TransformNode('pistol support hand', scene); support.parent = root;
  const environment = scene.textures.find(t => t.name === '/assets/rifle-lighting.env')
    ?? CubeTexture.CreateFromPrefilteredData('/assets/rifle-lighting.env', scene);
  const grain = new DynamicTexture('pistol finish grain', 256, scene, true);
  const ctx = grain.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#dededb'; ctx.fillRect(0, 0, 256, 256);
  let seed = 901;
  const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 6000; i++) { ctx.fillStyle = `rgba(70,75,68,${random() * .23})`; ctx.fillRect(random() * 256, random() * 256, 1, 1); }
  ctx.strokeStyle = '#ffffff29'; ctx.lineWidth = .5;
  for (let i = 0; i < 65; i++) { const x = random() * 256, y = random() * 256; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6 + random() * 24, y + 1); ctx.stroke(); }
  grain.update();
  function material(name: string, color: string, metal: number, rough: number) {
    const m = new PBRMaterial(name, scene); m.albedoColor = Color3.FromHexString(color); m.metallic = metal; m.roughness = rough;
    m.albedoTexture = grain; m.reflectionTexture = environment; m.environmentIntensity = .6; m.directIntensity = .85; return m;
  }
  const steel = material('pistol blued slide', '#343d43', .82, .34);
  const edge = material('pistol worn steel edges', '#7c8587', .94, .3);
  const polymer = material('pistol olive polymer frame', '#4b5043', .04, .78);
  const rubber = material('pistol grip stippling', '#232c29', .01, .94);
  const recess = material('pistol dark cavities', '#070c0e', .2, .65);
  const glove = material('pistol tan glove suede', '#8c8064', 0, .94);
  const pad = material('pistol glove reinforcement', '#353a30', 0, .95);
  const sleeve = material('pistol olive woven sleeves', '#646b51', 0, .96);
  const seam = material('pistol glove seams', '#b3a78a', 0, .9);
  const brass = material('pistol chamber brass', '#bfa36c', .9, .3);
  const textile = new DynamicTexture('pistol glove fabric weave', 256, scene, true);
  const weave = textile.getContext() as CanvasRenderingContext2D;
  weave.fillStyle = '#d8d8d0'; weave.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 3) {
    weave.fillStyle = '#59654a22'; weave.fillRect(i, 0, 1, 256); weave.fillRect(0, i, 256, 1);
    weave.fillStyle = '#fffff520'; weave.fillRect(i + 1, 0, 1, 256);
  }
  textile.update(); textile.uScale = textile.vScale = 2;
  for (const mat of [glove, pad, sleeve, seam]) mat.albedoTexture = textile;
  const sight = new StandardMaterial('pistol luminous sight inserts', scene);
  sight.diffuseColor = new Color3(.7, .82, .57); sight.emissiveColor = new Color3(.25, .33, .14);
  const groups = new Map<TransformNode, Map<Material, Mesh[]>>();
  function finish(mesh: Mesh, mat: Material, parent = root) {
    mesh.material = mat; mesh.parent = parent; mesh.isPickable = false; mesh.renderingGroupId = 2;
    const materials = groups.get(parent) ?? new Map<Material, Mesh[]>();
    const list = materials.get(mat) ?? []; list.push(mesh); materials.set(mat, list); groups.set(parent, materials); return mesh;
  }
  function block(name: string, p: XYZ, size: XYZ, mat: Material, parent = root, bevel = .003) {
    const mesh = roundedBox(name, ...size, bevel, scene); mesh.position.copyFrom(V(p)); return finish(mesh, mat, parent);
  }
  function cylinder(name: string, p: XYZ, length: number, radius: number, mat: Material, parent = root, sides = 32) {
    const mesh = MeshBuilder.CreateCylinder(name, { height: length, diameter: radius * 2, tessellation: sides }, scene);
    mesh.position.copyFrom(V(p)); mesh.rotation.x = Math.PI / 2; return finish(mesh, mat, parent);
  }
  function oval(name: string, p: XYZ, size: XYZ, mat: Material, parent = root) {
    const mesh = MeshBuilder.CreateSphere(name, { diameter: 1, segments: 16 }, scene); mesh.position.copyFrom(V(p)); mesh.scaling.copyFrom(V(size)); return finish(mesh, mat, parent);
  }
  function path(name: string, points: XYZ[], radius: number, mat: Material, parent = root) {
    if (mat === glove) {
      for (const end of [points[0], points[points.length - 1]]) oval(`${name} rounded joint`, end, [radius * 2, radius * 2, radius * 2], mat, parent);
    }
    return finish(MeshBuilder.CreateTube(name, { path: points.map(V), radius, tessellation: 12, cap: Mesh.CAP_ALL }, scene), mat, parent);
  }
  // Slide rails flank the exposed chamber; rounded shoulders catch the environment light.
  block('pistol lower frame', [0, -.012, .026], [.038, .032, .211], polymer);
  block('pistol dust cover rail', [0, -.03, .1], [.033, .021, .077], polymer);
  block('slide lower rail', [0, .023, .025], [.038, .035, .23], steel, slide, .0045);
  block('slide forward crown', [0, .042, .092], [.033, .018, .106], steel, slide, .006);
  block('slide rear crown', [0, .042, -.064], [.033, .018, .056], steel, slide, .006);
  block('ejection port chamber', [0, .041, -.008], [.026, .018, .038], edge);
  block('ejection port dark cut', [.0188, .034, -.007], [.001, .014, .037], recess, slide, .001);
  cylinder('visible chamber cartridge', [.012, .028, -.005], .022, .0035, brass);
  cylinder('fixed pistol barrel', [0, .026, .09], .131, .008, edge);
  const muzzleRing = MeshBuilder.CreateTorus('pistol muzzle rim', { diameter: .017, thickness: .0025, tessellation: 32 }, scene);
  muzzleRing.position.set(0, .026, .157); muzzleRing.rotation.x = Math.PI / 2; finish(muzzleRing, edge);
  cylinder('deep muzzle bore', [0, .026, .1573], .0006, .0059, recess);
  cylinder('recoil guide rod', [0, .009, .134], .018, .0038, edge);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const groove = block('rear slide serration', [side * .0192, .033, -.081 + i * .0044], [.0012, .027, .0013], recess, slide, .0004);
      groove.rotation.x = -.16;
    }
    for (let i = 0; i < 5; i++) block('front slide serration', [side * .0192, .03, .106 + i * .0043], [.0012, .023, .0014], recess, slide, .0004);
    block('worn slide bevel', [side * .014, .05, .027], [.0011, .0009, .213], edge, slide, .0003);
  }
  // A notched rear sight and raised front post, with three small luminous dots.
  for (const side of [-1, 1]) {
    block('rear sight notch shoulder', [side * .011, .058, -.078], [.012, .018, .016], steel, slide, .002);
    oval('rear sight dot', [side * .012, .064, -.0865], [.0033, .0033, .0013], sight, slide);
  }
  block('front sight blade', [0, .059, .127], [.007, .018, .014], steel, slide, .001);
  oval('front sight dot', [0, .064, .1194], [.003, .003, .0013], sight, slide);
  block('rear hammer', [0, .017, -.1], [.016, .022, .019], edge);
  block('slide release lever', [-.023, .002, -.032], [.006, .008, .037], steel);
  block('manual safety paddle', [-.023, .013, -.076], [.008, .009, .023], steel);
  block('magazine release button', [-.026, -.042, -.04], [.005, .012, .014], steel);
  const grip = block('angled pistol grip', [0, -.079, -.073], [.039, .105, .047], polymer, root, .009); grip.rotation.x = -.22;
  for (const side of [-1, 1]) {
    const panel = block('textured grip inset', [side * .0205, -.082, -.071], [.0027, .084, .033], rubber, root, .002); panel.rotation.x = -.22;
    for (let y = 0; y < 12; y++) for (let z = 0; z < 5; z++) oval('grip checkering', [side * .0225, -.049 - y * .006, -.083 + z * .006 + y * .001], [.0016, .0016, .0016], polymer);
    for (const y of [-.052, -.115]) {
      const screw = cylinder('grip hex screw', [side * .023, y, -.073], .002, .003, steel, root, 6); screw.rotation.set(0, 0, Math.PI / 2);
    }
  }
  path('open trigger guard', [[-.012, -.025, -.018], [-.014, -.033, .034], [-.014, -.056, .036], [-.012, -.068, .027], [0, -.074, -.006], [.012, -.068, -.025]], .004, polymer);
  path('curved steel trigger', [[0, -.019, -.018], [0, -.035, -.011], [0, -.051, -.015]], .0032, steel);
  for (let i = 0; i < 3; i++) block('accessory rail slot', [0, -.041, .079 + i * .013], [.034, .004, .004], recess);
  block('magazine body', [0, -.097, -.077], [.028, .073, .029], steel, magazine);
  block('magazine floorplate', [0, -.134, -.084], [.044, .008, .048], rubber, magazine, .003);
  // Small engraved slide markings survive inspection without overwhelming the finish.
  const lettering = new DynamicTexture('FIELD-9 slide engraving', { width: 512, height: 128 }, scene, true);
  const label = lettering.getContext() as CanvasRenderingContext2D; label.clearRect(0, 0, 512, 128);
  label.fillStyle = '#a1aaa5'; label.font = '34px monospace'; label.fillText('FIELD-9  /  9 × 19', 22, 77); lettering.hasAlpha = true; lettering.update();
  const engraving = new StandardMaterial('pistol engraving', scene); engraving.diffuseTexture = lettering; engraving.useAlphaFromDiffuseTexture = true; engraving.backFaceCulling = false;
  const plane = MeshBuilder.CreatePlane('engraved slide designation', { width: .097, height: .024 }, scene); plane.position.set(-.0196, .026, .039); plane.rotation.y = Math.PI / 2; finish(plane, engraving, slide);
  // Sculpted fingers wrap the grip; the support palm moves with the magazine during reload.
  oval('firing glove palm', [.027, -.087, -.079], [.063, .091, .061], glove);
  oval('firing glove knuckle panel', [.051, -.086, -.074], [.014, .071, .045], pad);
  for (let i = 0; i < 3; i++) {
    const y = -.067 - i * .02;
    path('curled pistol grip finger', [[.035, y, -.041], [.018, y, -.031], [-.016, y, -.034], [-.028, y + .005, -.06]], .009, glove);
    oval('firing finger pad', [.034, y, -.044], [.02, .015, .021], pad);
  }
  path('pistol trigger finger', [[.04, -.07, -.07], [.047, -.041, -.062], [.04, -.032, -.009], [.021, -.043, .005], [.006, -.045, -.014]], .009, glove);
  path('firing thumb', [[.022, -.055, -.103], [-.018, -.034, -.081], [-.025, -.023, -.045]], .011, glove);
  oval('support glove palm', [-.043, -.092, -.056], [.047, .073, .065], glove, support);
  oval('support glove reinforcement', [-.062, -.088, -.057], [.017, .056, .045], pad, support);
  for (let i = 0; i < 4; i++) {
    const y = -.057 - i * .018;
    path('support finger wrapping', [[-.043, y - .015, -.06], [-.049, y, -.046], [-.034, y - .005, -.021], [-.005, y - .004, -.017], [.023, y, -.029]], .008, glove, support);
  }
  path('support thumb', [[-.047, -.058, -.079], [-.04, -.028, -.048], [-.03, -.022, .002]], .01, glove, support);
  for (const side of [-1, 1]) {
    const parent = side < 0 ? support : root;
    oval('glove wrist joining cuff and palm', [side * .033, -.122, -.092], [.075, .055, .07], glove, parent);
    path('glove seam', [[side * .057, -.068, -.078], [side * .058, -.091, -.08], [side * .04, -.123, -.1]], .001, seam, parent);
    path('combat sleeve forearm', [[side * .026, -.128, -.103], [side * .068, -.175, -.145], [side * .121, -.215, -.217], [side * .18, -.261, -.32]], .034, sleeve, parent);
    oval('ribbed sleeve cuff', [side * .04, -.146, -.115], [.074, .065, .062], pad, parent);
    for (let i = 0; i < 3; i++) { const fold = oval('woven sleeve fold', [side * (.077 + i * .037), -.183 - i * .027, -.16 - i * .05], [.081, .073, .025], sleeve, parent); fold.rotation.x = -.5; }
  }
  // Batch within each animated assembly, retaining the slide and reload transforms.
  for (const [parent, materials] of groups) for (const [mat, list] of materials) {
    if (list.length < 2) continue;
    parent.computeWorldMatrix(true); list.forEach(mesh => mesh.computeWorldMatrix(true));
    const mesh = Mesh.MergeMeshes(list, true, true); if (!mesh) continue;
    mesh.name = `pistol assembly / ${mat.name}`; mesh.material = mat; mesh.parent = parent; mesh.renderingGroupId = 2; mesh.isPickable = false;
  }
  const flashMaterial = new StandardMaterial('pistol muzzle flash', scene); flashMaterial.disableLighting = true;
  flashMaterial.emissiveColor = new Color3(1, .76, .4); flashMaterial.alpha = .75;
  const flash = MeshBuilder.CreateSphere('pistol muzzle flare', { diameter: .047, segments: 8 }, scene);
  flash.position.set(0, .026, .192); flash.scaling.z = 2.1; flash.material = flashMaterial; flash.parent = root; flash.isPickable = false; flash.renderingGroupId = 2; flash.setEnabled(false);
  root.parent = camera;
  const fill = new DirectionalLight('pistol soft fill', new Vector3(-.5, -.45, 1), scene);
  fill.parent = camera; fill.diffuse = new Color3(.9, .95, 1); fill.intensity = .6; fill.includedOnlyMeshes = root.getChildMeshes();
  function updatePose(ads: number, recoil: number, sway: number, shotAge: number, reloadT: number, reloading: boolean, inspect: number, empty: boolean) {
    const aspect = scene.getEngine().getRenderWidth() / scene.getEngine().getRenderHeight();
    const scale = Math.max(.85, Math.min(1.12, aspect / 1.3));
    const dip = reloading ? Math.sin(Math.PI * reloadT) : 0;
    root.scaling.setAll(scale);
    root.position.set(.14 * scale * (1 - ads) - inspect * .045, (-.125 + ads * .061) * scale + sway - recoil * .017 - dip * .075 + inspect * .065, .45 - recoil * .035 - inspect * .06);
    root.rotation.set(-recoil * .23 + dip * .25, -.1 * (1 - ads) - inspect * .75, -.08 * (1 - ads) - dip * .42 - inspect * .22);
    const cycle = shotAge >= 0 && shotAge < .13 ? Math.sin(shotAge / .13 * Math.PI) : 0;
    slide.position.z = -.039 * (empty && (!reloading || reloadT < .78) ? 1 : cycle);
    magazine.position.set(-dip * .025, -dip * .15, -dip * .03); magazine.rotation.z = dip * .18;
    support.position.set(-dip * .04, -dip * .13, -dip * .02); support.rotation.z = dip * .18;
  }
  return { root, slide, flash, updatePose };
}
