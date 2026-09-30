export const REPLAY_SECONDS = 4;
export const REPLAY_HZ = 30;
export const REPLAY_TAIL_SECONDS = .65;
export type ReplayCue = { at: number; kind: 'sniper' | 'pistol' | 'knife' | 'hit' | 'headshot' | 'bolt' };
export type ReplayFrame = { at: number; pose: Float32Array };
export type ReplaySample = { before: ReplayFrame; after: ReplayFrame; mix: number };

/** A frozen visual clip. No simulation inputs, hit tests or damage are replayed. */
export class KillReplay {
  readonly start: number;
  readonly end: number;
  readonly duration: number;
  private cueIndex = 0;
  constructor(readonly frames: readonly ReplayFrame[], readonly cues: readonly ReplayCue[]) {
    this.start = frames[0].at; this.end = frames[frames.length - 1].at;
    this.duration = this.end - this.start + REPLAY_TAIL_SECONDS;
  }
  sample(elapsed: number): ReplaySample {
    const at = this.start + Math.max(0, Math.min(this.duration, elapsed));
    let index = 0;
    while (index + 1 < this.frames.length && this.frames[index + 1].at <= at) index++;
    const before = this.frames[index], after = this.frames[Math.min(index + 1, this.frames.length - 1)];
    return { before, after, mix: after.at > before.at ? Math.max(0, Math.min(1, (at - before.at) / (after.at - before.at))) : 0 };
  }
  drainCues(elapsed: number) {
    const due: ReplayCue[] = [], at = this.start + Math.max(0, elapsed);
    while (this.cueIndex < this.cues.length && this.cues[this.cueIndex].at <= at) due.push(this.cues[this.cueIndex++]);
    return due;
  }
}

/** Fixed-size, reusable pose buffers. Recording pauses with the simulation clock. */
export class ReplayRecorder {
  private readonly slots: ReplayFrame[];
  private next = 0;
  private count = 0;
  private lastAt = -Infinity;
  private cues: ReplayCue[] = [];
  constructor(width: number) {
    this.slots = Array.from({ length: REPLAY_SECONDS * REPLAY_HZ + 2 }, () => ({ at: 0, pose: new Float32Array(width) }));
  }
  get bytes() { return this.slots.length * this.slots[0].pose.byteLength; }
  record(at: number, capture: (pose: Float32Array) => void, force = false) {
    if (!Number.isFinite(at) || at < this.lastAt || (!force && at - this.lastAt < 1 / REPLAY_HZ)) return false;
    // A decisive shot can replace the same timestamp with its post-impact pose.
    const replace = this.count > 0 && at === this.lastAt;
    const slot = this.slots[replace ? (this.next - 1 + this.slots.length) % this.slots.length : this.next];
    capture(slot.pose); slot.at = at; this.lastAt = at;
    if (!replace) { this.next = (this.next + 1) % this.slots.length; this.count = Math.min(this.count + 1, this.slots.length); }
    this.cues = this.cues.filter(cue => cue.at >= at - REPLAY_SECONDS);
    return true;
  }
  cue(at: number, kind: ReplayCue['kind']) {
    if (!Number.isFinite(at)) return;
    this.cues.push({ at, kind });
    // A separate cap also bounds pathological hosts that enqueue without advancing.
    if (this.cues.length > 128) this.cues.shift();
  }
  clip(): KillReplay | null {
    const frames: ReplayFrame[] = [];
    for (let i = 0; i < this.count; i++) {
      const slot = this.slots[(this.next - this.count + i + this.slots.length) % this.slots.length];
      if (slot.at >= this.lastAt - REPLAY_SECONDS) frames.push({ at: slot.at, pose: slot.pose.slice() });
    }
    if (frames.length < 2 || frames[frames.length - 1].at - frames[0].at < .5) return null;
    return new KillReplay(frames, this.cues.filter(cue => cue.at >= frames[0].at && cue.at <= this.lastAt).map(cue => ({ ...cue })));
  }
  reset() { this.next = this.count = 0; this.lastAt = -Infinity; this.cues = []; }
}
