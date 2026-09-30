// Adapted from IW4L's movement model; see public/licenses/iw4l-NOTICE.txt.
import { CROUCH_HEIGHT, GRAVITY, hasClearance, movePlayer, PLAYER_HEIGHT, PLAYER_RADIUS, type Player, type Solid } from './simulation';

export const MOVEMENT = {
  runSpeed: 6.1,
  sprintSpeed: 6.1 * 1.5,
  aimSpeed: 3.8,
  crouchSpeed: 2.8,
  backScale: .7,
  strafeScale: .8,
  groundAcceleration: 9,
  crouchAcceleration: 12,
  friction: 5.5,
  stopSpeed: 2.5,
  airAcceleration: 1,
  // Preserve clearance of the original arena's 1.32 m cover.
  jumpSpeed: Math.sqrt(2 * GRAVITY * 1.4),
  coyoteTime: .1,
  jumpBuffer: .12,
  stepDown: .36,
} as const;

export type MovementInput = {
  forward: number; strafe: number; yaw: number; sprint: boolean; aiming: boolean; crouching: boolean;
  ads?: number; moveScale?: number; adsMoveScale?: number; sprintBlocked?: boolean;
};
export type MovementResult = { distance: number; jumped: boolean; landed: boolean; landingSpeed: number; sprinting: boolean };

/** Settle small downward steps without treating each stair tread as a new fall. */
function settleOnStep(player: Player, fromY: number, solids: Solid[], height: number) {
  const overlapsFootprint = (solid: Solid) => player.x + PLAYER_RADIUS > solid.minX + .001 && player.x - PLAYER_RADIUS < solid.maxX - .001 &&
    player.z + PLAYER_RADIUS > solid.minZ + .001 && player.z - PLAYER_RADIUS < solid.maxZ - .001;
  let support = fromY <= MOVEMENT.stepDown ? 0 : -Infinity;
  for (const solid of solids) {
    if (overlapsFootprint(solid) && solid.maxY <= player.y + .001 && fromY - solid.maxY <= MOVEMENT.stepDown + .001) support = Math.max(support, solid.maxY);
  }
  if (!Number.isFinite(support) || support > player.y + .001) return;
  if (solids.some(solid => overlapsFootprint(solid) && support + height > solid.minY + .001 && support < solid.maxY - .001)) return;
  player.y = support; player.vy = 0; player.grounded = true;
}

/** Deterministic movement state, independent of rendering and browser input. */
export class MovementController {
  vx = 0;
  vz = 0;
  private groundGrace = 0;
  private bufferedJump = 0;
  private airSpeedLimit: number = MOVEMENT.runSpeed;
  private ducked = false;
  get crouching() { return this.ducked; }
  get height() { return this.ducked ? CROUCH_HEIGHT : PLAYER_HEIGHT; }
  get speed() { return Math.hypot(this.vx, this.vz); }
  queueJump() { this.bufferedJump = MOVEMENT.jumpBuffer; }
  cancelJump() { this.bufferedJump = 0; }
  reset() { this.vx = this.vz = this.groundGrace = this.bufferedJump = 0; this.airSpeedLimit = MOVEMENT.runSpeed; this.ducked = false; }

