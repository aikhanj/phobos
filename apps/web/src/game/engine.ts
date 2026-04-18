import * as THREE from 'three';
import type { GameScene } from '@phobos/types';

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly clock: THREE.Clock;

  private currentRoom: GameScene | null = null;
  private biosignalAccum = 0;
  private agentAccum = 0;

  onBiosignalTick: (() => void) | null = null;
  onAgentTick: (() => void) | null = null;
  onUpdate: ((dt: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(
      Math.floor(window.innerWidth / 2),
      Math.floor(window.innerHeight / 2),
    );
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.Fog(0x000000, 1, 15);

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.camera.position.set(0, 1.6, 0);
    this.scene.add(this.camera);

    this.clock = new THREE.Clock(false);

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
  }

  private animate = (): void => {
    let dt = this.clock.getDelta();
    // Clamp dt to prevent physics teleportation after tab switch
    if (dt > 0.1) dt = 0.1;

    // Update current scene
    this.currentRoom?.update(dt);

    // Callback for player/external updates
    this.onUpdate?.(dt);

    // Biosignal tick (every 500ms)
    this.biosignalAccum += dt;
    if (this.biosignalAccum >= 0.5) {
      this.biosignalAccum -= 0.5;
      this.onBiosignalTick?.();
    }

    // Agent tick (every 10s)
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
    );
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
