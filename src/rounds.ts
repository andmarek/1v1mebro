/** Shared match state. This module deliberately has no browser or rendering dependencies. */
export type RoundOptions = { killLimit: number; timeLimitSeconds: number };
export const DEFAULT_ROUND_OPTIONS: Readonly<RoundOptions> = { killLimit: 20, timeLimitSeconds: 300 };
export const PRACTICE_ROUND_OPTIONS: Readonly<RoundOptions> = { killLimit: 0, timeLimitSeconds: 0 };
export const ROUND_COUNTDOWN_SECONDS = 3;
export type RoundPhase = 'countdown' | 'active' | 'finished';
export type RoundFinishReason = 'kill-limit' | 'time-limit' | 'ended';
export type RoundStats = { kills: number; deaths: number; shots: number; hits: number; points: number; quickscopes: number };
export type ParticipantStats = RoundStats & { id: string; name: string };
export type RoundSnapshot = {
  phase: RoundPhase; options: RoundOptions; countdownRemaining: number; elapsedSeconds: number;
  timeRemaining: number | null; finishReason: RoundFinishReason | null; standings: ParticipantStats[];
  /** Equal kill leaders share victory, regardless of scoreboard ordering. */
  winnerIds: string[];
};
const emptyStats = (): RoundStats => ({ kills: 0, deaths: 0, shots: 0, hits: 0, points: 0, quickscopes: 0 });
const normalizeLimit = (value: unknown, fallback: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(value))) : fallback;
export function normalizeRoundOptions(options: Partial<RoundOptions> = {}): RoundOptions {
  return {
    killLimit: normalizeLimit(options.killLimit, DEFAULT_ROUND_OPTIONS.killLimit, 1000),
    timeLimitSeconds: normalizeLimit(options.timeLimitSeconds, DEFAULT_ROUND_OPTIONS.timeLimitSeconds, 3600),
  };
}
export class RoundController {
  private participants = new Map<string, ParticipantStats>();
  private configuration: RoundOptions;
  phase: RoundPhase = 'countdown';
  countdownRemaining = ROUND_COUNTDOWN_SECONDS;
  elapsedSeconds = 0;
  finishReason: RoundFinishReason | null = null;
  constructor(options: Partial<RoundOptions> = {}) { this.configuration = normalizeRoundOptions(options); }
  get options(): RoundOptions { return { ...this.configuration }; }
  get timeRemaining(): number | null {
    return this.configuration.timeLimitSeconds ? Math.max(0, this.configuration.timeLimitSeconds - this.elapsedSeconds) : null;
  }
  register(id: string, name?: string): void {
    const existing = this.participants.get(id);
    if (existing) { if (name !== undefined) existing.name = name; }
    else this.participants.set(id, { id, name: name ?? id, ...emptyStats() });
  }
  /** Registration survives rematches, but all scores and timers are fresh. */
  reset(options: Partial<RoundOptions> = this.configuration): void {
    this.configuration = normalizeRoundOptions(options);
    this.phase = 'countdown'; this.countdownRemaining = ROUND_COUNTDOWN_SECONDS;
    this.elapsedSeconds = 0; this.finishReason = null;
    for (const participant of this.participants.values()) Object.assign(participant, emptyStats());
  }
  /** Paused games simply do not call advance. Overshoot belongs to the following phase. */
  advance(dtSeconds: number): boolean {
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0 || this.phase === 'finished') return false;
    const before = this.phase;
    if (this.phase === 'countdown') {
      const countdownStep = Math.min(this.countdownRemaining, dtSeconds);
      this.countdownRemaining = Math.max(0, this.countdownRemaining - countdownStep);
      dtSeconds -= countdownStep;
      if (this.countdownRemaining > 0) return false;
      this.phase = 'active';
    }
    this.elapsedSeconds += dtSeconds;
    const limit = this.configuration.timeLimitSeconds;
    if (limit && this.elapsedSeconds >= limit) {
      this.elapsedSeconds = limit; this.finish('time-limit');
    }
    return before !== this.phase;
  }
  /** Applies one atomic score event. Events outside live play never change results. */
  recordStats(id: string, increment: Partial<RoundStats>): boolean {
    if (this.phase !== 'active') return false;
    this.register(id);
    const participant = this.participants.get(id)!;
    for (const field of Object.keys(emptyStats()) as (keyof RoundStats)[]) {
      const value = increment[field];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) participant[field] += Math.floor(value);
    }
    if (this.configuration.killLimit && participant.kills >= this.configuration.killLimit) return this.finish('kill-limit');
    return false;
  }
  /** Both sides of the last elimination are recorded before finishing the round. */
  recordKill(killerId: string, victimId?: string, points = 100, quickscope = false): boolean {
    if (this.phase !== 'active') return false;
    if (victimId) this.recordStats(victimId, { deaths: 1 });
    return this.recordStats(killerId, { kills: 1, points, quickscopes: quickscope ? 1 : 0 });
  }
  standings(): ParticipantStats[] {
    return [...this.participants.values()].map(entry => ({ ...entry })).sort((a, b) =>
      b.kills - a.kills || a.deaths - b.deaths || b.points - a.points || b.hits - a.hits ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  get snapshot(): RoundSnapshot {
    const standings = this.standings(), topKills = standings[0]?.kills;
    return {
      phase: this.phase, options: this.options, countdownRemaining: this.countdownRemaining,
      elapsedSeconds: this.elapsedSeconds, timeRemaining: this.timeRemaining, finishReason: this.finishReason,
      standings, winnerIds: this.phase === 'finished' ? standings.filter(entry => entry.kills === topKills).map(entry => entry.id) : [],
    };
  }
  finish(reason: RoundFinishReason = 'ended'): boolean {
    if (this.phase === 'finished') return false;
    this.phase = 'finished'; this.finishReason = reason; return true;
  }
}
