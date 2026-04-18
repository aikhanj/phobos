import * as THREE from 'three';
import type { AABB, GameScene, GazeTarget, Interactable, SceneEvent, Trigger } from '@phobos/types';
import { SCENE_CONFIGS } from '../sceneConfig';
import { wallAABB, aabbFromCenter } from '../collision';

/**
 * BEDROOM — the primary scare theatre. A child's room, slightly wrong.
 *
 *   Top-down, -Z = north, 6×3×7 metres.
 *
 *     ┌──────────────[window]──────────┐   (-Z)
 *     │ [bed-head ↑]                   │
 *     │ [bed]     [rug]                │
 *     │           [ceil. hatch (up)]   │
 *     │ [nightstand+lamp]      [mirror]│ ← east wall
 *     │                                │
 *     │                     [wardrobe] │ ← east wall, hinged door
 *     │ [toy chest]                    │
 *     │                    [chair+coat]│
 *     │ [bookshelf]                    │
 *     │                                │
 *     │ [drawings on W wall]           │
 *     │                                │
 *     └──────────────[entry door]──────┘   (+Z, spawn here)
 *
 * Threat triangle: window (N), mirror (E-north), wardrobe (E-south). A 70°
 * FOV from the entry cannot contain all three; whichever goes unwatched is
 * where Phobos acts. The nightstand lamp is the only warm light — ambient is
 * a bluish moon wash through the window, so the lamp's small radius is where
 * the player feels "safe," which is exactly where Phobos wants them.
 *
 * Exit = ceiling hatch (centre-north). Pacing unlocks it near the beat's end.
 */
export class Bedroom implements GameScene {
  readonly name = 'bedroom';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(0, 1.6, 2.9);

  private lampLight!: THREE.PointLight;
  private ambientLight!: THREE.AmbientLight;
  private moonLight!: THREE.DirectionalLight;

  private wardrobeHinge!: THREE.Group;
  private wardrobeTargetAngle = 0;
  private wardrobeCurrentAngle = 0;

  private windowFigure!: THREE.Mesh;
  private windowFigureTargetOpacity = 0;
  private windowFigureTimer = 0;

  private mirror!: THREE.Mesh;
  private mirrorVariants: Record<string, THREE.Texture> = {};

  private ceilingHatch!: THREE.Mesh;
  private hatchUnlocked = false;
  private hatchOpenAmount = 0;

  private entryDoor!: THREE.Mesh;
  private entryDoorClosed = false;

  private flickerUntil = 0;
  private flickerPattern: 'subtle' | 'hard' | 'blackout' = 'subtle';
  private time = 0;
  private pulseOffset = Math.random() * 100;

  private readonly onTransitionToAttic: () => void;

  constructor(opts: { onTransitionToAttic: () => void }) {
    this.onTransitionToAttic = opts.onTransitionToAttic;
  }

  load(): void {
    const cfg = SCENE_CONFIGS.bedroom;
    const { width: w, height: h, depth: d } = cfg.dimensions;
    const hw = w / 2;
    const hd = d / 2;

    // ── shell (wood-ish trim, muted purples for the moon wash) ─────────
    this.group.add(this.makeWall(w, d, new THREE.Vector3(0, 0, 0), new THREE.Euler(-Math.PI / 2, 0, 0), 0x3e3340));
    this.group.add(this.makeWall(w, d, new THREE.Vector3(0, h, 0), new THREE.Euler(Math.PI / 2, 0, 0), 0x2a2434));
    this.group.add(this.makeWall(w, h, new THREE.Vector3(0, h / 2, -hd), new THREE.Euler(0, 0, 0), 0x564c68));
    this.group.add(this.makeWall(w, h, new THREE.Vector3(0, h / 2, hd), new THREE.Euler(0, Math.PI, 0), 0x564c68));
    this.group.add(this.makeWall(d, h, new THREE.Vector3(-hw, h / 2, 0), new THREE.Euler(0, Math.PI / 2, 0), 0x4e4460));
    this.group.add(this.makeWall(d, h, new THREE.Vector3(hw, h / 2, 0), new THREE.Euler(0, -Math.PI / 2, 0), 0x4e4460));

    // baseboard trim along all 4 walls for spatial reference
    this.group.add(this.makeProp(w - 0.02, 0.1, 0.04, new THREE.Vector3(0, 0.05, -hd + 0.02), 0x0a0608));
    this.group.add(this.makeProp(w - 0.02, 0.1, 0.04, new THREE.Vector3(0, 0.05, hd - 0.02), 0x0a0608));
    this.group.add(this.makeProp(0.04, 0.1, d - 0.02, new THREE.Vector3(-hw + 0.02, 0.05, 0), 0x0a0608));
    this.group.add(this.makeProp(0.04, 0.1, d - 0.02, new THREE.Vector3(hw - 0.02, 0.05, 0), 0x0a0608));

    // ── lighting ──
    // Nightstand lamp — the warm safety light. Player gravitates here.
    this.lampLight = new THREE.PointLight(0xffa060, 0.7, 4.5, 2);
    this.lampLight.position.set(-1.1, 0.9, -2.0);
    this.group.add(this.lampLight);

    this.ambientLight = new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity);
    this.group.add(this.ambientLight);

