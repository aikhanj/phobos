import type { Vec3 } from './types';

export interface SpatialChain {
  input: AudioNode;
  output: AudioNode;
  setPosition?: (p: Vec3) => void;
}

/**
 * Creates a chain: Gain → [PannerNode] → output. If position is provided, the
 * PannerNode is configured for HRTF 3D audio; otherwise it's a mono passthrough.
 */
export function createSpatialNode(
  ctx: AudioContext,
  position: Vec3 | undefined,
  gainValue: number = 1,
): SpatialChain {
  const gain = ctx.createGain();
  gain.gain.value = gainValue;

  if (!position) {
    return { input: gain, output: gain };
  }

  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 1;
  panner.maxDistance = 30;
  panner.rolloffFactor = 1;
  panner.coneInnerAngle = 360;
  panner.coneOuterAngle = 0;
  panner.coneOuterGain = 0;

  setPannerPosition(panner, position);
  gain.connect(panner);

  return {
    input: gain,
    output: panner,
    setPosition: (p: Vec3) => setPannerPosition(panner, p),
  };
}

function setPannerPosition(panner: PannerNode, p: Vec3): void {
  if (panner.positionX) {
    panner.positionX.value = p.x;
    panner.positionY.value = p.y;
    panner.positionZ.value = p.z;
  } else {
    // Fallback for older browsers that only expose setPosition()
    (panner as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(p.x, p.y, p.z);
  }
}

export function updateListener(
  ctx: AudioContext,
  position: Vec3,
  forward: Vec3,
  up: Vec3,
): void {
  const l = ctx.listener;
  if (l.positionX) {
    l.positionX.value = position.x;
    l.positionY.value = position.y;
    l.positionZ.value = position.z;
    l.forwardX.value = forward.x;
    l.forwardY.value = forward.y;
    l.forwardZ.value = forward.z;
    l.upX.value = up.x;
    l.upY.value = up.y;
    l.upZ.value = up.z;
  } else {
    const legacy = l as unknown as {
      setPosition(x: number, y: number, z: number): void;
      setOrientation(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void;
    };
    legacy.setPosition(position.x, position.y, position.z);
    legacy.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
  }
}
