import type { FearBucket } from '@phobos/voice';

/**
 * Dynamic ElevenLabs SFX prompts for Phobos's reactive scares. Every scare
 * is novel: we never cache these (bypassCache: true). Prompts are bucketed
 * by fear level and lightly randomized per-pick so repeated spikes don't
 * produce identical audio.
 *
 * Each entry is a template compose-function so adjectives, durations, and
 * proximity words mix freely. That surfaces enough variety for a 2-minute
 * demo loop without any LLM in the path yet — Phase 4 will replace pickPrompt()
 * with a Dedalus Creature Director call that authors the prompt live.
 */

type PromptSpec = {
  text: string;
  durationSeconds: number;
  promptInfluence: number;
};

const CLOSE_WORDS = ['very close', 'right beside you', 'inches from the mic', 'intimate distance'];
const DRY_TAIL = 'no music, no speech, close mic, dry';
const RASP_TAIL = 'no music, raspy, dry, close mic';

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── bucketed templates ───────────────────────────────────────────────────

const LOW_TEMPLATES: Array<() => PromptSpec> = [
  () => ({
    text: `a single slow floorboard creak in an empty room, ${pick(CLOSE_WORDS)}, ${DRY_TAIL}`,
    durationSeconds: 1.2,
    promptInfluence: 0.75,
  }),
  () => ({
    text: `faint fabric rustle as someone shifts their weight, ${DRY_TAIL}`,
    durationSeconds: 0.9,
    promptInfluence: 0.7,
  }),
  () => ({
    text: `distant door latch clicking softly, ${DRY_TAIL}`,
    durationSeconds: 0.7,
    promptInfluence: 0.8,
  }),
];

const MEDIUM_TEMPLATES: Array<() => PromptSpec> = [
  () => ({
    text: `a slow wheezy inhale of an elderly woman, ${pick(CLOSE_WORDS)}, ${RASP_TAIL}`,
    durationSeconds: 1.6,
    promptInfluence: 0.72,
  }),
  () => ({
    text: `a slippered foot dragging across dusty wood, ${DRY_TAIL}`,
    durationSeconds: 1.3,
    promptInfluence: 0.78,
  }),
  () => ({
    text: `breathy unintelligible whisper ${pick(CLOSE_WORDS)}, feminine, elderly, ${RASP_TAIL}`,
    durationSeconds: 1.4,
    promptInfluence: 0.68,
  }),
  () => ({
    text: `three quick dry knocks on wood, unsettling, ${DRY_TAIL}`,
    durationSeconds: 1.0,
    promptInfluence: 0.8,
  }),
];

const HIGH_TEMPLATES: Array<() => PromptSpec> = [
  () => ({
    text: `a sharp wheezing gasp from an old woman, ${pick(CLOSE_WORDS)}, ${RASP_TAIL}`,
    durationSeconds: 1.0,
    promptInfluence: 0.8,
  }),
  () => ({
    text: `a sudden loud floorboard groan directly behind the listener, ${DRY_TAIL}`,
    durationSeconds: 1.1,
    promptInfluence: 0.82,
  }),
  () => ({
    text: `a guttural elderly hum that cuts off abruptly, ${pick(CLOSE_WORDS)}, ${RASP_TAIL}`,
    durationSeconds: 1.4,
    promptInfluence: 0.75,
  }),
  () => ({
    text: `a single nail dragging slowly across wood, ${DRY_TAIL}`,
    durationSeconds: 1.2,
    promptInfluence: 0.82,
  }),
];

const PEAK_TEMPLATES: Array<() => PromptSpec> = [
  () => ({
    text: `a woman's sudden sharp inhale followed by a dry laugh, ${pick(CLOSE_WORDS)}, ${RASP_TAIL}`,
    durationSeconds: 1.6,
    promptInfluence: 0.82,
  }),
  () => ({
    text: `a shrill brittle shriek cut short, elderly feminine, ${DRY_TAIL}`,
    durationSeconds: 1.3,
    promptInfluence: 0.85,
  }),
  () => ({
    text: `bone knuckles cracking then a wet chuckle, ${pick(CLOSE_WORDS)}, ${RASP_TAIL}`,
    durationSeconds: 1.5,
    promptInfluence: 0.8,
  }),
];

const BANKS: Record<FearBucket, Array<() => PromptSpec>> = {
  low: LOW_TEMPLATES,
  medium: MEDIUM_TEMPLATES,
  high: HIGH_TEMPLATES,
  peak: PEAK_TEMPLATES,
};

/** Pick a randomized prompt for the given fear bucket. Never repeats the same template twice in a row per manager instance. */
export function pickPrompt(bucket: FearBucket, lastTemplateIndex?: number): { spec: PromptSpec; templateIndex: number } {
  const pool = BANKS[bucket];
  let idx = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && idx === lastTemplateIndex) idx = (idx + 1) % pool.length;
  return { spec: pool[idx](), templateIndex: idx };
}

export type { PromptSpec };
