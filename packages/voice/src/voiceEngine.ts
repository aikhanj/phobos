import { VoiceProxyClient } from './client';
import { StreamingPCMPlayer } from './streamingDecoder';
import { createSpatialNode, updateListener as updateListenerImpl } from './spatial';
import { HorrorVoiceFX } from './horrorFx';
import type {
  VoiceEngineOptions,
  VoiceOptions,
  SpeakHandle,
  SFXOptions,
  PlayHandle,
  Vec3,
} from './types';

const DEFAULT_CACHE_SIZE = 50;
const DEFAULT_MODEL = 'eleven_turbo_v2_5';
const DEFAULT_SAMPLE_RATE: 22050 = 22050;

export class VoiceEngine {
  readonly ctx: AudioContext;
  private readonly destination: AudioNode;
  private readonly client: VoiceProxyClient;
  private readonly defaultVoiceId: string | undefined;
  private readonly defaultModelId: string;
  private readonly cacheEnabled: boolean;
  private readonly cacheSize: number;
  private readonly debug: boolean;
  private horrorFear = 0;

  private readonly buffers = new Map<string, AudioBuffer>();

  constructor(opts: VoiceEngineOptions) {
    this.ctx = opts.context;
    this.destination = opts.destination;
    this.client = new VoiceProxyClient(opts.proxyUrl);
    this.defaultVoiceId = opts.defaultVoiceId;
    this.defaultModelId = opts.defaultModelId ?? DEFAULT_MODEL;
    this.cacheEnabled = opts.cache !== false;
    this.cacheSize = opts.cacheSize ?? DEFAULT_CACHE_SIZE;
    this.debug = opts.debug ?? false;
  }

  speak(opts: Partial<VoiceOptions> & { text: string }): SpeakHandle {
    const voiceId = opts.voiceId ?? this.defaultVoiceId;
    if (!voiceId) {
      this.log('error', 'speak: no voiceId (pass one or set defaultVoiceId)');
      return {
        done: Promise.resolve(),
        stop: () => {},
        getBuffer: () => null,
      };
    }

    const sampleRate = opts.sampleRate ?? DEFAULT_SAMPLE_RATE;
    const modelId = opts.modelId ?? this.defaultModelId;
    const key = this.ttsCacheKey(voiceId, modelId, sampleRate, opts.text);

    const useHorror = opts.horrorFx !== false;

    const cached = this.cacheEnabled && !opts.bypassCache ? this.buffers.get(key) : undefined;
    if (cached) {
      this.log('info', `tts cache hit: "${opts.text.slice(0, 40)}"`);
      const play = this.playBuffer(cached, { position: opts.position, gain: opts.gain, horrorFx: useHorror });
      return { done: play.done, stop: play.stop, getBuffer: () => cached };
    }

    const spatial = createSpatialNode(this.ctx, opts.position, opts.gain ?? 1);
    spatial.output.connect(this.destination);

    // Insert horror voice FX chain between player and spatial node
    let fx: HorrorVoiceFX | null = null;
    let playerDest: AudioNode = spatial.input;
    if (useHorror) {
      fx = new HorrorVoiceFX(this.ctx);
      fx.setFear(this.horrorFear);
      fx.output.connect(spatial.input);
      playerDest = fx.input;
    }

    const player = new StreamingPCMPlayer(this.ctx, playerDest, sampleRate);
    let stopped = false;
    let finalBuffer: AudioBuffer | null = null;
    let resolveDone!: () => void;
    const done = new Promise<void>((r) => { resolveDone = r; });

    const run = async () => {
      try {
        const { stream } = await this.client.streamTTS({ text: opts.text, voiceId, modelId, sampleRate, voiceSettings: opts.voiceSettings });
        const reader = stream.getReader();
        while (true) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;
          if (stopped) {
            try { reader.cancel(); } catch { /* ignore */ }
            break;
          }
          if (value) player.feed(value);
        }
        player.end();

        if (!stopped) {
          finalBuffer = player.toAudioBuffer();
          if (this.cacheEnabled && !opts.bypassCache) this.cachePut(key, finalBuffer);

          const remainingMs = Math.max(0, (player.getPlayheadEnd() - this.ctx.currentTime) * 1000);
          await new Promise((r) => setTimeout(r, remainingMs + 50));
        }
      } catch (e) {
        this.log('error', `speak failed: ${(e as Error).message}`);
      } finally {
        try { spatial.output.disconnect(); } catch { /* ignore */ }
        if (fx) fx.dispose();
        resolveDone();
      }
    };
    void run();

