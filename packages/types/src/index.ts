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
  /**
   * Optional: hide zones. Player can crouch inside one of these
   * (with no movement) to become invisible to stalkers. DOORS-style.
   */
  hideZones?(): HideZone[];
  /**
   * Optional: floor height at world position (x, z). Return the Y
   * the player's feet should stand on. Used for stairs and upper
   * floors. If omitted or returns null/undefined, the default (y=0)
   * applies. Query frequency: every frame, per player.
   */
  floorHeightAt?(x: number, z: number): number | null | undefined;
}

/**
 * A crouch-to-hide area inside a scene. Player must be positioned
 * inside the AABB, crouched (lowered camera), and stationary for
 * stalkers to lose sight.
 */
export interface HideZone {
  id: string;
  aabb: AABB;
  /** World-space center — used for UI hints. */
  center: { x: number; y: number; z: number };
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
  | 'heartbeat'
  | 'stinger_low'
  | 'stinger_high'
  | 'reverse_creak'
  | 'radio_static'
  | 'tone_wrong'
  | 'impact'
  | 'scream';

/** Named movable/animatable props. Scenes register props. */
export type PropId =
  | 'basement_crate'
  | 'basement_candle'
  | 'bedroom_wardrobe_door'
  | 'bedroom_mirror'
  | 'bedroom_window_figure'
  | 'bedroom_door'
  | 'bedroom_hatch'
  | 'attic_central_shape'
  | NoteId;

/** Identifiers for the 6 Voss documents scattered through the house. */
export type NoteId =
  | 'note_grant_proposal'
  | 'note_lab_journal'
  | 'note_private_journal'
  | 'note_wife_letter'
  | 'note_final_entry'
  | 'note_phobos_log';

/** Webcam distortion effect types. */
export type WebcamGlitchType = 'stutter' | 'distort' | 'face_warp' | 'delay';

/** Coordinated jumpscare types. */
export type JumpscareType = 'mirror_flash' | 'static_burst';

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
  | { kind: 'anti_silence'; atSeconds?: number; duration: number }
  | { kind: 'breath'; atSeconds?: number; intensity: number }
  | { kind: 'fog_creep'; atSeconds?: number; targetNear: number; targetFar: number; duration: number }
  | { kind: 'mirror_swap'; atSeconds?: number; variant: 'empty' | 'extra_figure' | 'wrong_prop' | 'darker' }
  | { kind: 'transition'; atSeconds?: number; to: 'basement' | 'bedroom' | 'attic' }
  | { kind: 'lock'; atSeconds?: number; propId: PropId }
  | { kind: 'unlock'; atSeconds?: number; propId: PropId }
  | { kind: 'note_reveal'; atSeconds?: number; noteId: NoteId }
  | { kind: 'crt_message'; atSeconds?: number; text: string; durationS: number }
  | { kind: 'log_message'; atSeconds?: number; text: string; source: string }
  | { kind: 'webcam_glitch'; atSeconds?: number; effect: WebcamGlitchType; durationS: number; intensity: number }
  | { kind: 'jumpscare'; atSeconds?: number; type: JumpscareType; durationS: number }
  | { kind: 'reveal_sequence'; atSeconds?: number };

export interface DirectorPlan {
  /** Shown verbatim in the corner-box log. Write it in Phobos-voice. */
  rationale: string;
  /** Source label for log coloring. */
  source: 'scare_director' | 'audio_director' | 'creature_director' | 'pacing_director' | 'system' | 'phobos';
  /** Scheduled events for the next 10s window. */
  events: SceneEvent[];
  /** Narrative posture for this window. Influences ambient light/fog lerp. */
  microMood: MicroMood;
}

export interface AgentLogEntry {
  source: 'scare_director' | 'audio_director' | 'creature_director' | 'pacing_director' | 'system' | 'phobos';
  message: string;
  timestamp: number;
}

/** Input context assembled each 10s agent tick for the Phobos director. */
export interface PhobosTickContext {
  /**
   * Scene identifier: 'campus' + 10 club ids + the legacy house scenes.
   * Kept as `string` so new scene ids flow through without a type churn.
   */
  scene: string;
  biosignals: BiosignalState;
  playerPosition: [number, number, number];
  playerFacing: [number, number, number];
  timeInScene: number;
  totalSessionTime: number;
  /** Targeting dossier collected from the Bicker Compatibility Form. */
  profile?: PlayerProfile;
  /** Recent high-signal session events (spikes, pickups, scene changes). */
  recentHistory?: SessionHistoryEvent[];
  /**
   * One-line digest of the scare profiler — phase (experimenting vs
   * amplifying), dominant vector, top-3 categories by effectiveness.
   * Lets the LLM director target the player's weak spot.
   */
  scareProfileDigest?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Player profile — the Bicker Form dossier Phobos weaponizes against them
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Answers collected from the Bicker Compatibility Assessment Form before play.
 * These are the "targeting" data the director interpolates into whispers,
 * log messages, note content, and the reveal sequence. Every field is player-
 * supplied free text — never trust it beyond a short substitution.
 */
export interface PlayerProfile {
  /** Preferred first name or nickname. Used in whispers + final reveal. */
  name: string;
  /** Hometown / where they grew up. Defaults to "home" if blank. */
  hometown: string;
  /** Princeton residential college (Rocky, Mathey, Whitman, Butler, Forbes, Yeh, NCW). */
  college: string;
  /** Concentration / major. Used for taunts that target academic identity. */
  concentration: string;
  /** One specific fear the player typed in. Phobos feeds this back literally. */
  fear: string;
  /** An object the player can see in the room right now — breaks the 4th wall. */
  objectInRoom: string;
  /** A person they miss. Surfaced in late-game whispers. */
  missedPerson: string;
  /** Free-form: last place they felt watched. */
  watchedPlace: string;
  /** Wall-clock ms when the form was submitted. */
  submittedAt: number;
}

/**
 * High-signal event the director can reference in later ticks — "your heart
 * rate jumped 22 bpm at 14:32:07" style callbacks. Bounded ring buffer.
 */
export type SessionHistoryEventKind =
  | 'fear_spike'
  | 'scene_enter'
  | 'pickup'
  | 'flinch'
  | 'stare'
  | 'retreat';

export interface SessionHistoryEvent {
  kind: SessionHistoryEventKind;
  /** Wall-clock ms. */
  timestamp: number;
  /** Scene the event occurred in (campus or club id). */
  scene: string;
  /** Optional fear score at time of event (0-1). */
  fearScore?: number;
  /** Optional delta over spike window (spikes only). */
  delta?: number;
  /** Optional bpm at time of event. */
  bpm?: number;
  /** Free-form label — note id, anchor, etc. */
  label?: string;
}

/** Definition for a discoverable note in the environment. */
export interface NoteDefinition {
  id: NoteId;
  scene: 'basement' | 'bedroom' | 'attic';
  title: string;
  content: string;
  orderInScene: number;
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

// ─────────────────────────────────────────────────────────────────────────────
// Entities — Phobos's embodied presence in the world
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Visibility state for an entity. The director walks this ladder:
 *   hidden      → no mesh rendered, no AABB
 *   peripheral  → faint silhouette at edge of view, long-range
 *   revealed    → clearly visible at mid-range
 *   close       → in-your-face, full opacity
 */
export type EntityVisibility = 'hidden' | 'peripheral' | 'revealed' | 'close';

/**
 * Snapshot of a biosignal-derived fear spike. Emitted by EntityManager when
 * fearScore climbs fast enough; feeds dynamic SFX generation.
 */
export interface FearSpike {
  /** Fear score at the moment of the spike (0-1). */
  score: number;
  /** Delta over the spike detection window (positive = rising). */
  delta: number;
  /** Current heart rate in bpm, or 0 if not detected. */
  bpm: number;
  /** Wall-clock ms. */
  timestamp: number;
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
