import { afterEach, describe, expect, it, vi } from 'vitest';
import { RangeAudio } from './audio';

class FakeParam {
  value = 0;
  targets: number[] = [];
  cancelScheduledValues() {}
  setTargetAtTime(value: number) { this.targets.push(value); this.value = value; }
}
class FakeNode {
  connections: FakeNode[] = [];
  connect(node: FakeNode) { this.connections.push(node); }
  disconnect() { this.connections = []; }
}
class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakeSource extends FakeNode {
  buffer?: unknown;
  loop = false;
  playbackRate = new FakeParam();
  onended?: () => void;
  starts = 0;
  start() { this.starts++; }
}
class FakeContext {
  static last: FakeContext;
  state = 'suspended';
  currentTime = 1;
  destination = new FakeNode();
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  resumes = 0;
  constructor() { FakeContext.last = this; }
  createGain() { const node = new FakeGain(); this.gains.push(node); return node; }
  createBufferSource() { const node = new FakeSource(); this.sources.push(node); return node; }
  createBuffer() { return { copyToChannel() {} }; }
  async resume() { this.resumes++; this.state = 'running'; }
}

afterEach(() => vi.unstubAllGlobals());

describe('audio lifecycle', () => {
  it('starts one ambience bed across rematches and fades it out when play stops', async () => {
    vi.stubGlobal('AudioContext', FakeContext);
    const audio = new RangeAudio();
    audio.setActive(true);
    await audio.start(); await audio.start();
    const context = FakeContext.last;
    expect(context.sources.filter(source => source.loop)).toHaveLength(1);
    expect(context.resumes).toBe(1);
    const ambience = context.sources[0], ambienceGain = ambience.connections[0] as FakeGain;
    expect(ambienceGain.gain.value).toBeGreaterThan(0);
    audio.setActive(false);
    expect(ambienceGain.gain.targets.at(-1)).toBe(0);
    audio.setActive(true);
    expect(ambienceGain.gain.targets.at(-1)).toBeGreaterThan(0);
    expect(context.sources).toHaveLength(1);
  });

  it('routes every sound through master volume, including ambience and the result cue', async () => {
    vi.stubGlobal('AudioContext', FakeContext);
    const audio = new RangeAudio(); audio.volume = .2;
    await audio.start();
    const context = FakeContext.last, master = context.gains[0];
    expect(master.gain.value).toBe(.2);
    audio.step('metal', .5); audio.land('sand', 1.4); audio.roundEnd('win'); audio.shot(); audio.botShot(20);
    for (const source of context.sources) {
      const gain = source.connections[0];
      expect(gain.connections).toContain(master);
    }
    expect(master.connections).toContain(context.destination);
    audio.volume = 0;
    expect(master.gain.targets.at(-1)).toBe(0);
    const count = context.sources.length;
    audio.step(); audio.shot(); audio.roundEnd('draw');
    expect(context.sources).toHaveLength(count);
    audio.volume = 2; expect(audio.volume).toBe(1);
    audio.volume = Number.NaN; expect(audio.volume).toBe(1);
  });

  it('does not allocate audio before a user gesture and cleans up finished one-shots', async () => {
    vi.stubGlobal('AudioContext', FakeContext);
    const audio = new RangeAudio();
    audio.step(); audio.land(); audio.shot();
    await audio.start();
    const context = FakeContext.last;
    expect(context.sources).toHaveLength(1);
    audio.step();
    const source = context.sources.at(-1)!, gain = source.connections[0];
    expect(source.loop).toBe(false); expect(source.starts).toBe(1);
    source.onended?.();
    expect(source.connections).toHaveLength(0); expect(gain.connections).toHaveLength(0);
    const count = context.sources.length;
    audio.step('sand', Number.NaN); audio.land('metal', Number.POSITIVE_INFINITY); audio.botShot(Number.NaN);
    expect(context.sources).toHaveLength(count);
  });
});
