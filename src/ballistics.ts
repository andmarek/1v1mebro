import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Ray } from '@babylonjs/core/Culling/ray';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';

export type CoverMaterial = 'metal' | 'wood' | 'concrete' | 'sand';
export const TARGET_HEALTH = 100;
export const BODY_DAMAGE = 150;
export type Triangle = { a: Vector3; b: Vector3; c: Vector3; normal: Vector3 };
export type SurfaceGeometry = { triangles: Triangle[]; min: Vector3; max: Vector3 };
export type CoverSurface = { material: CoverMaterial; geometry: SurfaceGeometry[]; shell?: number };
export type SurfaceHit = { distance: number; point: Vector3; normal: Vector3; geometry: SurfaceGeometry };
export type CoverCrossing = { surface: CoverSurface; entry: SurfaceHit; exit?: SurfaceHit; inside: boolean };
export type CoverImpact = { hit: SurfaceHit; material: CoverMaterial; exit: boolean };

/** Cache world-space geometry once, before render meshes are merged and disposed. */
export function captureGeometry(mesh: Mesh): SurfaceGeometry {
  const world = mesh.computeWorldMatrix(true);
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind)!;
  const indices = mesh.getIndices()!;
  const vertices: Vector3[] = [], vertexNormals: Vector3[] = [];
  const min = new Vector3(Infinity, Infinity, Infinity), max = min.scale(-1);
  for (let i = 0; i < positions.length; i += 3) {
    const point = Vector3.TransformCoordinates(Vector3.FromArray(positions, i), world);
    vertices.push(point); vertexNormals.push(Vector3.TransformNormal(Vector3.FromArray(normals, i), world).normalize());
    min.minimizeInPlace(point); max.maximizeInPlace(point);
  }
  const triangles: Triangle[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i], ib = indices[i + 1], ic = indices[i + 2];
    const a = vertices[ia], b = vertices[ib], c = vertices[ic];
    const normal = Vector3.Cross(b.subtract(a), c.subtract(a));
    if (normal.lengthSquared() < 1e-14) continue;
    normal.normalize();
    if (Vector3.Dot(normal, vertexNormals[ia].add(vertexNormals[ib]).add(vertexNormals[ic])) < 0) normal.scaleInPlace(-1);
    triangles.push({ a, b, c, normal });
  }
  return { triangles, min, max };
}

export function traceCover(ray: Ray, surfaces: CoverSurface[]): CoverCrossing[] {
  const result: CoverCrossing[] = [];
  for (const surface of surfaces) {
    const intersections: SurfaceHit[] = [];
    for (const geometry of surface.geometry) {
      if (!ray.intersectsBoxMinMax(geometry.min, geometry.max)) continue;
      for (const triangle of geometry.triangles) {
        const intersection = ray.intersectsTriangle(triangle.a, triangle.b, triangle.c);
        if (!intersection || intersection.distance < .0001) continue;
        intersections.push({ distance: intersection.distance, point: ray.origin.add(ray.direction.scale(intersection.distance)), normal: triangle.normal, geometry });
      }
    }
    intersections.sort((a, b) => a.distance - b.distance);
    if (!intersections.length) continue;
    // Duplicate hits on triangle seams count as one surface. Shell assemblies include their ribs and fittings.
    const unique = intersections.filter((hit, i) => !i || hit.distance - intersections[i - 1].distance > .0001);
    const first = unique[0], inside = Vector3.Dot(first.normal, ray.direction) > .0001;
    const entry = inside ? { ...first, distance: 0, point: ray.origin.clone(), normal: ray.direction.scale(-1) } : first;
    const exit = inside ? first : unique.slice(1).reverse().find(hit => Vector3.Dot(hit.normal, ray.direction) > .0001);
    result.push({ surface, entry, exit, inside });
  }
  return result.sort((a, b) => a.entry.distance - b.entry.distance);
}

