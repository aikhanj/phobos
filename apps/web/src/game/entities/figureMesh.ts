import * as THREE from 'three';

/**
 * Builds a tall dark silhouette for Phobos. Three.js PS1 aesthetic: flat-shaded
 * Lambert on a crude body+head stack so the figure reads as humanoid at a glance
 * but stays cheap to render and lets fog eat the edges.
 *
 * The group faces +Z at rest; billboardToCamera() rotates it on Y each frame so
 * the silhouette stays flat-on regardless of approach angle.
 */
export function createFigureMesh(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'phobos_figure';

  // Body — narrow vertical slab, slight taper via scale.
  const bodyGeo = new THREE.BoxGeometry(0.45, 1.3, 0.28);
  const bodyMat = new THREE.MeshLambertMaterial({
    color: 0x0a0a0c,
    flatShading: true,
    transparent: true,
    opacity: 0,
    fog: true,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.7;
  body.scale.set(1, 1, 1);
  group.add(body);

  // Head — small cube atop body.
  const headGeo = new THREE.BoxGeometry(0.26, 0.28, 0.26);
  const headMat = bodyMat.clone();
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.5;
  group.add(head);

  // Hair / shroud — slightly wider flat plane behind the head so the silhouette
  // reads as elderly-with-shawl from any angle.
  const shawlGeo = new THREE.BoxGeometry(0.55, 0.7, 0.12);
  const shawlMat = bodyMat.clone();
  shawlMat.color.setHex(0x050506);
  const shawl = new THREE.Mesh(shawlGeo, shawlMat);
  shawl.position.set(0, 1.15, -0.08);
  group.add(shawl);

  group.visible = false;
  return group;
}

/** Smoothly set the whole figure's opacity across all child materials. */
export function setFigureOpacity(group: THREE.Group, opacity: number): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const m = obj.material;
      if (m instanceof THREE.MeshLambertMaterial) {
        m.opacity = opacity;
        m.transparent = opacity < 1;
      }
    }
  });
}

/** Rotate the group on Y so it faces the camera (billboard). Pitch locked. */
export function billboardToCamera(group: THREE.Group, camera: THREE.Camera): void {
  const dx = camera.position.x - group.position.x;
  const dz = camera.position.z - group.position.z;
  group.rotation.y = Math.atan2(dx, dz);
}

/** Dispose all geometries + materials the figure owns. Safe to call once on unload. */
export function disposeFigure(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const m = obj.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m.dispose();
    }
  });
}
