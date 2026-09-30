export const FINAL_IMPACT_SECONDS = .35;
export const ROUND_OUTRO_SECONDS = 3.4;
export type OutroStage = 'idle' | 'impact' | 'replay' | 'banner' | 'results';

/** Presentation clock only: finishing gameplay stays frozen throughout the outro. */
export class RoundOutro {
  private started = false;
  private replayDuration = 0;
  elapsed = 0;
  get stage(): OutroStage {
    return !this.started ? 'idle' : this.elapsed < FINAL_IMPACT_SECONDS ? 'impact' : this.elapsed < FINAL_IMPACT_SECONDS + this.replayDuration ? 'replay' : this.elapsed < ROUND_OUTRO_SECONDS + this.replayDuration ? 'banner' : 'results';
  }
  get presenting() { return this.stage === 'impact' || this.stage === 'replay' || this.stage === 'banner'; }
  get replayElapsed() { return Math.max(0, this.elapsed - FINAL_IMPACT_SECONDS); }
  get aimScale() {
    const t = Math.max(0, Math.min(1, (this.elapsed - this.replayDuration - FINAL_IMPACT_SECONDS) / .65));
    return 1 - t * t * (3 - 2 * t);
  }
  begin() { if (this.started) return false; this.started = true; this.elapsed = 0; return true; }
  scheduleReplay(duration: number) { if (this.stage === 'impact' && Number.isFinite(duration) && duration > 0) this.replayDuration = Math.min(8, duration); }
  advance(dt: number) { if (this.presenting && Number.isFinite(dt) && dt > 0) this.elapsed = Math.min(ROUND_OUTRO_SECONDS + this.replayDuration, this.elapsed + dt); }
  skipReplay() { if (this.stage === 'replay') this.elapsed = FINAL_IMPACT_SECONDS + this.replayDuration; }
  skip() { if (this.started) this.elapsed = ROUND_OUTRO_SECONDS + this.replayDuration; }
  reset() { this.started = false; this.elapsed = this.replayDuration = 0; }
}
