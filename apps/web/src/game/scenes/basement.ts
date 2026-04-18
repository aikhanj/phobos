import * as THREE from 'three';
import type { AABB, GameScene, GazeTarget, Interactable, SceneEvent, Trigger } from '@phobos/types';
import { SCENE_CONFIGS } from '../sceneConfig';
import { wallAABB, aabbFromCenter } from '../collision';

/**
 * BASEMENT — the ritual chamber. Phobos's calibration room.
 *
 *   Top-down, -Z = north (away from player). 8×3×8 metres.
 *
 *     ┌─────────────────────────────┐  (-Z = -4)
 *     │ [boiler]           [tripod] │
 *     │                             │
 *     │            [shelf+jars]     │
 *     │ [workbench]      [crate*]   │
 *     │                             │
 *     │          ╭─ chalk ─╮        │  ← the circle + 4 candles
 *     │          │  ○  ○  │         │
 *     │          │  ○  ○  │         │
 *     │          ╰────────╯         │
 *     │                        [↑]  │  ← staircase climbing +X / -Z
 *     │ [chair+coat]  [CRT TV]      │
 *     │                             │
 *     │          [ spawn ]          │
 *     └─────────────────────────────┘  (+Z = +4)
 *
 * Design intent:
 *  • The chalk circle + candle array is the calibration anchor. While locked,
 *    the player is standing IN the ritual. Phobos is tuning against their
 *    baseline face/HR.
 *  • The tripod camera is dead-centre on the player — the meta-horror of
 *    "something is filming me" made literal.
 *  • The CRT hisses with static; a blackout flicker kills it briefly.
 *  • The crate is gaze-gated: when the player looks away, it moves. This
 *    fires after calibration.
 *  • The stairs at +X lead up to the bedroom. Only exit.
 */
export class Basement implements GameScene {
  readonly name = 'basement';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(0, 1.6, 3.2);

  private overheadLight!: THREE.PointLight;
  private candleLights: THREE.PointLight[] = [];
  private candleFlames: THREE.Mesh[] = [];
  private tvScreen!: THREE.Mesh;
  private tvStaticTex!: THREE.CanvasTexture;
  private tvStaticCtx!: CanvasRenderingContext2D;
  private tvStaticCanvas!: HTMLCanvasElement;
  private tvStaticAccum = 0;
  private tvGlow!: THREE.PointLight;

  private crate!: THREE.Mesh;
  private crateHome = new THREE.Vector3(2.4, 0.3, -1.6);
  private crateTarget: THREE.Vector3 | null = null;

  private flickerUntil = 0;
  private flickerPattern: 'subtle' | 'hard' | 'blackout' = 'subtle';
  private time = 0;

  private readonly onTransitionToBedroom: () => void;

  constructor(opts: { onTransitionToBedroom: () => void }) {
    this.onTransitionToBedroom = opts.onTransitionToBedroom;
  }

