import { describe, expect, it } from 'vitest';
import { BotCombat, hitsPlayer, PlayerLife, type BotShot } from './botCombat';
import type { BotSnapshot, PlayerSnapshot } from './match';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { botFlashMaterial, buildBotWeapon } from './botWeapon';

const bot = (id = 0, z = 0): BotSnapshot => ({ id, x: 0, y: 0, z, alive: true });
const player = (z = 15): PlayerSnapshot => ({ x: 0, y: 0, z, height: 1.75, alive: true });
function simulate(combat: BotCombat, seconds: number, bots = [bot()], p = player(), canSee = () => true, start = 0) {
  const shots: { shot: BotShot; time: number }[] = [];
  for (let i = 0; i <= seconds * 120; i++) {
    const time = start + i / 120;
    for (const shot of combat.update(time, 1 / 120, bots, p, true, canSee)) shots.push({ shot, time });
  }
  return shots;
}

describe('player life', () => {
  it('ignores spawn protection, invalid damage, and damage after death', () => {
    const life = new PlayerLife();
    expect(life.damage(100, 2.99)).toBe(false); expect(life.health).toBe(100);
    for (const damage of [-1, 0, Infinity, NaN]) life.damage(damage, 3);
    expect(life.health).toBe(100);
    expect(life.damage(18, 3)).toBe(false); expect(life.health).toBe(82);
    expect(life.damage(90, 3.1)).toBe(true); expect(life.health).toBe(0);
    expect(life.deaths).toBe(1); expect(life.alive).toBe(false);
    expect(life.damage(100, 4)).toBe(false); expect(life.deaths).toBe(1);
  });
  it('respawns once after two seconds, restores health, and protects for three seconds', () => {
    const life = new PlayerLife(); life.damage(100, 4);
    expect(life.update(5.999)).toBe(false); expect(life.update(6)).toBe(true);
    expect(life.health).toBe(100); expect(life.alive).toBe(true); expect(life.update(6)).toBe(false);
    life.damage(100, 8.999); expect(life.health).toBe(100);
    expect(life.damage(100, 9)).toBe(true); expect(life.deaths).toBe(2);
    life.reset(15); expect(life.deaths).toBe(0); expect(life.health).toBe(100); expect(life.protectedUntil).toBe(18);
  });
});

