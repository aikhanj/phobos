import * as THREE from 'three';
import type { AABB, GameScene, Interactable, SceneEvent, Trigger } from '@phobos/types';
import { EventBus } from './eventBus';
import { GazeTracker } from './gaze';
import { SCENE_CONFIGS } from './sceneConfig';
import { rayAABB } from './collision';

const _playerXZ = new THREE.Vector2();
const _forward = new THREE.Vector3();

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly clock: THREE.Clock;
  readonly eventBus: EventBus;
  readonly gaze: GazeTracker;

  private currentRoom: GameScene | null = null;
  private colliderCache: AABB[] = [];
  private triggerCache: Trigger[] = [];
  private armedTriggers = new Set<string>();
  private interactableCache: Interactable[] = [];
  private currentInteractableId: string | null = null;

  /** Broad atmospheric fill so rooms aren't pitch-black where no point/ambient reaches. */
  private hemi: THREE.HemisphereLight;

  /** Called whenever the targeted interactable changes. Hint is null when nothing is targeted. */
  onInteractableChange: ((hint: string | null) => void) | null = null;

  private biosignalAccum = 0;
  private agentAccum = 0;

  onBiosignalTick: (() => void) | null = null;
  onAgentTick: (() => void) | null = null;
  onUpdate: ((dt: number) => void) | null = null;
  onEventFired: ((event: SceneEvent) => void) | null = null;
  onSceneLoaded: ((scene: GameScene) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(
      Math.floor(window.innerWidth / 2),
      Math.floor(window.innerHeight / 2),
      false,
    );
    // Canvas CSS fills the viewport; `image-rendering: pixelated` upscales the
    // half-res draw buffer for the PS1 crunch. `updateStyle=false` above keeps
    // Three.js from overwriting our `width: 100%; height: 100%` rule.
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.Fog(0x000000, 1, 15);

    this.hemi = new THREE.HemisphereLight(0xbfc8ff, 0x2a1a12, 0.55);
    this.hemi.position.set(0, 1, 0);
    this.scene.add(this.hemi);

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.camera.position.set(0, 1.6, 0);
    this.scene.add(this.camera);

    this.clock = new THREE.Clock(false);

    this.gaze = new GazeTracker();
    this.eventBus = new EventBus({
      isUnwatched: (id) => this.gaze.isUnwatched(id),
      onFire: (event) => this.onEventFired?.(event),
    });

    window.addEventListener('resize', this.onResize);
  }

  start(): void {
    this.clock.start();
    this.renderer.setAnimationLoop(this.animate);
  }

  stop(): void {
    this.renderer.setAnimationLoop(null);
    this.clock.stop();
  }

  loadScene(room: GameScene): void {
    if (this.currentRoom) {
      this.scene.remove(this.currentRoom.group);
      this.currentRoom.unload();
    }
    this.currentRoom = room;
    room.load();
    this.scene.add(room.group);

    // Refresh collider / gaze / trigger / interactable caches.
    this.colliderCache = room.colliders?.() ?? [];
    this.gaze.setTargets(room.gazeTargets?.() ?? []);
    this.triggerCache = room.triggers?.() ?? [];
    this.armedTriggers = new Set(this.triggerCache.map((t) => t.id));
    this.interactableCache = room.interactables?.() ?? [];
    this.currentInteractableId = null;
    this.onInteractableChange?.(null);

    this.eventBus.setScene(room);

    // Apply per-scene fog + ambient palette if we have a config entry.
    const cfg = SCENE_CONFIGS[room.name];
    if (cfg) {
      this.applyFog(cfg.fogNear, cfg.fogFar, cfg.fogColor);
      this.scene.background = new THREE.Color(cfg.fogColor);
      this.applyHemi(room.name);
    }

    this.onSceneLoaded?.(room);
  }

  /** Provided to Player so movement respects scene geometry. */
  getColliders = (): readonly AABB[] => this.colliderCache;

  /** Swap hemisphere tint per scene so the broad fill reads right for each room. */
  private applyHemi(name: string): void {
    switch (name) {
      case 'basement':
        this.hemi.color.setHex(0xa89880); // dusty warm
        this.hemi.groundColor.setHex(0x2a1f14);
        this.hemi.intensity = 0.65;
        break;
      case 'bedroom':
        this.hemi.color.setHex(0x9ea6d8); // cold moonwash
        this.hemi.groundColor.setHex(0x342a40);
        this.hemi.intensity = 0.75;
        break;
      case 'attic':
        this.hemi.color.setHex(0x8a7250); // starved timber
        this.hemi.groundColor.setHex(0x1a1008);
        this.hemi.intensity = 0.5;
        break;
    }
  }

  /**
   * Raycast from camera forward against all registered interactables. Updates
   * `currentInteractableId` and fires `onInteractableChange` on transitions.
   * Nearest hit wins; interactable `range` defaults to 2.5m.
   */
  private updateInteractablePick(): void {
    if (this.interactableCache.length === 0) {
      if (this.currentInteractableId !== null) {
        this.currentInteractableId = null;
        this.onInteractableChange?.(null);
      }
      return;
    }
    this.camera.getWorldDirection(_forward);
    const ox = this.camera.position.x;
    const oy = this.camera.position.y;
    const oz = this.camera.position.z;

    let bestId: string | null = null;
    let bestHint: string | undefined;
    let bestT = Infinity;
    for (const it of this.interactableCache) {
      if (it.enabled === false) continue;
      const range = it.range ?? 2.5;
      const t = rayAABB(ox, oy, oz, _forward.x, _forward.y, _forward.z, it.box, range);
      if (t !== null && t < bestT) {
        bestT = t;
        bestId = it.id;
        bestHint = it.hint;
      }
    }

    if (bestId !== null) {
      const it = this.interactableCache.find((x) => x.id === bestId);
      it?.onGaze?.();
    }

    if (bestId !== this.currentInteractableId) {
      this.currentInteractableId = bestId;
      this.onInteractableChange?.(bestHint ?? null);
    }
  }

  /** Fire the currently-targeted interactable's `onInteract` (wire from Player's E key). */
  tryInteract(): boolean {
    if (!this.currentInteractableId) return false;
    const it = this.interactableCache.find((x) => x.id === this.currentInteractableId);
    if (!it || it.enabled === false) return false;
    it.onInteract();
    return true;
  }

  /** Current targeted interactable's id, or null. Useful for conditional voice lines. */
  getCurrentInteractable(): string | null { return this.currentInteractableId; }

  /** Apply fog + ambient from a scene config. */
  applyFog(near: number, far: number, color?: number): void {
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = near;
      this.scene.fog.far = far;
      if (color !== undefined) this.scene.fog.color.setHex(color);
    }
  }

  private animate = (): void => {
    let dt = this.clock.getDelta();
    if (dt > 0.1) dt = 0.1;
    const dtMs = dt * 1000;

    // Scene per-frame (light flicker, ambient motion).
    this.currentRoom?.update(dt);

    // Player / external update.
    this.onUpdate?.(dt);

    // Gaze tracking, event bus.
    this.gaze.update(this.camera, dtMs);
    this.eventBus.tick(dtMs);

    // Trigger volumes — fire when player enters armed trigger.
    if (this.triggerCache.length > 0) {
      _playerXZ.set(this.camera.position.x, this.camera.position.z);
      for (const t of this.triggerCache) {
        if (!this.armedTriggers.has(t.id)) continue;
        const insideX = _playerXZ.x > t.box.min[0] && _playerXZ.x < t.box.max[0];
        const insideZ = _playerXZ.y > t.box.min[2] && _playerXZ.y < t.box.max[2];
        if (insideX && insideZ) {
          if (t.once) this.armedTriggers.delete(t.id);
          t.onEnter();
        }
      }
    }

    // Interactable pick — nearest ray-AABB hit within range, camera-forward.
    this.updateInteractablePick();

    // Biosignal tick (every 500ms).
    this.biosignalAccum += dt;
    if (this.biosignalAccum >= 0.5) {
      this.biosignalAccum -= 0.5;
      this.onBiosignalTick?.();
    }

    // Agent tick (every 10s).
    this.agentAccum += dt;
    if (this.agentAccum >= 10) {
      this.agentAccum -= 10;
      this.onAgentTick?.();
    }

    this.renderer.render(this.scene, this.camera);
  };

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(
      Math.floor(window.innerWidth / 2),
      Math.floor(window.innerHeight / 2),
      false,
    );
    // Canvas CSS fills the viewport; `image-rendering: pixelated` upscales the
    // half-res draw buffer for the PS1 crunch. `updateStyle=false` above keeps
    // Three.js from overwriting our `width: 100%; height: 100%` rule.
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
  };

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.stop();
    if (this.currentRoom) {
      this.scene.remove(this.currentRoom.group);
      this.currentRoom.unload();
    }
    this.renderer.dispose();
  }
}
