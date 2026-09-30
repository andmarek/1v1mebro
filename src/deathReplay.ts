import type { KillReplay } from './killReplay';
export const DEATH_IMPACT_SECONDS = .35;

/** Presentation only. The host suspends live ticks until playback/skip completes. */
export class DeathReplay {
  clip: KillReplay | null = null;
  attacker = -1;
  elapsed = 0;
  get active() { return this.clip !== null; }
  get showing() { return this.active && this.elapsed >= DEATH_IMPACT_SECONDS; }
  get replayElapsed() { return Math.max(0, this.elapsed - DEATH_IMPACT_SECONDS); }
  get complete() { return !!this.clip && this.replayElapsed >= this.clip.duration; }
  begin(clip: KillReplay | null, attacker: number) {
    if (this.active || !clip) return false;
    this.clip = clip; this.attacker = attacker; this.elapsed = 0; return true;
  }
  advance(dt: number) {
    if (this.clip && Number.isFinite(dt) && dt > 0) this.elapsed = Math.min(DEATH_IMPACT_SECONDS + this.clip.duration, this.elapsed + dt);
  }
  skip() { if (this.clip) this.elapsed = DEATH_IMPACT_SECONDS + this.clip.duration; }
  reset() { this.clip = null; this.attacker = -1; this.elapsed = 0; }
}
