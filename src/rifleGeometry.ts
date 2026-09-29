import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';

/** Rounded machined edges with smooth normals and UVs on all six faces. */
export function roundedBox(name: string, width: number, height: number, depth: number, bevel: number, scene: Scene): Mesh {
  const half = [width / 2, height / 2, depth / 2];
  const radius = Math.max(0.0001, Math.min(bevel, ...half.map(h => h * 0.9)));
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const faces = [
    { axis: 0, sign: 1, u: 1, v: 2 }, { axis: 0, sign: -1, u: 2, v: 1 },
    { axis: 1, sign: 1, u: 2, v: 0 }, { axis: 1, sign: -1, u: 0, v: 2 },
    { axis: 2, sign: 1, u: 0, v: 1 }, { axis: 2, sign: -1, u: 1, v: 0 },
  ];
  const samples = (h: number) => [-h, -h + radius * 0.25, -h + radius, h - radius, h - radius * 0.25, h];
  for (const face of faces) {
    const us = samples(half[face.u]), vs = samples(half[face.v]), offset = positions.length / 3;
    for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
      const p = [0, 0, 0]; p[face.axis] = half[face.axis] * face.sign; p[face.u] = us[i]; p[face.v] = vs[j];
      const inner = p.map((value, axis) => Math.max(-half[axis] + radius, Math.min(half[axis] - radius, value)));
      const delta = p.map((value, axis) => value - inner[axis]), length = Math.hypot(...delta);
      const n = delta.map(value => value / length);
      positions.push(...inner.map((value, axis) => value + n[axis] * radius)); normals.push(...n);
      uvs.push((us[i] + half[face.u]) / (2 * half[face.u]), (vs[j] + half[face.v]) / (2 * half[face.v]));
    }
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
      const a = offset + j * 6 + i, b = a + 1, c = a + 6, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const data = new VertexData(); data.positions = positions; data.normals = normals; data.uvs = uvs; data.indices = indices;
  const mesh = new Mesh(name, scene); data.applyToMesh(mesh); return mesh;
}
