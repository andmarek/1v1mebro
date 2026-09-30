import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Shaders/default.vertex';
import '@babylonjs/core/Shaders/default.fragment';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Material } from '@babylonjs/core/Materials/material';
import { arenaMaterials } from './arenaMaterials';
import { boxUVs, desertRidge, jerseyBarrier } from './arenaGeometry';
import { roundedBox } from './rifleGeometry';
import type { Scene } from '@babylonjs/core/scene';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { Solid } from './simulation';
import { towerGeometry } from './tower';
import { captureGeometry, TARGET_HEALTH, type CoverSurface, type CoverMaterial } from './ballistics';
import { buildBotWeapon, botFlashMaterial } from './botWeapon';
import { createPatrol, PATROL_ROUTES, PatrolNavigation, resetPatrol, walkingPose, type Patrol } from './patrol';

export type Target = { root: TransformNode; home: Vector3; meshes: Mesh[]; index: number; health: number; respawnAt: number; patrol: Patrol; animate: (dt: number, now: number) => void; reset: () => void; setCombatPose: (aiming: boolean, yaw: number, pitch: number, shotAge: number, reloading?: boolean, reloadProgress?: number, boltProgress?: number) => void };
export function buildArena(scene: Scene, shadows: ShadowGenerator) {
  const solids: Solid[] = [];
  const targets: Target[] = [];
  const cover: CoverSurface[] = [];
  const material = (name: string, color: string, rough = true) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(color);
    m.specularColor = rough ? new Color3(0.06, 0.06, 0.06) : new Color3(0.35, 0.35, 0.35);
    return m;
  };
  const { sand, concrete, steel, rust, teal, ochre, pale, black, orange, targetPlate, targetHead } = arenaMaterials(scene);
  let seed = 1947;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const staticMeshes: Mesh[] = [];
  let buildingStatic = true;
  const coverGroups = new Map<string, CoverSurface>();
  function assembly(start: number, group: string, kind: CoverMaterial, shell?: number) {
    for (const mesh of staticMeshes.slice(start)) mesh.metadata.cover = { group, kind, shell };
  }
  const bounds = (x: number, y: number, z: number, w: number, h: number, d: number) =>
    solids.push({ minX: x - w / 2, maxX: x + w / 2, minY: y - h / 2, maxY: y + h / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  function finish(mesh: Mesh, mat: Material, shadow = true) {
    mesh.material = mat; mesh.receiveShadows = true; mesh.metadata = { solid: true };
    if (buildingStatic) staticMeshes.push(mesh);
    else if (shadow) shadows.addShadowCaster(mesh);
    return mesh;
  }

  function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, mat: Material, solid = true, shadow = true) {
    const mesh = roundedBox(name, w, h, d, Math.min(0.045, w * 0.12, h * 0.12, d * 0.12), scene);
    boxUVs(mesh, w, h, d);
    mesh.position.set(x, y, z); finish(mesh, mat, shadow);
    mesh.metadata = { solid: true };
    if (solid) bounds(x, y, z, w, h, d);
    return mesh;
  }
  function cylinder(name: string, x: number, y: number, z: number, height: number, diameter: number, mat: Material, tessellation = 32) {
    const mesh = MeshBuilder.CreateCylinder(name, { height, diameter, tessellation }, scene);
    mesh.position.set(x, y, z); finish(mesh, mat);
    mesh.metadata = { solid: true }; return mesh;
  }
  function beam(a: Vector3, b: Vector3, width = 0.12, mat: Material = rust) {
    const mesh = MeshBuilder.CreateCylinder('tubular rail or brace', { height: Vector3.Distance(a, b), diameter: width, tessellation: 12 }, scene);
    mesh.position = a.add(b).scale(0.5);
    mesh.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), b.subtract(a).normalize(), new Quaternion());
    return finish(mesh, mat);
  }
  function stringer(a: Vector3, b: Vector3) {
    const mesh = roundedBox('steel stair stringer', 0.12, Vector3.Distance(a, b), 0.22, 0.012, scene);
    mesh.position = a.add(b).scale(0.5);
    mesh.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), b.subtract(a).normalize(), new Quaternion());
    finish(mesh, rust);
  }
  function sign(text: string, x: number, y: number, z: number, width: number, height: number, rotation = 0) {
    const texture = new DynamicTexture(`sign-${text}`, { width: 1024, height: Math.round(1024 * height / width) }, scene, false);
    const c = texture.getContext() as CanvasRenderingContext2D, th = Math.round(1024 * height / width);
    c.fillStyle = '#28332f'; c.fillRect(0, 0, 1024, th);
    c.strokeStyle = '#bcad89'; c.lineWidth = 9; c.strokeRect(13, 13, 998, th - 26);
    const fontSize = Math.min(th * .7, Math.floor(870 / (text.length * 0.6)));
    c.font = `bold ${fontSize}px monospace`; c.textAlign = 'center'; c.fillStyle = '#d9ccb0'; c.fillText(text, 512, th / 2 + fontSize * 0.33);
    for (let i = 0; i < 650; i++) { c.fillStyle = 'rgba(34,27,19,.18)'; c.fillRect(rand() * 1024, rand() * th, rand() * 6, rand() * 3); }
    texture.update();
    const m = material(`sign mat ${text}`, '#ffffff'); m.diffuseTexture = texture; m.backFaceCulling = false;
    const plane = MeshBuilder.CreatePlane('yard signage', { width, height }, scene);
    plane.position.set(x, y, z); plane.rotation.y = rotation; plane.material = m; plane.isPickable = false;
  }

  const ground = MeshBuilder.CreateGround('yard floor', { width: 220, height: 220 }, scene);
  ground.material = sand; ground.receiveShadows = true; ground.metadata = { solid: true };
  cover.push({ material: 'sand', geometry: [captureGeometry(ground)] });
  const skyMat = material('atmospheric sky', '#ffffff'); skyMat.disableLighting = true;
  skyMat.diffuseColor = Color3.Black(); skyMat.emissiveColor = Color3.White();
  skyMat.fogEnabled = false; skyMat.disableDepthWrite = true;
  const sky = MeshBuilder.CreateSphere('sky dome', { diameter: 440, segments: 32, sideOrientation: Mesh.BACKSIDE }, scene);
  sky.material = skyMat; sky.isPickable = false; sky.infiniteDistance = true;
  const skyPositions = sky.getVerticesData(VertexBuffer.PositionKind)!, skyColors: number[] = [];
  const horizon = Color3.FromHexString('#d3c8ae'), zenith = Color3.FromHexString('#648bac');
  for (let i = 0; i < skyPositions.length; i += 3) {
    const color = Color3.Lerp(horizon, zenith, Math.pow(Math.max(0, skyPositions[i + 1] / 220), .55));
    skyColors.push(color.r, color.g, color.b, 1);
  }
  sky.setVerticesData(VertexBuffer.ColorKind, skyColors);
  const fenceTexture = new DynamicTexture('woven chain link', 128, scene, true);
  const fc = fenceTexture.getContext() as CanvasRenderingContext2D; fc.clearRect(0, 0, 128, 128);
  fc.strokeStyle = '#65716b'; fc.lineWidth = 2.4;
  for (const offset of [-128, 0, 128]) {
    fc.beginPath(); fc.moveTo(offset, 0); fc.lineTo(offset + 128, 128); fc.stroke();
    fc.beginPath(); fc.moveTo(offset + 128, 0); fc.lineTo(offset, 128); fc.stroke();
  }
  fenceTexture.update(); fenceTexture.hasAlpha = true; fenceTexture.uScale = 150; fenceTexture.vScale = 5;
  const fenceMat = material('galvanized chain link', '#b5bcb5', false); fenceMat.diffuseTexture = fenceTexture; fenceMat.useAlphaFromDiffuseTexture = true; fenceMat.backFaceCulling = false;
  for (const z of [-30, 30]) {
    // Construction seams and pier caps break up the long perimeter wall.
    for (let x = -27.5; x <= 27.5; x += 5) box('precast perimeter panel', x, 1.25, z, 4.96, 2.5, .65, concrete);
    for (let x = -30; x <= 30; x += 5) box('concrete wall pier', x, 1.3, z, .28, 2.6, .8, concrete);
    const fence = MeshBuilder.CreatePlane('chain link perimeter', { width: 60, height: 2 }, scene);
    fence.position.set(0, 3.5, z); fence.material = fenceMat; fence.isPickable = false;
    for (let x = -29; x <= 29; x += 4) {
      cylinder('fence post', x, 3.1, z, 3, .1, steel, 12);
      beam(new Vector3(x - 1.9, 2.55, z), new Vector3(x + 1.9, 4.45, z), .04, steel);
    }
    beam(new Vector3(-30, 4.5, z), new Vector3(30, 4.5, z), .07, steel);
  }
  for (const x of [-30, 30]) {
    for (let z = -27.5; z <= 27.5; z += 5) box('precast boundary wall', x, 2.2, z, .65, 4.4, 4.96, concrete);
    for (let z = -30; z <= 30; z += 5) box('wall pier', x, 2.25, z, .8, 4.5, .28, concrete);
  }
  sign('SECTOR 07  /  LIVE FIRE', 0, 3.2, 29.6, 10, 1.8);
  sign('DEADBOLT  /  TRAINING YARD', 0, 2.4, -29.6, 10, 1.6, Math.PI);

  function container(x: number, z: number, w: number, d: number, mat: Material, label: string) {
    const start = staticMeshes.length;
    box('shipping container', x, 1.5, z, w, 3, d, mat);
    for (let offset = -w / 2 + 0.2; offset < w / 2; offset += 0.36) {
      for (const side of [-1, 1]) box('corrugation', x + offset, 1.5, z + side * (d / 2 + 0.025), 0.20, 2.78, 0.10, mat, false, false);
    }
    for (const side of [-1, 1]) {
      box('container top rail', x, 3, z + side * d / 2, w + 0.08, 0.1, 0.1, steel, false);
      box('container bottom rail', x, 0.08, z + side * d / 2, w + 0.08, 0.1, 0.1, steel, false);
    }
    for (const end of [-1, 1]) {
      const ex = x + end * (w / 2 + .04);
      for (const offset of [-d / 4, d / 4]) {
        box('container end door', ex, 1.5, z + offset, .065, 2.72, d / 2 - .11, mat, false);
        for (const dz of [-.42, .42]) {
          cylinder('door locking rod', ex + end * .06, 1.5, z + offset + dz, 2.65, .045, steel, 12);
          for (const y of [.48, 1.5, 2.5]) box('lock rod bracket', ex + end * .08, y, z + offset + dz, .07, .10, .14, steel, false);
        }
        box('door locking handle', ex + end * .12, 1.14, z + offset, .05, .07, .65, steel, false);
      }
      for (const ez of [-1, 1]) {
        box('corner casting', ex, .15, z + ez * (d / 2 - .08), .19, .24, .22, steel, false);
        box('upper corner casting', ex, 2.89, z + ez * (d / 2 - .08), .19, .24, .22, steel, false);
      }
    }
    for (let rx = -w / 2 + .4; rx < w / 2; rx += .6) box('container roof corrugation', x + rx, 3.015, z, .19, .04, d - .1, mat, false);
    sign(label, x, 1.8, z - d / 2 - 0.085, Math.min(w * 0.6, 3.5), 0.7, 0);
    assembly(start, `container ${label}`, 'metal', .012);
  }
  container(-16, -10, 9, 3.8, teal, 'DB / 104');
  container(17, 3, 10, 4, rust, 'DB / 208');
  container(-17, 18, 10, 4, ochre, 'DB / 307');
  container(19, -19, 7, 3.8, ochre, 'SUPPLY');
  container(16, 21, 7, 4, teal, 'DB / 410');

  // Open steel tower: a first deck reached by real collidable stairs.
  for (const x of [-3.5, 3.5]) for (const z of [0, 7]) {
    bounds(x, 5.75, z, .28, 11.5, .28);
    box('I beam web', x, 5.75, z, .075, 11.5, .28, rust, false);
    for (const dx of [-.12, .12]) box('I beam flange', x + dx, 5.75, z, .045, 11.5, .32, rust, false);
    box('bolted column base plate', x, .05, z, .65, .1, .65, steel, false);
    for (const dx of [-.23, .23]) for (const dz of [-.23, .23]) cylinder('anchor nut', x + dx, .14, z + dz, .1, .08, steel, 6);
    beam(new Vector3(x, 0.2, z), new Vector3(-x, 4.2, z));
  }
  for (const b of towerGeometry()) {
    bounds(b.x, b.y, b.z, b.w, b.h, b.d);
    if (b.name.includes('tread')) {
      const top = b.y + b.h / 2;
      box(b.name, b.x, top - .045, b.z, b.w, .09, b.d - .035, steel, false);
      box('worn yellow stair edge', b.x, top + .003, b.z + (b.name.startsWith('upper') ? .18 : -.27), b.w, .012, .055, ochre, false);
    } else box(b.name, b.x, b.y, b.z, b.w, b.h, b.d, steel, false);
  }
  for (const x of [4.18, 6.22]) {
    stringer(new Vector3(x, .05, -6.1), new Vector3(x, 4.15, 3));
    beam(new Vector3(x, 1.03, -6.1), new Vector3(x, 5.2, 3), .065, pale);
    for (let i = 0; i < 5; i++) {
      const z = -5.8 + i * 2.1, y = (z + 6.1) / 9.1 * 4.1;
      beam(new Vector3(x, y, z), new Vector3(x, y + 1.05, z), .055, pale);
    }
  }
  for (const x of [-2.24, -.56]) {
    stringer(new Vector3(x, 4.28, 6.91), new Vector3(x, 8.25, .5));
    beam(new Vector3(x, 5.3, 6.91), new Vector3(x, 9.3, .5), .055, pale);
    for (let i = 0; i < 4; i++) {
      const z = 6.7 - i * 1.9, y = 4.25 + (6.91 - z) / 6.41 * 4.1;
      beam(new Vector3(x, y, z), new Vector3(x, y + 1.05, z), .055, pale);
    }
  }
  for (const y of [3.9, 8]) {
    for (const x of [-3.5, 0, 3.5]) box('deck underside joist', x, y - .15, 3.5, .14, .3, 7.4, rust, false);
    for (const z of [0, 7]) box('deck edge channel', 0, y, z, 7.6, .35, .12, rust, false);
  }
  box('tower canopy', 0, 11.4, 3.5, 8.4, 0.12, 8.4, ochre);
  for (let x = -4.1; x < 4.2; x += .35) box('roof standing seam', x, 11.47, 3.5, .065, .09, 8.4, rust, false);
  for (const z of [-.7, 7.7]) box('roof fascia', 0, 11.32, z, 8.5, .28, .08, rust, false);
  for (const y of [5.25, 9.35]) {
    for (const x of [-3.65, 3.65]) {
      box('tower safety rail', x, y, 3.5, 0.08, 0.09, 7.5, pale, false);
      for (const z of [0, 3.5, 7]) box('railing post', x, y - 0.5, z, 0.07, 1.1, 0.07, pale, false);
    }
    box('back rail', 0, y, 7.18, 7.5, 0.09, 0.09, pale, false);
  }
  sign('07', -0.1, 10.1, -0.22, 2.3, 1.7, 0);
  const chimney = cylinder('exhaust stack', 1.8, 13, 5, 7, 0.7, rust);
  for (const y of [10.5, 12.7, 15.5]) cylinder('stack band', chimney.position.x, y, 5, 0.1, 0.81, steel);
  beam(new Vector3(-3.5, 11.5, 0), new Vector3(3.5, 11.5, 7), 0.1);

  // Waist-high cover and concrete lanes.
  for (const [x, z, w] of [[-7, -16, 5], [7, -14, 4], [-11, 2, 4], [10, 12, 4], [-5, 21, 6]]) {
    const start = staticMeshes.length;
    bounds(x, .22, z, w, .44, 1.3); bounds(x, .77, z, w, 1.1, .7);
    const barrier = jerseyBarrier('cast Jersey barrier', w, scene); barrier.position.set(x, 0, z); finish(barrier, concrete);
    for (const dx of [-w / 2 + .5, w / 2 - .5]) {
      const ring = MeshBuilder.CreateTorus('lifting eye', { diameter: .16, thickness: .025, tessellation: 16 }, scene);
      ring.position.set(x + dx, 1.34, z); ring.rotation.x = Math.PI / 2; finish(ring, steel);
    }
    for (let j = -w / 2 + 0.4; j < w / 2; j += 0.9) {
      const stripe = box('hazard stripe', x + j, 1, z - 0.305, 0.24, 0.4, 0.008, ochre, false, false);
      stripe.rotation.z = -.4; stripe.rotation.x = -.18;
    }
    assembly(start, `barrier ${x} ${z}`, 'concrete');
  }
  const wood = material('weathered timber', '#ffffff');
  const woodTexture = new DynamicTexture('rough timber grain', 512, scene, true);
  const wc = woodTexture.getContext() as CanvasRenderingContext2D;
  wc.fillStyle = '#967249'; wc.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1800; i++) {
    wc.strokeStyle = i % 2 ? 'rgba(47,31,15,.2)' : 'rgba(211,178,118,.18)'; wc.lineWidth = .5 + rand() * 1.5;
    const x = rand() * 512, y = rand() * 512;
    wc.beginPath(); wc.moveTo(x, y); wc.bezierCurveTo(x + 3, y + 10, x - 3, y + 30, x, y + 40 + rand() * 120); wc.stroke();
  }
  for (let x = 0; x < 512; x += 128) { wc.fillStyle = '#382918'; wc.fillRect(x, 0, 3, 512); }
  woodTexture.update(); wood.diffuseTexture = woodTexture;
  // Two live-fire screens make penetration easy to try, including a metal screen in front of the central patrol.
  for (const [x, z, mat, kind, thickness] of [[0, -11, teal, 'metal', .035], [10, -6, wood, 'wood', .12]] as const) {
    const panel = box(`${kind} live-fire screen`, x, 1.1, z, 2.3, 2.2, thickness, mat);
    panel.metadata.cover = { group: `${kind} screen`, kind };
    for (const side of [-1, 1]) {
      box('screen frame post', x + side * 1.21, 1.2, z, .09, 2.4, .09, steel);
      box('screen foot', x + side * 1.21, .04, z, .45, .08, .8, steel);
    }
    sign(`${kind.toUpperCase()} / LIVE FIRE`, x, 2.48, z, 2.2, .25);
  }
  for (const [x, z] of [[-23, 2], [23, 12], [-10, 24], [10, -24]]) {
    const start = staticMeshes.length;
    box('crate', x, 0.65, z, 1.5, 1.3, 1.5, wood);
    for (const y of [0.25, 1.08]) box('crate band', x, y, z - 0.755, 1.55, 0.08, 0.04, steel, false);
    assembly(start, `crate ${x} ${z}`, 'wood', .055);
  }
  for (const [x, z] of [[-23, -20], [23, -6], [-9, 11], [11, 24]]) {
    const start = staticMeshes.length;
    const drum = MeshBuilder.CreateLathe('rolled steel drum', { shape: [new Vector3(0, 0, 0), new Vector3(.36, 0, 0), new Vector3(.4, .05, 0), new Vector3(.4, .27, 0), new Vector3(.42, .30, 0), new Vector3(.4, .34, 0), new Vector3(.4, .83, 0), new Vector3(.42, .87, 0), new Vector3(.4, .91, 0), new Vector3(.4, 1.16, 0), new Vector3(.36, 1.2, 0), new Vector3(0, 1.2, 0)], tessellation: 40 }, scene); drum.position.set(x, 0, z); finish(drum, rust);
    cylinder('drum filler cap', x + .18, 1.21, z, .035, .095, steel, 12);
    solids.push({ minX: x - 0.4, maxX: x + 0.4, minY: 0, maxY: 1.2, minZ: z - 0.4, maxZ: z + 0.4 });
    for (const y of [0.2, 0.9, 1.19]) cylinder('barrel rim', x, y, z, 0.045, 0.84, steel);
    assembly(start, `drum ${x} ${z}`, 'metal', .008);
  }
  for (let i = 0; i < 3; i++) {
    const pipe = MeshBuilder.CreateLathe('hollow concrete drainage pipe', { shape: [new Vector3(.46, -2.75, 0), new Vector3(.575, -2.75, 0), new Vector3(.575, 2.75, 0), new Vector3(.46, 2.75, 0), new Vector3(.46, -2.75, 0)], tessellation: 48, closed: false, sideOrientation: Mesh.DOUBLESIDE }, scene);
    pipe.position.set(-22 + i * 1.3, .65, 9); pipe.rotation.x = Math.PI / 2; finish(pipe, concrete);
    solids.push({ minX: -22.6 + i * 1.3, maxX: -21.4 + i * 1.3, minY: 0, maxY: 1.25, minZ: 6.25, maxZ: 11.75 });
    const inset = cylinder('pipe shadowed interior', -22 + i * 1.3, .65, 10.8, .015, .915, black, 48); inset.rotation.x = Math.PI / 2;
  }
  for (let i = 0; i < 190; i++) {
    const x = (rand() - .5) * 55, z = (rand() - .5) * 55;
    const stone = MeshBuilder.CreateSphere('scattered gravel', { diameter: .04 + rand() * .22, segments: 6 }, scene);
    stone.position.set(x, .015, z); stone.scaling.set(1.4, .45, .8); stone.rotation.set(rand(), rand(), rand());
    finish(stone, concrete); stone.isPickable = false;
  }
  const ridge = desertRidge(scene);
  const ridgeMat = concrete.clone('sun bleached sedimentary ridge')!; ridgeMat.albedoColor = Color3.FromHexString('#a79980'); ridge.material = ridgeMat;
  // Transparent dust marks and tire ruts sit just above the playable, flat floor.
  const trackTexture = new DynamicTexture('tire tracks', { width: 256, height: 1024 }, scene, true);
  const tc = trackTexture.getContext() as CanvasRenderingContext2D; tc.clearRect(0, 0, 256, 1024);
  for (const x of [55, 185]) {
    tc.fillStyle = 'rgba(60,45,30,.09)'; tc.fillRect(x - 17, 0, 34, 1024);
    for (let y = 0; y < 1024; y += 24) {
      tc.strokeStyle = 'rgba(59,45,29,.2)'; tc.lineWidth = 7; tc.beginPath();
      tc.moveTo(x - 15, y); tc.lineTo(x, y + 9); tc.lineTo(x + 15, y); tc.stroke();
    }
  }
  trackTexture.update(); trackTexture.hasAlpha = true;
  const trackMat = material('ground tire impressions', '#ffffff'); trackMat.diffuseTexture = trackTexture; trackMat.useAlphaFromDiffuseTexture = true; trackMat.specularColor = Color3.Black();
  for (const [x, z, angle] of [[-15, 1, .15], [15, -5, -.1], [-8, -20, .8]]) {
    const tracks = MeshBuilder.CreateGround('old tire ruts', { width: 2.8, height: 23 }, scene);
    tracks.position.set(x, .009, z); tracks.rotation.y = angle; tracks.material = trackMat; tracks.receiveShadows = true; tracks.isPickable = false;
  }
  // Floor lane markings help convey scale and movement speed.
  for (let i = 0; i < 10; i++) box('lane paint', -0.1, 0.008, -26 + i * 1.1, 0.12, 0.012, 0.55, ochre, false, false);

  // Batch static detail by material so the extra construction detail does not cost a draw call per bolt or rib.
  const groups = new Map<Material, Mesh[]>();
  for (const mesh of staticMeshes) {
    if (mesh.isPickable && mesh.name !== 'lane paint') {
      const spec = mesh.metadata.cover;
      const kind: CoverMaterial = spec?.kind ?? (mesh.material === concrete || mesh.material === black ? 'concrete' : 'metal');
      const key = spec?.group ?? mesh.uniqueId.toString();
      let surface = coverGroups.get(key);
      if (!surface) { surface = { material: kind, shell: spec?.shell, geometry: [] }; coverGroups.set(key, surface); cover.push(surface); }
      surface.geometry.push(captureGeometry(mesh));
    }
    const group = groups.get(mesh.material!) ?? []; group.push(mesh); groups.set(mesh.material!, group);
  }
  for (const [mat, meshes] of groups) {
    const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, false);
    if (merged) { merged.name = `yard / ${mat.name}`; merged.material = mat; merged.receiveShadows = true; merged.metadata = { solid: true }; shadows.addShadowCaster(merged); }
  }
  buildingStatic = false;
  const floors = [0, 0, 0, 0, 0, 4.25, 8.35, 0, 0];
  const navigation = new Map<number, PatrolNavigation>();
  for (const floor of new Set(floors)) navigation.set(floor, new PatrolNavigation(solids, floor));
  const enemyFlash = botFlashMaterial(scene);
  PATROL_ROUTES.forEach((route, index) => {
    const home = new Vector3(route[0].x, floors[index], route[0].z);
    const root = new TransformNode(`enemy-${index}`, scene); root.position.copyFrom(home);
    const body = new TransformNode('walking body', scene); body.parent = root;
    const upperBody = new TransformNode('aiming torso', scene); upperBody.parent = body;
    const meshes: Mesh[] = [];
    const attach = (mesh: Mesh, parent: TransformNode, mat: Material, head = false) => {
      mesh.parent = parent; finish(mesh, mat); mesh.metadata = { target: index, head }; meshes.push(mesh); return mesh;
    };
    const part = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, mat: Material, parent = body) => {
      const mesh = roundedBox(name, w, h, d, Math.min(.025, h * .2, w * .2, d * .2), scene);
      boxUVs(mesh, w, h, d); mesh.position.set(x, y, z); return attach(mesh, parent, mat);
    };
    const pivot = (name: string, x: number, y: number, parent = body) => {
      const joint = new TransformNode(name, scene); joint.parent = parent; joint.position.set(x, y, 0); return joint;
    };
    const capsule = (name: string, height: number, diameter: number, y: number, parent: TransformNode, mat: Material) => {
      const mesh = MeshBuilder.CreateCapsule(name, { height, radius: diameter / 2, tessellation: 12, subdivisions: 2 }, scene);
      mesh.position.y = y; return attach(mesh, parent, mat);
    };
    const legs = [-1, 1].map(side => {
      const hip = pivot('hip joint', side * .14, .86);
      capsule('upper leg', .40, .18, -.20, hip, steel);
      const knee = pivot('knee joint', 0, -.4, hip);
      capsule('lower leg', .40, .14, -.20, knee, steel);
      const ankle = pivot('ankle joint', 0, -.4, knee);
      part('walking boot', 0, 0, -.045, .18, .11, .29, black, ankle);
      return { hip, knee, ankle };
    });
    part('waist belt', 0, .87, 0, .4, .13, .23, steel);
    const torso = MeshBuilder.CreateLathe('formed enemy torso', { shape: [new Vector3(0, 0, 0), new Vector3(.19, 0, 0), new Vector3(.22, .18, 0), new Vector3(.28, .43, 0), new Vector3(.3, .55, 0), new Vector3(.25, .63, 0), new Vector3(.15, .7, 0), new Vector3(0, .7, 0)], tessellation: 32 }, scene);
    torso.position.y = .83; torso.scaling.z = .5; attach(torso, upperBody, targetPlate);
    const arms = [-1, 1].map(side => {
      const shoulder = pivot('shoulder joint', side * .32, 1.43, upperBody); shoulder.rotation.z = side * .12;
      capsule('upper arm', .30, .15, -.15, shoulder, targetPlate);
      const elbow = pivot('elbow joint', 0, -.29, shoulder); elbow.rotation.x = -.2;
      capsule('forearm', .28, .13, -.14, elbow, steel);
      capsule('gloved hand', .15, .13, -.31, elbow, black);
      return { shoulder, elbow };
    });
    part('enemy neck', 0, 1.58, 0, .1, .13, .1, steel, upperBody);
    const neck = pivot('head turn', 0, 1.8, upperBody);
    const head = MeshBuilder.CreateSphere('head target', { diameter: .32, segments: 24 }, scene);
    head.scaling.z = .75; attach(head, neck, targetHead, true);
    part('front chest marker', 0, 1.22, -.14, .13, .17, .025, orange, upperBody);
    part('back chest marker', 0, 1.22, .14, .13, .17, .025, orange, upperBody);
    const patrol = createPatrol(route, navigation.get(home.y)!, index);
    const gun = buildBotWeapon(scene, upperBody, shadows, steel, black, enemyFlash);
    const setCombatPose = (aiming: boolean, yaw: number, pitch: number, shotAge: number, reloading = false, reloadProgress = 0, boltProgress = 0) => {
      const relativeYaw = yaw - patrol.heading;
      upperBody.rotation.y = aiming ? Math.atan2(Math.sin(relativeYaw), Math.cos(relativeYaw)) : 0;
      const reloadDip = reloading ? Math.sin(Math.PI * Math.max(0, Math.min(1, reloadProgress))) : 0;
      const kick = shotAge >= 0 && shotAge < .25 ? Math.exp(-shotAge * 18) : 0;
      gun.root.position.set(aiming ? .10 : .22, aiming ? 1.16 - reloadDip * .15 : .94, aiming ? -.37 + kick * .055 : -.10);
      gun.root.rotation.set(aiming ? pitch - reloadDip * .45 + kick * .04 : -.75, 0, aiming ? reloadDip * -.12 : -.15);
      gun.updateBolt(boltProgress);
      gun.flash.setEnabled(aiming && shotAge >= 0 && shotAge < .05);
      if (aiming) {
        // Legs keep their patrol gait while the torso and hands shoulder the weapon.
        arms[0].shoulder.rotation.set(1.15 + pitch * .6, 0, -.40);
        arms[1].shoulder.rotation.set(1.10 + pitch * .6, 0, -.40);
        arms[0].elbow.rotation.x = .10 - reloadDip * .8;
        arms[1].elbow.rotation.x = -.85 + Math.sin(Math.PI * boltProgress) * .3;
        neck.rotation.y = 0;
      }
    };
    let blend = 0;
    const pose = (now: number) => {
      const gait = walkingPose(patrol.travel, blend);
      root.position.set(patrol.x, home.y, patrol.z); root.rotation.y = patrol.heading;
      body.position.y = gait.bob + .008; body.rotation.x = gait.lean; upperBody.rotation.y = 0;
      const angles = [gait.leftLeg, gait.rightLeg], knees = [gait.leftKnee, gait.rightKnee];
      legs.forEach((leg, i) => {
        leg.hip.rotation.x = angles[i]; leg.knee.rotation.x = knees[i];
        leg.ankle.rotation.x = -angles[i] - knees[i] - gait.lean;
      });
      arms[0].shoulder.rotation.set(gait.leftArm, 0, -.12); arms[1].shoulder.rotation.set(gait.rightArm, 0, .12);
      arms.forEach(arm => { arm.elbow.rotation.x = -.2; });
      setCombatPose(false, 0, 0, Infinity);
      neck.rotation.y = Math.sin(now * .7 + index * 1.8) * .12 * (1 - blend);
    };
    const reset = () => { const target = targets[index]; if (target) target.health = TARGET_HEALTH; resetPatrol(patrol); blend = 0; pose(0); setCombatPose(false, 0, 0, Infinity); };
    targets.push({ root, home, meshes, index, health: TARGET_HEALTH, respawnAt: 0, patrol, reset, setCombatPose,
      animate: (dt, now) => { blend += ((patrol.walking ? 1 : 0) - blend) * Math.min(1, dt * 10); pose(now); } });
    reset();
  });
  return { solids, targets, cover };
}
