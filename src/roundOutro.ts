export const FINAL_IMPACT_SECONDS = .35;
export const ROUND_OUTRO_SECONDS = 3.4;
export type OutroStage = 'idle' | 'impact' | 'banner' | 'results';

/** Presentation clock only: finishing gameplay stays frozen throughout the outro. */
export class RoundOutro {
  private started = false;
  elapsed = 0;
  get stage(): OutroStage {
    return !this.started ? 'idle' : this.elapsed < FINAL_IMPACT_SECONDS ? 'impact' : this.elapsed < ROUND_OUTRO_SECONDS ? 'banner' : 'results';
  }
  get presenting() { return this.stage === 'impact' || this.stage === 'banner'; }
  get aimScale() {
    const t = Math.max(0, Math.min(1, (this.elapsed - FINAL_IMPACT_SECONDS) / .65));
    return 1 - t * t * (3 - 2 * t);
  }
  begin() { if (this.started) return false; this.started = true; this.elapsed = 0; return true; }
  advance(dt: number) { if (this.presenting && Number.isFinite(dt) && dt > 0) this.elapsed = Math.min(ROUND_OUTRO_SECONDS, this.elapsed + dt); }
  skip() { if (this.started) this.elapsed = ROUND_OUTRO_SECONDS; }
  reset() { this.started = false; this.elapsed = 0; }
}
