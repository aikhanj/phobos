import type { FearBucket } from '@phobos/voice';
import { personalize, playerProfile } from '../game/playerProfile';

/**
 * Extra whisper templates that interpolate the Bicker Form dossier.
 * Used by main.ts when fear_score climbs past certain thresholds —
 * the system stops being generic and starts addressing the player
 * by name, hometown, and their declared fear.
 *
 * Templates use {name}, {hometown}, {college}, {concentration},
 * {fear}, {objectInRoom}, {missedPerson}, {watchedPlace}.
 * All lowercase + short (3-9 words) so ElevenLabs keeps the delivery
 * uncanny rather than speech-y.
 */
export const PERSONALIZED_LINES: Record<FearBucket, string[]> = {
  low: [
    'hello {name}',
    '{hometown}. long way.',
    'do you remember {missedPerson}',
    '{name}. welcome back.',
    'we read section three, {name}',
  ],
  medium: [
    '{name}. i see you.',
    'you wrote {fear}',
    '{fear}. good answer.',
    'we kept {objectInRoom} where you could see it',
    '{missedPerson} sat in that same seat',
    'the form was honest, {name}',
    '{college} college sent one before you',
  ],
  high: [
    '{name}. {fear}. both here.',
    'you told us about {fear}. we listened.',
    'we brought {objectInRoom}',
    '{missedPerson} is still inside',
    'hello {name}. sit down.',
    'seat seven, {name}',
  ],
  peak: [
    'sit down {name}',
    '{name}. stay.',
    'look up, {name}',
    '{missedPerson} is behind you',
  ],
};

/**
 * Pick a personalized line for a given fear bucket. Returns the already-
 * interpolated string ready for TTS. Falls back silently if no profile
 * tokens resolve.
 */
export function pickPersonalized(bucket: FearBucket, avoid?: string): string {
  const pool = PERSONALIZED_LINES[bucket];
  const filtered = avoid ? pool.filter((l) => personalize(l) !== avoid) : pool;
  const choice = filtered[Math.floor(Math.random() * filtered.length)] ?? pool[0];
  return personalize(choice, playerProfile.get());
}

/**
 * Probability that a given speakAs call should substitute a personalized
 * line instead of the generic granny line. Scales with fear bucket.
 */
export function personalizedChance(bucket: FearBucket): number {
  switch (bucket) {
    case 'low': return 0.25;
    case 'medium': return 0.45;
    case 'high': return 0.65;
    case 'peak': return 0.85;
  }
}
