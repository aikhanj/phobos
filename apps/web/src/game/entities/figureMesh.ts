import * as THREE from 'three';

/**
 * Builds an unnervingly tall, distorted silhouette for Phobos. Not human
 * proportions — too tall, too thin, wrong. Arms that hang too low. A head
 * that tilts. The PS1 flat-shading makes it read as a corrupted model,
 * something the game engine wasn't meant to render.
 *
 * Total height: ~2.8m (towering over the 1.6m player camera).
 * The group faces +Z at rest; billboardToCamera() rotates it on Y each frame.
 */
export function createFigureMesh(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'phobos_figure';

  const baseMat = new THREE.MeshLambertMaterial({
    color: 0x0e0e12,
    flatShading: true,
    transparent: true,
    opacity: 0,
    fog: false,
  });

  // Torso — tall, narrow, wrong proportions. Too thin for its height.
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1.8, 0.25),
    baseMat,
  );
  torso.position.y = 1.2;
  group.add(torso);

  // Head — slightly too small for the body. Tilted.
  const headMat = baseMat.clone();
  headMat.color.setHex(0x121218);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.3, 0.24),
    headMat,
  );
  head.position.set(0.04, 2.25, 0);
  head.rotation.z = 0.15; // slight tilt — uncanny
  group.add(head);

  // Shroud / drape — wider than the body, hangs from shoulders.
  // Reads as an academic robe draped over Dean Eisgruber.
  const shroudMat = baseMat.clone();
  shroudMat.color.setHex(0x080810);
  const shroud = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 1.4, 0.15),
    shroudMat,
  );
  shroud.position.set(0, 1.6, -0.06);
  group.add(shroud);

  // ORANGE STOLE — Princeton doctoral hood. This is the signature read
  // that makes the figure unmistakably "Dean Eisgruber" — two vertical
  // strips of Princeton orange running down the front of the black robe.
  const stoleMat = new THREE.MeshLambertMaterial({
    color: 0xe77500, // Princeton orange
    flatShading: true,
    transparent: true,
    opacity: 0,
    fog: false,
  });
  const leftStole = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1.25, 0.03),
    stoleMat,
  );
  leftStole.position.set(-0.12, 1.65, 0.09);
  group.add(leftStole);
  const rightStole = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1.25, 0.03),
    stoleMat.clone(),
  );
  rightStole.position.set(0.12, 1.65, 0.09);
  group.add(rightStole);

  // Left arm — hangs too low, past where a human arm would stop.
  const armMat = baseMat.clone();
  armMat.color.setHex(0x0a0a10);
  const leftArm = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 1.1, 0.12),
    armMat,
  );
  leftArm.position.set(-0.35, 0.75, 0);
  leftArm.rotation.z = 0.08;
  group.add(leftArm);

  // Right arm — slightly different length (asymmetry = wrong)
  const rightArm = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 1.25, 0.12),
    armMat.clone(),
  );
  rightArm.position.set(0.35, 0.65, 0);
  rightArm.rotation.z = -0.05;
  group.add(rightArm);

  // Legs — visible beneath the shroud. Slightly splayed.
  const legMat = baseMat.clone();
  const leftLeg = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.7, 0.14),
    legMat,
  );
  leftLeg.position.set(-0.12, 0.18, 0);
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.7, 0.14),
    legMat.clone(),
  );
  rightLeg.position.set(0.12, 0.18, 0);
  group.add(rightLeg);

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
