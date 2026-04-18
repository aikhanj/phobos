/**
 * Web Audio post-processing chain for Playmate-style robotic horror voice.
 *
 * Signal path:
 *   input → pitchGain → bitcrusher → ringModGain → clipper → bandpass → output
 *
 * Fear level (0-1) continuously modulates distortion intensity:
 *   low fear  = uncanny flat TTS
 *   high fear = machine speaking through broken electronics
 */

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function makeBitcrushCurve(bits: number): Float32Array<ArrayBuffer> {
  const samples = 8192;
  const buf = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buf);
  const levels = Math.pow(2, bits);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1; // -1 to 1
    curve[i] = Math.round(x * levels) / levels;
  }
  return curve;
}

function makeClipCurve(drive: number): Float32Array<ArrayBuffer> {
  const samples = 8192;
  const buf = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buf);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = x * drive / (1 + Math.abs(x * drive));
  }
  return curve;
}

export class HorrorVoiceFX {
  readonly input: GainNode;
  readonly output: GainNode;

  private readonly bitcrusher: WaveShaperNode;
  private readonly clipper: WaveShaperNode;
  private readonly ringModOsc: OscillatorNode;
  private readonly ringModGain: GainNode;
  private readonly bandpass: BiquadFilterNode;
  private readonly ctx: AudioContext;

  private fear = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    // Input gain — used to set playbackRate on source externally
    this.input = ctx.createGain();
    this.input.gain.value = 1;

    // Bitcrusher — staircase waveshaper
    this.bitcrusher = ctx.createWaveShaper();
    this.bitcrusher.curve = makeBitcrushCurve(8);
    this.bitcrusher.oversample = 'none';

    // Ring modulator — oscillator modulating a gain node
    this.ringModOsc = ctx.createOscillator();
    this.ringModOsc.type = 'sine';
    this.ringModOsc.frequency.value = 30;
    this.ringModOsc.start();

    this.ringModGain = ctx.createGain();
    this.ringModGain.gain.value = 0; // modulated by oscillator
    this.ringModOsc.connect(this.ringModGain.gain);

    // Clipper / distortion
    this.clipper = ctx.createWaveShaper();
    this.clipper.curve = makeClipCurve(1.5);
    this.clipper.oversample = '2x';

    // Bandpass — intercom / radio quality
    this.bandpass = ctx.createBiquadFilter();
    this.bandpass.type = 'bandpass';
    this.bandpass.frequency.value = 1200;
    this.bandpass.Q.value = 0.8;

    // Output gain
    this.output = ctx.createGain();
    this.output.gain.value = 1;

    // Wire: input → bitcrusher → ringModGain → clipper → bandpass → output
    this.input.connect(this.bitcrusher);
    this.bitcrusher.connect(this.ringModGain);
    this.ringModGain.connect(this.clipper);
    this.clipper.connect(this.bandpass);
    this.bandpass.connect(this.output);

    this.setFear(0);
  }

  /**
   * Update distortion intensity based on fear level (0-1).
   *
   * | fear       | Pitch  | Bits | Ring Hz | Clip  | Perceptual        |
   * |------------|--------|------|---------|-------|-------------------|
   * | 0.0 - 0.3  | -4 st  |  8   |  30     | mild  | Uncanny TTS       |
   * | 0.3 - 0.6  | -5 st  |  6   |  45     | med   | Broken radio      |
   * | 0.6 - 0.8  | -6 st  |  5   |  60     | hard  | Corrupted signal  |
   * | 0.8 - 1.0  | -7 st  |  4   |  80     | sev   | Machine speaking  |
   */
  setFear(level: number): void {
    this.fear = Math.max(0, Math.min(1, level));
    const f = this.fear;
    const now = this.ctx.currentTime;

    // Bitcrusher: 8-bit → 4-bit
    const bits = Math.round(lerp(8, 4, f));
    this.bitcrusher.curve = makeBitcrushCurve(bits);

    // Ring modulator frequency: 30Hz → 80Hz
    const ringHz = lerp(30, 80, f);
    this.ringModOsc.frequency.setValueAtTime(ringHz, now);

    // Clipper drive: mild (1.5) → severe (4.0)
    const drive = lerp(1.5, 4.0, f);
    this.clipper.curve = makeClipCurve(drive);

    // Bandpass narrows with fear: Q 0.8 → 1.8
    const q = lerp(0.8, 1.8, f);
    this.bandpass.Q.setValueAtTime(q, now);
  }

  /**
   * Returns the playbackRate multiplier for pitch shifting.
   * Caller should set AudioBufferSourceNode.playbackRate to this value.
   * -4 semitones (fear=0) to -7 semitones (fear=1).
   */
  getPlaybackRate(): number {
    const semitones = lerp(-4, -7, this.fear);
    return Math.pow(2, semitones / 12);
  }

  getFear(): number {
    return this.fear;
  }

  dispose(): void {
    try { this.ringModOsc.stop(); } catch { /* already stopped */ }
    try { this.input.disconnect(); } catch { /* ignore */ }
    try { this.output.disconnect(); } catch { /* ignore */ }
  }
}
