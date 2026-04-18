import * as THREE from 'three';
import type { GameScene } from '@phobos/types';
import { SCENE_CONFIGS } from '../sceneConfig';

function createWall(
  width: number,
  height: number,
  position: THREE.Vector3,
  rotation: THREE.Euler,
  color: number,
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(width, height);
  const mat = new THREE.MeshLambertMaterial({
    color,
    flatShading: true,
    side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(position);
  mesh.rotation.copy(rotation);
  return mesh;
}

function createProp(
  w: number,
  h: number,
  d: number,
  position: THREE.Vector3,
  color: number,
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(position);
  return mesh;
}

export class Basement implements GameScene {
  readonly name = 'basement';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(0, 1.6, 0);

  private light: THREE.PointLight | null = null;
  private flickerTimer = 0;

  load(): void {
    const cfg = SCENE_CONFIGS.basement;
    const { width: w, height: h, depth: d } = cfg.dimensions;
    const hw = w / 2;
    const hd = d / 2;

    // Floor
    this.group.add(
      createWall(w, d, new THREE.Vector3(0, 0, 0), new THREE.Euler(-Math.PI / 2, 0, 0), 0x1a1a1a),
    );

    // Ceiling
    this.group.add(
      createWall(w, d, new THREE.Vector3(0, h, 0), new THREE.Euler(Math.PI / 2, 0, 0), 0x111111),
    );

    // Back wall (-Z)
    this.group.add(
      createWall(w, h, new THREE.Vector3(0, h / 2, -hd), new THREE.Euler(0, 0, 0), 0x2a2a2a),
    );

    // Front wall (+Z)
    this.group.add(
      createWall(w, h, new THREE.Vector3(0, h / 2, hd), new THREE.Euler(0, Math.PI, 0), 0x2a2a2a),
    );

    // Left wall (-X)
    this.group.add(
      createWall(d, h, new THREE.Vector3(-hw, h / 2, 0), new THREE.Euler(0, Math.PI / 2, 0), 0x252525),
    );

    // Right wall (+X)
    this.group.add(
      createWall(d, h, new THREE.Vector3(hw, h / 2, 0), new THREE.Euler(0, -Math.PI / 2, 0), 0x252525),
    );

    // Dim overhead light — single bare bulb feel
    this.light = new THREE.PointLight(0xffaa44, 0.3, 10, 2);
    this.light.position.set(0, h - 0.3, 0);
    this.group.add(this.light);

    // Faint ambient so geometry isn't pure black
    const ambient = new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity);
    this.group.add(ambient);

    // Props — crude furniture stand-ins
    // Shelving unit against back wall
    this.group.add(createProp(2, 1.8, 0.4, new THREE.Vector3(-2, 0.9, -hd + 0.3), 0x1e1410));

    // Crate near right wall
    this.group.add(createProp(0.6, 0.6, 0.6, new THREE.Vector3(hw - 1, 0.3, 1.5), 0x2a1f14));

    // Table center-left
    this.group.add(createProp(1.2, 0.05, 0.7, new THREE.Vector3(-1.5, 0.75, 1), 0x1a1510));
    // Table legs
    for (const [x, z] of [[-2.05, 0.65], [-2.05, 1.35], [-0.95, 0.65], [-0.95, 1.35]] as const) {
      this.group.add(createProp(0.05, 0.75, 0.05, new THREE.Vector3(x, 0.375, z), 0x1a1510));
    }
  }

  unload(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (obj.material instanceof THREE.Material) {
          obj.material.dispose();
        }
      }
    });
    this.group.clear();
    this.light = null;
  }

  update(dt: number): void {
    // Subtle light flicker for dread
    if (this.light) {
      this.flickerTimer += dt;
      const flicker = 0.3 + Math.sin(this.flickerTimer * 3.7) * 0.03
        + Math.sin(this.flickerTimer * 11.3) * 0.02
        + (Math.random() < 0.02 ? -0.1 : 0);
      this.light.intensity = Math.max(0.05, flicker);
    }
  }
}
