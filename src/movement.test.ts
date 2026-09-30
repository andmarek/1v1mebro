import { describe, expect, it } from 'vitest';
import { MOVEMENT, MovementController, type MovementInput } from './movement';
import { GRAVITY, type Player, type Solid } from './simulation';
import { towerColliders } from './tower';

const player = (): Player => ({ x: 0, y: 0, z: 0, vy: 0, grounded: true });
const input = (overrides: Partial<MovementInput> = {}): MovementInput => ({ forward: 0, strafe: 0, yaw: 0, sprint: false, aiming: false, crouching: false, ...overrides });
const dt = 1 / 120;
function advance(p: Player, movement: MovementController, controls: MovementInput, seconds: number, solids: Solid[] = []) {
  for (let i = 0; i < Math.round(seconds / dt); i++) movement.update(p, controls, dt, solids);
}
const ledge: Solid = { minX: -10, maxX: 10, minZ: -10, maxZ: 0, minY: 0, maxY: 2 };
function leaveLedge() {
  const p = { ...player(), y: 2, z: .30 }, movement = new MovementController();
  movement.vz = MOVEMENT.runSpeed;
  movement.update(p, input({ forward: 1 }), dt, [ledge]);
  expect(p.grounded).toBe(false);
  return { p, movement };
}

