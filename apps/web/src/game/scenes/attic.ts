import * as THREE from 'three';
import type { AABB, GameScene, GazeTarget, Interactable, SceneEvent, Trigger } from '@phobos/types';
import { SCENE_CONFIGS } from '../sceneConfig';
import { wallAABB, aabbFromCenter } from '../collision';

/**
 * ATTIC — the climax tableau.
 *
 *   Top-down, -Z = north. 10×2.5×6 metres. Low ceiling is the point:
 *   even standing straight, the player feels compressed.
 *
 *     ┌───────────────────────────────────────────────┐ (-Z)
 *     │ [boxes]   [sheet]   [dollhouse]   [sheet]     │
 *     │                                               │
 *     │ [frames]                         [boxes]      │
 *     │              [CENTRAL SHAPE]                  │
 *     │ [sheet]                          [sheet]      │
 *     │                                               │
 *     │ [rocking horse]          [newspapers]         │
 *     │                                               │
 *     │                [HATCH (spawn)]                │
 *     └───────────────────────────────────────────────┘ (+Z)
 *
 * Design intent:
 *  • Four draped decoys at the corners. Silhouettes read as people; the
 *    player clocks them on entry and becomes unsure which, if any, are real.
 *  • The central shape is draped like the decoys but BREATHES. When the
 *    player crosses the climax trigger it inhales — a sharp amplitude jump —
 *    and the demo ends on fade-to-black.
 *  • Rafters + dangling bulb on a chain sell the attic geometry.
 *  • Household debris (boxes, frames, newspapers, dollhouse, rocking horse)
 *    gives the room weight: this is the accumulated life of the house Phobos
 *    has been hunting through.
 */
export class Attic implements GameScene {
  readonly name = 'attic';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(0, 1.6, 2.3);

  private centralShape!: THREE.Group;
  private centralBreathTime = 0;
  private centralInhaled = false;
  private beamLight!: THREE.PointLight;
  private hangingBulb!: THREE.Mesh;
  private bulbChainGroup!: THREE.Group;
  private time = 0;

  private readonly onDemoEnd: () => void;

  constructor(opts: { onDemoEnd: () => void }) {
    this.onDemoEnd = opts.onDemoEnd;
  }

  load(): void {
    const cfg = SCENE_CONFIGS.attic;
    const { width: w, height: h, depth: d } = cfg.dimensions;
    const hw = w / 2;
    const hd = d / 2;

    // ── shell: rough wooden planks, starved colour ─────────────────────
    this.group.add(this.makeWall(w, d, new THREE.Vector3(0, 0, 0), new THREE.Euler(-Math.PI / 2, 0, 0), 0x463424));
    this.group.add(this.makeWall(w, d, new THREE.Vector3(0, h, 0), new THREE.Euler(Math.PI / 2, 0, 0), 0x241a10));
    this.group.add(this.makeWall(w, h, new THREE.Vector3(0, h / 2, -hd), new THREE.Euler(0, 0, 0), 0x4e3a20));
    this.group.add(this.makeWall(w, h, new THREE.Vector3(0, h / 2, hd), new THREE.Euler(0, Math.PI, 0), 0x4e3a20));
    this.group.add(this.makeWall(d, h, new THREE.Vector3(-hw, h / 2, 0), new THREE.Euler(0, Math.PI / 2, 0), 0x44321c));
    this.group.add(this.makeWall(d, h, new THREE.Vector3(hw, h / 2, 0), new THREE.Euler(0, -Math.PI / 2, 0), 0x44321c));

    // Visible floor-plank lines (thin dark strips spanning X every 1m)
    for (let i = -2; i <= 2; i++) {
      const plank = this.makeProp(w - 0.1, 0.005, 0.02, new THREE.Vector3(0, 0.01, i * 1.2), 0x0a0604);
      this.group.add(plank);
    }

    // ── single dim warm point on the hanging bulb ─────────────────────
    this.beamLight = new THREE.PointLight(0xc09460, 0.45, 6.5, 2);
    this.beamLight.position.set(0, h - 0.4, 0);
    this.group.add(this.beamLight);

    this.group.add(new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity));

