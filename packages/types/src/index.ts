import * as THREE from 'three';

export interface GameScene {
  readonly name: string;
  readonly group: THREE.Group;
  readonly spawnPoint: THREE.Vector3;
  load(): void;
  unload(): void;
  update(dt: number): void;
  /** Optional: scenes can expose event handlers for director events. */
  handleEvent?(event: SceneEvent): void;
  /** Optional: scenes register AABB colliders for player collision. */
  colliders?(): AABB[];
  /** Optional: scenes register gaze targets for unwatched-event logic. */
  gazeTargets?(): GazeTarget[];
  /** Optional: scenes register trigger volumes that fire on player enter. */
  triggers?(): Trigger[];
  /** Optional: scenes register look-and-press-E interactables. */
  interactables?(): Interactable[];
}

export interface SceneConfig {
  dimensions: { width: number; height: number; depth: number };
  ambientColor: number;
  ambientIntensity: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Biosignals — what Phobos reads from the player
// ─────────────────────────────────────────────────────────────────────────────

export interface BiosignalState {
  /** 0-1, fused fear estimate from face + heart rate + behavior. */
  fearScore: number;
  /** Heart rate in beats per minute (0 if not yet detected). */
  bpm: number;
  /** 0-1, how often gaze is averting from high-salience regions. */
  gazeAversion: number;
  /** Count of sudden facial flinches since scene start. */
  flinchCount: number;
  /** Seconds spent in the current scene. */
  timeInScene: number;
  /** 0-1, how still the player's look vector is (high = freeze). */
  lookStillness: number;
  /** Positive if moving away from last event anchor. */
  retreatVelocity: number;
  /** ms of recent dwell on each named gaze target. */
  gazeDwellMs: Record<string, number>;
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene Events — the vocabulary the director agents speak
// ─────────────────────────────────────────────────────────────────────────────

/** Named positions where figures can manifest. Scenes register anchors. */
export type AnchorId =
  | 'doorway'
  | 'window'
  | 'mirror'
  | 'peripheral'
  | 'behind'
  | 'center'
  | 'wardrobe_interior';

/** Canonical one-shot sound identifiers. Keep short and authored. */
export type SoundId =
  | 'whisper_hold'
  | 'whisper_good'
  | 'whisper_see'
  | 'footstep_behind'
  | 'footstep_near'
  | 'creak_floor'
  | 'creak_door'
  | 'breath_low'
  | 'silence_drop'
  | 'glitch'
  | 'heartbeat';

/** Named movable/animatable props. Scenes register props. */
export type PropId =
  | 'basement_crate'
  | 'basement_candle'
  | 'bedroom_wardrobe_door'
  | 'bedroom_mirror'
  | 'bedroom_window_figure'
  | 'bedroom_door'
  | 'bedroom_hatch'
  | 'attic_central_shape';

export type MicroMood = 'descent' | 'hold' | 'release' | 'crescendo';

/**
 * Discrete events the agents can schedule. Each has an optional `atSeconds`
 * offset from the agent tick (0..10s window) so a plan can sequence events
 * across the window rather than firing them all at once.
 */
export type SceneEvent =
  | { kind: 'flicker'; atSeconds?: number; duration: number; pattern: 'subtle' | 'hard' | 'blackout' }
  | { kind: 'figure'; atSeconds?: number; anchor: AnchorId; duration: number; opacity: number }
  | { kind: 'sound'; atSeconds?: number; asset: SoundId; volume: number; spatial?: [number, number, number] }
  | { kind: 'prop_move'; atSeconds?: number; propId: PropId; to: [number, number, number]; requires?: 'unwatched' }
  | { kind: 'prop_state'; atSeconds?: number; propId: PropId; state: string; param?: number }
  | { kind: 'silence'; atSeconds?: number; duration: number }
  | { kind: 'breath'; atSeconds?: number; intensity: number }
  | { kind: 'fog_creep'; atSeconds?: number; targetNear: number; targetFar: number; duration: number }
  | { kind: 'mirror_swap'; atSeconds?: number; variant: 'empty' | 'extra_figure' | 'wrong_prop' | 'darker' }
  | { kind: 'transition'; atSeconds?: number; to: 'basement' | 'bedroom' | 'attic' }
  | { kind: 'lock'; atSeconds?: number; propId: PropId }
  | { kind: 'unlock'; atSeconds?: number; propId: PropId };

export interface DirectorPlan {
  /** Shown verbatim in the corner-box log. Write it in Phobos-voice. */
  rationale: string;
  /** Source label for log coloring. */
  source: 'scare_director' | 'audio_director' | 'creature_director' | 'pacing_director' | 'system';
  /** Scheduled events for the next 10s window. */
  events: SceneEvent[];
  /** Narrative posture for this window. Influences ambient light/fog lerp. */
  microMood: MicroMood;
}

export interface AgentLogEntry {
  source: 'scare_director' | 'audio_director' | 'creature_director' | 'pacing_director' | 'system';
  message: string;
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Spatial primitives — colliders, gaze targets, triggers
// ─────────────────────────────────────────────────────────────────────────────

/** Axis-aligned bounding box in world space. Used for player collision. */
export interface AABB {
  min: [number, number, number];
  max: [number, number, number];
}

/** A prop/volume the gaze raycaster tracks. */
export interface GazeTarget {
  id: PropId | string;
  /** World-space AABB used for the raycast test. */
  box: AABB;
}

/** A volume that fires a callback when the player enters. */
export interface Trigger {
  id: string;
  box: AABB;
  onEnter: () => void;
  /** If true, only fires once then disarms. */
  once?: boolean;
}

/**
 * A world-space object the player can look at (crosshair lights up) and
 * then interact with by pressing E. Scenes register these via
 * `GameScene.interactables?()`. Ray-AABB picked from the camera, nearest hit
 * within `range` wins.
 */
export interface Interactable {
  id: string;
  /** World-space AABB. Keep tight — this is the pickable volume. */
  box: AABB;
  /** Short verb shown under the crosshair when targeted (e.g. "climb", "open"). */
  hint?: string;
  /** Max pick distance in metres. Default 2.5. */
  range?: number;
  /** If false, the interactable is pickable but pressing E does nothing. */
  enabled?: boolean;
  /** Fired on E press while targeted. */
  onInteract: () => void;
  /** Called every frame the player is targeting this (re-entrant cheap). */
  onGaze?: () => void;
}
