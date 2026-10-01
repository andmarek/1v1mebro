import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { ReplaySample } from './killReplay';

const STRIDE = 12; // position, quaternion, scale, local enabled, visibility
const blend = (a: number, b: number, t: number) => a + (b - a) * t;
const angle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/** Reuses the existing scene; captures local transforms so articulated poses replay exactly. */
export class ReplayScene {
  readonly nodes: readonly TransformNode[];
  readonly width: number;
  private readonly from = Quaternion.Identity();
  private readonly to = Quaternion.Identity();
  private readonly rotation = Quaternion.Identity();
  private readonly livePose: Float32Array;
  constructor(private readonly camera: FreeCamera, roots: readonly TransformNode[]) {
    this.nodes = [...new Set(roots.flatMap(root => [root, ...root.getDescendants(false).filter((node): node is TransformNode => node instanceof TransformNode)]))];
    this.width = this.nodes.length * STRIDE + 9;
    this.livePose = new Float32Array(this.width);
  }
  /** Temporarily draw history, then restore the latest live world before any further ticks/queries. */
  renderPresentation(draw: () => void) {
    this.capture(this.livePose, 0, false);
    const live = { at: 0, pose: this.livePose };
    try { draw(); } finally { this.apply({ before: live, after: live, mix: 0 }); }
  }
  capture(data: Float32Array, scope: number, accurate: boolean) {
    this.nodes.forEach((node, i) => {
      const p = i * STRIDE;
      data[p] = node.position.x; data[p + 1] = node.position.y; data[p + 2] = node.position.z;
      if (!node.rotationQuaternion) Quaternion.FromEulerAnglesToRef(node.rotation.x, node.rotation.y, node.rotation.z, this.rotation);
      const q = node.rotationQuaternion ?? this.rotation;
      data[p + 3] = q.x; data[p + 4] = q.y; data[p + 5] = q.z; data[p + 6] = q.w;
      data[p + 7] = node.scaling.x; data[p + 8] = node.scaling.y; data[p + 9] = node.scaling.z;
      data[p + 10] = Number(node.isEnabled(false)); data[p + 11] = node instanceof AbstractMesh ? node.visibility : 1;
    });
    const p = this.nodes.length * STRIDE;
    data[p] = this.camera.position.x; data[p + 1] = this.camera.position.y; data[p + 2] = this.camera.position.z;
    data[p + 3] = this.camera.rotation.x; data[p + 4] = this.camera.rotation.y; data[p + 5] = this.camera.rotation.z;
    data[p + 6] = this.camera.fov; data[p + 7] = scope; data[p + 8] = Number(accurate);
  }
  apply({ before, after, mix }: ReplaySample) {
    const a = before.pose, b = after.pose;
    this.nodes.forEach((node, i) => {
      const p = i * STRIDE;
      // Respawns/teleports snap instead of flying actors through the map.
      const t = Math.hypot(b[p] - a[p], b[p + 1] - a[p + 1], b[p + 2] - a[p + 2]) > 3 ? 0 : mix;
      node.position.set(blend(a[p], b[p], t), blend(a[p + 1], b[p + 1], t), blend(a[p + 2], b[p + 2], t));
      this.from.set(a[p + 3], a[p + 4], a[p + 5], a[p + 6]); this.to.set(b[p + 3], b[p + 4], b[p + 5], b[p + 6]);
      Quaternion.SlerpToRef(this.from, this.to, t, this.rotation);
      if (node.rotationQuaternion) node.rotationQuaternion.copyFrom(this.rotation); else this.rotation.toEulerAnglesToRef(node.rotation);
      node.scaling.set(blend(a[p + 7], b[p + 7], t), blend(a[p + 8], b[p + 8], t), blend(a[p + 9], b[p + 9], t));
      node.setEnabled(!!a[p + 10]); if (node instanceof AbstractMesh) node.visibility = a[p + 11];
    });
    const p = this.nodes.length * STRIDE;
    const t = Math.hypot(b[p] - a[p], b[p + 1] - a[p + 1], b[p + 2] - a[p + 2]) > 3 ? 0 : mix;
    this.camera.position.set(blend(a[p], b[p], t), blend(a[p + 1], b[p + 1], t), blend(a[p + 2], b[p + 2], t));
    this.camera.rotation.set(angle(a[p + 3], b[p + 3], t), angle(a[p + 4], b[p + 4], t), angle(a[p + 5], b[p + 5], t));
    this.camera.fov = blend(a[p + 6], b[p + 6], t);
    return { scope: blend(a[p + 7], b[p + 7], t), accurate: !!a[p + 8] };
  }
}
