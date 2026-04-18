import type { FearBucket } from '@phobos/voice';
import type { PromptSpec } from '../game/entities/promptLibrary';

/**
 * L2 improvement: author novel, scene-specific ElevenLabs SFX prompts via
 * GPT-4o-mini. Callers pass bucket + scene context; we return a PromptSpec
 * the stalker feeds to voice.generateSFX({ bypassCache: true }). On any
 * failure (no key, timeout, malformed JSON) returns null so the caller
 * falls back to the authored template bank in promptLibrary.ts.
 *
 * This is deliberately narrow — one short LLM call, JSON-only, 4s timeout.
 * The template bank covers every invocation either way.
 */

const BUCKET_DURATION: Record<FearBucket, number> = {
  low: 1.0,
  medium: 1.3,
  high: 1.2,
  peak: 1.5,
};

const BUCKET_INFLUENCE: Record<FearBucket, number> = {
  low: 0.72,
  medium: 0.74,
  high: 0.8,
  peak: 0.82,
};

export interface ScenePromptParams {
  /** Scene label — e.g. "colonial club dining room, abandoned". */
  scene: string;
  bucket: FearBucket;
  /** Free-form extra context. E.g. "player just grabbed the laptop" or "stalker is behind the east pilaster". */
  context?: string;
}

const SYSTEM_PROMPT = `You write SFX prompts for ElevenLabs. A horror entity — an elderly woman, wrong, wheezing — lurks in an abandoned Princeton eating club.

Return ONE JSON object with a single field:
{ "text": "<sfx description under 180 chars>" }

Rules for the SFX description:
- One sound effect, not a scene. Describe the audio concretely.
- Always include: "dry, close mic, no music". Feminine, elderly timbre unless a prop is the source.
- Bucket "low" = ambient unease (creak, fabric shift).
- Bucket "medium" = whispers, shuffles, breath.
- Bucket "high" = sharp gasps, sudden groans, dragging.
- Bucket "peak" = shriek cut short, laugh, wet chuckle.
- Include ONE scene-specific anchor word from the user context when natural (e.g. "dining table", "mantel", "portrait frame").
- Do not name the entity. No music, no speech.`;

export async function authorScenePrompt(
  apiKey: string,
  params: ScenePromptParams,
): Promise<PromptSpec | null> {
  if (!apiKey) return null;

  const userMessage = `Scene: ${params.scene}
Fear bucket: ${params.bucket}
Context: ${params.context ?? '(none)'}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
        temperature: 1.0,
        max_tokens: 120,
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return null;

    const obj: unknown = JSON.parse(content);
    if (!obj || typeof obj !== 'object') return null;
    const text = (obj as { text?: unknown }).text;
    if (typeof text !== 'string' || text.length < 8 || text.length > 240) return null;

    return {
      text,
      durationSeconds: BUCKET_DURATION[params.bucket],
      promptInfluence: BUCKET_INFLUENCE[params.bucket],
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
