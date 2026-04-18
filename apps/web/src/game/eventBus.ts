import type { SceneEvent, DirectorPlan, GameScene } from '@phobos/types';

interface ScheduledEvent {
  event: SceneEvent;
  dueAt: number;
  id: number;
}

export interface EventBusDeps {
  /** Predicate: is the given target currently outside the player's view frustum? */
  isUnwatched?: (targetId: string) => boolean;
  /** Called when the bus fires any event — for logging/debug. */
  onFire?: (event: SceneEvent) => void;
}

/**
 * Schedules and dispatches SceneEvents against the currently-loaded scene.
 * Agents call `ingestPlan(plan)` every 10s; the bus sequences events across
 * the window according to each event's `atSeconds` offset.
 *
 * Events with `requires: 'unwatched'` are deferred until the gaze raycaster
 * reports the target is out of view, so "the crate moved when you looked
 * away" works as a diegetic rule rather than a random dice roll.
 */
export class EventBus {
  private queue: ScheduledEvent[] = [];
  private currentScene: GameScene | null = null;
  private now = 0;
  private nextId = 1;
  private deps: EventBusDeps;

  constructor(deps: EventBusDeps = {}) {
    this.deps = deps;
  }

  setScene(scene: GameScene | null): void {
    this.currentScene = scene;
    // Drop pending events — they belong to the previous scene's vocabulary.
    this.queue = [];
  }

  ingestPlan(plan: DirectorPlan, originTime = this.now): void {
    for (const event of plan.events) {
      const offsetMs = (event.atSeconds ?? 0) * 1000;
      this.queue.push({
        event,
        dueAt: originTime + offsetMs,
        id: this.nextId++,
      });
    }
  }

  /** Schedule a single event directly — used by authored scene beats. */
  schedule(event: SceneEvent, atSeconds = 0): void {
    this.queue.push({
      event,
      dueAt: this.now + atSeconds * 1000,
      id: this.nextId++,
    });
  }

  /** Fire an event immediately, bypassing the queue. */
  fire(event: SceneEvent): void {
    this.deps.onFire?.(event);
    this.currentScene?.handleEvent?.(event);
  }

  tick(dtMs: number): void {
    this.now += dtMs;
    if (this.queue.length === 0) return;

    // Walk the queue; fire due events whose preconditions hold.
    // Events with unmet "unwatched" requirements stay queued (up to 4s of grace,
    // then drop — so we don't hold forever if the player stares forever).
    const remaining: ScheduledEvent[] = [];
    for (const scheduled of this.queue) {
      if (scheduled.dueAt > this.now) {
        remaining.push(scheduled);
        continue;
      }

      const ev = scheduled.event;
      if (ev.kind === 'prop_move' && ev.requires === 'unwatched') {
        const watchedElsewhere = this.deps.isUnwatched?.(ev.propId) ?? true;
        if (!watchedElsewhere) {
          // Defer up to 4s past due, then drop.
          if (this.now - scheduled.dueAt < 4000) {
            remaining.push(scheduled);
            continue;
          }
        }
      }

      this.fire(ev);
    }
    this.queue = remaining;
  }

  /** For diagnostics. */
  pendingCount(): number {
    return this.queue.length;
  }
}
