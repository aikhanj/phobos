export interface TTSStreamResult {
  stream: ReadableStream<Uint8Array>;
  sampleRate: number;
}

export interface TTSStreamParams {
  text: string;
  voiceId: string;
  modelId?: string;
  sampleRate?: number;
  voiceSettings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
}

export interface SFXFetchParams {
  text: string;
  durationSeconds?: number;
  promptInfluence?: number;
}

export class VoiceProxyClient {
  constructor(private readonly baseUrl: string) {}

  async streamTTS(params: TTSStreamParams): Promise<TTSStreamResult> {
    const { voiceSettings, ...rest } = params;
    const payload: Record<string, unknown> = { ...rest };
    if (voiceSettings) payload.voiceSettings = voiceSettings;
    const res = await fetch(`${this.baseUrl}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok || !res.body) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`TTS proxy ${res.status}: ${err.slice(0, 200)}`);
    }
    const sr = parseInt(res.headers.get('X-Sample-Rate') ?? '22050', 10);
    return { stream: res.body, sampleRate: sr };
  }

  async fetchSFX(params: SFXFetchParams): Promise<ArrayBuffer> {
    const res = await fetch(`${this.baseUrl}/sfx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`SFX proxy ${res.status}: ${err.slice(0, 200)}`);
    }
    return res.arrayBuffer();
  }
}
