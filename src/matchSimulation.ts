import { DEFAULT_MATCH_RULES, allowsDamage, PLAYER_RESPAWN_SECONDS, DEATH_RESPAWN_MAX_SECONDS, type MatchRules, type CombatVector, type DamageSource } from './match';
import { Loadout, type WeaponSlot } from './loadout';
import { MovementController } from './movement';
import { MeleeController } from './melee';
import { BotCombat } from './botCombat';
import { PlayerLife } from './playerLife';
import { RoundController, DEFAULT_ROUND_OPTIONS, type RoundOptions } from './rounds';
import { updatePatrol, resetPatrol, type Patrol } from './patrol';
import type { Player, Solid } from './simulation';
import type { SpawnPoint } from './spawning';
import type { EliminationEvent } from './combatEvents';

export type PlayerCommand = { yaw: number; strafe: number; forward: number; sprint: boolean; crouching: boolean; aiming: boolean; jump: boolean };
export type EnemyDefinition = { id: number; home: CombatVector; patrol: Patrol };
export type EnemyState = EnemyDefinition & { health: number; respawnAt: number };
export type HitDetails = { headshot?: boolean; quickscope?: boolean; throughCover?: boolean };
export type EnemyHit = { damage: number; health: number; eliminated: boolean; reward: number };

/** Authoritative match state, independent of DOM, cameras, audio, and rendering.
 * Geometry queries and spawn selection are injected by the host running the simulation.
 */
export class MatchSimulation {
  readonly player: Player = { x: 0, y: 0, z: -23, vy: 0, grounded: true };
  readonly life = new PlayerLife();
  readonly loadout = new Loadout();
  readonly movement = new MovementController();
  readonly melee = new MeleeController();
  readonly bots = new BotCombat();
  readonly round: RoundController;
  readonly enemies: EnemyState[];
  rules: Readonly<MatchRules>;
  now = 0;
  private events: EliminationEvent[] = [];
  constructor(definitions: readonly EnemyDefinition[], rules: MatchRules = { ...DEFAULT_MATCH_RULES }, options: RoundOptions = { ...DEFAULT_ROUND_OPTIONS }) {
    this.enemies = definitions.map(def => ({ ...def, home: { x: def.home.x, y: def.home.y, z: def.home.z }, health: 100, respawnAt: 0 }));
    this.rules = { ...rules }; this.round = new RoundController(options);
    this.round.register('player', 'YOU');
    for (const enemy of this.enemies) this.round.register(`bot-${enemy.id}`, `ENEMY ${String(enemy.id + 1).padStart(2, '0')}`);
    this.reset(rules, options);
  }
  get active() { return this.round.phase === 'active'; }
  private deathReplayHeld = false;
  reset(rules: Readonly<MatchRules> = this.rules, options?: RoundOptions) {
    this.rules = { ...rules }; this.now = 0; this.round.reset(options); this.deathReplayHeld = false;
    Object.assign(this.player, { x: 0, y: 0, z: -23, vy: 0, grounded: true });
    this.life.reset(); this.loadout.reset(); this.movement.reset(); this.melee.reset(); this.bots.reset(); this.events = [];
    for (const enemy of this.enemies) { enemy.health = 100; enemy.respawnAt = 0; resetPatrol(enemy.patrol); }
  }
  /** A paused host does not call advance. Countdown never consumes protection or weapon timers. */
  advance(dt: number, selectSpawn: () => SpawnPoint | null) {
    const before = this.round.elapsedSeconds;
    this.round.advance(dt);
    this.now = this.round.elapsedSeconds;
    const activeDt = this.now - before;
    const enemyRespawns: number[] = [];
    let playerRespawn: SpawnPoint | null = null;
    if (!this.active || activeDt <= 0) return { active: this.active, activeDt: 0, playerRespawn, enemyRespawns };
    // Restore due bots first so the player's spawn query includes every current occupant.
    for (const enemy of this.enemies) if (enemy.respawnAt && this.now >= enemy.respawnAt) {
      const occupants = [
        ...(this.life.alive ? [this.player] : []),
        ...this.enemies.filter(other => other !== enemy && !other.respawnAt).map(other => ({ ...other.patrol, y: other.home.y })),
      ];
      if (occupants.some(other => Math.abs(other.y - enemy.home.y) < 1.75 && Math.hypot(other.x - enemy.home.x, other.z - enemy.home.z) < 1.01)) continue;
      enemy.health = 100; enemy.respawnAt = 0; resetPatrol(enemy.patrol); enemyRespawns.push(enemy.id);
    }
    if (!this.life.alive && this.now >= this.life.respawnAt) {
      playerRespawn = selectSpawn();
      if (playerRespawn && this.life.update(this.now)) {
        this.deathReplayHeld = false;
        Object.assign(this.player, { x: playerRespawn.x, y: playerRespawn.y, z: playerRespawn.z, vy: 0, grounded: true });
        this.loadout.respawn(); this.movement.reset(); this.melee.reset();
      }
    }
    return { active: true, activeDt, playerRespawn, enemyRespawns };
  }
  patrol(dt: number, enabled: boolean) {
    if (!this.active) return;
    for (const enemy of this.enemies) {
      if (enemy.respawnAt) continue;
      const blockers = [
        ...(this.life.alive && Math.abs(this.player.y - enemy.home.y) < .5 ? [this.player] : []),
        ...this.enemies.filter(other => other !== enemy && !other.respawnAt && Math.abs(other.home.y - enemy.home.y) < .5).map(other => other.patrol),
      ];
      updatePatrol(enemy.patrol, dt, enabled, blockers);
    }
  }
  snapshots() {
    return this.enemies.map(enemy => ({ id: enemy.id, x: enemy.patrol.x, y: enemy.home.y, z: enemy.patrol.z, alive: !enemy.respawnAt }));
  }
  move(command: PlayerCommand, dt: number, solids: Solid[], adsSeconds: number) {
    if (!this.active || !this.life.alive) return null;
    const aiming = !this.melee.active(this.now) && command.aiming;
    this.loadout.update(this.now, dt, aiming, adsSeconds);
    if (command.jump) this.movement.queueJump();
    return this.movement.update(this.player, {
      ...command, aiming, ads: this.loadout.weapon.ads,
      moveScale: this.loadout.spec.moveScale, adsMoveScale: this.loadout.spec.adsMoveScale,
      sprintBlocked: this.melee.active(this.now) || this.loadout.swapping || !!this.loadout.weapon.reloadAt || this.now - this.loadout.lastShots[this.loadout.active] < .2,
    }, dt, solids);
  }
  swap(slot: WeaponSlot) { return this.active && this.life.alive && !this.melee.active(this.now) && this.loadout.request(slot, this.now); }
  reload() { return this.active && this.life.alive && !this.melee.active(this.now) && this.loadout.reload(this.now); }
  knife() {
    if (!this.active || !this.life.alive || this.loadout.swapping || !this.rules.knives || !this.melee.start(this.now)) return false;
    this.life.protectedUntil = this.now;
    this.loadout.weapon.ads = 0; this.loadout.weapon.accurateSince = -Infinity; this.loadout.weapon.reloadAt = 0;
    return true;
  }
  fire() {
    if (!this.active || !this.life.alive || this.melee.active(this.now)) return null;
    const shot = this.loadout.fire(this.now);
    if (!shot) return null;
    this.round.recordStats('player', { shots: 1 });
    if (allowsDamage(this.rules, this.loadout.active === 0 ? 'sniper' : 'pistol')) this.life.protectedUntil = this.now;
    return shot;
  }
  hitEnemy(id: number, amount: number, source: DamageSource, details: HitDetails = {}): EnemyHit | null {
    const enemy = this.enemies.find(enemy => enemy.id === id);
    if (!this.active || !this.life.alive || !enemy || enemy.respawnAt || source === 'bot' || !allowsDamage(this.rules, source) || !Number.isFinite(amount) || amount <= 0) return null;
    const damage = amount; enemy.health = Math.max(0, enemy.health - damage);
    if (source !== 'knife') this.round.recordStats('player', { hits: 1 });
    const eliminated = enemy.health === 0;
    const reward = eliminated ? (details.headshot ? 150 : 100) + (details.quickscope ? 50 : 0) : 0;
    if (eliminated) {
      enemy.respawnAt = this.now + PLAYER_RESPAWN_SECONDS;
      this.round.recordKill('player', `bot-${id}`, reward, !!details.quickscope);
      this.events.push({ killerId: 'player', victimId: `bot-${id}`, source, headshot: !!details.headshot, quickscope: !!details.quickscope, throughCover: !!details.throughCover, at: this.now });
    }
    return { damage, health: enemy.health, eliminated, reward };
  }
  botFired(id: number) { if (this.active && this.enemies.some(enemy => enemy.id === id && !enemy.respawnAt)) this.round.recordStats(`bot-${id}`, { shots: 1 }); }

