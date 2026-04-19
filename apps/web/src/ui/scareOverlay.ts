/**
 * Full-screen scare overlay — the undeniable visual horror layer.
 *
 * Prior visual events (flicker, webcam_glitch) were subtle by design:
 * the scene lights dim, the corner-box webcam feed distorts. Players
 * reported they didn't see anything "scary" happening. This class is
 * the opposite — it covers the whole viewport, unambiguously. Used for:
 *
 *   - Peak jumpscares: red flash + giant PHOBOS letters + static
 *   - Mirror breaks: white flash + ghost face distortion
 *   - Anti-silence: red corners bleed inward
 *   - Endgame: blood-drip trails from top of screen
 *
 * Every effect self-dismisses after its duration. Stacks cleanly — you
 * can fire redFlash + giantText + ghostFace at the same time.
 *
 * All z-indexes sit above the FadeOverlay (30) but below the reveal
 * overlay (40) and note overlay (50).
 */
export class ScareOverlay {
  private root: HTMLDivElement;

  constructor() {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '33',
      pointerEvents: 'none',
      overflow: 'hidden',
    });
    document.body.appendChild(this.root);
    ensureKeyframes();
  }

  /** Fullscreen red flash — exponential fade. Use on peak jumpscares. */
  redFlash(durationMs = 600, intensity = 0.9): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      background: '#b00000',
      opacity: String(intensity),
      mixBlendMode: 'screen',
      animation: `phobosRedFlash ${durationMs}ms ease-out forwards`,
    });
    this.root.appendChild(el);
    setTimeout(() => el.remove(), durationMs + 50);
  }

  /** Fullscreen white flash — sharp, camera-blast feel. Use for mirror breaks. */
  whiteFlash(durationMs = 250): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      background: '#ffffff',
      opacity: '1',
      animation: `phobosWhiteFlash ${durationMs}ms ease-out forwards`,
    });
    this.root.appendChild(el);
    setTimeout(() => el.remove(), durationMs + 50);
  }

  /**
   * TV-static burst — animated noise frames over a black background.
   * Used on jumpscare static_burst. Noise is generated with CSS gradients
   * seeded with random offsets so we don't need a canvas renderer.
   */
  staticBurst(durationMs = 450): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      background: '#000',
      opacity: '1',
      mixBlendMode: 'normal',
    });
    // Noise texture via layered gradients — each layer shifts every frame.
    const noise = document.createElement('div');
    Object.assign(noise.style, {
      position: 'absolute',
      inset: '0',
      backgroundImage: `
        repeating-linear-gradient(0deg, rgba(255,255,255,0.15) 0 1px, transparent 1px 3px),
        repeating-linear-gradient(90deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 2px)
      `,
      mixBlendMode: 'screen',
    });
    el.appendChild(noise);
    // Random horizontal bars simulate tracking errors
    for (let i = 0; i < 8; i++) {
      const bar = document.createElement('div');
      const topPct = Math.random() * 100;
      const heightPx = 2 + Math.random() * 10;
      Object.assign(bar.style, {
        position: 'absolute',
        left: '0',
        right: '0',
        top: `${topPct}%`,
        height: `${heightPx}px`,
        background: `rgba(255,255,255,${0.5 + Math.random() * 0.5})`,
        mixBlendMode: 'screen',
      });
      el.appendChild(bar);
    }
    this.root.appendChild(el);
    // Quick fade-out
    setTimeout(() => {
      el.style.transition = 'opacity 100ms linear';
      el.style.opacity = '0';
    }, durationMs - 100);
    setTimeout(() => el.remove(), durationMs + 50);
  }

  /**
   * Giant PHOBOS-style text — huge letters filling the screen, red on
   * black, vibrating. The single most immediate "yes this is horror" cue.
   */
  giantText(text = 'PHOBOS', durationMs = 900, color = '#ff2222'): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)',
      animation: `phobosGiantFade ${durationMs}ms ease-out forwards`,
    });
    const span = document.createElement('div');
    span.textContent = text;
    Object.assign(span.style, {
      fontFamily: "'Courier New', monospace",
      fontSize: 'clamp(4rem, 14vw, 10rem)',
      fontWeight: '900',
      color,
      letterSpacing: '0.2em',
      textShadow: `0 0 24px ${color}, 0 0 60px ${color}`,
      animation: 'phobosJitter 80ms steps(2) infinite',
    });
    el.appendChild(span);
    this.root.appendChild(el);
    setTimeout(() => el.remove(), durationMs + 50);
  }

  /**
   * Ghost face — a dark distorted humanoid silhouette centered on screen
   * that flashes into view and dissolves. Pure CSS (radial gradients)
   * so we don't need image assets.
   */
  ghostFace(durationMs = 700): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0,0,0,0.35)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      animation: `phobosGhostPulse ${durationMs}ms ease-out forwards`,
    });
    // Face shape: oval head, two eyeholes, a mouth hole — radial gradients
    // stacked. Looks like a pale mask pushing through darkness.
    const face = document.createElement('div');
    Object.assign(face.style, {
      width: 'clamp(180px, 32vw, 380px)',
      height: 'clamp(240px, 42vw, 480px)',
      borderRadius: '52% 52% 48% 48% / 62% 62% 38% 38%',
      background: `
        radial-gradient(ellipse 10% 14% at 35% 42%, #000 0%, #000 55%, transparent 65%),
        radial-gradient(ellipse 10% 14% at 65% 42%, #000 0%, #000 55%, transparent 65%),
        radial-gradient(ellipse 14% 8% at 50% 72%, #000 0%, #000 55%, transparent 68%),
        radial-gradient(ellipse 60% 70% at 50% 50%, #cfc8b8 0%, #8a7f6d 35%, #2a2418 72%, #0a0806 100%)
      `,
      boxShadow: '0 0 80px rgba(0,0,0,0.95), inset 0 0 40px rgba(0,0,0,0.6)',
      filter: 'contrast(1.2)',
    });
    el.appendChild(face);
    this.root.appendChild(el);
    setTimeout(() => el.remove(), durationMs + 50);
  }

  /**
   * Blood-drip streaks from the top edge of the screen. Purely decorative,
   * added on peak stacks + reveal sequence. Streaks linger longer than
   * other effects to read as "this is getting worse."
   */
  bloodDrip(durationMs = 2200, streakCount = 12): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
    });
    for (let i = 0; i < streakCount; i++) {
      const streak = document.createElement('div');
      const leftPct = (i / streakCount) * 100 + Math.random() * 4;
      const widthPx = 3 + Math.random() * 6;
      const heightVh = 20 + Math.random() * 60;
      const delayMs = Math.random() * 400;
      Object.assign(streak.style, {
        position: 'absolute',
        top: '0',
        left: `${leftPct}%`,
        width: `${widthPx}px`,
        height: `${heightVh}vh`,
        background: 'linear-gradient(180deg, #660000 0%, #8a0000 30%, rgba(100,0,0,0) 100%)',
        opacity: '0',
        animation: `phobosBloodDrop ${durationMs}ms ease-in ${delayMs}ms forwards`,
      });
      el.appendChild(streak);
    }
    this.root.appendChild(el);
    setTimeout(() => el.remove(), durationMs + 500);
  }

  /**
   * Convenience: the "peak jumpscare" combo. Red flash + giant PHOBOS +
   * static burst. Fired at club 55s peaks when the scare profiler picks
   * a category. Takes about 1 second total — loud, unmissable, adaptive.
   */
  peakCombo(label = 'PHOBOS'): void {
    this.redFlash(600, 0.85);
    this.staticBurst(380);
    setTimeout(() => this.giantText(label, 850), 120);
  }

  /**
   * THE scary-face jumpscare — a huge pale distorted face fills the
   * screen for ~1.2 seconds. Pure CSS: face shape + eye holes + gaping
   * mouth via stacked radial gradients. Shakes on a jitter keyframe.
   * Paired with a synthesized scream SFX at the call site (main.ts
   * wires scareOverlay.screamFace() to fire audio+visual together).
   *
   * Larger, wider, and WAY more aggressive than the regular ghostFace().
   * Reserved for true peaks — club mid-commit, campus peak, reveal.
   */
  screamFace(durationMs = 1200): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      background: 'radial-gradient(ellipse at center, rgba(80,0,0,0.7) 0%, rgba(0,0,0,0.95) 70%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      animation: `phobosScreamPulse ${durationMs}ms ease-out forwards`,
    });
    // Big face: 85% of viewport height, pale mask with gaping mouth +
    // hollow eyes. Filter chain (contrast + brightness) pushes it into
    // "uncanny corpse" territory. Shake animation keeps it tense.
    const face = document.createElement('div');
    Object.assign(face.style, {
      width: '70vmin',
      height: '90vmin',
      borderRadius: '48% 48% 44% 44% / 58% 58% 42% 42%',
      background: `
        radial-gradient(ellipse 12% 18% at 33% 38%, #000 0%, #000 62%, rgba(0,0,0,0.5) 72%, transparent 80%),
        radial-gradient(ellipse 12% 18% at 67% 38%, #000 0%, #000 62%, rgba(0,0,0,0.5) 72%, transparent 80%),
        radial-gradient(ellipse 22% 18% at 50% 73%, #1a0000 0%, #000 40%, #000 70%, transparent 82%),
        radial-gradient(ellipse 3% 4% at 50% 58%, #000 0%, transparent 75%),
        radial-gradient(ellipse 58% 72% at 50% 50%, #f0e6d0 0%, #c8bca0 25%, #6a5a42 60%, #1a1208 92%)
      `,
      boxShadow: '0 0 120px rgba(150,0,0,0.7), inset 0 0 80px rgba(0,0,0,0.75)',
      filter: 'contrast(1.35) brightness(1.05) saturate(0.7)',
      animation: 'phobosFaceShake 60ms steps(2) infinite, phobosFaceZoom 1200ms ease-out forwards',
      transformOrigin: 'center',
    });
    el.appendChild(face);

    // Red inner border — makes the whole viewport feel like it's bleeding in.
    const redFringe = document.createElement('div');
    Object.assign(redFringe.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      boxShadow: 'inset 0 0 120px 40px rgba(180,0,0,0.55)',
    });
    el.appendChild(redFringe);

    this.root.appendChild(el);
    setTimeout(() => el.remove(), durationMs + 80);
  }

  // ── NEW: SUBLIMINAL FLASH (The Grudge / Paranormal Activity) ─────
  /**
   * 1-frame (~80ms) face flash — too brief to consciously register but
   * visible enough to unsettle. Fires during quiet moments. Used for
   * the "did I see something?" effect. Reference: Hereditary, The Ring.
   */
  subliminalFace(durationMs = 80, variant: 'eisgruber' | 'eyes' | 'shriek' = 'shriek'): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0,0,0,0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: '1',
    });
    const face = document.createElement('div');
    const variants: Record<string, string> = {
      eisgruber: `
        radial-gradient(ellipse 12% 20% at 33% 42%, #000 0%, #000 65%, transparent 75%),
        radial-gradient(ellipse 12% 20% at 67% 42%, #000 0%, #000 65%, transparent 75%),
        radial-gradient(ellipse 24% 14% at 50% 78%, #400 0%, #000 60%, transparent 80%),
        radial-gradient(ellipse 60% 75% at 50% 50%, #dcd0b8 0%, #8a7a62 40%, #1a1008 85%)`,
      eyes: `
        radial-gradient(ellipse 14% 10% at 35% 48%, #ff1010 0%, #800 40%, #000 75%),
        radial-gradient(ellipse 14% 10% at 65% 48%, #ff1010 0%, #800 40%, #000 75%),
        radial-gradient(ellipse 80% 80% at 50% 50%, #080404 0%, #000 100%)`,
      shriek: `
        radial-gradient(ellipse 8% 18% at 35% 38%, #fff 0%, #000 70%),
        radial-gradient(ellipse 8% 18% at 65% 38%, #fff 0%, #000 70%),
        radial-gradient(ellipse 30% 28% at 50% 72%, #200 0%, #000 85%),
        radial-gradient(ellipse 60% 75% at 50% 50%, #e0c8a8 0%, #7a5a3a 40%, #0a0504 92%)`,
    };
    Object.assign(face.style, {
      width: '60vmin',
      height: '78vmin',
      borderRadius: '48% 48% 44% 44% / 58% 58% 42% 42%',
      background: variants[variant],
      filter: 'contrast(1.6) brightness(1.1)',
      transform: 'scale(1.05)',
    });
    el.appendChild(face);
    this.root.appendChild(el);
    setTimeout(() => el.remove(), durationMs);
  }

  // ── NEW: CRAWLING FIGURE (The Ring / The Grudge) ────────────────
  /**
   * A crawling-woman silhouette emerges from the bottom of the screen,
   * crawls upward toward the camera, and fades. Iconic Ring/Grudge beat.
   * Two thin black forms suggesting arms + head, distorted.
   */
  crawlingFigure(durationMs = 2600): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      background: 'radial-gradient(ellipse at bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)',
    });
    const figure = document.createElement('div');
    Object.assign(figure.style, {
      position: 'absolute',
      left: '50%',
      bottom: '-40vh',
      width: '32vh',
      height: '55vh',
      transform: 'translateX(-50%)',
      background: `
        radial-gradient(ellipse 30% 14% at 50% 12%, #000 0%, #000 60%, transparent 75%),
        radial-gradient(ellipse 12% 5% at 30% 22%, #000 0%, transparent 70%),
        radial-gradient(ellipse 12% 5% at 70% 22%, #000 0%, transparent 70%),
        radial-gradient(ellipse 50% 80% at 50% 70%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 50%, transparent 85%)
      `,
      filter: 'blur(1px) contrast(1.4)',
      animation: `phobosCrawl ${durationMs}ms ease-out forwards`,
    });
    el.appendChild(figure);
    this.root.appendChild(el);
    setTimeout(() => el.remove(), durationMs + 100);
  }

  // ── NEW: MANY EYES IN DARK (Coraline / Pan's Labyrinth) ─────────
  /**
   * Multiple pairs of glowing red eyes appear in the black borders of
   * the screen. Each pair blinks independently. Used when "he's many."
   */
  manyEyes(durationMs = 2500, pairCount = 10): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.92) 70%)',
    });
    for (let i = 0; i < pairCount; i++) {
      const pair = document.createElement('div');
      const leftPct = Math.random() * 85 + 5;
      const topPct = Math.random() * 85 + 5;
      // Avoid center — eyes hug the dark edges.
      const centerDx = leftPct - 50, centerDy = topPct - 50;
      if (Math.abs(centerDx) < 18 && Math.abs(centerDy) < 18) continue;
      Object.assign(pair.style, {
        position: 'absolute',
        left: `${leftPct}%`,
        top: `${topPct}%`,
        display: 'flex',
        gap: '8px',
        opacity: '0',
        animation: `phobosEyeBlink ${1000 + Math.random() * 1500}ms ease-in-out ${Math.random() * 1200}ms infinite`,
      });
      for (let j = 0; j < 2; j++) {
        const eye = document.createElement('div');
        Object.assign(eye.style, {
          width: `${4 + Math.random() * 4}px`,
          height: `${3 + Math.random() * 3}px`,
          background: 'radial-gradient(ellipse, #ff1a1a 0%, #600 70%, transparent 100%)',
          borderRadius: '50%',
          boxShadow: '0 0 6px rgba(255,30,30,0.7)',
        });
        pair.appendChild(eye);
      }
      el.appendChild(pair);
    }
    this.root.appendChild(el);
    // Fade out at end.
    setTimeout(() => {
      el.style.transition = 'opacity 700ms ease';
      el.style.opacity = '0';
    }, durationMs - 700);
    setTimeout(() => el.remove(), durationMs + 100);
  }

  // ── NEW: WRONG REFLECTION (Poltergeist / Oculus) ────────────────
  /**
   * Fullscreen vertically-mirrored webcam-snapshot effect: a face
   * appears that "should" be the player but isn't. Implemented as
   * a quick screen-wipe with a pale silhouette. Fires when Eisgruber
   * "watches through the camera."
   */
  wrongReflection(durationMs = 1500): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.95) 75%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      animation: `phobosReflectionPulse ${durationMs}ms ease-out forwards`,
    });
    // A smiling face — but the smile is the player's answer to "what
    // are you most afraid of." Very uncanny.
    const face = document.createElement('div');
    Object.assign(face.style, {
      width: '48vmin',
      height: '62vmin',
      borderRadius: '48% 48% 44% 44% / 58% 58% 42% 42%',
      background: `
        radial-gradient(ellipse 10% 18% at 33% 38%, #000 0%, #000 60%, transparent 78%),
        radial-gradient(ellipse 10% 18% at 67% 38%, #000 0%, #000 60%, transparent 78%),
        radial-gradient(ellipse 32% 10% at 50% 72%, #1a0000 0%, #000 60%, transparent 82%),
        radial-gradient(ellipse 60% 75% at 50% 50%, #d8d0c0 0%, #9a8a78 35%, #3a2a1a 85%)
      `,
      filter: 'contrast(1.3) brightness(0.95)',
      transform: 'scaleX(-1)',
    });
    el.appendChild(face);
    // "MIRROR" emissive corner tag.
    const tag = document.createElement('div');
    tag.textContent = 'REFLECTION · 4722 · MIRROR INVERT';
    Object.assign(tag.style, {
      position: 'absolute',
      bottom: '4vh',
      right: '4vw',
      fontFamily: "'Courier New', monospace",
      fontSize: '12px',
      color: '#c09030',
      letterSpacing: '0.25em',
      opacity: '0.75',
    });
    el.appendChild(tag);
    this.root.appendChild(el);
    setTimeout(() => el.remove(), durationMs + 80);
  }

  // ── NEW: TIGER FACE (Princeton easter egg) ──────────────────────
  /**
   * Princeton Tiger with human eyes — the Blair Arch tiger statue come
   * alive. Orange + black stripes, human blue eyes where the tiger's
   * should be. Lore-specific horror beat.
   */
  tigerFace(durationMs = 1400): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      background: 'radial-gradient(ellipse at center, rgba(40,12,0,0.6) 0%, rgba(0,0,0,0.92) 70%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      animation: `phobosScreamPulse ${durationMs}ms ease-out forwards`,
    });
    const face = document.createElement('div');
    Object.assign(face.style, {
      width: '62vmin',
      height: '58vmin',
      borderRadius: '48% 48% 52% 52% / 54% 54% 46% 46%',
      background: `
        radial-gradient(ellipse 8% 12% at 34% 38%, #40a0ff 0%, #204080 60%, #000 90%),
        radial-gradient(ellipse 8% 12% at 66% 38%, #40a0ff 0%, #204080 60%, #000 90%),
        radial-gradient(ellipse 18% 10% at 50% 72%, #300 0%, #000 70%, transparent 90%),
        repeating-linear-gradient(12deg, #e77500 0 10px, #1a0d00 10px 18px),
        radial-gradient(ellipse 65% 60% at 50% 50%, #e77500 0%, #a04800 45%, #2a1000 88%)
      `,
      filter: 'contrast(1.3) saturate(1.2)',
      animation: 'phobosFaceShake 70ms steps(2) infinite, phobosFaceZoom 1400ms ease-out forwards',
    });
    el.appendChild(face);
    this.root.appendChild(el);
    setTimeout(() => el.remove(), durationMs + 80);
  }

  // ── NEW: BLOOD WRITING (The Shining REDRUM) ─────────────────────
  /**
   * Full-viewport wet-blood text. Text streaks downward slightly —
   * the letters bleed. Used for "SEAT 7", "4722", player's name.
   */
  bloodWriting(text: string, durationMs = 2800, fontSize = '12vw'): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.85) 80%)',
    });
    const t = document.createElement('div');
    t.textContent = text;
    Object.assign(t.style, {
      fontFamily: "'Courier New', monospace",
      fontSize,
      fontWeight: '900',
      color: '#a00000',
      letterSpacing: '0.15em',
      textShadow: '0 0 4px #400, 0 4px 10px #600, 0 8px 24px #400, 0 2px 2px #200',
      filter: 'drop-shadow(0 8px 4px rgba(120,0,0,0.7))',
      transform: 'scale(0.85)',
      opacity: '0',
      animation: `phobosBloodWrite ${durationMs}ms ease-out forwards`,
    });
    el.appendChild(t);
    this.root.appendChild(el);
    setTimeout(() => el.remove(), durationMs + 200);
  }

  // ── NEW: SHAKY CAM + CHROMATIC ABERRATION (horror movies) ───────
  /**
   * Apply a continuous chromatic aberration + subtle shake to the whole
   * viewport for `durationMs`. Mirrors cinematic "your brain is failing"
   * moments. Intensity 0..1 drives how extreme the RGB split is.
   */
  chromaticShake(durationMs = 3000, intensity = 0.8): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      mixBlendMode: 'screen',
      background: `
        linear-gradient(90deg, rgba(255,0,0,${intensity * 0.25}) 0%, transparent 1%, transparent 99%, rgba(0,255,255,${intensity * 0.25}) 100%)
      `,
      animation: `phobosChromaShake ${Math.max(60, 180 - intensity * 120)}ms steps(2) infinite`,
    });
    this.root.appendChild(el);
    setTimeout(() => el.remove(), durationMs);
  }

  // ── NEW: TWINS (The Shining homage) ─────────────────────────────
  /**
   * Two identical pale girlfigures standing side by side centered on
   * screen. The Shining's twin girls recast as Princeton bicker twins.
   */
  twinsFace(durationMs = 2200): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4vmin',
      background: 'radial-gradient(ellipse at center, rgba(40,40,60,0.6) 0%, rgba(0,0,0,0.95) 75%)',
      animation: `phobosScreamPulse ${durationMs}ms ease-out forwards`,
    });
    for (let i = 0; i < 2; i++) {
      const fig = document.createElement('div');
      Object.assign(fig.style, {
        width: '22vmin',
        height: '55vmin',
        background: `
          radial-gradient(ellipse 70% 28% at 50% 12%, #d8d0c8 0%, #6a6a5a 60%, #1a1814 85%),
          radial-gradient(ellipse 45% 68% at 50% 62%, #402040 0%, #1a0818 60%, #000 90%)
        `,
        borderRadius: '50% 50% 20% 20% / 32% 32% 18% 18%',
        filter: 'contrast(1.25) saturate(0.7)',
        animation: 'phobosFaceShake 180ms steps(2) infinite',
      });
      el.appendChild(fig);
    }
    this.root.appendChild(el);
    setTimeout(() => el.remove(), durationMs + 80);
  }

  // ── NEW: MIRROR CRACK (Oculus / Candyman) ───────────────────────
  /**
   * Overlay simulating broken glass — jagged dark lines radiating from
   * a center point across the viewport. Pairs well with whiteFlash.
   */
  mirrorCrack(durationMs = 1600): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
    });
    // Seed the crack at a random point near center.
    const cx = 45 + Math.random() * 10;
    const cy = 40 + Math.random() * 20;
    // Draw 8 random cracks via rotated thin bars.
    for (let i = 0; i < 8; i++) {
      const bar = document.createElement('div');
      const angle = i * 45 + Math.random() * 28 - 14;
      Object.assign(bar.style, {
        position: 'absolute',
        left: `${cx}%`,
        top: `${cy}%`,
        width: '180vmax',
        height: '2px',
        background: 'linear-gradient(90deg, rgba(255,255,255,0.95) 0%, rgba(40,40,40,0.8) 8%, transparent 18%)',
        transformOrigin: '0 50%',
        transform: `rotate(${angle}deg)`,
        boxShadow: '0 0 8px rgba(0,0,0,0.8), 0 0 2px rgba(255,255,255,0.6)',
        opacity: '0',
        animation: `phobosCrackAppear ${durationMs}ms ease-out forwards`,
      });
      el.appendChild(bar);
    }
    this.root.appendChild(el);
    setTimeout(() => el.remove(), durationMs + 120);
  }

  dispose(): void {
    this.root.remove();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Keyframes — injected once on first construction. Animations share one stylesheet.
// ─────────────────────────────────────────────────────────────────────────────

let keyframesInjected = false;
function ensureKeyframes(): void {
  if (keyframesInjected) return;
  keyframesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes phobosRedFlash {
      0%   { opacity: 1; }
      25%  { opacity: 0.75; }
      100% { opacity: 0; }
    }
    @keyframes phobosWhiteFlash {
      0%   { opacity: 1; }
      60%  { opacity: 0.4; }
      100% { opacity: 0; }
    }
    @keyframes phobosGiantFade {
      0%   { opacity: 0; transform: scale(0.85); }
      10%  { opacity: 1; transform: scale(1.08); }
      70%  { opacity: 1; transform: scale(1.00); }
      100% { opacity: 0; transform: scale(1.15); }
    }
    @keyframes phobosJitter {
      0%   { transform: translate(0, 0) skewX(0deg); }
      50%  { transform: translate(3px, -2px) skewX(-1deg); }
      100% { transform: translate(-2px, 3px) skewX(1deg); }
    }
    @keyframes phobosGhostPulse {
      0%   { opacity: 0; transform: scale(1.12); filter: blur(12px); }
      20%  { opacity: 1; transform: scale(1.00); filter: blur(0); }
      70%  { opacity: 1; transform: scale(1.02); filter: blur(0); }
      100% { opacity: 0; transform: scale(0.92); filter: blur(8px); }
    }
    @keyframes phobosBloodDrop {
      0%   { opacity: 0; transform: translateY(-100%); }
      30%  { opacity: 0.85; transform: translateY(0); }
      100% { opacity: 0.1;  transform: translateY(20%); }
    }
    @keyframes phobosScreamPulse {
      0%   { opacity: 0; }
      8%   { opacity: 1; }
      80%  { opacity: 1; }
      100% { opacity: 0; }
    }
    @keyframes phobosFaceShake {
      0%   { transform: translate(0, 0) rotate(0deg); }
      25%  { transform: translate(-4px, 3px) rotate(-0.6deg); }
      50%  { transform: translate(4px, -3px) rotate(0.6deg); }
      75%  { transform: translate(-3px, 4px) rotate(-0.4deg); }
    }
    @keyframes phobosFaceZoom {
      0%   { transform: scale(0.55); }
      12%  { transform: scale(1.05); }
      90%  { transform: scale(1.15); }
      100% { transform: scale(1.35); }
    }
    @keyframes phobosCrawl {
      0%   { bottom: -50vh; opacity: 0; transform: translateX(-50%) scaleY(0.9); filter: blur(2px) contrast(1.4); }
      18%  { opacity: 0.8; }
      55%  { bottom: 8vh; opacity: 1; transform: translateX(-50%) scaleY(1.06); filter: blur(0) contrast(1.5); }
      95%  { bottom: 22vh; opacity: 0.9; transform: translateX(-50%) scaleY(1.12); }
      100% { bottom: 26vh; opacity: 0; transform: translateX(-50%) scaleY(1.20); filter: blur(4px); }
    }
    @keyframes phobosEyeBlink {
      0%, 100% { opacity: 0; }
      30%, 70% { opacity: 0.95; }
    }
    @keyframes phobosReflectionPulse {
      0%   { opacity: 0; transform: scaleX(-1) scale(0.95); filter: blur(6px); }
      25%  { opacity: 1; transform: scaleX(-1) scale(1.00); filter: blur(0); }
      75%  { opacity: 1; }
      100% { opacity: 0; transform: scaleX(-1) scale(1.05); filter: blur(4px); }
    }
    @keyframes phobosBloodWrite {
      0%   { opacity: 0; transform: scale(0.75); }
      18%  { opacity: 1; transform: scale(1.05); }
      30%  { transform: scale(1.00); }
      100% { opacity: 0; transform: scale(1.08) translateY(8%); letter-spacing: 0.35em; }
    }
    @keyframes phobosChromaShake {
      0%   { transform: translate(0, 0); }
      33%  { transform: translate(3px, -2px); }
      66%  { transform: translate(-3px, 2px); }
      100% { transform: translate(0, 0); }
    }
    @keyframes phobosCrackAppear {
      0%   { opacity: 0; transform-origin: 0 50%; transform: rotate(var(--angle, 0)) scaleX(0); }
      20%  { opacity: 1; transform: rotate(var(--angle, 0)) scaleX(1); }
      90%  { opacity: 0.95; }
      100% { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}