    // Moon fill from the window — cold, weak, from the north
    this.moonLight = new THREE.DirectionalLight(0x8aa6ff, 0.18);
    this.moonLight.position.set(0, 2.2, -5);
    this.moonLight.target.position.set(0, 0.5, 1);
    this.group.add(this.moonLight);
    this.group.add(this.moonLight.target);

    // ── bed (west wall, head to north) ───────────────────────────────
    this.buildBed(-2.0, -1.4);

    // ── nightstand + lamp beside bed ─────────────────────────────────
    this.buildNightstand(-1.1, -2.0);

    // ── toy chest at the foot of the bed ─────────────────────────────
    this.buildToyChest(-2.0, 0.2);

    // ── area rug under/beside bed ────────────────────────────────────
    this.buildRug(-1.3, -1.4);

    // ── bookshelf on W wall, south of bed ────────────────────────────
    this.buildBookshelf(-hw + 0.17, 1.2);

    // ── wardrobe + hinged door (east wall) ───────────────────────────
    this.buildWardrobe(hw - 0.35, -0.3);

    // ── mirror (east wall, north of wardrobe) ────────────────────────
    this.buildMirror(hw - 0.02, -1.9);

    // ── window (north wall, centred high) ────────────────────────────
    this.buildWindow(0, h - 1.0, -hd + 0.02);

    // ── chair with draped coat (east-centre, near window line) ───────
    this.buildChairWithCoat(0.9, -2.3);

    // ── drawings on W wall (child's crayon silhouettes) ──────────────
    this.buildDrawings(-hw + 0.06);

    // ── entry door (south wall, slides shut on trigger) ──────────────
    this.buildEntryDoor(0, h / 2 - 0.1, hd - 0.02);

