import { afterAll, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Ray } from '@babylonjs/core/Culling/ray';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { roundedBox } from './rifleGeometry';
import { jerseyBarrier } from './arenaGeometry';
import { bulletDamage, captureGeometry, projectImpact, resolveCover, traceCover, type CoverMaterial, type CoverSurface } from './ballistics';

const engine = new NullEngine(), scene = new Scene(engine);
afterAll(() => engine.dispose());
function panel(material: CoverMaterial, depth: number, z = 3, angle = 0): CoverSurface {
  const mesh = roundedBox('test panel', 4, 3, depth, Math.min(.02, depth * .1), scene);
  mesh.position.set(0, 1.5, z); mesh.rotation.y = angle;
  const geometry = captureGeometry(mesh); mesh.dispose();
  return { material, geometry: [geometry] };
}
const ray = (origin = new Vector3(0, 1.5, 0), direction = Vector3.Forward(), length = 20) => new Ray(origin, direction, length);
const shot = (surfaces: CoverSurface[], distance = 10, r = ray()) => resolveCover(traceCover(r, surfaces), r.direction, distance);

describe('cover penetration and damage', () => {
  it('keeps direct body and head shots lethal, and cover behind the enemy has no effect', () => {
    expect(bulletDamage(shot([], 2).energy, false)).toBe(150);
    expect(bulletDamage(shot([], 2).energy, true)).toBe(300);
    expect(shot([panel('concrete', 1)], 2).energy).toBe(1);
  });
  it('makes a body shot through a thin metal panel survivable, but its headshot lethal', () => {
    const result = shot([panel('metal', .035)]);
    expect(result.penetrations).toBe(1); expect(result.stopped).toBeNull();
    expect(bulletDamage(result.energy, false)).toBe(79);
    expect(bulletDamage(result.energy, true)).toBe(158);
    expect(result.impacts.map(mark => mark.exit)).toEqual([false, true]);
    expect(result.impacts[0].hit.point.z).toBeCloseTo(3 - .035 / 2);
    expect(result.impacts[1].hit.point.z).toBeCloseTo(3 + .035 / 2);
    expect(result.impacts[0].hit.normal.z).toBeCloseTo(-1);
    expect(result.impacts[1].hit.normal.z).toBeCloseTo(1);
    // Enemy health persists between hits; a second equivalent hit eliminates it.
    expect(Math.max(0, 100 - bulletDamage(result.energy, false) * 2)).toBe(0);
  });
  it('gives the pistol lighter direct damage and a smaller penetration budget', () => {
    const r = ray(), energy = .35;
    const direct = resolveCover([], r.direction, 10, energy);
    expect(bulletDamage(direct.energy / energy, false, 35)).toBe(35);
    expect(bulletDamage(direct.energy / energy, true, 35)).toBe(70);
    const stopped = resolveCover(traceCover(r, [panel('metal', .035)]), r.direction, 10, energy);
    expect(stopped.energy).toBe(0); expect(stopped.impacts.map(i => i.exit)).toEqual([false]);
    const thin = resolveCover(traceCover(r, [panel('wood', .02)]), r.direction, 10, energy);
    expect(thin.penetrations).toBe(1); expect(bulletDamage(thin.energy / energy, false, 35)).toBe(12);
  });
  it('distinguishes timber, concrete, and thick structural steel', () => {
    expect(bulletDamage(shot([panel('wood', .12)]).energy, false)).toBe(89);
    for (const [material, depth] of [['concrete', .5], ['metal', .3]] as const) {
      const result = shot([panel(material, depth)]);
      expect(result.energy).toBe(0); expect(result.stopped).toBe(material);
      expect(result.impacts).toHaveLength(1); expect(result.impacts[0].exit).toBe(false);
    }
  });
  it('loses more damage on an oblique path through the same panel', () => {
    const normal = shot([panel('metal', .035)]);
    const oblique = shot([panel('metal', .035, 3, Math.PI / 3)]);
    expect(oblique.energy).toBeLessThan(normal.energy);
    expect(oblique.impacts).toHaveLength(2);
    expect(oblique.impacts[0].hit.normal.x).not.toBeCloseTo(0);
  });
  it('stops after multiple layers exhaust the energy budget, without making a false exit hole', () => {
    const result = shot([panel('metal', .035, 5), panel('metal', .035, 2), panel('metal', .035, 4)]);
    expect(result.energy).toBe(0); expect(result.penetrations).toBe(2);
    expect(result.impacts).toHaveLength(5); expect(result.impacts.at(-1)!.exit).toBe(false);
    expect(result.impacts.at(-1)!.hit.point.z).toBeCloseTo(5 - .035 / 2);
  });
  it('counts an empty container as two sheets, not a solid block of metal or one wall per corrugation', () => {
    const container = panel('metal', 4); container.shell = .012;
    container.geometry.push(...panel('metal', .1, .98).geometry);
    const result = shot([container]);
    expect(result.penetrations).toBe(1); expect(result.impacts).toHaveLength(2);
    expect(bulletDamage(result.energy, false)).toBe(94);
    const longContainer = panel('metal', 8, 5); longContainer.shell = .012;
    expect(shot([longContainer]).energy).toBeCloseTo(result.energy);
  });
  it('ignores layers off the ray and requires an exit within the ray range', () => {
    const surface = panel('wood', .12);
    expect(shot([surface], 10, ray(new Vector3(8, 1.5, 0))).energy).toBe(1);
    expect(shot([surface], Infinity, ray(undefined, undefined, 2.98)).energy).toBe(0);
  });
  it('handles a shot originating inside a hollow shell without inventing an entry mark', () => {
    const container = panel('metal', 4); container.shell = .012;
    const result = shot([container], 10, ray(new Vector3(0, 1.5, 3)));
    expect(result.penetrations).toBe(1); expect(result.impacts.map(mark => mark.exit)).toEqual([true]);
    expect(result.energy).toBeCloseTo(1 - .16 - 9 * .012);
  });
});

