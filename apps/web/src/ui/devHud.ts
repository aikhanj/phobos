/**
 * Dev-only HUD. Gated on import.meta.env.DEV so it's stripped from production
 * builds automatically by Vite. Shows calibration countdown + transient status
 * flashes so the tester can tell at a glance whether input is locked.
 */
export class DevHud {
  private container: HTMLDivElement | null = null;
  private statusLine: HTMLDivElement | null = null;
  private flashLine: HTMLDivElement | null = null;
  private countdownInterval: number | null = null;
  private flashTimeout: number | null = null;

  constructor() {
    if (!import.meta.env.DEV) return;

    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'fixed',
      left: '16px',
      bottom: '16px',
      zIndex: '20',
      fontFamily: "'Courier New', monospace",
      fontSize: '11px',
      color: '#c09030',
      background: 'rgba(0,0,0,0.6)',
      padding: '6px 10px',
      border: '1px solid #2a1f10',
      borderRadius: '2px',
      letterSpacing: '0.08em',
      userSelect: 'none',
      pointerEvents: 'none',
      minWidth: '220px',
    });
    document.body.appendChild(this.container);

    const label = document.createElement('div');
    label.textContent = 'DEV';
    Object.assign(label.style, {
      color: '#604020',
      fontSize: '9px',
      marginBottom: '4px',
      letterSpacing: '0.2em',
    });
    this.container.appendChild(label);

    this.statusLine = document.createElement('div');
    this.statusLine.textContent = '—';
    this.container.appendChild(this.statusLine);

    this.flashLine = document.createElement('div');
    this.flashLine.textContent = '';
    Object.assign(this.flashLine.style, {
      marginTop: '4px',
      color: '#55ff88',
      fontWeight: 'bold',
      opacity: '0',
      transition: 'opacity 0.3s ease',
    });
    this.container.appendChild(this.flashLine);
  }

  setStatus(text: string): void {
    if (this.statusLine) this.statusLine.textContent = text;
  }

  /**
   * Start a live countdown for calibration (or any fixed-duration lock).
   * Auto-stops at zero; caller should also flash() when input unlocks.
   */
  startCountdown(totalSec: number): void {
    if (!this.statusLine) return;
    this.stopCountdown();
    const startAt = performance.now();
    const tick = (): void => {
      const elapsed = (performance.now() - startAt) / 1000;
      const remaining = Math.max(0, totalSec - elapsed);
      if (this.statusLine) {
        this.statusLine.textContent = `CALIBRATION · ${remaining.toFixed(1)}s · WASD LOCKED`;
      }
      if (remaining <= 0) this.stopCountdown();
    };
    tick();
    this.countdownInterval = window.setInterval(tick, 100);
  }

  stopCountdown(): void {
    if (this.countdownInterval !== null) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  /** Flash a bright message for `ms`; then fade. */
  flash(message: string, ms = 2200): void {
    if (!this.flashLine) return;
    if (this.flashTimeout !== null) clearTimeout(this.flashTimeout);
    this.flashLine.textContent = message;
    this.flashLine.style.opacity = '1';
    this.flashTimeout = window.setTimeout(() => {
      if (this.flashLine) this.flashLine.style.opacity = '0';
      this.flashTimeout = null;
    }, ms);
  }

  dispose(): void {
    this.stopCountdown();
    if (this.flashTimeout !== null) clearTimeout(this.flashTimeout);
    if (this.container?.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}