  load(): void {
    const cfg = SCENE_CONFIGS.basement;
    const { width: w, height: h, depth: d } = cfg.dimensions;
    const hw = w / 2;
    const hd = d / 2;

    // ── shell (concrete) ───────────────────────────────────────────────
    this.group.add(this.makeWall(w, d, new THREE.Vector3(0, 0, 0), new THREE.Euler(-Math.PI / 2, 0, 0), 0x4e4236)); // floor
    this.group.add(this.makeWall(w, d, new THREE.Vector3(0, h, 0), new THREE.Euler(Math.PI / 2, 0, 0), 0x2a2420));  // ceiling
    this.group.add(this.makeWall(w, h, new THREE.Vector3(0, h / 2, -hd), new THREE.Euler(0, 0, 0), 0x605246));      // north
    this.group.add(this.makeWall(w, h, new THREE.Vector3(0, h / 2, hd), new THREE.Euler(0, Math.PI, 0), 0x605246)); // south
    this.group.add(this.makeWall(d, h, new THREE.Vector3(-hw, h / 2, 0), new THREE.Euler(0, Math.PI / 2, 0), 0x564a3e));  // west
    this.group.add(this.makeWall(d, h, new THREE.Vector3(hw, h / 2, 0), new THREE.Euler(0, -Math.PI / 2, 0), 0x564a3e)); // east

    // ── bare overhead bulb (strung on a cord over the circle) ──────────
    this.group.add(this.makeProp(0.02, 1.0, 0.02, new THREE.Vector3(0, h - 0.5, 1.5), 0x1a1a1a)); // cord
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe0a0 }),
    );
    bulb.position.set(0, h - 1.0, 1.5);
    this.group.add(bulb);
    this.overheadLight = new THREE.PointLight(0xffb060, 0.5, 7, 2);
    this.overheadLight.position.set(0, h - 1.0, 1.5);
    this.group.add(this.overheadLight);

    // ── ambient ──
    this.group.add(new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity));

    // ── ceiling pipes (wrap the room, sell the "basement" feel) ────────
    this.group.add(this.makeProp(0.1, 0.1, w - 0.6, new THREE.Vector3(-hw + 0.4, h - 0.15, 0), 0x2a2420));
    this.group.add(this.makeProp(0.1, 0.1, w - 0.6, new THREE.Vector3(hw - 0.4, h - 0.15, 0), 0x2a2420));
    this.group.add(this.makeProp(d - 0.8, 0.1, 0.1, new THREE.Vector3(0, h - 0.35, -hd + 0.4), 0x2a2420));
    // a single vertical drop (pipe from ceiling down to boiler)
    this.group.add(this.makeProp(0.1, 1.4, 0.1, new THREE.Vector3(-hw + 0.8, h - 1.4, -hd + 0.8), 0x2a2420));

    // ── chalk circle + 4 candles (the ritual) ─────────────────────────
    this.buildChalkCircle(0, 0.005, 1.5);
    this.placeCandle(-0.8, 0.2, 1.5);
    this.placeCandle(0.8, 0.2, 1.5);
    this.placeCandle(0, 0.2, 0.7);
    this.placeCandle(0, 0.2, 2.3);

    // ── tripod camera aimed at spawn ───────────────────────────────────
    this.buildTripod(0, 0, -1.5);

    // ── CRT TV in SE, static screen, gives a cold glow ────────────────
    this.buildCRT(hw - 0.4, 0.55, 1.8);

    // ── workbench along W wall + tools on top ─────────────────────────
    this.buildWorkbench(-hw + 0.35, 0);

    // ── chair with coat draped, closer to player (south of workbench) ─
    this.buildChairWithCoat(-2.2, 2.4);

    // ── boiler cylinder in NW ──────────────────────────────────────────
    this.buildBoiler(-hw + 0.9, -hd + 1.1);

    // ── stacked boxes in NE ────────────────────────────────────────────
    this.buildBoxStack(hw - 1.2, -hd + 0.9);

    // ── shelf on N wall w/ jars ────────────────────────────────────────
    this.buildShelfWithJars(-1.0, 1.6, -hd + 0.22);

    // ── relocatable crate (gaze-gated) ─────────────────────────────────
    this.crate = this.makeProp(0.6, 0.6, 0.6, this.crateHome, 0x2a1f14);
    this.group.add(this.crate);
    // crate top detail (lid-line)
    const lidRim = this.makeProp(0.62, 0.02, 0.62, new THREE.Vector3(this.crateHome.x, 0.61, this.crateHome.z), 0x180f08);
    lidRim.userData.isCrateRim = true;
    this.group.add(lidRim);

    // ── stairs (+X side, ascending toward -Z into a dark void) ────────
    this.buildStairs(hw - 0.6, -hd + 0.6);
  }

  colliders(): AABB[] {
    const cfg = SCENE_CONFIGS.basement;
    const { width: w, height: h, depth: d } = cfg.dimensions;
    const hw = w / 2;
    const hd = d / 2;
    return [
      // walls
      wallAABB(-hw, -hd, hw, -hd, 0, h),
      wallAABB(-hw, hd, hw, hd, 0, h),
      wallAABB(-hw, -hd, -hw, hd, 0, h),
      wallAABB(hw, -hd, hw, hd, 0, h),
      // workbench
      aabbFromCenter(-hw + 0.35, 0.45, 0, 0.7, 0.45, 1.4),
      // chair
      aabbFromCenter(-2.2, 0.3, 2.4, 0.35, 0.3, 0.35),
      // boiler
      aabbFromCenter(-hw + 0.9, 0.9, -hd + 1.1, 0.45, 0.9, 0.45),
      // box stack
      aabbFromCenter(hw - 1.2, 0.4, -hd + 0.9, 0.4, 0.4, 0.4),
      // CRT cabinet
      aabbFromCenter(hw - 0.4, 0.3, 1.8, 0.35, 0.3, 0.35),
      // CRT stand
      aabbFromCenter(hw - 0.4, 0.15, 1.8, 0.3, 0.15, 0.3),
      // tripod footprint (narrow — player can step past but not through)
      aabbFromCenter(0, 0.3, -1.5, 0.25, 0.3, 0.25),
      // shelf on N wall
      aabbFromCenter(-1.0, 0.8, -hd + 0.22, 0.8, 0.05, 0.18),
      // crate (tracks its current position)
      aabbFromCenter(this.crate?.position.x ?? this.crateHome.x, 0.3, this.crate?.position.z ?? this.crateHome.z, 0.3, 0.3, 0.3),
      // stairs ramp (blocks walking through; player enters via trigger)
      aabbFromCenter(hw - 0.55, 0.5, -hd + 1.55, 0.45, 0.5, 1.2),
    ];
  }

  gazeTargets(): GazeTarget[] {
    const hw = SCENE_CONFIGS.basement.dimensions.width / 2;
    return [
      {
        id: 'basement_crate',
        box: aabbFromCenter(
          this.crate?.position.x ?? this.crateHome.x,
          0.3,
          this.crate?.position.z ?? this.crateHome.z,
          0.3, 0.3, 0.3,
        ),
      },
      // Looking at the tripod = Phobos knows it's been seen.
      { id: 'basement_tripod', box: aabbFromCenter(0, 1.3, -1.5, 0.2, 0.3, 0.2) },
      // Looking at the CRT = feeds the "someone is watching the watcher" loop.
      { id: 'basement_tv', box: aabbFromCenter(hw - 0.4, 0.55, 1.8, 0.3, 0.2, 0.02) },
    ];
  }

  triggers(): Trigger[] {
    return [];
  }

  interactables(): Interactable[] {
    const cfg = SCENE_CONFIGS.basement;
    const hw = cfg.dimensions.width / 2;
    const hd = cfg.dimensions.depth / 2;
    // Stairs foot — look at the first few treads, press E to climb.
    const sx = hw - 0.55;
    const sz = -hd + 1.1;
    return [
      {
        id: 'basement_stairs',
        box: { min: [sx - 0.55, 0, sz - 0.4], max: [sx + 0.55, 1.4, sz + 1.6] },
        hint: 'climb',
        range: 3.5,
        onInteract: () => this.onTransitionToBedroom(),
      },
    ];
  }

  handleEvent(event: SceneEvent): void {
    switch (event.kind) {
      case 'flicker':
        this.flickerUntil = this.time + event.duration;
        this.flickerPattern = event.pattern;
        break;
      case 'prop_move':
        if (event.propId === 'basement_crate') {
          this.crateTarget = new THREE.Vector3(event.to[0], event.to[1], event.to[2]);
        }
        break;
      case 'silence':
        // Handled by AudioManager; nothing scene-local to track here.
        break;
      default: break;
    }
  }

  update(dt: number): void {
    this.time += dt;

    // ── overhead bulb: directed pattern overrides natural jitter ──────
    let base = 0.5;
    if (this.flickerUntil > this.time) {
      switch (this.flickerPattern) {
        case 'subtle':   base = 0.5 + Math.sin(this.time * 18) * 0.08; break;
        case 'hard':     base = 0.5 + (Math.random() < 0.25 ? -0.35 : 0.15); break;
        case 'blackout': base = 0.0; break;
      }
    } else {
      base = 0.5 + Math.sin(this.time * 3.7) * 0.03 + (Math.random() < 0.012 ? -0.15 : 0);
    }
    this.overheadLight.intensity = Math.max(0, base);

    // ── candle flames (chaotic independent) ───────────────────────────
    for (let i = 0; i < this.candleLights.length; i++) {
      const phase = i * 1.37;
      const flick = 0.55 + Math.sin(this.time * (12 + i) + phase) * 0.12 + (Math.random() - 0.5) * 0.08;
      this.candleLights[i].intensity = Math.max(0.15, flick);
      const flame = this.candleFlames[i];
      if (flame) flame.scale.y = 1 + Math.sin(this.time * (20 + i * 2) + phase) * 0.25 + (Math.random() - 0.5) * 0.12;
    }

    // ── CRT static animation (swap canvas every ~60ms) ────────────────
    this.tvStaticAccum += dt;
    if (this.tvStaticAccum > 0.06) {
      this.tvStaticAccum = 0;
      this.paintStatic();
      this.tvStaticTex.needsUpdate = true;
    }
    // TV glow tracks with flicker blackout (goes dark when the bulb goes out)
    const tvOn = this.flickerUntil > this.time && this.flickerPattern === 'blackout' ? 0 : 1;
    this.tvGlow.intensity = 0.22 * tvOn + Math.sin(this.time * 60) * 0.02;
    (this.tvScreen.material as THREE.MeshBasicMaterial).opacity = tvOn;

    // ── crate relocation (event bus already gated on unwatched) ───────
    if (this.crateTarget) {
      this.crate.position.copy(this.crateTarget);
      // move lid-rim along with the box
      for (const child of this.group.children) {
        if ((child as THREE.Object3D).userData?.isCrateRim) {
          (child as THREE.Object3D).position.set(this.crateTarget.x, 0.61, this.crateTarget.z);
        }
      }
      this.crateTarget = null;
    }
  }

  unload(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (obj.material instanceof THREE.Material) obj.material.dispose();
      }
    });
    this.tvStaticTex?.dispose();
    this.group.clear();
    this.candleLights = [];
    this.candleFlames = [];
  }

  // ─────────────────────────────────────────────────────────────────────
  // Prop builders
  // ─────────────────────────────────────────────────────────────────────

  private buildChalkCircle(x: number, y: number, z: number): void {
    // Canvas-drawn chalk ring — cheap, evocative.
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.clearRect(0, 0, 256, 256);
    // faint outer halo
    ctx.strokeStyle = 'rgba(220,220,210,0.35)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(128, 128, 108, 0, Math.PI * 2);
    ctx.stroke();
    // inner double-line
    ctx.strokeStyle = 'rgba(220,220,210,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(128, 128, 94, 0, Math.PI * 2);
    ctx.stroke();
    // some sketchy tick-marks for ritual feel
    ctx.strokeStyle = 'rgba(210,210,200,0.4)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * 100, 128 + Math.sin(a) * 100);
      ctx.lineTo(128 + Math.cos(a) * 115, 128 + Math.sin(a) * 115);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 1.8),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    this.group.add(mesh);
  }

  private placeCandle(x: number, y: number, z: number): void {
    // wax body
    this.group.add(this.makeProp(0.07, 0.18, 0.07, new THREE.Vector3(x, y - 0.01, z), 0xd6c096));
    // flame
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffc960 }),
    );
    flame.position.set(x, y + 0.12, z);
    this.group.add(flame);
    this.candleFlames.push(flame);
    // point light
    const l = new THREE.PointLight(0xff9040, 0.7, 3.2, 2);
    l.position.set(x, y + 0.15, z);
    this.group.add(l);
    this.candleLights.push(l);
  }

  private buildTripod(x: number, y: number, z: number): void {
    // 3 legs (angled down)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = this.makeProp(0.03, 1.25, 0.03, new THREE.Vector3(x + Math.cos(a) * 0.18, y + 0.625, z + Math.sin(a) * 0.18), 0x1a1410);
      leg.rotation.z = Math.cos(a) * 0.12;
      leg.rotation.x = -Math.sin(a) * 0.12;
      this.group.add(leg);
    }
    // camera body
    const body = this.makeProp(0.32, 0.18, 0.22, new THREE.Vector3(x, y + 1.3, z), 0x0a0806);
    this.group.add(body);
    // lens barrel (facing +Z, toward player)
    const lens = this.makeProp(0.12, 0.12, 0.18, new THREE.Vector3(x, y + 1.3, z + 0.18), 0x050302);
    this.group.add(lens);
    // glass eye (unlit, pure black — reads as pupil)
    const eye = new THREE.Mesh(
      new THREE.CircleGeometry(0.05, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    eye.position.set(x, y + 1.3, z + 0.29);
    this.group.add(eye);
    // small red record-LED (tiny glow)
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 4, 4),
      new THREE.MeshBasicMaterial({ color: 0xff2020 }),
    );
    led.position.set(x + 0.13, y + 1.38, z + 0.1);
    this.group.add(led);
  }

  private buildCRT(x: number, y: number, z: number): void {
    // stand
    this.group.add(this.makeProp(0.6, 0.3, 0.45, new THREE.Vector3(x, y - 0.4, z), 0x120d0a));
    // cabinet
    this.group.add(this.makeProp(0.7, 0.55, 0.55, new THREE.Vector3(x, y, z), 0x0e0c0a));
    // screen recess (dark bevel)
    this.group.add(this.makeProp(0.58, 0.42, 0.02, new THREE.Vector3(x - 0.28, y, z), 0x060404));

    // static texture
    this.tvStaticCanvas = document.createElement('canvas');
    this.tvStaticCanvas.width = 64;
    this.tvStaticCanvas.height = 48;
    this.tvStaticCtx = this.tvStaticCanvas.getContext('2d')!;
    this.paintStatic();
    this.tvStaticTex = new THREE.CanvasTexture(this.tvStaticCanvas);
    this.tvStaticTex.colorSpace = THREE.SRGBColorSpace;
    this.tvStaticTex.magFilter = THREE.NearestFilter;
    this.tvStaticTex.minFilter = THREE.NearestFilter;

    // screen plane (faces -X, the room's interior)
    this.tvScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.36),
      new THREE.MeshBasicMaterial({ map: this.tvStaticTex, transparent: true, opacity: 1 }),
    );
    this.tvScreen.rotation.y = -Math.PI / 2;
    this.tvScreen.position.set(x - 0.3, y, z);
    this.group.add(this.tvScreen);

    // TV glow
    this.tvGlow = new THREE.PointLight(0xb0d4ff, 0.22, 2.4, 2);
    this.tvGlow.position.set(x - 0.5, y, z);
    this.group.add(this.tvGlow);
  }

  private paintStatic(): void {
    const ctx = this.tvStaticCtx;
    const img = ctx.createImageData(64, 48);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.floor(Math.random() * 255);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // occasional horizontal scan-line tear
    if (Math.random() < 0.4) {
      const y = Math.floor(Math.random() * 48);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(0, y, 64, 1);
    }
  }

  private buildWorkbench(x: number, z: number): void {
    // surface (spans north–south along west wall)
    this.group.add(this.makeProp(0.55, 0.05, 2.6, new THREE.Vector3(x, 0.9, z), 0x1a120c));
    // legs (4 corners)
    for (const [lx, lz] of [[-0.2, -1.2], [0.2, -1.2], [-0.2, 1.2], [0.2, 1.2]] as const) {
      this.group.add(this.makeProp(0.06, 0.88, 0.06, new THREE.Vector3(x + lx, 0.44, z + lz), 0x100a06));
    }
    // front skirt
    this.group.add(this.makeProp(0.04, 0.1, 2.5, new THREE.Vector3(x + 0.25, 0.85, z), 0x0e0906));

    // tools on top
    // hammer
    this.group.add(this.makeProp(0.04, 0.04, 0.3, new THREE.Vector3(x, 0.95, z - 0.6), 0x3a2a1a)); // handle
    this.group.add(this.makeProp(0.08, 0.07, 0.12, new THREE.Vector3(x, 0.96, z - 0.8), 0x2a2a2e)); // head
    // saw (long thin rectangle laid flat)
    this.group.add(this.makeProp(0.32, 0.02, 0.08, new THREE.Vector3(x - 0.08, 0.94, z - 0.1), 0x555560));
    this.group.add(this.makeProp(0.06, 0.04, 0.1, new THREE.Vector3(x - 0.22, 0.95, z - 0.1), 0x3a2a1a));
    // tin can
    this.group.add(this.makeProp(0.09, 0.11, 0.09, new THREE.Vector3(x - 0.05, 0.97, z + 0.4), 0x5a4a2a));
    // oily rag (flat mess)
    this.group.add(this.makeProp(0.2, 0.02, 0.16, new THREE.Vector3(x + 0.08, 0.94, z + 0.9), 0x1a0f08));
    // pliers
    this.group.add(this.makeProp(0.03, 0.02, 0.18, new THREE.Vector3(x + 0.1, 0.94, z + 1.1), 0x2a2430));
  }

  private buildChairWithCoat(x: number, z: number): void {
    // seat
    this.group.add(this.makeProp(0.45, 0.04, 0.45, new THREE.Vector3(x, 0.48, z), 0x2a1d12));
    // legs
    for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]] as const) {
      this.group.add(this.makeProp(0.04, 0.48, 0.04, new THREE.Vector3(x + lx, 0.24, z + lz), 0x1a0f08));
    }
    // backrest
    this.group.add(this.makeProp(0.45, 0.55, 0.04, new THREE.Vector3(x, 0.78, z + 0.22), 0x1e1510));
    // draped coat — a slouchy mass over the back
    this.group.add(this.makeProp(0.5, 0.6, 0.35, new THREE.Vector3(x, 0.7, z + 0.05), 0x1c1a24));
    // coat sleeve hanging off the side
    this.group.add(this.makeProp(0.12, 0.35, 0.14, new THREE.Vector3(x + 0.2, 0.55, z - 0.05), 0x18161e));
  }

  private buildBoiler(x: number, z: number): void {
    // cylinder body
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 1.7, 12, 1),
      new THREE.MeshLambertMaterial({ color: 0x3a3228, flatShading: true }),
    );
    body.position.set(x, 0.85, z);
    this.group.add(body);
    // rust ring around the base
    const rust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.44, 0.08, 12, 1),
      new THREE.MeshLambertMaterial({ color: 0x3a1a08, flatShading: true }),
    );
    rust.position.set(x, 0.04, z);
    this.group.add(rust);
    // valve handle
    this.group.add(this.makeProp(0.08, 0.04, 0.2, new THREE.Vector3(x + 0.38, 0.9, z), 0x1a1412));
    // gauge (tiny box on front)
    this.group.add(this.makeProp(0.08, 0.08, 0.04, new THREE.Vector3(x + 0.42, 1.15, z + 0.1), 0x0a0806));
    // pipe up to ceiling
    this.group.add(this.makeProp(0.1, 1.4, 0.1, new THREE.Vector3(x, 2.2, z), 0x2a2420));
  }

  private buildBoxStack(x: number, z: number): void {
    this.group.add(this.makeProp(0.75, 0.55, 0.6, new THREE.Vector3(x, 0.28, z), 0x3a2a1a));
    this.group.add(this.makeProp(0.65, 0.45, 0.55, new THREE.Vector3(x - 0.05, 0.78, z + 0.05), 0x3a2a1a));
    // tape strip on top box
    this.group.add(this.makeProp(0.66, 0.02, 0.08, new THREE.Vector3(x - 0.05, 1.01, z + 0.05), 0x8a7a54));
    // small box on floor beside
    this.group.add(this.makeProp(0.4, 0.3, 0.35, new THREE.Vector3(x - 0.7, 0.15, z + 0.2), 0x2a1d14));
  }

  private buildShelfWithJars(x: number, y: number, z: number): void {
    // shelf plank
    this.group.add(this.makeProp(1.6, 0.04, 0.28, new THREE.Vector3(x, y, z), 0x1c1410));
    // brackets
    this.group.add(this.makeProp(0.06, 0.15, 0.25, new THREE.Vector3(x - 0.75, y - 0.08, z), 0x0e0806));
    this.group.add(this.makeProp(0.06, 0.15, 0.25, new THREE.Vector3(x + 0.75, y - 0.08, z), 0x0e0806));
    // lower shelf plank
    this.group.add(this.makeProp(1.6, 0.04, 0.28, new THREE.Vector3(x, y - 0.55, z), 0x1c1410));
    // jars of indeterminate contents (dark green, spaced)
    for (let i = -3; i <= 3; i += 2) {
      this.group.add(this.makeProp(0.14, 0.22, 0.14, new THREE.Vector3(x + i * 0.22, y + 0.13, z + 0.02), 0x1a3028));
      // lid
      this.group.add(this.makeProp(0.16, 0.03, 0.16, new THREE.Vector3(x + i * 0.22, y + 0.26, z + 0.02), 0x3a2a1a));
    }
    // a book on lower shelf
    this.group.add(this.makeProp(0.24, 0.1, 0.18, new THREE.Vector3(x + 0.3, y - 0.48, z + 0.02), 0x2a1208));
  }

  private buildStairs(x: number, zStart: number): void {
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      // tread
      this.group.add(this.makeProp(1.0, 0.04, 0.32, new THREE.Vector3(x, 0.16 + i * 0.2, zStart + i * 0.32), 0x1e1610));
      // riser
      this.group.add(this.makeProp(1.0, 0.2, 0.04, new THREE.Vector3(x, 0.1 + i * 0.2, zStart + i * 0.32 - 0.14), 0x120c08));
      // stringer (side) — single long plank
      if (i === 0) {
        this.group.add(this.makeProp(0.04, 1.4, steps * 0.32, new THREE.Vector3(x - 0.5, 0.7, zStart + steps * 0.16), 0x0e0806));
        this.group.add(this.makeProp(0.04, 1.4, steps * 0.32, new THREE.Vector3(x + 0.5, 0.7, zStart + steps * 0.16), 0x0e0806));
      }
    }
    // top landing
    this.group.add(this.makeProp(1.0, 0.05, 0.4, new THREE.Vector3(x, steps * 0.2, zStart + steps * 0.32 + 0.05), 0x1d1511));
    // doorway void — pure black plane sunk into the back wall
    this.group.add(this.makeProp(0.9, 1.6, 0.02, new THREE.Vector3(x, steps * 0.2 + 0.85, zStart + steps * 0.32 + 0.25), 0x010101));
    // door frame (L/R posts + lintel)
    this.group.add(this.makeProp(0.08, 1.7, 0.08, new THREE.Vector3(x - 0.48, steps * 0.2 + 0.85, zStart + steps * 0.32 + 0.24), 0x110a06));
    this.group.add(this.makeProp(0.08, 1.7, 0.08, new THREE.Vector3(x + 0.48, steps * 0.2 + 0.85, zStart + steps * 0.32 + 0.24), 0x110a06));
    this.group.add(this.makeProp(1.04, 0.1, 0.08, new THREE.Vector3(x, steps * 0.2 + 1.65, zStart + steps * 0.32 + 0.24), 0x110a06));
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