/** A finite energy budget; decorative corrugations and an empty container's air are not extra walls. */
export function resolveCover(crossings: CoverCrossing[], direction: Vector3, targetDistance = Infinity, initialEnergy = 1) {
  let energy = initialEnergy, penetrations = 0;
  const impacts: CoverImpact[] = [], materials: CoverMaterial[] = [];
  let stopped: CoverMaterial | null = null;
  for (const crossing of crossings) {
    const { surface, entry, exit, inside } = crossing;
    if (entry.distance >= targetDistance) break;
    if (!inside) impacts.push({ hit: entry, material: surface.material, exit: false });
    const hard = surface.material === 'concrete' || surface.material === 'sand';
    if (hard || !exit || exit.distance >= targetDistance || penetrations >= 4) { stopped = surface.material; energy = 0; break; }
    const incidence = (hit: SurfaceHit) => Math.max(.08, Math.abs(Vector3.Dot(hit.normal, direction)));
    const thickness = surface.shell !== undefined
      ? surface.shell * ((inside ? 0 : 1 / incidence(entry)) + 1 / incidence(exit))
      : exit.distance - entry.distance;
    const metal = surface.material === 'metal';
    const loss = metal ? .16 + 9 * thickness : .2 + 1.7 * thickness;
    if (thickness > (metal ? .12 : .65) || energy - loss < .05 - 1e-8) { stopped = surface.material; energy = 0; break; }
    energy -= loss; penetrations++; materials.push(surface.material);
    impacts.push({ hit: exit, material: surface.material, exit: true });
  }
  return { energy, penetrations, impacts, materials, stopped };
}

export function bulletDamage(energy: number, head: boolean, baseDamage = BODY_DAMAGE) { return Math.round(baseDamage * (head ? 2 : 1) * energy); }

/** Project onto real triangles, clipping around corners instead of floating a square above the surface. */
export function projectImpact(hit: SurfaceHit, size: number, angle: number) {
  const normal = hit.normal;
  const tangent = Vector3.Cross(Math.abs(normal.y) < .9 ? Vector3.Up() : Vector3.Right(), normal).normalize();
  const bitangent = Vector3.Cross(normal, tangent).normalize();
  const u = tangent.scale(Math.cos(angle)).add(bitangent.scale(Math.sin(angle)));
  const v = Vector3.Cross(normal, u).normalize();
  type Vertex = { point: Vector3; local: Vector3 };
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const radius = size / 2, depth = Math.min(.055, size / 3);
  const limits: [keyof Pick<Vector3, 'x' | 'y' | 'z'>, number, number][] = [['x', 1, radius], ['x', -1, radius], ['y', 1, radius], ['y', -1, radius], ['z', 1, depth], ['z', -1, depth]];
  for (const triangle of hit.geometry.triangles) {
    if (Vector3.Dot(triangle.normal, normal) < .2) continue;
    let polygon: Vertex[] = [triangle.a, triangle.b, triangle.c].map(point => {
      const delta = point.subtract(hit.point);
      return { point, local: new Vector3(Vector3.Dot(delta, u), Vector3.Dot(delta, v), Vector3.Dot(delta, normal)) };
    });
    for (const [axis, sign, limit] of limits) {
      const clipped: Vertex[] = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        const da = a.local[axis] * sign - limit, db = b.local[axis] * sign - limit;
        if (da <= 0) clipped.push(a);
        if ((da <= 0) !== (db <= 0)) {
          const t = da / (da - db);
          clipped.push({ point: Vector3.Lerp(a.point, b.point, t), local: Vector3.Lerp(a.local, b.local, t) });
        }
      }
      polygon = clipped; if (polygon.length < 3) break;
    }
    if (polygon.length < 3) continue;
    const start = positions.length / 3;
    for (const vertex of polygon) {
      const point = vertex.point.add(triangle.normal.scale(.002));
      positions.push(point.x, point.y, point.z); normals.push(triangle.normal.x, triangle.normal.y, triangle.normal.z);
      uvs.push(vertex.local.x / size + .5, vertex.local.y / size + .5);
    }
    for (let i = 1; i < polygon.length - 1; i++) indices.push(start, start + i, start + i + 1);
  }
  return { positions, normals, uvs, indices };
}
