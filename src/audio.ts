import { SOUND_SAMPLE_RATE, synthesizeAmbience, synthesizeSound, type SoundKind } from './soundDesign';

export type FootstepSurface = 'sand' | 'metal';
const VARIANTS = 5;
const SOUND_KINDS: SoundKind[] = ['sand', 'metal', 'landSand', 'landMetal', 'rifle', 'pistol', 'bolt', 'reload', 'swap', 'knife', 'hurt', 'dry', 'hit', 'head', 'win', 'loss', 'draw'];

export class RangeAudio {
  private ctx?: AudioContext;
  private master?: GainNode;
  private ambienceGain?: GainNode;
  private ambienceSource?: AudioBufferSourceNode;
  private sounds = new Map<SoundKind, AudioBuffer[]>();
  private volumeValue = .5;
  private active = false;
  private lastVariant = new Map<SoundKind, number>();

  get volume() { return this.volumeValue; }
  set volume(value: number) {
    if (!Number.isFinite(value)) return;
    this.volumeValue = Math.max(0, Math.min(1, value));
    if (this.ctx && this.master) {
      const gain = this.master.gain, now = this.ctx.currentTime;
      gain.cancelScheduledValues(now);
      gain.setTargetAtTime(this.volumeValue, now, .025);
    }
  }

  async start() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volumeValue;
      this.master.connect(this.ctx.destination);
      for (const [kindIndex, kind] of SOUND_KINDS.entries()) {
        const count = ['sand', 'metal', 'landSand', 'landMetal'].includes(kind) ? VARIANTS : 2;
        const buffers: AudioBuffer[] = [];
        for (let variant = 0; variant < count; variant++) {
          const samples = synthesizeSound(kind, 1507 + kindIndex * 191 + variant * 71);
          const buffer = this.ctx.createBuffer(1, samples.length, SOUND_SAMPLE_RATE);
          buffer.copyToChannel(samples, 0); buffers.push(buffer);
        }
        this.sounds.set(kind, buffers);
      }
      const channels = synthesizeAmbience(7907);
      const ambience = this.ctx.createBuffer(2, channels[0].length, SOUND_SAMPLE_RATE);
      channels.forEach((samples, channel) => ambience.copyToChannel(samples, channel));
      this.ambienceSource = this.ctx.createBufferSource();
      this.ambienceSource.buffer = ambience; this.ambienceSource.loop = true;
      this.ambienceGain = this.ctx.createGain();
      this.ambienceGain.gain.value = this.active ? .8 : 0;
      this.ambienceSource.connect(this.ambienceGain); this.ambienceGain.connect(this.master);
      this.ambienceSource.start();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  /** Only the ambience bed is gated; the final shot/sting can decay over the match bumper. */
  setActive(active: boolean) {
    this.active = active;
    if (!this.ctx || !this.ambienceGain) return;
    const now = this.ctx.currentTime, gain = this.ambienceGain.gain;
    gain.cancelScheduledValues(now); gain.setTargetAtTime(active ? .8 : 0, now, active ? .45 : .075);
  }

  private play(kind: SoundKind, level = 1, rate = 1) {
    if (!this.ctx || !this.master || this.volumeValue === 0) return;
    const buffers = this.sounds.get(kind);
    if (!buffers) return;
    // Avoid the same boot sample twice in a row without cycling predictably.
    const previous = this.lastVariant.get(kind) ?? -1;
    let variant = Math.floor(Math.random() * buffers.length);
    if (variant === previous) variant = (variant + 1) % buffers.length;
    this.lastVariant.set(kind, variant);
    const source = this.ctx.createBufferSource(), gain = this.ctx.createGain();
    source.buffer = buffers[variant];
    source.playbackRate.value = rate;
    gain.gain.value = level;
    source.connect(gain); gain.connect(this.master);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.start();
  }

  shot() { this.play('rifle', .8, .98 + Math.random() * .04); }
  pistolShot() { this.play('pistol', .65, .98 + Math.random() * .04); }
  swap() { this.play('swap', .25); }
  melee() { this.play('knife', .4); }
  botShot(distance: number) {
    if (!Number.isFinite(distance)) return;
    this.play('rifle', Math.max(.025, .38 / (1 + Math.max(0, distance) / 11)), .94);
  }
  hurt() { this.play('hurt', .4); }
  bolt() { this.play('bolt', .31); }
  hit(head: boolean) { this.play(head ? 'head' : 'hit', head ? .45 : .35); }
  reload() { this.play('reload', .3); }
  dry() { this.play('dry', .28); }
  step(surface: FootstepSurface = 'sand', intensity = 1) {
    if (!Number.isFinite(intensity)) return;
    this.play(surface, .28 * Math.max(.15, Math.min(1.5, intensity)) * (.9 + Math.random() * .2), .93 + Math.random() * .14);
  }
  land(surface: FootstepSurface = 'sand', intensity = 1) {
    if (!Number.isFinite(intensity)) return;
    this.play(surface === 'metal' ? 'landMetal' : 'landSand', .33 * Math.max(.2, Math.min(1.8, intensity)), .96 + Math.random() * .08);
  }
  roundEnd(outcome: 'win' | 'loss' | 'draw') { this.play(outcome, .7); }
}
