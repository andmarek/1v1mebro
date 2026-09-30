import { PLAYER_HEALTH, PLAYER_RESPAWN_SECONDS, SPAWN_PROTECTION_SECONDS } from './match';

export class PlayerLife {
  health = PLAYER_HEALTH;
  deaths = 0;
  respawnAt = 0;
  protectedUntil = SPAWN_PROTECTION_SECONDS;
  get alive() { return this.health > 0; }
  damage(amount: number, now: number): boolean {
    if (!this.alive || now < this.protectedUntil || !Number.isFinite(amount) || amount <= 0) return false;
    this.health = Math.max(0, this.health - amount);
    if (this.alive) return false;
    this.deaths++; this.respawnAt = now + PLAYER_RESPAWN_SECONDS;
    return true;
  }
  update(now: number): boolean {
    if (this.alive || now < this.respawnAt) return false;
    this.health = PLAYER_HEALTH; this.respawnAt = 0;
    this.protectedUntil = now + SPAWN_PROTECTION_SECONDS;
    return true;
  }
  reset(now = 0) {
    this.health = PLAYER_HEALTH; this.deaths = 0; this.respawnAt = 0;
    this.protectedUntil = now + SPAWN_PROTECTION_SECONDS;
  }
}

