import { describe, expect, it } from 'vitest';
import { synthesizeAmbience, synthesizeSound, type SoundKind } from './soundDesign';

const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);

describe('cached procedural sound assets', () => {
  it('produces finite, click-safe, unclipped assets for every action', () => {
    const kinds: SoundKind[] = ['sand', 'metal', 'landSand', 'landMetal', 'rifle', 'pistol', 'bolt', 'reload', 'swap', 'knife', 'hurt', 'dry', 'hit', 'head', 'win', 'loss', 'draw'];
    for (const kind of kinds) {
      const samples = synthesizeSound(kind, 17);
      expect(samples.length).toBeGreaterThan(2000);
      expect(samples.every(sample => Number.isFinite(sample) && Math.abs(sample) <= 1)).toBe(true);
      expect(Math.abs(samples[0])).toBe(0); expect(Math.abs(samples.at(-1)!)).toBe(0);
      expect(rms(samples)).toBeGreaterThan(.001);
      expect(Math.abs(samples.reduce((sum, value) => sum + value, 0) / samples.length)).toBeLessThan(.001);
    }
  });

  it('varies boot grit reproducibly and gives landings greater weight', () => {
    const sand = synthesizeSound('sand', 13), second = synthesizeSound('sand', 29);
    expect(sand).toEqual(synthesizeSound('sand', 13));
    expect(sand).not.toEqual(second);
    expect(synthesizeSound('metal', 13)).not.toEqual(sand);
    expect(rms(synthesizeSound('landSand', 13))).toBeGreaterThan(rms(sand) * 1.15);
    expect(rms(synthesizeSound('landMetal', 13))).toBeGreaterThan(rms(synthesizeSound('metal', 13)) * 1.15);
  });

  it('keeps the stereo environment quiet, decorrelated and seamless at its loop boundary', () => {
    const [left, right] = synthesizeAmbience(123);
    expect(left.length).toBe(right.length);
    expect(left).not.toEqual(right);
    for (const channel of [left, right]) {
      expect(channel.every(value => Number.isFinite(value) && Math.abs(value) < .12)).toBe(true);
      expect(rms(channel)).toBeGreaterThan(.001);
      expect(rms(channel)).toBeLessThan(.025);
      expect(Math.abs(channel[0] - channel.at(-1)!)).toBeLessThan(.01);
    }
  });
});
