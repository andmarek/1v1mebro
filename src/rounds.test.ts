import { describe, expect, it } from 'vitest';
import { RoundController, normalizeRoundOptions } from './rounds';
const live = (options = { killLimit: 20, timeLimitSeconds: 300 }) => {
  const round = new RoundController(options); round.register('player', 'YOU'); round.register('bot:0', 'RANGE 01'); round.advance(3); return round;
};
describe('round configuration and clocks', () => {
  it('defaults to twenty kills and five minutes, and normalizes invalid input', () => {
    expect(normalizeRoundOptions()).toEqual({ killLimit: 20, timeLimitSeconds: 300 });
    expect(normalizeRoundOptions({ killLimit: NaN, timeLimitSeconds: Infinity })).toEqual({ killLimit: 20, timeLimitSeconds: 300 });
    expect(normalizeRoundOptions({ killLimit: -1, timeLimitSeconds: 90.9 })).toEqual({ killLimit: 0, timeLimitSeconds: 90 });
    expect(normalizeRoundOptions({ killLimit: 5000, timeLimitSeconds: 5000 })).toEqual({ killLimit: 1000, timeLimitSeconds: 3600 });
  });
  it('counts down three seconds before starting the match clock', () => {
    const round = new RoundController();
    expect(round.advance(1)).toBe(false); expect(round.countdownRemaining).toBe(2); expect(round.elapsedSeconds).toBe(0);
    expect(round.advance(2)).toBe(true); expect(round.phase).toBe('active'); expect(round.elapsedSeconds).toBe(0);
    expect(round.advance(1)).toBe(false); expect(round.timeRemaining).toBe(299);
  });
  it('carries countdown overshoot into active time and ends once at timeout', () => {
    const round = new RoundController({ killLimit: 0, timeLimitSeconds: 10 });
    expect(round.advance(5)).toBe(true); expect(round.elapsedSeconds).toBe(2);
    expect(round.advance(20)).toBe(true); expect(round.phase).toBe('finished'); expect(round.elapsedSeconds).toBe(10);
    expect(round.finishReason).toBe('time-limit'); expect(round.timeRemaining).toBe(0);
    expect(round.advance(20)).toBe(false); expect(round.elapsedSeconds).toBe(10);
  });
  it('ignores invalid elapsed steps and supports unlimited practice', () => {
    const round = live({ killLimit: 0, timeLimitSeconds: 0 });
    for (const step of [-1, NaN, Infinity, 0]) round.advance(step);
    expect(round.elapsedSeconds).toBe(0); round.advance(100000);
    round.recordStats('player', { kills: 10000 });
    expect(round.phase).toBe('active'); expect(round.timeRemaining).toBeNull(); expect(round.elapsedSeconds).toBe(100000);
  });
});
describe('scores and results', () => {
  it('ignores countdown score events, including registering unknown participants', () => {
    const round = new RoundController();
    expect(round.recordKill('stranger', 'victim')).toBe(false); expect(round.standings()).toEqual([]);
  });
  it('records firing, hits, quickscopes and deaths independently', () => {
    const round = live(); round.recordStats('player', { shots: 3, hits: 2 }); round.recordKill('player', 'bot:0', 250, true);
    expect(round.standings()[0]).toEqual({ id: 'player', name: 'YOU', kills: 1, deaths: 0, shots: 3, hits: 2, points: 250, quickscopes: 1 });
    expect(round.standings()[1].deaths).toBe(1);
  });
  it('finishes at a kill limit and includes the final victim death', () => {
    const round = live({ killLimit: 1, timeLimitSeconds: 300 });
    expect(round.recordKill('bot:0', 'player')).toBe(true); expect(round.finishReason).toBe('kill-limit');
    expect(round.snapshot.winnerIds).toEqual(['bot:0']); expect(round.standings()[1].deaths).toBe(1);
    expect(round.recordKill('player', 'bot:0')).toBe(false); expect(round.standings()[0].deaths).toBe(0);
  });
  it('rejects invalid increments, and does not allow accidental score decrements', () => {
    const round = live(); round.recordStats('player', { kills: NaN, deaths: -1, hits: Infinity, points: 12.9, shots: 0 });
    expect(round.standings()[0].points).toBe(12); expect(round.standings()[0].kills).toBe(0);
  });
  it('sorts deterministically by kills, fewest deaths, points, hits, then ID', () => {
    const round = live(); round.register('a'); round.register('b'); round.register('c');
    round.recordStats('a', { kills: 1, deaths: 1, points: 900 }); round.recordStats('b', { kills: 1, points: 100, hits: 2 });
    round.recordStats('c', { kills: 1, points: 100, hits: 1 });
    expect(round.standings().map(entry => entry.id)).toEqual(['b', 'c', 'a', 'bot:0', 'player']);
  });
  it('reports a shared victory for equal kill totals at timeout', () => {
    const round = live({ killLimit: 20, timeLimitSeconds: 1 }); round.recordKill('player', 'bot:0'); round.recordKill('bot:0', 'player');
    round.recordStats('player', { points: 1000 }); round.advance(1);
    expect(round.snapshot.winnerIds).toEqual(['player', 'bot:0']);
  });
  it('does not expose mutable configuration or score objects', () => {
    const round = live(); round.options.killLimit = 1; round.snapshot.standings[0].kills = 100;
    round.recordKill('player'); expect(round.phase).toBe('active'); expect(round.standings()[0].kills).toBe(1);
  });
  it('rematches preserve participant names and reset timers, results and scores', () => {
    const round = live({ killLimit: 1, timeLimitSeconds: 1 }); round.recordKill('player', 'bot:0'); round.reset();
    expect(round.phase).toBe('countdown'); expect(round.countdownRemaining).toBe(3); expect(round.elapsedSeconds).toBe(0);
    expect(round.finishReason).toBeNull(); expect(round.snapshot.winnerIds).toEqual([]); expect(round.options.killLimit).toBe(1);
    expect(round.standings().every(entry => entry.kills === 0 && entry.deaths === 0)).toBe(true);
    expect(round.standings().find(entry => entry.id === 'player')!.name).toBe('YOU');
    round.reset({ killLimit: 0, timeLimitSeconds: 0 }); expect(round.timeRemaining).toBeNull();
  });
  it('manual completion is idempotent and protects final stats', () => {
    const round = live(); round.recordStats('player', { shots: 1 });
    expect(round.finish()).toBe(true); expect(round.finish()).toBe(false); expect(round.finishReason).toBe('ended');
    round.recordStats('player', { shots: 1 }); expect(round.standings().find(entry => entry.id === 'player')!.shots).toBe(1);
  });
});
