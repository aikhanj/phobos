/**
 * A single-channel gain node for ambient audio with scheduled ducking.
 * Sits between ambient sources (drones, creaks) and the master bus.
 *
 * Ducking is smooth (linear ramps, not step changes) so it never pops.
 * While ducked, a whisper or stinger played at full gain on a parallel path
 * to master will have ~14dB more headroom — which is what makes horror
 * audio land. Dynamic range is the trick.
 */
export class AmbientBus {
  private readonly gain: GainNode;
  private baseline: number;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    baseline = 0.35,
  ) {
    this.baseline = baseline;
    this.gain = ctx.createGain();
    this.gain.gain.value = baseline;
    this.gain.connect(destination);
  }

  get input(): AudioNode {
    return this.gain;
  }

  /**
   * Duck to `amount * baseline` over 200ms, hold for the middle, then
   * ramp back to baseline by `seconds`. Safe to call while already ducking —
   * cancels pending ramps and anchors from current value.
   */
  duck(seconds: number, amount = 0.2): void {
    const now = this.ctx.currentTime;
    const target = this.baseline * amount;
    const g = this.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(target, now + 0.2);
    const holdEnd = Math.max(now + 0.2, now + seconds - 0.3);
    g.setValueAtTime(target, holdEnd);
    g.linearRampToValueAtTime(this.baseline, now + seconds);
  }

  setBaseline(v: number): void {
    this.baseline = Math.max(0, Math.min(1, v));
    const now = this.ctx.currentTime;
    const g = this.gain.gain;
    g.cancelScheduledValues(now);
    g.linearRampToValueAtTime(this.baseline, now + 0.15);
  }
}