  /** Hold only this player's respawn for a killcam, capped at ten seconds of match time. */
  holdRespawnForReplay() {
    if (!this.active || this.life.alive) return false;
    if (!this.deathReplayHeld) { this.deathReplayHeld = true; this.life.respawnAt = this.now + DEATH_RESPAWN_MAX_SECONDS; }
    return true;
  }
  /** Finishing/skipping releases the wait; safe-spawn selection still runs on the next live tick. */
  completeDeathReplay() {
    if (!this.active || this.life.alive) return false;
    this.deathReplayHeld = false;
    this.life.respawnAt = this.now;
    return true;
  }
  damagePlayer(id: number, amount: number) {
    const enemy = this.enemies.find(enemy => enemy.id === id);
    if (!this.active || !enemy || enemy.respawnAt || !allowsDamage(this.rules, 'bot') || !this.life.alive || this.now < this.life.protectedUntil || !Number.isFinite(amount) || amount <= 0) return { applied: false, died: false };
    const died = this.life.damage(amount, this.now);
    this.round.recordStats(`bot-${id}`, { hits: 1 });
    if (died) {
      this.melee.reset(); this.movement.reset(); this.loadout.weapon.reloadAt = 0;
      this.round.recordKill(`bot-${id}`, 'player');
      this.events.push({ killerId: `bot-${id}`, victimId: 'player', source: 'bot', headshot: false, quickscope: false, throughCover: false, at: this.now });
    }
    return { applied: true, died };
  }
  drainEvents() { const events = this.events; this.events = []; return events; }
}
