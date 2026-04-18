/**
 * Phobos signature beat — the creature briefly inhabits the player's
 * webcam feed inside the corner HUD. Two-phase sequence engineered to
 * feel like analog video interference, not a scripted game effect:
 *
 *   PREFIRE (~1000ms)
 *     Live webcam frame is painted on an overlay canvas with escalating
 *     distortion — progressive RGB ghosting via positional+hue-shifted
 *     draws, random horizontal strip tears, scanlines, and a growing
 *     vignette. A sub-bass sawtooth drone ramps up underneath. The
 *     player sees themselves throughout, getting increasingly wrong.
 *
 *   FREEZE+SNAP (~450ms)
 *     Video is captured to an offscreen buffer (a "freeze frame") and
 *     the snap phase paints increasingly-distorted versions of that
 *     frozen image:
 *       1. Radial pixel displacement (per-pixel getImageData pass) pushes
 *          pixels outward from canvas center, warping the face.
 *       2. Three offset copies with red/green/blue tints composited in
 *          'screen' mode produce chromatic aberration.
 *       3. A one-frame 'difference' invert hits at the intensity peak.
 *       4. Heavy tearing + scanlines throughout.
 *     A sharp noise burst fires as the freeze begins.
 *
 * The illusion reads as "my webcam hiccuped for a second" — but the
 * thing they see during that second is their own face melting.
 *
 * flash() is idempotent while a sequence is active.
 */

export interface WebcamGhostOptions {
  videoElement: HTMLVideoElement;
  overlayContainer: HTMLElement;
  audioContext: AudioContext;
  audioDestination: AudioNode;
  debug?: boolean;
}

export interface GhostFlashOptions {
  /** Prefire buildup duration. Default 1000ms. */
  buildupMs?: number;
  /** Freeze/snap distortion duration. Default 450ms. */
  snapMs?: number;
  /** Fade-out duration after snap. Default 240ms. */
  fadeMs?: number;
}

const DEFAULT_BUILDUP_MS = 1000;
const DEFAULT_SNAP_MS = 450;
const DEFAULT_FADE_MS = 240;

/** CSS filter matching the CornerBox <video> so overlay content looks like the same feed. */
const VIDEO_FILTER = 'grayscale(0.5) contrast(1.3)';

export class WebcamGhost {
  private readonly overlay: HTMLCanvasElement;
  private readonly octx: CanvasRenderingContext2D;
  private readonly work: HTMLCanvasElement;
  private readonly wctx: CanvasRenderingContext2D;
  private readonly videoElement: HTMLVideoElement;
  private readonly audioContext: AudioContext;
  private readonly audioDestination: AudioNode;
  private readonly debug: boolean;

  private flashing = false;

  constructor(opts: WebcamGhostOptions) {
    this.videoElement = opts.videoElement;
    this.audioContext = opts.audioContext;
    this.audioDestination = opts.audioDestination;
    this.debug = opts.debug ?? false;

    this.overlay = document.createElement('canvas');
    Object.assign(this.overlay.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      opacity: '0',
      // Match the <video> CSS filter so overlay painting looks identical
      // to the un-intercepted feed at the seam between phases.
      filter: VIDEO_FILTER,
      transition: `opacity ${DEFAULT_FADE_MS}ms ease-out`,
    });
    opts.overlayContainer.appendChild(this.overlay);

