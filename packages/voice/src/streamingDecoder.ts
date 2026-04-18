function pcm16LEToFloat32(bytes: Uint8Array): Float32Array<ArrayBuffer> {
  const sampleCount = bytes.length >> 1;
  const out = new Float32Array(sampleCount);
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
  for (let i = 0; i < sampleCount; i++) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
}

/**
 * Accepts PCM 16-bit LE bytes, schedules each chunk on a running playhead so
 * the first chunk plays as soon as it arrives (with a small lead time to
 * absorb network jitter). After end() is called, toAudioBuffer() returns a
 * concatenation of every sample received — useful for post-stream caching.
 *
 * Odd-length chunks are held in a 1-byte leftover until the next chunk pairs
 * them, so no samples are dropped.
 */
export class StreamingPCMPlayer {
  private playheadTime: number;
  private sources: AudioBufferSourceNode[] = [];
  private chunks: Float32Array<ArrayBuffer>[] = [];
  private leftover: Uint8Array | null = null;
  private stopped = false;
  private readonly LEAD_TIME = 0.1;

  constructor(
    private readonly ctx: AudioContext,
    private readonly destination: AudioNode,
    private readonly sampleRate: number,
  ) {
    this.playheadTime = ctx.currentTime + this.LEAD_TIME;
  }

  feed(chunk: Uint8Array): void {
    if (this.stopped) return;

    let bytes: Uint8Array = chunk;
    if (this.leftover) {
      const combined = new Uint8Array(this.leftover.length + chunk.length);
      combined.set(this.leftover);
      combined.set(chunk, this.leftover.length);
      bytes = combined;
      this.leftover = null;
    }

    if (bytes.length & 1) {
      this.leftover = bytes.slice(-1);
      bytes = bytes.slice(0, -1);
    }
    if (bytes.length === 0) return;

    const samples = pcm16LEToFloat32(bytes);
    this.chunks.push(samples);

    const buffer = this.ctx.createBuffer(1, samples.length, this.sampleRate);
    buffer.copyToChannel(samples, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.destination);

    // If the network stalled and playhead fell behind, reschedule forward
    const now = this.ctx.currentTime;
    if (this.playheadTime < now) {
      this.playheadTime = now + 0.02;
    }

    src.start(this.playheadTime);
    this.playheadTime += buffer.duration;
    this.sources.push(src);
  }

  end(): void {
    // No-op for now — marker for future buffering logic
  }

  stop(): void {
    this.stopped = true;
    for (const src of this.sources) {
      try { src.stop(); } catch { /* already stopped */ }
    }
    this.sources = [];
  }

  getPlayheadEnd(): number {
    return this.playheadTime;
  }

  toAudioBuffer(): AudioBuffer {
    const total = this.chunks.reduce((s, c) => s + c.length, 0);
    const buffer = this.ctx.createBuffer(1, Math.max(total, 1), this.sampleRate);
    const channel = buffer.getChannelData(0);
    let offset = 0;
    for (const c of this.chunks) {
      channel.set(c, offset);
      offset += c.length;
    }
    return buffer;
  }
}