    // ── ceiling hatch (initially sealed, unlocks near end of beat) ───
    this.buildCeilingHatch(0, h - 0.01, -0.8);
  }

  colliders(): AABB[] {
    const cfg = SCENE_CONFIGS.bedroom;
    const { width: w, height: h, depth: d } = cfg.dimensions;
    const hw = w / 2;
    const hd = d / 2;
    return [
      wallAABB(-hw, -hd, hw, -hd, 0, h),
      wallAABB(-hw, hd, hw, hd, 0, h),
      wallAABB(-hw, -hd, -hw, hd, 0, h),
      wallAABB(hw, -hd, hw, hd, 0, h),
      // bed (frame + mattress as one block, extends along Z)
      aabbFromCenter(-2.0, 0.3, -1.4, 0.7, 0.3, 1.0),
      // nightstand
      aabbFromCenter(-1.1, 0.3, -2.0, 0.22, 0.3, 0.2),
      // toy chest
      aabbFromCenter(-2.0, 0.25, 0.2, 0.45, 0.25, 0.25),
      // wardrobe body (door volume excluded so open door doesn't trap the player)
      aabbFromCenter(hw - 0.4, 1.0, -0.3, 0.35, 1.0, 0.55),
      // mirror frame (slim)
      aabbFromCenter(hw - 0.1, 1.2, -1.9, 0.1, 0.6, 0.3),
      // chair
      aabbFromCenter(0.9, 0.3, -2.3, 0.22, 0.3, 0.22),
      // bookshelf
      aabbFromCenter(-hw + 0.17, 0.8, 1.2, 0.15, 0.8, 0.45),
    ];
  }

  gazeTargets(): GazeTarget[] {
    const cfg = SCENE_CONFIGS.bedroom;
    const hd = cfg.dimensions.depth / 2;
    return [
      { id: 'bedroom_wardrobe_door', box: aabbFromCenter(cfg.dimensions.width / 2 - 0.4, 1.0, -0.3, 0.5, 1.0, 0.55) },
      { id: 'bedroom_mirror',        box: aabbFromCenter(cfg.dimensions.width / 2 - 0.1, 1.2, -1.9, 0.15, 0.6, 0.3) },
      { id: 'bedroom_window_figure', box: aabbFromCenter(0, cfg.dimensions.height - 1.0, -hd + 0.1, 0.55, 0.4, 0.1) },
      // Looking at the doll on the pillow also counts — a gaze anchor Phobos cares about.
      { id: 'bedroom_doll', box: aabbFromCenter(-2.0, 0.6, -2.15, 0.08, 0.08, 0.08) },
    ];
  }

  triggers(): Trigger[] {
    const cfg = SCENE_CONFIGS.bedroom;
    const hd = cfg.dimensions.depth / 2;
    return [
      {
        id: 'bedroom_entry_closer',
        // Fires when the player walks a metre or so in from the south door.
        // Spawn is z=2.9; trigger at z∈[1.0, 1.8] so it only fires on forward motion.
        box: { min: [-0.8, 0, hd - 2.5], max: [0.8, 2.5, hd - 1.7] },
        once: true,
        onEnter: () => { this.entryDoorClosed = true; },
      },
    ];
  }

  interactables(): Interactable[] {
    const cfg = SCENE_CONFIGS.bedroom;
    const hw = cfg.dimensions.width / 2;
    const h = cfg.dimensions.height;
    // capture for use inside property getters (which can't use `this`)
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const scene = this;
    return [
      // Wardrobe door — on E, fling ajar. If already ajar, slam it shut.
      {
        id: 'bedroom_wardrobe',
        box: aabbFromCenter(hw - 0.4, 1.0, -0.3, 0.5, 1.0, 0.55),
        range: 2.5,
        get hint(): string { return scene.wardrobeTargetAngle > 0.1 ? 'close' : 'open'; },
        onInteract: () => {
          scene.wardrobeTargetAngle = scene.wardrobeTargetAngle > 0.1 ? 0 : Math.PI * 0.55;
        },
      },
      // Ceiling hatch — only pickable once Phobos unlocks it (enabled flips).
      {
        id: 'bedroom_hatch',
        box: { min: [-0.55, h - 0.8, -1.3], max: [0.55, h + 0.1, -0.3] },
        hint: 'climb',
        range: 4,
        get enabled(): boolean { return scene.hatchUnlocked; },
        onInteract: () => scene.onTransitionToAttic(),
      },
    ];
  }

  handleEvent(event: SceneEvent): void {
    switch (event.kind) {
      case 'flicker':
        this.flickerUntil = this.time + event.duration;
        this.flickerPattern = event.pattern;
        break;
      case 'figure':
        if (event.anchor === 'window') {
          this.windowFigureTargetOpacity = event.opacity;
          this.windowFigureTimer = event.duration;
        }
        break;
      case 'prop_state':
        if (event.propId === 'bedroom_wardrobe_door') {
          this.wardrobeTargetAngle = (event.param ?? 0.3) * (Math.PI / 2);
        }
        break;
      case 'mirror_swap': {
        const tex = this.mirrorVariants[event.variant];
        if (tex) {
          (this.mirror.material as THREE.MeshBasicMaterial).map = tex;
          (this.mirror.material as THREE.MeshBasicMaterial).needsUpdate = true;
        }
        break;
      }
      case 'unlock':
        if (event.propId === 'bedroom_hatch') this.hatchUnlocked = true;
        break;
      case 'lock':
        if (event.propId === 'bedroom_door') this.entryDoorClosed = true;
        break;
      default: break;
    }
  }

  update(dt: number): void {
    this.time += dt;

    // ── lamp flicker ──
    let base = 0.7;
    if (this.flickerUntil > this.time) {
      switch (this.flickerPattern) {
        case 'subtle':   base = 0.7 + Math.sin(this.time * 20) * 0.08; break;
        case 'hard':     base = 0.7 + (Math.random() < 0.3 ? -0.4 : 0.15); break;
        case 'blackout': base = 0; break;
      }
    } else {
      base = 0.7 + Math.sin((this.time + this.pulseOffset) * 0.9) * 0.04;
    }
    this.lampLight.intensity = Math.max(0, base);

    // ── wardrobe door hinge ──
    this.wardrobeCurrentAngle += (this.wardrobeTargetAngle - this.wardrobeCurrentAngle) * Math.min(1, dt * 2.5);
    this.wardrobeHinge.rotation.y = this.wardrobeCurrentAngle;

    // ── window silhouette fade ──
    if (this.windowFigureTimer > 0) this.windowFigureTimer -= dt;
    else this.windowFigureTargetOpacity = 0;
    const wmat = this.windowFigure.material as THREE.MeshBasicMaterial;
    wmat.opacity += (this.windowFigureTargetOpacity - wmat.opacity) * Math.min(1, dt * 3);
    this.windowFigure.visible = wmat.opacity > 0.01;

    // ── entry door slam ──
    if (this.entryDoorClosed) {
      this.entryDoor.position.z += (0 - this.entryDoor.position.z) * Math.min(1, dt * 6);
    }

    // ── hatch fade-open ──
    if (this.hatchUnlocked && this.hatchOpenAmount < 1) {
      this.hatchOpenAmount += dt * 0.5;
      const mat = this.ceilingHatch.material as THREE.MeshBasicMaterial;
      mat.color.setScalar(Math.max(0, 0.08 - this.hatchOpenAmount * 0.08));
    }
  }

  unload(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (obj.material instanceof THREE.Material) obj.material.dispose();
      }
    });
    for (const tex of Object.values(this.mirrorVariants)) tex.dispose();
    this.mirrorVariants = {};
    this.group.clear();
  }

  // ─────────────────────────────────────────────────────────────────────
  // Prop builders
  // ─────────────────────────────────────────────────────────────────────

  private buildBed(x: number, z: number): void {
    // Frame
    this.group.add(this.makeProp(1.4, 0.3, 2.0, new THREE.Vector3(x, 0.15, z), 0x1a1210));
    // Mattress
    this.group.add(this.makeProp(1.3, 0.15, 1.9, new THREE.Vector3(x, 0.38, z), 0x4a3a54));
    // Sheets / blanket covering most of the mattress
    this.group.add(this.makeProp(1.32, 0.02, 1.5, new THREE.Vector3(x, 0.46, z + 0.15), 0x2a2238));
    // Pillow (north end — head of bed)
    this.group.add(this.makeProp(0.9, 0.12, 0.4, new THREE.Vector3(x + 0.05, 0.52, z - 0.75), 0x554a66));
    // Second pillow stacked
    this.group.add(this.makeProp(0.85, 0.1, 0.38, new THREE.Vector3(x, 0.62, z - 0.78), 0x3a3050));
    // Headboard (tall, silhouette against N wall)
    this.group.add(this.makeProp(1.4, 0.9, 0.08, new THREE.Vector3(x, 0.75, z - 0.96), 0x120b08));
    // Footboard (short)
    this.group.add(this.makeProp(1.4, 0.4, 0.08, new THREE.Vector3(x, 0.5, z + 0.96), 0x140c09));
    // Blanket folded at foot
    this.group.add(this.makeProp(1.2, 0.1, 0.35, new THREE.Vector3(x, 0.51, z + 0.65), 0x24182a));

    // Doll on pillow — the kind of thing Phobos might want you to look at
    this.group.add(this.makeProp(0.16, 0.26, 0.1, new THREE.Vector3(x - 0.1, 0.65, z - 0.8), 0x3a2a18)); // body
    this.group.add(this.makeProp(0.12, 0.12, 0.1, new THREE.Vector3(x - 0.1, 0.82, z - 0.8), 0xa08060)); // head
    // little black button eyes
    const eyeGeo = new THREE.SphereGeometry(0.008, 4, 4);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(x - 0.13, 0.83, z - 0.75);
    this.group.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(x - 0.07, 0.83, z - 0.75);
    this.group.add(eyeR);
  }

  private buildNightstand(x: number, z: number): void {
    // Body
    this.group.add(this.makeProp(0.44, 0.6, 0.4, new THREE.Vector3(x, 0.3, z), 0x180f0a));
    // Drawer line
    this.group.add(this.makeProp(0.42, 0.02, 0.01, new THREE.Vector3(x, 0.45, z + 0.2), 0x0a0604));
    // Knob
    this.group.add(this.makeProp(0.04, 0.04, 0.04, new THREE.Vector3(x, 0.52, z + 0.22), 0x5a4428));
    // Lamp base (small cylinder look)
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 0.1, 8, 1),
      new THREE.MeshLambertMaterial({ color: 0x2a1a12, flatShading: true }),
    );
    base.position.set(x, 0.65, z);
    this.group.add(base);
    // Lamp column
    this.group.add(this.makeProp(0.03, 0.22, 0.03, new THREE.Vector3(x, 0.82, z), 0x1a1008));
    // Shade (tapered box approximation)
    this.group.add(this.makeProp(0.22, 0.16, 0.22, new THREE.Vector3(x, 1.0, z), 0x8a6a4a));
    // Tiny lit bulb hint (unlit material, bright emissive-ish)
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffdda0 }),
    );
    bulb.position.set(x, 0.97, z);
    this.group.add(bulb);
    // Book on the nightstand
    this.group.add(this.makeProp(0.16, 0.04, 0.22, new THREE.Vector3(x + 0.05, 0.62, z - 0.05), 0x3a1208));
  }

  private buildToyChest(x: number, z: number): void {
    // Body
    this.group.add(this.makeProp(0.9, 0.5, 0.5, new THREE.Vector3(x, 0.25, z), 0x3a2614));
    // Lid
    this.group.add(this.makeProp(0.92, 0.06, 0.52, new THREE.Vector3(x, 0.53, z), 0x2a1c0e));
    // Hinge line
    this.group.add(this.makeProp(0.92, 0.02, 0.03, new THREE.Vector3(x, 0.5, z - 0.24), 0x0a0604));
    // Latch
    this.group.add(this.makeProp(0.06, 0.06, 0.04, new THREE.Vector3(x, 0.5, z + 0.26), 0x8a6a34));
  }

  private buildRug(x: number, z: number): void {
    // A dark patterned rug — just a flat tinted plane. Breaks up the floor.
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 1.4),
      new THREE.MeshLambertMaterial({ color: 0x3a1a20, flatShading: true }),
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(x, 0.005, z);
    this.group.add(rug);
    // Border strip (slightly lighter)
    const border = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 1.2),
      new THREE.MeshLambertMaterial({ color: 0x5a2a30, flatShading: true }),
    );
    border.rotation.x = -Math.PI / 2;
    border.position.set(x, 0.006, z);
    this.group.add(border);
  }

  private buildBookshelf(x: number, z: number): void {
    // Side panels
    this.group.add(this.makeProp(0.04, 1.6, 0.4, new THREE.Vector3(x + 0.01, 0.8, z - 0.42), 0x140c08));
    this.group.add(this.makeProp(0.04, 1.6, 0.4, new THREE.Vector3(x + 0.01, 0.8, z + 0.42), 0x140c08));
    // Back panel
    this.group.add(this.makeProp(0.04, 1.6, 0.88, new THREE.Vector3(x + 0.02, 0.8, z), 0x0a0604));
    // 3 shelves
    for (const y of [0.3, 0.8, 1.3]) {
      this.group.add(this.makeProp(0.28, 0.03, 0.88, new THREE.Vector3(x + 0.15, y, z), 0x1a120a));
    }
    // books on middle shelf
    for (let i = -3; i <= 3; i++) {
      this.group.add(this.makeProp(0.1, 0.22, 0.08, new THREE.Vector3(x + 0.2, 0.92, z + i * 0.1), [0x3a1208, 0x2a1a08, 0x181030][(i + 10) % 3]));
    }
    // a toy car on the top shelf
    this.group.add(this.makeProp(0.18, 0.08, 0.1, new THREE.Vector3(x + 0.18, 1.36, z - 0.1), 0x8a1a1a));
    // single leaning book on bottom
    this.group.add(this.makeProp(0.1, 0.2, 0.06, new THREE.Vector3(x + 0.18, 0.43, z - 0.3), 0x2a3010));
  }

  private buildWardrobe(x: number, z: number): void {
    const body = new THREE.Group();
    body.position.set(x - 0.25, 0, z);
    this.group.add(body);

    // back panel
    body.add(this.makeProp(0.05, 2.0, 0.7, new THREE.Vector3(0.22, 1.0, 0), 0x0a0706));
    // left panel
    body.add(this.makeProp(0.45, 2.0, 0.05, new THREE.Vector3(0, 1.0, -0.35), 0x120d0b));
    // right panel
    body.add(this.makeProp(0.45, 2.0, 0.05, new THREE.Vector3(0, 1.0, 0.35), 0x120d0b));
    // top
    body.add(this.makeProp(0.45, 0.04, 0.72, new THREE.Vector3(0, 2.0, 0), 0x0e0a08));
    // bottom (interior floor, very dark to suggest depth)
    body.add(this.makeProp(0.42, 0.02, 0.68, new THREE.Vector3(0, 0.02, 0), 0x060404));

    // Hinge pivots on south-west edge
    this.wardrobeHinge = new THREE.Group();
    this.wardrobeHinge.position.set(-0.22, 1.0, -0.35);
    body.add(this.wardrobeHinge);

    const door = this.makeProp(0.04, 1.96, 0.68, new THREE.Vector3(0, 0, 0.34), 0x1a1410);
    this.wardrobeHinge.add(door);
    // door knob
    const knob = this.makeProp(0.04, 0.04, 0.04, new THREE.Vector3(0.03, 0, 0.64), 0x5a4228);
    this.wardrobeHinge.add(knob);
    // door panel inset (shallow detail box)
    const inset = this.makeProp(0.02, 1.6, 0.5, new THREE.Vector3(0.02, 0, 0.34), 0x0c0806);
    this.wardrobeHinge.add(inset);

    // Interior darkness reads as infinite depth under fog
    const interior = new THREE.Mesh(
      new THREE.PlaneGeometry(0.65, 1.9),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    interior.rotation.y = -Math.PI / 2;
    interior.position.set(0.19, 1.0, 0);
    body.add(interior);
  }

  private buildMirror(x: number, z: number): void {
    const frameW = 0.08;
    this.group.add(this.makeProp(0.04, 1.3, 0.6 + frameW * 2, new THREE.Vector3(x + 0.01, 1.2, z), 0x0e0a08));
    // ornate top cap
    this.group.add(this.makeProp(0.04, 0.08, 0.8, new THREE.Vector3(x + 0.01, 1.88, z), 0x1a1008));
    // ornate bottom cap
    this.group.add(this.makeProp(0.04, 0.08, 0.8, new THREE.Vector3(x + 0.01, 0.52, z), 0x1a1008));

    this.mirror = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 1.1),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    this.mirror.rotation.y = -Math.PI / 2;
    this.mirror.position.set(x - 0.02, 1.2, z);
    this.group.add(this.mirror);

    this.mirrorVariants = {
      empty: makeMirrorTexture('empty'),
      extra_figure: makeMirrorTexture('extra_figure'),
      wrong_prop: makeMirrorTexture('wrong_prop'),
      darker: makeMirrorTexture('darker'),
    };
    (this.mirror.material as THREE.MeshBasicMaterial).map = this.mirrorVariants.empty;
    (this.mirror.material as THREE.MeshBasicMaterial).needsUpdate = true;
  }

  private buildWindow(x: number, y: number, z: number): void {
    // Window frame
    this.group.add(this.makeProp(1.4, 1.0, 0.06, new THREE.Vector3(x, y, z - 0.01), 0x0a0806));
    // Glass — deep blue (night)
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.8),
      new THREE.MeshBasicMaterial({ color: 0x1a2642 }),
    );
    glass.position.set(x, y, z + 0.02);
    this.group.add(glass);
    // Mullion (cross)
    this.group.add(this.makeProp(0.04, 0.8, 0.03, new THREE.Vector3(x, y, z + 0.03), 0x0a0806));
    this.group.add(this.makeProp(1.1, 0.04, 0.03, new THREE.Vector3(x, y, z + 0.03), 0x0a0806));
    // Sill below
    this.group.add(this.makeProp(1.5, 0.08, 0.2, new THREE.Vector3(x, y - 0.55, z + 0.08), 0x0c0806));
    // Curtain strips on either side (long thin dark cloth)
    this.group.add(this.makeProp(0.12, 1.3, 0.03, new THREE.Vector3(x - 0.75, y - 0.15, z + 0.1), 0x0e0608));
    this.group.add(this.makeProp(0.12, 1.3, 0.03, new THREE.Vector3(x + 0.75, y - 0.15, z + 0.1), 0x0e0608));

    // Figure silhouette (fades in for window-scare event)
    this.windowFigure = new THREE.Mesh(
      new THREE.PlaneGeometry(0.45, 0.8),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 }),
    );
    this.windowFigure.position.set(x + 0.18, y - 0.05, z + 0.035);
    this.windowFigure.visible = false;
    this.group.add(this.windowFigure);
  }

  private buildChairWithCoat(x: number, z: number): void {
    // seat
    this.group.add(this.makeProp(0.44, 0.04, 0.44, new THREE.Vector3(x, 0.48, z), 0x2a1d12));
    // legs
    for (const [lx, lz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]] as const) {
      this.group.add(this.makeProp(0.04, 0.48, 0.04, new THREE.Vector3(x + lx, 0.24, z + lz), 0x1a0f08));
    }
    // backrest
    this.group.add(this.makeProp(0.44, 0.6, 0.04, new THREE.Vector3(x, 0.8, z + 0.2), 0x1e1510));
    // coat draped — blocky person-shape
    this.group.add(this.makeProp(0.5, 0.7, 0.32, new THREE.Vector3(x, 0.75, z + 0.05), 0x1a141e));
    // coat sleeve hanging
    this.group.add(this.makeProp(0.12, 0.4, 0.14, new THREE.Vector3(x - 0.22, 0.55, z - 0.02), 0x18121c));
    this.group.add(this.makeProp(0.12, 0.38, 0.14, new THREE.Vector3(x + 0.22, 0.55, z - 0.02), 0x18121c));
    // Hat perched on top — tilts into "a figure sitting" silhouette
    this.group.add(this.makeProp(0.26, 0.08, 0.26, new THREE.Vector3(x, 1.14, z + 0.05), 0x0c0808));
    this.group.add(this.makeProp(0.32, 0.04, 0.32, new THREE.Vector3(x, 1.1, z + 0.05), 0x0a0606));
  }

  private buildDrawings(xWall: number): void {
    // Three children's drawings taped to the west wall.
    const positions = [
      { y: 1.4, z: 0.4, variant: 'family' as const },
      { y: 1.25, z: 0.9, variant: 'house' as const },
      { y: 1.5, z: -0.4, variant: 'figure' as const },
    ];
    for (const p of positions) {
      const tex = makeDrawingTexture(p.variant);
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 0.34),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
      );
      plane.rotation.y = Math.PI / 2;
      plane.position.set(xWall + 0.01, p.y, p.z);
      this.group.add(plane);
    }
  }

  private buildEntryDoor(x: number, y: number, z: number): void {
    // Door hidden off-frame (x+1.5); `entryDoorClosed` slides it to x=0 behind the player.
    this.entryDoor = this.makeProp(1.0, 2.0, 0.06, new THREE.Vector3(x + 1.5, y, z), 0x0a0605);
    this.group.add(this.entryDoor);
    // Door frame (always visible)
    this.group.add(this.makeProp(0.08, 2.1, 0.06, new THREE.Vector3(-0.55, y, z), 0x110a06));
    this.group.add(this.makeProp(0.08, 2.1, 0.06, new THREE.Vector3(0.55, y, z), 0x110a06));
    this.group.add(this.makeProp(1.18, 0.1, 0.06, new THREE.Vector3(0, y + 1.0, z), 0x110a06));
  }

  private buildCeilingHatch(x: number, y: number, z: number): void {
    // Hatch plane in the ceiling — dark rectangle that fades to pure black on unlock.
    this.ceilingHatch = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 1.0),
      new THREE.MeshBasicMaterial({ color: 0x141122 }),
    );
    this.ceilingHatch.rotation.x = Math.PI / 2;
    this.ceilingHatch.position.set(x, y, z);
    this.group.add(this.ceilingHatch);
    // Ceiling frame around hatch (implies hinged cover)
    this.group.add(this.makeProp(1.1, 0.03, 0.04, new THREE.Vector3(x, y - 0.01, z - 0.52), 0x0a0806));
    this.group.add(this.makeProp(1.1, 0.03, 0.04, new THREE.Vector3(x, y - 0.01, z + 0.52), 0x0a0806));
    this.group.add(this.makeProp(0.04, 0.03, 1.0, new THREE.Vector3(x - 0.52, y - 0.01, z), 0x0a0806));
    this.group.add(this.makeProp(0.04, 0.03, 1.0, new THREE.Vector3(x + 0.52, y - 0.01, z), 0x0a0806));
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

