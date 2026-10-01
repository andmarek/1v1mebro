/** Session rules are game state; personal graphics/input preferences live in settings.ts. */
export type MatchRules = { secondaryDamage: boolean; knives: boolean; botsShoot: boolean };
export const DEFAULT_MATCH_RULES: Readonly<MatchRules> = { secondaryDamage: true, knives: true, botsShoot: false };
export type DamageSource = 'sniper' | 'pistol' | 'knife' | 'bot';
export function allowsDamage(rules: Readonly<MatchRules>, source: DamageSource) {
  if (source === 'pistol') return rules.secondaryDamage;
  if (source === 'knife') return rules.knives;
  if (source === 'bot') return rules.botsShoot;
  return true;
}
export type CombatVector = { x: number; y: number; z: number };
export type BotSnapshot = CombatVector & { id: number; alive: boolean };
export type PlayerSnapshot = CombatVector & { height: number; alive: boolean };
export const PLAYER_HEALTH = 100;
export const PLAYER_RESPAWN_SECONDS = 2;
export const DEATH_RESPAWN_MAX_SECONDS = 10;
export const SPAWN_PROTECTION_SECONDS = 3;
