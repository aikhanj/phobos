import * as THREE from 'three';
import type { GameScene } from '@phobos/types';
import { SCENE_CONFIGS } from '../sceneConfig';

export class Attic implements GameScene {
  readonly name = 'attic';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(0, 1.6, 0);

  load(): void {
    const cfg = SCENE_CONFIGS.attic;
    const { width: w, height: h, depth: d } = cfg.dimensions;
    const hw = w / 2;
    const hd = d / 2;

    const wallMat = new THREE.MeshLambertMaterial({ color: 0x1a1a15, flatShading: true });
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x1e1810, flatShading: true });

    // Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.group.add(floor);

    // Ceiling
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), wallMat.clone());
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = h;
    this.group.add(ceil);

    // Walls
    const walls: [THREE.Vector3, THREE.Euler, number, number][] = [
      [new THREE.Vector3(0, h / 2, -hd), new THREE.Euler(0, 0, 0), w, h],
      [new THREE.Vector3(0, h / 2, hd), new THREE.Euler(0, Math.PI, 0), w, h],
      [new THREE.Vector3(-hw, h / 2, 0), new THREE.Euler(0, Math.PI / 2, 0), d, h],
      [new THREE.Vector3(hw, h / 2, 0), new THREE.Euler(0, -Math.PI / 2, 0), d, h],
    ];

    for (const [pos, rot, ww, wh] of walls) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), wallMat.clone());
      mesh.position.copy(pos);
      mesh.rotation.copy(rot);
      this.group.add(mesh);
    }

    // Very dim light
    const light = new THREE.PointLight(0x998866, 0.1, 8, 2);
    light.position.set(0, h - 0.2, 0);
    this.group.add(light);

    const ambient = new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity);
    this.group.add(ambient);
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

  update(_dt: number): void {
    // Phase 3: creaks, flicker, peripheral figures
  }
}