  update(player: Player, input: MovementInput, dt: number, solids: Solid[]): MovementResult {
    if (!(dt > 0)) return { distance: 0, jumped: false, landed: false, landingSpeed: 0, sprinting: false };
    const wasGrounded = player.grounded;
    // Releasing crouch under a roof cannot expand the hull into that roof.
    this.ducked = input.crouching || (this.ducked && !hasClearance(player, PLAYER_HEIGHT, solids));
    const fromX = player.x, fromZ = player.z, fromY = player.y;
    this.groundGrace = wasGrounded ? MOVEMENT.coyoteTime : Math.max(0, this.groundGrace - dt);
    const takeoffLimit = () => { this.airSpeedLimit = Math.min(MOVEMENT.sprintSpeed, Math.max(MOVEMENT.runSpeed, this.speed)); };
    let jumped = false;
    const jump = () => {
      player.vy = MOVEMENT.jumpSpeed; player.grounded = false;
      this.bufferedJump = this.groundGrace = 0; jumped = true; takeoffLimit();
    };
    if (this.bufferedJump > 0 && this.groundGrace > 0 && !this.ducked) jump();

    const rawStrafe = Math.max(-1, Math.min(1, input.strafe)), rawForward = Math.max(-1, Math.min(1, input.forward));
    const length = Math.hypot(rawStrafe, rawForward);
    const strafe = rawStrafe / (length || 1), forward = rawForward / (length || 1);
    const wishX = strafe * Math.cos(input.yaw) + forward * Math.sin(input.yaw);
    const wishZ = forward * Math.cos(input.yaw) - strafe * Math.sin(input.yaw);
    const ads = Math.max(0, Math.min(1, input.ads ?? Number(input.aiming)));
    const sprinting = input.sprint && input.forward >= .8 && !input.aiming && ads < .05 && !this.ducked && !input.sprintBlocked;
    // IW-style command scaling preserves direction and prevents diagonal speed boosts.
    const commandScale = Math.max(Math.abs(rawStrafe) * MOVEMENT.strafeScale,
      Math.abs(rawForward) * (rawForward < 0 ? MOVEMENT.backScale : 1));
    const moveScale = input.moveScale ?? 1;
    const adsMoveScale = input.adsMoveScale ?? MOVEMENT.aimSpeed / MOVEMENT.runSpeed;
    const speed = (this.ducked ? MOVEMENT.crouchSpeed : sprinting ? MOVEMENT.sprintSpeed : MOVEMENT.runSpeed) *
      moveScale * (1 + (adsMoveScale - 1) * ads);
    const wishSpeed = speed * commandScale;
    if (player.grounded) {
      const current = this.speed;
      if (current > 0) {
        const next = Math.max(0, current - Math.max(current, MOVEMENT.stopSpeed) * MOVEMENT.friction * dt);
        this.vx *= next / current; this.vz *= next / current;
      }
      const acceleration = this.ducked ? MOVEMENT.crouchAcceleration : MOVEMENT.groundAcceleration;
      this.accelerate(wishX, wishZ, wishSpeed, acceleration, dt);
      // This range deliberately bounds strafe hopping rather than reproducing speed exploits.
      this.capSpeed(speed);
    } else if (length) {
      // No ground friction in flight; steering is weaker and sprint cannot add airborne speed.
      this.accelerate(wishX, wishZ, MOVEMENT.runSpeed * Math.max(Math.abs(rawStrafe), Math.abs(rawForward)), MOVEMENT.airAcceleration, dt);
      this.capSpeed(this.airSpeedLimit);
    }

    const fallingSpeed = Math.max(0, -player.vy);
    const dx = this.vx * dt, dz = this.vz * dt;
    movePlayer(player, dx, dz, dt, solids, this.height);
    if (wasGrounded && !jumped && !player.grounded && player.vy <= 0) settleOnStep(player, fromY, solids, this.height);
    // Remove only the velocity component blocked by a wall; preserve movement along it.
    const actualX = player.x - fromX, actualZ = player.z - fromZ;
    if (Math.abs(actualX - dx) > .00001) this.vx = actualX / dt;
    if (Math.abs(actualZ - dz) > .00001) this.vz = actualZ / dt;
    if (wasGrounded && !player.grounded && !jumped) takeoffLimit();
    const landed = !wasGrounded && player.grounded;
    if (landed) {
      this.groundGrace = MOVEMENT.coyoteTime;
      if (this.bufferedJump > 0 && !this.ducked) jump();
    }
    this.bufferedJump = Math.max(0, this.bufferedJump - dt);
    return { distance: Math.hypot(actualX, actualZ), jumped, landed, landingSpeed: landed ? fallingSpeed + GRAVITY * dt : 0, sprinting };
  }

  private accelerate(x: number, z: number, wishSpeed: number, acceleration: number, dt: number) {
    const remaining = wishSpeed - (this.vx * x + this.vz * z);
    if (remaining <= 0) return;
    const push = Math.min(remaining, acceleration * dt * Math.max(wishSpeed, MOVEMENT.stopSpeed));
    this.vx += x * push; this.vz += z * push;
  }
  private capSpeed(limit: number) {
    const speed = this.speed;
    if (speed > limit) { this.vx *= limit / speed; this.vz *= limit / speed; }
  }
}
