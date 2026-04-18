import { env } from './env';

const BASE = 'https://api.elevenlabs.io';

export interface VoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
}

export interface StreamTTSParams {
  text: string;
  voiceId: string;
  modelId?: string;
  sampleRate?: number;
  voiceSettings?: VoiceSettings;
}

const DEFAULT_HORROR_VOICE: VoiceSettings = {
  stability: 0.92,
  similarity_boost: 0.35,
  style: 0.0,
  use_speaker_boost: false,
};

export async function streamTTS(opts: StreamTTSParams): Promise<Response> {
  const sr = opts.sampleRate ?? 22050;
  const url = `${BASE}/v1/text-to-speech/${encodeURIComponent(opts.voiceId)}/stream?output_format=pcm_${sr}`;
  const body: Record<string, unknown> = {
    text: opts.text,
    model_id: opts.modelId ?? 'eleven_turbo_v2_5',
  };
  if (opts.voiceSettings) {
    body.voice_settings = opts.voiceSettings;
  } else {
    body.voice_settings = DEFAULT_HORROR_VOICE;
  }
  return fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/pcm',
    },
    body: JSON.stringify(body),
  });
}

export interface GenerateSFXParams {
  text: string;
  durationSeconds?: number;
  promptInfluence?: number;
}

export async function generateSFX(opts: GenerateSFXParams): Promise<Response> {
  const body: Record<string, unknown> = { text: opts.text };
  if (opts.durationSeconds !== undefined) body.duration_seconds = opts.durationSeconds;
  if (opts.promptInfluence !== undefined) body.prompt_influence = opts.promptInfluence;
  return fetch(`${BASE}/v1/sound-generation`, {
    method: 'POST',
    headers: {
      'xi-api-key': env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify(body),
  });
}
