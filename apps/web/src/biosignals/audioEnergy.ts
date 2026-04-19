/**
 * Microphone energy + onset detector — the third biosignal channel.
 *
 * face-api catches micro-expressions, HR catches sustained arousal, and this
 * catches the thing neither does: the involuntary VOCAL reaction. Gasps,
 * yelps, held breath breaking. It reads the mic's RMS energy, computes a
 * smoothed loudness floor, and fires a short-lived `onset` flag whenever
 * the instantaneous RMS spikes above the floor by a threshold (tuned to
 * sit above ambient room noise but below normal speech).
 *
 * Intentionally coarse — we are not doing voice activity detection, we are
 * looking for "did the player just react." The onset event is latched for
 * 1.5s so the biosignal tick downstream can pick it up regardless of
 * exactly when the 500ms poll lands.
 *
 * Note: requires a second getUserMedia call with `audio: true`. Title
 * screen already requests video; we piggyback audio in at game start.
 * Failure is non-fatal — the pipeline just treats audio as silent.
 */
export interface AudioEnergySnapshot {
  /** EMA-smoothed loudness 0-1, normalized against the session floor. */
  loudness: number;
  /** Instantaneous RMS this frame (0-1). */
  rmsNow: number;
  /** True if an onset (sudden spike) happened in the last 1.5s. */
  onset: boolean;
  /** Wall-clock ms of the most recent onset, 0 if none yet. */
  lastOnsetAt: number;
  /** Is the audio pipeline actually receiving samples? */
  active: boolean;
}

const EMPTY: AudioEnergySnapshot = {
  loudness: 0,
  rmsNow: 0,
  onset: false,
  lastOnsetAt: 0,
  active: false,
};

// Tuning
const ONSET_THRESHOLD_ABOVE_FLOOR = 0.18; // RMS must jump this much over floor
const MIN_ONSET_RMS = 0.12;               // Ignore quiet-room fluctuations
const ONSET_LATCH_MS = 1500;
const FLOOR_EMA = 0.02;                   // Very slow floor — takes ~50 frames to adapt
const LOUDNESS_EMA = 0.4;

export class AudioEnergyDetector {
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private buffer: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  private floor = 0.05;
  private loudnessEma = 0;
  private snap: AudioEnergySnapshot = { ...EMPTY };
  private pollHandle: number | null = null;

  onDiagnostic: ((msg: string) => void) | null = null;

  /**
   * Request microphone permission + spin up the analyser. Call from a user
   * gesture (game start). Resolves when mic is live or rejects on permission
   * denial; callers should treat rejection as non-fatal.
   */
  async init(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    });
    this.stream = stream;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new AC();
    const src = this.audioCtx.createMediaStreamSource(stream);
    const analyser = this.audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.2;
    src.connect(analyser);
    this.analyser = analyser;
    this.buffer = new Uint8Array(analyser.fftSize);
    this.snap = { ...EMPTY, active: true };
    // Some browsers require explicit resume() after mic grant.
    if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
    // Drive sampling at ~60Hz — cheap enough and gives us crisp onset detection.
    const loop = (): void => {
      this.sample();
      this.pollHandle = requestAnimationFrame(loop);
    };
    this.pollHandle = requestAnimationFrame(loop);
    this.onDiagnostic?.('mic live');
  }

  get snapshot(): AudioEnergySnapshot {
    return this.snap;
  }

  /** Called by the biosignal tick to consume + clear the onset flag. */
  consumeOnset(): boolean {
    const fired = this.snap.onset;
    if (fired) {
      // Keep lastOnsetAt for telemetry, but clear the flag so we don't
      // double-count the same onset in two consecutive ticks.
      this.snap = { ...this.snap, onset: false };
    }
    return fired;
  }

  dispose(): void {
    if (this.pollHandle !== null) cancelAnimationFrame(this.pollHandle);
    this.pollHandle = null;
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
    }
    if (this.audioCtx) void this.audioCtx.close();
    this.stream = null;
    this.audioCtx = null;
    this.analyser = null;
  }

  private sample(): void {
    if (!this.analyser) return;
    this.analyser.getByteTimeDomainData(this.buffer);
    // Compute RMS on the centered waveform (0-255 → -1..1).
    let sumSq = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const v = (this.buffer[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / this.buffer.length);

    // Adaptive floor — slow EMA so transient spikes don't pull it up.
    this.floor = this.floor * (1 - FLOOR_EMA) + rms * FLOOR_EMA;

    // Loudness 0-1 relative to the session floor.
    const relative = Math.max(0, rms - this.floor) * 4;
    const loudness = Math.min(1, relative);
    this.loudnessEma = this.loudnessEma * (1 - LOUDNESS_EMA) + loudness * LOUDNESS_EMA;

    // Onset: sudden spike above the floor that isn't just noise.
    const diff = rms - this.floor;
    const now = Date.now();
    let onset = this.snap.onset;
    let lastOnsetAt = this.snap.lastOnsetAt;
    if (diff > ONSET_THRESHOLD_ABOVE_FLOOR && rms > MIN_ONSET_RMS) {
      // Rising edge only — require the last onset to have latched out.
      if (now - lastOnsetAt > ONSET_LATCH_MS) {
        onset = true;
        lastOnsetAt = now;
        this.onDiagnostic?.(`mic onset rms=${rms.toFixed(2)}`);
      }
    }

    this.snap = {
      loudness: this.loudnessEma,
      rmsNow: rms,
      onset,
      lastOnsetAt,
      active: true,
    };
  }
}