    // ── rafter beams across ceiling ───────────────────────────────────
    for (let i = -2; i <= 2; i++) {
      this.group.add(this.makeProp(0.14, 0.14, d - 0.2, new THREE.Vector3(i * 2.1, h - 0.08, 0), 0x0e0906));
    }
    // a couple of cross-ties
    this.group.add(this.makeProp(w - 0.2, 0.08, 0.08, new THREE.Vector3(0, h - 0.24, -1.0), 0x0e0906));
    this.group.add(this.makeProp(w - 0.2, 0.08, 0.08, new THREE.Vector3(0, h - 0.24, 1.0), 0x0e0906));

    // ── hanging bulb on a chain (centre) ──────────────────────────────
    this.bulbChainGroup = new THREE.Group();
    this.group.add(this.bulbChainGroup);
    const chain = this.makeProp(0.02, 0.4, 0.02, new THREE.Vector3(0, h - 0.2, 0), 0x2a2420);
    this.bulbChainGroup.add(chain);
    this.hangingBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd4a0 }),
    );
    this.hangingBulb.position.set(0, h - 0.45, 0);
    this.bulbChainGroup.add(this.hangingBulb);
    // tiny socket cap
    this.bulbChainGroup.add(this.makeProp(0.06, 0.04, 0.06, new THREE.Vector3(0, h - 0.38, 0), 0x1a1208));

    // ── 4 draped decoys (asymmetric placement, not obvious mirror) ────
    this.buildDraped(-3.6, -1.9, 1.75);
    this.buildDraped(3.8, -1.7, 1.85);
    this.buildDraped(-3.9, 1.1, 1.7);
    this.buildDraped(3.5, 1.4, 1.8);

    // ── central breathing shape ── (the thing)
    this.buildCentralShape(0, 0, -0.5);

    // ── rocking horse in SW quadrant ──────────────────────────────────
    this.buildRockingHorse(-2.6, 0.8);

    // ── dollhouse on a crate in NE quadrant ───────────────────────────
    this.buildDollhouse(2.6, -2.1);

    // ── stacked picture frames against W wall ─────────────────────────
    this.buildFramesStack(-hw + 0.5, -0.3);

    // ── newspaper piles in SE ──────────────────────────────────────────
    this.buildNewspaperPiles(2.8, 1.4);

    // ── stacked cardboard boxes in NE & NW ────────────────────────────
    this.buildBoxStack(-hw + 0.9, -hd + 0.9);
    this.buildBoxStack(hw - 0.9, -hd + 0.9);

    // ── floor hatch (entry point, now sunken into floor for readability) ─
    const hatch = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 1.0),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    hatch.rotation.x = -Math.PI / 2;
    hatch.position.set(0, 0.012, 2.3);
    this.group.add(hatch);
    // hatch frame
    this.group.add(this.makeProp(1.1, 0.02, 0.04, new THREE.Vector3(0, 0.015, 1.78), 0x0a0604));
    this.group.add(this.makeProp(1.1, 0.02, 0.04, new THREE.Vector3(0, 0.015, 2.82), 0x0a0604));
    this.group.add(this.makeProp(0.04, 0.02, 1.04, new THREE.Vector3(-0.53, 0.015, 2.3), 0x0a0604));
    this.group.add(this.makeProp(0.04, 0.02, 1.04, new THREE.Vector3(0.53, 0.015, 2.3), 0x0a0604));
  }

  colliders(): AABB[] {
    const cfg = SCENE_CONFIGS.attic;
    const { width: w, height: h, depth: d } = cfg.dimensions;
    const hw = w / 2;
    const hd = d / 2;
    return [
      wallAABB(-hw, -hd, hw, -hd, 0, h),
      wallAABB(-hw, hd, hw, hd, 0, h),
      wallAABB(-hw, -hd, -hw, hd, 0, h),
      wallAABB(hw, -hd, hw, hd, 0, h),
      // draped decoys
      aabbFromCenter(-3.6, 0.85, -1.9, 0.3, 0.85, 0.3),
      aabbFromCenter(3.8, 0.85, -1.7, 0.3, 0.85, 0.3),
      aabbFromCenter(-3.9, 0.85, 1.1, 0.3, 0.85, 0.3),
      aabbFromCenter(3.5, 0.85, 1.4, 0.3, 0.85, 0.3),
      // rocking horse (low, wide)
      aabbFromCenter(-2.6, 0.35, 0.8, 0.5, 0.35, 0.25),
      // dollhouse (on a crate — tall-ish)
      aabbFromCenter(2.6, 0.5, -2.1, 0.4, 0.5, 0.35),
      // frames stack against W wall (short vertical)
      aabbFromCenter(-hw + 0.5, 0.4, -0.3, 0.15, 0.4, 0.4),
      // newspapers (low block)
      aabbFromCenter(2.8, 0.2, 1.4, 0.3, 0.2, 0.3),
      // NW + NE box stacks
      aabbFromCenter(-hw + 0.9, 0.45, -hd + 0.9, 0.4, 0.45, 0.4),
      aabbFromCenter(hw - 0.9, 0.45, -hd + 0.9, 0.4, 0.45, 0.4),
      // central shape — small core, player can approach but not walk through
      aabbFromCenter(0, 0.5, -0.5, 0.45, 0.5, 0.3),
    ];
  }

  gazeTargets(): GazeTarget[] {
    return [
      { id: 'attic_central_shape', box: aabbFromCenter(0, 0.9, -0.5, 0.55, 0.9, 0.4) },
    ];
  }

  triggers(): Trigger[] {
    return [];
  }

  interactables(): Interactable[] {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const scene = this;
    return [
      // The central shape. Look at it, press E — it inhales, demo ends.
      {
        id: 'attic_central_shape',
        box: aabbFromCenter(0, 0.9, -0.5, 0.7, 0.9, 0.5),
        hint: 'touch',
        range: 3.5,
        get enabled(): boolean { return !scene.centralInhaled; },
        onInteract: () => {
          scene.centralInhaled = true;
          setTimeout(() => scene.onDemoEnd(), 900);
        },
      },
    ];
  }

  handleEvent(event: SceneEvent): void {
    switch (event.kind) {
      case 'flicker':
        this.beamLight.intensity = event.pattern === 'blackout' ? 0 : 0.45;
        break;
      default: break;
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.centralBreathTime += dt;

    // breathing: 0.25Hz sine, amplitude jumps when inhaled
    const freq = 0.25;
    const amp = this.centralInhaled ? 0.18 : 0.04;
    const breath = Math.sin(this.centralBreathTime * Math.PI * 2 * freq) * amp;
    this.centralShape.scale.y = 1 + breath;
    this.centralShape.position.y = breath * 0.4;

    // subtle beam jitter
    const jitter = Math.sin(this.time * 0.7) * 0.02 + (Math.random() < 0.008 ? -0.08 : 0);
    this.beamLight.intensity = Math.max(0, 0.45 + jitter);

    // bulb swings very gently (as if air shifted)
    this.bulbChainGroup.rotation.x = Math.sin(this.time * 0.4) * 0.02;
    this.bulbChainGroup.rotation.z = Math.sin(this.time * 0.33 + 1) * 0.015;
  }

  unload(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (obj.material instanceof THREE.Material) obj.material.dispose();
      }
    });
    this.group.clear();
  }

  // ─────────────────────────────────────────────────────────────────────
  // Prop builders
  // ─────────────────────────────────────────────────────────────────────

  private buildDraped(x: number, z: number, height: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    this.group.add(g);
    // body mass under sheet
    g.add(this.makeProp(0.45, height * 0.75, 0.45, new THREE.Vector3(0, height * 0.4, 0), 0x0a0806));
    // sheet drape, slightly wider
    g.add(this.makeProp(0.62, height, 0.62, new THREE.Vector3(0, height / 2, 0), 0x302a22));
    // head bulge
    g.add(this.makeProp(0.3, 0.22, 0.3, new THREE.Vector3(0, height - 0.1, 0), 0x342e24));
    // sheet skirt (widens at base, sold with small extra box)
    g.add(this.makeProp(0.72, 0.1, 0.72, new THREE.Vector3(0, 0.05, 0), 0x2a241c));
  }

  private buildCentralShape(x: number, y: number, z: number): void {
    this.centralShape = new THREE.Group();
    this.centralShape.position.set(x, y, z);
    this.group.add(this.centralShape);

    // inner mass — black
    this.centralShape.add(this.makeProp(0.95, 1.35, 0.65, new THREE.Vector3(0, 0.67, 0), 0x070503));
    // sheet drape — taller + wider, slightly lighter so it reads as cloth
    this.centralShape.add(this.makeProp(1.15, 1.55, 0.82, new THREE.Vector3(0, 0.77, 0), 0x403a30));
    // head bulge
    this.centralShape.add(this.makeProp(0.48, 0.38, 0.38, new THREE.Vector3(0, 1.65, 0), 0x4a443a));
    // sheet skirt pooling around base
    this.centralShape.add(this.makeProp(1.35, 0.12, 1.0, new THREE.Vector3(0, 0.06, 0), 0x302a22));
    // "arm" bulges down sides
    this.centralShape.add(this.makeProp(0.22, 0.7, 0.22, new THREE.Vector3(0.52, 0.8, 0), 0x38322a));
    this.centralShape.add(this.makeProp(0.22, 0.7, 0.22, new THREE.Vector3(-0.52, 0.8, 0), 0x38322a));
  }

  private buildRockingHorse(x: number, z: number): void {
    // Two rocker-rails (thin boxes, long axis along Z)
    this.group.add(this.makeProp(0.04, 0.1, 0.8, new THREE.Vector3(x - 0.15, 0.05, z), 0x1a1008));
    this.group.add(this.makeProp(0.04, 0.1, 0.8, new THREE.Vector3(x + 0.15, 0.05, z), 0x1a1008));
    // Body
    this.group.add(this.makeProp(0.3, 0.28, 0.6, new THREE.Vector3(x, 0.4, z), 0x3a2212));
    // Head
    this.group.add(this.makeProp(0.2, 0.25, 0.22, new THREE.Vector3(x, 0.65, z - 0.25), 0x2a1a0e));
    // Ear
    this.group.add(this.makeProp(0.06, 0.08, 0.04, new THREE.Vector3(x + 0.06, 0.78, z - 0.22), 0x1a1008));
    // Tail stub
    this.group.add(this.makeProp(0.05, 0.2, 0.05, new THREE.Vector3(x, 0.5, z + 0.32), 0x1a0f08));
    // Eye (single unlit dot — reads as facing player)
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 5, 5),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    eye.position.set(x - 0.08, 0.68, z - 0.34);
    this.group.add(eye);
  }

  private buildDollhouse(x: number, z: number): void {
    // Supporting crate
    this.group.add(this.makeProp(0.7, 0.4, 0.55, new THREE.Vector3(x, 0.2, z), 0x2a1c10));
    // Dollhouse body
    this.group.add(this.makeProp(0.55, 0.55, 0.45, new THREE.Vector3(x, 0.68, z), 0x3a2a18));
    // Roof (pitched — two sloped planes)
    const roofL = new THREE.Mesh(
      new THREE.PlaneGeometry(0.35, 0.45),
      new THREE.MeshLambertMaterial({ color: 0x2a1208, flatShading: true, side: THREE.DoubleSide }),
    );
    roofL.rotation.z = Math.PI / 4;
    roofL.rotation.y = Math.PI / 2;
    roofL.position.set(x - 0.12, 1.05, z);
    this.group.add(roofL);
    const roofR = new THREE.Mesh(
      new THREE.PlaneGeometry(0.35, 0.45),
      new THREE.MeshLambertMaterial({ color: 0x2a1208, flatShading: true, side: THREE.DoubleSide }),
    );
    roofR.rotation.z = -Math.PI / 4;
    roofR.rotation.y = Math.PI / 2;
    roofR.position.set(x + 0.12, 1.05, z);
    this.group.add(roofR);
    // Tiny windows (yellow dots)
    const win1 = new THREE.Mesh(
      new THREE.PlaneGeometry(0.08, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x1a1208 }),
    );
    win1.rotation.y = Math.PI / 2;
    win1.position.set(x - 0.22, 0.75, z - 0.12);
    this.group.add(win1);
    const win2 = new THREE.Mesh(
      new THREE.PlaneGeometry(0.08, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x1a1208 }),
    );
    win2.rotation.y = Math.PI / 2;
    win2.position.set(x - 0.22, 0.75, z + 0.12);
    this.group.add(win2);
    // Tiny door
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(0.08, 0.14),
      new THREE.MeshBasicMaterial({ color: 0x050302 }),
    );
    door.rotation.y = Math.PI / 2;
    door.position.set(x - 0.22, 0.55, z);
    this.group.add(door);
  }

  private buildFramesStack(x: number, z: number): void {
    // Frames leaning against the wall, face-down. Dark wooden rectangles.
    const frames = [
      { y: 0.3, w: 0.5, h: 0.55, color: 0x2a1a10 },
      { y: 0.32, w: 0.45, h: 0.48, color: 0x1a1008 },
      { y: 0.28, w: 0.55, h: 0.62, color: 0x3a2a14 },
    ];
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const frame = this.makeProp(0.04, f.h, f.w, new THREE.Vector3(x + i * 0.05, f.y, z + i * 0.15), f.color);
      frame.rotation.z = -0.15; // leaning back
      this.group.add(frame);
    }
  }

  private buildNewspaperPiles(x: number, z: number): void {
    // Two short stacks of stacked flat rectangles
    for (let i = 0; i < 6; i++) {
      this.group.add(this.makeProp(0.44, 0.03, 0.3, new THREE.Vector3(x, 0.03 + i * 0.03, z), 0x9a8866 + (i % 2) * 0x100000));
    }
    // Second pile beside it
    for (let i = 0; i < 4; i++) {
      this.group.add(this.makeProp(0.4, 0.03, 0.28, new THREE.Vector3(x + 0.45, 0.03 + i * 0.03, z - 0.1), 0xa89878 + (i % 2) * 0x080000));
    }
  }

  private buildBoxStack(x: number, z: number): void {
    this.group.add(this.makeProp(0.7, 0.5, 0.55, new THREE.Vector3(x, 0.25, z), 0x3a2a1a));
    this.group.add(this.makeProp(0.6, 0.4, 0.5, new THREE.Vector3(x + 0.05, 0.7, z + 0.05), 0x3a2a1a));
    // tape
    this.group.add(this.makeProp(0.62, 0.02, 0.08, new THREE.Vector3(x + 0.05, 0.91, z + 0.05), 0x8a7a54));
  }

  private makeWall(w: number, h: number, p: THREE.Vector3, r: THREE.Euler, color: number): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.FrontSide }),
    );
    mesh.position.copy(p);
    mesh.rotation.copy(r);
    return mesh;
  }

  private makeProp(w: number, h: number, d: number, p: THREE.Vector3, color: number): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color, flatShading: true }),
    );
    mesh.position.copy(p);
    return mesh;
  }
}
