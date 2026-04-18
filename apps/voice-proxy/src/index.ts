import 'dotenv/config';

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { stream } from 'hono/streaming';
import { serve } from '@hono/node-server';
import { streamTTS, generateSFX } from './eleven';
import { env, hasApiKey } from './env';

const app = new Hono();

app.use('*', cors({
  origin: env.ALLOWED_ORIGIN,
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

app.get('/health', (c) => c.json({
  ok: true,
  hasApiKey: hasApiKey(),
  allowedOrigin: env.ALLOWED_ORIGIN,
}));

app.post('/tts', async (c) => {
  if (!hasApiKey()) {
    return c.json({ error: 'ELEVENLABS_API_KEY not set on proxy' }, 503);
  }

  let body: { text?: unknown; voiceId?: unknown; modelId?: unknown; sampleRate?: unknown; voiceSettings?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid json body' }, 400);
  }

  const { text, voiceId, modelId, sampleRate, voiceSettings } = body;
  if (typeof text !== 'string' || !text.trim()) {
    return c.json({ error: 'text required' }, 400);
  }
  if (typeof voiceId !== 'string' || !voiceId.trim()) {
    return c.json({ error: 'voiceId required' }, 400);
  }
  const sr = typeof sampleRate === 'number' ? sampleRate : 22050;
  const model = typeof modelId === 'string' ? modelId : undefined;
  const vs = voiceSettings && typeof voiceSettings === 'object'
    ? (voiceSettings as import('./eleven').VoiceSettings)
    : undefined;

  const upstream = await streamTTS({ text, voiceId, modelId: model, sampleRate: sr, voiceSettings: vs });
  if (!upstream.ok || !upstream.body) {
    const err = await upstream.text().catch(() => '');
    return c.json({ error: `elevenlabs ${upstream.status}: ${err.slice(0, 300)}` }, 502);
  }

  c.header('Content-Type', 'application/octet-stream');
  c.header('X-Sample-Rate', String(sr));
  c.header('X-Format', 'pcm_s16le');
  c.header('Cache-Control', 'no-store');

  return stream(c, async (s) => {
    const reader = upstream.body!.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) await s.write(value);
      }
    } finally {
      reader.releaseLock();
    }
  });
});

app.post('/sfx', async (c) => {
  if (!hasApiKey()) {
    return c.json({ error: 'ELEVENLABS_API_KEY not set on proxy' }, 503);
  }

  let body: { text?: unknown; durationSeconds?: unknown; promptInfluence?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid json body' }, 400);
  }

  const { text, durationSeconds, promptInfluence } = body;
  if (typeof text !== 'string' || !text.trim()) {
    return c.json({ error: 'text required' }, 400);
  }

  const upstream = await generateSFX({
    text,
    durationSeconds: typeof durationSeconds === 'number' ? durationSeconds : undefined,
    promptInfluence: typeof promptInfluence === 'number' ? promptInfluence : undefined,
  });
  if (!upstream.ok || !upstream.body) {
    const err = await upstream.text().catch(() => '');
    return c.json({ error: `elevenlabs ${upstream.status}: ${err.slice(0, 300)}` }, 502);
  }

  const ct = upstream.headers.get('content-type') ?? 'audio/mpeg';
  c.header('Content-Type', ct);
  c.header('Cache-Control', 'no-store');

  return stream(c, async (s) => {
    const reader = upstream.body!.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) await s.write(value);
      }
    } finally {
      reader.releaseLock();
    }
  });
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`[voice-proxy] listening on :${info.port}`);
  console.log(`[voice-proxy] allowed origin: ${env.ALLOWED_ORIGIN}`);
  console.log(`[voice-proxy] api key present: ${hasApiKey()}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[voice-proxy] port ${env.PORT} is already in use (another voice-proxy or app). Stop it or set PORT in .env.`,
    );
  } else {
    console.error('[voice-proxy] failed to listen:', err);
  }
  process.exit(1);
});
