/**
 * A cancellable list of timed callbacks. Used for scene-scoped beat sheets:
 * when the player leaves the scene, `cancel()` aborts all pending beats.
 */
export class Timeline {
  private handles: number[] = [];
  private startAt = performance.now();
  private cancelled = false;

  schedule(atMs: number, fn: () => void): void {
    if (this.cancelled) return;
    const h = window.setTimeout(() => {
      if (!this.cancelled) fn();
    }, atMs);
    this.handles.push(h);
  }

  /** Seconds since this timeline's start. */
  get elapsed(): number {
    return (performance.now() - this.startAt) / 1000;
  }

  cancel(): void {
    this.cancelled = true;
    for (const h of this.handles) clearTimeout(h);
    this.handles = [];
  }

  reset(): void {
    this.cancel();
    this.cancelled = false;
    this.handles = [];
    this.startAt = performance.now();
  }
}
