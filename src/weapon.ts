import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
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

export function buildRifle(scene: Scene, camera: FreeCamera) {
  // Build in local space, consolidate static pieces, then attach to the camera.
  const root = new TransformNode('Intervention rifle', scene);
  const bolt = new TransformNode('moving bolt assembly', scene); bolt.parent = root; bolt.position.set(0, 0.022, 0.39);
  const magazine = new TransformNode('detachable five-round magazine', scene); magazine.parent = root; magazine.position.set(0, -0.18, 0.5);
  const rightHand = new TransformNode('trigger hand', scene); rightHand.parent = root;
  const leftHand = new TransformNode('support hand', scene); leftHand.parent = root;
  const staticMeshes: Mesh[] = [];
  const environment = CubeTexture.CreateFromPrefilteredData('/assets/rifle-lighting.env', scene); environment.rotationY = 1.1;
  function surfaceTexture(name: string, fabric = false) {
    const texture = new DynamicTexture(name, 256, scene, true), c = texture.getContext() as CanvasRenderingContext2D;
    c.fillStyle = '#dddeda'; c.fillRect(0, 0, 256, 256);
    let seed = 527;
    const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 9000; i++) {
      const gray = Math.floor(155 + random() * 95); c.fillStyle = `rgba(${gray},${gray},${gray},${fabric ? 0.3 : 0.14})`;
      c.fillRect(random() * 256, random() * 256, fabric ? 1 : 2, 1);
    }
    if (fabric) {
      for (let i = 0; i < 256; i += 3) { c.fillStyle = 'rgba(80,85,70,0.14)'; c.fillRect(i, 0, 1, 256); c.fillRect(0, i, 256, 1); }
    } else {
      c.strokeStyle = 'rgba(255,255,250,0.16)'; c.lineWidth = 0.6;
      for (let i = 0; i < 100; i++) { const x = random() * 256, y = random() * 256; c.beginPath(); c.moveTo(x, y); c.lineTo(x + random() * 22, y + random() * 2); c.stroke(); }
    }
    texture.update(); return texture;
  }
  const microMetal = surfaceTexture('brushed metal micro wear');
  const wornPaint = surfaceTexture('chassis paint wear');
  const paintContext = wornPaint.getContext() as CanvasRenderingContext2D;
  paintContext.lineWidth = 0.7;
  for (let i = 0; i < 40; i++) {
    const x = (i * 73 + 17) % 256, y = (i * 41 + 9) % 256;
    paintContext.strokeStyle = i % 3 === 0 ? 'rgba(62,65,59,0.22)' : 'rgba(245,244,221,0.32)';
    paintContext.beginPath(); paintContext.moveTo(x, y); paintContext.lineTo(x + 3 + i % 9, y + 1); paintContext.stroke();
  }
  wornPaint.update();
  const textile = surfaceTexture('woven tactical fabric', true); textile.uScale = textile.vScale = 2;
  const material = (name: string, hex: string, metallic: number, roughness: number, texture?: DynamicTexture) => {
    const m = new PBRMaterial(name, scene); m.albedoColor = Color3.FromHexString(hex); m.metallic = metallic; m.roughness = roughness;
    m.reflectionTexture = environment; m.environmentIntensity = 0.75; m.directIntensity = 0.8;
    if (texture) m.albedoTexture = texture; return m;
  };
  const steel = material('parkerized gunmetal', '#42494c', 0.88, 0.3, microMetal);
  const blackMetal = material('anodized scope aluminum', '#1a2023', 0.65, 0.4, microMetal);
  blackMetal.environmentIntensity = 0.48;
  const tan = material('worn olive bronze chassis', '#807551', 0.42, 0.52, wornPaint);
  const darkTan = material('chassis recess', '#5c5744', 0.4, 0.55);
  const edge = material('exposed machined edges', '#9da49f', 0.93, 0.27);
  const boltSteel = material('polished bolt steel', '#b4bbb8', 0.95, 0.21, microMetal);
  const rubber = material('rubber grip and eyecup', '#222626', 0.02, 0.86, textile);
  const glove = material('suede glove panels', '#776e55', 0, 0.95, textile);
  const gloveDark = material('glove grip pads', '#30332d', 0, 0.9, textile);
  const fabric = material('olive woven combat sleeves', '#62684e', 0, 0.92, textile);
  const seam = material('fabric stitching', '#a39c7c', 0, 0.85);
  const recess = material('deep cavity', '#070c0e', 0.15, 0.7);
  const brass = material('brass chamber indicator', '#c5a561', 0.83, 0.28);
  const glass = material('multi-coated optical glass', '#081521', 0.12, 0.12);
  glass.environmentIntensity = 0.3; glass.directIntensity = 0.3;
  glass.clearCoat.isEnabled = true; glass.clearCoat.intensity = 0.55; glass.clearCoat.roughness = 0.04;
  function finish(mesh: Mesh, mat: Material, parent = root) {
    mesh.material = mat; mesh.parent = parent; mesh.isPickable = false; mesh.renderingGroupId = 2; mesh.receiveShadows = false;
    if (parent === root) staticMeshes.push(mesh); return mesh;
  }
  function block(name: string, p: XYZ, size: XYZ, mat: Material, bevel = 0.004, parent = root) {
    const mesh = roundedBox(name, ...size, bevel, scene); mesh.position.copyFrom(V(p)); return finish(mesh, mat, parent);
  }
  function tube(name: string, p: XYZ, length: number, radius: number, mat: Material, parent = root, radiusEnd = radius, sides = 40) {
    const mesh = MeshBuilder.CreateCylinder(name, { height: length, diameterBottom: radius * 2, diameterTop: radiusEnd * 2, tessellation: sides }, scene);
    mesh.position.copyFrom(V(p)); mesh.rotation.x = Math.PI / 2; return finish(mesh, mat, parent);
  }
  function lathe(name: string, p: XYZ, profile: [number, number][], mat: Material, parent = root) {
    const mesh = MeshBuilder.CreateLathe(name, { shape: profile.map(([z, r]) => new Vector3(r, z, 0)), tessellation: 56, sideOrientation: Mesh.DOUBLESIDE }, scene);
    mesh.rotation.x = Math.PI / 2; mesh.position.copyFrom(V(p)); return finish(mesh, mat, parent);
  }
  function ellipsoid(name: string, p: XYZ, size: XYZ, mat: Material, parent = root) {
    const mesh = MeshBuilder.CreateSphere(name, { diameter: 1, segments: 20 }, scene); mesh.position.copyFrom(V(p)); mesh.scaling.copyFrom(V(size)); return finish(mesh, mat, parent);
  }
  function link(name: string, a: XYZ, b: XYZ, radius: number, mat: Material, parent = root, endRadius = radius) {
    const start = V(a), end = V(b), direction = end.subtract(start);
    const mesh = MeshBuilder.CreateCylinder(name, { height: direction.length(), diameterBottom: radius * 2, diameterTop: endRadius * 2, tessellation: 24 }, scene);
    mesh.position.copyFrom(start.add(end).scale(0.5)); mesh.rotationQuaternion = Quaternion.Identity();
    Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction.normalize(), mesh.rotationQuaternion); return finish(mesh, mat, parent);
  }
  function ring(name: string, p: XYZ, radius: number, thickness: number, mat: Material, parent = root) {
    const mesh = MeshBuilder.CreateTorus(name, { diameter: radius * 2, thickness, tessellation: 48 }, scene);
    mesh.position.copyFrom(V(p)); mesh.rotation.x = Math.PI / 2; return finish(mesh, mat, parent);
  }
  function screw(x: number, y: number, z: number, parent = root) {
    const mesh = tube('recessed hex screw', [x, y, z], 0.003, 0.0052, steel, parent, 0.0052, 6); mesh.rotation.set(0, 0, Math.PI / 2);
    block('screw socket', [x + Math.sign(x) * 0.002, y, z], [0.001, 0.0022, 0.005], recess, 0.0003, parent);
  }
  function textLabel(name: string, text: string, p: XYZ, width: number, height: number, side = false) {
    const texture = new DynamicTexture(name, { width: 1024, height: 256 }, scene, true), c = texture.getContext() as CanvasRenderingContext2D;
    c.clearRect(0, 0, 1024, 256); c.fillStyle = '#b9b6a5'; c.textAlign = 'center'; c.font = `500 ${Math.min(145, 1450 / text.length)}px monospace`;
    c.fillText(text, 512, 157); texture.hasAlpha = true; texture.update();
    const m = new StandardMaterial(name, scene); m.diffuseTexture = texture; m.useAlphaFromDiffuseTexture = true; m.specularColor.set(0.02, 0.02, 0.02); m.backFaceCulling = false;
    const plane = MeshBuilder.CreatePlane(name, { width, height }, scene); plane.position.copyFrom(V(p)); if (side) plane.rotation.y = p[0] > 0 ? -Math.PI / 2 : Math.PI / 2;
    return finish(plane, m);
  }
  // Tubular action in a skeletonized chassis.
  block('lower machined chassis', [0, -0.025, 0.48], [0.108, 0.09, 0.48], tan, 0.011);
  tube('cylindrical receiver', [0, 0.038, 0.46], 0.39, 0.047, steel);
  block('receiver top shoulder', [0, 0.065, 0.47], [0.078, 0.033, 0.42], tan, 0.006);
  block('right action recess', [0.049, 0.038, 0.445], [0.004, 0.043, 0.2], recess, 0.003);
  block('ejection port polished lip', [0.052, 0.063, 0.49], [0.007, 0.006, 0.13], edge, 0.002);
  tube('cartridge in chamber', [0.052, 0.028, 0.48], 0.068, 0.007, brass);
  block('front receiver collar', [0, 0.025, 0.665], [0.116, 0.115, 0.047], tan, 0.014);
  block('rear receiver collar', [0, 0.026, 0.265], [0.105, 0.114, 0.038], tan, 0.012);
  for (const side of [-1, 1]) {
    for (const z of [0.29, 0.39, 0.62, 0.667]) screw(side * 0.057, -0.032, z);
    block('chassis side inset', [side * 0.055, -0.04, 0.54], [0.002, 0.032, 0.15], darkTan, 0.001);
  }
  textLabel('receiver engraved designation', 'INTERVENTION  ·  .408', [0.0565, -0.043, 0.49], 0.16, 0.024, true);
  textLabel('left receiver engraving', 'INTERVENTION / .408', [-0.055, -0.032, 0.475], 0.2, 0.029, true);
  // Open handguard, visible barrel, vented side rails.
  tube('barrel chamber', [0, 0.018, 0.79], 0.21, 0.027, steel, root, 0.023);
  for (const x of [-0.052, 0.052]) {
    block('handguard lower runner', [x, -0.046, 0.9], [0.019, 0.038, 0.4], tan, 0.007);
    block('handguard upper runner', [x, 0.051, 0.9], [0.016, 0.028, 0.4], tan, 0.006);
    for (let i = 0; i < 4; i++) {
      const rib = block('handguard diagonal rib', [x, 0, 0.75 + i * 0.095], [0.02, 0.098, 0.021], tan, 0.005); rib.rotation.x = -0.25;
      screw(x + Math.sign(x) * 0.01, -0.048, 0.75 + i * 0.095);
    }
  }
  ring('handguard front hoop', [0, 0.005, 1.1], 0.057, 0.018, tan);
  block('fore-end lower rail', [0, -0.065, 0.9], [0.092, 0.017, 0.42], steel, 0.003);
  for (let i = 0; i < 14; i++) block('fore-end rail tooth', [0, -0.076, 0.725 + i * 0.027], [0.105, 0.012, 0.012], blackMetal, 0.002);
  // Tapered fluted barrel and hollow, ported muzzle brake.
  lathe('heavy tapered barrel', [0, 0.018, 0], [[0.79, 0.023], [0.88, 0.023], [1.03, 0.021], [1.45, 0.0185], [1.53, 0.019], [1.53, 0.012], [0.79, 0.014]], steel);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; tube('barrel flute', [Math.cos(a) * 0.0205, 0.018 + Math.sin(a) * 0.0205, 1.255], 0.34, 0.0018, recess); }
  ring('barrel locking ring', [0, 0.018, 1.52], 0.023, 0.006, edge);
  lathe('muzzle brake body', [0, 0.018, 0], [[1.535, 0.026], [1.55, 0.032], [1.645, 0.032], [1.662, 0.029], [1.662, 0.015], [1.645, 0.014], [1.535, 0.014]], blackMetal);
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    block('muzzle brake gas port', [side * 0.03, 0.018, 1.564 + i * 0.027], [0.002, 0.027, 0.017], recess, 0.003);
    block('muzzle brake port rim', [side * 0.031, 0.035, 1.564 + i * 0.027], [0.003, 0.004, 0.022], edge, 0.001);
  }
  // Telescoping stock, cheek comb, contoured recoil pad.
  for (const x of [-0.033, 0.033]) tube('telescoping stock rail', [x, 0.017, 0.02], 0.45, 0.011, steel);
  block('rear stock carriage', [0, -0.035, -0.15], [0.084, 0.12, 0.075], tan, 0.013);
  block('adjustable cheek comb', [0, 0.067, 0.043], [0.096, 0.065, 0.245], rubber, 0.023);
  for (const z of [-0.035, 0.13]) block('cheek comb stanchion', [0, 0.033, z], [0.061, 0.038, 0.02], tan, 0.006);
  block('contoured recoil pad', [0, -0.065, -0.218], [0.109, 0.207, 0.043], rubber, 0.019);
  for (let i = 0; i < 9; i++) block('recoil pad texture rib', [0, -0.14 + i * 0.018, -0.242], [0.085, 0.005, 0.004], gloveDark, 0.001);
  const grip = block('ergonomic pistol grip', [0, -0.145, 0.31], [0.073, 0.17, 0.094], rubber, 0.024); grip.rotation.x = -0.28;
  for (const x of [-0.037, 0.037]) for (let i = 0; i < 5; i++) { const ridge = block('grip stipple', [x, -0.11 - i * 0.021, 0.323 - i * 0.005], [0.002, 0.008, 0.062], gloveDark, 0.001); ridge.rotation.x = -0.28; }
  block('trigger guard rear', [0, -0.099, 0.365], [0.025, 0.065, 0.018], tan, 0.007);
  block('trigger guard front', [0, -0.095, 0.443], [0.025, 0.059, 0.018], tan, 0.007);
  block('trigger guard bow', [0, -0.124, 0.405], [0.025, 0.014, 0.08], tan, 0.006);
  const trigger = block('curved steel trigger', [0, -0.09, 0.392], [0.01, 0.041, 0.017], steel, 0.005); trigger.rotation.x = -0.2;
  block('magazine shell', [0, 0, 0], [0.075, 0.17, 0.139], blackMetal, 0.009, magazine);
  block('magazine baseplate', [0, -0.087, 0], [0.086, 0.016, 0.151], steel, 0.005, magazine);
  for (const x of [-0.039, 0.039]) for (const z of [-0.04, 0.04]) block('magazine reinforcement flute', [x, -0.004, z], [0.004, 0.122, 0.011], steel, 0.003, magazine);
  // Stepped optical housing with recessed glass, knurled ring, and marked turrets.
  block('Picatinny action rail', [0, 0.102, 0.46], [0.062, 0.029, 0.49], steel, 0.004);
  for (let i = 0; i < 19; i++) block('Picatinny cross slot', [0, 0.121, 0.23 + i * 0.025], [0.073, 0.013, 0.012], blackMetal, 0.002);
  for (const z of [0.34, 0.61]) {
    block('scope mount saddle', [0, 0.147, z], [0.084, 0.046, 0.038], blackMetal, 0.006);
    ring('scope mounting ring', [0, 0.213, z], 0.041, 0.012, steel);
    for (const x of [-0.048, 0.048]) { block('scope ring clamp', [x, 0.214, z], [0.021, 0.025, 0.043], steel, 0.004); screw(x + Math.sign(x) * 0.009, 0.214, z); }
  }
  lathe('precision scope housing', [0, 0.213, 0], [
    [0.171, 0.052], [0.19, 0.052], [0.194, 0.049], [0.248, 0.049], [0.257, 0.044], [0.29, 0.034],
    [0.565, 0.034], [0.60, 0.038], [0.659, 0.063], [0.697, 0.065], [0.752, 0.065], [0.761, 0.061],
    [0.761, 0.054], [0.749, 0.054], [0.691, 0.054], [0.635, 0.032], [0.3, 0.026], [0.232, 0.039], [0.19, 0.041], [0.171, 0.041], [0.171, 0.052],
  ], blackMetal);
  lathe('rubber eye relief cup', [0, 0.213, 0], [[0.147, 0.054], [0.16, 0.057], [0.176, 0.055], [0.183, 0.052], [0.183, 0.043], [0.154, 0.044], [0.147, 0.046], [0.147, 0.054]], rubber);
  tube('rear scope dark recess', [0, 0.213, 0.191], 0.001, 0.044, recess);
  ellipsoid('rear optical glass', [0, 0.213, 0.181], [0.083, 0.083, 0.009], glass);
  ring('eyepiece polished rim', [0, 0.213, 0.152], 0.0455, 0.0028, edge);
  ellipsoid('front objective lens', [0, 0.213, 0.746], [0.108, 0.108, 0.008], glass);
  ring('objective lip', [0, 0.213, 0.763], 0.061, 0.004, steel);
  ring('scope amber coating accent', [0, 0.213, 0.25], 0.049, 0.0018, brass);
  for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; const rib = block('magnification ring knurl', [Math.cos(a) * 0.05, 0.213 + Math.sin(a) * 0.05, 0.226], [0.003, 0.003, 0.048], rubber, 0.001); rib.rotation.z = a; }
  const turret = lathe('elevation turret', [0, 0.257, 0.475], [[0, 0.027], [0.011, 0.027], [0.018, 0.035], [0.046, 0.035], [0.05, 0.03], [0.05, 0]], blackMetal); turret.rotation.x = 0;
  const windage = lathe('windage turret', [0.03, 0.213, 0.475], [[0, 0.027], [0.012, 0.027], [0.019, 0.032], [0.039, 0.032], [0.043, 0]], blackMetal); windage.rotation.set(0, 0, -Math.PI / 2);
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; const knurl = block('elevation dial knurl', [Math.cos(a) * 0.034, 0.287, 0.475 + Math.sin(a) * 0.034], [0.003, 0.016, 0.003], steel, 0.001); knurl.rotation.y = -a; }
  for (let i = 0; i < 12; i++) block('scope calibration mark', [-0.016 + i * 0.003, 0.311, 0.465], [0.0008, 0.001, i % 3 === 0 ? 0.008 : 0.004], edge, 0.0002);
  textLabel('optic engraved lettering', '4–16 × 56  /  MIL', [0.046, 0.219, 0.22], 0.092, 0.017, true);
  // Handle lifts around the action axis before sliding rearwards.
  tube('moving bolt body', [0, 0.015, 0.05], 0.24, 0.021, boltSteel, bolt);
  link('swept bolt handle', [0.012, 0.005, -0.017], [0.119, -0.055, -0.047], 0.01, boltSteel, bolt, 0.014);
  ellipsoid('bolt handle ball', [0.123, -0.057, -0.049], [0.05, 0.048, 0.051], blackMetal, bolt);
  for (let i = 0; i < 5; i++) ring('bolt knob traction ring', [0.123, -0.057, -0.063 + i * 0.007], 0.022, 0.0022, rubber, bolt);
  for (const side of [-1, 1]) {
    const hinge = tube('bipod pivot', [side * 0.065, -0.064, 1.055], 0.016, 0.023, steel); hinge.rotation.set(0, 0, Math.PI / 2);
    link('folded bipod outer tube', [side * 0.066, -0.078, 1.04], [side * 0.072, -0.094, 0.835], 0.012, steel);
    link('folded bipod inner tube', [side * 0.072, -0.094, 0.835], [side * 0.079, -0.108, 0.705], 0.008, edge);
    block('bipod rubber foot', [side * 0.079, -0.108, 0.705], [0.035, 0.025, 0.045], rubber, 0.009);
  }
  ring('rear sling loop', [0.055, -0.027, 0.24], 0.015, 0.004, steel);
  // Sculpted glove palms, bent fingers, protective pads, and woven sleeves.
  function finger(name: string, path: XYZ[], mat: Material, parent: TransformNode, radius = 0.011) {
    const mesh = MeshBuilder.CreateTube(name, { path: path.map(V), radius, tessellation: 12, cap: Mesh.CAP_ALL }, scene); finish(mesh, mat, parent);
    ellipsoid(`${name} tip`, path[path.length - 1], [radius * 2, radius * 2, radius * 2], mat, parent); return mesh;
  }
  ellipsoid('right glove palm', [0.054, -0.153, 0.313], [0.092, 0.114, 0.084], glove, rightHand);
  ellipsoid('right hand back protector', [0.092, -0.151, 0.314], [0.017, 0.089, 0.065], gloveDark, rightHand);
  for (let i = 0; i < 3; i++) {
    const y = -0.132 - i * 0.025;
    finger('curled grip finger', [[0.066, y, 0.35], [0.046, y - 0.004, 0.365], [0.001, y - 0.002, 0.365], [-0.041, y + 0.004, 0.334]], glove, rightHand, 0.012);
    ellipsoid('finger protective pad', [0.058, y, 0.352], [0.025, 0.023, 0.022], gloveDark, rightHand);
  }
  finger('trigger index finger', [[0.081, -0.103, 0.329], [0.074, -0.082, 0.374], [0.036, -0.085, 0.401], [0.01, -0.09, 0.392]], glove, rightHand, 0.0115);
  finger('right thumb', [[0.061, -0.126, 0.276], [0.016, -0.099, 0.281], [-0.041, -0.103, 0.311]], glove, rightHand, 0.014);
  for (const y of [-0.171, -0.14]) finger('right glove stitching', [[0.101, y, 0.284], [0.105, y, 0.32], [0.092, y, 0.349]], seam, rightHand, 0.0012);
  ellipsoid('support palm', [-0.077, -0.107, 0.873], [0.09, 0.071, 0.124], glove, leftHand);
  ellipsoid('support palm grip panel', [-0.106, -0.096, 0.878], [0.026, 0.057, 0.096], gloveDark, leftHand);
  for (let i = 0; i < 4; i++) {
    const z = 0.822 + i * 0.024;
    finger('support finger', [[-0.096, -0.084, z], [-0.069, -0.135, z], [-0.019, -0.146, z], [0.036, -0.119, z], [0.053, -0.082, z]], glove, leftHand, 0.011);
    ellipsoid('support knuckle pad', [-0.079, -0.127, z], [0.026, 0.028, 0.022], gloveDark, leftHand);
  }
  finger('support thumb', [[-0.084, -0.085, 0.91], [-0.059, -0.038, 0.914], [-0.03, -0.024, 0.883]], glove, leftHand, 0.013);
  function sleeve(name: string, path: XYZ[], parent: TransformNode) {
    const mesh = MeshBuilder.CreateTube(name, { path: path.map(V), radiusFunction: i => 0.044 + i / (path.length - 1) * 0.021, tessellation: 24, cap: Mesh.CAP_ALL }, scene); finish(mesh, fabric, parent);
    const a = V(path[0]), direction = V(path[1]).subtract(a).normalize();
    const cuff = MeshBuilder.CreateCylinder('ribbed cuff', { height: 0.047, diameter: 0.091, tessellation: 32 }, scene);
    cuff.position.copyFrom(a.add(direction.scale(0.015))); cuff.rotationQuaternion = Quaternion.Identity(); Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction, cuff.rotationQuaternion); finish(cuff, gloveDark, parent);
    for (let i = 1; i < path.length - 1; i++) { const crease = ellipsoid('sleeve fabric fold', path[i], [0.109, 0.105, 0.033], fabric, parent); crease.rotation.y = -0.4; crease.rotation.x = 0.3; }
  }
  sleeve('right forearm sleeve', [[0.075, -0.198, 0.28], [0.112, -0.241, 0.216], [0.16, -0.272, 0.14], [0.22, -0.308, 0.054], [0.29, -0.344, -0.035]], rightHand);
  sleeve('left forearm sleeve', [[-0.094, -0.117, 0.813], [-0.123, -0.16, 0.725], [-0.166, -0.205, 0.603], [-0.217, -0.255, 0.467], [-0.269, -0.31, 0.327]], leftHand);
  // Consolidate rigid meshes by material to keep the extra detail affordable.
  const groups = new Map<Material, Mesh[]>();
  for (const mesh of staticMeshes) { const list = groups.get(mesh.material!) ?? []; list.push(mesh); groups.set(mesh.material!, list); }
  for (const [mat, list] of groups) {
    if (list.length < 2) continue;
    const merged = Mesh.MergeMeshes(list, true, true); if (!merged) continue;
    merged.name = `rifle assembly / ${mat.name}`; merged.material = mat; merged.parent = root; merged.renderingGroupId = 2; merged.isPickable = false;
  }
  const flashMaterial = new StandardMaterial('muzzle flash', scene); flashMaterial.disableLighting = true; flashMaterial.emissiveColor = new Color3(1, 0.73, 0.37); flashMaterial.alpha = 0.85;
  const flash = MeshBuilder.CreateSphere('muzzle flare', { diameter: 0.105, segments: 8 }, scene); flash.position.set(0, 0.018, 1.725); flash.scaling.set(1, 0.8, 2.7);
  finish(flash, flashMaterial); flash.setEnabled(false);
  root.parent = camera; root.scaling.setAll(0.86); root.position.set(0.235, -0.235, 0.24);
  const fill = new DirectionalLight('weapon soft fill', new Vector3(-0.5, -0.45, 1), scene); fill.parent = camera; fill.diffuse = new Color3(0.9, 0.95, 1); fill.intensity = 0.6; fill.includedOnlyMeshes = root.getChildMeshes();
  function updatePose(ads: number, recoil: number, sway: number, shotAge: number, reloadT: number, reloading: boolean, inspect: number) {
    const dip = reloading ? Math.sin(reloadT * Math.PI) : 0;
    const aspect = scene.getEngine().getRenderWidth() / scene.getEngine().getRenderHeight();
    const layout = Math.max(0.72, Math.min(1, aspect / 1.3));
    root.scaling.setAll(0.86 * layout);
    root.position.set(0.18 * layout * (1 - ads) - inspect * 0.06, (-0.235 + ads * 0.052) * layout - dip * 0.08 + sway - recoil * 0.012 + inspect * 0.035, 0.29 - recoil * 0.065 + inspect * 0.25);
    root.rotation.set(-recoil * 0.085 + dip * 0.2 + inspect * 0.07, -0.09 * (1 - ads) - inspect * 0.52, -0.055 * (1 - ads) - dip * 0.23 - inspect * 0.21);
    const cycle = shotAge > 0.19 && shotAge < 0.81 ? Math.sin((shotAge - 0.19) / 0.62 * Math.PI) : 0;
    bolt.position.set(0, 0.022, 0.39 - cycle * 0.115); bolt.rotation.z = cycle * 0.85;
    rightHand.position.set(cycle * 0.045, cycle * 0.20, cycle * -0.07); rightHand.rotation.z = cycle * 0.12;
    magazine.position.y = -0.18 - dip * 0.16; magazine.rotation.x = -dip * 0.2;
    leftHand.position.set(dip * 0.06, -dip * 0.20, -dip * 0.36);
  }
  return { root, bolt, flash, updatePose };
}