describe('bot combat', () => {
  it('requires line of sight and stays within acquisition range', () => {
    const combat = new BotCombat();
    expect(simulate(combat, 3, [bot()], player(), () => false)).toHaveLength(0);
    expect(combat.pose(0, 3).aiming).toBe(false);
    expect(simulate(new BotCombat(), 3, [bot()], player(40))).toHaveLength(0);
  });
  it('has a reaction delay and limits fire rate without catch-up volleys', () => {
    const combat = new BotCombat(), shots = simulate(combat, 4);
    expect(shots.length).toBeGreaterThan(2); expect(shots[0].time).toBeGreaterThanOrEqual(.55);
    for (let i = 1; i < shots.length; i++) expect(shots[i].time - shots[i - 1].time).toBeGreaterThanOrEqual(.72);
    expect(combat.update(100, 96, [bot()], player(), true, () => true).length).toBeLessThanOrEqual(1);
    expect(shots.every(({ shot }) => shot.damage === 18)).toBe(true);
  });
  it('rechecks cover immediately before firing, even between cached sight checks', () => {
    const combat = new BotCombat(); let blockOnSecondCheck = false, checks = 0;
    const sight = () => { checks++; return !blockOnSecondCheck || checks === 1; };
    combat.update(0, .01, [bot()], player(), true, sight);
    combat.update(.70, .01, [bot()], player(), true, () => true);
    blockOnSecondCheck = true; checks = 0;
    // At 1s a cached acquisition check passes, but the firing-time check sees fresh cover.
    expect(combat.update(1, .01, [bot()], player(), true, sight)).toHaveLength(0);
    expect(checks).toBe(2); expect(combat.pose(0, 1).aiming).toBe(false);
  });
  it('clears acquisition when disabled, a bot dies, or the player dies', () => {
    const combat = new BotCombat(); simulate(combat, 1);
    expect(combat.pose(0, 1).aiming).toBe(true);
    expect(combat.update(1.1, .01, [bot()], player(), false, () => true)).toHaveLength(0);
    expect(combat.pose(0, 1.1).aiming).toBe(false);
    combat.update(2, .01, [bot()], player(), true, () => true);
    expect(combat.update(2.2, .01, [{ ...bot(), alive: false }], player(), true, () => true)).toHaveLength(0);
    expect(combat.pose(0, 2.2).aiming).toBe(false);
    combat.update(3, .01, [bot()], player(), true, () => true);
    combat.update(3.2, .01, [bot()], { ...player(), alive: false }, true, () => true);
    expect(combat.pose(0, 3.2).aiming).toBe(false);
    expect(simulate(combat, .5, [bot()], player(), () => true, 4)).toHaveLength(0);
  });
  it('requires a new reaction after losing line of sight', () => {
    const combat = new BotCombat(); simulate(combat, 1);
    combat.update(1.2, .01, [bot()], player(), true, () => false);
    expect(combat.pose(0, 1.2).aiming).toBe(false);
    expect(simulate(combat, .5, [bot()], player(), () => true, 1.4)).toHaveLength(0);
    expect(simulate(combat, 1, [bot()], player(), () => true, 1.91).length).toBeGreaterThan(0);
  });
  it('limits nine visible bots to three attackers and staggers sight work', () => {
    const combat = new BotCombat(), bots = Array.from({ length: 9 }, (_, id) => ({ ...bot(id), x: id - 4 }));
    let checks = 0;
    combat.update(0, 1 / 120, bots, player(), true, () => { checks++; return true; });
    expect(checks).toBe(1);
    const shots = simulate(combat, 3, bots);
    expect(new Set(shots.map(({ shot }) => shot.botId)).size).toBe(3);
    expect(bots.filter(b => combat.pose(b.id, 3).aiming)).toHaveLength(3);
    const atOneTime = new Map<number, number>();
    for (const { time } of shots) atOneTime.set(time, (atOneTime.get(time) ?? 0) + 1);
    expect(Math.max(...atOneTime.values())).toBeLessThanOrEqual(3);
  });
  it('uses seeded imperfect aim with both real hits and misses at range', () => {
    const shots = simulate(new BotCombat(123), 30, [bot()], player(25));
    expect(shots.some(({ shot }) => shot.hit)).toBe(true);
    expect(shots.some(({ shot }) => !shot.hit)).toBe(true);
    expect(shots).toEqual(simulate(new BotCombat(123), 30, [bot()], player(25)));
    for (const { shot } of shots) expect(Math.hypot(shot.direction.x, shot.direction.y, shot.direction.z)).toBeCloseTo(1);
  });
  it('tests the actual player volume, accounting for crouch and missed directions', () => {
    const origin = { x: 0, y: 1.6, z: 0 }, direction = { x: 0, y: 0, z: 1 };
    expect(hitsPlayer(origin, direction, player())).toBe(true);
    expect(hitsPlayer(origin, direction, { ...player(), height: 1.05 })).toBe(false);
    expect(hitsPlayer(origin, { x: .4, y: 0, z: .92 }, player())).toBe(false);
    expect(hitsPlayer(origin, direction, { ...player(), alive: false })).toBe(false);
  });
});


describe('enemy carbine geometry', () => {
  it('batches at local coordinates and follows the bot without creating extra hitboxes', () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const parent = new TransformNode('test bot', scene); parent.position.set(12, 4, 7);
      const metal = new StandardMaterial('metal', scene), polymer = new StandardMaterial('polymer', scene);
      const shadowMeshes: unknown[] = [];
      const shadows = { addShadowCaster: (mesh: unknown) => { shadowMeshes.push(mesh); } } as unknown as ShadowGenerator;
      const gun = buildBotWeapon(scene, parent, shadows, metal, polymer, botFlashMaterial(scene));
      const meshes = gun.root.getChildMeshes();
      expect(meshes).toHaveLength(3); expect(shadowMeshes).toHaveLength(2);
      expect(meshes.every(mesh => !mesh.isPickable && mesh.metadata === null)).toBe(true);
      const barrel = meshes.find(mesh => mesh.name === 'patrol carbine / metal')!;
      barrel.computeWorldMatrix(true);
      const first = barrel.getBoundingInfo().boundingBox.centerWorld.clone();
      expect(first.x).toBeCloseTo(12, 1); expect(first.z).toBeGreaterThan(6); expect(first.z).toBeLessThan(8);
      parent.position.x += 8; barrel.computeWorldMatrix(true);
      expect(barrel.getBoundingInfo().boundingBox.centerWorld.x - first.x).toBeCloseTo(8);
      expect(gun.flash.isEnabled()).toBe(false);
    } finally { scene.dispose(); engine.dispose(); }
  });
});
