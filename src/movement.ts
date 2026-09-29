import { movePlayer, PLAYER_HEIGHT, PLAYER_RADIUS, type Player, type Solid } from './simulation';

export const MOVEMENT = {
  runSpeed: 6.1,
  sprintSpeed: 9.4,
  aimSpeed: 3.8,
  crouchSpeed: 2.8,
  acceleration: 62,
  braking: 84,
  reversing: 90,
  airAcceleration: 14,
  jumpSpeed: 8.25,
  coyoteTime: .1,
  jumpBuffer: .12,
  stepDown: .36,
} as const;

export type MovementInput = { forward: number; strafe: number; yaw: number; sprint: boolean; aiming: boolean; crouching: boolean };
export type MovementResult = { distance: number; jumped: boolean; landed: boolean; landingSpeed: number; sprinting: boolean };

/** Settle small downward steps without treating each stair tread as a new fall. */
function settleOnStep(player: Player, fromY: number, solids: Solid[]) {
  const overlapsFootprint = (solid: Solid) => player.x + PLAYER_RADIUS > solid.minX + .001 && player.x - PLAYER_RADIUS < solid.maxX - .001 &&
    player.z + PLAYER_RADIUS > solid.minZ + .001 && player.z - PLAYER_RADIUS < solid.maxZ - .001;
  let support = fromY <= MOVEMENT.stepDown ? 0 : -Infinity;
  for (const solid of solids) {
    if (overlapsFootprint(solid) && solid.maxY <= player.y + .001 && fromY - solid.maxY <= MOVEMENT.stepDown + .001) support = Math.max(support, solid.maxY);
  }
  if (!Number.isFinite(support) || support > player.y + .001) return;
  if (solids.some(solid => overlapsFootprint(solid) && support + PLAYER_HEIGHT > solid.minY + .001 && support < solid.maxY - .001)) return;
  player.y = support; player.vy = 0; player.grounded = true;
}

/** Deterministic movement state, independent of rendering and browser input. */
export class MovementController {
  vx = 0;
  vz = 0;
  private groundGrace = 0;
  private bufferedJump = 0;
  private airSpeedLimit: number = MOVEMENT.runSpeed;
  get speed() { return Math.hypot(this.vx, this.vz); }
  queueJump() { this.bufferedJump = MOVEMENT.jumpBuffer; }
  cancelJump() { this.bufferedJump = 0; }
  reset() { this.vx = this.vz = this.groundGrace = this.bufferedJump = 0; this.airSpeedLimit = MOVEMENT.runSpeed; }

  update(player: Player, input: MovementInput, dt: number, solids: Solid[]): MovementResult {
    if (!(dt > 0)) return { distance: 0, jumped: false, landed: false, landingSpeed: 0, sprinting: false };
    const wasGrounded = player.grounded;
    const fromX = player.x, fromZ = player.z, fromY = player.y;
    this.groundGrace = wasGrounded ? MOVEMENT.coyoteTime : Math.max(0, this.groundGrace - dt);
    const takeoffLimit = () => { this.airSpeedLimit = Math.min(MOVEMENT.sprintSpeed, Math.max(MOVEMENT.runSpeed, this.speed)); };
    let jumped = false;
    const jump = () => {
      player.vy = MOVEMENT.jumpSpeed; player.grounded = false;
      this.bufferedJump = this.groundGrace = 0; jumped = true; takeoffLimit();
    };
    if (this.bufferedJump > 0 && this.groundGrace > 0 && !input.crouching) jump();

    const length = Math.hypot(input.strafe, input.forward), normalize = Math.max(1, length);
    const strafe = input.strafe / normalize, forward = input.forward / normalize;
    const wishX = strafe * Math.cos(input.yaw) + forward * Math.sin(input.yaw);
    const wishZ = forward * Math.cos(input.yaw) - strafe * Math.sin(input.yaw);
    const sprinting = input.sprint && input.forward > 0 && !input.aiming && !input.crouching;
    const speed = input.crouching ? MOVEMENT.crouchSpeed : input.aiming ? MOVEMENT.aimSpeed : sprinting ? MOVEMENT.sprintSpeed : MOVEMENT.runSpeed;
    if (player.grounded) {
      const targetX = wishX * speed, targetZ = wishZ * speed;
      const dx = targetX - this.vx, dz = targetZ - this.vz, difference = Math.hypot(dx, dz);
      const reversing = this.vx * targetX + this.vz * targetZ < 0;
      const acceleration = !length || this.speed > speed + .01 ? MOVEMENT.braking : reversing ? MOVEMENT.reversing : MOVEMENT.acceleration;
      const fraction = difference ? Math.min(1, acceleration * dt / difference) : 1;
      this.vx += dx * fraction; this.vz += dz * fraction;
    } else if (length) {
      // Accelerate toward input, retaining takeoff momentum. A hard cap prevents hop/diagonal speed stacking.
      const control = input.aiming ? .65 : input.crouching ? .7 : 1;
      const projection = this.vx * wishX + this.vz * wishZ;
      const acceleration = Math.min(Math.max(0, this.airSpeedLimit - projection), MOVEMENT.airAcceleration * control * dt);
      this.vx += wishX * acceleration; this.vz += wishZ * acceleration;
      const horizontal = this.speed;
      if (horizontal > this.airSpeedLimit) { this.vx *= this.airSpeedLimit / horizontal; this.vz *= this.airSpeedLimit / horizontal; }
    }

    const fallingSpeed = Math.max(0, -player.vy);
    const dx = this.vx * dt, dz = this.vz * dt;
    movePlayer(player, dx, dz, dt, solids);
    if (wasGrounded && !jumped && !player.grounded && player.vy <= 0) settleOnStep(player, fromY, solids);
    // Remove only the velocity component blocked by a wall; preserve movement along it.
    const actualX = player.x - fromX, actualZ = player.z - fromZ;
    if (Math.abs(actualX - dx) > .00001) this.vx = actualX / dt;
    if (Math.abs(actualZ - dz) > .00001) this.vz = actualZ / dt;
    if (wasGrounded && !player.grounded && !jumped) takeoffLimit();
    const landed = !wasGrounded && player.grounded;
    if (landed) {
      this.groundGrace = MOVEMENT.coyoteTime;
      if (this.bufferedJump > 0 && !input.crouching) jump();
    }
    this.bufferedJump = Math.max(0, this.bufferedJump - dt);
    return { distance: Math.hypot(actualX, actualZ), jumped, landed, landingSpeed: landed ? fallingSpeed : 0, sprinting };
  }
}