    return {
      done,
      stop: () => {
        if (stopped) return;
        stopped = true;
        player.stop();
      },
      getBuffer: () => finalBuffer,
    };
  }

  async generateSFX(opts: SFXOptions): Promise<AudioBuffer> {
    const key = this.sfxCacheKey(opts);
    const cached = this.cacheEnabled && !opts.bypassCache ? this.buffers.get(key) : undefined;
    if (cached) {
      this.log('info', `sfx cache hit: "${opts.text.slice(0, 40)}"`);
      return cached;
    }

    const arrayBuffer = await this.client.fetchSFX({
      text: opts.text,
      durationSeconds: opts.durationSeconds,
      promptInfluence: opts.promptInfluence,
    });
    // decodeAudioData detaches the ArrayBuffer, so slice to a copy
    const buffer = await this.ctx.decodeAudioData(arrayBuffer.slice(0));
    if (this.cacheEnabled && !opts.bypassCache) this.cachePut(key, buffer);
    return buffer;
  }

  async playSFX(opts: SFXOptions): Promise<PlayHandle> {
    const buffer = await this.generateSFX(opts);
    return this.playBuffer(buffer, {
      position: opts.position,
      gain: opts.gain,
      loop: opts.loop,
    });
  }

  playBuffer(
    buffer: AudioBuffer,
    opts: { position?: Vec3; gain?: number; loop?: boolean; destination?: AudioNode; horrorFx?: boolean } = {},
  ): PlayHandle {
    const dest = opts.destination ?? this.destination;
    const spatial = createSpatialNode(this.ctx, opts.position, opts.gain ?? 1);
    spatial.output.connect(dest);

    let fx: HorrorVoiceFX | null = null;
    let srcDest: AudioNode = spatial.input;
    if (opts.horrorFx) {
      fx = new HorrorVoiceFX(this.ctx);
      fx.setFear(this.horrorFear);
      fx.output.connect(spatial.input);
      srcDest = fx.input;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = opts.loop ?? false;
    if (fx) src.playbackRate.value = fx.getPlaybackRate();
    src.connect(srcDest);

    let resolveDone!: () => void;
    const done = new Promise<void>((r) => { resolveDone = r; });
    let stopped = false;

    src.onended = () => {
      try { spatial.output.disconnect(); } catch { /* ignore */ }
      if (fx) fx.dispose();
      resolveDone();
    };
    src.start();

    return {
      done,
      stop: () => {
        if (stopped) return;
        stopped = true;
        try { src.stop(); } catch { /* already stopped */ }
      },
    };
  }

  setHorrorFear(level: number): void {
    this.horrorFear = Math.max(0, Math.min(1, level));
  }

  getHorrorFear(): number {
    return this.horrorFear;
  }

  updateListener(position: Vec3, forward: Vec3, up: Vec3): void {
    updateListenerImpl(this.ctx, position, forward, up);
  }

  clearCache(): void {
    this.buffers.clear();
  }

  private ttsCacheKey(voiceId: string, modelId: string, sampleRate: number, text: string): string {
    return `tts:${voiceId}:${modelId}:${sampleRate}:${text}`;
  }

  private sfxCacheKey(p: SFXOptions): string {
    return `sfx:${p.durationSeconds ?? 'auto'}:${p.promptInfluence ?? 'auto'}:${p.text}`;
  }

  private cachePut(key: string, buffer: AudioBuffer): void {
    if (this.buffers.size >= this.cacheSize) {
      const oldest = this.buffers.keys().next().value;
      if (oldest !== undefined) this.buffers.delete(oldest);
    }
    this.buffers.set(key, buffer);
  }

  private log(level: 'info' | 'error', msg: string): void {
    if (!this.debug && level === 'info') return;
    const prefix = '[voice]';
    if (level === 'error') console.error(prefix, msg);
    else console.log(prefix, msg);
  }
}

export function createVoiceEngine(opts: VoiceEngineOptions): VoiceEngine {
  return new VoiceEngine(opts);
}