    this.octx = this.overlay.getContext('2d')!;
    this.work = document.createElement('canvas');
    this.wctx = this.work.getContext('2d', { willReadFrequently: true })!;
  }

  async flash(opts: GhostFlashOptions = {}): Promise<void> {
    if (this.flashing) return;
    if (this.videoElement.readyState < 2) return;
    this.flashing = true;

    const buildupMs = opts.buildupMs ?? DEFAULT_BUILDUP_MS;
    const snapMs = opts.snapMs ?? DEFAULT_SNAP_MS;
    const fadeMs = opts.fadeMs ?? DEFAULT_FADE_MS;

    try {
      const rect = this.videoElement.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      if (this.overlay.width !== w) this.overlay.width = w;
      if (this.overlay.height !== h) this.overlay.height = h;
      if (this.work.width !== w) this.work.width = w;
      if (this.work.height !== h) this.work.height = h;

      // Reveal overlay instantly; first paint should visually match the
      // underlying video frame so there's no pop at the seam.
      this.overlay.style.transition = 'none';
      this.overlay.style.opacity = '1';
      void this.overlay.offsetWidth;

      const hum = this.startHum(buildupMs);

      // PREFIRE — live video with escalating analog-glitch overlays
      const tPre = performance.now();
      while (true) {
        const elapsed = performance.now() - tPre;
        if (elapsed >= buildupMs) break;
        const t = elapsed / buildupMs;
        this.paintPrefire(w, h, t);
        await nextFrame();
      }

      // Capture freeze frame into work canvas (mirrored to match video CSS).
      this.captureFreeze(w, h);

      // FREEZE + SNAP — frozen face warping
      hum.stop();
      this.playSnapBurst();

      const tSnap = performance.now();
      while (true) {
        const elapsed = performance.now() - tSnap;
        if (elapsed >= snapMs) break;
        const t = elapsed / snapMs;
        this.paintSnap(w, h, t);
        await nextFrame();
      }

      // Fade back to live feed
      this.overlay.style.transition = `opacity ${fadeMs}ms ease-out`;
      this.overlay.style.opacity = '0';
      await sleep(fadeMs + 30);
      this.octx.clearRect(0, 0, w, h);

      if (this.debug) console.log('[webcam-ghost] sequence complete');
    } finally {
      this.flashing = false;
    }
  }

  // ---------- PREFIRE ----------

  private paintPrefire(w: number, h: number, t: number): void {
    // t: 0 (start) → 1 (end of buildup)
    const ctx = this.octx;
    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // Mirror to match video CSS scaleX(-1)
    ctx.translate(w, 0);
    ctx.scale(-1, 1);

    // Base layer — live video, mild warm→cool desaturation drift.
    const baseFilter = `saturate(${1 - t * 0.45}) contrast(${1 + t * 0.15}) brightness(${1 - t * 0.12})`;
    ctx.filter = baseFilter;
    try { ctx.drawImage(this.videoElement, 0, 0, w, h); } catch { /* not ready */ }

    // Two ghost layers with positional offset + hue shift — suggests
    // chromatic aberration. Grows with t.
    const shift = t * 6;
    ctx.globalCompositeOperation = 'lighter';

    ctx.filter = `hue-rotate(${-20 + t * -40}deg) saturate(${1.4 + t * 1.2}) opacity(${t * 0.45})`;
    try { ctx.drawImage(this.videoElement, shift, 0, w, h); } catch { /* */ }

    ctx.filter = `hue-rotate(${120 + t * 80}deg) saturate(${1.4 + t * 1.2}) opacity(${t * 0.45})`;
    try { ctx.drawImage(this.videoElement, -shift, 0, w, h); } catch { /* */ }

    ctx.restore();

    // Horizontal strip tearing — probability + magnitude scale with t
    ctx.save();
    const tearProb = 0.25 + t * 0.55;
    const tearCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < tearCount; i++) {
      if (Math.random() > tearProb) continue;
      const sh = 2 + Math.floor(Math.random() * 6);
      const sy = Math.floor(Math.random() * (h - sh));
      const dx = (Math.random() - 0.5) * w * (0.05 + t * 0.12);
      try {
        const strip = this.octx.getImageData(0, sy, w, sh);
        this.octx.putImageData(strip, Math.round(dx), sy);
      } catch { /* tainted? */ }
    }
    ctx.restore();

    // Scanlines (1px dark every 2px), intensity ramps
    ctx.fillStyle = `rgba(0,0,0,${0.1 + t * 0.2})`;
    for (let y = 0; y < h; y += 2) ctx.fillRect(0, y, w, 1);

    // Growing vignette
    const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${t * 0.42})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // ---------- FREEZE CAPTURE ----------

  private captureFreeze(w: number, h: number): void {
    const wctx = this.wctx;
    wctx.save();
    wctx.filter = VIDEO_FILTER;
    wctx.translate(w, 0);
    wctx.scale(-1, 1);
    try { wctx.drawImage(this.videoElement, 0, 0, w, h); } catch { /* */ }
    wctx.restore();
  }

  // ---------- SNAP ----------

  private paintSnap(w: number, h: number, t: number): void {
    // t: 0 (freeze begins) → 1 (snap ends)
    const ctx = this.octx;
    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // Intensity curve: peaks ~60% through the snap, decays after
    const intensity = Math.sin(t * Math.PI * 0.9 + 0.1);

    // 1. Radial displacement on the frozen frame — pixels near the
    //    center are pulled outward, warping the face.
    //    Strength peaks at ~14 pixels of displacement.
    const distortPx = 3 + intensity * 11;
    this.applyRadialDistortion(w, h, distortPx);

    // 2. Chromatic aberration: draw the warped frame twice more with
    //    positional offsets and color tints via 'screen' blend.
    const rgb = 2 + intensity * 10;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.55 + intensity * 0.2;
    ctx.filter = 'hue-rotate(-30deg) saturate(3)';
    ctx.drawImage(this.overlay, Math.round(rgb), 0);
    ctx.filter = 'hue-rotate(150deg) saturate(3)';
    ctx.drawImage(this.overlay, Math.round(-rgb), 0);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // 3. One-frame invert flash near peak intensity
    if (t > 0.52 && t < 0.58) {
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }

    // 4. Heavy tearing — more frequent, wider shifts
    const tears = 3 + Math.floor(intensity * 5);
    for (let i = 0; i < tears; i++) {
      const sh = 3 + Math.floor(Math.random() * 8);
      const sy = Math.floor(Math.random() * (h - sh));
      const dx = (Math.random() - 0.5) * w * 0.25;
      try {
        const strip = this.octx.getImageData(0, sy, w, sh);
        this.octx.putImageData(strip, Math.round(dx), sy);
      } catch { /* */ }
    }

    // 5. Dense scanlines
    ctx.fillStyle = `rgba(0,0,0,${0.3 + intensity * 0.15})`;
    for (let y = 0; y < h; y += 2) ctx.fillRect(0, y, w, 1);

    // 6. A single bright horizontal tear bar sells the analog feel
    const barY = Math.floor(Math.random() * h);
    ctx.fillStyle = `rgba(255,255,255,${0.06 + intensity * 0.15})`;
    ctx.fillRect(0, barY, w, 2);

    // 7. Vignette stays heavy through snap
    const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.15, w / 2, h / 2, w * 0.8);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${0.4 + intensity * 0.2})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.restore();
  }

  /**
   * Push pixels radially outward from canvas center, sampling inward
   * from the freeze frame. Creates a "face melting outward" warp.
   * For each output pixel, compute a fractional displacement toward the
   * center and sample the freeze frame there. Falloff is quadratic with
   * distance so the effect is strongest over the center (face) and
   * fades toward the edges.
   */
  private applyRadialDistortion(w: number, h: number, strength: number): void {
    if (strength < 0.5) {
      this.octx.drawImage(this.work, 0, 0);
      return;
    }

    const srcData = this.wctx.getImageData(0, 0, w, h);
    const src = srcData.data;
    const out = this.octx.createImageData(w, h);
    const dst = out.data;

    const cx = w / 2;
    const cy = h * 0.42; // face center biased above geometric middle
    const maxR = Math.hypot(w, h) * 0.5;

    for (let y = 0; y < h; y++) {
      const dy = y - cy;
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.5) {
          const i = (y * w + x) * 4;
          const j = i;
          dst[i] = src[j];
          dst[i + 1] = src[j + 1];
          dst[i + 2] = src[j + 2];
          dst[i + 3] = 255;
          continue;
        }
        // Quadratic falloff — strongest near center, zero at edges
        const norm = Math.min(1, dist / maxR);
        const falloff = (1 - norm) * (1 - norm);
        const displace = strength * falloff;
        const scale = Math.max(0, 1 - displace / dist);
        const sx = cx + dx * scale;
        const sy = cy + dy * scale;
        const isx = sx | 0;
        const isy = sy | 0;

        const outIdx = (y * w + x) * 4;
        if (isx >= 0 && isx < w && isy >= 0 && isy < h) {
          const srcIdx = (isy * w + isx) * 4;
          dst[outIdx] = src[srcIdx];
          dst[outIdx + 1] = src[srcIdx + 1];
          dst[outIdx + 2] = src[srcIdx + 2];
          dst[outIdx + 3] = 255;
        } else {
          dst[outIdx + 3] = 0;
        }
      }
    }
    this.octx.putImageData(out, 0, 0);
  }

  // ---------- AUDIO ----------

  /** Sub-bass drone, ramps to ~0.22 gain over the buildup. */
  private startHum(buildupMs: number): { stop: () => void } {
    const ctx = this.audioContext;
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 54;

    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 56.1; // slight detune for thickness

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.22, now + (buildupMs / 1000) * 0.9);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.audioDestination);

    osc1.start();
    osc2.start();

    return {
      stop: () => {
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.12);
        osc1.stop(t + 0.14);
        osc2.stop(t + 0.14);
      },
    };
  }

  /** Sharp noise burst, ~220ms, procedural. */
  private playSnapBurst(): void {
    const ctx = this.audioContext;
    const sampleRate = ctx.sampleRate;
    const durationMs = 220;
    const samples = Math.floor((sampleRate * durationMs) / 1000);
    const buffer = ctx.createBuffer(1, samples, sampleRate);
    const data = buffer.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < samples; i++) {
      const t = i / samples;
      const white = Math.random() * 2 - 1;
      prev = prev * 0.45 + white * 0.55;
      const env = Math.pow(1 - t, 1.8) * (0.5 + Math.random() * 0.5);
      data[i] = prev * env * 0.85;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.65;
    src.connect(gain).connect(this.audioDestination);
    src.start();
  }

  dispose(): void {
    if (this.overlay.parentElement) {
      this.overlay.parentElement.removeChild(this.overlay);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