/** Canvas-baked mirror reflection variants. Low-fi on purpose — PS1 vibe. */
function makeMirrorTexture(variant: 'empty' | 'extra_figure' | 'wrong_prop' | 'darker'): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, variant === 'darker' ? '#05050a' : '#121624');
  grad.addColorStop(1, '#08080e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // faint bed hint in reflection
  ctx.fillStyle = '#1a1a24';
  ctx.fillRect(15, 180, 40, 20);

  if (variant === 'extra_figure') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(54, 60, 14, 120);  // body
    ctx.fillRect(50, 45, 22, 22);   // head
  } else if (variant === 'wrong_prop') {
    ctx.fillStyle = '#1c1410';
    ctx.fillRect(75, 100, 40, 60);
  }

  const v = ctx.createRadialGradient(64, 128, 20, 64, 128, 160);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

/** Crayon drawings — three quick canvas stamps, low-fi. */
function makeDrawingTexture(variant: 'family' | 'house' | 'figure'): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#c9b88a'; // yellowed paper
  ctx.fillRect(0, 0, 64, 64);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2;

  if (variant === 'family') {
    // Three stick figures; one taller, one small, one… thinner, no face.
    const drawFigure = (x: number, scale: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(x, 24 - scale * 4, 4 * scale, 0, Math.PI * 2); // head
      ctx.moveTo(x, 28 - scale * 4);
      ctx.lineTo(x, 44); // body
      ctx.moveTo(x - 5 * scale, 34);
      ctx.lineTo(x + 5 * scale, 34); // arms
      ctx.moveTo(x, 44);
      ctx.lineTo(x - 4 * scale, 56); // leg L
      ctx.moveTo(x, 44);
      ctx.lineTo(x + 4 * scale, 56); // leg R
      ctx.stroke();
    };
    drawFigure(16, 1, '#553322');
    drawFigure(32, 0.75, '#225588');
    // third figure: tall, thin, no head circle drawn
    ctx.strokeStyle = '#2a1510';
    ctx.beginPath();
    ctx.moveTo(50, 10);
    ctx.lineTo(50, 52);
    ctx.moveTo(46, 22);
    ctx.lineTo(54, 22);
    ctx.moveTo(50, 52);
    ctx.lineTo(46, 60);
    ctx.moveTo(50, 52);
    ctx.lineTo(54, 60);
    ctx.stroke();
  } else if (variant === 'house') {
    ctx.strokeStyle = '#663322';
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 28, 40, 28);
    ctx.beginPath();
    ctx.moveTo(8, 30);
    ctx.lineTo(32, 12);
    ctx.lineTo(56, 30);
    ctx.stroke();
    // door
    ctx.strokeRect(28, 40, 8, 16);
    // windows
    ctx.strokeRect(16, 34, 6, 6);
    ctx.strokeRect(42, 34, 6, 6);
    // one window entirely blacked out
    ctx.fillStyle = '#000';
    ctx.fillRect(16, 34, 6, 6);
  } else {
    // 'figure' — single towering silhouette with a downturned face/no features
    ctx.fillStyle = '#1a0808';
    ctx.fillRect(28, 8, 8, 48);
    ctx.beginPath();
    ctx.arc(32, 10, 6, 0, Math.PI * 2);
    ctx.fill();
    // no eyes. scribble next to it:
    ctx.strokeStyle = '#2a0a0a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(10, 50);
    ctx.lineTo(22, 42);
    ctx.moveTo(42, 42);
    ctx.lineTo(54, 50);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}
