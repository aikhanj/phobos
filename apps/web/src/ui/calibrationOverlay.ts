/**
 * Full-screen overlay for calibration prompts. Shows instruction text
 * with a typewriter effect and a thin progress bar at the bottom.
 * Positioned in the lower-center to not obstruct the 3D scene.
 */
export class CalibrationOverlay {
  private container: HTMLDivElement;
  private textEl: HTMLDivElement;
  private progressTrack: HTMLDivElement;
  private progressFill: HTMLDivElement;
  private typeTimer: number | null = null;

  constructor() {
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '25',
      opacity: '0',
      transition: 'opacity 0.8s ease',
    });

    this.textEl = document.createElement('div');
    Object.assign(this.textEl.style, {
      position: 'absolute',
      bottom: '14%',
      left: '0',
      right: '0',
      textAlign: 'center',
      fontFamily: "'Courier New', monospace",
      fontSize: '1.5rem',
      color: '#00ff41',
      letterSpacing: '0.3em',
      textTransform: 'uppercase',
      textShadow: '0 0 20px rgba(0,255,65,0.4), 0 0 40px rgba(0,255,65,0.1)',
      userSelect: 'none',
    });
    this.container.appendChild(this.textEl);

    this.progressTrack = document.createElement('div');
    Object.assign(this.progressTrack.style, {
      position: 'absolute',
      bottom: '0',
      left: '0',
      right: '0',
      height: '2px',
      background: 'rgba(0,255,65,0.08)',
    });
    this.progressFill = document.createElement('div');
    Object.assign(this.progressFill.style, {
      height: '100%',
      width: '0%',
      background: '#00ff41',
      boxShadow: '0 0 6px rgba(0,255,65,0.4)',
      transition: 'width 0.3s linear',
    });
    this.progressTrack.appendChild(this.progressFill);
    this.container.appendChild(this.progressTrack);

    document.body.appendChild(this.container);
  }

  /** Show a new instruction with typewriter effect. */
  show(text: string): void {
    this.clearType();
    this.textEl.textContent = '';
    this.container.style.opacity = '1';

    let i = 0;
    this.typeTimer = window.setInterval(() => {
      if (i < text.length) {
        this.textEl.textContent += text[i];
        i++;
      } else {
        this.clearType();
      }
    }, 40);
  }

  /** Update progress bar (0-1). */
  setProgress(fraction: number): void {
    const pct = Math.max(0, Math.min(1, fraction)) * 100;
    this.progressFill.style.width = `${pct}%`;
  }

  /** Fade out the overlay. */
  hide(): void {
    this.container.style.opacity = '0';
    this.clearType();
  }

  /** Remove from DOM. Call after hide transition completes. */
  dispose(): void {
    this.clearType();
    this.container.remove();
  }

  private clearType(): void {
    if (this.typeTimer !== null) {
      clearInterval(this.typeTimer);
      this.typeTimer = null;
    }
  }
}
