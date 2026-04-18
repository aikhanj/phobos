/**
 * Minimal objective HUD. A single low-contrast line anchored bottom-centre
 * telling the player the current chain target — not a quest log, not a
 * compass, just one short phrase. Ships in production (unlike DevHud) so
 * players always have a destination. The copy itself stays diegetic:
 * Phobos is telling them where to go, not the game.
 */
export class ObjectiveHud {
  private container: HTMLDivElement;
  private line: HTMLDivElement;
  private visible = false;

  constructor() {
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'fixed',
      left: '50%',
      bottom: '28px',
      transform: 'translateX(-50%)',
      zIndex: '18',
      fontFamily: "'Courier New', monospace",
      fontSize: '0.8rem',
      color: '#c09030',
      letterSpacing: '0.35rem',
      textTransform: 'lowercase',
      textShadow: '0 0 12px rgba(192,144,48,0.4), 0 0 30px rgba(0,0,0,0.9)',
      opacity: '0',
      transition: 'opacity 0.8s ease',
      pointerEvents: 'none',
      userSelect: 'none',
      whiteSpace: 'nowrap',
    });

    this.line = document.createElement('div');
    this.line.textContent = '';
    this.container.appendChild(this.line);
    document.body.appendChild(this.container);
  }

  /** Replace the current objective text. Pass an empty string to hide it. */
  set(text: string): void {
    if (!text) {
      this.container.style.opacity = '0';
      this.visible = false;
      return;
    }
    // If hidden, swap text first, then fade in.
    if (!this.visible) {
      this.line.textContent = `› ${text}`;
      requestAnimationFrame(() => {
        this.container.style.opacity = '0.82';
      });
      this.visible = true;
      return;
    }
    // Visible → fade out, swap, fade back in for a soft transition.
    this.container.style.opacity = '0';
    setTimeout(() => {
      this.line.textContent = `› ${text}`;
      this.container.style.opacity = '0.82';
    }, 350);
  }

  clear(): void {
    this.set('');
  }

  dispose(): void {
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}
