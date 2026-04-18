import type { VoiceEngine } from './voiceEngine';
import type { AmbientBus } from './ambientBus';

export interface AmbientBedOptions {
  dronePrompt: string;
  droneSeconds?: number;
  gain?: number;
}

/**
 * Generates a long drone via ElevenLabs Sound Generation once, caches forever,
 * then loops it through the AmbientBus. The bus is what AmbientBus.duck() ducks.
 *
 * A drone is non-localized — we do NOT spatialize it (no PannerNode). It
 * surrounds the player equally, which is how real ambient beds work.
 */
export class AmbientBed {
  private source: AudioBufferSourceNode | null = null;
  private nodeGain: GainNode | null = null;
  private buffer: AudioBuffer | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly engine: VoiceEngine,
    private readonly bus: AmbientBus,
    private readonly opts: AmbientBedOptions,
  ) {}

  async start(): Promise<void> {
    if (this.source) return;
    if (!this.buffer) {
      this.buffer = await this.engine.generateSFX({
        text: this.opts.dronePrompt,
        durationSeconds: this.opts.droneSeconds ?? 22,
        promptInfluence: 0.7,
      });
    }
    this.nodeGain = this.ctx.createGain();
    this.nodeGain.gain.value = 0;
    this.nodeGain.connect(this.bus.input);

    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.loop = true;
    this.source.connect(this.nodeGain);
    this.source.start();

    // Fade in over 1.5s so it doesn't pop
    const now = this.ctx.currentTime;
    this.nodeGain.gain.setValueAtTime(0, now);
    this.nodeGain.gain.linearRampToValueAtTime(this.opts.gain ?? 1, now + 1.5);
  }

  stop(fadeSeconds = 0.8): void {
    if (!this.source || !this.nodeGain) return;
    const src = this.source;
    const gn = this.nodeGain;
    const now = this.ctx.currentTime;
    gn.gain.cancelScheduledValues(now);
    gn.gain.setValueAtTime(gn.gain.value, now);
    gn.gain.linearRampToValueAtTime(0, now + fadeSeconds);
    setTimeout(() => {
      try { src.stop(); } catch { /* already stopped */ }
      try { gn.disconnect(); } catch { /* ignore */ }
    }, fadeSeconds * 1000 + 50);
    this.source = null;
    this.nodeGain = null;
  }

  isPlaying(): boolean {
    return this.source !== null;
  }
}
