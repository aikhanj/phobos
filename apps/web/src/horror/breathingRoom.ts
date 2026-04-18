import * as THREE from 'three';

/**
 * Subliminal wall-scale pulse that makes the room itself feel alive.
 * At a breath rate of ~0.22Hz (one cycle every ~4.5s) and a peak
 * displacement of ~0.3% scale, the motion is well below conscious
 * perception — but the brain clocks it and registers the space as
 * subtly wrong. Foundation for longer-form dread.
 *
 * install() snapshots initial scales and returns an update callback
 * the scene should call in its update(dt) loop.
 */
export interface BreathingRoomHandle {
  update: (dt: number) => void;
  setEnabled: (on: boolean) => void;
  setRate: (hz: number) => void;
  setAmplitude: (a: number) => void;
  dispose: () => void;
}

export function installBreathingRoom(
  targets: THREE.Object3D[],
  opts: { rateHz?: number; amplitude?: number; enabled?: boolean } = {},
): BreathingRoomHandle {
  const initial = new Map<THREE.Object3D, THREE.Vector3>();
  for (const t of targets) initial.set(t, t.scale.clone());

  let time = 0;
  let rateHz = opts.rateHz ?? 0.22;
  let amplitude = opts.amplitude ?? 0.003;
  let enabled = opts.enabled ?? true;

  const update = (dt: number): void => {
    if (!enabled) return;
    time += dt;
    // sin wave, offset so at t=0 we're near baseline not mid-stretch
    const phase = Math.sin(time * rateHz * Math.PI * 2) * amplitude;
    // Easing at the extremes to feel more organic than pure sine
    const eased = Math.sign(phase) * Math.pow(Math.abs(phase) / amplitude, 1.2) * amplitude;
    for (const [obj, base] of initial) {
      obj.scale.set(base.x, base.y * (1 + eased), base.z);
    }
  };

  return {
    update,
    setEnabled: (on) => {
      enabled = on;
      if (!on) {
        for (const [obj, base] of initial) obj.scale.copy(base);
      }
    },
    setRate: (hz) => { rateHz = hz; },
    setAmplitude: (a) => { amplitude = a; },
    dispose: () => {
      for (const [obj, base] of initial) obj.scale.copy(base);
      initial.clear();
    },
  };
}
