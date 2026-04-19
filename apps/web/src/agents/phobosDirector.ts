import type {
  DirectorPlan,
  SceneEvent,
  NoteId,
  PhobosTickContext,
  MicroMood,
} from '@phobos/types';
import { PHOBOS_SYSTEM_PROMPT, buildPhobosUserMessage } from './phobosPrompt';

/** Valid event kinds Phobos is allowed to emit. */
const VALID_KINDS = new Set([
  'flicker', 'figure', 'sound', 'prop_move', 'prop_state',
  'silence', 'breath', 'fog_creep', 'mirror_swap',
  'note_reveal', 'crt_message', 'log_message',
  'webcam_glitch', 'jumpscare', 'lock', 'unlock',
]);

const VALID_MOODS = new Set<MicroMood>(['descent', 'hold', 'release', 'crescendo']);

/**
 * Phobos — the LLM entity that IS the horror. Runs on the 10s agent tick,
 * receives biosignal telemetry + game state, calls GPT-4o-mini, and emits
 * SceneEvents via DirectorPlan.
 */
export class PhobosDirector {
  private notesRead = new Set<NoteId>();
  private notesRevealed = new Set<NoteId>();
  private scareHistory: Array<{ kind: string; timestamp: number }> = [];
  private sessionStartTime = performance.now();
  private pendingCall = false;
  private apiKey: string;
  private currentMood: MicroMood = 'descent';
  private isFirstTickInScene = true;
  private lastFearScore = 0;
  private lastBpm = 0;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  get hasApiKey(): boolean {
    return this.apiKey.length > 0;
  }

  get isRevealActive(): boolean {
    return false; // Reveal is managed by RevealSequence, not the director
  }

  /**
   * Called every 10s from engine.onAgentTick. Returns a DirectorPlan or null
   * if no API key, call in flight, or the call fails.
   */
  async tick(ctx: PhobosTickContext): Promise<DirectorPlan | null> {
    if (!this.apiKey || this.pendingCall) return null;

    this.lastFearScore = ctx.biosignals.fearScore;
    this.lastBpm = ctx.biosignals.bpm;

    const userMessage = buildPhobosUserMessage({
      scene: ctx.scene,
      timeInScene: ctx.timeInScene,
      totalSessionTime: (performance.now() - this.sessionStartTime) / 1000,
      fearScore: ctx.biosignals.fearScore,
      bpm: ctx.biosignals.bpm,
      gazeAversion: ctx.biosignals.gazeAversion,
      flinchCount: ctx.biosignals.flinchCount,
      lookStillness: ctx.biosignals.lookStillness,
      retreatVelocity: ctx.biosignals.retreatVelocity,
      playerPosition: ctx.playerPosition,
      playerFacing: ctx.playerFacing,
      notesRead: Array.from(this.notesRead),
      notesRevealed: Array.from(this.notesRevealed),
      recentScares: this.scareHistory.slice(-5).map((s) => s.kind),
      currentMood: this.currentMood,
      isFirstTickInScene: this.isFirstTickInScene,
      profile: ctx.profile,
      recentHistory: ctx.recentHistory,
      scareProfileDigest: ctx.scareProfileDigest,
    });

    this.pendingCall = true;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: PHOBOS_SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.9,
          max_tokens: 500,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        console.warn(`[phobos] API error: ${response.status}`);
        return null;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) return null;

      const plan = this.parsePlan(content);
      if (plan) {
        this.currentMood = plan.microMood;
        this.isFirstTickInScene = false;
      }
      return plan;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.warn('[phobos] tick timed out');
      } else {
        console.warn('[phobos] tick failed:', err);
      }
      return null;
    } finally {
      this.pendingCall = false;
    }
  }

  onSceneChange(_scene: string): void {
    this.isFirstTickInScene = true;
  }

  onNoteRead(noteId: NoteId): void {
    this.notesRead.add(noteId);
  }

  onNoteRevealed(noteId: NoteId): void {
    this.notesRevealed.add(noteId);
  }

  onEventFired(event: SceneEvent): void {
    this.scareHistory.push({ kind: event.kind, timestamp: performance.now() });
    // Keep history bounded
    if (this.scareHistory.length > 30) {
      this.scareHistory = this.scareHistory.slice(-20);
    }
  }

  getState(): {
    notesRead: NoteId[];
    totalSessionTime: number;
    lastFearScore: number;
    lastBpm: number;
  } {
    return {
      notesRead: Array.from(this.notesRead),
      totalSessionTime: (performance.now() - this.sessionStartTime) / 1000,
      lastFearScore: this.lastFearScore,
      lastBpm: this.lastBpm,
    };
  }

  // ── response parsing + validation ──

  private parsePlan(raw: string): DirectorPlan | null {
    try {
      const obj = JSON.parse(raw);

      const rationale = typeof obj.rationale === 'string' ? obj.rationale.slice(0, 200) : '...';
      const source = 'phobos' as const;
      const microMood: MicroMood = VALID_MOODS.has(obj.microMood) ? obj.microMood : 'hold';

      const events: SceneEvent[] = [];
      if (Array.isArray(obj.events)) {
        for (const ev of obj.events) {
          if (!ev || typeof ev.kind !== 'string') continue;
          if (!VALID_KINDS.has(ev.kind)) continue;
          // Block reveal_sequence — only the engine can fire that
          if (ev.kind === 'reveal_sequence') continue;
          // Clamp atSeconds to 0-9
          if (typeof ev.atSeconds === 'number') {
            ev.atSeconds = Math.max(0, Math.min(9, ev.atSeconds));
          }
          // Track note_reveal for state
          if (ev.kind === 'note_reveal' && ev.noteId) {
            this.notesRevealed.add(ev.noteId);
          }
          events.push(ev as SceneEvent);
        }
      }

      // Filter consecutive duplicate scare kinds
      const lastScare = this.scareHistory.length > 0
        ? this.scareHistory[this.scareHistory.length - 1].kind
        : null;
      const filtered = events.filter((ev, i) => {
        if (i === 0 && ev.kind === lastScare) return false;
        if (i > 0 && ev.kind === events[i - 1].kind) return false;
        return true;
      });

      // Cap at 4 events per tick
      const capped = filtered.slice(0, 4);

      return { rationale, source, events: capped, microMood };
    } catch {
      console.warn('[phobos] failed to parse LLM response');
      return null;
    }
  }
}
