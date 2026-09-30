import type { DamageSource } from './match';

export type EliminationEvent = {
  killerId: string; victimId: string; source: DamageSource;
  headshot: boolean; quickscope: boolean; throughCover: boolean; at: number;
};