describe('fluid movement', () => {
  it('accelerates quickly without snapping to full speed and brakes in a short distance', () => {
    const p = player(), movement = new MovementController();
    movement.update(p, input({ forward: 1, sprint: true }), dt, []);
    expect(movement.speed).toBeGreaterThan(0); expect(movement.speed).toBeLessThan(MOVEMENT.sprintSpeed);
    advance(p, movement, input({ forward: 1, sprint: true }), .2);
    expect(movement.speed).toBeCloseTo(MOVEMENT.sprintSpeed);
    const z = p.z;
    advance(p, movement, input(), .45);
    expect(movement.speed).toBeCloseTo(0); expect(p.z - z).toBeLessThan(1.4);
  });
  it('keeps diagonal movement at the same speed as forward movement', () => {
    for (const sprint of [false, true]) {
      const p = player(), movement = new MovementController();
      advance(p, movement, input({ forward: 1, strafe: 1, sprint }), 1);
      expect(movement.speed).toBeCloseTo(sprint ? MOVEMENT.sprintSpeed : MOVEMENT.runSpeed);
      expect(p.x).toBeCloseTo(p.z);
    }
  });
  it('reverses a strafe promptly and applies aiming/crouch limits even with sprint held', () => {
    const p = player(), movement = new MovementController();
    advance(p, movement, input({ strafe: 1 }), .2);
    advance(p, movement, input({ strafe: -1 }), .1);
    expect(movement.vx).toBeLessThan(0);
    advance(p, movement, input({ forward: 1, sprint: true, aiming: true }), .3);
    expect(movement.speed).toBeCloseTo(MOVEMENT.aimSpeed);
    advance(p, movement, input({ forward: 1, sprint: true, crouching: true }), .3);
    expect(movement.speed).toBeCloseTo(MOVEMENT.crouchSpeed);
    advance(p, movement, input({ forward: -1, sprint: true }), .3);
    expect(movement.speed).toBeCloseTo(MOVEMENT.runSpeed * MOVEMENT.backScale);
  });
  it('steers a sprint jump while retaining bounded takeoff momentum after releasing sprint', () => {
    const p = player(), movement = new MovementController();
    advance(p, movement, input({ forward: 1, sprint: true }), .25);
    movement.queueJump(); movement.update(p, input({ forward: 1, sprint: true }), dt, []);
    expect(p.grounded).toBe(false);
    const speed = movement.speed;
    advance(p, movement, input(), .08);
    expect(movement.speed).toBeCloseTo(speed);
    advance(p, movement, input({ strafe: 1 }), .2);
    expect(movement.vx).toBeGreaterThan(.8); expect(movement.vx).toBeLessThan(1.5);
    expect(movement.vz).toBeGreaterThan(8);
    expect(movement.speed).toBeCloseTo(MOVEMENT.sprintSpeed);
  });
  it('cannot gain unlimited speed from repeated jumping or midair sprint toggles', () => {
    const p = player(), movement = new MovementController();
    for (let i = 0; i < 1800; i++) {
      if (i % 65 === 0) movement.queueJump();
      movement.update(p, input({ forward: 1, strafe: i % 120 < 60 ? 1 : -1, sprint: true }), dt, []);
      expect(movement.speed).toBeLessThanOrEqual(MOVEMENT.sprintSpeed + 1e-8);
    }
    const q = player(), stationary = new MovementController();
    stationary.queueJump(); stationary.update(q, input(), dt, []);
    advance(q, stationary, input({ forward: 1, sprint: true }), .35);
    expect(stationary.speed).toBeLessThanOrEqual(MOVEMENT.runSpeed + 1e-8);
  });
  it('accepts a jump shortly after leaving a ledge, but never a second airborne jump', () => {
    const { p, movement } = leaveLedge();
    advance(p, movement, input({ forward: 1 }), .05, [ledge]);
    movement.queueJump();
    expect(movement.update(p, input({ forward: 1 }), dt, [ledge]).jumped).toBe(true);
    expect(p.vy).toBeGreaterThan(7);
    movement.queueJump();
    expect(movement.update(p, input({ forward: 1 }), dt, [ledge]).jumped).toBe(false);
    const late = leaveLedge(); advance(late.p, late.movement, input({ forward: 1 }), .15, [ledge]);
    late.movement.queueJump(); expect(late.movement.update(late.p, input({ forward: 1 }), dt, [ledge]).jumped).toBe(false);
  });
  it('buffers an early landing jump once and expires old jump presses', () => {
    const p = { ...player(), y: .35, vy: -4, grounded: false }, movement = new MovementController();
    movement.queueJump();
    let jumps = 0, lands = 0;
    for (let i = 0; i < 180; i++) {
      const result = movement.update(p, input(), dt, []);
      jumps += Number(result.jumped); lands += Number(result.landed);
    }
    expect(jumps).toBe(1); expect(lands).toBe(2); expect(p.grounded).toBe(true);
    const q = { ...player(), y: 3, vy: 0, grounded: false }, old = new MovementController(); old.queueJump();
    for (let i = 0; i < 150; i++) expect(old.update(q, input(), dt, []).jumped).toBe(false);
    expect(q.grounded).toBe(true);
  });
  it('cancels queued jumps on pause/reset and suppresses jumps while crouching', () => {
    const p = player(), movement = new MovementController();
    movement.queueJump(); movement.cancelJump(); expect(movement.update(p, input(), dt, []).jumped).toBe(false);
    movement.queueJump(); expect(movement.update(p, input({ crouching: true }), dt, []).jumped).toBe(false);
    movement.reset(); expect(movement.speed).toBe(0);
    expect(movement.update(p, input(), dt, []).jumped).toBe(false);
  });
  it('clips blocked velocity while sliding along cover and stops counting movement into a wall', () => {
    const wall: Solid = { minX: 1, maxX: 1.05, minY: 0, maxY: 4, minZ: -100, maxZ: 100 };
    const p = player(), movement = new MovementController();
    advance(p, movement, input({ forward: 1, strafe: 1, sprint: true }), .5, [wall]);
    expect(p.x).toBeLessThanOrEqual(1 - .32); expect(p.z).toBeGreaterThan(2);
    expect(movement.vx).toBeCloseTo(0); expect(movement.vz).toBeGreaterThan(5);
    advance(p, movement, input({ strafe: 1 }), .3, [wall]);
    expect(movement.update(p, input({ strafe: 1 }), dt, [wall]).distance).toBeCloseTo(0);
  });
  it('clears waist-high barriers with a jump and lands without ceiling tunnelling', () => {
    const p = player(), movement = new MovementController();
    const cover: Solid = { minX: -2, maxX: 2, minZ: 2.5, maxZ: 3.2, minY: 0, maxY: 1.32 };
    advance(p, movement, input({ forward: 1, sprint: true }), .2);
    movement.queueJump();
    let peak = 0;
    for (let i = 0; i < 120; i++) { movement.update(p, input({ forward: 1, sprint: true }), dt, [cover]); peak = Math.max(peak, p.y); }
    expect(peak).toBeGreaterThan(1.32); expect(peak).toBeLessThan(1.5);
    expect(p.z).toBeGreaterThan(cover.maxZ + .32); expect(p.grounded).toBe(true);
    expect(MOVEMENT.jumpSpeed ** 2 / (2 * GRAVITY)).toBeLessThan(1.5);
    const q = player(), ceilingMovement = new MovementController();
    const ceiling: Solid = { minX: -5, maxX: 5, minZ: -5, maxZ: 5, minY: 2.2, maxY: 2.5 };
    ceilingMovement.queueJump();
    for (let i = 0; i < 120; i++) { ceilingMovement.update(q, input(), dt, [ceiling]); expect(q.y).toBeLessThanOrEqual(.45 + 1e-8); }
    expect(q.grounded).toBe(true);
  });
  it('runs up and down both real tower stairways with continuous ground contact', () => {
    const p = { ...player(), x: 5.2, z: -7 }, movement = new MovementController(), solids = towerColliders();
    const walkTo = (x: number, z: number) => {
      for (let i = 0; i < 1500; i++) {
        const dx = x - p.x, dz = z - p.z;
        if (Math.hypot(dx, dz) < .09) {
          // Release movement before turning on the narrow landing, as a player would.
          for (let brake = 0; brake < 60; brake++) {
            movement.update(p, input(), dt, solids);
            expect(p.grounded, `Braking near ${x}, ${z} at ${p.x}, ${p.y}, ${p.z}`).toBe(true);
          }
          return;
        }
        // Ease off before narrow landings; the friction model retains stopping momentum.
        movement.update(p, input({ forward: Math.min(1, Math.hypot(dx, dz) / 1.2), yaw: Math.atan2(dx, dz) }), dt, solids);
        expect(p.grounded, `Approaching ${x}, ${z} at ${p.x}, ${p.y}, ${p.z}`).toBe(true);
      }
      throw new Error(`Stuck at ${p.x}, ${p.y}, ${p.z}`);
    };
    walkTo(5.2, 3.4); expect(p.y).toBeCloseTo(4.25);
    walkTo(1, 3.4); walkTo(1, 7.25); walkTo(-1.4, 7.25); walkTo(-1.4, .05); expect(p.y).toBeCloseTo(8.35);
    // Clear the final tread with the whole collision footprint before checking the lower deck.
    walkTo(-1.4, 7.35); expect(p.y).toBeCloseTo(4.25);
    walkTo(1, 7.25); walkTo(1, 3.4); walkTo(5.2, 3.4); walkTo(5.2, -7); expect(p.y).toBeCloseTo(0);
  });
  it('keeps full-speed sprinting supported on the real lower stairs in both directions', () => {
    const p = { ...player(), x: 5.2, z: -7 }, movement = new MovementController(), solids = towerColliders();
    for (let i = 0; i < 240 && p.z < 3.35; i++) {
      movement.update(p, input({ forward: 1, sprint: true }), dt, solids);
      expect(p.grounded).toBe(true);
    }
    expect(p.y).toBeCloseTo(4.25); expect(movement.speed).toBeCloseTo(MOVEMENT.sprintSpeed);
    advance(p, movement, input(), .15, solids);
    for (let i = 0; i < 240 && p.z > -6.5; i++) {
      movement.update(p, input({ forward: 1, sprint: true, yaw: Math.PI }), dt, solids);
      expect(p.grounded).toBe(true);
    }
    expect(p.y).toBeCloseTo(0); expect(p.z).toBeLessThan(-6.4);
  });
  it('backpedals and strafes more slowly without granting a diagonal boost', () => {
    const speeds = [{ forward: 1 }, { strafe: 1 }, { forward: -1 }, { forward: -1, strafe: 1 }].map(controls => {
      const p = player(), movement = new MovementController();
      advance(p, movement, input(controls), 1);
      return movement.speed;
    });
    expect(speeds[1]).toBeLessThan(speeds[0]);
    expect(speeds[2]).toBeLessThan(speeds[1]);
    expect(speeds[3]).toBeCloseTo(speeds[1]);
  });
  it('blends aim movement speed and respects weapon weight and sprint action blocks', () => {
    const p = player(), movement = new MovementController();
    const controls = input({ forward: 1, sprint: true, aiming: true, moveScale: .95, adsMoveScale: .62 });
    advance(p, movement, { ...controls, ads: 0 }, 1); const hip = movement.speed;
    advance(p, movement, { ...controls, ads: .5 }, 1); const halfway = movement.speed;
    advance(p, movement, { ...controls, ads: 1 }, 1); const aimed = movement.speed;
    expect(aimed).toBeLessThan(halfway); expect(halfway).toBeLessThan(hip);
    expect(hip).toBeLessThan(MOVEMENT.runSpeed);
    advance(p, movement, input({ forward: 1, sprint: true, sprintBlocked: true }), 1);
    expect(movement.speed).toBeCloseTo(MOVEMENT.runSpeed);
    expect(movement.update(p, input({ forward: 1, sprint: true, sprintBlocked: true }), dt, []).sprinting).toBe(false);
  });
  it('crouches under cover and cannot stand or jump until the full hull is clear', () => {
    const roof: Solid = { minX: -2, maxX: 2, minZ: 1, maxZ: 4, minY: 1.4, maxY: 2 };
    const p = player(), movement = new MovementController();
    advance(p, movement, input({ forward: 1 }), .5, [roof]);
    expect(p.z).toBeLessThan(1);
    advance(p, movement, input({ forward: 1, crouching: true }), 1, [roof]);
    expect(p.z).toBeGreaterThan(1); expect(p.z).toBeLessThan(4);
    advance(p, movement, input(), .25, [roof]);
    expect(movement.crouching).toBe(true);
    expect(movement.height).toBe(1.25);
    movement.queueJump(); expect(movement.update(p, input(), dt, [roof]).jumped).toBe(false);
    advance(p, movement, input({ forward: 1 }), 1, [roof]);
    expect(p.z).toBeGreaterThan(4.32); expect(movement.crouching).toBe(false);
    expect(movement.height).toBe(1.75);
    movement.queueJump(); expect(movement.update(p, input(), dt, [roof]).jumped).toBe(true);
  });
  it('handles partial movement input without changing its intended direction', () => {
    const p = player(), movement = new MovementController();
    advance(p, movement, input({ forward: .5 }), 1);
    expect(movement.speed).toBeCloseTo(MOVEMENT.runSpeed * .5);
    expect(p.x).toBe(0);
  });
});
