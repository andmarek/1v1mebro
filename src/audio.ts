export class RangeAudio {
  private ctx?: AudioContext;
  volume = 0.5;
  async start() {
    this.ctx ??= new AudioContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }
  private tone(frequency: number, duration: number, volume: number, type: OscillatorType = 'sine', delay = 0) {
    if (!this.ctx || this.volume === 0) return;
    const t = this.ctx.currentTime + delay, osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(frequency, t); osc.frequency.exponentialRampToValueAtTime(frequency * 0.45, t + duration);
    gain.gain.setValueAtTime(volume * this.volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain); gain.connect(this.ctx.destination); osc.start(t); osc.stop(t + duration);
  }
  private noise(duration: number, volume: number, cutoff: number) {
    if (!this.ctx || this.volume === 0) return;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * duration, this.ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
    const source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume * this.volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination); source.start();
  }
  shot() { this.noise(0.3, 0.62, 4300); this.tone(115, 0.27, 0.65); this.tone(67, 0.22, 0.18, 'triangle', 0.09); }
  pistolShot() { this.noise(.12, .4, 5600); this.tone(175, .11, .38); this.tone(650, .025, .05, 'triangle', .05); }
  swap() { this.noise(.09, .075, 1700); this.tone(480, .035, .035, 'triangle', .09); }
  melee() { this.noise(.22, .14, 1200); }
  botShot(distance: number) { const level = Math.max(.025, .18 / (1 + distance / 12)); this.noise(.13, level, 3600); this.tone(155, .1, level); }
  hurt() { this.noise(.08, .1, 500); this.tone(65, .12, .14); }
  bolt() { this.noise(0.065, 0.17, 2800); this.tone(420, 0.045, 0.07, 'square'); }
  hit(head: boolean) { this.tone(head ? 1300 : 950, 0.12, 0.18, 'triangle'); this.tone(1900, 0.1, 0.1, 'sine', 0.025); }
  reload() { this.noise(0.14, 0.12, 2200); this.tone(300, 0.08, 0.09, 'square'); }
  step() { this.noise(0.09, 0.065, 500); }
  dry() { this.tone(240, 0.04, 0.1, 'square'); }
}
