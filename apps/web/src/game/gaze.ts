import * as THREE from 'three';
import type { AABB, GazeTarget } from '@phobos/types';

const UNWATCHED_MS = 800; // must be out of frustum this long to count as "unwatched"

const _projScreen = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _box = new THREE.Box3();

interface TargetState {
  target: GazeTarget;
  lastSeenAt: number;
  dwellMs: number;
}

/**
 * Tracks which registered props are inside the player's view frustum.
 * Used by the event bus to gate "unwatched" events ("the crate moved when
 * you weren't looking") and by biosignals to compute gaze dwell on anchors.
 */
export class GazeTracker {
  private states = new Map<string, TargetState>();
  private now = 0;

  setTargets(targets: readonly GazeTarget[]): void {
    const next = new Map<string, TargetState>();
    for (const t of targets) {
      const prev = this.states.get(t.id);
      next.set(t.id, prev
        ? { target: t, lastSeenAt: prev.lastSeenAt, dwellMs: prev.dwellMs }
        : { target: t, lastSeenAt: -Infinity, dwellMs: 0 });
    }
    this.states = next;
  }

  update(camera: THREE.PerspectiveCamera, dtMs: number): void {
    this.now += dtMs;
    _projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreen);

    for (const state of this.states.values()) {
      boxFromAABB(state.target.box, _box);
      const visible = _frustum.intersectsBox(_box);
      if (visible) {
        state.lastSeenAt = this.now;
        state.dwellMs += dtMs;
      } else {
        state.dwellMs = 0;
      }
    }
  }

  /** True if the target has been out of frustum for at least UNWATCHED_MS. */
  isUnwatched(id: string): boolean {
    const s = this.states.get(id);
    if (!s) return true;
    return this.now - s.lastSeenAt >= UNWATCHED_MS;
  }

  getDwellMs(id: string): number {
    return this.states.get(id)?.dwellMs ?? 0;
  }

  allDwells(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, s] of this.states) out[id] = s.dwellMs;
    return out;
  }
}

function boxFromAABB(aabb: AABB, out: THREE.Box3): void {
  out.min.set(aabb.min[0], aabb.min[1], aabb.min[2]);
  out.max.set(aabb.max[0], aabb.max[1], aabb.max[2]);
}
