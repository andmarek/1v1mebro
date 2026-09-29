import { Color3 } from '@babylonjs/core/Maths/math.color';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Material } from '@babylonjs/core/Materials/material';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { projectImpact, type CoverImpact, type CoverMaterial } from './ballistics';

export const IMPACT_LIMIT = 64;
export const IMPACT_LIFETIME = 30;

function impactMaterial(scene: Scene, kind: CoverMaterial) {
  const texture = new DynamicTexture(`${kind} bullet-hole texture`, 256, scene, true);
  texture.hasAlpha = true;
  const c = texture.getContext() as CanvasRenderingContext2D;
  let seed = kind === 'metal' ? 514 : kind === 'wood' ? 873 : 291;
  const rand = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  const ring = (radius: number, spread: number, fill: string | CanvasGradient, stretch = 1) => {
    c.beginPath();
    for (let i = 0; i <= 45; i++) {
      const angle = i / 45 * Math.PI * 2, r = radius + (rand() - .5) * spread;
      const x = 128 + Math.cos(angle) * r, y = 128 + Math.sin(angle) * r * stretch;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.closePath(); c.fillStyle = fill; c.fill();
  };
  c.clearRect(0, 0, 256, 256);
  const soot = c.createRadialGradient(128, 128, 12, 128, 128, 106);
  soot.addColorStop(0, 'rgba(15,12,9,.85)'); soot.addColorStop(.38, 'rgba(30,23,16,.44)'); soot.addColorStop(1, 'rgba(25,20,14,0)');
  c.fillStyle = soot; c.fillRect(0, 0, 256, 256);
  if (kind === 'wood') {
    for (let i = 0; i < 32; i++) {
      const x = 105 + rand() * 46, y = 103 + rand() * 50;
      c.strokeStyle = i % 2 ? 'rgba(209,169,101,.8)' : 'rgba(56,34,14,.85)'; c.lineWidth = 1 + rand() * 3;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rand() - .5) * 17, y + (rand() - .5) * 145); c.stroke();
    }
    ring(37, 22, '#ad8049', 1.32); ring(28, 17, '#563a20', 1.3);
  } else if (kind === 'metal') {
    ring(46, 27, 'rgba(85,62,40,.8)'); ring(34, 17, '#b0aaa0');
    ring(28, 13, '#534c42');
    for (let i = 0; i < 14; i++) {
      const a = rand() * Math.PI * 2, radius = 30 + rand() * 30;
      c.strokeStyle = i % 2 ? '#c3bdb0' : '#2c2822'; c.lineWidth = 1 + rand() * 2;
      c.beginPath(); c.moveTo(128 + Math.cos(a) * 17, 128 + Math.sin(a) * 17); c.lineTo(128 + Math.cos(a) * radius, 128 + Math.sin(a) * radius); c.stroke();
    }
  } else {
    for (let i = 0; i < 12; i++) {
      const a = rand() * Math.PI * 2, radius = 47 + rand() * 58;
      c.strokeStyle = 'rgba(47,39,28,.72)'; c.lineWidth = .8 + rand() * 1.8;
      c.beginPath(); c.moveTo(128 + Math.cos(a) * 25, 128 + Math.sin(a) * 25);
      c.lineTo(128 + Math.cos(a + .12) * radius * .65, 128 + Math.sin(a + .12) * radius * .65);
      c.lineTo(128 + Math.cos(a) * radius, 128 + Math.sin(a) * radius); c.stroke();
    }
    ring(48, 27, '#a89b83'); ring(34, 16, '#655744');
  }
  for (let i = 0; i < 110; i++) {
    const a = rand() * Math.PI * 2, r = 30 + rand() * 65;
    c.fillStyle = i % 2 ? 'rgba(203,188,158,.5)' : 'rgba(35,28,18,.5)';
    c.fillRect(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 1 + rand() * 3, 1 + rand() * 3);
  }
  ring(21, 10, '#17130f', kind === 'wood' ? 1.3 : 1);
  const hole = c.createRadialGradient(122, 121, 2, 128, 128, 25);
  hole.addColorStop(0, '#030403'); hole.addColorStop(.65, '#0b0c0a'); hole.addColorStop(1, '#30271d');
  ring(17, 5, hole);
  texture.update();
  const material = new StandardMaterial(`${kind} impact decal`, scene);
  material.diffuseTexture = texture; material.useAlphaFromDiffuseTexture = true;
  material.transparencyMode = Material.MATERIAL_ALPHATEST;
  material.backFaceCulling = false; material.specularColor = Color3.Black();
  material.zOffset = -1; material.zOffsetUnits = -1;
  return material;
}

/** At most 64 mesh/geometry objects and three shared textures, regardless of how long the range runs. */
export class ImpactMarks {
  private readonly pool: { mesh: Mesh; until: number }[] = [];
  private readonly materials: Record<'metal' | 'wood' | 'concrete', StandardMaterial>;
  enabled = true;
  constructor(private readonly scene: Scene) {
    this.materials = { metal: impactMaterial(scene, 'metal'), wood: impactMaterial(scene, 'wood'), concrete: impactMaterial(scene, 'concrete') };
  }
  clear() { this.pool.forEach(mark => { mark.mesh.setEnabled(false); mark.until = 0; }); }
  setEnabled(enabled: boolean) { this.enabled = enabled; if (!enabled) this.clear(); }
  stamp(impact: CoverImpact, now: number) {
    if (!this.enabled) return;
    const material = impact.material === 'sand' ? 'concrete' : impact.material;
    const size = (material === 'metal' ? .18 : material === 'wood' ? .22 : .27) * (impact.exit ? 1.25 : 1);
    const data = projectImpact(impact.hit, size, Math.random() * Math.PI * 2);
    if (!data.indices.length) return;
    let mark = this.pool.find(item => !item.until || item.until <= now);
    if (!mark && this.pool.length < IMPACT_LIMIT) {
      const mesh = new Mesh('projected bullet hole', this.scene);
      mesh.isPickable = false; mesh.receiveShadows = true;
      mark = { mesh, until: 0 }; this.pool.push(mark);
    }
    mark ??= this.pool.reduce((oldest, item) => item.until < oldest.until ? item : oldest);
    const vertices = new VertexData(); Object.assign(vertices, data); vertices.applyToMesh(mark.mesh, true);
    mark.mesh.material = this.materials[material]; mark.mesh.setEnabled(true); mark.until = now + IMPACT_LIFETIME;
  }
  update(now: number) { this.pool.forEach(mark => { if (mark.until && now >= mark.until) { mark.mesh.setEnabled(false); mark.until = 0; } }); }
}
