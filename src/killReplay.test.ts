import { describe, expect, it } from 'vitest';
import { ReplayRecorder, REPLAY_SECONDS, REPLAY_HZ, REPLAY_TAIL_SECONDS } from './killReplay';

describe('final kill recording', () => {
  it('bounds memory, evicts old history, and freezes a clip independently of reused slots', () => {
    const recorder = new ReplayRecorder(10), bytes = recorder.bytes;
    for (let i = 0; i <= 1000; i++) recorder.record(i / 30, pose => pose.fill(i), true);
    const clip = recorder.clip()!;
    expect(clip.frames.length).toBeLessThanOrEqual(REPLAY_SECONDS * REPLAY_HZ + 2);
    expect(clip.end - clip.start).toBeLessThanOrEqual(REPLAY_SECONDS);
    const first = clip.frames[0].pose[0];
    for (let i = 1001; i < 2000; i++) recorder.record(i / 30, pose => pose.fill(i), true);
    expect(clip.frames[0].pose[0]).toBe(first); expect(recorder.bytes).toBe(bytes);
  });
  it('forces the decisive post-shot frame and includes its sound at the exact end', () => {
    const recorder = new ReplayRecorder(1);
    recorder.record(1, pose => pose[0] = 0);
    recorder.record(2, pose => pose[0] = 1);
    recorder.cue(2, 'sniper'); recorder.cue(2, 'headshot');
    recorder.record(2, pose => pose[0] = 2, true);
    const clip = recorder.clip()!;
    expect(clip.frames).toHaveLength(2); expect(clip.frames[1].pose[0]).toBe(2);
    expect(clip.sample(.5).mix).toBe(.5);
    expect(clip.drainCues(.99)).toEqual([]);
    expect(clip.drainCues(1).map(cue => cue.kind)).toEqual(['sniper', 'headshot']);
    expect(clip.drainCues(1 + REPLAY_TAIL_SECONDS)).toEqual([]);
    expect(clip.sample(20).before.pose[0]).toBe(2);
  });
  it('rejects backward/invalid clocks, throttles capture and drops insufficient/rematch history', () => {
    const recorder = new ReplayRecorder(1), capture = () => {};
    expect(recorder.clip()).toBeNull(); recorder.record(0, capture);
    for (const at of [NaN, Infinity, -1, .001]) expect(recorder.record(at, capture)).toBe(false);
    recorder.record(.1, capture); expect(recorder.clip()).toBeNull();
    recorder.record(1, capture); recorder.cue(1, 'pistol'); expect(recorder.clip()).not.toBeNull();
    recorder.reset(); expect(recorder.clip()).toBeNull(); expect(recorder.record(0, capture)).toBe(true);
    recorder.record(1, capture); expect(recorder.clip()!.cues).toEqual([]);
  });
});
