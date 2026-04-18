import { env } from './env';

const BASE = 'https://api.elevenlabs.io';

export interface StreamTTSParams {
  text: string;
  voiceId: string;
  modelId?: string;
  sampleRate?: number;
}

export async function streamTTS(opts: StreamTTSParams): Promise<Response> {
  const sr = opts.sampleRate ?? 22050;
  const url = `${BASE}/v1/text-to-speech/${encodeURIComponent(opts.voiceId)}/stream?output_format=pcm_${sr}`;
  return fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/pcm',
    },
    body: JSON.stringify({
      text: opts.text,
      model_id: opts.modelId ?? 'eleven_turbo_v2_5',
    }),
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
