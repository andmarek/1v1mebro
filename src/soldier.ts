import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { roundedBox } from './rifleGeometry';
import { buildBotWeapon } from './botWeapon';
import { enemyMaterials, enemyGeometry, poseArm, rifleContact } from './enemyAppearance';
import { TARGET_HEALTH } from './ballistics';
import { resetPatrol, walkingPose, type Patrol } from './patrol';

export type Soldier = { root: TransformNode; home: Vector3; meshes: Mesh[]; index: number; health: number; respawnAt: number; patrol: Patrol; aimAmount: () => number; weaponRoot: TransformNode; animate: (dt: number, now: number) => void; reset: () => void; setCombatPose: (aiming: boolean, yaw: number, pitch: number, shotAge: number, reloading?: boolean, reloadProgress?: number, boltProgress?: number) => void };

/** Shared rig for combat NPCs and the presentation-only victim in attacker replays. */
export function buildSoldier(scene: Scene, shadows: ShadowGenerator, index: number, home: Vector3, patrol: Patrol,
  soldier: ReturnType<typeof enemyMaterials>, enemyFlash: StandardMaterial, replayOnly = false): Soldier {
  const root = new TransformNode(`enemy-${index}`, scene); root.position.copyFrom(home);
  const body = new TransformNode('walking body', scene); body.parent = root;
  const upperBody = new TransformNode('aiming torso', scene); upperBody.parent = body;
  const geometry = enemyGeometry(scene, shadows, index, soldier.detailFabric);
  const { joint, hit, decor, capsule, box: detail, ellipsoid } = geometry;
  const meshes = geometry.hits;
  const legs = [-1, 1].map(side => {
    const hip = joint('hip joint', body, side * .14, .86);
    capsule('trouser thigh hit volume', hip, soldier.uniform, .40, .18, -.20);
    detail('cargo pocket', hip, soldier.uniform, side * .092, -.21, .014, .035, .15, .13);
    detail('cargo pocket flap', hip, soldier.webbing, side * .11, -.16, .014, .008, .018, .13);
    const knee = joint('knee joint', hip, 0, -.4);
    capsule('trouser shin hit volume', knee, soldier.uniform, .40, .14, -.20);
    ellipsoid('creased fabric over knee', knee, soldier.uniform, 0, -.02, 0, .155, .14, .145);
    ellipsoid('shaped knee pad', knee, soldier.rubber, 0, -.035, -.063, .115, .14, .045);
    const ankle = joint('ankle joint', knee, 0, -.4);
    const boot = roundedBox('walking boot', .18, .11, .29, .022, scene);
    boot.position.set(0, 0, -.045); hit(boot, ankle, soldier.rubber);
    detail('boot cuff', ankle, soldier.uniform, 0, .065, .013, .15, .09, .13);
    detail('boot sole welt', ankle, soldier.webbing, 0, -.043, -.045, .177, .018, .285);
    for (let lace = 0; lace < 3; lace++) detail('boot lace', ankle, soldier.webbing, 0, .057, -.09 + lace * .025, .085, .007, .009);
    return { hip, knee, ankle };
  });
  const belt = roundedBox('waist belt hit volume', .4, .13, .23, .025, scene); belt.position.y = .87;
  hit(belt, body, soldier.vest);
  detail('belt buckle', body, soldier.metal, 0, .87, -.124, .063, .045, .018);
  detail('utility pouch', body, soldier.vest, .225, .90, .04, .065, .14, .12);
  // Preserve the original lathed torso hit volume. Its slimmer visible garment is independent of hit testing.
  const torso = MeshBuilder.CreateLathe('formed enemy torso', { shape: [new Vector3(0, 0, 0), new Vector3(.19, 0, 0), new Vector3(.22, .18, 0), new Vector3(.28, .43, 0), new Vector3(.3, .55, 0), new Vector3(.25, .63, 0), new Vector3(.15, .7, 0), new Vector3(0, .7, 0)], tessellation: 32 }, scene);
  torso.position.y = .83; torso.scaling.z = .5; hit(torso, upperBody, soldier.uniform, false, false);
  const jacket = MeshBuilder.CreateLathe('tailored field jacket', { shape: [new Vector3(0, 0, 0), new Vector3(.19, 0, 0), new Vector3(.175, .12, 0), new Vector3(.21, .32, 0), new Vector3(.235, .47, 0), new Vector3(.21, .55, 0), new Vector3(.12, .60, 0), new Vector3(0, .60, 0)], tessellation: 24 }, scene);
  jacket.position.y = .9; jacket.scaling.z = .57; decor(jacket, upperBody, soldier.uniform);
  for (const side of [-1, 1]) ellipsoid('shaped jacket shoulder', upperBody, soldier.uniform, side * .245, 1.43, 0, .19, .17, .19);
  ellipsoid('jacket collar', upperBody, soldier.uniform, 0, 1.49, 0, .27, .09, .21);
  detail('front shaped plate carrier', upperBody, soldier.vest, 0, 1.23, -.133, .37, .40, .058);
  detail('rear plate carrier', upperBody, soldier.vest, 0, 1.24, .134, .35, .38, .055);
  for (const side of [-1, 1]) {
    detail('shoulder strap front', upperBody, soldier.webbing, side * .125, 1.42, -.125, .045, .15, .022);
    detail('shoulder strap back', upperBody, soldier.webbing, side * .125, 1.42, .13, .045, .15, .022);
    detail('shoulder strap bridge', upperBody, soldier.webbing, side * .125, 1.49, 0, .045, .025, .26);
    detail('vest side webbing', upperBody, soldier.webbing, side * .216, 1.13, 0, .02, .075, .23);
  }
  for (let column = -1; column <= 1; column++) {
    detail('magazine pouch', upperBody, soldier.vest, column * .109, 1.14, -.188, .094, .15, .065);
    detail('pouch retention strap', upperBody, soldier.webbing, column * .109, 1.16, -.225, .026, .12, .008);
  }
  for (const y of [1.33, 1.37]) detail('stitched chest webbing', upperBody, soldier.webbing, 0, y, -.165, .27, .012, .006);
  detail('subdued team patch', upperBody, soldier.marker, 0, 1.39, -.17, .063, .038, .007);
  detail('rear team patch', upperBody, soldier.marker, 0, 1.38, .167, .075, .037, .007);
  const arms = [-1, 1].map(side => {
    const shoulder = joint('shoulder joint', upperBody, side * .32, 1.43);
    capsule('upper sleeve hit volume', shoulder, soldier.uniform, .30, .15, -.15);
    detail('sleeve seam', shoulder, soldier.webbing, 0, -.19, -.075, .014, .09, .006);
    const elbow = joint('elbow joint', shoulder, 0, -.29);
    capsule('rolled sleeve hit volume', elbow, soldier.uniform, .28, .13, -.14);
    detail('cuff', elbow, soldier.webbing, 0, -.25, 0, .138, .035, .133);
    capsule('gloved hand hit volume', elbow, soldier.rubber, .15, .13, -.31);
    const glove = joint('rifle gripping glove', elbow, 0, -.28);
    // The legacy capsule remains the hit volume; visible finger/knuckle shapes add no new targets.
    detail('glove knuckle panel', glove, soldier.vest, 0, -.008, .012, .10, .053, .085);
    for (let finger = 0; finger < 3; finger++) detail('glove fingers', glove, soldier.rubber, -.03 + finger * .03, -.03, -.037, .024, .046, .05);
    return { shoulder, elbow, glove, side };
  });
  const neckVolume = roundedBox('enemy neck', .1, .13, .1, .02, scene); neckVolume.position.y = 1.58;
  hit(neckVolume, upperBody, soldier.skin);
  ellipsoid('high fabric neck gaiter', upperBody, soldier.vest, 0, 1.585, .008, .145, .18, .14);
  const neck = joint('head turn', upperBody, 0, 1.8);
  const head = MeshBuilder.CreateSphere('head target', { diameter: .32, segments: 24 }, scene);
  head.scaling.z = .75; hit(head, neck, soldier.skin, true);
  ellipsoid('matte tactical helmet crown', neck, soldier.helmet, 0, .060, .013, .318, .22, .245);
  detail('helmet front rim', neck, soldier.rubber, 0, .006, -.115, .255, .028, .028);
  detail('helmet mounting rail', neck, soldier.metal, .146, .032, .018, .012, .035, .095);
  detail('helmet side strap left', neck, soldier.webbing, -.13, -.053, -.018, .018, .11, .018);
  detail('helmet side strap right', neck, soldier.webbing, .13, -.053, -.018, .018, .11, .018);
  ellipsoid('fabric lower-face mask', neck, soldier.vest, 0, -.075, -.085, .23, .13, .088);
  for (const side of [-1, 1]) {
    ellipsoid('ballistic lens', neck, soldier.lens, side * .065, -.014, -.114, .109, .046, .018);
    detail('goggle frame', neck, soldier.rubber, side * .065, .013, -.111, .117, .01, .015);
  }
  detail('goggle bridge', neck, soldier.rubber, 0, -.008, -.124, .025, .023, .013);
  geometry.flush();
  const gun = buildBotWeapon(scene, upperBody, shadows, soldier.metal, soldier.rubber, enemyFlash);
  let aimBlend = 0, torsoYaw = 0, frameDt = 1 / 120;
  const setCombatPose = (aiming: boolean, yaw: number, pitch: number, shotAge: number, reloading = false, reloadProgress = 0, boltProgress = 0) => {
    const mix = 1 - Math.exp(-frameDt * 15);
    aimBlend += ((aiming ? 1 : 0) - aimBlend) * mix;
    const relativeYaw = aiming ? yaw - patrol.heading : 0;
    torsoYaw += Math.atan2(Math.sin(relativeYaw - torsoYaw), Math.cos(relativeYaw - torsoYaw)) * mix;
    upperBody.rotation.y = torsoYaw;
    const reloadDip = reloading ? Math.sin(Math.PI * Math.max(0, Math.min(1, reloadProgress))) : 0;
    const kick = shotAge >= 0 && shotAge < .25 ? Math.exp(-shotAge * 18) : 0;
    gun.root.position.set(.10, 1.24 + aimBlend * .27 - reloadDip * .15, -.10 - aimBlend * .07 + kick * .035);
    gun.root.rotation.set(-.64 * (1 - aimBlend) + pitch * aimBlend - reloadDip * .32 + kick * .025, 0, -.18 * (1 - aimBlend) - reloadDip * .12);
    gun.updateBolt(boltProgress);
    gun.flash.setEnabled(aiming && shotAge >= 0 && shotAge < .05);
    const support = rifleContact(gun.root, new Vector3(-.025, .017, -.16));
    const trigger = rifleContact(gun.root, new Vector3(.013, -.085, .12));
    // The supporting hand moves to the magazine during reload; the trigger hand works the bolt.
    if (reloadDip > 0) support.z += reloadDip * .10;
    if (boltProgress > 0 && boltProgress < 1) {
      const cycle = Math.sin(Math.PI * boltProgress);
      trigger.y += cycle * .14; trigger.z += cycle * .055;
    }
    poseArm(arms[0].shoulder, arms[0].elbow, arms[0].glove, support, -1, gun.root);
    poseArm(arms[1].shoulder, arms[1].elbow, arms[1].glove, trigger, 1, gun.root);
    // A slight cheek lean toward the optic makes acquisition readable from the front and flank.
    neck.position.x = aimBlend * .045; neck.rotation.z = -aimBlend * .11;
    neck.rotation.x = pitch * aimBlend * .65;
    neck.rotation.y *= 1 - aimBlend;
  };
  let blend = 0;
  const pose = (now: number) => {
    const gait = walkingPose(patrol.travel, blend);
    root.position.set(patrol.x, home.y, patrol.z); root.rotation.y = patrol.heading;
    body.position.y = gait.bob + .008; body.rotation.x = gait.lean;
    const angles = [gait.leftLeg, gait.rightLeg], knees = [gait.leftKnee, gait.rightKnee];
    legs.forEach((leg, i) => {
      leg.hip.rotation.x = angles[i]; leg.knee.rotation.x = knees[i];
      leg.ankle.rotation.x = -angles[i] - knees[i] - gait.lean;
    });

    neck.rotation.y = Math.sin(now * .7 + index * 1.8) * .12 * (1 - blend);
  };
  let target: Soldier;
  const reset = () => { if (target) target.health = TARGET_HEALTH; resetPatrol(patrol); blend = 0; aimBlend = 0; torsoYaw = 0; pose(0); setCombatPose(false, 0, 0, Infinity); };
  target = { root, home, meshes, index, aimAmount: () => aimBlend, weaponRoot: gun.root, health: TARGET_HEALTH, respawnAt: 0, patrol, reset, setCombatPose,
    animate: (dt, now) => { frameDt = dt; blend += ((patrol.walking ? 1 : 0) - blend) * Math.min(1, dt * 10); pose(now); } };
  reset();
  if (replayOnly) { root.getChildMeshes().forEach(mesh => { mesh.isPickable = false; mesh.metadata = null; }); root.setEnabled(false); }
  return target;
}