describe('projected bullet marks', () => {
  it('leaves an outward-facing mark on the real sloped concrete barrier', () => {
    const mesh = jerseyBarrier('barrier', 4, scene); mesh.position.set(7, 0, -14);
    const surface: CoverSurface = { material: 'concrete', geometry: [captureGeometry(mesh)] }; mesh.dispose();
    const r = ray(new Vector3(0, 1.65, -23), new Vector3(Math.sin(.672) * Math.cos(.04), -Math.sin(.04), Math.cos(.672) * Math.cos(.04)));
    const result = shot([surface], Infinity, r);
    expect(result.stopped).toBe('concrete'); expect(result.impacts).toHaveLength(1);
    expect(Vector3.Dot(result.impacts[0].hit.normal, r.direction)).toBeLessThan(0);
    expect(projectImpact(result.impacts[0].hit, .27, .2).indices.length).toBeGreaterThan(0);
  });
  it('clips mark geometry to a real rotated face with bounded texture coordinates', () => {
    const r = ray(), crossing = traceCover(r, [panel('metal', .035, 3, .3)])[0];
    const data = projectImpact(crossing.entry, .2, .7);
    expect(data.indices.length).toBeGreaterThan(0);
    for (const uv of data.uvs) { expect(uv).toBeGreaterThanOrEqual(-1e-8); expect(uv).toBeLessThanOrEqual(1 + 1e-8); }
    for (let i = 0; i < data.positions.length; i += 3) {
      const point = Vector3.FromArray(data.positions, i);
      expect(Vector3.Dot(point.subtract(crossing.entry.point), crossing.entry.normal)).toBeCloseTo(.002, 4);
    }
  });
  it('uses the actual flat ground face and does not include back-facing triangles', () => {
    const mesh = MeshBuilder.CreateGround('floor', { width: 30, height: 30 }, scene);
    const surface: CoverSurface = { material: 'sand', geometry: [captureGeometry(mesh)] }; mesh.dispose();
    const r = ray(new Vector3(0, 2, 0), Vector3.Down());
    const result = shot([surface], Infinity, r);
    expect(result.stopped).toBe('sand'); expect(result.impacts).toHaveLength(1);
    expect(result.impacts[0].hit.normal.y).toBeCloseTo(1);
    const data = projectImpact(result.impacts[0].hit, .3, 0);
    expect(data.indices.length).toBeGreaterThan(0);
    for (let i = 1; i < data.positions.length; i += 3) expect(data.positions[i]).toBeCloseTo(.002);
  });
});
