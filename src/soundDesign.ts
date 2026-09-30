/** Original, offline sound design. Generated once and reused, never filled during a frame. */
export type SoundKind = 'sand' | 'metal' | 'landSand' | 'landMetal' | 'rifle' | 'pistol' | 'bolt' | 'reload' | 'swap' | 'knife' | 'hurt' | 'dry' | 'hit' | 'head' | 'win' | 'loss' | 'draw';
export const SOUND_SAMPLE_RATE = 24000;

export function randomStream(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function synthesizeSound(kind: SoundKind, seed: number, rate = SOUND_SAMPLE_RATE): Float32Array<ArrayBuffer> {
  const random = randomStream(seed);
  const duration = kind === 'rifle' ? .85 : kind === 'pistol' ? .4 : kind === 'reload' ? .65 : ['win', 'loss', 'draw'].includes(kind) ? 1.1 : .42;
  const samples = new Float32Array(Math.ceil(duration * rate));
  const addImpact = (at: number, length: number, level: number, cutoff: number) => {
    let low = 0;
    const alpha = 1 - Math.exp(-2 * Math.PI * cutoff / rate);
    const start = Math.floor(at * rate), end = Math.min(samples.length, start + Math.ceil(length * rate));
    for (let index = start; index < end; index++) {
      const time = (index - start) / rate;
      low += ((random() * 2 - 1) - low) * alpha;
      const envelope = Math.min(1, time / .0015) * Math.exp(-time * 6 / length);
      samples[index] += low * envelope * level;
    }
  };
  const resonate = (at: number, length: number, level: number, frequency: number, glide = 0) => {
    const start = Math.floor(at * rate), end = Math.min(samples.length, start + Math.ceil(length * rate));
    for (let index = start; index < end; index++) {
      const time = (index - start) / rate;
      const envelope = Math.min(1, time / .002) * Math.exp(-time * 7 / length);
      samples[index] += Math.sin(2 * Math.PI * (frequency * time + glide * time * time / 2)) * level * envelope;
    }
  };
  const boot = (metal: boolean, landing: boolean) => {
    const weight = landing ? 1.45 : 1;
    // Heel compresses first, followed by the sole rolling over grit and a quiet cloth movement.
    addImpact(.005, .095, .78 * weight, 190);
    resonate(.003, .105, .12 * weight, 76 + random() * 16, -140);
    addImpact(.036, .13, .19 * weight, metal ? 3300 : 1600);
    addImpact(.078, .22, .09, 560);
    for (let grain = 0; grain < (landing ? 25 : 16); grain++) {
      addImpact(.028 + random() ** .65 * .12, .006 + random() * .014, .055 + random() * .07, 2200 + random() * 3500);
    }
    if (metal) {
      // A loaded stair tread resonates briefly, rather than sounding like a bell.
      for (const [frequency, level] of [[147, .09], [283, .045], [617, .035], [1139, .016]]) {
        resonate(.009, .2 + random() * .09, level * weight, frequency * (.96 + random() * .08));
      }
      addImpact(.014, .035, .13, 5100);
    }
    if (landing) addImpact(.02, .28, .19, 320);
  };
  switch (kind) {
    case 'sand': boot(false, false); break;
    case 'metal': boot(true, false); break;
    case 'landSand': boot(false, true); break;
    case 'landMetal': boot(true, true); break;
    case 'rifle':
      addImpact(0, .05, 1.7, 7800); addImpact(.008, .22, .85, 2600);
      resonate(.003, .19, .48, 83, -190); addImpact(.045, .7, .26, 1600);
      // Short scattered outdoor reflections; no indoor echo in this open yard.
      addImpact(.085, .17, .09, 1800); addImpact(.147, .22, .055, 1100);
      break;
    case 'pistol':
      addImpact(0, .035, 1.35, 8500); addImpact(.004, .12, .65, 2900);
      resonate(.002, .11, .28, 126, -360); addImpact(.046, .29, .14, 2200);
      addImpact(.032, .016, .13, 5500); break;
    case 'bolt':
      addImpact(0, .04, .7, 4900); addImpact(.07, .08, .34, 3100); addImpact(.15, .035, .65, 5700);
      resonate(.153, .035, .1, 1750); break;
    case 'reload':
      addImpact(0, .05, .45, 3400); addImpact(.09, .16, .24, 800);
      addImpact(.3, .07, .6, 2900); addImpact(.47, .07, .65, 4900);
      resonate(.473, .03, .06, 1410); break;
    case 'swap': addImpact(0, .2, .24, 690); addImpact(.14, .032, .36, 3200); break;
    case 'knife': addImpact(.035, .22, .39, 1700); addImpact(.008, .06, .18, 530); break;
    case 'hurt': addImpact(0, .09, .46, 420); resonate(.004, .12, .1, 64); break;
    case 'dry': addImpact(0, .02, .55, 4700); resonate(.001, .025, .065, 1920); break;
    case 'hit': case 'head':
      addImpact(0, .018, .38, 6000); resonate(.003, .045, .065, kind === 'head' ? 2100 : 1450);
      if (kind === 'head') addImpact(.04, .014, .25, 5100); break;
    case 'win': case 'loss': case 'draw': {
      // A restrained low cue leaves the final gunshot and hit feedback audible.
      const base = kind === 'loss' ? 98 : kind === 'win' ? 146.83 : 130.81;
      resonate(.12, .85, .085, base); resonate(.23, .7, .045, base * (kind === 'loss' ? 1.19 : 1.5));
      addImpact(.1, .4, .065, 300); break;
    }
  }
  // Remove any residual DC and soften the first/last sample, keeping bounded peaks.
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  for (let index = 0; index < samples.length; index++) {
    const edge = Math.min(1, index / 24, (samples.length - 1 - index) / 120);
    samples[index] = Math.tanh((samples[index] - mean) * 1.15) * edge;
  }
  return samples;
}

/** A seamless stereo bed: filtered gusts, distant machinery and sparse sheet-metal creaks. */
export function synthesizeAmbience(seed: number, rate = SOUND_SAMPLE_RATE): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const duration = 18, length = duration * rate;
  const channels: [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] = [new Float32Array(length), new Float32Array(length)];
  const random = randomStream(seed);
  const creaks = Array.from({ length: 3 }, (_, index) => ({
    at: 2 + index * 5 + random() * 1.5, frequency: 115 + random() * 125, side: random(),
  }));
  for (let channel = 0; channel < 2; channel++) {
    let low = 0, body = 0;
    for (let index = 0; index < length; index++) {
      const time = index / rate;
      const noise = random() * 2 - 1;
      low += (noise - low) * .012; body += (noise - body) * .12;
      const gust = .36 + .24 * Math.sin(2 * Math.PI * time / duration + channel * .3) + .14 * Math.sin(6 * Math.PI * time / duration + 1.3);
      let value = low * gust * .48 + (body - low) * gust * .055;
      value += Math.sin(2 * Math.PI * 58 * time) * .0015;
      for (const creak of creaks) {
        const age = time - creak.at;
        if (age > 0 && age < 1.5) {
          const envelope = Math.sin(Math.PI * age / 1.5) ** 2;
          const pan = channel === 0 ? 1 - creak.side : creak.side;
          value += Math.sin(2 * Math.PI * (creak.frequency * age + 3 * Math.sin(age * 3))) * envelope * .006 * pan;
        }
      }
      channels[channel][index] = value;
    }
    // Crossfade the tail into the beginning so looping does not produce a click.
    const fade = Math.floor(rate * .35);
    for (let index = 0; index < fade; index++) {
      const amount = index / (fade - 1);
      const tail = length - fade + index;
      channels[channel][tail] = channels[channel][tail] * (1 - amount) + channels[channel][index] * amount;
    }
  }
  // The beginning consumed by the crossfade is omitted: the tail now flows into
  // the next sample after that beginning, rather than replaying the overlap.
  const overlap = Math.floor(rate * .35);
  return [channels[0].subarray(overlap), channels[1].subarray(overlap)];
}
