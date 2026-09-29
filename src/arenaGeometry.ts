import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { Scene } from '@babylonjs/core/scene';

/** Keep surface detail at a consistent world scale rather than stretching a whole photo across each wall. */
export function boxUVs(mesh: Mesh, width: number, height: number, depth: number, tile = 2.5) {
  const dims = [[height, depth], [depth, height], [depth, width], [width, depth], [width, height], [height, width]];
  const uv = mesh.getVerticesData(VertexBuffer.UVKind)!;
  for (let face = 0; face < 6; face++) for (let i = 0; i < 36; i++) {
    const index = (face * 36 + i) * 2;
    uv[index] *= dims[face][0] / tile; uv[index + 1] *= dims[face][1] / tile;
  }
  mesh.setVerticesData(VertexBuffer.UVKind, uv);
}

/** Sloped Jersey barrier, including inset shoulders and bevels on its cast edges. */
export function jerseyBarrier(name: string, width: number, scene: Scene) {
  const profile = [[-.59, 0], [-.65, .07], [-.65, .23], [-.39, .62], [-.27, 1.25], [-.2, 1.32],
    [.2, 1.32], [.27, 1.25], [.39, .62], [.65, .23], [.65, .07], [.59, 0]];
  const p: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let i = 0; i < profile.length; i++) {
    const a = profile[i], b = profile[(i + 1) % profile.length], off = p.length / 3;
    p.push(-width / 2, a[1], a[0], width / 2, a[1], a[0], -width / 2, b[1], b[0], width / 2, b[1], b[0]);
    uv.push(0, a[1] / 2, width / 2, a[1] / 2, 0, b[1] / 2, width / 2, b[1] / 2);
    indices.push(off, off + 2, off + 1, off + 1, off + 2, off + 3);
  }
  for (const side of [-1, 1]) {
    const off = p.length / 3; p.push(side * width / 2, .6, 0); uv.push(.5, .3);
    for (const point of profile) { p.push(side * width / 2, point[1], point[0]); uv.push(point[0] / 2 + .5, point[1] / 2); }
    for (let i = 0; i < profile.length; i++) {
      const a = off + 1 + i, b = off + 1 + (i + 1) % profile.length;
      indices.push(...(side === 1 ? [off, a, b] : [off, b, a]));
    }
  }
  // This profile's winding needs outward normals for lighting and surface impacts.
  const normals: number[] = []; VertexData.ComputeNormals(p, indices, normals, { useRightHandedSystem: true });
  const data = new VertexData(); data.positions = p; data.normals = normals; data.uvs = uv; data.indices = indices;
  const mesh = new Mesh(name, scene); data.applyToMesh(mesh); return mesh;
}

/** Continuous stratified ridge: a terrain silhouette rather than a ring of primitive spheres. */
export function desertRidge(scene: Scene) {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [], normals: number[] = [];
  const segments = 256, bands = 10;
  for (let ring = 0; ring <= bands; ring++) for (let i = 0; i <= segments; i++) {
    const a = i / segments * Math.PI * 2, t = ring / bands;
    const r = 65 + t * 100;
    const peak = 15 + 8 * Math.sin(a * 7 + .8) + 6 * Math.sin(a * 13) + 3 * Math.sin(a * 31);
    const h = Math.sin(t * Math.PI) ** 1.4 * (peak + Math.sin(a * 39 + t * 9) * 2.2) - 1;
    positions.push(Math.cos(a) * r, h, Math.sin(a) * r); uv.push(i * 30 / segments, t * 6);
    if (ring < bands && i < segments) {
      const index = ring * (segments + 1) + i;
      indices.push(index, index + 1, index + segments + 1, index + 1, index + segments + 2, index + segments + 1);
    }
  }
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData(); data.positions = positions; data.normals = normals; data.uvs = uv; data.indices = indices;
  const mesh = new Mesh('eroded desert escarpment', scene); data.applyToMesh(mesh); mesh.isPickable = false;
  return mesh;
}
