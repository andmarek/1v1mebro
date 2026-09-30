// Adapted from IW4L's sway, bob and landing concepts; see public/licenses/iw4l-NOTICE.txt.
import { GRAVITY } from './simulation';
import { MOVEMENT } from './movement';

// Radians per meter; a footfall is half a full left/right cycle.
export const WALK_BOB_RATE = 2;
export const SPRINT_BOB_RATE = Math.PI / 2.1;
export const CROUCH_BOB_RATE = Math.PI / 1.05;

type MotionInput = {
  yaw: number; pitch: number; ads: number; speed: number; strafeSpeed: number;
  grounded: boolean; sprinting: boolean; crouching: boolean;
};
const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
const follow = (value: number, target: number, rate: number, dt: number) => value + (target - value) * (1 - Math.exp(-rate * dt));
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Presentation only: none of these offsets moves the player's collision hull. */
export class ViewMotion {
  cameraY = 0;
  cameraPitch = 0;
  cameraRoll = 0;
  weaponX = 0;
  weaponY = 0;
  weaponZ = 0;
  weaponPitch = 0;
  weaponYaw = 0;
  weaponRoll = 0;
  sprint = 0;
  gunKick = 0;
  viewKick = 0;
  private gunVelocity = 0;
  private viewVelocity = 0;
  private previousYaw = 0;
  private previousPitch = 0;
  private lookX = 0;
  private lookY = 0;
  private move = 0;
  private strafe = 0;
  private phase = 0;
  private idleTime = 0;
  private landAge = 1;
  private landDepth = 0;

  reset(yaw = 0, pitch = 0) {
    this.cameraY = this.cameraPitch = this.cameraRoll = 0;
    this.weaponX = this.weaponY = this.weaponZ = this.weaponPitch = this.weaponYaw = this.weaponRoll = 0;
    this.gunVelocity = this.viewVelocity = this.gunKick = this.viewKick = 0;
    this.lookX = this.lookY = this.move = this.strafe = this.sprint = this.phase = this.idleTime = this.landDepth = 0;
    this.landAge = 1;
    this.resetLook(yaw, pitch);
  }
  resetLook(yaw: number, pitch: number) {
    this.previousYaw = yaw; this.previousPitch = pitch;
    this.lookX = this.lookY = 0;
  }
  fire(strength: number) {
    // Gun and view kick recover separately; rapid shots accumulate bounded recoil.
    this.gunVelocity = Math.min(32, this.gunVelocity + strength * 25);
    this.viewVelocity = Math.min(28, this.viewVelocity + strength * 21);
  }
  clearRecoil() { this.gunKick = this.viewKick = this.gunVelocity = this.viewVelocity = 0; }
  land(speed: number) {
    const fallHeight = speed * speed / (2 * GRAVITY);
    if (fallHeight <= .3) return; // Stair treads do not trigger landing shake.
    this.landDepth = Math.min(.14, .05 + (fallHeight - .3) * .06);
    this.landAge = 0;
  }
  update(dt: number, input: MotionInput) {
    if (!(dt > 0)) return;
    const ads = smooth(Math.max(0, Math.min(1, input.ads)));
    // Angular velocity is normalized to a 60 Hz frame before clamping, as in IW4L.
    const yawRate = clamp(angleDelta(input.yaw, this.previousYaw) / (dt * 60), .06);
    const pitchRate = clamp(angleDelta(input.pitch, this.previousPitch) / (dt * 60), .06);
    this.previousYaw = input.yaw; this.previousPitch = input.pitch;
    const swayScale = 1 - ads * .88;
    this.lookX = follow(this.lookX, yawRate * swayScale, 12 + ads * 8, dt);
    this.lookY = follow(this.lookY, pitchRate * swayScale, 12 + ads * 8, dt);
    this.move = follow(this.move, input.grounded ? Math.min(1, input.speed / MOVEMENT.runSpeed) : 0, 14, dt);
    this.strafe = follow(this.strafe, input.grounded ? clamp(input.strafeSpeed / MOVEMENT.runSpeed, 1) : 0, 10, dt);
    this.sprint = follow(this.sprint, input.sprinting && input.grounded && input.speed > MOVEMENT.runSpeed * .8 ? 1 : 0, 10, dt);
    if (input.grounded) this.phase += input.speed * dt * (input.sprinting ? SPRINT_BOB_RATE : input.crouching ? CROUCH_BOB_RATE : WALK_BOB_RATE);
    this.idleTime += dt;
    this.landAge += dt;
    const landWeight = this.landAge < .15 ? this.landAge / .15 : Math.max(0, 1 - (this.landAge - .15) / .3);
    const landing = this.landDepth * landWeight;

    // Small stable substeps keep recoil recovery consistent across display frame rates.
    const steps = Math.ceil(dt / (1 / 240)), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.gunVelocity += (-240 * this.gunKick - 24 * this.gunVelocity) * h;
      this.gunKick += this.gunVelocity * h;
      this.viewVelocity += (-330 * this.viewKick - 29 * this.viewVelocity) * h;
      this.viewKick += this.viewVelocity * h;
    }
    const attenuation = (1 - ads * .95) * (input.crouching ? .6 : 1);
    const horizontal = Math.sin(this.phase), vertical = Math.cos(this.phase * 2);
    const bob = this.move * attenuation;
    this.cameraY = -landing * (1 - ads * .6) + vertical * .012 * bob;
    this.cameraPitch = vertical * .0022 * bob - this.viewKick * .065;
    this.cameraRoll = horizontal * .0025 * bob - this.strafe * .005 * (1 - ads);
    this.weaponX = -this.lookX * .32 + horizontal * .009 * bob - this.strafe * .006 * (1 - ads);
    this.weaponY = this.lookY * .22 + vertical * .009 * bob - landing * .25 +
      Math.sin(this.idleTime * 1.5) * .0015 * (1 - this.move) * (1 - ads * .9);
    this.weaponZ = -this.sprint * .035 * (1 - ads);
    this.weaponPitch = -this.lookY * .45 + vertical * .008 * bob + this.sprint * .19 * (1 - ads);
    this.weaponYaw = -this.lookX * .55 - this.sprint * .20 * (1 - ads);
    this.weaponRoll = -this.strafe * .025 * (1 - ads) + horizontal * .01 * bob - this.sprint * .13 * (1 - ads);
    this.weaponY -= this.sprint * .065 * (1 - ads);
  }
}
